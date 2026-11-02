from __future__ import annotations

import logging
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.engine import make_url
from starlette.websockets import WebSocketDisconnect

from app.core.config import settings
from app.database.session import SessionLocal, engine
from app.models import (
    ClassroomEnrollment,
    ClassroomJoinRequest,
    Lecture,
    LectureAttendance,
    StudentPreference,
    StudentProfile,
)
from app.services.live_service import _redacted_database_url
from tests.conftest import TEACHER, auth_headers, login


@contextmanager
def _connect(client: TestClient, classroom_id: int, token: str):
    """Open a classroom socket and authenticate with the first message (no URL token)."""
    with client.websocket_connect(f"/ws/classroom/{classroom_id}") as socket:
        socket.send_json({"type": "auth", "token": token})
        yield socket


@contextmanager
def _connect_notifications(client: TestClient, token: str):
    with client.websocket_connect("/ws/notifications") as socket:
        socket.send_json({"type": "auth", "token": token})
        assert socket.receive_json()["type"] == "ready"
        yield socket


def _next_of_type(socket, expected: str, limit: int = 30) -> dict:
    for _ in range(limit):
        message = socket.receive_json()
        if message.get("type") == expected:
            return message
    raise AssertionError(f"Did not receive a '{expected}' message")


def _ensure_no_live_lecture(client: TestClient, headers: dict) -> None:
    lectures = client.get("/api/teacher/lectures?status=live", headers=headers).json()
    for lecture in lectures:
        client.post("/api/teacher/lectures/stop", headers=headers, json={"lecture_id": lecture["id"]})


