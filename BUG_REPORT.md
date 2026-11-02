# SignBridge — Bug Report

**Date:** 2026-11-02  
**Baseline commit:** `d5c7e4f`
**Verification:** backend `73 passed`; frontend `31 passed`; production build `exit 0` (after fixes)

Severity uses: **Critical** (security/data loss/complete breakage), **High** (major feature broken),
**Medium** (degraded UX/latent failure), **Low** (documentation/minor).

---

## 1. Fixed in this audit

| ID | Severity | Area | Defect | Evidence | Fix / regression |
|---|---|---|---|---|---|
| BUG-001 | High | Documentation | `README.md` contained unresolved Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) and two competing titles, leaving setup instructions ambiguous. | `README.md` at baseline commit | Replaced with a single accurate README; removed stale lockfile warning and updated test counts. |
| BUG-002 | High | API contract / accessibility | Sign-practice response silently dropped `verified`, `review_status`, and `verified_coverage` because the Pydantic response schemas did not declare them. The UI therefore always showed 0 % reviewed and labelled every available sign "Experimental". | `backend/app/schemas/accessibility.py`; `backend/app/services/live_service.py`; `frontend/src/pages/PortalPages.jsx` | Added fields to `SignGlossOut`/`SignConvertOut`; propagated `verified_coverage` in `build_signs()` normal and fallback paths. |
| BUG-003 | Medium | Backend serializer | `classroom_student_out()` passed `lecture_minutes=` to `ClassroomStudentOut`, which expects `minutes_attended`, causing a latent Pydantic validation error for any caller. | `backend/app/services/serializers.py:95`; `backend/app/schemas/classroom.py:57` | Corrected kwarg and added a direct serializer test. |
| BUG-013 | Medium | WebSocket protocol / ID state | Live media-state frames from the frontend used `audio_enabled`/`video_enabled`, while the backend read only `audio`/`video` (with a secondary `microphone_enabled`/`camera_enabled` path). Participant media badges could therefore stay stale even though IDs and room state were correct. | `backend/app/api/websocket.py`; `frontend/src/pages/LiveClassroom.jsx` | Backend now accepts all three field spellings; regression coverage added to `backend/tests/test_websocket.py`. |

**Regression coverage:** `backend/tests/test_sign_response_contract.py` (3 tests) covers the sign
metadata contract, unsupported-language fallback, and the serializer field name.
`backend/tests/test_material_associations.py` (7 tests) covers material `classroom_id`/`teacher_id`
derivation, authorized downloads and headers, enrollment-scoped access, cross-teacher isolation,
missing files, large-file contents, deletion, and invalid IDs.
`backend/tests/test_id_relationships.py` (3 tests) covers `users.id` vs `student_profiles.id`,
enrollment/attendance/roster IDs, preference linkage, and the `student_id` used by removal.

---

## 2. Open issues and risks (not fixed)

