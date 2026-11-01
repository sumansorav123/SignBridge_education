from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Classroom,
    ClassroomEnrollment,
    Lecture,
    LectureAttendance,
    Recording,
    StudentPreference,
    Subtitle,
    UploadedMaterial,
    User,
)
from app.schemas.auth import StudentProfileOut, TeacherProfileOut, UserOut
from app.schemas.classroom import ClassroomOut, ClassroomStudentOut
from app.schemas.lecture import AttendanceOut, LectureOut, MaterialOut, RecordingOut, SubtitleOut
from app.schemas.preferences import StudentPreferenceOut


def user_to_out(user: User) -> UserOut:
    payload = UserOut.model_validate(user)
    if user.role == "teacher" and user.teacher_profile:
        payload.teacher_profile = TeacherProfileOut.model_validate(user.teacher_profile)
    if user.role == "student":
        if user.student_profile:
            payload.student_profile = StudentProfileOut.model_validate(user.student_profile)
        preference = user.student_profile.preferences if user.student_profile else None
        payload.preferences = StudentPreferenceOut.model_validate(preference) if preference else None
    return payload


def preference_to_out(preference: StudentPreference) -> StudentPreferenceOut:
    return StudentPreferenceOut.model_validate(preference)


def classroom_to_out(db: Session, classroom: Classroom) -> ClassroomOut:
    student_count = db.scalar(
        select(func.count(ClassroomEnrollment.id)).where(
            ClassroomEnrollment.classroom_id == classroom.id,
            ClassroomEnrollment.status == "active",
        )
    ) or 0
    live_lecture_id = db.scalar(
        select(Lecture.id).where(
            Lecture.classroom_id == classroom.id,
            Lecture.status == "live",
        )
    )
    lecture_count = db.scalar(
        select(func.count(Lecture.id)).where(Lecture.classroom_id == classroom.id)
    ) or 0
    recording_count = db.scalar(
        select(func.count(Recording.id)).where(Recording.classroom_id == classroom.id)
    ) or 0
    return ClassroomOut(
        id=classroom.id,
        name=classroom.name,
        subject=classroom.subject,
        description=classroom.description,
        join_code=classroom.join_code,
        source_language=classroom.source_language,
        status=classroom.status,
        is_live=classroom.is_live,
        created_at=classroom.created_at,
        teacher_id=classroom.teacher_id,
        teacher_name=classroom.teacher.full_name if classroom.teacher else None,
        student_count=student_count,
        live_lecture_id=live_lecture_id,
        lecture_count=lecture_count,
        recording_count=recording_count,
    )


def classroom_student_out(
    db: Session,
    enrollment: ClassroomEnrollment,
    *,
    attended_lectures: int = 0,
    minutes_attended: int = 0,
) -> ClassroomStudentOut:
    student = enrollment.student
    preference = student.student_profile.preferences if student.student_profile else None
    return ClassroomStudentOut(
        id=student.id,
        full_name=student.full_name,
        email=student.email,
        learning_mode=preference.learning_mode if preference else "normal",
        subtitle_language=preference.subtitle_language if preference else "en",
        joined_at=enrollment.joined_at,
        last_seen_at=enrollment.last_seen_at,
        attended_lectures=attended_lectures,
        lecture_minutes=minutes_attended,
    )


def lecture_to_out(db: Session, lecture: Lecture) -> LectureOut:
    subtitle_count = db.scalar(
        select(func.count(Subtitle.id)).where(Subtitle.lecture_id == lecture.id)
    ) or 0
    recording_count = db.scalar(
        select(func.count(Recording.id)).where(Recording.lecture_id == lecture.id)
    ) or 0
    return LectureOut(
        id=lecture.id,
        classroom_id=lecture.classroom_id,
        classroom_name=lecture.classroom.name if lecture.classroom else None,
        teacher_id=lecture.teacher_id,
        teacher_name=lecture.teacher.full_name if lecture.teacher else None,
        title=lecture.title,
        description=lecture.description,
        status=lecture.status,
        source_language=lecture.source_language,
        is_recording=lecture.is_recording,
        started_at=lecture.started_at,
        ended_at=lecture.ended_at,
        duration_seconds=lecture.duration_seconds,
        subtitle_count=subtitle_count,
        recording_count=recording_count,
    )


def subtitle_to_out(subtitle: Subtitle) -> SubtitleOut:
    return SubtitleOut(
        id=subtitle.id,
        sequence=subtitle.sequence,
        text=subtitle.text,
        source_language=subtitle.source_language,
        start_ms=subtitle.start_ms,
        end_ms=subtitle.end_ms,
        confidence=subtitle.confidence,
        translations={translation.language: translation.text for translation in subtitle.translations},
    )


def recording_to_out(db: Session, recording: Recording) -> RecordingOut:
    subtitle_count = db.scalar(
        select(func.count(Subtitle.id)).where(Subtitle.lecture_id == recording.lecture_id)
    ) or 0
    return RecordingOut(
        id=recording.id,
        lecture_id=recording.lecture_id,
        classroom_id=recording.classroom_id,
        classroom_name=recording.classroom.name if recording.classroom else None,
        teacher_id=recording.teacher_id,
        teacher_name=recording.teacher.full_name if recording.teacher else None,
        title=recording.title,
        mime_type=recording.mime_type,
        size_bytes=recording.size_bytes,
        duration_seconds=recording.duration_seconds,
        start_offset_ms=recording.start_offset_ms or 0,
        transcript_language=recording.transcript_language,
        status=recording.status,
        recorded_at=recording.recorded_at,
        subtitle_count=subtitle_count,
        has_video=bool(recording.storage_key),
    )


def material_to_out(material: UploadedMaterial) -> MaterialOut:
    return MaterialOut(
        id=material.id,
        classroom_id=material.classroom_id,
        classroom_name=material.classroom.name if material.classroom else None,
        teacher_id=material.teacher_id,
        teacher_name=material.teacher.full_name if material.teacher else None,
        title=material.title,
        description=material.description,
        original_filename=material.original_filename,
        mime_type=material.mime_type,
        size_bytes=material.size_bytes,
        created_at=material.created_at,
    )


def attendance_to_out(attendance: LectureAttendance) -> AttendanceOut:
    lecture = attendance.lecture
    return AttendanceOut(
        id=attendance.id,
        lecture_id=attendance.lecture_id,
        lecture_title=lecture.title if lecture else "Lecture",
        classroom_name=lecture.classroom.name if lecture and lecture.classroom else "Classroom",
        joined_at=attendance.joined_at,
        left_at=attendance.left_at,
        duration_seconds=attendance.duration_seconds,
        status="completed" if attendance.left_at else "in_progress",
    )