def test_websocket_live_caption_pipeline(
    client: TestClient, teacher: dict, deaf_student: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    student_headers = auth_headers(deaf_student)
    _ensure_no_live_lecture(client, teacher_headers)

    # Make the student's saved preference explicit so this test is deterministic.
    client.put(
        "/api/student/preferences",
        headers=student_headers,
        json={"learning_mode": "deaf", "subtitle_language": "en", "avatar_enabled": True},
    )

    started = client.post(
        "/api/teacher/lectures/start",
        headers=teacher_headers,
        json={"classroom_id": 1, "title": "WebSocket integration test"},
    )
    assert started.status_code == 201, started.text
    lecture_id = started.json()["id"]

    try:
        with _connect(client, 1, teacher['access_token']) as teacher_socket:
            teacher_ready = teacher_socket.receive_json()
            assert teacher_ready["type"] == "ready"
            assert teacher_ready["classroom"]["is_teacher"] is True
            assert teacher_ready["lecture"]["id"] == lecture_id

            with _connect(client, 1, deaf_student['access_token']) as student_socket:
                student_ready = student_socket.receive_json()
                assert student_ready["type"] == "ready"
                assert student_ready["classroom"]["is_teacher"] is False
                assert student_ready["preferences"]["learning_mode"] == "deaf"

                # Teacher is told that the student wants the live media stream.
                student_socket.send_json({"type": "request-stream"})
                request = _next_of_type(teacher_socket, "student-request-stream")
                target_connection = request["student"]["connection_id"]
                assert request["student"]["user_id"] == deaf_student["user"]["id"]

                teacher_socket.send_json(
                    {
                        "type": "webrtc-offer",
                        "target_connection_id": target_connection,
                        "sdp": "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n",
                    }
                )
                offer = _next_of_type(student_socket, "webrtc-offer")
                assert offer["from_role"] == "teacher"
                assert offer["sdp"].startswith("v=0")

                student_socket.send_json(
                    {
                        "type": "webrtc-answer",
                        "target_connection_id": offer["from_connection_id"],
                        "sdp": "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n",
                    }
                )
                answer = _next_of_type(teacher_socket, "webrtc-answer")
                assert answer["from_role"] == "student"

                teacher_socket.send_json(
                    {
                        "type": "subtitle",
                        "text": "Good morning students, how are you?",
                        "is_final": True,
                        "start_ms": 0,
                        "end_ms": 2400,
                        "confidence": 0.93,
                    }
                )
                caption = _next_of_type(student_socket, "subtitle")
                assert caption["is_final"] is True
                assert caption["original_text"] == "Good morning students, how are you?"
                assert caption["translated_text"] == caption["original_text"]
                assert caption["translated"] is True
                assert caption["sequence"] == 1
                assert caption["signs"]["language"] == "isl"
                assert caption["signs"]["glosses"]
                assert caption["signs"]["grammar_note"]

                ack = _next_of_type(teacher_socket, "subtitle-ack")
                assert ack["sequence"] == 1
                assert ack["delivered_to"] >= 1

                teacher_socket.send_json(
                    {
                        "type": "subtitle",
                        "text": "Plants use sunlight",
                        "is_final": False,
                        "start_ms": 2500,
                        "end_ms": 4200,
                    }
                )
                partial = _next_of_type(student_socket, "subtitle")
                assert partial["partial"] is True
                assert partial["is_final"] is False
                assert partial["signs"] is None

                # Preference changes are persisted and immediately replayed.
                student_socket.send_json(
                    {
                        "type": "preferences",
                        "learning_mode": "deaf",
                        "subtitle_language": "hi",
                        "avatar_enabled": True,
                    }
                )
                preference_message = _next_of_type(student_socket, "preferences")
                assert preference_message["preferences"]["subtitle_language"] == "hi"
                replay = _next_of_type(student_socket, "subtitle")
                assert replay["is_replay"] is True
                assert replay["language"] == "hi"

                student_socket.send_json({"type": "ping"})
                pong = _next_of_type(student_socket, "pong")
                assert pong["timestamp"]

                # Attendance is open for the connected student.
                with SessionLocal() as db:
                    open_row = db.scalar(
                        select(LectureAttendance).where(
                            LectureAttendance.lecture_id == lecture_id,
                            LectureAttendance.student_id == deaf_student["user"]["id"],
                            LectureAttendance.left_at.is_(None),
                        )
                    )
                    assert open_row is not None

                stopped = client.post(
                    "/api/teacher/lectures/stop",
                    headers=teacher_headers,
                    json={"lecture_id": lecture_id},
                )
                assert stopped.status_code == 200
                ended = _next_of_type(student_socket, "lecture-ended")
                assert ended["lecture_id"] == lecture_id
    finally:
        _ensure_no_live_lecture(client, teacher_headers)
        client.put(
            "/api/student/preferences",
            headers=student_headers,
            json={"learning_mode": "deaf", "subtitle_language": "en", "avatar_enabled": True},
        )

    # Closing the socket finalises attendance.
    with SessionLocal() as db:
        row = db.scalar(
            select(LectureAttendance).where(LectureAttendance.lecture_id == lecture_id)
        )
        assert row is not None
        assert row.left_at is not None

    with SessionLocal() as db:
        profile = db.scalar(
            select(StudentProfile).where(
                StudentProfile.user_id == deaf_student["user"]["id"]
            )
        )
        preference = db.scalar(
            select(StudentPreference).where(StudentPreference.student_id == profile.id)
        )
        assert preference.subtitle_language == "en"
        assert preference.learning_mode == "deaf"


def test_websocket_rejects_invalid_token(client: TestClient) -> None:
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with _connect(client, 1, "invalid") as socket:
            socket.receive_json()
    assert excinfo.value.code == 4401


def test_websocket_rejects_expired_token_as_unauthorized(
    client: TestClient, deaf_student: dict
) -> None:
    token = jwt.encode(
        {
            "sub": str(deaf_student["user"]["id"]),
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            "role": "student",
            "ver": 0,
        },
        settings.secret_key,
        algorithm="HS256",
    )
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with _connect(client, 1, token) as socket:
            socket.receive_json()
    assert excinfo.value.code == 4401


def test_newly_enrolled_student_can_join_classroom_and_signal_teacher(
    client: TestClient, teacher: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    created_classroom = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={
            "name": "Cross-device Science",
            "subject": "Science",
            "source_language": "en",
        },
    )
    assert created_classroom.status_code == 201, created_classroom.text
    classroom = created_classroom.json()
    assert classroom["id"] > 0
    assert classroom["join_code"]

    registration = client.post(
        "/api/auth/register",
        json={
            "email": "ws.joined@example.com",
            "password": "StrongPass1",
            "full_name": "Joined Student",
            "role": "student",
        },
    )
    if registration.status_code == 409:
        student = client.post(
            "/api/auth/login",
            json={"email": "ws.joined@example.com", "password": "StrongPass1"},
        ).json()
    else:
        assert registration.status_code == 201, registration.text
        student = registration.json()

    with _connect(client, classroom["id"], teacher["access_token"]) as teacher_socket:
        assert teacher_socket.receive_json()["type"] == "ready"

        joined = client.post(
            "/api/student/classrooms/join",
            headers=auth_headers(student),
            json={"join_code": classroom["join_code"].lower()},
        )
        assert joined.status_code == 200, joined.text
        request = joined.json()
        assert request["classroom_id"] == classroom["id"]
        assert request["student_id"] == student["user"]["id"]
        approval = client.post(
            f"/api/classroom-join-requests/{request['id']}/approve",
            headers=teacher_headers,
        )
        assert approval.status_code == 200, approval.text
        assert approval.json()["id"] == request["id"]
        assert approval.json()["classroom_id"] == classroom["id"]

        with _connect(client, classroom["id"], student["access_token"]) as student_socket:
            student_ready = student_socket.receive_json()
            assert student_ready["type"] == "ready"
            assert student_ready["classroom"]["id"] == classroom["id"]
            assert student_ready["classroom"]["is_teacher"] is False

            request = _next_of_type(teacher_socket, "student-joined")
            assert request["student"]["user_id"] == student["user"]["id"]

            student_socket.send_json({"type": "request-stream"})
            stream_request = _next_of_type(teacher_socket, "student-request-stream")
            target_connection = stream_request["student"]["connection_id"]
            teacher_socket.send_json(
                {
                    "type": "webrtc-offer",
                    "target_connection_id": target_connection,
                    "sdp": "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n",
                }
            )
            offer = _next_of_type(student_socket, "webrtc-offer")
            assert offer["from_role"] == "teacher"
            assert offer["sdp"].startswith("v=0")

    teacher_classroom = client.get(
        f"/api/teacher/classrooms/{classroom['id']}", headers=teacher_headers
    )
    assert teacher_classroom.status_code == 200
    assert any(item["id"] == student["user"]["id"] for item in teacher_classroom.json()["students"])


def test_join_request_notifications_reach_teacher_and_student(
    client: TestClient, teacher: dict, hearing_student: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    created = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={"name": "Notification flow", "subject": "Science"},
    )
    assert created.status_code == 201
    classroom = created.json()

    with _connect_notifications(client, teacher["access_token"]) as teacher_socket:
        with _connect_notifications(client, hearing_student["access_token"]) as student_socket:
            request = client.post(
                "/api/student/classrooms/join",
                headers=auth_headers(hearing_student),
                json={"join_code": classroom["join_code"]},
            )
            assert request.status_code == 200
            request_id = request.json()["id"]

            teacher_event = teacher_socket.receive_json()
            assert teacher_event["type"] == "classroom_join_request"
            assert teacher_event["request"]["id"] == request_id
            teacher_refresh = client.get(
                "/api/teacher/join-requests", headers=teacher_headers
            )
            assert teacher_refresh.status_code == 200
            assert any(item["id"] == request_id for item in teacher_refresh.json())
            assert teacher_event["request"]["student_email"] == hearing_student["user"]["email"]

            with pytest.raises(WebSocketDisconnect) as excinfo:
                with _connect(client, classroom["id"], hearing_student["access_token"]) as pending_socket:
                    pending_socket.receive_json()
            assert excinfo.value.code == 4403

            approved = client.post(
                f"/api/classroom-join-requests/{request_id}/approve",
                headers=teacher_headers,
            )
            assert approved.status_code == 200
            student_event = student_socket.receive_json()
            assert student_event["type"] == "join_request_approved"
            assert student_event["request"]["status"] == "approved"


def test_reject_and_cancel_notifications_and_re_request(
    client: TestClient, teacher: dict, hearing_student: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    created = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={"name": "Retry notification flow", "subject": "Science"},
    )
    classroom = created.json()

    with _connect_notifications(client, teacher["access_token"]) as teacher_socket:
        with _connect_notifications(client, hearing_student["access_token"]) as student_socket:
            first = client.post(
                "/api/student/classrooms/join",
                headers=auth_headers(hearing_student),
                json={"join_code": classroom["join_code"]},
            ).json()
            assert teacher_socket.receive_json()["type"] == "classroom_join_request"

            rejected = client.post(
                f"/api/classroom-join-requests/{first['id']}/reject",
                headers=teacher_headers,
            )
            assert rejected.status_code == 200
            rejected_event = student_socket.receive_json()
            assert rejected_event["type"] == "join_request_rejected"
            assert rejected_event["request"]["status"] == "rejected"

            second = client.post(
                "/api/student/classrooms/join",
                headers=auth_headers(hearing_student),
                json={"join_code": classroom["join_code"]},
            ).json()
            assert second["id"] != first["id"]
            created_event = teacher_socket.receive_json()
            assert created_event["type"] == "classroom_join_request"

            cancelled = client.post(
                f"/api/classroom-join-requests/{second['id']}/cancel",
                headers=auth_headers(hearing_student),
            )
            assert cancelled.status_code == 200
            cancelled_event = teacher_socket.receive_json()
            assert cancelled_event["type"] == "join_request_cancelled"
            student_event = student_socket.receive_json()
            assert student_event["type"] == "join_request_cancelled"
            assert student_event["request"]["status"] == "cancelled"


def test_complete_classroom_approval_and_rejection_flow(client: TestClient) -> None:
    teacher = login(client, TEACHER)
    teacher_headers = auth_headers(teacher)
    classroom_response = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={"name": "Full approval integration", "subject": "Science"},
    )
    assert classroom_response.status_code == 201, classroom_response.text
    classroom = classroom_response.json()

    student_credentials = {
        "email": f"approval-{uuid4().hex}@example.com",
        "password": "StrongPass1",
        "full_name": "Approval Integration Student",
        "role": "student",
    }
    registered = client.post("/api/auth/register", json=student_credentials)
    assert registered.status_code == 201, registered.text
    student = login(
        client,
        {"email": student_credentials["email"], "password": student_credentials["password"]},
    )
    student_headers = auth_headers(student)

    alternate_teacher_credentials = {
        "email": f"alternate-teacher-{uuid4().hex}@example.com",
        "password": "StrongPass1",
        "full_name": "Unrelated Teacher",
        "role": "teacher",
    }
    alternate_registered = client.post(
        "/api/auth/register", json=alternate_teacher_credentials
    )
    assert alternate_registered.status_code == 201, alternate_registered.text
    alternate_teacher = login(
        client,
        {
            "email": alternate_teacher_credentials["email"],
            "password": alternate_teacher_credentials["password"],
        },
    )

    with _connect_notifications(client, teacher["access_token"]) as teacher_socket:
        with _connect_notifications(client, student["access_token"]) as student_socket:
            request_response = client.post(
                "/api/student/classrooms/join",
                headers=student_headers,
                json={"join_code": classroom["join_code"]},
            )
            assert request_response.status_code == 200, request_response.text
            request_id = request_response.json()["id"]
            assert request_response.json()["status"] == "pending"
            assert request_response.json()["classroom_id"] == classroom["id"]
            assert request_response.json()["student_id"] == student["user"]["id"]
            teacher_event = teacher_socket.receive_json()
            assert teacher_event["type"] == "classroom_join_request"
            assert teacher_event["request"]["id"] == request_id

            with SessionLocal() as db:
                persisted = db.get(ClassroomJoinRequest, request_id)
                assert persisted is not None
                assert persisted.status == "pending"
                assert db.scalar(
                    select(ClassroomEnrollment.id).where(
                        ClassroomEnrollment.classroom_id == classroom["id"],
                        ClassroomEnrollment.student_id == student["user"]["id"],
                    )
                ) is None

            refreshed = client.get("/api/student/join-requests", headers=student_headers)
            assert refreshed.status_code == 200
            assert any(
                item["id"] == request_id and item["status"] == "pending"
                for item in refreshed.json()
            )
            with pytest.raises(WebSocketDisconnect) as pending_denial:
                with _connect(client, classroom["id"], student["access_token"]) as socket:
                    socket.receive_json()
            assert pending_denial.value.code == 4403

            unauthorized = client.post(
                f"/api/classroom-join-requests/{request_id}/approve",
                headers=auth_headers(alternate_teacher),
            )
            assert unauthorized.status_code == 404

            approved = client.post(
                f"/api/classroom-join-requests/{request_id}/approve",
                headers=teacher_headers,
            )
            assert approved.status_code == 200, approved.text
            assert approved.json()["status"] == "approved"
            assert approved.json()["id"] == request_id
            assert approved.json()["classroom_id"] == classroom["id"]
            assert approved.json()["student_id"] == student["user"]["id"]
            approved_event = student_socket.receive_json()
            assert approved_event["type"] == "join_request_approved"
            assert approved_event["request"]["id"] == request_id

            with SessionLocal() as db:
                assert db.get_bind() is engine
                persisted = db.get(ClassroomJoinRequest, request_id)
                assert persisted is not None
                assert persisted.status == "approved"
                membership = db.scalar(
                    select(ClassroomEnrollment).where(
                        ClassroomEnrollment.classroom_id == classroom["id"],
                        ClassroomEnrollment.student_id == student["user"]["id"],
                    )
                )
                assert membership is not None
                assert membership.classroom_id == classroom["id"]
                assert membership.student_id == student["user"]["id"]
                assert membership.status == "active"

            refreshed = client.get("/api/student/join-requests", headers=student_headers)
            assert any(
                item["id"] == request_id and item["status"] == "approved"
                for item in refreshed.json()
            )
            teacher_refresh = client.get(
                "/api/teacher/join-requests", headers=teacher_headers
            )
            assert all(item["id"] != request_id for item in teacher_refresh.json())
            with _connect(client, classroom["id"], student["access_token"]) as socket:
                ready = socket.receive_json()
                assert ready["type"] == "ready"
                assert ready["classroom"]["id"] == request_response.json()["classroom_id"]
            with _connect(client, classroom["id"], student["access_token"]) as socket:
                ready = socket.receive_json()
                assert ready["type"] == "ready"
                assert ready["classroom"]["id"] == request_response.json()["classroom_id"]

            other_classroom = client.post(
                "/api/teacher/classrooms",
                headers=teacher_headers,
                json={"name": "Different classroom authorization", "subject": "Science"},
            )
            assert other_classroom.status_code == 201, other_classroom.text
            other_classroom_id = other_classroom.json()["id"]
            assert other_classroom_id != classroom["id"]
            with pytest.raises(WebSocketDisconnect) as wrong_classroom:
                with _connect(client, other_classroom_id, student["access_token"]) as socket:
                    socket.receive_json()
            assert wrong_classroom.value.code == 4403

            wrong_student_credentials = {
                "email": f"wrong-student-{uuid4().hex}@example.com",
                "password": "StrongPass1",
                "full_name": "Unenrolled Student",
                "role": "student",
            }
            wrong_student_registration = client.post(
                "/api/auth/register", json=wrong_student_credentials
            )
            assert wrong_student_registration.status_code == 201, wrong_student_registration.text
            wrong_student = login(
                client,
                {
                    "email": wrong_student_credentials["email"],
                    "password": wrong_student_credentials["password"],
                },
            )
            with pytest.raises(WebSocketDisconnect) as wrong_student_denial:
                with _connect(client, classroom["id"], wrong_student["access_token"]) as socket:
                    socket.receive_json()
            assert wrong_student_denial.value.code == 4403

            rejected_credentials = {
                "email": f"rejected-{uuid4().hex}@example.com",
                "password": "StrongPass1",
                "full_name": "Rejected Integration Student",
                "role": "student",
            }
            rejected_registration = client.post(
                "/api/auth/register", json=rejected_credentials
            )
            assert rejected_registration.status_code == 201, rejected_registration.text
            rejected_student = login(
                client,
                {
                    "email": rejected_credentials["email"],
                    "password": rejected_credentials["password"],
                },
            )
            rejected_headers = auth_headers(rejected_student)
            with _connect_notifications(
                client, rejected_student["access_token"]
            ) as rejected_socket:
                rejected_request = client.post(
                    "/api/student/classrooms/join",
                    headers=rejected_headers,
                    json={"join_code": classroom["join_code"]},
                )
                assert rejected_request.status_code == 200
                rejected_request_id = rejected_request.json()["id"]
                assert teacher_socket.receive_json()["type"] == "classroom_join_request"

                reject_response = client.post(
                    f"/api/classroom-join-requests/{rejected_request_id}/reject",
                    headers=teacher_headers,
                )
                assert reject_response.status_code == 200
                assert reject_response.json()["status"] == "rejected"
                rejected_event = rejected_socket.receive_json()
                assert rejected_event["type"] == "join_request_rejected"
                assert rejected_event["request"]["id"] == rejected_request_id

            rejected_status = client.get(
                "/api/student/join-requests", headers=rejected_headers
            )
            assert any(
                item["id"] == rejected_request_id and item["status"] == "rejected"
                for item in rejected_status.json()
            )
            with SessionLocal() as db:
                persisted = db.get(ClassroomJoinRequest, rejected_request_id)
                assert persisted is not None
                assert persisted.status == "rejected"
                assert db.scalar(
                    select(ClassroomEnrollment.id).where(
                        ClassroomEnrollment.classroom_id == classroom["id"],
                        ClassroomEnrollment.student_id == rejected_student["user"]["id"],
                    )
                ) is None
            with pytest.raises(WebSocketDisconnect) as rejected_denial:
                with _connect(
                    client, classroom["id"], rejected_student["access_token"]
                ) as socket:
                    socket.receive_json()
            assert rejected_denial.value.code == 4403
            client.delete(
                f"/api/teacher/classrooms/{other_classroom_id}",
                headers=teacher_headers,
            )


