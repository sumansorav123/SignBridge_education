from __future__ import annotations

from datetime import datetime, time, timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.time import duration_seconds, ensure_utc, utcnow
from app.models import (
    Classroom,
    ClassroomEnrollment,
    Lecture,
    LectureAttendance,
    Recording,
    StudentPreference,
    UploadedMaterial,
    User,
)
from app.schemas.classroom import ClassroomOut
from app.schemas.dashboard import (
    ActivityPoint,
    DashboardStats,
    StudentDashboardOut,
    TeacherDashboardOut,
    TeacherStudentOut,
)
from app.schemas.lecture import RecordingOut
from app.services.serializers import (
    attendance_to_out,
    classroom_to_out,
    lecture_to_out,
    preference_to_out,
    recording_to_out,
)


def _teacher_stats(db: Session, teacher_id: int) -> DashboardStats:
    classroom_ids = db.scalars(
        select(Classroom.id).where(Classroom.teacher_id == teacher_id)
    ).all() or []
    total_students = 0
    if classroom_ids:
        total_students = db.scalar(
            select(func.count(distinct(ClassroomEnrollment.student_id))).where(
                ClassroomEnrollment.classroom_id.in_(classroom_ids),
                ClassroomEnrollment.status == "active",
            )
        ) or 0
    active_classrooms = db.scalar(
        select(func.count(Classroom.id)).where(
            Classroom.teacher_id == teacher_id, Classroom.status == "active"
        )
    ) or 0
    live_classrooms = db.scalar(
        select(func.count(Classroom.id)).where(
            Classroom.teacher_id == teacher_id, Classroom.is_live.is_(True)
        )
    ) or 0
    completed_lectures = db.scalar(
        select(func.count(Lecture.id)).where(
            Lecture.teacher_id == teacher_id, Lecture.status == "completed"
        )
    ) or 0
    recording_seconds = db.scalar(
        select(func.coalesce(func.sum(Recording.duration_seconds), 0)).where(
            Recording.teacher_id == teacher_id
        )
    ) or 0
    total_recordings = db.scalar(
        select(func.count(Recording.id)).where(Recording.teacher_id == teacher_id)
    ) or 0
    total_materials = db.scalar(
        select(func.count(UploadedMaterial.id)).where(UploadedMaterial.teacher_id == teacher_id)
    ) or 0
    return DashboardStats(
        total_students=total_students,
        active_classrooms=active_classrooms,
        live_classrooms=live_classrooms,
        completed_lectures=completed_lectures,
        total_recorded_hours=round(recording_seconds / 3600, 2),
        total_recordings=total_recordings,
        total_materials=total_materials,
    )


def _activity(db: Session, teacher_id: int, days: int = 7) -> list[ActivityPoint]:
    today = utcnow().date()
    start_day = today - timedelta(days=days - 1)
    cutoff = datetime.combine(start_day, time.min)
    lectures = db.scalars(
        select(Lecture).where(
            Lecture.teacher_id == teacher_id, Lecture.started_at >= cutoff
        )
    ).all()
    buckets: dict[str, dict[str, int]] = {
        (start_day + timedelta(days=offset)).isoformat(): {"lectures": 0, "minutes": 0}
        for offset in range(days)
    }
    for lecture in lectures:
        started = ensure_utc(lecture.started_at)
        if not started:
            continue
        key = started.date().isoformat()
        if key not in buckets:
            continue
        buckets[key]["lectures"] += 1
        seconds = lecture.duration_seconds or duration_seconds(lecture.started_at, lecture.ended_at)
        buckets[key]["minutes"] += int(seconds / 60)
    return [
        ActivityPoint(date=date, lectures=value["lectures"], minutes=value["minutes"])
        for date, value in sorted(buckets.items())
    ]


def teacher_dashboard(db: Session, teacher: User) -> TeacherDashboardOut:
    classrooms = db.scalars(
        select(Classroom)
        .where(Classroom.teacher_id == teacher.id)
        .order_by(Classroom.created_at.desc())
    ).all()
    recent_lectures = db.scalars(
        select(Lecture)
        .where(Lecture.teacher_id == teacher.id)
        .order_by(Lecture.started_at.desc())
        .limit(5)
    ).all()
    recent_recordings = db.scalars(
        select(Recording)
        .where(Recording.teacher_id == teacher.id)
        .order_by(Recording.recorded_at.desc())
        .limit(5)
    ).all()
    return TeacherDashboardOut(
        stats=_teacher_stats(db, teacher.id),
        classrooms=[classroom_to_out(db, classroom) for classroom in classrooms],
        recent_lectures=[lecture_to_out(db, lecture) for lecture in recent_lectures],
        recent_recordings=[recording_to_out(db, recording) for recording in recent_recordings],
        activity=_activity(db, teacher.id),
    )


