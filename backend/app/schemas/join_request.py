from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ClassroomJoinRequestOut(BaseModel):
    id: int
    classroom_id: int
    classroom_name: str
    teacher_name: str
    student_id: int
    student_name: str
    student_email: str
    status: str
    requested_at: datetime
    reviewed_at: datetime | None = None