def test_approval_transaction_rolls_back_membership_failure(
    client: TestClient, teacher: dict
) -> None:
    teacher_headers = auth_headers(teacher)
    classroom = client.post(
        "/api/teacher/classrooms",
        headers=teacher_headers,
        json={"name": "Atomic approval test", "subject": "Science"},
    ).json()
    credentials = {
        "email": f"atomic-{uuid4().hex}@example.com",
        "password": "StrongPass1",
        "full_name": "Atomic Student",
        "role": "student",
    }
    registration = client.post("/api/auth/register", json=credentials)
    assert registration.status_code == 201
    student = login(
        client, {"email": credentials["email"], "password": credentials["password"]}
    )
    request = client.post(
        "/api/student/classrooms/join",
        headers=auth_headers(student),
        json={"join_code": classroom["join_code"]},
    )
    assert request.status_code == 200
    request_id = request.json()["id"]

    def fail_enrollment_insert(_mapper, _connection, _target) -> None:
        raise RuntimeError("simulated membership persistence failure")

    event.listen(ClassroomEnrollment, "before_insert", fail_enrollment_insert)
    try:
        with pytest.raises(RuntimeError, match="simulated membership persistence failure"):
            client.post(
                f"/api/classroom-join-requests/{request_id}/approve",
                headers=teacher_headers,
            )
    finally:
        event.remove(ClassroomEnrollment, "before_insert", fail_enrollment_insert)

    with SessionLocal() as db:
        persisted = db.get(ClassroomJoinRequest, request_id)
        assert persisted is not None
        assert persisted.status == "pending"
        assert db.scalar(
            select(ClassroomEnrollment.id).where(
                ClassroomEnrollment.classroom_id == classroom["id"],
                ClassroomEnrollment.student_id == student["user"]["id"],
            )
        ) is None