def student_dashboard(db: Session, student: User) -> StudentDashboardOut:
    enrollments = db.scalars(
        select(ClassroomEnrollment)
        .options(joinedload(ClassroomEnrollment.classroom).joinedload(Classroom.teacher))
        .where(
            ClassroomEnrollment.student_id == student.id,
            ClassroomEnrollment.status == "active",
        )
        .order_by(ClassroomEnrollment.joined_at.desc())
    ).all()
    classroom_ids = [enrollment.classroom_id for enrollment in enrollments]
    classrooms = [classroom_to_out(db, enrollment.classroom) for enrollment in enrollments]
    live_classrooms = sum(1 for classroom in classrooms if classroom.is_live)

    recordings: list[RecordingOut] = []
    recordings_available = 0
    if classroom_ids:
        recording_rows = db.scalars(
            select(Recording)
            .where(Recording.classroom_id.in_(classroom_ids))
            .order_by(Recording.recorded_at.desc())
        ).all()
        recordings_available = len(recording_rows)
        recordings = [recording_to_out(db, recording) for recording in recording_rows[:6]]

    attendance_rows = db.scalars(
        select(LectureAttendance)
        .options(
            joinedload(LectureAttendance.lecture).joinedload(Lecture.classroom)
        )
        .where(LectureAttendance.student_id == student.id)
        .order_by(LectureAttendance.joined_at.desc())
        .limit(20)
    ).all()
    learning_seconds = sum(
        row.duration_seconds or duration_seconds(row.joined_at, row.left_at)
        for row in attendance_rows
    )

    recent_lectures = []
    if classroom_ids:
        recent_lectures = db.scalars(
            select(Lecture)
            .options(joinedload(Lecture.classroom), joinedload(Lecture.teacher))
            .where(Lecture.classroom_id.in_(classroom_ids))
            .order_by(Lecture.started_at.desc())
            .limit(6)
        ).all()

    preference = None
    if student.student_profile:
        preference = db.scalar(
            select(StudentPreference).where(
                StudentPreference.student_id == student.student_profile.id
            )
        )

    stats = DashboardStats(
        total_classes=len(classrooms),
        live_classrooms=live_classrooms,
        recordings_available=recordings_available,
        attended_lectures=len(attendance_rows),
        learning_hours=round(learning_seconds / 3600, 2),
        total_recordings=recordings_available,
        active_classrooms=sum(1 for c in classrooms if c.status == "active"),
    )
    return StudentDashboardOut(
        stats=stats,
        classrooms=classrooms,
        recent_lectures=[lecture_to_out(db, lecture) for lecture in recent_lectures],
        recordings=recordings,
        history=[attendance_to_out(row) for row in attendance_rows],
        preferences=preference_to_out(preference) if preference else None,
    )


def teacher_students(db: Session, teacher: User, classroom_id: int | None = None) -> list[TeacherStudentOut]:
    query = (
        select(ClassroomEnrollment)
        .options(
            joinedload(ClassroomEnrollment.student).joinedload(User.student_profile),
            joinedload(ClassroomEnrollment.classroom),
        )
        .join(Classroom, ClassroomEnrollment.classroom_id == Classroom.id)
        .where(
            Classroom.teacher_id == teacher.id,
            ClassroomEnrollment.status == "active",
        )
    )
    if classroom_id:
        query = query.where(ClassroomEnrollment.classroom_id == classroom_id)
    enrollments = db.scalars(query.order_by(ClassroomEnrollment.joined_at.desc())).all()

    attendance_rows = db.execute(
        select(
            LectureAttendance.student_id,
            func.count(LectureAttendance.id),
            func.coalesce(func.sum(LectureAttendance.duration_seconds), 0),
        )
        .join(Lecture, LectureAttendance.lecture_id == Lecture.id)
        .where(Lecture.teacher_id == teacher.id)
        .group_by(LectureAttendance.student_id)
    ).all()
    attendance_map = {row[0]: (row[1], row[2]) for row in attendance_rows}

    preferences = {
        preference.student_id: preference
        for preference in db.scalars(select(StudentPreference)).all()
    }

    output: list[TeacherStudentOut] = []
    for enrollment in enrollments:
        student = enrollment.student
        profile = student.student_profile
        preference = preferences.get(profile.id) if profile else None
        count, seconds = attendance_map.get(student.id, (0, 0))
        output.append(
            TeacherStudentOut(
                id=student.id,
                full_name=student.full_name,
                email=student.email,
                learning_mode=preference.learning_mode if preference else "normal",
                subtitle_language=preference.subtitle_language if preference else "en",
                classroom_id=enrollment.classroom_id,
                classroom_name=enrollment.classroom.name,
                joined_at=enrollment.joined_at,
                last_seen_at=enrollment.last_seen_at,
                lectures_attended=count,
                minutes_attended=int(seconds / 60),
            )
        )
    return output
