from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
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
    from app.models.classroom import Classroom
    from app.models.user import User


class Lecture(Base):
    __tablename__ = "lectures"
    __table_args__ = (
        CheckConstraint("status IN ('live', 'completed', 'cancelled')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    classroom_id: Mapped[int] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="live", index=True)
    source_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    is_recording: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    classroom: Mapped[Classroom] = relationship(back_populates="lectures")
    teacher: Mapped[User] = relationship(back_populates="lectures")
    subtitles: Mapped[list[Subtitle]] = relationship(
        back_populates="lecture", cascade="all, delete-orphan", order_by="Subtitle.sequence"
    )
    recordings: Mapped[list[Recording]] = relationship(
        back_populates="lecture", cascade="all, delete-orphan"
    )
    attendance: Mapped[list[LectureAttendance]] = relationship(
        back_populates="lecture", cascade="all, delete-orphan"
    )


class Subtitle(Base):
    __tablename__ = "subtitles"
    __table_args__ = (
        UniqueConstraint("lecture_id", "sequence", name="uq_subtitle_lecture_sequence"),
        Index("ix_subtitles_lecture_time", "lecture_id", "start_ms"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lecture_id: Mapped[int] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    lecture: Mapped[Lecture] = relationship(back_populates="subtitles")
    translations: Mapped[list[Translation]] = relationship(
        back_populates="subtitle", cascade="all, delete-orphan"
    )


class Translation(Base):
    __tablename__ = "translations"
    __table_args__ = (
        UniqueConstraint("subtitle_id", "language", name="uq_translation_subtitle_language"),
        CheckConstraint("status IN ('ok', 'fallback', 'error')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subtitle_id: Mapped[int] = mapped_column(
        ForeignKey("subtitles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    language: Mapped[str] = mapped_column(String(10), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ok")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    subtitle: Mapped[Subtitle] = relationship(back_populates="translations")


class Recording(Base):
    __tablename__ = "recordings"
    __table_args__ = (
        CheckConstraint("status IN ('ready', 'processing', 'failed')", name="status_valid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lecture_id: Mapped[int] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    classroom_id: Mapped[int] = mapped_column(
        ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(400), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Offset from the lecture start to the first recorded video frame. Subtitle
    # timestamps are lecture-relative, so playback must add this offset.
    start_offset_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    transcript_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ready")
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    lecture: Mapped[Lecture] = relationship(back_populates="recordings")
    classroom: Mapped[Classroom] = relationship()
    teacher: Mapped[User] = relationship()


class LectureAttendance(Base):
    __tablename__ = "lecture_attendance"
    __table_args__ = (
        UniqueConstraint("lecture_id", "student_id", name="uq_attendance_lecture_student"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lecture_id: Mapped[int] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    lecture: Mapped[Lecture] = relationship(back_populates="attendance")
    student: Mapped[User] = relationship()


class SignLanguageAnimation(Base):
    __tablename__ = "sign_language_animations"
    __table_args__ = (
        UniqueConstraint("sign_language", "gloss", name="uq_sign_language_gloss"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sign_language: Mapped[str] = mapped_column(String(10), nullable=False, default="isl", index=True)
    gloss: Mapped[str] = mapped_column(String(80), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="general")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    aliases: Mapped[Any] = mapped_column(JSON, nullable=False, default=list)
    animation_data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
