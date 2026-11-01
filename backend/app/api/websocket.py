from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api.deps import authenticate_ws_token
from app.core.config import settings
from app.core.time import ensure_utc
from app.database.session import SessionLocal
from app.schemas.preferences import StudentPreferenceUpdate
from app.services.live_service import (
    build_signs,
    classroom_access,
    close_attendance,
    close_open_attendance_for_student,
    create_attendance,
    load_preferences,
    live_lecture_state,
    process_final_caption,
    recent_subtitles,
    retranslate_last,
    save_preferences,
    update_enrollment_seen,
)
from app.sign_language.engine import get_engine
from app.translation.languages import is_supported
from app.websocket.manager import Participant, get_hub, new_connection_id
from app.websocket.notifications import get_notification_hub

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_CAPTION_LENGTH = 2000
MAX_SDP_LENGTH = 20000
MAX_CANDIDATE_LENGTH = 4000

PREFERENCE_FIELDS = {
    "learning_mode",
    "subtitle_language",
    "original_language",
    "show_original",
    "subtitle_font_size",
    "subtitle_text_color",
    "subtitle_background",
    "high_contrast",
    "avatar_enabled",
    "sign_language",
    "reduced_motion",
    "theme",
}


WS_AUTH_TIMEOUT_SECONDS = 10
NOTIFICATION_AUTH_TIMEOUT_SECONDS = 10


def _header_token(websocket: WebSocket) -> str:
    header = websocket.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def _origin_allowed(websocket: WebSocket) -> bool:
    """Reject cross-site WebSocket upgrades when an Origin header is present."""
    origin = (websocket.headers.get("origin") or "").strip()
    if not origin:
        # Native clients and the test client do not send Origin.
        return True
    allowed = settings.cors_origin_list
    return "*" in allowed or origin in allowed


def _iso(value: datetime | None) -> str | None:
    aware = ensure_utc(value)
    return aware.isoformat() if aware else None


