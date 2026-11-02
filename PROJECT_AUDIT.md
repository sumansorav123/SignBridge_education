# SignBridge — Full-Stack Project Audit

**Audit date:** 2026-11-02  
**Commit inspected:** `d5c7e4f` (`main`, with uncommitted work in the working tree)
**Scope:** React 19/Vite 6 frontend, FastAPI/SQLAlchemy 2 backend, SQLite/MySQL persistence and
PostgreSQL driver/URL support,
WebSocket/WebRTC real-time paths, file uploads, authentication/authorization, tests, build, and
production-readiness.

> Evidence labels: **VERIFIED** = reproduced in this audit; **PARTIAL** = automated layer only, no
> browser/device; **NOT RUN** = not exercised; **BLOCKED** = missing devices, credentials, or external
> services.

---

## 1. Repository inventory

| Layer | Technology | Key paths |
|---|---|---|
| Frontend | React 19, Vite 6, Tailwind 3, React Router 7, Three.js, MediaPipe | `frontend/src/{api,components,context,hooks,lib,pages}` |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2, PyJWT, bcrypt, Alembic | `backend/app/{api,core,database,models,schemas,services,sign_language,speech,translation,websocket}` |
| Data | SQLite (dev/tests), MySQL, PostgreSQL driver/URL support (live integration unverified), on-disk recordings/materials | `backend/alembic/versions`, `backend/app/services/storage.py` |
| Tests | pytest + FastAPI TestClient; Node `node:test` | `backend/tests`, `frontend/src/**/__tests__` |
| Docs | Historical phase docs plus this audit set | `docs/`, repository root |

**Backend API surface** (prefix `/api`): auth, teacher, student, classroom join requests,
recordings, materials, and an accessibility namespace that is also mounted at the legacy flat
paths. WebSockets: `/ws/classroom/{classroom_id}` and `/ws/notifications`.

**Database schema:** 14 ORM models with foreign keys, unique constraints (enrollment, attendance,
subtitle sequence, translation target, sign gloss), status `CHECK` constraints, and indexes for
hot lookup paths. Three Alembic revisions exist (initial schema, recording offset, join requests).

---

## 2. Verified baseline

| Check | Command | Result |
|---|---|---|
| Backend regression suite | `cd backend && ..\.venv\Scripts\python.exe -m pytest -q` | **73 passed**, 1 warning in pytest summary |
| Frontend unit tests | `cd frontend && npm test` | **31 passed**, 0 failed |
| Frontend production build | `cd frontend && npm run build` | **exit 0**, 2,293 modules transformed |
| Frontend lockfile | `git ls-files frontend/package-lock.json` | present/tracked; `npm ci` viable |

The 73 backend tests cover authentication, classroom creation/join approval, teacher/student access
control, WebSocket first-message authentication, membership denial, media-state field compatibility,
recording authorization, translation fallback, ISL lexicon safeguards, the sign-response contract,
material association/authorization, runtime API workflows, production configuration, and the
`student_id`/`classroom_id`/`teacher_id`/`material_id` relationship contract. The 31 frontend tests are
pure-logic/unit tests (API contract helpers, ICE config, ISL pose/timeline, recording capture,
reconnect/backoff, WebSocket policy) — **not** React DOM rendering.

---

## 3. Confirmed defects found and fixed

### 3.1 `README.md` contained unresolved merge-conflict markers

- **Evidence:** file began with `<<<<<<< HEAD`, contained `=======` and `>>>>>>> c40948d…`, and had two
  competing H1 titles.
- **Impact:** broken repository documentation; misleading setup guidance.
- **Fix:** replaced with a single accurate README. Removed stale claim that `package-lock.json` is
  incomplete; documented current verified test counts and migration caution.

### 3.2 Sign-practice API dropped verification metadata

- **Evidence:** `backend/app/sign_language/engine.py` computes `verified`, `review_status`, and
  `verified_coverage`, but `SignGlossOut`/`SignConvertOut` in
  `backend/app/schemas/accessibility.py` did not declare those fields. Pydantic therefore discarded
  them in `SignConvertOut(**signs)`. `build_signs()` in `backend/app/services/live_service.py` also
  omitted `verified_coverage` from both success and unsupported-language payloads.
