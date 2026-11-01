from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.api.deps import CurrentUser, DbSession, TeacherUser
from app.core.config import settings
from app.models import Classroom, ClassroomEnrollment, UploadedMaterial
from app.schemas.lecture import MaterialOut
from app.services.access import can_access_material, get_owned_classroom
from app.services.serializers import material_to_out
from app.services.storage import (
    StorageError,
    UploadValidationError,
    delete_storage_key,
    resolve_storage_key,
    save_upload,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Materials"])


@router.get("/materials", response_model=list[MaterialOut])
def list_materials(
    user: CurrentUser,
    db: DbSession,
    classroom_id: int | None = Query(default=None),
):
    if user.role == "teacher":
        query = (
            select(UploadedMaterial)
            .options(joinedload(UploadedMaterial.classroom), joinedload(UploadedMaterial.teacher))
            .where(UploadedMaterial.teacher_id == user.id)
        )
        if classroom_id:
            classroom = get_owned_classroom(db, user, classroom_id)
            query = query.where(UploadedMaterial.classroom_id == classroom.id)
    else:
        classroom_ids = db.scalars(
            select(ClassroomEnrollment.classroom_id).where(
                ClassroomEnrollment.student_id == user.id,
                ClassroomEnrollment.status == "active",
            )
        ).all()
        if not classroom_ids:
            return []
        query = (
            select(UploadedMaterial)
            .options(joinedload(UploadedMaterial.classroom), joinedload(UploadedMaterial.teacher))
            .where(UploadedMaterial.classroom_id.in_(classroom_ids))
        )
        if classroom_id:
            if classroom_id not in classroom_ids:
                raise HTTPException(status_code=403, detail="You are not enrolled in this classroom.")
            query = query.where(UploadedMaterial.classroom_id == classroom_id)
    materials = db.scalars(query.order_by(UploadedMaterial.created_at.desc())).all()
    return [material_to_out(material) for material in materials]


@router.post("/materials", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
async def upload_material(
    user: TeacherUser,
    db: DbSession,
    classroom_id: int = Form(...),
    title: str = Form(..., min_length=1, max_length=200),
    description: str | None = Form(default=None, max_length=2000),
    file: UploadFile = File(...),
):
    classroom = get_owned_classroom(db, user, classroom_id)
    try:
        stored = await save_upload(
            file,
            subdir="materials",
            allowed_extensions=settings.material_extension_set,
            max_bytes=settings.max_material_mb * 1024 * 1024,
        )
    except UploadValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Material upload failed")
        raise HTTPException(status_code=500, detail="Could not store the material.") from exc

    material = UploadedMaterial(
        classroom_id=classroom.id,
        teacher_id=user.id,
        title=title.strip(),
        description=description.strip() if description else None,
        storage_key=stored["storage_key"],
        original_filename=stored["original_filename"],
        mime_type=stored["mime_type"],
        size_bytes=stored["size_bytes"],
    )
    db.add(material)
    try:
        db.commit()
    except Exception:
        db.rollback()
        delete_storage_key(stored["storage_key"])
        raise
    db.refresh(material)
    return material_to_out(material)


@router.get("/materials/{material_id}/download")
def download_material(material_id: int, user: CurrentUser, db: DbSession):
    material = db.get(UploadedMaterial, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    if not can_access_material(db, user, material):
        raise HTTPException(status_code=403, detail="You do not have access to this material.")
    try:
        path = resolve_storage_key(material.storage_key)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail="Material file is unavailable.") from exc
    if not path.exists():
        raise HTTPException(status_code=404, detail="Material file is unavailable.")
    safe_name = re.sub(r"[^A-Za-z0-9._ -]", "_", material.original_filename)[:180] or path.name
    return FileResponse(
        path,
        media_type=material.mime_type or "application/octet-stream",
        filename=safe_name,
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/materials/{material_id}", response_model=dict)
def delete_material(material_id: int, user: TeacherUser, db: DbSession):
    material = db.get(UploadedMaterial, material_id)
    if not material or material.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Material not found")
    storage_key = material.storage_key
    db.delete(material)
    db.commit()
    delete_storage_key(storage_key)
    return {"detail": "Material deleted."}
