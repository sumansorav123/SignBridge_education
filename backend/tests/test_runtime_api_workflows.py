from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import decode_token
from app.database.session import SessionLocal
from app.models import (
    Classroom,
    ClassroomEnrollment,
    StudentPreference,
    StudentProfile,
    UploadedMaterial,
    User,
)
from tests.conftest import auth_headers

PASSWORD = "RuntimePass1"


def _register(
    client: TestClient,
    *,
    role: str,
    full_name: str,
    ip: str,
    profile: dict | None = None,
) -> tuple[dict, str]:
    email = f"runtime.{role}.{uuid4().hex[:12]}@example.com"
    payload = {
        "email": email,
        "password": PASSWORD,
        "full_name": full_name,
        "role": role,
    }
    if profile is not None:
        payload[f"{role}_profile"] = profile
    response = client.post(
        "/api/auth/register",
        json=payload,
        headers={"x-forwarded-for": ip},
    )
    assert response.status_code == 201, response.text
    return response.json(), email


def _login(client: TestClient, email: str, role: str, ip: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"email": email, "password": PASSWORD, "role": role},
        headers={"x-forwarded-for": ip},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _create_classroom(
    client: TestClient,
    teacher: dict,
    *,
    name: str,
    subject: str = "Science",
) -> dict:
    response = client.post(
        "/api/teacher/classrooms",
        headers=auth_headers(teacher),
        json={
            "name": name,
            "subject": subject,
            "description": f"Runtime integration classroom for {name}",
            "source_language": "en",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _join_classroom(client: TestClient, student: dict, join_code: str) -> dict:
    response = client.post(
        "/api/student/classrooms/join",
        headers=auth_headers(student),
        json={"join_code": join_code},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _approve(client: TestClient, teacher: dict, request_id: int) -> dict:
    response = client.post(
        f"/api/classroom-join-requests/{request_id}/approve",
        headers=auth_headers(teacher),
    )
    assert response.status_code == 200, response.text
    return response.json()


def _upload_material(
    client: TestClient,
    teacher: dict,
    classroom_id: int,
    *,
    title: str = "Runtime handout",
    content: bytes = b"runtime material payload",
    extra_form: dict | None = None,
):
    data = {
        "classroom_id": str(classroom_id),
        "title": title,
        "description": "Runtime integration material",
    }
    if extra_form:
        data.update(extra_form)
    return client.post(
        "/api/materials",
        headers=auth_headers(teacher),
        data=data,
        files={"file": ("runtime-notes.txt", content, "text/plain")},
    )


def test_student_registration_login_and_returned_user_ids(client: TestClient) -> None:
    ip = "198.51.100.11"
    registration, email = _register(
        client,
        role="student",
        full_name="Runtime Student",
        ip=ip,
        profile={"school": "Runtime School", "grade_level": "Grade 9"},
    )
    user = registration["user"]
    user_id = user["id"]
    profile_id = user["student_profile"]["id"]

    assert isinstance(user_id, int) and user_id > 0
    assert user["role"] == "student"
    assert user["email"] == email
    assert isinstance(profile_id, int) and profile_id > 0
    assert user["preferences"] is not None
    assert "student_id" not in user["preferences"]

    claims = decode_token(registration["access_token"], expected_type="access")
    assert claims["sub"] == str(user_id)
    assert claims["role"] == "student"
    refresh_claims = decode_token(registration["refresh_token"], expected_type="refresh")
    assert refresh_claims["sub"] == str(user_id)

    login = _login(client, email, "student", ip)
    assert login["user"]["id"] == user_id
    assert login["user"]["student_profile"]["id"] == profile_id
    assert login["user"]["email"] == email

    me = client.get("/api/auth/me", headers=auth_headers(login))
    assert me.status_code == 200, me.text
    assert me.json()["id"] == user_id
    assert me.json()["student_profile"]["id"] == profile_id

    with SessionLocal() as db:
        row = db.get(User, user_id)
        assert row is not None
        assert row.email == email
        assert row.role == "student"
        assert row.student_profile is not None
        assert row.student_profile.id == profile_id
        assert row.student_profile.user_id == user_id
        preference = db.scalar(
            select(StudentPreference).where(StudentPreference.student_id == profile_id)
        )
        assert preference is not None
        assert preference.student.user_id == user_id
        assert db.scalar(select(StudentProfile).where(StudentProfile.id == profile_id)) is not None


def test_teacher_registration_login_and_classroom_ownership(client: TestClient) -> None:
    ip = "198.51.100.12"
    registration, email = _register(
        client,
        role="teacher",
        full_name="Runtime Teacher",
        ip=ip,
        profile={
            "institution": "Runtime Institute",
            "department": "Science",
            "subject_specialty": "Physics",
            "years_experience": 5,
        },
    )
    user = registration["user"]
    teacher_id = user["id"]
    teacher_profile_id = user["teacher_profile"]["id"]

    assert isinstance(teacher_id, int) and teacher_id > 0
    assert user["role"] == "teacher"
    assert user["student_profile"] is None
    assert user["preferences"] is None
    assert isinstance(teacher_profile_id, int) and teacher_profile_id > 0

    claims = decode_token(registration["access_token"], expected_type="access")
    assert claims["sub"] == str(teacher_id)
    assert claims["role"] == "teacher"

    login = _login(client, email, "teacher", ip)
    assert login["user"]["id"] == teacher_id
    assert login["user"]["teacher_profile"]["id"] == teacher_profile_id

    classroom = _create_classroom(client, login, name="Runtime Physics")
    classroom_id = classroom["id"]
    assert isinstance(classroom_id, int) and classroom_id > 0
    assert classroom["teacher_id"] == teacher_id
    assert classroom["teacher_name"] == "Runtime Teacher"
    assert classroom["name"] == "Runtime Physics"
    assert classroom["subject"] == "Science"
    assert classroom["status"] == "active"
    assert classroom["student_count"] == 0
    assert isinstance(classroom["join_code"], str) and len(classroom["join_code"]) == 6

    listed = client.get("/api/teacher/classrooms", headers=auth_headers(login))
    assert listed.status_code == 200, listed.text
    listed_room = next(item for item in listed.json() if item["id"] == classroom_id)
    assert listed_room["teacher_id"] == teacher_id

    detail = client.get(
        f"/api/teacher/classrooms/{classroom_id}", headers=auth_headers(login)
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["id"] == classroom_id
    assert detail.json()["teacher_id"] == teacher_id
    assert detail.json()["teacher_profile"]["id"] == teacher_profile_id

    other_ip = "198.51.100.13"
    other_teacher, _ = _register(
        client,
        role="teacher",
        full_name="Other Runtime Teacher",
        ip=other_ip,
    )
    denied = client.get(
        f"/api/teacher/classrooms/{classroom_id}",
        headers=auth_headers(other_teacher),
    )
    assert denied.status_code == 404

    with SessionLocal() as db:
        row = db.get(Classroom, classroom_id)
        assert row is not None
        assert row.teacher_id == teacher_id
        assert row.teacher.id == teacher_id
        assert row.join_code == classroom["join_code"]


def test_join_approval_dashboard_and_roster_keep_same_ids(client: TestClient) -> None:
    teacher_ip = "198.51.100.21"
    student_ip = "198.51.100.22"
    teacher, _ = _register(
        client, role="teacher", full_name="Workflow Teacher", ip=teacher_ip
    )
    student, _ = _register(
        client, role="student", full_name="Workflow Student", ip=student_ip
    )
    teacher_id = teacher["user"]["id"]
    student_id = student["user"]["id"]

    classroom = _create_classroom(client, teacher, name="Workflow Classroom")
    classroom_id = classroom["id"]
    assert classroom["teacher_id"] == teacher_id

    request = _join_classroom(client, student, classroom["join_code"])
    request_id = request["id"]
    assert isinstance(request_id, int) and request_id > 0
    assert request["student_id"] == student_id
    assert request["classroom_id"] == classroom_id
    assert request["student_email"] == student["user"]["email"]
    assert request["classroom_name"] == "Workflow Classroom"
    assert request["teacher_name"] == "Workflow Teacher"
    assert request["status"] == "pending"

    student_requests = client.get(
        "/api/student/join-requests", headers=auth_headers(student)
    )
    assert student_requests.status_code == 200, student_requests.text
    listed_request = next(
        item for item in student_requests.json() if item["id"] == request_id
    )
    assert listed_request["student_id"] == student_id
    assert listed_request["classroom_id"] == classroom_id

    teacher_requests = client.get(
        "/api/teacher/join-requests", headers=auth_headers(teacher)
    )
    assert teacher_requests.status_code == 200, teacher_requests.text
    assert any(
        item["id"] == request_id
        and item["student_id"] == student_id
        and item["classroom_id"] == classroom_id
        for item in teacher_requests.json()
    )
    classroom_requests = client.get(
        f"/api/teacher/classrooms/{classroom_id}/join-requests",
        headers=auth_headers(teacher),
    )
    assert classroom_requests.status_code == 200, classroom_requests.text
    assert [item["id"] for item in classroom_requests.json()] == [request_id]

    before = client.get("/api/student/dashboard", headers=auth_headers(student))
    assert before.status_code == 200, before.text
    assert classroom_id not in {item["id"] for item in before.json()["classrooms"]}

    approved = _approve(client, teacher, request_id)
    assert approved["id"] == request_id
    assert approved["student_id"] == student_id
    assert approved["classroom_id"] == classroom_id
    assert approved["status"] == "approved"
    assert approved["reviewed_at"] is not None

    student_classrooms = client.get(
        "/api/student/classrooms", headers=auth_headers(student)
    )
    assert student_classrooms.status_code == 200, student_classrooms.text
    enrolled_room = next(
        item for item in student_classrooms.json() if item["id"] == classroom_id
    )
    assert enrolled_room["teacher_id"] == teacher_id
    assert enrolled_room["teacher_name"] == "Workflow Teacher"

    dashboard = client.get("/api/student/dashboard", headers=auth_headers(student))
    assert dashboard.status_code == 200, dashboard.text
    dashboard_room = next(
        item for item in dashboard.json()["classrooms"] if item["id"] == classroom_id
    )
    assert dashboard_room["teacher_id"] == teacher_id
    assert dashboard_room["student_count"] == 1
    assert dashboard.json()["stats"]["total_classes"] == 1

    roster = client.get(
        f"/api/teacher/classrooms/{classroom_id}", headers=auth_headers(teacher)
    )
    assert roster.status_code == 200, roster.text
    roster_payload = roster.json()
    assert roster_payload["student_count"] == 1
    roster_student = next(
        item for item in roster_payload["students"] if item["id"] == student_id
    )
    assert roster_student["email"] == student["user"]["email"]
    assert roster_student["full_name"] == "Workflow Student"

    teacher_students = client.get(
        f"/api/teacher/students?classroom_id={classroom_id}",
        headers=auth_headers(teacher),
    )
    assert teacher_students.status_code == 200, teacher_students.text
    student_row = next(
        item for item in teacher_students.json() if item["id"] == student_id
    )
    assert student_row["classroom_id"] == classroom_id
    assert student_row["classroom_name"] == "Workflow Classroom"
    assert student_row["email"] == student["user"]["email"]

    with SessionLocal() as db:
        enrollment = db.scalar(
            select(ClassroomEnrollment).where(
                ClassroomEnrollment.classroom_id == classroom_id,
                ClassroomEnrollment.student_id == student_id,
            )
        )
        assert enrollment is not None
        assert enrollment.status == "active"
        assert enrollment.student.email == student["user"]["email"]
        assert enrollment.classroom.teacher_id == teacher_id

    duplicate = client.post(
        "/api/student/classrooms/join",
        headers=auth_headers(student),
        json={"join_code": classroom["join_code"]},
    )
    assert duplicate.status_code == 409

    reapprove = client.post(
        f"/api/classroom-join-requests/{request_id}/approve",
        headers=auth_headers(teacher),
    )
    assert reapprove.status_code == 409


def test_material_upload_list_download_delete_ids_and_authorization(
    client: TestClient,
) -> None:
    teacher_ip = "198.51.100.31"
    student_ip = "198.51.100.32"
    other_ip = "198.51.100.33"
    teacher, _ = _register(
        client, role="teacher", full_name="Material Teacher", ip=teacher_ip
    )
    student, _ = _register(
        client, role="student", full_name="Material Student", ip=student_ip
    )
    other_teacher, _ = _register(
        client, role="teacher", full_name="Other Material Teacher", ip=other_ip
    )
    teacher_id = teacher["user"]["id"]
    student_id = student["user"]["id"]

    classroom = _create_classroom(client, teacher, name="Material Classroom")
    classroom_id = classroom["id"]
    request = _join_classroom(client, student, classroom["join_code"])
    _approve(client, teacher, request["id"])

    upload = _upload_material(
        client,
        teacher,
        classroom_id,
        title="Runtime Worksheet",
        content=b"runtime worksheet bytes",
        # A spoofed owner must be ignored in favour of the authenticated teacher.
        extra_form={"teacher_id": "999999"},
    )
    assert upload.status_code == 201, upload.text
    material = upload.json()
    material_id = material["id"]
    assert isinstance(material_id, int) and material_id > 0
    assert material["classroom_id"] == classroom_id
    assert material["teacher_id"] == teacher_id
    assert material["teacher_id"] != 999999
    assert material["classroom_name"] == "Material Classroom"
    assert material["teacher_name"] == "Material Teacher"
    assert material["original_filename"] == "runtime-notes.txt"
    assert material["size_bytes"] == len(b"runtime worksheet bytes")

    teacher_list = client.get(
        f"/api/materials?classroom_id={classroom_id}", headers=auth_headers(teacher)
    )
    assert teacher_list.status_code == 200, teacher_list.text
    teacher_item = next(
        item for item in teacher_list.json() if item["id"] == material_id
    )
    assert teacher_item["classroom_id"] == classroom_id
    assert teacher_item["teacher_id"] == teacher_id

    teacher_all = client.get("/api/materials", headers=auth_headers(teacher))
    assert teacher_all.status_code == 200, teacher_all.text
    assert material_id in {item["id"] for item in teacher_all.json()}

    student_list = client.get(
        f"/api/materials?classroom_id={classroom_id}", headers=auth_headers(student)
    )
    assert student_list.status_code == 200, student_list.text
    student_item = next(
        item for item in student_list.json() if item["id"] == material_id
    )
    assert student_item["classroom_id"] == classroom_id
    assert student_item["teacher_id"] == teacher_id

    student_download = client.get(
        f"/api/materials/{material_id}/download", headers=auth_headers(student)
    )
    assert student_download.status_code == 200, student_download.text
    assert student_download.content == b"runtime worksheet bytes"
    assert "runtime-notes.txt" in student_download.headers.get("content-disposition", "")

    teacher_download = client.get(
        f"/api/materials/{material_id}/download", headers=auth_headers(teacher)
    )
    assert teacher_download.status_code == 200
    assert teacher_download.content == b"runtime worksheet bytes"

    other_list = client.get("/api/materials", headers=auth_headers(other_teacher))
    assert other_list.status_code == 200, other_list.text
    assert material_id not in {item["id"] for item in other_list.json()}
    assert (
        client.get(
            f"/api/materials/{material_id}/download",
            headers=auth_headers(other_teacher),
        ).status_code
        == 403
    )
    assert (
        client.delete(
            f"/api/materials/{material_id}", headers=auth_headers(other_teacher)
        ).status_code
        == 404
    )
    assert (
        _upload_material(
            client, other_teacher, classroom_id, title="Foreign upload"
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/materials/{material_id}", headers=auth_headers(student)
        ).status_code
        == 403
    )
    assert (
        _upload_material(client, student, classroom_id, title="Student upload").status_code
        == 403
    )

    with SessionLocal() as db:
        row = db.get(UploadedMaterial, material_id)
        assert row is not None
        assert row.classroom_id == classroom_id
        assert row.teacher_id == teacher_id
        assert row.classroom.teacher_id == teacher_id
        assert row.classroom_id in {
            enrollment.classroom_id
            for enrollment in db.scalars(
                select(ClassroomEnrollment).where(
                    ClassroomEnrollment.student_id == student_id,
                    ClassroomEnrollment.status == "active",
                )
            ).all()
        }

    deleted = client.delete(
        f"/api/materials/{material_id}", headers=auth_headers(teacher)
    )
    assert deleted.status_code == 200, deleted.text
    assert material_id not in {
        item["id"]
        for item in client.get(
            f"/api/materials?classroom_id={classroom_id}",
            headers=auth_headers(teacher),
        ).json()
    }
    assert (
        client.get(
            f"/api/materials/{material_id}/download", headers=auth_headers(teacher)
        ).status_code
        == 404
    )
    assert (
        client.get(
            f"/api/materials/{material_id}/download", headers=auth_headers(student)
        ).status_code
        == 404
    )
    with SessionLocal() as db:
        assert db.get(UploadedMaterial, material_id) is None
