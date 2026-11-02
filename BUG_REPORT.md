# SignBridge — Bug Report

**Date:** 2026-11-02  
**Baseline commit:** `7f83293`  
**Verification:** backend `49 passed`; frontend `31 passed`; production build `exit 0` (after fixes)

Severity uses: **Critical** (security/data loss/complete breakage), **High** (major feature broken),
**Medium** (degraded UX/latent failure), **Low** (documentation/minor).

---

## 1. Fixed in this audit

| ID | Severity | Area | Defect | Evidence | Fix / regression |
|---|---|---|---|---|---|
| BUG-001 | High | Documentation | `README.md` contained unresolved Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) and two competing titles, leaving setup instructions ambiguous. | `README.md` at baseline commit | Replaced with a single accurate README; removed stale lockfile warning and updated test counts. |
| BUG-002 | High | API contract / accessibility | Sign-practice response silently dropped `verified`, `review_status`, and `verified_coverage` because the Pydantic response schemas did not declare them. The UI therefore always showed 0 % reviewed and labelled every available sign "Experimental". | `backend/app/schemas/accessibility.py`; `backend/app/services/live_service.py`; `frontend/src/pages/PortalPages.jsx` | Added fields to `SignGlossOut`/`SignConvertOut`; propagated `verified_coverage` in `build_signs()` normal and fallback paths. |
| BUG-003 | Medium | Backend serializer | `classroom_student_out()` passed `lecture_minutes=` to `ClassroomStudentOut`, which expects `minutes_attended`, causing a latent Pydantic validation error for any caller. | `backend/app/services/serializers.py:95`; `backend/app/schemas/classroom.py:57` | Corrected kwarg and added a direct serializer test. |

**Regression coverage:** `backend/tests/test_sign_response_contract.py` (3 tests) covers the sign
metadata contract, unsupported-language fallback, and the serializer field name.

---

## 2. Open issues and risks (not fixed)

| ID | Severity | Area | Issue | Impact / recommended action |
|---|---|---|---|---|
| BUG-004 | High (operational) | Database migration | The configured SQLite database is unversioned and already contains some managed tables. `alembic upgrade head` on a clone failed because the initial migration attempted to create existing tables. | Do **not** stamp or upgrade blindly. Back up, clone, diff schema, and author/validate a forward-only plan. See `DEPLOYMENT_GUIDE.md`. |
| BUG-005 | High (operational) | Production storage | Recordings and materials are written to the local filesystem (`STORAGE_ROOT`). Serverless/ephemeral hosts will lose files on restart/redeploy. | Mount a persistent volume or add an object-storage adapter before production. |
| BUG-006 | Medium | Notifications | `/ws/notifications` uses a process-local in-memory hub. Events published on one Uvicorn worker/replica are not delivered to subscribers on another. | Use one worker for demos; add shared pub/sub (e.g. Redis) and cross-worker tests before scaling out. REST remains the source of truth. |
| BUG-007 | Medium | Rate limiting | Login/register limiting is in-process memory. Uploads, translation, WebSocket connects, and multi-worker deployments are not covered. | Add a shared limiter or reverse-proxy limits; reset/restart currently clears counters. |
| BUG-008 | Medium | Upload security | Validation is extension + size based; no magic-byte/content inspection or antivirus scanning. Download MIME is safely derived from the extension, but stored files remain untrusted. | Add content sniffing and malware scanning for materials before allowing untrusted public uploads. |
| BUG-009 | Medium | TURN credentials | Only static `VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL` values are supported; `VITE_*` is public in the built bundle. | For production, mint short-lived coturn credentials from the backend (not implemented). |
| BUG-010 | Medium | Frontend token storage | Access/refresh tokens are kept client-side and read by JavaScript; an XSS flaw would expose them. | Add a strict CSP, keep dependencies patched, consider httpOnly refresh cookies. Documented, not a regression. |
| BUG-011 | Low | Documentation drift | `docs/FEATURE_STATUS.md`, `docs/TEST_REPORT.md`, `PROJECT_PROGRESS.md` (historical phases), and `NEXT_CLAUDE_PROMPT.md` cite older counts (43 backend / 25 frontend, and 20 in one place). | Historical evidence is retained; root `TEST_REPORT.md` and `PROJECT_PROGRESS.md` are authoritative for this commit. |
| BUG-012 | Low | MediaPipe version note | Default WASM CDN URL may not match the pinned `@mediapipe/tasks-vision@1.2.0`; self-hosting guidance exists but was not validated. | Verify the WASM/model pair when enabling hand tracking in a browser. |

---

## 3. Unverified features (not bugs, but do not claim them as working)

These are **NOT RUN** or **BLOCKED**, not confirmed defects:

- Browser login / refresh / logout and role-based navigation.
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

---

## 4. How the fixes were verified

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q
# 49 passed, 1 third-party deprecation warning

cd ..\frontend
npm test
# 31 passed, 0 failed

npm run build
# exit 0 — built in ~41 s
```

No configured database was modified, no migration was applied, and no deployment occurred.