async def _send(websocket: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await websocket.send_json(payload)
    except Exception:
        logger.debug("WebSocket send failed", exc_info=True)


def _preference_defaults() -> dict[str, Any]:
    return {
        "learning_mode": "normal",
        "subtitle_language": "en",
        "original_language": "en",
        "show_original": False,
        "subtitle_font_size": 24,
        "subtitle_text_color": "#FFFFFF",
        "subtitle_background": "#0F172A",
        "high_contrast": False,
        "avatar_enabled": True,
        "sign_language": "isl",
        "reduced_motion": False,
        "theme": "system",
    }


def _build_ready(
    *,
    participant: Participant,
    access: dict[str, Any],
    preferences: dict[str, Any] | None,
) -> dict[str, Any]:
    live = live_lecture_state(access["classroom_id"])
    recent: list[dict[str, Any]] = []
    latest: dict[str, Any] | None = None
    if live:
        recent = recent_subtitles(live["id"], participant.language, limit=8)
        if participant.role == "student":
            latest = retranslate_last(
                access["classroom_id"], participant.language, participant.sign_language
            )
    return {
        "type": "ready",
        "connection_id": participant.connection_id,
        "server_time": datetime.now(timezone.utc).isoformat(),
        "user": {
            "id": participant.user_id,
            "full_name": participant.full_name,
            "role": participant.role,
        },
        "classroom": {
            "id": access["classroom_id"],
            "name": access["classroom_name"],
            "teacher_id": access["teacher_id"],
            "source_language": access["source_language"],
            "is_teacher": access["is_teacher"],
        },
        "lecture": (
            {
                "id": live["id"],
                "title": live["title"],
                "started_at": _iso(live["started_at"]),
                "source_language": live["source_language"],
                "is_recording": live["is_recording"],
            }
            if live
            else None
        ),
        "preferences": preferences,
        "recent_captions": recent,
        "latest_caption": latest,
        "participants": [p.public() for p in get_hub().participants(access["classroom_id"])],
        "translation": {
            "provider": settings.translation_provider,
        },
    }


async def _handle_request_stream(
    classroom_id: int, participant: Participant, payload: dict[str, Any]
) -> None:
    hub = get_hub()
    if participant.role == "student":
        teachers = [p for p in hub.participants(classroom_id) if p.role == "teacher"]
        for teacher in teachers:
            await hub.send(
                teacher,
                {
                    "type": "student-request-stream",
                    "student": participant.public(),
                },
            )
        if not teachers:
            await hub.send(
                participant,
                {
                    "type": "stream-unavailable",
                    "reason": "The teacher is not connected yet. You will be connected automatically when they join.",
                },
            )
        return
    # Teacher asking for a student stream (used for optional student camera previews).
    target = payload.get("target_connection_id")
    if isinstance(target, str):
        student = hub.participant_by_connection(classroom_id, target)
        if student and student.role == "student":
            await hub.send(
                student,
                {
                    "type": "stream-requested",
                    "teacher": participant.public(),
                },
            )


async def _relay_signal(
    classroom_id: int,
    participant: Participant,
    payload: dict[str, Any],
    *,
    allowed_types: set[str],
) -> None:
    target_id = payload.get("target_connection_id")
    if not isinstance(target_id, str) or not target_id:
        await get_hub().send(
            participant,
            {"type": "error", "code": "missing-target", "message": "Signal target is missing."},
        )
        return
    target = get_hub().participant_by_connection(classroom_id, target_id)
    if target is None:
        await get_hub().send(
            participant,
            {
                "type": "error",
                "code": "target-not-found",
                "message": "The other participant has left the classroom.",
            },
        )
        return
    message = {
        key: value
        for key, value in payload.items()
        if key not in {"target_connection_id", "type"}
    }
    message["type"] = payload["type"]
    message["from_connection_id"] = participant.connection_id
    message["from_user_id"] = participant.user_id
    message["from_role"] = participant.role
    message["from_name"] = participant.full_name
    await get_hub().send(target, message)
    if payload["type"] in allowed_types:
        logger.debug(
            "Relayed %s from %s to %s", payload["type"], participant.connection_id, target_id
        )


async def _handle_media_state(
    classroom_id: int, participant: Participant, payload: dict[str, Any]
) -> None:
    """Record camera/microphone state and notify the people who can see it.

    Both the original ``audio``/``video`` field names and the explicit
    ``microphone_enabled``/``camera_enabled`` aliases are accepted so older and
    newer frontends remain compatible.
    """
    if "audio" in payload:
        participant.audio_enabled = bool(payload.get("audio"))
    elif "microphone_enabled" in payload:
        participant.audio_enabled = bool(payload.get("microphone_enabled"))
    if "video" in payload:
        participant.video_enabled = bool(payload.get("video"))
    elif "camera_enabled" in payload:
        participant.video_enabled = bool(payload.get("camera_enabled"))

    hub = get_hub()
    public = participant.public()
    if participant.role == "teacher":
        await hub.broadcast(
            classroom_id,
            {
                "type": "teacher-media",
                "connection_id": participant.connection_id,
                "audio": participant.audio_enabled,
                "video": participant.video_enabled,
                "microphone_enabled": participant.audio_enabled,
                "camera_enabled": participant.video_enabled,
                "participant": public,
            },
            exclude_connection=participant.connection_id,
        )
    else:
        for teacher in hub.participants(classroom_id):
            if teacher.role == "teacher":
                await hub.send(
                    teacher,
                    {
                        "type": "participant-media",
                        "student": public,
                        "audio": participant.audio_enabled,
                        "video": participant.video_enabled,
                        "microphone_enabled": participant.audio_enabled,
                        "camera_enabled": participant.video_enabled,
                    },
                )
    # Presence carries media flags, so refreshing it keeps late joiners and the
    # teacher roster in sync without a separate request.
    await hub.broadcast_presence(classroom_id)


async def _personalise_caption(
    *,
    participant: Participant,
    source_text: str,
    translated: dict[str, Any],
    source_language: str,
    signs: dict[str, Any] | None,
    base: dict[str, Any],
) -> dict[str, Any]:
    language = participant.language
    if language == source_language:
        translated_text = source_text
        translated_flag = True
        provider = "source"
        error = None
    else:
        outcome = translated.get(language) or {}
        translated_text = outcome.get("text")
        translated_flag = bool(outcome.get("translated"))
        provider = outcome.get("provider")
        error = outcome.get("error")
        if translated_text is None:
            translated_text = source_text
            translated_flag = False
            provider = provider or "unavailable"
            # Interim/partial captions are deliberately not translated yet. Do not
            # show a scary error for a normal in-progress caption.
            if not base.get("partial"):
                error = error or "No translation is available for this caption."
    message = dict(base)
    message.update(
        {
            "language": language,
            "translated_text": translated_text,
            "translated": translated_flag,
            "translation_provider": provider,
            "translation_error": error,
            "signs": signs,
        }
    )
    return message


async def _handle_caption(
    classroom_id: int,
    participant: Participant,
    payload: dict[str, Any],
    access: dict[str, Any],
) -> None:
    hub = get_hub()
    if participant.role != "teacher":
        await hub.send(
            participant,
            {
                "type": "error",
                "code": "forbidden",
                "message": "Only the teacher can publish captions.",
            },
        )
        return
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        await hub.send(
            participant,
            {"type": "error", "code": "empty-caption", "message": "Caption text is empty."},
        )
        return
    text = " ".join(text.split())[:MAX_CAPTION_LENGTH]
    is_final = bool(payload.get("is_final", True))
    live = live_lecture_state(classroom_id)
    if not live:
        await hub.send(
            participant,
            {
                "type": "error",
                "code": "no-live-lecture",
                "message": "Start the lecture before sending captions.",
            },
        )
        return

    source_language = str(payload.get("source_language") or live["source_language"] or "en").lower()
    if not is_supported(source_language):
        source_language = live["source_language"] or "en"

    start_ms = _coerce_int(payload.get("start_ms"), 0)
    end_ms = _coerce_int(payload.get("end_ms"), start_ms + 2500)
    if end_ms < start_ms:
        end_ms = start_ms
    confidence = payload.get("confidence")
    try:
        confidence_value = float(confidence) if confidence is not None else None
    except (TypeError, ValueError):
        confidence_value = None

    members = [p for p in hub.participants(classroom_id) if p.role == "student"]

    if not is_final:
        base = {
            "type": "subtitle",
            "lecture_id": live["id"],
            "subtitle_id": None,
            "sequence": None,
            "original_text": text,
            "source_language": source_language,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "confidence": confidence_value,
            "is_final": False,
            "partial": True,
            "is_replay": False,
            "signs": None,
        }
        for member in members:
            await hub.send(
                member,
                await _personalise_caption(
                    participant=member,
                    source_text=text,
                    translated={},
                    source_language=source_language,
                    signs=None,
                    base=base,
                ),
            )
        await hub.send(
            participant,
            {
                "type": "caption-preview",
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "is_final": False,
            },
        )
        return

    languages = sorted({member.language for member in members if member.language})
    sign_languages = sorted(
        {member.sign_language for member in members if member.avatar_enabled and member.sign_language}
    )
    result = await asyncio.to_thread(
        process_final_caption,
        lecture_id=live["id"],
        text=text,
        source_language=source_language,
        start_ms=start_ms,
        end_ms=end_ms,
        confidence=confidence_value,
        languages=languages,
        sign_languages=sign_languages,
    )

    base = {
        "type": "subtitle",
        "lecture_id": live["id"],
        "subtitle_id": result["subtitle_id"],
        "sequence": result["sequence"],
        "original_text": text,
        "source_language": source_language,
        "start_ms": start_ms,
        "end_ms": end_ms,
        "confidence": confidence_value,
        "is_final": True,
        "partial": False,
        "is_replay": False,
    }
    delivered = 0
    for member in members:
        sign_bundle = result["signs"].get(member.sign_language) if member.avatar_enabled else None
        message = await _personalise_caption(
            participant=member,
            source_text=text,
            translated=result["translations"],
            source_language=source_language,
            signs=sign_bundle,
            base=base,
        )
        if await hub.send(member, message):
            delivered += 1

    await hub.send(
        participant,
        {
            "type": "subtitle-ack",
            "lecture_id": live["id"],
            "subtitle_id": result["subtitle_id"],
            "sequence": result["sequence"],
            "text": text,
            "delivered_to": delivered,
            "languages": languages,
            "sign_languages": sign_languages,
        },
    )


def _coerce_int(value: Any, default: int) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default


async def _handle_preferences(
    classroom_id: int,
    participant: Participant,
    payload: dict[str, Any],
    access: dict[str, Any],
) -> None:
    hub = get_hub()
    if participant.role != "student":
        await hub.send(
            participant,
            {
                "type": "error",
                "code": "forbidden",
                "message": "Only students have learning preferences.",
            },
        )
        return
    raw = {key: value for key, value in payload.items() if key in PREFERENCE_FIELDS}
    if not raw:
        await hub.send(
            participant,
            {"type": "error", "code": "no-preferences", "message": "No preference values were sent."},
        )
        return
    try:
        validated = StudentPreferenceUpdate(**raw)
    except ValidationError as exc:
        await hub.send(
            participant,
            {
                "type": "error",
                "code": "invalid-preferences",
                "message": "Some preference values are not valid.",
                "details": exc.errors(include_url=False),
            },
        )
        return
    updates = validated.model_dump(exclude_unset=True)
    for field in ("subtitle_language", "original_language"):
        if field in updates and updates[field] and not is_supported(updates[field]):
            await hub.send(
                participant,
                {
                    "type": "error",
                    "code": "invalid-language",
                    "message": f"Language '{updates[field]}' is not supported.",
                },
            )
            return
    if updates.get("sign_language") and get_engine().get_catalog(updates["sign_language"]) is None:
        await hub.send(
            participant,
            {
                "type": "error",
                "code": "invalid-sign-language",
                "message": f"Sign language '{updates['sign_language']}' is not available yet.",
            },
        )
        return

    saved = await asyncio.to_thread(save_preferences, participant.user_id, updates)
    if saved is None:
        await hub.send(
            participant,
            {
                "type": "error",
                "code": "preferences-unavailable",
                "message": "Your student profile could not be loaded.",
            },
        )
        return
    participant.language = saved["subtitle_language"]
    participant.original_language = saved["original_language"]
    participant.mode = saved["learning_mode"]
    participant.sign_language = saved["sign_language"]
    participant.avatar_enabled = saved["avatar_enabled"]
    participant.show_original = saved["show_original"]

    await hub.send(participant, {"type": "preferences", "preferences": saved})
    await hub.broadcast_presence(classroom_id)

    if live_lecture_state(classroom_id):
        replay = await asyncio.to_thread(
            retranslate_last,
            classroom_id,
            participant.language,
            participant.sign_language,
        )
        if replay:
            replay["preference_replay"] = True
            await hub.send(participant, replay)
    logger.info(
        "Student %s updated preferences in classroom %s (mode=%s, language=%s)",
        participant.user_id,
        classroom_id,
        participant.mode,
        participant.language,
    )


async def _handle_message(
    classroom_id: int,
    participant: Participant,
    payload: dict[str, Any],
    access: dict[str, Any],
) -> None:
    hub = get_hub()
    message_type = payload.get("type")
    if not isinstance(message_type, str):
        await hub.send(
            participant,
            {"type": "error", "code": "invalid-message", "message": "Message type is required."},
        )
        return

    if message_type == "ping":
        await hub.send(
            participant,
            {"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()},
        )
        return
    if message_type == "subtitle":
        await _handle_caption(classroom_id, participant, payload, access)
        return
    if message_type in {"request-stream", "student-request-stream"}:
        await _handle_request_stream(classroom_id, participant, payload)
        return
    if message_type in {"webrtc-offer", "webrtc-answer", "webrtc-ice"}:
        if message_type in {"webrtc-offer", "webrtc-answer"}:
            sdp = payload.get("sdp")
            if not isinstance(sdp, str) or not sdp or len(sdp) > MAX_SDP_LENGTH:
                await hub.send(
                    participant,
                    {
                        "type": "error",
                        "code": "invalid-sdp",
                        "message": "The session description is missing or too large.",
                    },
                )
                return
        else:
            candidate = payload.get("candidate")
            if candidate is not None and (
                not isinstance(candidate, str) or len(candidate) > MAX_CANDIDATE_LENGTH
            ):
                await hub.send(
                    participant,
                    {
                        "type": "error",
                        "code": "invalid-candidate",
                        "message": "The ICE candidate is missing or too large.",
                    },
                )
                return
        await _relay_signal(
            classroom_id,
            participant,
            payload,
            allowed_types={"webrtc-offer", "webrtc-answer", "webrtc-ice"},
        )
        return
    if message_type == "media-state":
        await _handle_media_state(classroom_id, participant, payload)
        return
    if message_type == "caption-state":
        if participant.role != "teacher":
            await hub.send(
                participant,
                {"type": "error", "code": "forbidden", "message": "Only the teacher can change caption state."},
            )
            return
        await hub.broadcast(
            classroom_id,
            {
                "type": "caption-state",
                "enabled": bool(payload.get("enabled", True)),
                "paused": bool(payload.get("paused", False)),
            },
            exclude_connection=participant.connection_id,
        )
        return
    if message_type in {"preferences", "update-preferences", "preferences-updated"}:
        await _handle_preferences(classroom_id, participant, payload, access)
        return
    if message_type == "leave":
        await hub.send(participant, {"type": "left", "reason": "left-by-user"})
        return

    await hub.send(
        participant,
        {
            "type": "error",
            "code": "unsupported-event",
            "message": f"Unsupported event type '{message_type}'.",
        },
    )


@router.websocket("/ws/classroom/{classroom_id}")
async def classroom_socket(websocket: WebSocket, classroom_id: int) -> None:
    # Accept first so the client can authenticate with a message instead of a
    # token in the URL. No classroom data is sent until authentication succeeds.
    await websocket.accept()
    if not _origin_allowed(websocket):
        await websocket.close(code=4403, reason="WebSocket origin is not allowed")
        return

    # Tokens in the URL are rejected on purpose: they leak into proxy logs and
    # browser history. Browsers authenticate with the first "auth" message.
    token = _header_token(websocket)
    if not token:
        try:
            first = await asyncio.wait_for(
                websocket.receive_json(), timeout=WS_AUTH_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            await websocket.close(code=4401, reason="Authentication timed out")
            return
        except (ValueError, WebSocketDisconnect):
            await websocket.close(code=4401, reason="Authentication required")
            return
        if (
            not isinstance(first, dict)
            or first.get("type") != "auth"
            or not isinstance(first.get("token"), str)
            or not first["token"].strip()
        ):
            await websocket.close(code=4401, reason="Authentication required")
            return
        token = first["token"].strip()

    with SessionLocal() as db:
        user = authenticate_ws_token(db, token)
        if user is None:
            await websocket.close(code=4401, reason="Authentication required or session expired")
            return
        access = classroom_access(classroom_id, user.id, user.role)
        if access is None:
            await websocket.close(code=4403, reason="You do not have access to this classroom")
            return
        user_id = user.id
        role = user.role
        full_name = user.full_name

    preferences = load_preferences(user_id) if role == "student" else None
    defaults = _preference_defaults()
    participant = Participant(
        connection_id=new_connection_id(),
        user_id=user_id,
        role=role,
        full_name=full_name,
        websocket=websocket,
        language=(preferences or {}).get("subtitle_language", defaults["subtitle_language"]),
        original_language=(preferences or {}).get("original_language", defaults["original_language"]),
        mode=(preferences or {}).get("learning_mode", defaults["learning_mode"]),
        sign_language=(preferences or {}).get("sign_language", defaults["sign_language"]),
        avatar_enabled=(preferences or {}).get("avatar_enabled", defaults["avatar_enabled"]),
        show_original=(preferences or {}).get("show_original", defaults["show_original"]),
    )

    hub = get_hub()
    await hub.connect(classroom_id, participant)
    logger.info(
        "WS connected: classroom=%s user=%s role=%s connection=%s",
        classroom_id,
        user_id,
        role,
        participant.connection_id,
    )

    attendance_id: int | None = None
    if role == "student":
        live = live_lecture_state(classroom_id)
        if live:
            attendance_id = create_attendance(live["id"], user_id)
        update_enrollment_seen(classroom_id, user_id)

    await _send(
        websocket,
        _build_ready(participant=participant, access=access, preferences=preferences),
    )
    await hub.broadcast_presence(classroom_id)
    if role == "student":
        await hub.broadcast(
            classroom_id,
            {
                "type": "student-joined",
                "student": participant.public(),
                "lecture": live_lecture_state(classroom_id),
            },
            roles={"teacher"},
        )
    else:
        await hub.broadcast(
            classroom_id,
            {"type": "teacher-joined", "teacher": participant.public()},
            exclude_connection=participant.connection_id,
        )

    try:
        while True:
            try:
                payload = await websocket.receive_json()
            except ValueError:
                await _send(
                    websocket,
                    {
                        "type": "error",
                        "code": "invalid-json",
                        "message": "Messages must be valid JSON objects.",
                    },
                )
                continue
            if not isinstance(payload, dict):
                await _send(
                    websocket,
                    {
                        "type": "error",
                        "code": "invalid-message",
                        "message": "Messages must be JSON objects.",
                    },
                )
                continue
            await _handle_message(classroom_id, participant, payload, access)
    except WebSocketDisconnect:
        logger.info(
            "WS disconnected: classroom=%s user=%s connection=%s",
            classroom_id,
            user_id,
            participant.connection_id,
        )
    except Exception:
        logger.exception("Unhandled WebSocket error for classroom %s", classroom_id)
        await _send(
            websocket,
            {
                "type": "error",
                "code": "server-error",
                "message": "The live connection encountered an unexpected error.",
            },
        )
    finally:
        await hub.disconnect(classroom_id, participant.connection_id)
        remaining = hub.participant_by_user(classroom_id, user_id)
        if role == "student" and not remaining:
            if attendance_id is not None:
                close_attendance(attendance_id)
            else:
                close_open_attendance_for_student(classroom_id, user_id)
        await hub.broadcast_presence(classroom_id)
        if role == "teacher" and not any(
            p.role == "teacher" for p in hub.participants(classroom_id)
        ):
            await hub.broadcast(
                classroom_id,
                {
                    "type": "teacher-offline",
                    "message": "The teacher's connection dropped. Waiting for them to reconnect…",
                },
                roles={"student"},
            )


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    if not _origin_allowed(websocket):
        await websocket.close(code=4403, reason="WebSocket origin is not allowed")
        return

    token = _header_token(websocket)
    if not token:
        try:
            first = await asyncio.wait_for(
                websocket.receive_json(), timeout=NOTIFICATION_AUTH_TIMEOUT_SECONDS
            )
        except asyncio.TimeoutError:
            await websocket.close(code=4401, reason="Authentication timed out")
            return
        except (ValueError, WebSocketDisconnect):
            await websocket.close(code=4401, reason="Authentication required")
            return
        if (
            not isinstance(first, dict)
            or first.get("type") != "auth"
            or not isinstance(first.get("token"), str)
            or not first["token"].strip()
        ):
            await websocket.close(code=4401, reason="Authentication required")
            return
        token = first["token"].strip()

    with SessionLocal() as db:
        user = authenticate_ws_token(db, token)
        if user is None:
            await websocket.close(code=4401, reason="Authentication required or session expired")
            return
        user_id = user.id

    notification_hub = get_notification_hub()
    subscriber = notification_hub.subscribe(user_id)
    try:
        await websocket.send_json({"type": "ready"})
        while True:
            event = await subscriber.queue.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        notification_hub.unsubscribe(user_id, subscriber)
