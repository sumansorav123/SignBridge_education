from __future__ import annotations

import logging
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import CurrentUser, DbSession, TeacherUser
from app.core.config import settings
from app.core.security import TokenError, create_stream_token, decode_token
from app.database.session import get_db
from app.models import (
    ClassroomEnrollment,
    Lecture,
    Recording,
    Subtitle,
    Translation,
    User,
)
from app.schemas.lecture import (
    PlaybackTokenOut,
    RecordingDetailOut,
    RecordingOut,
    RecordingStartRequest,
    SubtitleOut,
)
from app.services.access import can_access_recording
from app.services.live_service import build_signs
from app.services.serializers import recording_to_out, subtitle_to_out
from app.services.storage import (
    StorageError,
    UploadValidationError,
    delete_storage_key,
    resolve_storage_key,
    save_upload,
)
from app.translation.languages import is_supported
from app.translation.service import get_translation_service
from app.websocket.manager import get_hub

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Recordings"])


@router.post("/recordings/start", response_model=dict)
async def start_recording_metadata(payload: RecordingStartRequest, user: TeacherUser, db: DbSession):
    lecture = db.get(Lecture, payload.lecture_id)
    if not lecture or lecture.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Lecture not found")
    if lecture.status != "live":
        raise HTTPException(
            status_code=409,
            detail="Recording can only start while the lecture is live.",
        )
    # Idempotent: clicking Record twice must not corrupt the lecture flag.
    if not lecture.is_recording:
        lecture.is_recording = True
        db.commit()
        await get_hub().broadcast(
            lecture.classroom_id,
            {
                "type": "recording-state",
                "recording": True,
                "lecture_id": lecture.id,
                "started_at": lecture.started_at.isoformat() if lecture.started_at else None,
            },
        )
    return {
        "lecture_id": lecture.id,
        "recording": True,
        "title_suggestion": f"{lecture.title} — recording",
    }


async def _create_recording(
    *,
    user: User,
    db: Session,
    lecture_id: int,
    title: str | None,
    duration_seconds: int,
    start_offset_ms: int,
    upload: UploadFile,
) -> RecordingOut:
    lecture = db.get(Lecture, lecture_id)
    if not lecture or lecture.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Lecture not found")
    try:
        stored = await save_upload(
            upload,
            subdir="recordings",
            allowed_extensions=settings.recording_extension_set,
            max_bytes=settings.max_recording_mb * 1024 * 1024,
        )
    except UploadValidationError as exc:
        lecture.is_recording = False
        db.commit()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        lecture.is_recording = False
        db.commit()
        logger.exception("Recording upload failed")
        raise HTTPException(status_code=500, detail="Could not store the recording.") from exc

    safe_title = (title or f"{lecture.title} — recording").strip()[:200]
    recording = Recording(
        lecture_id=lecture.id,
        classroom_id=lecture.classroom_id,
        teacher_id=user.id,
        title=safe_title,
        storage_key=stored["storage_key"],
        original_filename=stored["original_filename"],
        mime_type=stored["mime_type"],
        size_bytes=stored["size_bytes"],
        duration_seconds=max(0, duration_seconds),
        start_offset_ms=max(0, start_offset_ms),
        transcript_language=lecture.source_language,
        status="ready",
    )
    lecture.is_recording = False
    db.add(recording)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_key(stored["storage_key"])
        lecture.is_recording = False
        db.commit()
        raise
    db.refresh(recording)
    await get_hub().broadcast(
        lecture.classroom_id,
        {
            "type": "recording-state",
            "recording": False,
            "lecture_id": lecture.id,
            "recording_id": recording.id,
        },
    )
    logger.info("Recording %s saved for lecture %s", recording.id, lecture.id)
    return recording_to_out(db, recording)