- **Impact:** `frontend/src/pages/PortalPages.jsx` (`SignPractice`) always displayed **0 %
  interpreter-reviewed**, and every available sign was labelled **Experimental** even when its
  metadata said otherwise. This was an API contract mismatch, not a cosmetic issue.
- **Fix:** declared `verified: bool` and `review_status: str | None` on `SignGlossOut`, added
  `verified_coverage: float = 0.0` to `SignConvertOut`, and propagated `verified_coverage` through
  `build_signs()` (including the unsupported-language fallback).
- **Regression coverage:** `backend/tests/test_sign_response_contract.py`.

### 3.3 Classroom-student serializer used a nonexistent kwarg

- **Evidence:** `backend/app/services/serializers.py:95` passed `lecture_minutes=minutes_attended`
  to `ClassroomStudentOut`, whose field is `minutes_attended`.
- **Impact:** any caller of `classroom_student_out()` would raise a Pydantic validation error
  (currently no production caller; the teacher detail endpoint builds the same shape inline). Latent
  breakage risk.
- **Fix:** changed to `minutes_attended=minutes_attended`; added a direct serializer regression test.

### 3.4 Sign-language seeder bypassed the production schema-creation guard

- **Evidence:** `seed_sign_language_animations()` called `Base.metadata.create_all()` independently
  of the explicit startup schema initialization controlled by `AUTO_CREATE_TABLES`.
- **Impact:** production startup could create missing ORM tables even with
  `AUTO_CREATE_TABLES=false`, bypassing the production safety guard.
- **Fix:** removed the seeder's `create_all()` call. Schema creation is now limited to the explicit
  database initialization path; production continues to require reviewed/manual migrations.
- **Regression coverage:** `backend/tests/test_production_config.py`.

### 3.5 Expected WebSocket disconnect before authentication caused an ASGI exception

- **Evidence:** the isolated browser closed classroom/notification sockets during route changes
  before sending the first auth message; the server caught `WebSocketDisconnect` but then tried to
  send a close frame to the already-disconnected peer.
- **Impact:** normal client lifecycle events produced noisy server exception logs.
- **Fix:** return directly on a disconnect during first-message authentication and tolerate a
  disconnect while sending an intentional close frame.
- **Regression coverage:** two parametrized cases in `backend/tests/test_websocket.py`.

---

## 4. Area-by-area assessment

### 4.1 Authentication and session persistence — VERIFIED (backend), NOT RUN (browser)

- JWT access/refresh tokens, bcrypt password hashing, token-version invalidation on password change
  or logout, role claims checked against the live user row.
- Access token is held in JS memory/local storage via `frontend/src/api/tokenStore.js`; a 401 response
  triggers a single-flight refresh and retry. XSS would expose tokens (documented risk).
- Login/register rate limiting is process-local memory. Production secret and demo-seed guards are
  enforced in `backend/app/core/config.py`.

### 4.2 Authorization and enrollment — VERIFIED (backend)

- Teacher routes require teacher role and classroom ownership.
- Student classroom access requires an `active` enrollment; pending/rejected join requests are denied.
- Recording list/detail/transcript/playback and material list/download check ownership or active
  enrollment. Playback URLs use short-lived scoped tokens.
- WebSocket classroom access re-checks ownership/enrollment after first-message authentication; URL
  token authentication is rejected. Origin checks apply when an `Origin` header is present.

### 4.3 Database and migrations — VERIFIED (SQLite), PARTIAL (PostgreSQL), BLOCKED (existing production DB)

- New databases can be built from migrations (`backend/alembic/versions`). Tests use a disposable
  SQLite database.
- PostgreSQL psycopg driver/URL support is implemented, PostgreSQL URL normalization and dialect
  loading have regression tests, and all Alembic revisions compile to PostgreSQL SQL in offline
  mode. No PostgreSQL server was available; live connectivity, DDL execution, data round-trips,
  constraints, and application workflows against PostgreSQL remain **unverified**. No database
  migration or URL switch was performed.
