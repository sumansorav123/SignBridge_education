from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.core.time import utcnow
from app.database.session import SessionLocal
from app.models import (
    Classroom,
    ClassroomEnrollment,
    Lecture,
    LectureAttendance,
    StudentPreference,
    StudentProfile,
    Subtitle,
    TeacherProfile,
    User,
)

logger = logging.getLogger(__name__)

DEMO_TEACHER_EMAIL = "teacher@signbridge.app"
DEMO_STUDENT_DEAF_EMAIL = "aarav.deaf@signbridge.app"
DEMO_STUDENT_HEARING_EMAIL = "priya.hearing@signbridge.app"
DEMO_PASSWORD = "Learn@12345"
DEMO_JOIN_CODE = "SCI10A"

DEMO_TRANSCRIPT = [
    (0, 4200, "Good morning, everyone. Welcome to today's science class."),
    (4200, 9600, "Today we are going to learn how plants make their own food."),
    (9600, 15200, "This process is called photosynthesis. Please write the word in your notebook."),
    (15200, 21000, "Plants use sunlight, water, and carbon dioxide to make glucose and oxygen."),
    (21000, 26800, "The green substance in the leaves is called chlorophyll."),
    (26800, 32500, "Chlorophyll captures the light energy that the plant needs."),
    (32500, 38900, "Look at the diagram on the screen. The arrows show the movement of gases."),
    (38900, 44600, "Carbon dioxide enters the leaf through tiny openings called stomata."),
    (44600, 50400, "Water travels from the roots to the leaves through the stem."),
    (50400, 56900, "Oxygen is released into the air. That is the gas we breathe."),
    (56900, 63100, "Does everyone understand the difference between photosynthesis and respiration?"),
    (63100, 69200, "Please repeat after me: photosynthesis. Good. Well done, everyone."),
    (69200, 75800, "For homework, draw a labelled diagram of a leaf and its parts."),
    (75800, 81200, "Today we learned how plants make food. Tomorrow we will study respiration."),
]


def seed_demo_data() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.email == DEMO_TEACHER_EMAIL))
        if existing:
            logger.info("Demo data already present, skipping")
            return

        now = utcnow()
        password_hash = hash_password(DEMO_PASSWORD)

        teacher = User(
            email=DEMO_TEACHER_EMAIL,
            password_hash=password_hash,
            full_name="Meera Sharma",
            role="teacher",
            last_login_at=now,
        )
        deaf_student = User(
            email=DEMO_STUDENT_DEAF_EMAIL,
            password_hash=password_hash,
            full_name="Aarav Patel",
            role="student",
            last_login_at=now,
        )
        hearing_student = User(
            email=DEMO_STUDENT_HEARING_EMAIL,
            password_hash=password_hash,
            full_name="Priya Nair",
            role="student",
            last_login_at=now,
        )
        db.add_all([teacher, deaf_student, hearing_student])
        db.flush()

        db.add(
            TeacherProfile(
                user_id=teacher.id,
                institution="Sunrise Inclusive School",
                department="Science",
                subject_specialty="Science & Mathematics",
                years_experience=9,
                bio="Science teacher passionate about inclusive, multimodal classrooms.",
            )
        )

        deaf_profile = StudentProfile(
            user_id=deaf_student.id,
            school="Sunrise Inclusive School",
            grade_level="Grade 10",
            bio="Deaf learner. Prefers Indian Sign Language and large captions.",
        )
        hearing_profile = StudentProfile(
            user_id=hearing_student.id,
            school="Sunrise Inclusive School",
            grade_level="Grade 10",
            bio="Learns with captions in Tamil and English.",
        )
        db.add_all([deaf_profile, hearing_profile])
        db.flush()

        db.add_all(
            [
                StudentPreference(
                    student_id=deaf_profile.id,
                    learning_mode="deaf",
                    subtitle_language="en",
                    original_language="en",
                    show_original=True,
                    subtitle_font_size=30,
                    high_contrast=True,
                    avatar_enabled=True,
                    sign_language="isl",
                ),
                StudentPreference(
                    student_id=hearing_profile.id,
                    learning_mode="normal",
                    subtitle_language="ta",
                    original_language="en",
                    show_original=True,
                    subtitle_font_size=24,
                    avatar_enabled=False,
                    sign_language="isl",
                ),
            ]
        )

        science_class = Classroom(
            teacher_id=teacher.id,
            name="Grade 10 Science",
            subject="Science",
            description="Inclusive science classroom for deaf and hearing students.",
            join_code=DEMO_JOIN_CODE,
            source_language="en",
            status="active",
        )
        maths_class = Classroom(
            teacher_id=teacher.id,
            name="Grade 10 Mathematics",
            subject="Mathematics",
            description="Algebra, geometry and everyday problem solving.",
            join_code="MATH10",
            source_language="en",
            status="active",
        )
        db.add_all([science_class, maths_class])
        db.flush()

        db.add_all(
            [
                ClassroomEnrollment(classroom_id=science_class.id, student_id=deaf_student.id),
                ClassroomEnrollment(classroom_id=science_class.id, student_id=hearing_student.id),
                ClassroomEnrollment(classroom_id=maths_class.id, student_id=hearing_student.id),
            ]
        )

        lecture = Lecture(
            classroom_id=science_class.id,
            teacher_id=teacher.id,
            title="Photosynthesis — how plants make food",
            description="Recorded demo lecture with a full English transcript.",
            status="completed",
            source_language="en",
            started_at=now - timedelta(days=2, hours=1),
            ended_at=now - timedelta(days=2) + timedelta(minutes=22),
            duration_seconds=1350,
        )
        db.add(lecture)
        db.flush()

        for index, (start_ms, end_ms, text) in enumerate(DEMO_TRANSCRIPT, start=1):
            db.add(
                Subtitle(
                    lecture_id=lecture.id,
                    sequence=index,
                    text=text,
                    source_language="en",
                    start_ms=start_ms,
                    end_ms=end_ms,
                    confidence=0.94,
                    is_final=True,
                )
            )

        db.add_all(
            [
                LectureAttendance(
                    lecture_id=lecture.id,
                    student_id=deaf_student.id,
                    joined_at=lecture.started_at,
                    left_at=lecture.ended_at,
                    duration_seconds=1320,
                ),
                LectureAttendance(
                    lecture_id=lecture.id,
                    student_id=hearing_student.id,
                    joined_at=lecture.started_at,
                    left_at=lecture.ended_at,
                    duration_seconds=1280,
                ),
            ]
        )

        db.commit()
        logger.info(
            "Demo data seeded. Teacher: %s / Students: %s, %s. Password: %s",
            DEMO_TEACHER_EMAIL,
            DEMO_STUDENT_DEAF_EMAIL,
            DEMO_STUDENT_HEARING_EMAIL,
            DEMO_PASSWORD,
        )
