# SignBridge — Test Report

**Date:** 2026-11-02  
**Commit inspected:** `7f83293` (working tree includes this phase's fixes)  
**Environment:** Windows, Python virtualenv at repository `.venv`, Node/npm available, disposable
SQLite test database and temp storage created by `backend/tests/conftest.py`. No production data,
network provider, camera, microphone, TURN service, or Docker was used.

---

## 1. Summary

| Layer | Command | Result |
|---|---|---|
| Backend regression suite | `cd backend && ..\.venv\Scripts\python.exe -m pytest -q` | **PASS — 49 passed**, 1 third-party warning, ~19 s |
| Frontend unit tests | `cd frontend && npm test` | **PASS — 31 passed**, 0 failed, ~1 s |
| Frontend production build | `cd frontend && npm run build` | **PASS — exit 0**, 2,293 modules, ~41 s |
| Python compilation | previously `python -m compileall -q app tests` | PASS (historical; code re-imported by tests after changes) |

Warnings observed:
- `pytest_asyncio` deprecation: `asyncio_default_fixture_loop_scope` unset.
- Starlette/httpx TestClient deprecation (`install httpx2`). Both are third-party warnings, not failures.

---

## 2. Backend tests (49)

| File | Tests | Coverage focus |
|---|---:|---|
| `tests/test_accessibility_recordings.py` | 8 | Translation status/fallback/identity, sign conversion, recording access and playback permissions |
| `tests/test_auth.py` | 12 | Registration/login/refresh/logout, role and token validation, password change/session invalidation |
| `tests/test_classrooms.py` | 8 | Teacher/student dashboards, classroom detail, join codes, approval flow, authorization |
| `tests/test_sign_language_engine.py` | 4 | Lexicon verification safeguards, experimental status, unsupported fallback |
| `tests/test_sign_response_contract.py` | 3 | **New:** sign response metadata, unsupported-language `verified_coverage`, serializer kwarg |
| `tests/test_websocket.py` | 14 | First-message auth, origin/role/enrollment checks, presence, captions, WebRTC signalling, notifications |

### New regression tests

`backend/tests/test_sign_response_contract.py`:

1. `test_sign_convert_includes_verification_metadata` — asserts `verified_coverage` and per-gloss
   `verified`/`review_status` survive the API response.
2. `test_build_signs_unsupported_language_reports_zero_verified_coverage` — asserts the fallback
   payload contains `verified_coverage == 0`.
3. `test_classroom_student_serializer_uses_minutes_attended` — asserts `ClassroomStudentOut`
   accepts and returns `minutes_attended`.

### What the backend suite does **not** prove

- Browser session persistence, cookie/local-storage behaviour, or UI rendering.
- Real camera/microphone/screen capture, WebRTC media flow, TURN relay, or network recovery.
- Real MediaRecorder output, playback, A/V sync, or caption timing.
- Real speech recognition or real translation provider output/accuracy.
- MySQL-specific behaviour (tests use SQLite).
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

## 4. Production build

```text
vite v6.4.5 building for production...
✓ 2293 modules transformed.
dist/index.html                     1.12 kB │ gzip:   0.59 kB
dist/assets/index-*.css            79.59 kB │ gzip:  12.22 kB
dist/assets/HandTrackingDemo-*.js   6.80 kB │ gzip:   3.01 kB
dist/assets/vision_bundle-*.js    155.90 kB │ gzip:  46.58 kB
dist/assets/IslAvatar-*.js        537.24 kB │ gzip: 135.82 kB
dist/assets/index-*.js            943.91 kB │ gzip: 279.80 kB
✓ built in 41.28s
```

Build success proves imports resolve and the bundle is produced; it does **not** prove runtime
behaviour.

---

## 5. Feature verification matrix

| Feature | Status | Evidence / limitation |
|---|---|---|
| JWT auth, roles, hashing, token invalidation | **VERIFIED (backend)** | 12 auth tests. Browser flow NOT RUN. |
| Classroom creation, join code, approval/rejection | **VERIFIED (backend)** | 8 classroom tests + 14 WebSocket tests. Browser UI NOT RUN. |
| Teacher/student resource authorization | **VERIFIED (backend)** | Recording/material/classroom access tests. |
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
| Cross-worker notifications | **BLOCKED** | Process-local hub. |
| Docker validation | **BLOCKED** | Docker unavailable. |
| Production deployment | **NOT CONFIGURED** | No host/domain/DB/secrets. |

---

## 6. Reproduce

```powershell
# backend (from repository root)
cd backend
..\.venv\Scripts\python.exe -m pytest -q

# frontend
cd ..\frontend
npm test
npm run build
```

Tests create their own disposable SQLite database and storage directory; they do not touch
`backend/signbridge.db` or any configured/production database.
