from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import DbSession, StudentUser
from app.models import (
    Classroom,
    ClassroomEnrollment,
    ClassroomJoinRequest,
    Lecture,
    LectureAttendance,
    Recording,
    StudentPreference,
    StudentProfile,
    User,
)
from app.schemas.classroom import ClassroomOut, JoinClassroomRequest
from app.schemas.dashboard import StudentDashboardOut
from app.schemas.join_request import ClassroomJoinRequestOut
from app.schemas.lecture import AttendanceOut, RecordingOut
from app.schemas.preferences import StudentPreferenceOut, StudentPreferenceUpdate
from app.services.dashboards import student_dashboard
from app.services.join_requests import join_request_to_out
from app.services.serializers import (
    attendance_to_out,
    classroom_to_out,
    preference_to_out,
    recording_to_out,
)
from app.sign_language.engine import get_engine
from app.translation.languages import is_supported
from app.websocket.notifications import get_notification_hub

router = APIRouter(prefix="/student", tags=["Student"])


def _preference_or_create(db: Session, student: User) -> StudentPreference:
    if not student.student_profile:
        profile = StudentProfile(user_id=student.id)
        db.add(profile)
        db.flush()
        student.student_profile = profile
    preference = db.scalar(
        select(StudentPreference).where(
            StudentPreference.student_id == student.student_profile.id
        )
    )
    if preference is None:
        preference = StudentPreference(student_id=student.student_profile.id)
        db.add(preference)
        db.commit()
        db.refresh(preference)
    return preference


@router.get("/dashboard", response_model=StudentDashboardOut)
def get_dashboard(user: StudentUser, db: DbSession) -> StudentDashboardOut:
    return student_dashboard(db, user)


@router.get("/classrooms", response_model=list[ClassroomOut])
def list_classrooms(user: StudentUser, db: DbSession):
    enrollments = db.scalars(
        select(ClassroomEnrollment)
        .options(
            joinedload(ClassroomEnrollment.classroom).joinedload(Classroom.teacher)
        )
        .where(
            ClassroomEnrollment.student_id == user.id,
            ClassroomEnrollment.status == "active",
        )
        .order_by(ClassroomEnrollment.joined_at.desc())
    ).all()
    return [classroom_to_out(db, enrollment.classroom) for enrollment in enrollments]


@router.post("/classrooms/join", response_model=ClassroomJoinRequestOut)
def join_classroom(payload: JoinClassroomRequest, user: StudentUser, db: DbSession):
    classroom = db.scalar(
        select(Classroom).where(
            Classroom.join_code == payload.join_code,
            Classroom.status == "active",
        )
    )
    if not classroom:
        raise HTTPException(
            status_code=404,
            detail="No active classroom matches that code. Check the code with your teacher.",
        )
    enrollment = db.scalar(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.classroom_id == classroom.id,
            ClassroomEnrollment.student_id == user.id,
            ClassroomEnrollment.status == "active",
        )
    )
    if enrollment:
        raise HTTPException(
            status_code=409,
            detail="You are already enrolled in this classroom.",
        )

    join_request = db.scalar(
        select(ClassroomJoinRequest)
        .options(
            joinedload(ClassroomJoinRequest.classroom).joinedload(Classroom.teacher),
            joinedload(ClassroomJoinRequest.student),
        )
        .where(
            ClassroomJoinRequest.classroom_id == classroom.id,
            ClassroomJoinRequest.student_id == user.id,
            ClassroomJoinRequest.status == "pending",
        )
    )
    if join_request is None:
        join_request = ClassroomJoinRequest(
            classroom_id=classroom.id,
            student_id=user.id,
            status="pending",
            pending_slot="pending",
        )
        db.add(join_request)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            join_request = db.scalar(
                select(ClassroomJoinRequest)
                .options(
                    joinedload(ClassroomJoinRequest.classroom).joinedload(Classroom.teacher),
                    joinedload(ClassroomJoinRequest.student),
                )
                .where(
                    ClassroomJoinRequest.classroom_id == classroom.id,
                    ClassroomJoinRequest.student_id == user.id,
                    ClassroomJoinRequest.status == "pending",
                )
            )
            if join_request is None:
                raise
        else:
            db.refresh(join_request)
            join_request = db.scalar(
                select(ClassroomJoinRequest)
                .options(
                    joinedload(ClassroomJoinRequest.classroom).joinedload(Classroom.teacher),
                    joinedload(ClassroomJoinRequest.student),
                )
                .where(ClassroomJoinRequest.id == join_request.id)
            )
            if join_request is None:
                raise RuntimeError("Created classroom join request could not be reloaded")
            get_notification_hub().publish(
                classroom.teacher_id,
                {
                    "type": "classroom_join_request",
                    "request": join_request_to_out(join_request).model_dump(mode="json"),
                },
            )
    return join_request_to_out(join_request)


@router.get("/preferences", response_model=StudentPreferenceOut)
def get_preferences(user: StudentUser, db: DbSession):
    return preference_to_out(_preference_or_create(db, user))


@router.put("/preferences", response_model=StudentPreferenceOut)
def update_preferences(
    payload: StudentPreferenceUpdate, user: StudentUser, db: DbSession
):
    updates = payload.model_dump(exclude_unset=True)
    for field in ("subtitle_language", "original_language"):
        if field in updates and updates[field] and not is_supported(updates[field]):
            raise HTTPException(status_code=422, detail=f"Unsupported language: {updates[field]}")
    if "sign_language" in updates and updates["sign_language"]:
        if get_engine().get_catalog(updates["sign_language"]) is None:
            raise HTTPException(
                status_code=422,
                detail=f"Sign language '{updates['sign_language']}' is not available yet.",
            )
    preference = _preference_or_create(db, user)
    for field, value in updates.items():
        if value is not None:
            setattr(preference, field, value)
    db.commit()
    db.refresh(preference)
    return preference_to_out(preference)


@router.get("/recordings", response_model=list[RecordingOut])
def list_recordings(
    user: StudentUser,
    db: DbSession,
    classroom_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
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
            raise HTTPException(status_code=403, detail="You are not enrolled in this classroom.")
        query = query.where(Recording.classroom_id == classroom_id)
    recordings = db.scalars(
        query.order_by(Recording.recorded_at.desc()).limit(limit).offset(offset)
    ).all()
    return [recording_to_out(db, recording) for recording in recordings]


@router.get("/history", response_model=list[AttendanceOut])
def learning_history(
    user: StudentUser,
    db: DbSession,
    limit: int = Query(default=50, ge=1, le=200),
):
    rows = db.scalars(
        select(LectureAttendance)
        .options(
            joinedload(LectureAttendance.lecture).joinedload(Lecture.classroom)
        )
        .where(LectureAttendance.student_id == user.id)
        .order_by(LectureAttendance.joined_at.desc())
        .limit(limit)
    ).all()
    preference = None
    if user.student_profile:
        preference = user.student_profile.preferences
    output = []
    for row in rows:
        item = attendance_to_out(row)
        item.learning_mode = preference.learning_mode if preference else None
        output.append(item)
    return output
