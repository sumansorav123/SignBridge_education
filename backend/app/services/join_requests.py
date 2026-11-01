from __future__ import annotations

from app.models import ClassroomJoinRequest
from app.schemas.join_request import ClassroomJoinRequestOut


def join_request_to_out(
    request: ClassroomJoinRequest,
) -> ClassroomJoinRequestOut:
    return ClassroomJoinRequestOut(
        id=request.id,
        classroom_id=request.classroom_id,
        classroom_name=request.classroom.name,
        teacher_name=request.classroom.teacher.full_name,
        student_id=request.student_id,
        student_name=request.student.full_name,
        student_email=request.student.email,
        status=request.status,
        requested_at=request.requested_at,
        reviewed_at=request.reviewed_at,
    )
