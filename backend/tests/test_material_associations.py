from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database.session import SessionLocal
from app.models import Classroom, UploadedMaterial
from app.services.storage import resolve_storage_key
from tests.conftest import auth_headers, login

OTHER_TEACHER = {
    "email": "materials.other.teacher@example.com",
    "password": "StrongPass1",
    "full_name": "Other Teacher",
    "role": "teacher",
}


def _seed_classroom_id(client: TestClient, teacher: dict, join_code: str = "SCI10A") -> int:
    headers = auth_headers(teacher)
    response = client.get("/api/teacher/classrooms", headers=headers)
    assert response.status_code == 200, response.text
    for classroom in response.json():
        if classroom["join_code"] == join_code:
            return classroom["id"]
    raise AssertionError(f"Seed classroom {join_code} not found")


def _upload_material(
    client: TestClient,
    teacher: dict,
    classroom_id: int,
    title: str,
    *,
    extra_form: dict | None = None,
    content: bytes = b"material payload",
    filename: str = "notes.txt",
):
    data = {
        "classroom_id": str(classroom_id),
        "title": title,
        "description": "Regression material",
    }
    if extra_form:
        data.update(extra_form)
    return client.post(
        "/api/materials",
        headers=auth_headers(teacher),
        data=data,
        files={"file": (filename, content, "text/plain")},
    )


def _register_other_teacher(client: TestClient) -> dict:
    created = client.post("/api/auth/register", json=OTHER_TEACHER)
    if created.status_code == 409:
        return login(client, {"email": OTHER_TEACHER["email"], "password": OTHER_TEACHER["password"]})
    assert created.status_code == 201, created.text
    return created.json()


def test_material_upload_derives_classroom_and_teacher_from_context(
    client: TestClient, teacher: dict
) -> None:
    classroom_id = _seed_classroom_id(client, teacher)
    teacher_id = teacher["user"]["id"]

    response = _upload_material(
        client,
        teacher,
        classroom_id,
        "Upload association regression",
        # A client-supplied teacher_id must never override the authenticated user.
        extra_form={"teacher_id": "999999"},
    )
    assert response.status_code == 201, response.text
    material = response.json()

    assert material["id"] > 0
    assert material["classroom_id"] == classroom_id
    assert material["teacher_id"] == teacher_id
    assert material["teacher_id"] != 999999
    assert material["classroom_name"] == "Grade 10 Science"
    assert material["teacher_name"] == teacher["user"]["full_name"]

    with SessionLocal() as db:
        row = db.get(UploadedMaterial, material["id"])
        assert row is not None
        assert row.classroom_id == classroom_id
        assert row.teacher_id == teacher_id
        assert row.classroom.teacher_id == teacher_id


def test_material_listing_and_download_follow_enrollment(
    client: TestClient, teacher: dict, deaf_student: dict, hearing_student: dict
) -> None:
    science_id = _seed_classroom_id(client, teacher, "SCI10A")
    maths_id = _seed_classroom_id(client, teacher, "MATH10")

    science = _upload_material(client, teacher, science_id, "Science handout", content=b"science")
    maths = _upload_material(client, teacher, maths_id, "Maths handout", content=b"maths")
    assert science.status_code == 201, science.text
    assert maths.status_code == 201, maths.text
    science_material = science.json()
    maths_material = maths.json()

    deaf_headers = auth_headers(deaf_student)
    listed = client.get("/api/materials", headers=deaf_headers)
    assert listed.status_code == 200, listed.text
    listed_ids = {item["id"] for item in listed.json()}
    assert science_material["id"] in listed_ids
    assert maths_material["id"] not in listed_ids

    filtered = client.get(
        f"/api/materials?classroom_id={science_id}", headers=deaf_headers
    )
    assert filtered.status_code == 200
    filtered_ids = {item["id"] for item in filtered.json()}
    assert science_material["id"] in filtered_ids
    assert maths_material["id"] not in filtered_ids

    denied_list = client.get(f"/api/materials?classroom_id={maths_id}", headers=deaf_headers)
    assert denied_list.status_code == 403

    allowed_download = client.get(
        f"/api/materials/{science_material['id']}/download", headers=deaf_headers
    )
    assert allowed_download.status_code == 200, allowed_download.text
    assert allowed_download.content == b"science"
    assert allowed_download.headers["content-type"] == "text/plain; charset=utf-8"
    assert allowed_download.headers["content-disposition"] == 'attachment; filename="notes.txt"'
    assert allowed_download.headers["cache-control"] == "private, no-store"

    denied_download = client.get(
        f"/api/materials/{maths_material['id']}/download", headers=deaf_headers
    )
    assert denied_download.status_code == 403

    hearing_headers = auth_headers(hearing_student)
    hearing_download = client.get(
        f"/api/materials/{maths_material['id']}/download", headers=hearing_headers
    )
    assert hearing_download.status_code == 200, hearing_download.text
    assert hearing_download.content == b"maths"
    assert hearing_download.headers["content-type"] == "text/plain; charset=utf-8"
    assert hearing_download.headers["content-disposition"] == 'attachment; filename="notes.txt"'

    teacher_filtered = client.get(
        f"/api/materials?classroom_id={science_id}", headers=auth_headers(teacher)
    )
    assert teacher_filtered.status_code == 200
    teacher_ids = {item["id"] for item in teacher_filtered.json()}
    assert science_material["id"] in teacher_ids
    assert maths_material["id"] not in teacher_ids

    student_upload = _upload_material(client, deaf_student, science_id, "Student upload")
    assert student_upload.status_code == 403


