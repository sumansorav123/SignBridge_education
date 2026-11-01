from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, utcnow

if TYPE_CHECKING:  # pragma: no cover
    from app.models.lecture import Lecture
    from app.models.material import UploadedMaterial
    from app.models.user import User


class Classroom(Base):
    __tablename__ = "classrooms"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'archived')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    join_code: Mapped[str] = mapped_column(String(12), unique=True, nullable=False, index=True)
    source_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", index=True)
    is_live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    teacher: Mapped[User] = relationship(back_populates="taught_classrooms")
    enrollments: Mapped[list[ClassroomEnrollment]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )
    lectures: Mapped[list[Lecture]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )
    materials: Mapped[list[UploadedMaterial]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )
    join_requests: Mapped[list[ClassroomJoinRequest]] = relationship(
        back_populates="classroom", cascade="all, delete-orphan"
    )


class ClassroomEnrollment(Base):
    __tablename__ = "classroom_enrollments"
    __table_args__ = (
        UniqueConstraint("classroom_id", "student_id", name="uq_enrollment_classroom_student"),
        CheckConstraint("status IN ('active', 'removed')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    classroom_id: Mapped[int] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    classroom: Mapped[Classroom] = relationship(back_populates="enrollments")
    student: Mapped[User] = relationship(back_populates="enrollments")


class ClassroomJoinRequest(Base):
    __tablename__ = "classroom_join_requests"
    __table_args__ = (
        UniqueConstraint(
            "classroom_id",
            "student_id",
            "pending_slot",
            name="uq_join_request_pending_student_classroom",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="status_valid",
        ),
        CheckConstraint(
            "(status = 'pending' AND pending_slot = 'pending') "
            "OR (status != 'pending' AND pending_slot IS NULL)",
            name="pending_slot_matches_status",
        ),
        Index("ix_join_request_classroom_status", "classroom_id", "status"),
        Index("ix_join_request_student_status", "student_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    classroom_id: Mapped[int] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    pending_slot: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default="pending"
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    classroom: Mapped[Classroom] = relationship(back_populates="join_requests")
    student: Mapped[User] = relationship(foreign_keys=[student_id])
    reviewer: Mapped[User | None] = relationship(foreign_keys=[reviewed_by])
