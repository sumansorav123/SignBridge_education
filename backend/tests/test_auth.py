from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tests.conftest import auth_headers, login


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["database"]["status"] == "ok"
    assert payload["translation"]["available"] is False
    assert payload["sign_language"]["verified_isl_entries"] == 0
    assert payload["sign_language"]["experimental_isl_entries"] == 100
    assert payload["websocket"]["url_token_auth"] is False


def test_demo_accounts_login(client: TestClient, teacher: dict, deaf_student: dict) -> None:
    assert teacher["user"]["role"] == "teacher"
    assert deaf_student["user"]["role"] == "student"
    assert deaf_student["user"]["preferences"]["learning_mode"] in {"normal", "deaf"}


def test_duplicate_registration_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={
            "email": "TEACHER@signbridge.app",
            "password": "AnotherPass1",
            "full_name": "Copy Cat",
            "role": "teacher",
        },
    )
    assert response.status_code == 409


def test_login_rejects_wrong_password_and_role(client: TestClient) -> None:
    wrong = client.post(
        "/api/auth/login",
        json={"email": "teacher@signbridge.app", "password": "WrongPass1", "role": "teacher"},
    )
    assert wrong.status_code == 401
    wrong_role = client.post(
        "/api/auth/login",
        json={"email": "teacher@signbridge.app", "password": "Learn@12345", "role": "student"},
    )
    assert wrong_role.status_code == 403


def test_register_refresh_and_me(client: TestClient) -> None:
    email = "new.teacher@example.com"
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "StrongPass1",
            "full_name": "New Teacher",
            "role": "teacher",
            "teacher_profile": {"institution": "Test School", "department": "Science"},
        },
    )
    if response.status_code == 409:
        tokens = login(client, {"email": email, "password": "StrongPass1", "role": "teacher"})
    else:
        assert response.status_code == 201, response.text
        tokens = response.json()
    me = client.get("/api/auth/me", headers=auth_headers(tokens))
    assert me.status_code == 200
    assert me.json()["teacher_profile"]["institution"] == "Test School"

    refreshed = client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["user"]["email"] == email

    logout = client.post("/api/auth/logout", headers=auth_headers(tokens))
    assert logout.status_code == 200
    stale = client.get("/api/auth/me", headers=auth_headers(tokens))
    assert stale.status_code == 401
    stale_refresh = client.post(
        "/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert stale_refresh.status_code == 401


def test_register_validation(client: TestClient) -> None:
    weak = client.post(
        "/api/auth/register",
        json={
            "email": "weak@example.com",
            "password": "weakpassword",
            "full_name": "Weak Password",
            "role": "student",
        },
    )
    assert weak.status_code == 422
    bad_email = client.post(
        "/api/auth/register",
        json={
            "email": "not-an-email",
            "password": "StrongPass1",
            "full_name": "Bad Email",
            "role": "student",
        },
    )
    assert bad_email.status_code == 422


def test_student_registration_and_login(client: TestClient) -> None:
    email = "new.student@example.com"
    payload = {
        "email": email,
        "password": "StrongPass1",
        "full_name": "New Student",
        "role": "student",
        "student_profile": {"school": "Test School", "grade_level": "Grade 10"},
    }

    response = client.post("/api/auth/register", json=payload)

    assert response.status_code == 201, response.text
    user = response.json()["user"]
    assert user["role"] == "student"
    assert user["student_profile"]["school"] == "Test School"
    assert user["preferences"]["learning_mode"] == "normal"
    assert "password" not in user
    assert "password_hash" not in user

    duplicate = client.post(
        "/api/auth/register",
        json={**payload, "email": email.upper()},
    )
    assert duplicate.status_code == 409

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": payload["password"], "role": "student"},
    )
    assert login_response.status_code == 200, login_response.text
    assert login_response.json()["user"]["email"] == email


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {
            "email": "missing-password@example.com",
            "full_name": "Missing Password",
            "role": "student",
        },
        {
            "email": "not-an-email",
            "password": "StrongPass1",
            "full_name": "Bad Email",
            "role": "student",
        },
        {
            "email": "weak-password@example.com",
            "password": "weakpassword",
            "full_name": "Weak Password",
            "role": "student",
        },
        {
            "email": "invalid-role@example.com",
            "password": "StrongPass1",
            "full_name": "Invalid Role",
            "role": "admin",
        },
    ],
)
def test_registration_rejects_invalid_payloads(client: TestClient, payload: dict) -> None:
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422