def test_student_websocket_access_logs_matching_enrollment_details(
    client: TestClient,
    deaf_student: dict,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.live_service"):
        with _connect(client, 1, deaf_student["access_token"]) as socket:
            assert socket.receive_json()["type"] == "ready"

    diagnostic = next(
        record.getMessage()
        for record in caplog.records
        if "Classroom access diagnostic:" in record.getMessage()
    )
    assert f"user_id={deaf_student['user']['id']}" in diagnostic
    assert "requested_classroom_id=1" in diagnostic
    assert "enrollment_id=" in diagnostic
    assert f"enrollment_student_id={deaf_student['user']['id']}" in diagnostic
    assert "enrollment_classroom_id=1" in diagnostic
    assert "enrollment_status=active" in diagnostic
    assert "database_url=sqlite:///" in diagnostic
    assert deaf_student["user"]["email"] not in diagnostic


def test_websocket_tests_use_disposable_sqlite_database() -> None:
    database_path = Path(engine.url.database)

    assert engine.dialect.name == "sqlite"
    assert database_path.name == "test.db"
    assert database_path.parent.name.startswith("signbridge-tests-")


def test_classroom_access_diagnostic_redacts_database_credentials() -> None:
    url = make_url(
        "postgresql://dbuser:dbpassword@db.example/signbridge"
        "?sslmode=require&access_token=query-secret"
    )
    diagnostic_url = _redacted_database_url(url)

    assert "dbuser" not in diagnostic_url
    assert "dbpassword" not in diagnostic_url
    assert "query-secret" not in diagnostic_url
    assert "sslmode=require" in diagnostic_url


def test_websocket_rejects_student_without_enrollment(client: TestClient, teacher: dict) -> None:
    created = client.post(
        "/api/auth/register",
        json={
            "email": "ws.outsider@example.com",
            "password": "StrongPass1",
            "full_name": "WS Outsider",
            "role": "student",
        },
    )
    if created.status_code == 409:
        outsider = client.post(
            "/api/auth/login",
            json={"email": "ws.outsider@example.com", "password": "StrongPass1"},
        ).json()
    else:
        assert created.status_code == 201
        outsider = created.json()
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with _connect(client, 1, outsider['access_token']) as socket:
            socket.receive_json()
    assert excinfo.value.code == 4403


def test_websocket_rejects_token_in_url(client: TestClient, teacher: dict) -> None:
    """A valid JWT in the query string must NOT authenticate the socket."""
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            f"/ws/classroom/1?token={teacher['access_token']}"
        ) as socket:
            socket.send_json({"type": "ping"})  # not an auth message
            socket.receive_json()
    assert excinfo.value.code == 4401


