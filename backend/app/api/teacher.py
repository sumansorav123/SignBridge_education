from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import DbSession, TeacherUser
from app.core.time import duration_seconds, utcnow
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
from app.schemas.classroom import (
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomOut,
    ClassroomUpdate,
)
from app.schemas.dashboard import TeacherDashboardOut, TeacherStudentOut
from app.schemas.lecture import LectureOut, LectureStartRequest, LectureStopRequest
from app.services.access import generate_join_code, get_owned_classroom
from app.services.dashboards import teacher_dashboard, teacher_students
from app.services.live_service import create_attendance_for_connected, close_stale_attendance_for_lecture
from app.services.serializers import classroom_to_out, lecture_to_out
from app.translation.languages import is_supported
from app.websocket.manager import get_hub

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/teacher", tags=["Teacher"])


@router.get("/dashboard", response_model=TeacherDashboardOut)
def get_dashboard(user: TeacherUser, db: DbSession) -> TeacherDashboardOut:
    return teacher_dashboard(db, user)


@router.get("/classrooms", response_model=list[ClassroomOut])
def list_classrooms(user: TeacherUser, db: DbSession, include_archived: bool = False):
    query = select(Classroom).where(Classroom.teacher_id == user.id)
    if not include_archived:
        query = query.where(Classroom.status == "active")
    classrooms = db.scalars(query.order_by(Classroom.created_at.desc())).all()
    return [classroom_to_out(db, classroom) for classroom in classrooms]


@router.post("/classrooms", response_model=ClassroomOut, status_code=status.HTTP_201_CREATED)
def create_classroom(payload: ClassroomCreate, user: TeacherUser, db: DbSession):
    if not is_supported(payload.source_language):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported source language: {payload.source_language}",
        )
    classroom = Classroom(
        teacher_id=user.id,
        name=payload.name,
        subject=payload.subject,
        description=payload.description,
        source_language=payload.source_language,
        join_code=generate_join_code(db),
    )
    db.add(classroom)
    db.commit()
    db.refresh(classroom)
    logger.info("Teacher %s created classroom %s", user.id, classroom.id)
    return classroom_to_out(db, classroom)


@router.get("/classrooms/{classroom_id}", response_model=ClassroomDetailOut)
def get_classroom(classroom_id: int, user: TeacherUser, db: DbSession):
    classroom = get_owned_classroom(db, user, classroom_id)
    payload = ClassroomDetailOut.model_validate(classroom_to_out(db, classroom).model_dump())
    enrollments = db.scalars(
        select(ClassroomEnrollment)
        .options(
            joinedload(ClassroomEnrollment.student).joinedload(User.student_profile)
        )
        .where(
            ClassroomEnrollment.classroom_id == classroom_id,
            ClassroomEnrollment.status == "active",
        )
        .order_by(ClassroomEnrollment.joined_at.desc())
    ).all()
    attendance = db.execute(
        select(
            LectureAttendance.student_id,
            func.count(LectureAttendance.id),
            func.coalesce(func.sum(LectureAttendance.duration_seconds), 0),
        )
        .join(Lecture, LectureAttendance.lecture_id == Lecture.id)
        .where(Lecture.classroom_id == classroom_id)
        .group_by(LectureAttendance.student_id)
    ).all()
    attendance_map = {row[0]: (row[1], row[2]) for row in attendance}
    preferences = {
        preference.student_id: preference
        for preference in db.scalars(select(StudentPreference)).all()
    }
    students = []
    for enrollment in enrollments:
        student = enrollment.student
        profile = student.student_profile
        preference = preferences.get(profile.id) if profile else None
        count, seconds = attendance_map.get(student.id, (0, 0))
        students.append(
            {
                "id": student.id,
                "full_name": student.full_name,
                "email": student.email,
                "learning_mode": preference.learning_mode if preference else "normal",
                "subtitle_language": preference.subtitle_language if preference else "en",
                "joined_at": enrollment.joined_at,
                "last_seen_at": enrollment.last_seen_at,
                "attended_lectures": count,
                "minutes_attended": int(seconds / 60),
            }
        )
    from app.schemas.classroom import ClassroomStudentOut

    payload.students = [ClassroomStudentOut(**student) for student in students]
    payload.teacher_profile = user.teacher_profile
    return payload


@router.patch("/classrooms/{classroom_id}", response_model=ClassroomOut)
def update_classroom(
    classroom_id: int, payload: ClassroomUpdate, user: TeacherUser, db: DbSession
):
    classroom = get_owned_classroom(db, user, classroom_id)
    updates = payload.model_dump(exclude_unset=True)
    if "source_language" in updates and updates["source_language"] and not is_supported(
        updates["source_language"]
    ):
        raise HTTPException(status_code=422, detail="Unsupported source language")
    for field, value in updates.items():
        if value is not None:
            setattr(classroom, field, value)
    db.commit()
    db.refresh(classroom)
    return classroom_to_out(db, classroom)


