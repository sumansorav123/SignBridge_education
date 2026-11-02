# SignBridge — Backend ID Relationship Audit

**Audit date:** 2026-11-02  
**Commit inspected:** `d5c7e4f` (`main`); ID-audit tests and docs are uncommitted  
**Scope:** `student_id`, `classroom_id`, `teacher_id`, `material_id` across SQLAlchemy models,
Pydantic schemas, auth/JWT, routers, services, serializers, seed data, tests, and frontend usage.  
**Result:** **No confirmed ID relationship defect.** Two documented risks remain (naming ambiguity
and numeric collision hazard); no relationship or foreign key was changed.

---

## 1. Canonical ID semantics

| ID | Canonical owner | Notes |
|---|---|---|
| `users.id` | `User` | JWT subject (`sub`), auth identity, ownership checks, enrollment/attendance/join-request `student_id`, classroom/lecture/recording/material `teacher_id`. |
| `student_profiles.id` | `StudentProfile` | Profile-only entity. **Only** `StudentPreference.student_id` references this. Not a user-facing `student_id`. |
| `classrooms.id` | `Classroom` | `classroom_id` on enrollments, join requests, lectures, recordings, materials; classroom route/socket path parameter. |
| `uploaded_materials.id` | `UploadedMaterial` | Material identity exposed as `MaterialOut.id`; `classroom_id` and `teacher_id` are FKs on the same row. |

The frontend consistently sends snake_case IDs and coerces route/request IDs to positive integers.

---

## 2. Per-ID evidence

### 2.1 `student_id`

| Check | Evidence | Result |
|---|---|---|
| Enrollment FK | `backend/app/models/classroom.py:75-77` → `users.id` | Correct |
| Join-request FK | `backend/app/models/classroom.py:112-114` → `users.id` | Correct |
| Attendance FK | `backend/app/models/lecture.py:155-157` → `users.id` | Correct |
| Join request creation | `backend/app/api/student.py:106-125` uses `user.id` | Correct |
| WebSocket access + attendance | `backend/app/services/live_service.py:119-152`, `171-183`, `522-528` use `user.id` | Correct |
| Classroom roster output | `backend/app/services/serializers.py:77-96` and `backend/app/api/teacher.py:103-128` output `student.id` (`users.id`) | Correct |
| Student removal endpoint | `backend/app/api/teacher.py:300-316` matches `ClassroomEnrollment.student_id == student_id` (`users.id`) | Correct |
| Frontend join-notification matching | `frontend/src/pages/PortalPages.jsx:110`, `245` compare `request.student_id` to `user.id` | Correct |
| Preference FK | `backend/app/models/preferences.py:24-26` → `student_profiles.id` | **Naming ambiguity (BUG-014)** |
| Preference auth/seed/live mapping | `backend/app/api/auth.py:90-97`; `backend/app/seed.py:109-133`; `backend/app/services/live_service.py:53-93`; `backend/app/api/teacher.py:103-111` all map through `student_profile.id` | Consistent; no runtime confusion found |

**Risk (BUG-015):** `student_profiles.id` and `users.id` use separate autoincrement sequences, so
the numbers can collide. Passing a profile ID where a user ID is expected can therefore match a
different user instead of failing cleanly. Current code does not do this, and
`backend/tests/test_id_relationships.py` pins the contract.

### 2.2 `classroom_id`

| Check | Evidence | Result |
|---|---|---|
| Classroom PK | `backend/app/models/classroom.py:33` | Correct |
| Classroom owner | `backend/app/models/classroom.py:34-36` → `users.id` | Correct |
| Enrollment / join request / lecture / recording / material FKs | `classroom.py:72-77`, `109-111`; `lecture.py:35-37`, `120-122`; `material.py:20-22` | Correct |
| Teacher ownership check | `backend/app/services/access.py:26-30` (`get_owned_classroom`) | Correct |
| Student enrollment check | `backend/app/services/access.py:33-49`, `52-63` | Correct; filters `status == "active"` |
| Live-room access | `backend/app/services/live_service.py:146-152` | Correct |
| Material listing filter | `backend/app/api/materials.py:33-61` | Correct |
| WebSocket path → access check | `backend/app/api/websocket.py:698-736` passes path `classroom_id` and authenticated `user.id` | Correct |
| Frontend route/socket | `frontend/src/pages/LiveClassroom.jsx:47-52`, `156-165` validates a positive integer | Correct |

### 2.3 `teacher_id`

