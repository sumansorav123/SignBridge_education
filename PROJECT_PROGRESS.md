# SignBridge project progress

**Current phase:** Phase 12 — physical classroom acceptance testing  
**Current status:** Automated tests and same-machine live API/WebSocket workflow pass. Two-laptop, browser-driven, and actual media acceptance remain outstanding.  
**Last verified:** 2026-11-01  
**Detailed results:** [docs/TEST_REPORT.md](./docs/TEST_REPORT.md)  
**Manual runbook:** [docs/REAL_WORLD_TEST_GUIDE.md](./docs/REAL_WORLD_TEST_GUIDE.md)

## Latest verification

| Area | Status | Evidence / limitation |
|---|---|---|
| Backend regression suite | PASS | 43 passed, exit 0, including classroom approval, authorization, notifications, and transaction rollback. |
| Frontend tests | PASS | 25 passed, exit 0; includes five recording-capture helper tests. Pure logic tests, not React DOM or browser media. |
| Frontend production build | PASS (Phase 11) | `npm run build`, exit 0 in Phase 11; intentionally NOT RUN in Phase 12. |
| Python compilation | PASS | `python -m compileall -q app tests`, exit 0. |
| Local API startup | PASS | FastAPI used a unique temporary SQLite database/storage; `/api/health` returned 200 and DB status `ok`. |
| Local frontend startup | PASS | Vite `/` returned HTTP 200. |
| Standalone runtime plan | PASS (Phase 11), HTTP fallback | Three assertions passed: tests, build, and HTTP probe. Phase 12 plan was NOT RUN because it includes a production build and rebuilding was explicitly disallowed. |
| Configured application DB | BLOCKED for migration | Existing unversioned schema was not changed; see migration safety in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). |
| Browser approval journey | NOT RUN | Recorder child agent unavailable; HTTP probe only. |
| Physical two-laptop classroom | NOT RUN | Owner must run the Windows LAN guide. |
| Camera/microphone/remote media and TURN | NOT RUN | No physical devices or TURN test performed. |
| Recording helper/source switching | PASS (unit tests) | Five unit tests cover stable output track, source updates, audio retention, aspect fit, error reporting, and cleanup. |
| Actual recording/playback/A-V and caption synchronization | NOT RUN | No real MediaRecorder output was created or inspected. |
| Accessibility UI, real translation, avatar rendering/qualified ISL review | NOT RUN | No browser/provider/device acceptance. All 100 ISL entries remain experimental. |
| Cross-worker notifications | BLOCKED | Process-local hub; shared broker is not configured. |
| Docker-based validation | BLOCKED | Docker command unavailable. |

## Phase 12 validation

- Backend regression suite rerun: **PASS**, 43 passed.
- Frontend tests rerun: **PASS**, 25 passed.
- Production build: **NOT RUN** in Phase 12, as requested; the Phase 11 build result remains historical evidence only.
- Local live approval/rejection workflow: **PASS** using a disposable SQLite database and same-machine HTTP/WebSocket clients through the server laptop's LAN-hosted Vite origin. Teacher notifications, persistence, approval/membership, rejection/no membership, pending/rejected socket denial (4403), approved connection (`ready`), and approved reconnect were observed.
- API health and LAN-origin CORS preflight: **PASS**, HTTP 200; allowed origin was `http://192.168.205.101:5173`.
- Physical second-laptop access, browser-driven UI, real camera/microphone/WebRTC media, screen share, recording playback/synchronization, captions, translation, and accessibility acceptance: **NOT RUN**.
- The Wi-Fi profile was **Public**. No firewall profile or rule was changed. A local request to the server's own LAN address does not prove access from another laptop.
- No migration or operation against the configured application database was performed. The Phase 12 disposable database/storage directory was removed after the services were stopped.

See [docs/TEST_REPORT.md](./docs/TEST_REPORT.md) for evidence and
[docs/REAL_WORLD_TEST_GUIDE.md](./docs/REAL_WORLD_TEST_GUIDE.md) for the
owner-run two-laptop procedure.

## Phase 11 work completed

- Started FastAPI and Vite locally using an isolated temporary SQLite database
  and storage directory. Confirmed API health and frontend HTTP readiness;
  configured application data was not used.
- Added `frontend/src/lib/recordingCapture.js`. The teacher recorder now uses a
  stable canvas video track that draws the current local preview and combines
  it with microphone audio. Camera/screen-share changes therefore do not
  mutate the MediaRecorder input track set. Stopping teacher media also stops
  and saves an active recording instead of leaving a canvas-only recording.
- Added five unit tests for stable track identity across source changes,
  retained audio, portrait aspect fitting, unsupported browser capture, and
  generated-track/frame cleanup.
- Added a standalone frontend runtime eval plan. The test/build/HTTP assertions
  passed; a Playwright recording was not run because the required recorder
  child was unavailable. The HTTP probe does not establish browser behavior.
- Expanded the Windows two-laptop instructions and feature checklist. No
  physical device testing is claimed.

## Safety and product constraints

- Do not delete, reset, stamp, or upgrade the configured database. The Phase 11
  app startup used a unique `%TEMP%` database; no Alembic operation ran.
- Never expose production TURN credentials in `VITE_*` variables.
- Use a trusted HTTPS/WSS origin for camera, microphone, and screen-capture
  trials from a second laptop; LAN HTTP is only suitable for basic API/UI checks.
- Do not describe ISL animations as interpreter-verified; no qualified review
  evidence exists.
- Do not claim browser, real media, or physical-device checks that remain
  NOT RUN.

## Next actions

1. Follow [docs/REAL_WORLD_TEST_GUIDE.md](./docs/REAL_WORLD_TEST_GUIDE.md) with
   a disposable DB, two laptops, and test-only accounts.
2. Verify teacher/student authentication, classroom creation, request,
   approval/rejection, refresh persistence, and authenticated WebSocket access.
3. Use trusted HTTPS/WSS to test camera/microphone delivery, screen sharing,
   multiple students, reconnects, and cleanup.
4. Record a real camera-to-screen-share MediaRecorder transition; inspect
   playback and compare audio/caption timing.
5. Test captions, real translation providers, Hearing/Deaf mode, reduced
   motion, avatar rendering, attendance, and materials.
6. Configure TURN securely and confirm a selected `relay` candidate on a
   restricted network.
7. Conduct qualified ISL review; retain experimental status until documented.
8. Prepare a schema-specific migration plan only after a production backup,
   disposable clone, and schema comparison; never blindly stamp or upgrade.
9. Add shared notification pub/sub and cross-worker integration tests before
   multi-worker deployment.
