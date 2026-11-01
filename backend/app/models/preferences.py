from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, utcnow

if TYPE_CHECKING:  # pragma: no cover
    from app.models.user import StudentProfile


class StudentPreference(Base):
    __tablename__ = "student_preferences"
    __table_args__ = (
        CheckConstraint("learning_mode IN ('normal', 'deaf')", name="learning_mode_valid"),
        CheckConstraint("theme IN ('light', 'dark', 'system')", name="theme_valid"),
        CheckConstraint("subtitle_font_size BETWEEN 14 AND 48", name="font_size_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_id: Mapped[int] = mapped_column(
        ForeignKey("student_profiles.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    learning_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="normal")
    subtitle_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    original_language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    show_original: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    subtitle_font_size: Mapped[int] = mapped_column(Integer, nullable=False, default=24)
    subtitle_text_color: Mapped[str] = mapped_column(String(16), nullable=False, default="#FFFFFF")
    subtitle_background: Mapped[str] = mapped_column(String(16), nullable=False, default="#0F172A")
    high_contrast: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avatar_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sign_language: Mapped[str] = mapped_column(String(10), nullable=False, default="isl")
    reduced_motion: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    theme: Mapped[str] = mapped_column(String(10), nullable=False, default="system")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    student: Mapped[StudentProfile] = relationship(back_populates="preferences")