def test_media_state_accepts_frontend_audio_video_enabled_fields(
    client: TestClient, teacher: dict, deaf_student: dict
) -> None:
    """LiveClassroom sends audio_enabled/video_enabled; the hub must honor them."""
    with _connect(client, 1, teacher["access_token"]) as teacher_socket:
        assert teacher_socket.receive_json()["type"] == "ready"
        with _connect(client, 1, deaf_student["access_token"]) as student_socket:
            assert student_socket.receive_json()["type"] == "ready"

            teacher_socket.send_json(
                {"type": "media-state", "audio_enabled": True, "video_enabled": True}
            )
            enabled = _next_of_type(student_socket, "teacher-media")
            assert enabled["microphone_enabled"] is True
            assert enabled["camera_enabled"] is True
            assert enabled["participant"]["audio_enabled"] is True
            assert enabled["participant"]["video_enabled"] is True

            teacher_socket.send_json(
                {"type": "media-state", "audio_enabled": False, "video_enabled": True}
            )
            disabled = _next_of_type(student_socket, "teacher-media")
            assert disabled["microphone_enabled"] is False
            assert disabled["camera_enabled"] is True


def test_websocket_rejects_disallowed_origin(client: TestClient, teacher: dict) -> None:
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(
            "/ws/classroom/1", headers={"origin": "https://evil.example"}
        ) as socket:
            socket.send_json({"type": "auth", "token": teacher["access_token"]})
            socket.receive_json()
    assert excinfo.value.code == 4403


@pytest.mark.parametrize("path", ["/ws/classroom/1", "/ws/notifications"])
def test_websocket_client_disconnect_before_auth_is_clean(
    client: TestClient, path: str
) -> None:
    with client.websocket_connect(path) as socket:
        socket.close()
