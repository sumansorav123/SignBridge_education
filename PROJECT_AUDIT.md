# SignBridge — Full-Stack Project Audit

**Audit date:** 2026-11-02  
**Commit inspected:** `7f83293` (`main`)  
**Scope:** React 19/Vite 6 frontend, FastAPI/SQLAlchemy 2 backend, SQLite/MySQL persistence,
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
| Data | SQLite (dev), MySQL (prod), on-disk recordings/materials | `backend/alembic/versions`, `backend/app/services/storage.py` |
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
| Backend regression suite | `cd backend && ..\.venv\Scripts\python.exe -m pytest -q` | **49 passed**, 1 third-party deprecation warning |
| Frontend unit tests | `cd frontend && npm test` | **31 passed**, 0 failed |
| Frontend production build | `cd frontend && npm run build` | **exit 0**, 2,293 modules transformed |
| Frontend lockfile | `git ls-files frontend/package-lock.json` | present/tracked; `npm ci` viable |

The 49 backend tests cover authentication, classroom creation/join approval, teacher/student access
control, WebSocket first-message authentication and membership denial, recording authorization,
translation fallback, ISL lexicon safeguards, and the sign-response contract fixed in this audit.
The 31 frontend tests are pure-logic/unit tests (API contract helpers, ICE config, ISL pose/timeline,
recording capture, reconnect/backoff, WebSocket policy) — **not** React DOM rendering.

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

### 4.3 Database and migrations — VERIFIED (schema/tests), BLOCKED (existing production DB)

- New databases can be built from migrations (`backend/alembic/versions`). Tests use a disposable
  SQLite database.
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

### 4.9 Uploads and file serving — VERIFIED (code + backend tests)

- Extension allow-lists and streaming size limits (`MAX_MATERIAL_MB`, `MAX_RECORDING_MB`).
- Storage keys are server-generated UUIDs; `resolve_storage_key()` blocks path traversal.
- Download MIME type is derived from the validated extension via a safe mapping, not the
  browser-supplied `Content-Type`; downloads use `Content-Disposition` and private cache headers.
- No magic-byte/antivirus scanning is implemented. Treat uploaded files as untrusted and add malware
  scanning before accepting arbitrary public uploads.

### 4.10 Deployment readiness — NOT CONFIGURED

- No hosting configuration exists for Vercel/Render or any other target; no production database,
  object storage, TURN service, or secrets are configured.
- Frontend build output is static and deployable; backend supports MySQL and a configurable
  `CORS_ORIGINS`.
- Recordings/materials are local-disk files. Serverless or ephemeral filesystems will lose them;
  production needs a persistent volume or object storage adapter.
- `VITE_*` values are public. Static TURN credentials are test-only; production should mint
  time-limited coturn credentials server-side (not implemented).

---

## 5. Security summary

| Control | Status |
|---|---|
| Password hashing / JWT typing / token versioning | Verified in code and tests |
| Role and resource ownership checks | Verified in tests |
| WebSocket first-message auth + origin check | Verified in tests |
| Upload extension/size/traversal controls | Verified in code and tests |
| Production secret and demo-seed startup guards | Verified in code |
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
