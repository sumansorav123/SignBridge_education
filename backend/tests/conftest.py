from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="signbridge-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-with-enough-length-1234567890")
os.environ.setdefault("SEED_DEMO_DATA", "true")
os.environ.setdefault("TRANSLATION_PROVIDER", "none")
os.environ["STORAGE_ROOT"] = str(_TMP / "storage")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

TEACHER = {"email": "teacher@signbridge.app", "password": "Learn@12345", "role": "teacher"}
DEAF_STUDENT = {
    "email": "aarav.deaf@signbridge.app",
    "password": "Learn@12345",
    "role": "student",
}
HEARING_STUDENT = {
    "email": "priya.hearing@signbridge.app",
    "password": "Learn@12345",
    "role": "student",
}


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient, credentials: dict) -> dict:
    response = client.post("/api/auth/login", json=credentials)
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest.fixture(scope="session")
def teacher(client: TestClient) -> dict:
    return login(client, TEACHER)


@pytest.fixture(scope="session")
def deaf_student(client: TestClient) -> dict:
    return login(client, DEAF_STUDENT)


@pytest.fixture(scope="session")
def hearing_student(client: TestClient) -> dict:
    return login(client, HEARING_STUDENT)
