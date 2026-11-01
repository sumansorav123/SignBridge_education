from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class APIMessage(BaseModel):
    detail: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LanguageInfo(BaseModel):
    code: str
    name: str
    native_name: str
    speech_code: str
    rtl: bool = False


class Pagination(BaseModel):
    total: int
    limit: int
    offset: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProfileBase(BaseModel):
    institution: str | None = Field(default=None, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    subject_specialty: str | None = Field(default=None, max_length=120)
    years_experience: int | None = Field(default=None, ge=0, le=70)
    bio: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=500)


class StudentProfileBase(BaseModel):
    school: str | None = Field(default=None, max_length=160)
    grade_level: str | None = Field(default=None, max_length=60)
    bio: str | None = Field(default=None, max_length=2000)
    avatar_url: str | None = Field(default=None, max_length=500)


class TeacherProfileOut(ProfileBase, ORMModel):
    id: int


class StudentProfileOut(StudentProfileBase, ORMModel):
    id: int


class UserOut(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    role: Literal["teacher", "student"]
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None = None
    teacher_profile: TeacherProfileOut | None = None
    student_profile: StudentProfileOut | None = None
    preferences: Any | None = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    full_name: str = Field(min_length=2, max_length=120)
    role: Literal["teacher", "student"]
    teacher_profile: ProfileBase | None = None
    student_profile: StudentProfileBase | None = None

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one letter and one number")
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        return value

    @field_validator("full_name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Full name is required")
        return cleaned


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=64)
    role: Literal["teacher", "student"] | None = None


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class AuthResponse(TokenPair):
    user: UserOut


class UpdateMeRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    teacher_profile: ProfileBase | None = None
    student_profile: StudentProfileBase | None = None