def test_material_cross_teacher_isolation_and_delete(
    client: TestClient, teacher: dict, deaf_student: dict
) -> None:
    classroom_id = _seed_classroom_id(client, teacher)
    uploaded = _upload_material(client, teacher, classroom_id, "Owner-only material")
    assert uploaded.status_code == 201, uploaded.text
    material_id = uploaded.json()["id"]

    other_teacher = _register_other_teacher(client)
    other_headers = auth_headers(other_teacher)

    other_list = client.get("/api/materials", headers=other_headers)
    assert other_list.status_code == 200
    assert all(item["teacher_id"] == other_teacher["user"]["id"] for item in other_list.json())
    assert material_id not in {item["id"] for item in other_list.json()}

    assert (
        client.get(f"/api/materials/{material_id}/download", headers=other_headers).status_code
        == 403
    )
    assert client.delete(f"/api/materials/{material_id}", headers=other_headers).status_code == 404
    assert (
        _upload_material(client, other_teacher, classroom_id, "Foreign classroom upload").status_code
        == 404
    )

    assert (
        client.delete(f"/api/materials/{material_id}", headers=auth_headers(deaf_student)).status_code
        == 403
    )

    deleted = client.delete(f"/api/materials/{material_id}", headers=auth_headers(teacher))
    assert deleted.status_code == 200, deleted.text
    assert (
        client.get(f"/api/materials/{material_id}/download", headers=auth_headers(teacher)).status_code
        == 404
    )
    with SessionLocal() as db:
        assert db.get(UploadedMaterial, material_id) is None


def test_material_invalid_ids_are_rejected(client: TestClient, teacher: dict) -> None:
    headers = auth_headers(teacher)
    assert client.get("/api/materials/999999/download", headers=headers).status_code == 404
    assert (
        _upload_material(client, teacher, 999999, "Missing classroom").status_code == 404
    )

    invalid = client.post(
        "/api/materials",
        headers=headers,
        data={"classroom_id": "not-an-id", "title": "Invalid classroom id"},
        files={"file": ("notes.txt", b"payload", "text/plain")},
    )
    assert invalid.status_code == 422


def test_teacher_can_download_owned_material_with_expected_headers(
    client: TestClient, teacher: dict
) -> None:
    classroom_id = _seed_classroom_id(client, teacher)
    content = b"owned classroom material"
    uploaded = _upload_material(client, teacher, classroom_id, "Teacher download", content=content)
    assert uploaded.status_code == 201, uploaded.text

    response = client.get(
        f"/api/materials/{uploaded.json()['id']}/download",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    assert response.content == content
    assert response.headers["content-type"] == "text/plain; charset=utf-8"
    assert response.headers["content-disposition"] == 'attachment; filename="notes.txt"'
    assert response.headers["cache-control"] == "private, no-store"


def test_material_download_reports_missing_physical_file(
    client: TestClient, teacher: dict
) -> None:
    classroom_id = _seed_classroom_id(client, teacher)
    uploaded = _upload_material(client, teacher, classroom_id, "Missing file regression")
    assert uploaded.status_code == 201, uploaded.text
    material = uploaded.json()
    with SessionLocal() as db:
        row = db.get(UploadedMaterial, material["id"])
        assert row is not None
        resolve_storage_key(row.storage_key).unlink()

    response = client.get(
        f"/api/materials/{material['id']}/download",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Material file is unavailable."


def test_material_download_streams_large_file_contents(
    client: TestClient, teacher: dict
) -> None:
    classroom_id = _seed_classroom_id(client, teacher)
    content = b"x" * (2 * 1024 * 1024 + 17)
    uploaded = _upload_material(
        client,
        teacher,
        classroom_id,
        "Large download regression",
        content=content,
    )
    assert uploaded.status_code == 201, uploaded.text

    response = client.get(
        f"/api/materials/{uploaded.json()['id']}/download",
        headers=auth_headers(teacher),
    )

    assert response.status_code == 200
    assert len(response.content) == len(content)
    assert response.content == content