| ID | Severity | Area | Issue | Impact / recommended action |
|---|---|---|---|---|
| BUG-004 | High (operational) | Database migration | The original bundled SQLite database had the current application tables but an empty `alembic_version`, so `alembic upgrade head` would try to recreate existing tables. The updated handover copy has been schema-compared against ORM metadata (no differences), checked for SQLite integrity and foreign-key violations, then stamped to `20261101_join_requests` without changing application rows. | A guarded SQLite adoption helper now backs up and checks existing unversioned databases before stamping. Never stamp a different configured/production database unless the schema comparison is clean; for drift, create a reviewed forward migration. See `DEPLOYMENT_GUIDE.md`. |
| BUG-005 | High (operational) | Production storage | Recordings and materials are written to the local filesystem (`STORAGE_ROOT`). Serverless/ephemeral hosts will lose files on restart/redeploy. | Mount a persistent volume or add an object-storage adapter before production. |
| BUG-006 | Medium | Notifications | `/ws/notifications` uses a process-local in-memory hub. Events published on one Uvicorn worker/replica are not delivered to subscribers on another. | Use one worker for demos; add shared pub/sub (e.g. Redis) and cross-worker tests before scaling out. REST remains the source of truth. |
| BUG-007 | Medium | Rate limiting | Login/register limiting is in-process memory. Uploads, translation, WebSocket connects, and multi-worker deployments are not covered. | Add a shared limiter or reverse-proxy limits; reset/restart currently clears counters. |
| BUG-008 | Medium | Upload security | Validation is extension + size based; no magic-byte/content inspection or antivirus scanning. Download MIME is safely derived from the extension, but stored files remain untrusted. | Add content sniffing and malware scanning for materials before allowing untrusted public uploads. |
| BUG-009 | Medium | TURN credentials | Only static `VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL` values are supported; `VITE_*` is public in the built bundle. | For production, mint short-lived coturn credentials from the backend (not implemented). |
| BUG-010 | Medium | Frontend token storage | Access/refresh tokens are kept client-side and read by JavaScript; an XSS flaw would expose them. | Add a strict CSP, keep dependencies patched, consider httpOnly refresh cookies. Documented, not a regression. |
| BUG-011 | Low | Documentation drift | `docs/FEATURE_STATUS.md`, `docs/TEST_REPORT.md`, `PROJECT_PROGRESS.md` (historical phases), and `NEXT_CLAUDE_PROMPT.md` cite older counts (43 backend / 25 frontend, and 20 in one place). | Historical evidence is retained; root `TEST_REPORT.md` and `PROJECT_PROGRESS.md` are authoritative for this commit. |
| BUG-012 | Low | MediaPipe version note | Default WASM CDN URL may not match the pinned `@mediapipe/tasks-vision@1.2.0`; self-hosting guidance exists but was not validated. | Verify the WASM/model pair when enabling hand tracking in a browser. |
| BUG-014 | Low | ID naming | `StudentPreference.student_id` is a foreign key to `student_profiles.id`, while every other `student_id` in the schema refers to `users.id`. Current auth, seed, dashboard, preference, and live-service code all map through `student_profile.id`, so no runtime confusion was found. | Documented as intentional. Do not rename without a migration, data backfill, and compatibility plan. |
| BUG-015 | Medium | ID collision hazard | Profile IDs and user IDs come from separate autoincrement sequences and can collide numerically, so a missing join could silently return another user's row. Current endpoints consistently use `users.id` for enrollment, attendance, rosters, and join requests; the new ID tests pin this contract. | Keep `ClassroomStudentOut.id`/`TeacherStudentOut.id` as user IDs, document the distinction, and never substitute `student_profile.id` for a user-facing `student_id`. |
| BUG-016 | Medium | Production schema safety | Production mode previously allowed `AUTO_CREATE_TABLES=true`, causing `Base.metadata.create_all()` to run during startup rather than requiring explicitly reviewed schema management. | `backend/app/core/config.py` now fails startup when production uses automatic table creation; `backend/tests/test_production_config.py` covers rejection and the safe configuration. No migrations run automatically. |
| BUG-018 | High (operational) | Production schema safety | The sign-language seeder independently called `Base.metadata.create_all()`, bypassing the `AUTO_CREATE_TABLES=false` production startup guard and potentially creating missing ORM tables. | Removed the call from `backend/app/sign_language/seed.py`; schema creation is only performed by the explicit database initialization path. A regression test verifies the seeder does not create schema. |
| BUG-019 | Low | WebSocket lifecycle/logging | A client disconnecting before first-message WebSocket authentication was caught, then the server attempted to send an auth-close frame to the disconnected peer, resulting in an ASGI exception log. | Both classroom and notification sockets return on early `WebSocketDisconnect`; intentional close frames tolerate a concurrent disconnect. Two regression cases pass. |
| BUG-020 | Medium | Deployment documentation | The frontend example set `VITE_API_URL` to an origin ending in `/api`, while `frontend/src/api/config.js` appends `/api` itself, producing a duplicated API path. | Corrected the example to use the origin only and documented the source behavior in `DEPLOYMENT_GUIDE.md`. |

---

## 3. Confirmed deployment issue (external configuration; not changed)

| ID | Severity | Area | Issue | Evidence / action |
|---|---|---|---|---|
| BUG-017 | High (operational) | Render environment | On 2026-11-02, `/api/health` and `/health` returned HTTP 200 but reported `environment=development` and `database.dialect=sqlite`. `/` returned 404 as no root route exists; an earlier 503 was not reproduced. This is not a production configuration. | The Render dashboard is not accessible from this workspace and no deployment manifest exists. Configure/verify Render using the exact checklist in `DEPLOYMENT_GUIDE.md`; select a production database and persistent storage only after a reviewed migration plan. No external configuration or database was changed. |

The health response also reported translation `auto` / `mymemory`, with zero verified and 100
experimental ISL entries. It does not disclose whether demo seeding is disabled or whether the
SQLite file is persistent. Treat the live service as a prototype and do not enter real student data.

---

## 4. Unverified features (not bugs, but do not claim them as working)

These are **NOT RUN** or **BLOCKED**, not confirmed defects:

- Browser login / refresh / logout and role-based navigation.
- Browser-saved material file (API response, headers/body, and frontend Blob/anchor initiation
  verified; browser download event/file-save result remains unverified).
- Camera, microphone, remote video/audio playback, multi-peer mesh, screen share.
- TURN relay traversal and network-loss recovery.
- Real `MediaRecorder` output, camera→screen-share recording, playback, A/V sync, caption timing.
- Browser Web Speech captions and server-side Whisper transcription.
- Real translation provider output and language-pair accuracy.
- Three.js avatar rendering, MediaPipe hand tracking, Hearing/Deaf layouts, reduced motion,
  screen-reader/keyboard acceptance.
- Qualified ISL correctness (all 100 entries remain experimental).
- Existing configured/production database migration.
- Cross-worker notification delivery.
- Docker-based validation.
- Live PostgreSQL integration (driver and URL support implemented; no disposable PostgreSQL server).

---

## 5. How the fixes were verified

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
# 73 passed, 1 third-party warning in pytest summary (plus the pytest-asyncio deprecation notice)

cd ..\frontend
npm test
# 31 passed, 0 failed

npm run build
# exit 0 — 2,293 modules transformed, built in ~73 s
```

Python compilation and `git diff --check` also passed. No configured database was modified, no
migration was applied, and no deployment occurred. The Render probe was read-only. The isolated
browser workflow partially verified teacher/student auth, classroom approval, listing, and upload.
The isolated download response returned HTTP 200 with expected headers/body, and frontend Blob/anchor
initiation was observed; the browser-saved file remains unverified. PostgreSQL offline Alembic
compilation passed; live PostgreSQL integration did not run.