- The configured local/unversioned database must **not** be blindly upgraded or stamped. The initial
  migration tries to create tables that may already exist. Required path: verified backup → isolated
  clone → schema diff → forward-only migration or validated baseline stamp → restore test.
- `AUTO_CREATE_TABLES=true` is acceptable for local development; production should use Alembic with
  `AUTO_CREATE_TABLES=false`.

### 4.4 Frontend navigation and UX states

- Routes are declared for all landing, auth, teacher, and student pages; the production build
  resolves every import.
- Portal pages use reusable loading, error, and empty states (`FullPageLoader`, `PageLoadError`,
  `EmptyState`); authenticated routes are guarded by `ProtectedRoute` and role-based redirects.
- **Not verified:** browser rendering, responsive behaviour of dashboards/classrooms/auth pages,
  keyboard/assistive-technology use. Only a previous landing-page responsive smoke test exists.

### 4.5 Real-time captions, translation, and WebSockets — PARTIAL

- Backend caption persistence, per-language translation fallback, recent-subtitle replay, and
  WebSocket signalling/presence are covered by automated tests.
- Browser Web Speech recognition, live audio timing, provider accuracy, and multi-tab/browser
  behaviour are **NOT RUN**.
- Notifications use a process-local in-memory hub. Cross-worker delivery is **BLOCKED** until shared
  pub/sub (e.g. Redis) is added; REST remains the source of truth.

### 4.6 WebRTC and media — PARTIAL (signalling), NOT RUN (media)

- Offer/answer/ICE relay and retry/backoff helpers have automated coverage.
- Actual camera/microphone capture, remote playback, screen share, multi-peer mesh behaviour,
  reconnect after network loss, and TURN relay selection are **NOT RUN**. No TURN credentials or
  restricted network are available.
- LAN HTTP permits API/approval checks but **cannot** grant remote camera/mic/display-capture; a
  trusted HTTPS/WSS origin is required.
- Student video is not forwarded to the teacher by design (teacher-to-student mesh).

### 4.7 Recording and playback — PARTIAL (helper logic), NOT RUN (media output)

- `frontend/src/lib/recordingCapture.js` keeps a stable canvas video track while the displayed source
  changes; five unit tests cover track stability, audio retention, aspect fit, errors, and cleanup.
- Actual `MediaRecorder` output, camera→screen-share transitions, playback, A/V sync, caption timing,
  and system audio are **NOT RUN**.

### 4.8 ISL avatar and speech-to-text — PARTIAL/NOT RUN

- The catalog contains 100 ISL entries, **all experimental**. A sign can only become `verified` when
  `review_status="interpreter_reviewed"` **and** reviewer name + date evidence are present; the model
  downgrades unsupported claims.
- Rule-based gloss conversion, stopword removal, time-fronting, wh-final ordering, and text fallback
  are unit-tested.
- Three.js avatar rendering, MediaPipe hand tracking (detection only, not sign recognition), and
  qualified ISL correctness are **NOT RUN**.

### 4.9 Uploads and file serving — VERIFIED (code + backend tests); browser save PARTIAL

- Extension allow-lists and streaming size limits (`MAX_MATERIAL_MB`, `MAX_RECORDING_MB`).
- Storage keys are server-generated UUIDs; `resolve_storage_key()` blocks path traversal.
- Download MIME type is derived from the validated extension via a safe mapping, not the
  browser-supplied `Content-Type`; downloads use `Content-Disposition` and private cache headers.
- Automated regressions verify teacher-owned and enrolled-student download contents/headers,
  denied access for unenrolled students and other teachers, invalid material IDs, missing files,
  and complete 2 MiB+ response contents. The isolated browser request also returned HTTP 200 with
  the expected 45-byte fixture and headers; frontend Blob creation and anchor click were observed.
  The browser did not emit the awaited download event, so the final saved file remains
  **unverified**; no API/auth/path/streaming defect was confirmed.
- No magic-byte/antivirus scanning is implemented. Treat uploaded files as untrusted and add malware
  scanning before accepting arbitrary public uploads.

