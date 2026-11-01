from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import TokenError, decode_token
from app.database.session import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DbSession,
) -> User:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
    except TokenError as exc:
        raise _unauthorized(str(exc)) from exc
    try:
        user_id = int(payload.get("sub", "0"))
    except (TypeError, ValueError) as exc:
        raise _unauthorized("Invalid token subject") from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("Account is inactive")
    if int(payload.get("ver", -1)) != int(user.token_version):
        raise _unauthorized("Session has expired. Please sign in again.")
    if payload.get("role") != user.role:
        raise _unauthorized("Token role mismatch")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_teacher(user: CurrentUser) -> User:
    if user.role != "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires a teacher account.",
        )
    return user


def require_student(user: CurrentUser) -> User:
    if user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires a student account.",
        )
    return user


TeacherUser = Annotated[User, Depends(require_teacher)]
StudentUser = Annotated[User, Depends(require_student)]


def client_key(request: Request, email: str = "") -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return f"{ip}:{email.lower()}"


def authenticate_ws_token(db: Session, token: str) -> User | None:
    try:
        payload = decode_token(token, expected_type="access")
        user_id = int(payload.get("sub", "0"))
    except (TokenError, TypeError, ValueError):
        return None
    user = db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        return None
    if int(payload.get("ver", -1)) != int(user.token_version):
        return None
    if payload.get("role") != user.role:
        return None
    return user
