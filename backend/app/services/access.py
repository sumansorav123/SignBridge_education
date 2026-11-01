from __future__ import annotations

import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Classroom, ClassroomEnrollment, Recording, UploadedMaterial, User

JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_join_code(db: Session, length: int = 6) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(length))
        exists = db.scalar(select(Classroom.id).where(Classroom.join_code == code))
        if not exists:
            return code
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Could not generate a unique classroom code. Please try again.",
    )


def get_owned_classroom(db: Session, teacher: User, classroom_id: int) -> Classroom:
    classroom = db.get(Classroom, classroom_id)
    if not classroom or classroom.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return classroom


def get_enrolled_classroom(db: Session, student: User, classroom_id: int) -> Classroom:
    classroom = db.get(Classroom, classroom_id)
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    enrollment = db.scalar(
        select(ClassroomEnrollment.id).where(
            ClassroomEnrollment.classroom_id == classroom_id,
            ClassroomEnrollment.student_id == student.id,
            ClassroomEnrollment.status == "active",
        )
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in this classroom.",
        )
    return classroom


def can_access_classroom(db: Session, user: User, classroom: Classroom) -> bool:
    if user.role == "teacher":
        return classroom.teacher_id == user.id
    return bool(
        db.scalar(
            select(ClassroomEnrollment.id).where(
                ClassroomEnrollment.classroom_id == classroom.id,
                ClassroomEnrollment.student_id == user.id,
                ClassroomEnrollment.status == "active",
            )
        )
    )


def can_access_recording(db: Session, user: User, recording: Recording) -> bool:
    if user.role == "teacher":
        return recording.teacher_id == user.id
    return bool(
        db.scalar(
            select(ClassroomEnrollment.id).where(
                ClassroomEnrollment.classroom_id == recording.classroom_id,
                ClassroomEnrollment.student_id == user.id,
                ClassroomEnrollment.status == "active",
            )
        )
    )


def can_access_material(db: Session, user: User, material: UploadedMaterial) -> bool:
    if user.role == "teacher":
        return material.teacher_id == user.id
    return bool(
        db.scalar(
            select(ClassroomEnrollment.id).where(
                ClassroomEnrollment.classroom_id == material.classroom_id,
                ClassroomEnrollment.student_id == user.id,
                ClassroomEnrollment.status == "active",
            )
        )
    )
