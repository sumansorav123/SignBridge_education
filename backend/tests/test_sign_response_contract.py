"""Regression tests for the sign-practice response contract and serializer fields."""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import ClassroomEnrollment
from app.services.live_service import build_signs
from app.services.serializers import classroom_student_out
from tests.conftest import auth_headers


def test_sign_convert_includes_verification_metadata(
    client: TestClient, deaf_student: dict
) -> None:
    response = client.post(
        "/api/accessibility/sign-language/convert",
        headers=auth_headers(deaf_student),
        json={"text": "hello zzyzx", "language": "isl"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    assert "verified_coverage" in payload
    assert isinstance(payload["verified_coverage"], float)
    assert 0.0 <= payload["verified_coverage"] <= 1.0
    assert payload["glosses"], "expected at least one gloss"

    for gloss in payload["glosses"]:
        assert "verified" in gloss
        assert gloss["verified"] is False
        assert gloss["review_status"] in {"experimental", "unsupported"}


def test_build_signs_unsupported_language_reports_zero_verified_coverage() -> None:
    result = build_signs("hello", "not-a-language")
    assert result["supported"] is False
    assert result["verified_coverage"] == 0
    assert result["has_fallback"] is True


def test_classroom_student_serializer_uses_minutes_attended() -> None:
    with SessionLocal() as db:
        enrollment = db.scalar(select(ClassroomEnrollment).limit(1))
        assert enrollment is not None, "demo seed should create at least one enrollment"
        output = classroom_student_out(
            db, enrollment, attended_lectures=3, minutes_attended=42
        )

    assert output.attended_lectures == 3
    assert output.minutes_attended == 42
