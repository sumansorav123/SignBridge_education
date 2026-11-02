# SignBridge — Test Report

**Date:** 2026-11-02  
**Commit inspected:** `d5c7e4f` (working tree includes this phase's fixes)
**Environment:** Windows, Python virtualenv at repository `.venv`, Node/npm available, disposable
SQLite test database and temp storage created by `backend/tests/conftest.py`. No production data,
network provider, camera, microphone, TURN service, or Docker was used.

---

## 1. Summary

| Layer | Command | Result |
|---|---|---|
| Backend regression suite | `cd backend && ..\.venv\Scripts\python.exe -m pytest -q` | **PASS — 73 passed**, 1 warning in pytest summary, 74.24 s |
| Focused material download + DB configuration | `pytest tests/test_material_associations.py tests/test_production_config.py -q` | **PASS — 14 passed** (separate focused run before the full suite) |
| Frontend unit tests | `cd frontend && npm test` | **PASS — 31 passed**, 0 failed, 3.86 s |
| Frontend production build | `cd frontend && npm run build` | **PASS — exit 0**, 2,293 modules, 93 s |
| Python compilation | `python -m compileall -q app tests` | **PASS**, exit 0 |
| PostgreSQL migration SQL generation | Alembic offline `upgrade head --sql` with PostgreSQL dialect | **PASS** — full three-revision SQL generated; no live PostgreSQL server/DDL executed |
| Live Render health probes | `GET /api/health`, `/health`, `/` | **200**, **200**, **404** respectively; read-only. Health reports development + SQLite. Root 404 is expected (no root route); earlier 503 was not reproduced. |
| Isolated browser workflow | Teacher/student auth, classroom approval, materials | **PARTIAL** — auth, create/join/approve/entry, listing and upload succeeded. Download API returned expected 200/headers/45 bytes and frontend Blob/anchor initiation was observed; browser-saved file remains unverified. |
| `git diff --check` | repository root | **PASS**, exit 0 |

Warnings observed:
- `pytest_asyncio` deprecation: `asyncio_default_fixture_loop_scope` unset.
- Starlette/httpx TestClient deprecation (`install httpx2`). Both are third-party warnings, not failures.

---

## 2. Backend tests (66)

| File | Tests | Coverage focus |
|---|---:|---|
| `tests/test_accessibility_recordings.py` | 8 | Translation status/fallback/identity, sign conversion, recording access and playback permissions |
| `tests/test_auth.py` | 12 | Registration/login/refresh/logout, role and token validation, password change/session invalidation |
| `tests/test_classrooms.py` | 8 | Teacher/student dashboards, classroom detail, join codes, approval flow, authorization |
| `tests/test_id_relationships.py` | 3 | **New:** `users.id` vs `student_profiles.id`, enrollment/attendance/roster IDs, preference linkage, student removal |
| `tests/test_material_associations.py` | 7 | **New:** material association, teacher/enrolled-student downloads, authorization denials, headers/content, invalid IDs, missing file, and large-file contents |
| `tests/test_production_config.py` | 7 | **New:** production rejects automatic table creation, seeder cannot bypass the guard, PostgreSQL URL normalization and dialect/driver loading |
| `tests/test_runtime_api_workflows.py` | 4 | **New:** registration/login, role and ID propagation, classroom creation, join approval/dashboard/roster, material API/access |
| `tests/test_sign_language_engine.py` | 4 | Lexicon verification safeguards, experimental status, unsupported fallback |
| `tests/test_sign_response_contract.py` | 3 | Sign response metadata, unsupported-language `verified_coverage`, serializer kwarg |
| `tests/test_websocket.py` | 17 | First-message auth, origin/role/enrollment checks, presence, captions, WebRTC signalling, media-state fields, notifications, and clean early disconnects |

### New regression tests

`backend/tests/test_sign_response_contract.py`:

1. `test_sign_convert_includes_verification_metadata` — asserts `verified_coverage` and per-gloss
   `verified`/`review_status` survive the API response.
2. `test_build_signs_unsupported_language_reports_zero_verified_coverage` — asserts the fallback
   payload contains `verified_coverage == 0`.
3. `test_classroom_student_serializer_uses_minutes_attended` — asserts `ClassroomStudentOut`
   accepts and returns `minutes_attended`.

`backend/tests/test_material_associations.py`:

1. `test_material_upload_derives_classroom_and_teacher_from_context` — a spoofed form
   `teacher_id` is ignored; the row and response use the authenticated teacher and owned classroom.
2. `test_material_listing_and_download_follow_enrollment` — enrolled students see/download only
   their classroom materials; unenrolled students get 403; students cannot upload.
3. `test_material_cross_teacher_isolation_and_delete` — another teacher cannot list, download,
   delete, or upload into the owner's classroom; owner deletion removes the row and file access.
4. `test_material_invalid_ids_are_rejected` — missing material/classroom IDs return 404 and a
   non-integer `classroom_id` returns 422.
5. `test_teacher_can_download_owned_material_with_expected_headers` — teacher receives exact bytes,
   attachment name, content type, and private cache headers.
6. `test_material_download_reports_missing_physical_file` — a row with no physical file returns 404.
7. `test_material_download_streams_large_file_contents` — the full 2 MiB+ body is returned intact.

The existing enrollment workflow test also asserts an enrolled student can download and an
unenrolled student is denied; cross-teacher isolation asserts another teacher is denied. These
download regressions use test fixtures and temporary storage only.

`backend/tests/test_production_config.py` verifies standard PostgreSQL URL schemes normalize to the
psycopg driver scheme, SQLite URLs are unchanged, and SQLAlchemy can load the declared PostgreSQL
dialect/driver without opening a network connection.

`backend/tests/test_id_relationships.py`:

1. `test_user_ids_are_used_for_enrollment_attendance_and_dashboards` — classroom `teacher_id`,
   enrollment/attendance `student_id`, classroom roster `id`, and `/teacher/students` `id` all use
   `users.id`.
2. `test_student_preference_uses_profile_id_and_stays_linked` — documents that
   `StudentPreference.student_id` is `student_profiles.id` and remains linked to the user.
3. `test_remove_student_endpoint_expects_user_id_not_profile_id` — the removal endpoint resolves
   the enrollment through `users.id`; a profile ID is not a substitute when no colliding user exists.

`backend/tests/test_production_config.py` additionally proves the sign-language seeder does not
call `Base.metadata.create_all()` outside the configured schema-initialization path.

`backend/tests/test_websocket.py` adds classroom and notification socket cases that close the
connection before sending auth and assert the server handles the expected disconnect cleanly.

### What the backend suite does **not** prove

- Browser session persistence, cookie/local-storage behaviour, or UI rendering.
- Real camera/microphone/screen capture, WebRTC media flow, TURN relay, or network recovery.
- Real MediaRecorder output, playback, A/V sync, or caption timing.
- Real speech recognition or real translation provider output/accuracy.
- MySQL/PostgreSQL-specific behaviour (tests use SQLite).
- Live PostgreSQL connectivity/DDL/data round-trips (offline Alembic SQL compilation is not live
  integration).
- Migration of the existing configured database.

---

## 3. Frontend tests (31)

`npm test` runs Node's built-in test runner over `src/lib/__tests__/*.test.js` and
`src/api/__tests__/*.test.js`.

| Suite area | What is covered |
|---|---|
| API resource contract helpers | Required IDs, endpoint field names, recording/material paths, student session requests |
| ICE configuration | STUN-only default, TURN credentials/multiple URLs, malformed entries, custom STUN |
| ISL pose/timeline | Vocabulary coverage, verification honesty, handshape tables, non-overlapping segments, unsupported text-only segments, speed/gaps, hand rest/mirroring |
| Hand tracking helpers | 21-landmark skeleton, two-hand mirroring, empty results, error/camera support |
| Recording capture | Stable video track across source changes, black frames before readiness, aspect fit, frame-error reporting, unsupported capture, cleanup |
| WebRTC/reconnect | Bounded exponential retry, connection-state derivation, signalling guards, no retry on auth/forbidden WebSocket closes |

These are pure logic tests. **No React DOM render, browser interaction, responsive layout, or
assistive-technology test was run.**

---

## 4. Runtime/deployment probes

- Backend integration tests call the API through FastAPI TestClient using the disposable SQLite
  database and temporary storage from `backend/tests/conftest.py`; this is not browser-driven E2E.
- Local Vite and disposable API health probes returned HTTP 200. An earlier shared-browser attempt
  was inconclusive; the later isolated browser run partially verified the end-to-end workflow as
  described below.
- Read-only Render probes returned HTTP 200 at `/api/health` and `/health`, reporting
  `development` + SQLite; `/` returned 404 (no root route exists). An earlier root 503 was not
  reproduced. No credentials or write requests were sent.
- An isolated browser run used its own disposable SQLite database and temporary storage. Teacher and
  student registration/login, classroom creation, join request, approval, student entry, materials
  listing, and upload succeeded. Upload returned HTTP 201 and stored test bytes matched the fixture.
  The selected material download returned HTTP 200, `text/plain; charset=utf-8`, attachment
  filename, private cache headers, and 45 expected bytes. Instrumentation observed a 45-byte Blob
  URL and anchor click during active user activation. The browser automation did not emit its
  awaited download event; the final browser-saved file is **not verified**. No API/auth/path defect
  was confirmed.
- Render/Vercel dashboard settings, real production database, persistent disk, WebRTC devices, TURN
  relay, and provider credentials were not available. No deploy or migration was run. Docker CLI
  was unavailable; Node.js v24.21.0 was available. Browser automation ran the isolated browser flow,
  but file-save capture remains partial.

## 5. Production build

```text
vite v6.4.5 building for production...
✓ 2293 modules transformed.
dist/index.html                     1.12 kB │ gzip:   0.59 kB
dist/assets/index-*.css            79.59 kB │ gzip:  12.22 kB
dist/assets/HandTrackingDemo-*.js   6.80 kB │ gzip:   3.01 kB
dist/assets/vision_bundle-*.js    155.90 kB │ gzip:  46.58 kB
dist/assets/IslAvatar-*.js        537.24 kB │ gzip: 135.82 kB
dist/assets/index-*.js            943.91 kB │ gzip: 279.80 kB
✓ built in 1m 33s
```

Build success proves imports resolve and the bundle is produced; it does **not** prove runtime
behaviour.

---

## 6. Feature verification matrix

| Feature | Status | Evidence / limitation |
|---|---|---|
| JWT auth, roles, hashing, token invalidation | **VERIFIED (backend)** | Registration/login/refresh/logout covered. Isolated browser registration/login also passed. |
| Isolated browser auth/classroom/material smoke | **PARTIAL** | Registration/login, classroom create/join/approve/entry, listing/upload passed; download HTTP response and frontend initiation passed, browser-saved file unverified. |
| Classroom creation, join code, approval/rejection | **VERIFIED (backend)** | 8 classroom tests + 17 WebSocket tests. Browser workflow partially verified. |
| Teacher/student resource authorization | **VERIFIED (backend)** | Recording/material/classroom access tests, including cross-teacher material isolation. |
| Material `classroom_id`/`teacher_id`/`material_id` associations | **VERIFIED (backend)** | Upload derives owner/classroom from auth and ownership; list/download/delete enforce membership; IDs round-trip. |
| Material download authorization, headers, body, missing/large file | **VERIFIED (backend)** | Teacher and enrolled student downloads pass; unenrolled student/other teacher denied; invalid/missing-file handling and full large-file response pass. |
| Browser material download | **PARTIAL** | Correct API response and frontend Blob/anchor initiation observed; browser did not emit a download event, so file persistence/save not verified. |
| `student_id` semantics (`users.id` vs profile id) | **VERIFIED (backend)** | Enrollment, attendance, roster, and removal tests; `StudentPreference.student_id` documented as `student_profiles.id`. |
| WebSocket first-message auth + membership | **VERIFIED (backend)** | Denial/allow/reconnect tests; physical network NOT RUN. |
| Caption persistence + translation fallback | **VERIFIED (backend)** | Automated pipeline tests; provider accuracy NOT RUN. |
| Sign gloss conversion + verification safeguards | **VERIFIED (backend/unit)** | Engine tests + new response-contract tests. |
| Sign-practice UI metadata | **FIXED / CONTRACT VERIFIED** | Backend now returns `verified_coverage` and per-gloss fields; UI browser render NOT RUN. |
| WebRTC signalling relay | **VERIFIED (backend)** | Signalling tests only. |
| Camera/mic/remote media/screen share | **NOT RUN** | No devices/secure context. |
| TURN relay | **BLOCKED** | No TURN service/credentials. |
| Recording helper logic | **VERIFIED (unit)** | 5 helper tests. |
| Real recording/playback/A-V sync | **NOT RUN** | No MediaRecorder output inspected. |
| Browser speech recognition | **NOT RUN** | Requires supported browser + microphone. |
| Real translation provider output | **NOT RUN** | No provider credentials. |
| ISL avatar rendering | **NOT RUN** | Three.js/WebGL acceptance not performed. |
| MediaPipe hand tracking | **NOT RUN** | Detection demo only; not sign recognition. |
| Hearing/Deaf layouts, reduced motion, screen reader | **NOT RUN** | No browser/AT run. |
| Responsive dashboards/classrooms/auth | **NOT RUN** | Only historical landing-page smoke. |
| Existing configured DB migration | **BLOCKED** | Backup/clone/schema diff required. |
| PostgreSQL URL/driver and offline migration SQL | **IMPLEMENTED / VERIFIED OFFLINE** | psycopg URL handling and driver load tests pass; three Alembic revisions compile for PostgreSQL. No live server was available; PostgreSQL integration remains unverified. |
| Cross-worker notifications | **BLOCKED** | Process-local hub. |
| Docker validation | **BLOCKED** | Docker unavailable. |
| Render production configuration | **FAIL / ACTION REQUIRED** | Live health says development + SQLite; root 404 is expected; dashboard settings/persistence are not visible here. |
| Production automatic schema creation | **GUARDED** | Startup refuses `AUTO_CREATE_TABLES=true` in production and the sign-language seeder no longer bypasses the guard; migrations remain manual. |

---

## 7. Reproduce

```powershell
# backend (from repository root)
cd backend
..\.venv\Scripts\python.exe -m pytest -q
# 73 passed; 1 warning in pytest summary and a pytest-asyncio deprecation notice

# frontend
cd ..\frontend
npm test
npm run build
```

Tests create their own disposable SQLite database and storage directory; they do not touch
`backend/signbridge.db` or any configured/production database.

### Runtime validation verdict

Detailed evidence: [`runtime-validation-report.md`](runtime-validation-report.md).

```text
environment:
  docker: UNAVAILABLE — Get-Command docker found no CLI
  node: AVAILABLE — v24.21.0
  playwright: PARTIAL — browser automation executed the isolated workflow; the browser did not emit the awaited download event
  infra-tier: FALLBACK(embedded/in-memory) — tests use disposable SQLite; no Docker daemon/CLI
  browser-tier: PARTIAL(Playwright/browser automation) — user journeys and Blob/anchor initiation observed; saved-file event not captured
startup: PASS — disposable API and Vite frontend were started and responsive during isolated browser flow
integration: PASS — exit_code: 0, passed: 73, failed: 0, skipped: 0, full backend pytest suite
e2e: PARTIAL — exit_code: N/A (browser automation action timed out waiting for download event), teacher/student auth, classroom approval, materials listing/upload, download response and UI initiation
overall: PARTIAL — automated suites pass; live PostgreSQL integration and final browser-saved download are not verified
```

Docker and Node were checked independently. The offline Alembic SQL result is not PostgreSQL
integration evidence. There was no supplied implementation-plan testing strategy artifact in this
handover, so this report records the requested verification evidence and does not claim strategy
conformance or production acceptance.