### 4.10 Deployment readiness — BLOCKED (live service not production-configured)

- No checked-in hosting configuration exists (`render.yaml`, `vercel.json`); the external Render
  dashboard and Vercel project settings are not accessible in this workspace.
- Read-only probes to the live Render API on 2026-11-02 returned HTTP 200 from `/api/health` and
  `/health`, with `environment=development` and `database.dialect=sqlite`. `/` returned 404, which
  is expected because the FastAPI app defines no root route; the previously observed 503 was not
  reproduced. This is a live deployment, but **not a verified production configuration**. The
  health response cannot confirm disk persistence, demo seeding, or the effective environment
  variables.
- Frontend build output is static and deployable; backend supports MySQL and PostgreSQL driver/URL
  configuration, plus configurable `CORS_ORIGINS`. PostgreSQL integration remains unverified.
- Recordings/materials are local-disk files. Serverless or ephemeral filesystems will lose them;
  production needs a persistent volume or object storage adapter.
- The project declares PyMySQL and psycopg; PostgreSQL URL normalization and offline Alembic SQL
  compilation were verified. No live PostgreSQL server was available; PostgreSQL is not yet a
  verified deployment target.
- Production startup now rejects `AUTO_CREATE_TABLES=true`. This does not migrate a schema; apply an
  explicitly reviewed migration plan before pointing production at its database.
- `VITE_*` values are public. Static TURN credentials are test-only; production should mint
  time-limited coturn credentials server-side (not implemented).

### Isolated browser workflow — PARTIAL

- Teacher/student registration and login, classroom creation, join request, teacher approval,
  student classroom entry, classroom materials listing, and material upload succeeded against a
  disposable local SQLite database and temporary storage.
- The material upload returned HTTP 201 and the stored test bytes matched the uploaded fixture.
- The browser download API response (HTTP 200, expected headers and fixture bytes) and frontend
  Blob/anchor initiation were observed; the automation did not emit a download event. The final
  browser-saved file is **not verified**.
- Transient early WebSocket disconnects were reproduced and fixed in this phase. No camera,
  microphone, WebRTC media, TURN, physical-device, or production workflow was tested.

---

## 5. Security summary

| Control | Status |
|---|---|
| Password hashing / JWT typing / token versioning | Verified in code and tests |
| Role and resource ownership checks | Verified in tests |
| WebSocket first-message auth + origin check | Verified in tests |
| Upload extension/size/traversal controls | Verified in code and tests |
| Production secret, demo-seed, and automatic-table-creation guards | Verified in code and config tests |
| Security headers (`nosniff`, `DENY`, referrer, permissions policy) | Present in middleware |
| Rate limiting | Login/register only, process-local; no shared limiter |
| Upload content sniffing / antivirus | Not implemented |
| TURN credential minting | Not implemented (static `VITE_*` only) |
| CSP | Not configured |
| Notification fan-out across workers | Not implemented |

---

## 6. Missing external configuration

To move beyond automated verification, the following must be supplied by an operator:

1. **Devices/network:** two laptops, browsers with camera/mic, trusted HTTPS/WSS certificate.
2. **TURN:** server host, realm, static auth secret, TLS certificate, open UDP/TCP ports.
3. **Translation:** DeepL/Google/LibreTranslate credentials or a self-hosted LibreTranslate URL.
4. **Speech (optional):** `OPENAI_API_KEY` (Whisper) or a local `faster-whisper` install.
5. **Production data:** MySQL connection string, backup/restore access, schema-diff approval.
6. **Persistent storage:** mounted volume or object-storage credentials for recordings/materials.
7. **ISL review:** qualified interpreter evidence before changing any `verified` metadata.

---

## 7. Production-readiness verdict

**Not production-ready yet.** The codebase is internally coherent, automated tests pass, the frontend
builds, and the main security controls are present. The blockers are operational and evidentiary:
physical media/WebRTC/TURN validation, browser accessibility acceptance, real translation provider
testing, migration of the existing configured database, persistent storage, shared notification
fan-out, and qualified ISL review. Deploying today would be a preview/prototype deployment, not a
production launch.
