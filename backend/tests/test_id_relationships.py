from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import (
    Classroom,
    ClassroomEnrollment,
    Lecture,
    LectureAttendance,
    StudentPreference,
    User,
)
from tests.conftest import auth_headers, login

NEW_STUDENT = {
    "email": "id.regression.student@example.com",
    "password": "StrongPass1",
    "full_name": "ID Regression Student",
    "role": "student",
}


def _classrooms_by_code(client: TestClient, teacher: dict) -> dict[str, dict]:
    response = client.get("/api/teacher/classrooms", headers=auth_headers(teacher))
    assert response.status_code == 200, response.text
    return {classroom["join_code"]: classroom for classroom in response.json()}


def _register_or_login_student(client: TestClient) -> dict:
    created = client.post("/api/auth/register", json=NEW_STUDENT)
    if created.status_code == 409:
        return login(client, {"email": NEW_STUDENT["email"], "password": NEW_STUDENT["password"]})
    assert created.status_code == 201, created.text
    return created.json()


def test_user_ids_are_used_for_enrollment_attendance_and_dashboards(
    client: TestClient, teacher: dict, deaf_student: dict
) -> None:
    classrooms = _classrooms_by_code(client, teacher)
    science = classrooms["SCI10A"]
    teacher_id = teacher["user"]["id"]
    deaf_user_id = deaf_student["user"]["id"]

    assert science["teacher_id"] == teacher_id

    with SessionLocal() as db:
        science_row = db.get(Classroom, science["id"])
        assert science_row is not None
        assert science_row.teacher_id == teacher_id

        enrollment = db.scalar(
            select(ClassroomEnrollment).where(
                ClassroomEnrollment.classroom_id == science["id"],
                ClassroomEnrollment.student_id == deaf_user_id,
            )
        )
        assert enrollment is not None
        assert enrollment.student.full_name == deaf_student["user"]["full_name"]

        attendance = db.scalar(
            select(LectureAttendance)
            .join(Lecture, LectureAttendance.lecture_id == Lecture.id)
            .where(
                Lecture.classroom_id == science["id"],
                LectureAttendance.student_id == deaf_user_id,
            )
        )
        assert attendance is not None
        assert attendance.student.full_name == deaf_student["user"]["full_name"]

    detail = client.get(
        f"/api/teacher/classrooms/{science['id']}", headers=auth_headers(teacher)
    )
    assert detail.status_code == 200, detail.text
    roster = detail.json()["students"]
    matching = [
        student for student in roster if student["email"] == deaf_student["user"]["email"]
    ]
    assert matching, "Seed student must appear on the classroom roster"
    # Roster entries are keyed by the user id, not the student profile id.
    assert matching[0]["id"] == deaf_user_id

    all_students = client.get("/api/teacher/students", headers=auth_headers(teacher))
    assert all_students.status_code == 200, all_students.text
    assert any(
        student["id"] == deaf_user_id and student["email"] == deaf_student["user"]["email"]
        for student in all_students.json()
    )


def test_student_preference_uses_profile_id_and_stays_linked(
    client: TestClient, deaf_student: dict
) -> None:
    user = deaf_student["user"]
    profile_id = user["student_profile"]["id"]

    with SessionLocal() as db:
        preference = db.scalar(
            select(StudentPreference).where(StudentPreference.student_id == profile_id)
        )
        assert preference is not None
        assert preference.student.id == profile_id
        assert preference.student.user_id == user["id"]

    response = client.get("/api/student/preferences", headers=auth_headers(deaf_student))
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["learning_mode"] == user["preferences"]["learning_mode"]


def test_remove_student_endpoint_expects_user_id_not_profile_id(
    client: TestClient, teacher: dict
) -> None:
    classrooms = _classrooms_by_code(client, teacher)
    maths = classrooms["MATH10"]

    student = _register_or_login_student(client)
    student_headers = auth_headers(student)
    student_id = student["user"]["id"]
    profile_id = student["user"]["student_profile"]["id"]

    joined = client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": maths["join_code"]},
    )
    assert joined.status_code in {200, 409}, joined.text
    if joined.status_code == 200:
        request_id = joined.json()["id"]
        approved = client.post(
            f"/api/classroom-join-requests/{request_id}/approve",
            headers=auth_headers(teacher),
        )
        assert approved.status_code == 200, approved.text

    with SessionLocal() as db:
        enrollment = db.scalar(
            select(ClassroomEnrollment).where(
                ClassroomEnrollment.classroom_id == maths["id"],
                ClassroomEnrollment.student_id == student_id,
            )
        )
        assert enrollment is not None
        assert enrollment.status == "active"

    # A student profile id is a different sequence from the users.id sequence, so it
    # is only safe to probe the negative case when no user happens to own that id.
    with SessionLocal() as db:
        profile_id_is_user = db.get(User, profile_id) is not None
    if not profile_id_is_user:
        wrong = client.delete(
            f"/api/teacher/classrooms/{maths['id']}/students/{profile_id}",
            headers=auth_headers(teacher),
        )
        assert wrong.status_code == 404

    removed = client.delete(
        f"/api/teacher/classrooms/{maths['id']}/students/{student_id}",
        headers=auth_headers(teacher),
    )
    assert removed.status_code == 200, removed.text

    with SessionLocal() as db:
        enrollment = db.scalar(
            select(ClassroomEnrollment).where(
                ClassroomEnrollment.classroom_id == maths["id"],
                ClassroomEnrollment.student_id == student_id,
            )
        )
        assert enrollment is not None
        assert enrollment.status == "removed"
