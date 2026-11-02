# SignBridge project progress

**Current phase:** Phase 16 — material download verification and PostgreSQL readiness
**Status:** Backend/frontend tests and production build pass. Download authorization and response
bytes are backend-tested; isolated browser API and frontend initiation succeeded, but final
browser-saved file capture remains unverified. PostgreSQL driver/URL support is implemented and
offline migration SQL compiles; live PostgreSQL integration and production infrastructure remain
unverified.
**Last verified:** 2026-11-02
**Commit inspected:** `d5c7e4f` on `main` (working tree contains uncommitted changes)
**Detailed results:** [`TEST_REPORT.md`](TEST_REPORT.md) · [`BUG_REPORT.md`](BUG_REPORT.md) ·
[`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) · [`docs/REAL_WORLD_TEST_GUIDE.md`](docs/REAL_WORLD_TEST_GUIDE.md)

## Current verification

| Area | Status | Evidence / limitation |
|---|---|---|
| Backend regression suite | **PASS** | `pytest -q`: **73 passed**, exit 0. Includes material download authorization, headers/body, missing-file and large-file regressions, plus PostgreSQL URL/driver configuration tests. |
| Frontend unit tests | **PASS** | `npm test`: **31 passed**, 0 failed. Pure logic, not React DOM. |
| Frontend production build | **PASS** | `npm run build`: exit 0, 2,293 modules transformed (~93 s). |
| README/documentation integrity | **FIXED** | Removed unresolved merge-conflict markers and stale lockfile guidance. |
| Sign-practice verification contract | **FIXED** | `verified`, `review_status`, and `verified_coverage` now survive API serialization. |
| Classroom-student serializer | **FIXED** | `minutes_attended` kwarg corrected; regression test added. |
| WebSocket media-state compatibility | **FIXED** | Backend accepts `audio_enabled`/`video_enabled` as well as `audio`/`video` and `microphone_enabled`/`camera_enabled`; regression test added. |
| Material ID associations/download | **VERIFIED (backend)** | Upload derives `teacher_id` from auth and validates classroom ownership. Download verifies teacher ownership/student enrollment, headers, bytes, missing files, and large files. 7 material regression tests. Browser file-save capture remains partial. |
| `student_id` relationship audit | **VERIFIED** | User-facing `student_id` uses `users.id`; `StudentPreference.student_id` is documented as `student_profiles.id`. 3 regression tests; no runtime defect found. |
| Production table-creation guard | **FIXED** | Production rejects `AUTO_CREATE_TABLES=true`; the sign-language seeder no longer bypasses that guard with `Base.metadata.create_all()`. Covered within 7 production/database configuration tests. No migration runs at startup. |
| Public Render API configuration | **NOT PRODUCTION-READY** | Read-only `/api/health` and `/health` return 200 and report development + SQLite. Root `/` returns 404, expected because no root route is defined; the earlier 503 was not reproduced. Remote settings/storage persistence remain uninspectable. |
| PostgreSQL deployment compatibility | **PARTIAL / NOT PRODUCTION-VERIFIED** | psycopg driver and PostgreSQL URL normalization are implemented and tested; the full Alembic chain compiled offline for PostgreSQL. No live PostgreSQL server was available. |
| Deployment manifests | **NOT PRESENT** | No `render.yaml` or `vercel.json`; remote dashboard settings were not changed. |
| Isolated browser classroom/material journey | **PARTIAL** | Registration/login, classroom approval, entry, listing/upload passed. Download returned expected HTTP 200, headers and 45 bytes; frontend Blob/anchor click was observed, but browser did not emit a download event and saved-file bytes remain unverified. |
| WebSocket auth disconnect cleanup | **FIXED** | Both socket routes now return cleanly if the client disconnects before first-message auth; two parameterized regression cases pass. |
| Camera/microphone/WebRTC media | **NOT RUN** | No physical device or secure-context test. |
| Screen share / TURN relay | **NOT RUN / BLOCKED** | No TURN service or restricted network available. |
| Recording capture/playback/A-V sync | **NOT RUN** | Helper unit tests only; no real `MediaRecorder` output inspected. |
| Live speech recognition | **NOT RUN** | Requires supported browser, microphone, and live session. |
| Real translation provider output | **NOT RUN** | Provider fallback/status tested; no credentials or provider accuracy test. |
| ISL avatar / qualified review | **NOT RUN** | All 100 ISL entries remain experimental; zero interpreter-reviewed. |
| Responsive dashboards/classrooms | **NOT RUN** | Only a previous landing-page responsive smoke test exists. |
| Existing configured DB migration | **BLOCKED** | Unversioned DB; requires backup, clone, schema diff, and validated plan. |
| Persistent production storage | **NOT VERIFIED** | Recordings/materials use local disk; the Render volume/object-storage configuration is not accessible here. |
| Cross-worker notifications | **BLOCKED** | Process-local hub; shared pub/sub not configured. |
| Docker-based validation | **BLOCKED** | Docker CLI unavailable in this environment; no Docker-based PostgreSQL instance could be started. |
| Production deployment | **BLOCKED** | A Render API is live, but its health response identifies a development SQLite configuration. No production Vercel origin or deployment settings were supplied. |

## Changes made in Phase 14

1. Re-ran the complete backend suite (**63 passed**), frontend suite (**31 passed**), production build
   (exit 0; 2,293 modules transformed), and Python compilation.
2. Added a production startup guard requiring `AUTO_CREATE_TABLES=false` when
   `ENVIRONMENT=production`, with two regression tests. Production schema changes must be explicitly
   reviewed and applied; the app does not migrate/create tables at startup.
3. Probed the deployed Render health endpoint without authentication or data modification. It
   reports `development` + `sqlite`; documented the mismatch and an exact source-confirmed
   Render/Vercel setup checklist. No remote settings, database, or deployment were changed.
4. Confirmed no repository `render.yaml`/`vercel.json`, no local `backend/.env`, and no PostgreSQL
   driver in the dependency manifest. The external Render dashboard remains inaccessible here.

## Changes made in Phase 15

1. Removed an implicit `Base.metadata.create_all()` call from the sign-language seeder. This call
   bypassed `AUTO_CREATE_TABLES=false` and could create the entire ORM schema during production
   startup. Added a regression test proving the seeder does not create schema.
2. Corrected the deployment-guide frontend example: `VITE_API_URL` must be the API origin only
   because `frontend/src/api/config.js` appends `/api`.
3. Re-probed Render without credentials or write requests: `/api/health` and `/health` returned
   HTTP 200; `/` returned 404 (no root route is defined). The prior root 503 was not reproduced.
   The health payload still reports `environment=development` and SQLite.
4. Ran a browser workflow in an isolated local SQLite/temp-storage environment. Teacher/student
   registration and login, classroom creation, join request, approval, entry, material listing, and
   upload succeeded. The download event timed out, so download remains unverified. No real user data
   or production service was used.
5. Fixed expected WebSocket disconnects before authentication so they no longer trigger an attempted
   close on a disconnected peer; added two regression cases for classroom and notification sockets.
6. Final verification: backend **66 passed**, frontend **31 passed**, production build passed
   (2,293 modules; ~72 s), Python compilation passed, and `git diff --check` passed.
7. PostgreSQL readiness, production dashboard settings, durable storage, browser download, WebRTC
   media, TURN, and real-device accessibility remain blocked or unverified. No settings, database,
   migration, commit, push, or deployment were changed.

## Changes made in Phase 16

1. Added `psycopg[binary]` and normalized `postgres://`/`postgresql://` settings to
   `postgresql+psycopg://`, while preserving SQLite and MySQL support.
2. Added PostgreSQL URL/dialect configuration regression coverage. The complete Alembic chain
   generated offline SQL for PostgreSQL; no PostgreSQL server was available, so live connectivity,
   migration execution, and production readiness remain unverified.
3. Added material download regressions for teacher ownership, enrolled student access, unenrolled
   student and other-teacher denial, invalid IDs, missing physical files, correct response headers,
   and complete large-file contents.
4. Fresh isolated browser run verified `/api/materials/1/download` returned HTTP 200, expected
   content type/disposition/cache headers and the 45-byte fixture. Frontend Blob creation and anchor
   click were observed. Playwright did not emit a download event, so file-saved bytes are not
   verified; no API/auth/path/streaming defect was confirmed and no product download code was
   changed.
5. Full verification: backend **73 passed** (1 warning in pytest summary; pytest-asyncio deprecation
   warning), frontend **31 passed**, production build passed (2,293 modules, ~93 s), Python
   compilation passed, `git diff --check` passed. Docker CLI was unavailable; Node.js v24.21.0 was
   available.
6. Updated deployment guidance with PostgreSQL compatibility limits, migration order, safe
   clone/backup/data transfer/sequence/relationship/file-hash verification, rollback, and the
   browser download evidence. No database or production configuration was changed; no migration,
   commit, push, or deployment was performed.

## Changes made in Phase 13

1. Replaced the merge-conflicted `README.md` with accurate setup, test, and troubleshooting guidance.
2. Fixed the sign-language response contract:
   - `SignGlossOut` now exposes `verified` and `review_status`.
   - `SignConvertOut` now exposes `verified_coverage`.
   - `build_signs()` propagates `verified_coverage` for normal and unsupported-language payloads.
3. Fixed `classroom_student_out()` to pass `minutes_attended` instead of the nonexistent
   `lecture_minutes`.
4. Added `backend/tests/test_sign_response_contract.py` (3 focused tests).
5. Fixed WebSocket media-state compatibility so frontend `audio_enabled`/`video_enabled` frames are
   accepted; added a regression test in `backend/tests/test_websocket.py`.
6. Completed the four-ID audit (`student_id`, `classroom_id`, `teacher_id`, `material_id`) across
   models, schemas, auth/JWT, APIs, serializers, services, seed data, and frontend field usage.
   No ID relationship defect was found; documented the `StudentPreference.student_id` naming
   ambiguity and the profile/user ID collision hazard instead of silently changing relationships.
7. Added `backend/tests/test_material_associations.py` (4 tests) for upload/list/download/delete
   association and authorization.
8. Added `backend/tests/test_id_relationships.py` (3 tests) for user/profile ID semantics,
   enrollment/attendance/roster IDs, and student removal.
9. Re-ran backend tests (**57 passed**), frontend tests (**31 passed**), and the production build
   (**exit 0**).
10. Produced the root audit/report/handover/deployment documentation set.

## Historical context (Phases 10–12)

- Phase 10/11 hardened WebSocket authentication, upload handling, production startup guards, and
  recording source switching. The configured local SQLite DB was deliberately left untouched.
- Phase 12 verified a scripted single-process approval/rejection and classroom WebSocket flow on a
  disposable SQLite database, plus same-machine LAN-origin health/CORS checks. It did **not** perform
  a browser-driven or second-laptop test.
- Documentation from those phases understates current counts (43 backend / 25 frontend). This file and
  `TEST_REPORT.md` supersede those counts for the current commit.

## Next actions (in priority order)

1. **Browser auth and approval journey:** sign in as teacher/student, create a classroom, request to
   join, approve/reject, refresh the page, and confirm session persistence and role routing.
2. **Media acceptance on two devices:** use trusted HTTPS/WSS, verify camera/mic delivery, remote
   playback, screen share, 3+ participants, reconnect, and resource cleanup.
3. **TURN:** configure a test coturn service and confirm a selected `relay` candidate pair with direct
   paths blocked.
4. **Recording:** record a real camera→screen-share transition, play it back, and compare audio,
   video, and caption timing.
5. **Captions/translation/accessibility:** test live speech, at least one real provider per language
   family, Hearing/Deaf layouts, reduced motion, avatar rendering, and a screen reader.
6. **ISL review:** obtain qualified interpreter evidence before changing any verification metadata.
7. **Database:** back up, clone, diff, and validate a schema-specific migration plan before touching
   any configured or production database.
8. **Production platform:** choose Vercel/Render/managed MySQL/persistent storage (see
   [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md)), add shared notification pub/sub, and configure
   monitoring/backups.
9. **Deployment:** only after the above, with explicit owner approval. Do not push or deploy
   automatically.

## Safety constraints

- Do not delete, reset, stamp, or blindly upgrade a configured database. Use disposable data only.
- Do not commit `.env`, secrets, production TURN credentials, or real user data.
- Do not describe ISL animations as interpreter-verified.
- Do not claim browser, media, or physical-device checks that were not performed.
- Do not push to GitHub or deploy without explicit user approval.
