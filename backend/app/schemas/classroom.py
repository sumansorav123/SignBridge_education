from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.auth import StudentProfileOut, TeacherProfileOut


class ClassroomCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    subject: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    source_language: str = Field(default="en", max_length=10)

    @field_validator("name", "subject")
    @classmethod
    def _trim(cls, value: str) -> str:
        return value.strip()


class ClassroomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    subject: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    source_language: str | None = Field(default=None, max_length=10)
    status: str | None = Field(default=None, pattern="^(active|archived)$")


class ClassroomOut(BaseModel):
    id: int
    name: str
    subject: str
    description: str | None = None
    join_code: str
    source_language: str
    status: str
    is_live: bool
    created_at: datetime
    teacher_id: int
    teacher_name: str | None = None
    student_count: int = 0
    live_lecture_id: int | None = None
    lecture_count: int = 0
    recording_count: int = 0


class ClassroomStudentOut(BaseModel):
    id: int
    full_name: str
    email: str
    learning_mode: str
    subtitle_language: str
    joined_at: datetime
    last_seen_at: datetime | None = None
    attended_lectures: int = 0
    minutes_attended: int = 0


class ClassroomDetailOut(ClassroomOut):
    students: list[ClassroomStudentOut] = []
    teacher_profile: TeacherProfileOut | None = None


class JoinClassroomRequest(BaseModel):
    join_code: str = Field(min_length=4, max_length=12)

    @field_validator("join_code")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()
