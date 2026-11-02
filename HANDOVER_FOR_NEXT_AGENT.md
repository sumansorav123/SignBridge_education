# SignBridge — Handover for the Next Agent

**Date:** 2026-11-02  
**Repository:** `C:\Users\Hello\Downloads\SignBridge_Final_Handover\SignBridge`  
**Commit inspected:** `d5c7e4f` (`Complete Phase 13 API and WebSocket fixes`); current changes remain
uncommitted.  
**Verified:** backend **73 passed**; frontend **31 passed**; production build **exit 0**;
Python compilation and `git diff --check` **passed**. PostgreSQL offline Alembic SQL compilation
passed, but no live PostgreSQL server was available.

Read [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md), [`BUG_REPORT.md`](BUG_REPORT.md),
[`TEST_REPORT.md`](TEST_REPORT.md), [`ID_AUDIT_REPORT.md`](ID_AUDIT_REPORT.md), and
[`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) before changing anything. Root documents are
authoritative over historical phase notes and `docs/FEATURE_STATUS.md`.

---

## 1. What changed most recently

1. Fixed the sign-practice API contract: `verified`, `review_status`, and `verified_coverage` now
   survive Pydantic serialization, including the unsupported-language fallback.
2. Fixed `classroom_student_out()` to pass `minutes_attended` instead of `lecture_minutes`.
3. Fixed WebSocket media-state compatibility: the backend accepts `audio_enabled`/`video_enabled`
   as well as `audio`/`video` and `microphone_enabled`/`camera_enabled`.
4. Completed the four-ID audit (`student_id`, `classroom_id`, `teacher_id`, `material_id`) with no
   confirmed relationship defect. Added 7 regression tests across two new files.
5. Re-ran the runtime API suite and found the live Render API reports `development` + SQLite.
6. Added a production startup guard for `AUTO_CREATE_TABLES=true` and two configuration tests.
7. Refreshed the deployment guide with an exact Render/Vercel checklist; no remote settings changed.
8. Removed the sign-language seeder's hidden `Base.metadata.create_all()` bypass and added
   regression coverage; production startup has no seeder-driven schema creation path.
9. Fixed expected early WebSocket disconnect handling on classroom and notification sockets; two
   regression cases pass.
10. Re-probed Render: `/api/health` and `/health` return 200 with development + SQLite; `/` returns
    expected 404 because no root route exists. The earlier 503 was not reproduced.
11. Ran an isolated browser workflow: teacher/student register/login, classroom create/join/approve,
    student entry, materials listing and upload succeeded. A fresh material request returned HTTP
    200 with correct headers and 45 bytes; frontend Blob/anchor initiation was observed. The
    browser did not emit a download event, so the final saved file remains unverified.
12. Added the psycopg driver and PostgreSQL URL normalization; generated the full Alembic migration
    chain as PostgreSQL SQL offline. Live PostgreSQL integration remains unverified.
13. Added material regressions for teacher and enrolled-student download, authorization denials,
    invalid IDs, missing files, headers and complete large-file contents.

Changed/new files for the latest work:

- `backend/tests/test_material_associations.py` (7 tests)
- `backend/tests/test_id_relationships.py` (new, 3 tests)
- `backend/tests/test_production_config.py` (3 tests)
- `backend/tests/test_websocket.py` (2 new early-disconnect cases)
- `BUG_REPORT.md`, `TEST_REPORT.md`, `PROJECT_AUDIT.md`, `PROJECT_PROGRESS.md`, `README.md`
- `ID_AUDIT_REPORT.md`, `DEPLOYMENT_GUIDE.md`, `HANDOVER_FOR_NEXT_AGENT.md`
- `.env.example` (clarified `AUTO_CREATE_TABLES` guidance)
- `backend/app/core/config.py`, `backend/requirements.txt`,
  `backend/tests/test_production_config.py` (PostgreSQL URL/driver support and tests)
- `DEPLOYMENT_GUIDE.md` (PostgreSQL readiness and safe migration plan)

No backend ID relationship logic or auth/approval flow was changed. No configured database or
deployment was changed.

---

## 2. Current verified baseline

```powershell
# from repository root
cd backend
..\.venv\Scripts\python.exe -m pytest -q        # 73 passed

cd ..\frontend
npm test                                         # 31 passed
npm run build                                    # exit 0, 2,293 modules

# Python compilation
cd ..\backend
..\.venv\Scripts\python.exe -m compileall -q app tests
# git diff --check                               # passed
```

Tests create a disposable SQLite database and temp storage via `backend/tests/conftest.py`. They do
**not** touch `backend/signbridge.db` or any configured database.

---

## 3. ID semantics (do not confuse these)

| Field | Points to |
|---|---|
| `ClassroomEnrollment.student_id`, `ClassroomJoinRequest.student_id`, `LectureAttendance.student_id` | `users.id` |
| `Classroom.teacher_id`, `Lecture.teacher_id`, `Recording.teacher_id`, `UploadedMaterial.teacher_id` | `users.id` |
| `ClassroomStudentOut.id`, `TeacherStudentOut.id` | `users.id` |
| `UploadedMaterial.id` | material identity; its `classroom_id`/`teacher_id` are FKs |
| JWT `sub` | `users.id` |
| `StudentPreference.student_id` | **`student_profiles.id`** (the documented exception) |

`student_profiles.id` and `users.id` use separate sequences and can collide numerically. Never pass a
profile ID where a user ID is expected. See `ID_AUDIT_REPORT.md`.

Material upload derives `teacher_id` from the authenticated teacher and validates classroom
ownership; a client-supplied `teacher_id` is ignored. List/download/delete enforce enrollment or
ownership. Keep it that way.

---

## 4. Open risks / blocked work

| Item | Status |
|---|---|
| Isolated browser workflow | PARTIAL; auth, classroom flow, listing/upload passed; download HTTP 200, headers/body and Blob/anchor initiation observed, saved file unverified |
| Two-device WebRTC media, screen share, 3+ peers, reconnect | NOT RUN |
| TURN relay traversal | BLOCKED (no service/credentials) |
| Real recording/playback/A-V-caption sync | NOT RUN |
| Browser speech recognition / real translation providers | NOT RUN |
| Hearing/Deaf layouts, reduced motion, screen reader | NOT RUN |
| Qualified ISL review | BLOCKED; all 100 entries experimental, zero reviewed |
| Existing configured DB migration | BLOCKED; backup/clone/schema diff/forward plan required |
| Persistent production storage | NOT VERIFIED; backend uses local disk, Render volume/object-storage settings are inaccessible |
| Cross-worker notifications | BLOCKED; process-local hub |
| Docker validation | BLOCKED; Docker unavailable |
| Live Render API | HTTP 200 on `/api/health` and `/health`; development + SQLite. `/` is expected 404 because no root route exists; previous 503 not reproduced |
| Render/Vercel manifests or dashboard access | NOT AVAILABLE in this workspace |
| PostgreSQL URL/driver support | IMPLEMENTED and configuration-tested; URL normalization and dialect/driver load pass |
| PostgreSQL migration | OFFLINE SQL compilation passed; live connection/DDL/data integration not verified; do not change `DATABASE_URL` |
| Production deployment | BLOCKED pending environment, DB migration, persistent storage, TURN, and real acceptance |

Do not claim any of these as working without new evidence.

---

## 5. Hard constraints

- Do not delete/reset/stamp/upgrade a configured or production database. Use disposable data.
- Do not invent IDs, silently change relationships, or substitute profile IDs for user IDs.
- Do not weaken auth/approval/ownership checks.
- Do not commit `.env`, secrets, real user data, or production TURN credentials.
- Do not describe ISL animations as interpreter-verified.
- Do not push to GitHub or deploy without explicit owner approval.
- Keep documentation honest: mark verified vs. untested.

---

## 6. Recommended next steps

1. Verify the browser-saved material bytes using a desktop browser or a harness that captures Blob
   downloads, then verify refresh/logout and rejection states. Do not use shared or real accounts.
2. Test media on two real devices over trusted HTTPS/WSS; verify reconnect and cleanup.
3. Configure a test coturn service and confirm a relay candidate pair.
4. Record a real camera→screen-share session and verify playback and caption timing.
5. Exercise one real translation provider and browser speech recognition.
6. Back up, clone, diff, and rehearse a database migration before touching configured data.
7. Add shared pub/sub before running multiple workers.
8. Obtain qualified ISL review evidence before changing verification metadata.
9. Configure Render/Vercel using `DEPLOYMENT_GUIDE.md` after selecting a production database,
   persistent volume, and Vercel origin. Do not switch DBs, migrate, or deploy without explicit
   owner approval.
10. Before selecting PostgreSQL, run the disposable live PostgreSQL test/migration rehearsal and
    critical API workflows described in `DEPLOYMENT_GUIDE.md`; do not treat offline Alembic
    compilation as integration verification.

---

## 7. Useful commands

```powershell
# backend tests
cd backend
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m pytest tests/test_id_relationships.py -q

# frontend
cd ..\frontend
npm test
npm run build

# inspect the working tree
cd ..
git status --short
git diff --stat
```

Do not commit or push unless the owner asks.
