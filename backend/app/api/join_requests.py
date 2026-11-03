from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import select, update
from sqlalchemy.sql import Select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import DbSession, StudentUser, TeacherUser
from app.core.time import utcnow
from app.models import Classroom, ClassroomEnrollment, ClassroomJoinRequest
from app.schemas.join_request import ClassroomJoinRequestOut
from app.services.join_requests import join_request_to_out
from app.websocket.notifications import get_notification_hub

router = APIRouter(tags=["Classroom join approvals"])

REQUEST_OPTIONS = (
    joinedload(ClassroomJoinRequest.classroom).joinedload(Classroom.teacher),
    joinedload(ClassroomJoinRequest.student),
)


def _owned_request_statement(request_id: int) -> Select:
    return (
        select(ClassroomJoinRequest)
        .options(*REQUEST_OPTIONS)
        .where(ClassroomJoinRequest.id == request_id)
        .with_for_update(of=ClassroomJoinRequest)
    )


@router.get(
    "/teacher/join-requests",
    response_model=list[ClassroomJoinRequestOut],
)
def list_teacher_join_requests(
    user: TeacherUser,
    db: DbSession,
) -> list[ClassroomJoinRequestOut]:
    requests = db.scalars(
        select(ClassroomJoinRequest)
        .join(Classroom)
        .options(*REQUEST_OPTIONS)
        .where(
            Classroom.teacher_id == user.id,
            ClassroomJoinRequest.status == "pending",
        )
        .order_by(ClassroomJoinRequest.requested_at.desc())
    ).all()
    return [join_request_to_out(item) for item in requests]


@router.get(
    "/teacher/classrooms/{classroom_id}/join-requests",
    response_model=list[ClassroomJoinRequestOut],
)
def list_classroom_join_requests(
    classroom_id: int,
    user: TeacherUser,
    db: DbSession,
) -> list[ClassroomJoinRequestOut]:
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Classroom not found.")
    requests = db.scalars(
        select(ClassroomJoinRequest)
        .options(*REQUEST_OPTIONS)
        .where(
            ClassroomJoinRequest.classroom_id == classroom_id,
            ClassroomJoinRequest.status == "pending",
        )
        .order_by(ClassroomJoinRequest.requested_at.desc())
    ).all()
    return [join_request_to_out(item) for item in requests]


@router.get(
    "/student/join-requests",
    response_model=list[ClassroomJoinRequestOut],
)
def list_student_join_requests(
    user: StudentUser,
    db: DbSession,
) -> list[ClassroomJoinRequestOut]:
    requests = db.scalars(
        select(ClassroomJoinRequest)
        .options(*REQUEST_OPTIONS)
        .where(ClassroomJoinRequest.student_id == user.id)
        .order_by(ClassroomJoinRequest.requested_at.desc())
    ).all()
    return [join_request_to_out(item) for item in requests]


def _get_owned_request(
    request_id: int,
    teacher_id: int,
    db: Session,
) -> ClassroomJoinRequest:
    join_request = db.scalar(
        _owned_request_statement(request_id)
    )
    if join_request is None or join_request.classroom.teacher_id != teacher_id:
        raise HTTPException(status_code=404, detail="Join request not found.")
    if join_request.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"This join request is already {join_request.status}.",
        )
    return join_request


def _claim_pending_request(
    join_request: ClassroomJoinRequest,
    new_status: str,
    reviewer_id: int,
    reviewed_at: datetime,
    db: Session,
) -> None:
    result = db.execute(
        update(ClassroomJoinRequest)
        .where(
            ClassroomJoinRequest.id == join_request.id,
            ClassroomJoinRequest.status == "pending",
        )
        .values(
            status=new_status,
            pending_slot=None,
            reviewed_at=reviewed_at,
            reviewed_by=reviewer_id,
        )
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This join request has already been reviewed.",
        )
    join_request.status = new_status
    join_request.pending_slot = None
    join_request.reviewed_at = reviewed_at
    join_request.reviewed_by = reviewer_id


@router.post(
    "/classroom-join-requests/{request_id}/approve",
    response_model=ClassroomJoinRequestOut,
)
def approve_join_request(
    request_id: int,
    user: TeacherUser,
    db: DbSession,
) -> ClassroomJoinRequestOut:
    join_request = _get_owned_request(request_id, user.id, db)
    if join_request.classroom.status != "active":
        raise HTTPException(
            status_code=409,
            detail="Archived classrooms cannot approve new student enrollments.",
        )
    reviewed_at = utcnow()
    _claim_pending_request(join_request, "approved", user.id, reviewed_at, db)

    enrollment = db.scalar(
        select(ClassroomEnrollment).where(
            ClassroomEnrollment.classroom_id == join_request.classroom_id,
            ClassroomEnrollment.student_id == join_request.student_id,
        )
    )
    if enrollment is None:
        db.add(
            ClassroomEnrollment(
                classroom_id=join_request.classroom_id,
                student_id=join_request.student_id,
                status="active",
            )
        )
    elif enrollment.status != "active":
        enrollment.status = "active"

    db.commit()
    result = join_request_to_out(join_request)
    get_notification_hub().publish(
        join_request.student_id,
        {
            "type": "join_request_approved",
            "request": result.model_dump(mode="json"),
        },
    )
    return result


@router.post(
    "/classroom-join-requests/{request_id}/reject",
    response_model=ClassroomJoinRequestOut,
)
def reject_join_request(
    request_id: int,
    user: TeacherUser,
    db: DbSession,
) -> ClassroomJoinRequestOut:
    join_request = _get_owned_request(request_id, user.id, db)
    _claim_pending_request(join_request, "rejected", user.id, utcnow(), db)
    db.commit()
    result = join_request_to_out(join_request)
    get_notification_hub().publish(
        join_request.student_id,
        {
            "type": "join_request_rejected",
            "request": result.model_dump(mode="json"),
        },
    )
    return result


@router.post(
    "/classroom-join-requests/{request_id}/cancel",
    response_model=ClassroomJoinRequestOut,
)
def cancel_join_request(
    request_id: int,
    user: StudentUser,
    db: DbSession,
) -> ClassroomJoinRequestOut:
    join_request = db.scalar(
        select(ClassroomJoinRequest)
        .options(*REQUEST_OPTIONS)
        .where(
            ClassroomJoinRequest.id == request_id,
            ClassroomJoinRequest.student_id == user.id,
        )
        .with_for_update(of=ClassroomJoinRequest)
    )
    if join_request is None:
        raise HTTPException(status_code=404, detail="Join request not found.")
    if join_request.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"This join request is already {join_request.status}.",
        )

    reviewed_at = utcnow()
    _claim_pending_request(join_request, "cancelled", user.id, reviewed_at, db)
    db.commit()
    result = join_request_to_out(join_request)
    event = {
        "type": "join_request_cancelled",
        "request": result.model_dump(mode="json"),
    }
    notification_hub = get_notification_hub()
    notification_hub.publish(join_request.classroom.teacher_id, event)
    notification_hub.publish(join_request.student_id, event)
    return result