@router.post("/lectures/start", response_model=LectureOut, status_code=status.HTTP_201_CREATED)
async def start_lecture(payload: LectureStartRequest, user: TeacherUser, db: DbSession):
    classroom = get_owned_classroom(db, user, payload.classroom_id)
    existing = db.scalar(
        select(Lecture).where(
            Lecture.classroom_id == classroom.id, Lecture.status == "live"
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A live lecture is already running (id {existing.id}).",
        )
    now = utcnow()
    lecture = Lecture(
        classroom_id=classroom.id,
        teacher_id=user.id,
        title=payload.title or f"{classroom.subject} — {now.strftime('%d %b %Y, %H:%M')}",
        description=payload.description,
        status="live",
        source_language=classroom.source_language,
        started_at=now,
    )
    classroom.is_live = True
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    payload_out = lecture_to_out(db, lecture)

    hub = get_hub()
    connected_students = [
        participant.user_id
        for participant in hub.participants(classroom.id)
        if participant.role == "student"
    ]
    if connected_students:
        create_attendance_for_connected(classroom.id, connected_students)
    await hub.broadcast(
        classroom.id,
        {
            "type": "lecture-started",
            "lecture": payload_out.model_dump(mode="json"),
            "classroom": {
                "id": classroom.id,
                "name": classroom.name,
                "subject": classroom.subject,
            },
        },
    )
    logger.info("Lecture %s started for classroom %s", lecture.id, classroom.id)
    return payload_out


@router.post("/lectures/stop", response_model=LectureOut)
async def stop_lecture(payload: LectureStopRequest, user: TeacherUser, db: DbSession):
    lecture = db.get(Lecture, payload.lecture_id)
    if not lecture or lecture.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Lecture not found")
    if lecture.status != "live":
        raise HTTPException(status_code=409, detail="This lecture is not live.")

    now = utcnow()
    lecture.ended_at = now
    lecture.duration_seconds = duration_seconds(lecture.started_at, now)
    lecture.status = "completed"
    classroom = db.get(Classroom, lecture.classroom_id)
    if classroom:
        classroom.is_live = False
    db.commit()
    db.refresh(lecture)
    close_stale_attendance_for_lecture(lecture.id)

    hub = get_hub()
    await hub.broadcast(
        classroom.id if classroom else lecture.classroom_id,
        {
            "type": "lecture-ended",
            "lecture_id": lecture.id,
            "duration_seconds": lecture.duration_seconds,
            "ended_at": lecture.ended_at.isoformat() if lecture.ended_at else None,
        },
    )
    logger.info("Lecture %s stopped", lecture.id)
    return lecture_to_out(db, lecture)


@router.get("/lectures", response_model=list[LectureOut])
def list_lectures(
    user: TeacherUser,
    db: DbSession,
    classroom_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
):
    query = select(Lecture).where(Lecture.teacher_id == user.id)
    if classroom_id:
        query = query.where(Lecture.classroom_id == classroom_id)
    if status_filter in {"live", "completed", "cancelled"}:
        query = query.where(Lecture.status == status_filter)
    lectures = db.scalars(query.order_by(Lecture.started_at.desc()).limit(limit)).all()
    return [lecture_to_out(db, lecture) for lecture in lectures]


@router.get("/students", response_model=list[TeacherStudentOut])
def list_students(
    user: TeacherUser, db: DbSession, classroom_id: int | None = None
):
    if classroom_id:
        get_owned_classroom(db, user, classroom_id)
    return teacher_students(db, user, classroom_id)


@router.delete("/classrooms/{classroom_id}", response_model=dict)
async def archive_classroom(classroom_id: int, user: TeacherUser, db: DbSession):
    """Archive a classroom without deleting its students, lectures or recordings."""
    classroom = get_owned_classroom(db, user, classroom_id)
    live = db.scalar(
        select(Lecture).where(
            Lecture.classroom_id == classroom.id, Lecture.status == "live"
        )
    )
    if live:
        raise HTTPException(
            status_code=409,
            detail="End the live lecture before archiving this classroom.",
        )
    classroom.status = "archived"
    classroom.is_live = False
    db.commit()
    await get_hub().broadcast(
        classroom.id,
        {
            "type": "class-archived",
            "classroom_id": classroom.id,
            "message": "This classroom has been archived by the teacher.",
        },
    )
    return {"detail": "Classroom archived. Existing recordings and materials are retained."}


@router.post("/classrooms/{classroom_id}/restore", response_model=ClassroomOut)
def restore_classroom(classroom_id: int, user: TeacherUser, db: DbSession):
    classroom = get_owned_classroom(db, user, classroom_id)
    classroom.status = "active"
    db.commit()
    db.refresh(classroom)
    return classroom_to_out(db, classroom)


@router.delete("/classrooms/{classroom_id}/students/{student_id}", response_model=dict)
def remove_student(
    classroom_id: int, student_id: int, user: TeacherUser, db: DbSession
):
    classroom = get_owned_classroom(db, user, classroom_id)
    enrollment = db.scalar(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.classroom_id == classroom.id,
            ClassroomEnrollment.student_id == student_id,
        )
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Student is not enrolled in this classroom.")
    enrollment.status = "removed"
    db.commit()
    logger.info("Removed student %s from classroom %s", student_id, classroom.id)
    return {"detail": "Student removed from this classroom."}


@router.get("/lectures/{lecture_id}/subtitles", response_model=list[dict])
def lecture_subtitles(
    lecture_id: int,
    user: TeacherUser,
    db: DbSession,
    language: str | None = None,
):
    lecture = db.get(Lecture, lecture_id)
    if not lecture or lecture.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Lecture not found")
    from app.models import Subtitle
    from app.services.serializers import subtitle_to_out

    rows = db.scalars(
        select(Subtitle)
        .options(joinedload(Subtitle.translations))
        .where(Subtitle.lecture_id == lecture.id)
        .order_by(Subtitle.sequence)
    ).unique().all()
    output = []
    for row in rows:
        item = subtitle_to_out(row)
        if language:
            item.translations = {
                key: value
                for key, value in item.translations.items()
                if key == language.lower()
            }
        output.append(item.model_dump(mode="json"))
    return output