@router.post("/recordings/stop", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
async def stop_recording(
    user: TeacherUser,
    db: DbSession,
    lecture_id: int = Form(...),
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    duration_seconds: int = Form(default=0),
    start_offset_ms: int = Form(default=0),
):
    return await _create_recording(
        user=user,
        db=db,
        lecture_id=lecture_id,
        title=title,
        duration_seconds=duration_seconds,
        start_offset_ms=start_offset_ms,
        upload=file,
    )


@router.post("/teacher/recordings", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
async def teacher_upload_recording(
    user: TeacherUser,
    db: DbSession,
    lecture_id: int = Form(...),
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    duration_seconds: int = Form(default=0),
    start_offset_ms: int = Form(default=0),
):
    return await _create_recording(
        user=user,
        db=db,
        lecture_id=lecture_id,
        title=title,
        duration_seconds=duration_seconds,
        start_offset_ms=start_offset_ms,
        upload=file,
    )


@router.get("/recordings", response_model=list[RecordingOut])
def list_recordings(
    user: CurrentUser,
    db: DbSession,
    classroom_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    if user.role == "teacher":
        query = select(Recording).where(Recording.teacher_id == user.id)
        if classroom_id:
            query = query.where(Recording.classroom_id == classroom_id)
    else:
        classroom_ids = db.scalars(
            select(ClassroomEnrollment.classroom_id).where(
                ClassroomEnrollment.student_id == user.id,
                ClassroomEnrollment.status == "active",
            )
        ).all()
        if not classroom_ids:
            return []
        query = select(Recording).where(Recording.classroom_id.in_(classroom_ids))
        if classroom_id:
            if classroom_id not in classroom_ids:
                raise HTTPException(
                    status_code=403, detail="You are not enrolled in this classroom."
                )
            query = query.where(Recording.classroom_id == classroom_id)
    rows = db.scalars(
        query.order_by(Recording.recorded_at.desc()).limit(limit).offset(offset)
    ).all()
    return [recording_to_out(db, recording) for recording in rows]


@router.get("/recordings/{recording_id}", response_model=RecordingDetailOut)
def get_recording(
    recording_id: int,
    user: CurrentUser,
    db: DbSession,
    include_signs: bool = Query(default=False),
    sign_language: str = Query(default="isl", max_length=10),
):
    recording = db.get(Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not can_access_recording(db, user, recording):
        raise HTTPException(status_code=403, detail="You do not have access to this recording.")
    payload = RecordingDetailOut.model_validate(recording_to_out(db, recording).model_dump())
    subtitles = db.scalars(
        select(Subtitle)
        .options(joinedload(Subtitle.translations))
        .where(Subtitle.lecture_id == recording.lecture_id)
        .order_by(Subtitle.sequence)
    ).unique().all()
    payload.transcript = [subtitle_to_out(subtitle) for subtitle in subtitles]
    if include_signs:
        for item in payload.transcript:
            item.signs = build_signs(item.text, sign_language)
    return payload


@router.get("/recordings/{recording_id}/transcript", response_model=dict)
def get_transcript(
    recording_id: int,
    user: CurrentUser,
    db: DbSession,
    language: str | None = Query(default=None, max_length=10),
    translate: bool = Query(default=False),
    include_signs: bool = Query(default=False),
    sign_language: str = Query(default="isl", max_length=10),
):
    recording = db.get(Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not can_access_recording(db, user, recording):
        raise HTTPException(status_code=403, detail="You do not have access to this recording.")
    target_language = (language or recording.transcript_language or "en").lower()
    if not is_supported(target_language):
        raise HTTPException(status_code=422, detail=f"Unsupported language: {target_language}")

    subtitles = db.scalars(
        select(Subtitle)
        .options(joinedload(Subtitle.translations))
        .where(Subtitle.lecture_id == recording.lecture_id)
        .order_by(Subtitle.sequence)
    ).unique().all()

    translated_count = 0
    provider = None
    if translate and subtitles:
        missing = [
            subtitle
            for subtitle in subtitles
            if subtitle.source_language != target_language
            and not any(t.language == target_language for t in subtitle.translations)
        ][:200]
        if missing:
            service = get_translation_service()
            service_results = service.translate_many(
                [subtitle.text for subtitle in missing], subtitles[0].source_language, target_language
            )
            for subtitle, outcome in zip(missing, service_results):
                if outcome.translated:
                    db.add(
                        Translation(
                            subtitle_id=subtitle.id,
                            language=target_language,
                            text=outcome.translated_text,
                            provider=outcome.provider,
                            status="ok",
                        )
                    )
                    translated_count += 1
                    provider = outcome.provider
            db.commit()
            subtitles = db.scalars(
                select(Subtitle)
                .options(joinedload(Subtitle.translations))
                .where(Subtitle.lecture_id == recording.lecture_id)
                .order_by(Subtitle.sequence)
            ).unique().all()

    output = []
    for subtitle in subtitles:
        item = subtitle_to_out(subtitle)
        item.translations = {
            key: value for key, value in item.translations.items() if key == target_language
        }
        if include_signs:
            item.signs = build_signs(item.text, sign_language)
        output.append(item)
    return {
        "recording_id": recording.id,
        "language": target_language,
        "source_language": recording.transcript_language,
        "subtitles": [item.model_dump(mode="json") for item in output],
        "translated_count": translated_count,
        "provider": provider,
    }


@router.post("/recordings/{recording_id}/playback-token", response_model=PlaybackTokenOut)
def playback_token(recording_id: int, user: CurrentUser, db: DbSession):
    recording = db.get(Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not can_access_recording(db, user, recording):
        raise HTTPException(status_code=403, detail="You do not have access to this recording.")
    if not recording.storage_key:
        raise HTTPException(status_code=404, detail="Recording file is unavailable.")
    token = create_stream_token(user.id, recording.id, ttl_seconds=600)
    return PlaybackTokenOut(
        token=token,
        url=f"{settings.api_prefix}/recordings/{recording.id}/stream?token={token}",
        expires_in=600,
    )


@router.get("/recordings/{recording_id}/stream")
def stream_recording(
    recording_id: int,
    token: str = Query(...),
    download: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    try:
        claims = decode_token(token, expected_type="stream")
        user_id = int(claims.get("sub", 0))
    except (TokenError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired playback token.") from exc
    if int(claims.get("recording_id", -1)) != recording_id:
        raise HTTPException(status_code=403, detail="Playback token does not match this recording.")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account is inactive.")
    recording = db.get(Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")
    if not can_access_recording(db, user, recording):
        raise HTTPException(status_code=403, detail="You do not have access to this recording.")
    try:
        path = resolve_storage_key(recording.storage_key)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail="Recording file is unavailable.") from exc
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Recording file is unavailable.")
    safe_name = re.sub(r"[^A-Za-z0-9._ -]", "_", recording.title)[:120] + path.suffix
    return FileResponse(
        path,
        media_type=recording.mime_type or "video/webm",
        filename=safe_name,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/recordings/{recording_id}", response_model=dict)
def delete_recording(recording_id: int, user: TeacherUser, db: DbSession):
    recording = db.get(Recording, recording_id)
    if not recording or recording.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Recording not found")
    storage_key = recording.storage_key
    db.delete(recording)
    db.commit()
    delete_storage_key(storage_key)
    return {"detail": "Recording deleted."}
