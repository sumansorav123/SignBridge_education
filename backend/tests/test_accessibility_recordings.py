from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app.core.config import settings
from app.database.session import SessionLocal
from app.models import Recording
from tests.conftest import auth_headers, login


def test_language_and_translation_status(client: TestClient, deaf_student: dict) -> None:
    headers = auth_headers(deaf_student)
    languages = client.get("/api/accessibility/translation/languages", headers=headers)
    assert languages.status_code == 200
    payload = languages.json()
    codes = {item["code"] for item in payload["languages"]}
    assert {"en", "hi", "ta", "te", "bn", "ml", "kn", "mr", "gu", "pa", "fr", "es"} <= codes
    assert payload["available"] is False
    assert payload["configured_provider"] == "none"

    legacy = client.get("/api/translation/languages", headers=headers)
    assert legacy.status_code == 200
    legacy_languages = legacy.json()["languages"]
    assert len(legacy_languages) == 13
    assert "as" in {item["code"] for item in legacy_languages}


def test_translation_failure_is_honest(client: TestClient, deaf_student: dict) -> None:
    response = client.post(
        "/api/accessibility/translation/translate",
        headers=auth_headers(deaf_student),
        json={"text": "Good morning", "source_language": "en", "target_language": "hi"},
    )
    assert response.status_code == 200
    item = response.json()["results"][0]
    assert item["translated"] is False
    assert item["translated_text"] == "Good morning"
    assert item["provider"] == "unavailable"
    assert item["error"]
    assert response.json()["available"] is False


def test_same_language_translation_is_identity(client: TestClient, deaf_student: dict) -> None:
    response = client.post(
        "/api/accessibility/translation/translate",
        headers=auth_headers(deaf_student),
        json={"text": "Hello there", "source_language": "en", "target_language": "en"},
    )
    assert response.status_code == 200
    item = response.json()["results"][0]
    assert item["translated"] is True
    assert item["translated_text"] == "Hello there"


def test_sign_language_conversion(client: TestClient, deaf_student: dict) -> None:
    headers = auth_headers(deaf_student)
    response = client.post(
        "/api/accessibility/sign-language/convert",
        headers=headers,
        json={"text": "Good morning students, how are you?", "language": "isl"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["language"] == "isl"
    assert payload["source_text"].startswith("Good morning")
    glosses = [item["gloss"] for item in payload["glosses"]]
    assert "GOOD-MORNING" in glosses
    assert "HOW-ARE-YOU" in glosses
    assert payload["coverage"] > 0
    assert payload["grammar_note"]
    assert payload["catalog_note"]

    fallback = client.post(
        "/api/accessibility/sign-language/convert",
        headers=headers,
        json={"text": "Quantum chromodynamics", "language": "isl"},
    )
    assert fallback.status_code == 200
    body = fallback.json()
    assert body["has_fallback"] is True
    assert body["unsupported"]
    assert body["fallback_message"]

    unsupported = client.post(
        "/api/accessibility/sign-language/convert",
        headers=headers,
        json={"text": "Hello", "language": "asl"},
    )
    assert unsupported.status_code == 422


def test_sign_animation_catalog(client: TestClient, deaf_student: dict) -> None:
    headers = auth_headers(deaf_student)
    response = client.get(
        "/api/accessibility/sign-language/animations?language=isl", headers=headers
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_count"] == 100
    # No sign has interpreter-review evidence, so none may be reported verified.
    assert payload["verified_count"] == 0
    sample = payload["animations"][0]
    assert sample["animation_data"]["hands"][0]["handshape"]
    assert sample["is_verified"] is False


def test_speech_status_is_explicit(client: TestClient, deaf_student: dict) -> None:
    response = client.get("/api/accessibility/speech/status", headers=auth_headers(deaf_student))
    assert response.status_code == 200
    payload = response.json()
    assert payload["browser_webspeech"] is True
    assert payload["server_available"] is False
    assert "OPENAI_API_KEY" in payload["note"] or "faster-whisper" in payload["note"]


def _create_recording() -> int:
    settings.recordings_path.mkdir(parents=True, exist_ok=True)
    name = f"test-{uuid.uuid4().hex}.webm"
    path = settings.recordings_path / name
    path.write_bytes(b"fake-webm-data-for-tests")
    with SessionLocal() as db:
        recording = Recording(
            lecture_id=1,
            classroom_id=1,
            teacher_id=1,
            title="Photosynthesis test recording",
            storage_key=f"recordings/{name}",
            original_filename=name,
            mime_type="video/webm",
            size_bytes=path.stat().st_size,
            duration_seconds=60,
            transcript_language="en",
            status="ready",
        )
        db.add(recording)
        db.commit()
        db.refresh(recording)
        recording_id = recording.id
    return recording_id


def test_recording_access_and_stream(client: TestClient, teacher: dict, deaf_student: dict) -> None:
    recording_id = _create_recording()
    teacher_headers = auth_headers(teacher)
    student_headers = auth_headers(deaf_student)

    detail = client.get(f"/api/recordings/{recording_id}", headers=student_headers)
    assert detail.status_code == 200
    assert detail.json()["transcript"]
    assert detail.json()["has_video"] is True

    token_response = client.post(
        f"/api/recordings/{recording_id}/playback-token", headers=student_headers
    )
    assert token_response.status_code == 200
    token = token_response.json()["token"]
    stream = client.get(f"/api/recordings/{recording_id}/stream?token={token}")
    assert stream.status_code == 200
    assert stream.content == b"fake-webm-data-for-tests"

    transcript = client.get(
        f"/api/recordings/{recording_id}/transcript?language=hi&translate=true",
        headers=student_headers,
    )
    assert transcript.status_code == 200
    payload = transcript.json()
    assert payload["translated_count"] == 0
    assert payload["provider"] is None
    assert payload["subtitles"]

    outsider = client.post(
        "/api/auth/register",
        json={
            "email": "outsider@example.com",
            "password": "StrongPass1",
            "full_name": "Outside Student",
            "role": "student",
        },
    )
    if outsider.status_code == 409:
        outside = login(client, {"email": "outsider@example.com", "password": "StrongPass1"})
    else:
        assert outsider.status_code == 201
        outside = outsider.json()
    denied = client.get(
        f"/api/recordings/{recording_id}", headers=auth_headers(outside)
    )
    assert denied.status_code == 403
    denied_token = client.post(
        f"/api/recordings/{recording_id}/playback-token", headers=auth_headers(outside)
    )
    assert denied_token.status_code == 403

    bad_token = client.get(f"/api/recordings/{recording_id}/stream?token=not-a-token")
    assert bad_token.status_code == 401

    # Teacher owns the recording and can delete it, which also removes the file.
    deleted = client.delete(f"/api/recordings/{recording_id}", headers=teacher_headers)
    assert deleted.status_code == 200


def test_teacher_subtitles_for_lecture(client: TestClient, teacher: dict) -> None:
    response = client.get(
        "/api/teacher/lectures/1/subtitles?language=en", headers=auth_headers(teacher)
    )
    assert response.status_code == 200
    assert len(response.json()) >= 10
