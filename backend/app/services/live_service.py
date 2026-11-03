from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, joinedload

from app.core.time import duration_seconds, ensure_utc, utcnow
from app.database.session import SessionLocal, engine
from app.models import (
    Classroom,
    ClassroomEnrollment,
    Lecture,
    LectureAttendance,
    Recording,
    StudentPreference,
    Subtitle,
    Translation,
    User,
)
from app.sign_language.engine import get_engine
from app.translation.service import get_translation_service

logger = logging.getLogger(__name__)


def _open() -> Session:
    return SessionLocal()


def _redacted_database_url(url: URL) -> str:
    secret_terms = ("password", "passwd", "secret", "token", "credential", "api_key", "key")
    query = {
        key: (
            "[REDACTED]"
            if any(term in key.lower() for term in secret_terms)
            else value
        )
        for key, value in url.query.items()
    }
    return url.set(
        username="[REDACTED]" if url.username else None,
        query=query,
    ).render_as_string(hide_password=True)


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------
def load_preferences(user_id: int) -> dict[str, Any] | None:
    from app.models import StudentProfile

    with _open() as db:
        preference = db.scalar(
            select(StudentPreference)
            .join(StudentProfile, StudentPreference.student_id == StudentProfile.id)
            .where(StudentProfile.user_id == user_id)
        )
        if preference is None:
            return None
        return {
            "learning_mode": preference.learning_mode,
            "subtitle_language": preference.subtitle_language,
            "original_language": preference.original_language,
            "show_original": preference.show_original,
            "subtitle_font_size": preference.subtitle_font_size,
            "subtitle_text_color": preference.subtitle_text_color,
            "subtitle_background": preference.subtitle_background,
            "high_contrast": preference.high_contrast,
            "avatar_enabled": preference.avatar_enabled,
            "sign_language": preference.sign_language,
            "reduced_motion": preference.reduced_motion,
            "theme": preference.theme,
        }


