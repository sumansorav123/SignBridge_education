from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login


def test_teacher_dashboard_and_classrooms(client: TestClient, teacher: dict) -> None:
    headers = auth_headers(teacher)
    dashboard = client.get("/api/teacher/dashboard", headers=headers)
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["stats"]["active_classrooms"] >= 2
    assert any(item["join_code"] == "SCI10A" for item in payload["classrooms"])

    detail = client.get("/api/teacher/classrooms/1", headers=headers)
    assert detail.status_code == 200
    assert len(detail.json()["students"]) >= 2
    assert detail.json()["teacher_profile"]["institution"] == "Sunrise Inclusive School"


def test_student_dashboard_and_enrollment(client: TestClient, deaf_student: dict) -> None:
    headers = auth_headers(deaf_student)
    dashboard = client.get("/api/student/dashboard", headers=headers)
    assert dashboard.status_code == 200
    payload = dashboard.json()
    assert payload["stats"]["total_classes"] >= 1
    assert payload["preferences"] is not None
    assert payload["classrooms"][0]["join_code"] == "SCI10A"

    classes = client.get("/api/student/classrooms", headers=headers)
    assert classes.status_code == 200
    assert classes.json()[0]["teacher_name"] == "Meera Sharma"


def test_join_classroom_with_code(client: TestClient, teacher: dict) -> None:
    created = client.post(
        "/api/auth/register",
        json={
            "email": "joiner@example.com",
            "password": "StrongPass1",
            "full_name": "Joiner Student",
            "role": "student",
        },
    )
    if created.status_code == 409:
        student = login(client, {"email": "joiner@example.com", "password": "StrongPass1"})
    else:
        assert created.status_code == 201, created.text
        student = created.json()
    headers = auth_headers(student)

    wrong = client.post("/api/student/classrooms/join", headers=headers, json={"join_code": "NOPE99"})
    assert wrong.status_code == 404
    assert "No active classroom matches" in wrong.json()["detail"]

    joined = client.post(
        "/api/student/classrooms/join", headers=headers, json={"join_code": "SCI10A"}
    )
    assert joined.status_code == 200
    assert joined.json()["classroom_name"] == "Grade 10 Science"
    assert joined.json()["status"] == "pending"
    request_id = joined.json()["id"]

    again = client.post(
        "/api/student/classrooms/join", headers=headers, json={"join_code": "sci10a"}
    )
    assert again.status_code == 200
    assert again.json()["id"] == request_id

    pending = client.get("/api/student/join-requests", headers=headers)
    assert any(item["id"] == request_id and item["status"] == "pending" for item in pending.json())

    denied = client.get("/api/student/classrooms", headers=headers)
    assert all(item["id"] != 1 for item in denied.json())

    approval = client.post(
        f"/api/classroom-join-requests/{request_id}/approve",
        headers=auth_headers(teacher),
    )
    assert approval.status_code == 200
    assert approval.json()["status"] == "approved"
    enrolled = client.get("/api/student/classrooms", headers=headers)
    assert any(item["id"] == 1 for item in enrolled.json())

    duplicate_after_approval = client.post(
        "/api/student/classrooms/join", headers=headers, json={"join_code": "SCI10A"}
    )
    assert duplicate_after_approval.status_code == 409


def test_archived_classroom_rejects_new_joins_and_rejoin_is_idempotent(
    client: TestClient, teacher: dict, hearing_student: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    student_headers = auth_headers(hearing_student)
    created = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={"name": "Enrollment status test", "subject": "Science"},
    )
    assert created.status_code == 201, created.text
    classroom = created.json()
    request = client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": classroom["join_code"]},
    )
    assert request.status_code == 200
    request_id = request.json()["id"]

    archived = client.delete(
        f"/api/teacher/classrooms/{classroom['id']}", headers=teacher_headers
    )
    assert archived.status_code == 200
    denied = client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": classroom["join_code"]},
    )
    assert denied.status_code == 404

    archived_approval = client.post(
        f"/api/classroom-join-requests/{request_id}/approve",
        headers=teacher_headers,
    )
    assert archived_approval.status_code == 409

    restored = client.post(
        f"/api/teacher/classrooms/{classroom['id']}/restore", headers=teacher_headers
    )
    assert restored.status_code == 200
    approved = client.post(
        f"/api/classroom-join-requests/{request_id}/approve",
        headers=teacher_headers,
    )
    assert approved.status_code == 200
    duplicate = client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": classroom["join_code"].lower()},
    )
    assert duplicate.status_code == 409

    client.delete(f"/api/teacher/classrooms/{classroom['id']}", headers=teacher_headers)


