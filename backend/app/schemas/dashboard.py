from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.classroom import ClassroomOut
from app.schemas.lecture import AttendanceOut, LectureOut, RecordingOut
from app.schemas.preferences import StudentPreferenceOut


class DashboardStats(BaseModel):
    total_students: int = 0
    active_classrooms: int = 0
    live_classrooms: int = 0
    completed_lectures: int = 0
    total_recorded_hours: float = 0
    total_recordings: int = 0
    total_materials: int = 0
    total_classes: int = 0
    recordings_available: int = 0
    attended_lectures: int = 0
    learning_hours: float = 0


class ActivityPoint(BaseModel):
    date: str
    lectures: int
    minutes: int


class TeacherDashboardOut(BaseModel):
    stats: DashboardStats
    classrooms: list[ClassroomOut]
    recent_lectures: list[LectureOut]
    recent_recordings: list[RecordingOut]
    activity: list[ActivityPoint]


class StudentDashboardOut(BaseModel):
    stats: DashboardStats
    classrooms: list[ClassroomOut]
    recent_lectures: list[LectureOut]
    recordings: list[RecordingOut]
    history: list[AttendanceOut]
    preferences: StudentPreferenceOut | None = None


class TeacherStudentOut(BaseModel):
    id: int
    full_name: str
    email: str
    learning_mode: str
    subtitle_language: str
    classroom_id: int
    classroom_name: str
    joined_at: datetime
    last_seen_at: datetime | None = None
    lectures_attended: int = 0
    minutes_attended: int = 0