def save_preferences(user_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
    with _open() as db:
        student_profile = db.scalar(
            select(User).options(joinedload(User.student_profile)).where(User.id == user_id)
        )
        if not student_profile or not student_profile.student_profile:
            return None
        preference = db.scalar(
            select(StudentPreference).where(
                StudentPreference.student_id == student_profile.student_profile.id
            )
        )
        if preference is None:
            preference = StudentPreference(student_id=student_profile.student_profile.id)
            db.add(preference)
        for field, value in updates.items():
            if value is not None and hasattr(preference, field):
                setattr(preference, field, value)
        db.commit()
        db.refresh(preference)
        return {
            "learning_mode": preference.learning_mode,
            "subtitle_language": preference.subtitle_language,
            "original_language": preference.original_language,
            "show_original": preference.show_original,
            "subtitle_font_size": preference.subtitle_font_size,
            "subtitle_text_color": preference.subtitle_text_color,
            "subtitle_background": preference.subtitle_background,
            "high_contrast": preference.high_contrast,
            "avatar_enabled": preference.avatar_enabled,
            "sign_language": preference.sign_language,
            "reduced_motion": preference.reduced_motion,
            "theme": preference.theme,
        }


# ---------------------------------------------------------------------------
# Live caption pipeline
# ---------------------------------------------------------------------------
def classroom_access(
    classroom_id: int,
    user_id: int,
    user_role: str,
) -> dict[str, Any] | None:
    with _open() as db:
        enrollment = None
        if user_role == "student":
            enrollment = db.scalar(
                select(ClassroomEnrollment).where(
                    ClassroomEnrollment.classroom_id == classroom_id,
                    ClassroomEnrollment.student_id == user_id,
                )
            )
            logger.info(
                "Classroom access diagnostic: user_id=%s requested_classroom_id=%s "
                "enrollment_id=%s enrollment_student_id=%s enrollment_classroom_id=%s "
                "enrollment_status=%s database_url=%s",
                user_id,
                classroom_id,
                enrollment.id if enrollment else None,
                enrollment.student_id if enrollment else None,
                enrollment.classroom_id if enrollment else None,
                enrollment.status if enrollment else None,
                _redacted_database_url(engine.url),
            )

        classroom = db.get(Classroom, classroom_id)
        if not classroom:
            return None
        is_teacher = user_role == "teacher" and classroom.teacher_id == user_id
        enrolled = enrollment is not None and enrollment.status == "active"
        if not is_teacher and not enrolled:
            return None
        lecture = db.scalar(
            select(Lecture)
            .where(Lecture.classroom_id == classroom_id, Lecture.status == "live")
            .order_by(Lecture.started_at.desc())
        )
        return {
            "classroom_id": classroom.id,
            "classroom_name": classroom.name,
            "teacher_id": classroom.teacher_id,
            "is_teacher": is_teacher,
            "source_language": classroom.source_language,
            "lecture_id": lecture.id if lecture else None,
            "lecture_title": lecture.title if lecture else None,
            "lecture_started_at": lecture.started_at if lecture else None,
            "lecture_is_recording": lecture.is_recording if lecture else False,
        }


def create_attendance(lecture_id: int, student_id: int) -> int | None:
    with _open() as db:
        existing = db.scalar(
            select(LectureAttendance).where(
                LectureAttendance.lecture_id == lecture_id,
                LectureAttendance.student_id == student_id,
            )
        )
        if existing:
            if existing.left_at is not None:
                existing.left_at = None
            return existing.id
        row = LectureAttendance(lecture_id=lecture_id, student_id=student_id)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id


def close_attendance(attendance_id: int) -> None:
    with _open() as db:
        row = db.get(LectureAttendance, attendance_id)
        if row and row.left_at is None:
            now = utcnow()
            row.left_at = now
            row.duration_seconds = duration_seconds(row.joined_at, now)
            db.commit()


def close_open_attendance_for_student(classroom_id: int, student_id: int) -> None:
    with _open() as db:
        rows = db.scalars(
            select(LectureAttendance)
            .join(Lecture, LectureAttendance.lecture_id == Lecture.id)
            .where(
                Lecture.classroom_id == classroom_id,
                LectureAttendance.student_id == student_id,
                LectureAttendance.left_at.is_(None),
            )
        ).all()
        now = utcnow()
        for row in rows:
            row.left_at = now
            row.duration_seconds = duration_seconds(row.joined_at, now)
        db.commit()


def live_lecture_state(classroom_id: int) -> dict[str, Any] | None:
    with _open() as db:
        lecture = db.scalar(
            select(Lecture)
            .where(Lecture.classroom_id == classroom_id, Lecture.status == "live")
            .order_by(Lecture.started_at.desc())
        )
        if not lecture:
            return None
        return {
            "id": lecture.id,
            "title": lecture.title,
            "started_at": lecture.started_at,
            "source_language": lecture.source_language,
            "is_recording": lecture.is_recording,
        }


def process_final_caption(
    *,
    lecture_id: int,
    text: str,
    source_language: str,
    start_ms: int,
    end_ms: int,
    confidence: float | None,
    languages: list[str],
    sign_languages: list[str],
) -> dict[str, Any]:
    result = persist_caption(
        lecture_id=lecture_id,
        text=text,
        source_language=source_language,
        start_ms=start_ms,
        end_ms=end_ms,
        confidence=confidence,
        languages=languages,
    )
    # Live captions must carry the animation spec itself: the student-side
    # avatar builds its pose timeline from `glosses[].animation`. An
    # `animation_id` alone is not enough because the frontend does not fetch
    # the catalog for every caption.
    result["signs"] = {
        language: build_signs(text, language, include_animation=True)
        for language in sorted(set(sign_languages))
    }
    return result


def close_stale_attendance_for_lecture(lecture_id: int) -> None:
    with _open() as db:
        rows = db.scalars(
            select(LectureAttendance).where(
                LectureAttendance.lecture_id == lecture_id,
                LectureAttendance.left_at.is_(None),
            )
        ).all()
        now = utcnow()
        for row in rows:
            row.left_at = now
            row.duration_seconds = duration_seconds(row.joined_at, now)
        db.commit()


def create_attendance_for_connected(classroom_id: int, student_ids: list[int]) -> None:
    if not student_ids:
        return
    with _open() as db:
        lecture = db.scalar(
            select(Lecture).where(
                Lecture.classroom_id == classroom_id, Lecture.status == "live"
            )
        )
        if not lecture:
            return
        existing = set(
            db.scalars(
                select(LectureAttendance.student_id).where(
                    LectureAttendance.lecture_id == lecture.id
                )
            ).all()
        )
        for student_id in student_ids:
            if student_id not in existing:
                db.add(LectureAttendance(lecture_id=lecture.id, student_id=student_id))
        db.commit()


def translate_languages(text: str, source: str, languages: list[str]) -> dict[str, Any]:
    service = get_translation_service()
    results: dict[str, Any] = {}
    for language in sorted(set(languages)):
        try:
            outcome = service.translate(text, source, language)
        except Exception as exc:  # unsupported language etc.
            logger.warning("Translation to %s failed: %s", language, exc)
            results[language] = {
                "text": text,
                "provider": "unavailable",
                "translated": False,
                "error": str(exc),
            }
            continue
        results[language] = {
            "text": outcome.translated_text,
            "provider": outcome.provider,
            "translated": outcome.translated,
            "error": outcome.error,
        }
    return results


def sign_animation_index(language: str) -> dict[str, int]:
    from app.models import SignLanguageAnimation

    with _open() as db:
        rows = db.scalars(
            select(SignLanguageAnimation).where(SignLanguageAnimation.sign_language == language)
        ).all()
        return {row.gloss: row.id for row in rows}


def build_signs(text: str, language: str, *, include_animation: bool = False) -> dict[str, Any]:
    engine = get_engine()
    try:
        result = engine.convert(text, language)
    except ValueError as exc:
        return {
            "supported": False,
            "language": language,
            "source_text": text,
            "glosses": [],
            "tokens": [],
            "unsupported": [],
            "fallback_message": f"Sign language '{language}' is not available yet.",
            "rules_applied": [],
            "phrase_matches": [],
            "coverage": 0,
            "verified_coverage": 0,
            "has_fallback": True,
            "grammar_note": None,
            "catalog_note": None,
            "error": str(exc),
        }
    ids = sign_animation_index(language)
    glosses = []
    for gloss in result["glosses"]:
        entry = dict(gloss)
        entry["animation_id"] = ids.get(entry["gloss"]) if entry["available"] else None
        if not include_animation:
            entry.pop("animation", None)
        glosses.append(entry)
    return {
        "supported": True,
        "language": result["language"],
        "source_text": result["source_text"],
        "catalog_note": result["catalog_note"],
        "glosses": glosses,
        "tokens": result["tokens"],
        "unsupported": result["unsupported"],
        "rules_applied": result["rules_applied"],
        "phrase_matches": result["phrase_matches"],
        "coverage": result["coverage"],
        "verified_coverage": result["verified_coverage"],
        "has_fallback": result["has_fallback"],
        "fallback_message": result["fallback_message"],
        "grammar_note": result["grammar_note"],
    }


def persist_caption(
    *,
    lecture_id: int,
    text: str,
    source_language: str,
    start_ms: int,
    end_ms: int,
    confidence: float | None,
    languages: list[str],
) -> dict[str, Any]:
    translations = translate_languages(text, source_language, languages)

    with _open() as db:
        lecture = db.get(Lecture, lecture_id)
        if lecture is None:
            raise ValueError("Lecture not found")
        max_sequence = db.scalar(
            select(func.max(Subtitle.sequence)).where(Subtitle.lecture_id == lecture_id)
        )
        sequence = int(max_sequence or 0) + 1
        subtitle = Subtitle(
            lecture_id=lecture_id,
            sequence=sequence,
            text=text,
            source_language=source_language,
            start_ms=max(0, start_ms),
            end_ms=max(start_ms, end_ms),
            confidence=confidence,
            is_final=True,
        )
        db.add(subtitle)
        db.flush()
        for language, outcome in translations.items():
            if outcome["translated"] and language != source_language:
                db.add(
                    Translation(
                        subtitle_id=subtitle.id,
                        language=language,
                        text=outcome["text"],
                        provider=outcome["provider"],
                        status="ok",
                    )
                )
        db.commit()
        db.refresh(subtitle)
        return {
            "subtitle_id": subtitle.id,
            "sequence": sequence,
            "translations": translations,
        }


def recent_subtitles(lecture_id: int, language: str, limit: int = 8) -> list[dict[str, Any]]:
    with _open() as db:
        rows = db.scalars(
            select(Subtitle)
            .options(joinedload(Subtitle.translations))
            .where(Subtitle.lecture_id == lecture_id, Subtitle.is_final.is_(True))
            .order_by(Subtitle.sequence.desc())
            .limit(limit)
        ).unique().all()
        payload = []
        for row in rows:
            translations = {t.language: t.text for t in row.translations}
            payload.append(
                {
                    "id": row.id,
                    "sequence": row.sequence,
                    "original_text": row.text,
                    "translated_text": translations.get(language),
                    "source_language": row.source_language,
                    "language": language,
                    "translated": language in translations or language == row.source_language,
                    "start_ms": row.start_ms,
                    "end_ms": row.end_ms,
                    "confidence": row.confidence,
                    "is_final": True,
                }
            )
        return list(reversed(payload))


def retranslate_last(classroom_id: int, language: str, sign_language: str) -> dict[str, Any] | None:
    with _open() as db:
        lecture = db.scalar(
            select(Lecture).where(
                Lecture.classroom_id == classroom_id, Lecture.status == "live"
            )
        )
        if not lecture:
            return None
        subtitle = db.scalar(
            select(Subtitle)
            .where(Subtitle.lecture_id == lecture.id, Subtitle.is_final.is_(True))
            .order_by(Subtitle.sequence.desc())
        )
        if not subtitle:
            return None
        text = subtitle.text
        source = subtitle.source_language
        subtitle_id = subtitle.id
        sequence = subtitle.sequence
        start_ms = subtitle.start_ms
        end_ms = subtitle.end_ms
        confidence = subtitle.confidence
        lecture_id = lecture.id

    outcome = translate_languages(text, source, [language])[language]
    # Replays (on join or after a preference change) use the same avatar data
    # contract as live final captions.
    signs = build_signs(text, sign_language, include_animation=True)
    return {
        "type": "subtitle",
        "subtitle_id": subtitle_id,
        "lecture_id": lecture_id,
        "sequence": sequence,
        "original_text": text,
        "translated_text": outcome["text"],
        "source_language": source,
        "language": language,
        "translated": outcome["translated"],
        "translation_provider": outcome["provider"],
        "translation_error": outcome["error"],
        "start_ms": start_ms,
        "end_ms": end_ms,
        "confidence": confidence,
        "is_final": True,
        "partial": False,
        "signs": signs,
        "is_replay": True,
    }


def stop_recording_flag(lecture_id: int) -> None:
    with _open() as db:
        lecture = db.get(Lecture, lecture_id)
        if lecture:
            lecture.is_recording = False
            db.commit()


def update_enrollment_seen(classroom_id: int, student_id: int) -> None:
    with _open() as db:
        enrollment = db.scalar(
            select(ClassroomEnrollment).where(
                ClassroomEnrollment.classroom_id == classroom_id,
                ClassroomEnrollment.student_id == student_id,
            )
        )
        if enrollment:
            enrollment.last_seen_at = utcnow()
            db.commit()