| Check | Evidence | Result |
|---|---|---|
| Classroom owner FK | `backend/app/models/classroom.py:34-36` → `users.id` | Correct |
| Lecture/recording/material owner FKs | `backend/app/models/lecture.py:38-40`, `123-125`; `backend/app/models/material.py:23-25` → `users.id` | Correct |
| JWT identity | `backend/app/api/auth.py:35-40` uses `user.id` as subject | Correct |
| Current-user resolution | `backend/app/api/deps.py:27-48` resolves JWT `sub` to `User.id` | Correct |
| Lecture ownership | `backend/app/api/recordings.py:89-91`; `backend/app/api/teacher.py:327-328` | Correct |
| Material upload | `backend/app/api/materials.py:89-98` derives `teacher_id=user.id`; a spoofed form field is ignored | Correct (tested) |
| Recording ownership | `backend/app/services/access.py:66-77` | Correct |
| Material ownership | `backend/app/services/access.py:80-91` | Correct |
| Frontend never supplies `teacher_id` | `frontend/src/api/resources.js:65-85` sends only classroom/material IDs | Correct |

### 2.4 `material_id`

| Check | Evidence | Result |
|---|---|---|
| Material PK | `backend/app/models/material.py:19` | Correct |
| Associations | `backend/app/models/material.py:20-25` (`classroom_id`, `teacher_id`) | Correct |
| Upload response | `backend/app/api/materials.py:89-107`; `backend/app/services/serializers.py:162-175` returns row `id` with both FKs | Correct |
| Listing authorization | `backend/app/api/materials.py:35-61` scopes teacher by `teacher_id`, student by active enrollments | Correct |
| Download authorization | `backend/app/api/materials.py:110-129`; `backend/app/services/access.py:80-91` | Correct |
| Delete authorization | `backend/app/api/materials.py:132-141` requires `material.teacher_id == user.id` | Correct |
| Frontend ID validation | `frontend/src/api/resources.js:1-10`, `65-85`; `frontend/src/components/classrooms/ClassroomMaterials.jsx` uses `material.id` | Correct |

---

## 3. Issues found

| ID | Severity | Status | Description |
|---|---|---|---|
| BUG-014 | Low | **Documented, not changed** | `StudentPreference.student_id` references `student_profiles.id`, unlike every other `student_id`. All current call sites map through the profile correctly. Renaming requires a migration and data backfill. |
| BUG-015 | Medium | **Documented, regression-tested** | Separate user/profile ID sequences can collide numerically. Tests now pin user-facing IDs to `users.id` and explicitly document the profile-ID exception. |

No record was deleted, no database was reset/migrated, and no auth/approval or relationship logic was
silently changed.

### Adjacent live-state fix (not an ID defect)

`BUG-013`: the frontend sent `audio_enabled`/`video_enabled` media-state fields while the backend
read `audio`/`video` (plus `microphone_enabled`/`camera_enabled`). The backend now accepts all three
spellings; `backend/tests/test_websocket.py` covers it. IDs and room membership were unaffected.

---

## 4. Files changed in this audit

| File | Change |
|---|---|
| `backend/tests/test_material_associations.py` | **New** — 4 tests: upload ownership derivation, enrollment-scoped list/download, cross-teacher isolation/delete, invalid IDs. |
| `backend/tests/test_id_relationships.py` | **New** — 3 tests: user-vs-profile ID semantics, enrollment/attendance/roster IDs, preference linkage, student removal by `users.id`. |
| `BUG_REPORT.md` | Added BUG-013/014/015, regression coverage, and refreshed counts. |
| `TEST_REPORT.md` | Refreshed to 57 backend tests and added ID/material rows. |
| `PROJECT_AUDIT.md` | Refreshed commit/counts and ID coverage summary. |
| `PROJECT_PROGRESS.md` | Added media-state fix and ID-audit status. |
| `ID_AUDIT_REPORT.md` | **New** — this report. |

No backend production code was changed for ID relationships during this audit.

---

## 5. Test evidence

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest tests/test_material_associations.py tests/test_id_relationships.py -q
# 7 passed

..\.venv\Scripts\python.exe -m pytest -q
# 63 passed (full suite after the production configuration guard was added)
```

Frontend and build baselines remain: `npm test` → **31 passed**; `npm run build` → **exit 0**.

The material tests prove that a spoofed `teacher_id` is ignored, classroom ownership is required on
upload, enrollment is required for student list/download, another teacher cannot list/download/
delete/upload, and deletion removes the row. The ID tests prove that enrollment, attendance, roster,
and removal use `users.id`, while `StudentPreference.student_id` remains a profile-ID reference.
