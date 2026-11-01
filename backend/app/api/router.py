from __future__ import annotations

from fastapi import APIRouter

from app.api import accessibility, auth, join_requests, materials, recordings, student, teacher

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(teacher.router)
api_router.include_router(student.router)
api_router.include_router(join_requests.router)
api_router.include_router(recordings.router)
api_router.include_router(materials.router)
# Canonical accessibility namespace plus the original flat aliases for clients
# built against earlier drafts of the API contract.
api_router.include_router(accessibility.router, prefix="/accessibility")
api_router.include_router(accessibility.router)

__all__ = ["api_router"]
