from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StudentPreferenceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    learning_mode: str
    subtitle_language: str
    original_language: str
    show_original: bool
    subtitle_font_size: int
    subtitle_text_color: str
    subtitle_background: str
    high_contrast: bool
    avatar_enabled: bool
    sign_language: str
    reduced_motion: bool
    theme: str
    updated_at: datetime | None = None


class StudentPreferenceUpdate(BaseModel):
    learning_mode: str | None = Field(default=None, pattern="^(normal|deaf)$")
    subtitle_language: str | None = Field(default=None, max_length=10)
    original_language: str | None = Field(default=None, max_length=10)
    show_original: bool | None = None
    subtitle_font_size: int | None = Field(default=None, ge=14, le=48)
    subtitle_text_color: str | None = Field(default=None, pattern="^#[0-9A-Fa-f]{6}$")
    subtitle_background: str | None = Field(default=None, pattern="^#[0-9A-Fa-f]{6}$")
    high_contrast: bool | None = None
    avatar_enabled: bool | None = None
    sign_language: str | None = Field(default=None, max_length=10)
    reduced_motion: bool | None = None
    theme: str | None = Field(default=None, pattern="^(light|dark|system)$")

    @field_validator("subtitle_language", "original_language", "sign_language")
    @classmethod
    def _lower(cls, value: str | None) -> str | None:
        return value.lower() if value else value
