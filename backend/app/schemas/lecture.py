from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class LectureStartRequest(BaseModel):
    classroom_id: int
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class LectureStopRequest(BaseModel):
    lecture_id: int


class LectureOut(BaseModel):
    id: int
    classroom_id: int
    classroom_name: str | None = None
    teacher_id: int
    teacher_name: str | None = None
    title: str
    description: str | None = None
    status: str
    source_language: str
    is_recording: bool
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int
    subtitle_count: int = 0
    recording_count: int = 0


class SubtitleOut(BaseModel):
    id: int
    sequence: int
    text: str
    source_language: str
    start_ms: int
    end_ms: int
    confidence: float | None = None
    translations: dict[str, str] = {}
    signs: dict[str, Any] | None = None


class RecordingOut(BaseModel):
    id: int
    lecture_id: int
    classroom_id: int
    classroom_name: str | None = None
    teacher_id: int
    teacher_name: str | None = None
    title: str
    mime_type: str
    size_bytes: int
    duration_seconds: int
    start_offset_ms: int = 0
    transcript_language: str
    status: str
    recorded_at: datetime
    subtitle_count: int = 0
    has_video: bool = True


class RecordingDetailOut(RecordingOut):
    transcript: list[SubtitleOut] = []


class RecordingStartRequest(BaseModel):
    lecture_id: int


class PlaybackTokenOut(BaseModel):
    token: str
    url: str
    expires_in: int


class MaterialOut(BaseModel):
    id: int
    classroom_id: int
    classroom_name: str | None = None
    teacher_id: int
    teacher_name: str | None = None
    title: str
    description: str | None = None
    original_filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime


class AttendanceOut(BaseModel):
    id: int
    lecture_id: int
    lecture_title: str
    classroom_name: str
    joined_at: datetime
    left_at: datetime | None = None
    duration_seconds: int
    status: str = "completed"
    learning_mode: str | None = None
