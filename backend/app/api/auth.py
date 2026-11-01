from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, client_key
from app.core.ratelimit import check_rate_limit, clear_attempts, record_attempt
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import StudentPreference, StudentProfile, TeacherProfile, User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UpdateMeRequest,
    UserOut,
)
from app.services.serializers import user_to_out

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


def _issue_tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id, user.role, user.token_version),
        refresh_token=create_refresh_token(user.id, user.role, user.token_version),
        expires_in=settings.access_token_expire_minutes * 60,
    )


def _auth_response(user: User) -> AuthResponse:
    tokens = _issue_tokens(user)
    return AuthResponse(**tokens.model_dump(), user=user_to_out(user))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, db: DbSession) -> AuthResponse:
    check_rate_limit(f"register:{client_key(request)}", limit=10, window=600)
    email = str(payload.email).lower().strip()
    existing = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists. Try signing in instead.",
        )

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.flush()

    if payload.role == "teacher":
        profile = payload.teacher_profile
        db.add(
            TeacherProfile(
                user_id=user.id,
                institution=profile.institution if profile else None,
                department=profile.department if profile else None,
                subject_specialty=profile.subject_specialty if profile else None,
                years_experience=profile.years_experience if profile else None,
                bio=profile.bio if profile else None,
            )
        )
    else:
        profile = payload.student_profile
        student_profile = StudentProfile(
            user_id=user.id,
            school=profile.school if profile else None,
            grade_level=profile.grade_level if profile else None,
            bio=profile.bio if profile else None,
        )
        db.add(student_profile)
        db.flush()
        db.add(
            StudentPreference(
                student_id=student_profile.id,
                learning_mode="normal",
                subtitle_language="en",
                original_language="en",
            )
        )

    db.commit()
    db.refresh(user)
    logger.info("Registered %s account: %s", user.role, user.email)
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, db: DbSession) -> AuthResponse:
    email = str(payload.email).lower().strip()
    rate_key = f"login:{client_key(request, email)}"
    check_rate_limit(rate_key)
    record_attempt(rate_key)

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Contact your administrator.",
        )
    if payload.role and payload.role != user.role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This account is registered as a {user.role}. "
                f"Please use the {user.role} sign-in page."
            ),
        )
    if user.role == "student" and user.student_profile and user.student_profile.preferences is None:
        db.add(StudentPreference(student_id=user.student_profile.id))

    from app.core.time import utcnow

    user.last_login_at = utcnow()
    db.commit()
    db.refresh(user)
    clear_attempts(rate_key)
    return _auth_response(user)


@router.post("/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest, db: DbSession) -> AuthResponse:
    try:
        claims = decode_token(payload.refresh_token, expected_type="refresh")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token. Please sign in again.",
        ) from exc
    user = db.get(User, int(claims.get("sub", 0)))
    if not user or not user.is_active or int(claims.get("ver", -1)) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is no longer valid. Please sign in again.",
        )
    return _auth_response(user)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return user_to_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(payload: UpdateMeRequest, user: CurrentUser, db: DbSession) -> UserOut:
    if payload.full_name:
        user.full_name = " ".join(payload.full_name.split())
    if user.role == "teacher" and payload.teacher_profile:
        profile = user.teacher_profile or TeacherProfile(user_id=user.id)
        db.add(profile)
        for field, value in payload.teacher_profile.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(profile, field, value)
    if user.role == "student" and payload.student_profile:
        profile = user.student_profile or StudentProfile(user_id=user.id)
        db.add(profile)
        for field, value in payload.student_profile.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(profile, field, value)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.post("/logout", response_model=dict)
def logout(user: CurrentUser, db: DbSession) -> dict:
    # Invalidates all access and refresh tokens for this account.
    user.token_version = int(user.token_version) + 1
    db.commit()
    return {"detail": "Signed out from all devices."}


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=64)
    new_password: str = Field(min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def _strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one letter and one number")
        return value


@router.post("/change-password", response_model=dict)
def change_password(payload: ChangePasswordRequest, user: CurrentUser, db: DbSession) -> dict:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    db.commit()
    return {"detail": "Password changed. Please sign in again on your other devices."}