def test_rejected_and_cancelled_requests_do_not_enroll_student(
    client: TestClient, teacher: dict, hearing_student: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    student_headers = auth_headers(hearing_student)
    created = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={"name": "Approval lifecycle", "subject": "Science"},
    )
    classroom = created.json()

    pending = client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": classroom["join_code"]},
    )
    assert pending.status_code == 200
    request_id = pending.json()["id"]

    reject = client.post(
        f"/api/classroom-join-requests/{request_id}/reject",
        headers=teacher_headers,
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"

    assert client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": classroom["join_code"]},
    ).json()["id"] != request_id
    second_request = client.get("/api/student/join-requests", headers=student_headers).json()[0]
    assert second_request["status"] == "pending"

    cancelled = client.post(
        f"/api/classroom-join-requests/{second_request['id']}/cancel",
        headers=student_headers,
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert all(
        item["id"] != classroom["id"]
        for item in client.get("/api/student/classrooms", headers=student_headers).json()
    )

    re_request = client.post(
        "/api/student/classrooms/join",
        headers=student_headers,
        json={"join_code": classroom["join_code"]},
    )
    assert re_request.status_code == 200
    assert re_request.json()["status"] == "pending"
    client.delete(f"/api/teacher/classrooms/{classroom['id']}", headers=teacher_headers)


def test_create_update_archive_classroom(client: TestClient, teacher: dict) -> None:
    headers = auth_headers(teacher)
    created = client.post(
        "/api/teacher/classrooms",
        headers=headers,
        json={
            "name": "Test History Class",
            "subject": "History",
            "description": "Temporary classroom for API tests",
            "source_language": "en",
        },
    )
    assert created.status_code == 201, created.text
    classroom = created.json()
    classroom_id = classroom["id"]
    assert classroom["join_code"]

    updated = client.patch(
        f"/api/teacher/classrooms/{classroom_id}",
        headers=headers,
        json={"name": "Test History Class Renamed"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Test History Class Renamed"

    archived = client.delete(f"/api/teacher/classrooms/{classroom_id}", headers=headers)
    assert archived.status_code == 200
    listed = client.get("/api/teacher/classrooms", headers=headers)
    assert all(item["id"] != classroom_id for item in listed.json())

    restored = client.post(f"/api/teacher/classrooms/{classroom_id}/restore", headers=headers)
    assert restored.status_code == 200
    assert restored.json()["status"] == "active"

    # Clean up the temporary classroom so repeated runs stay clean.
    client.delete(f"/api/teacher/classrooms/{classroom_id}", headers=headers)


def test_student_preferences_persist(client: TestClient, deaf_student: dict) -> None:
    headers = auth_headers(deaf_student)
    original = client.get("/api/student/preferences", headers=headers)
    assert original.status_code == 200
    before = original.json()

    updated = client.put(
        "/api/student/preferences",
        headers=headers,
        json={
            "learning_mode": "normal",
            "subtitle_language": "hi",
            "avatar_enabled": False,
            "subtitle_font_size": 32,
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["learning_mode"] == "normal"
    assert updated.json()["subtitle_language"] == "hi"
    assert updated.json()["avatar_enabled"] is False
    assert updated.json()["subtitle_font_size"] == 32

    fetched = client.get("/api/student/preferences", headers=headers)
    assert fetched.json()["learning_mode"] == "normal"

    invalid = client.put(
        "/api/student/preferences", headers=headers, json={"subtitle_language": "xx"}
    )
    assert invalid.status_code == 422

    restored = client.put(
        "/api/student/preferences",
        headers=headers,
        json={
            "learning_mode": before["learning_mode"],
            "subtitle_language": before["subtitle_language"],
            "avatar_enabled": before["avatar_enabled"],
            "subtitle_font_size": before["subtitle_font_size"],
        },
    )
    assert restored.status_code == 200


def test_student_history_and_recordings_scope(client: TestClient, deaf_student: dict) -> None:
    headers = auth_headers(deaf_student)
    history = client.get("/api/student/history", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) >= 1
    recordings = client.get("/api/student/recordings", headers=headers)
    assert recordings.status_code == 200
    outsider = client.get("/api/student/recordings?classroom_id=999", headers=headers)
    assert outsider.status_code == 403
