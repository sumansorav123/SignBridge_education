# SignBridge handover — Phase 12

Read [PROJECT_PROGRESS.md](./PROJECT_PROGRESS.md),
[docs/TEST_REPORT.md](./docs/TEST_REPORT.md),
[docs/REAL_WORLD_TEST_GUIDE.md](./docs/REAL_WORLD_TEST_GUIDE.md),
[docs/CLASSROOM_APPROVAL_WORKFLOW.md](./docs/CLASSROOM_APPROVAL_WORKFLOW.md),
[docs/FEATURE_STATUS.md](./docs/FEATURE_STATUS.md), and
[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).

## Current state

Phase 12 backend tests: **43 passed**; frontend tests: **25 passed**. A live
scripted HTTP/WebSocket exercise against a disposable SQLite service verified
request persistence, teacher request notification, approval + membership,
rejection without membership, pending/rejected socket denial (4403), and an
approved student's connection and reconnect. Same-machine Vite-proxied health
returned HTTP 200, and the backend allowed the LAN frontend's CORS preflight.
This was not a browser-driven UI flow or a second-laptop test.

The production build was **NOT RUN** in Phase 12 because the user requested no
rebuild; the Phase 11 successful build is historical evidence. Physical LAN,
camera/microphone, actual WebRTC media, screen share, real recording/playback,
caption/translation, and accessibility acceptance remain **NOT RUN**.
The active Wi-Fi profile was Public; firewall settings were not changed.
Notifications remain process-local; no cross-worker delivery was tested.

The configured SQLite database was not used, migrated, stamped, reset, or
deleted. Local startup used a unique temporary SQLite database and storage
directory, with demo seeding disabled. No Alembic command was run in Phase 12.
The exact Phase 12 temporary database/storage directory was removed after
stopping the owned backend and Vite sessions.

## Phase 11 recording fix (media acceptance still pending)

Before the fix, `MediaRecorder` received the `media.stream` active at start.
Screen-share changes create a new stream and WebRTC replaces sender tracks,
but the original recorder stream did not change; a recording could keep
capturing the camera when sharing began mid-recording.

`frontend/src/lib/recordingCapture.js` now supplies a stable canvas-captured
video track that draws the current local preview, combined with active
microphone audio. `LiveClassroom` disposes generated capture tracks on stop,
failure, and unmount; stopping teacher media stops/saves an active recording
before source tracks are stopped. Five unit tests cover source changes, track stability,
audio preservation, aspect fit, unsupported browsers, and cleanup. Actual
MediaRecorder content, playback, A/V sync, caption timing, and screen-share
capture are still **NOT RUN**.

## Important constraints

- The existing configured SQLite DB is unversioned but already contains the
  join-request table. A direct upgrade failed on a disposable clone because
  the initial migration tried to create existing tables. Never blindly stamp
  or upgrade; inspect and validate a backup/clone first.
- Notifications use a process-local hub. Cross-worker delivery is **BLOCKED**
  until shared pub/sub is implemented and tested; REST refresh remains the
  source of truth.
- All 100 ISL entries remain experimental; zero have qualified review.
- LAN HTTP may support API/approval checks, but remote camera, microphone, and
  screen capture need trusted HTTPS/WSS on both laptops.
- Browser UI/E2E was **NOT RUN** in Phase 12. The scripted HTTP/WebSocket run
  did not exercise the browser UI; prior Playwright recorder availability
  limitations remain.

## Next actions

1. Follow `docs/REAL_WORLD_TEST_GUIDE.md` with two laptops, a new disposable
   database/storage directory, and synthetic test accounts.
2. Verify teacher/student browser sign-in, classroom creation, request,
   approval/rejection, reload persistence, and authenticated WebSocket access.
3. Use trusted HTTPS/WSS to test camera/microphone, live subtitles,
   translations, Deaf Mode, avatar display, screen sharing, multiple students,
   attendance, and materials.
4. Record a real camera-to-screen-share MediaRecorder transition; inspect
   saved playback, audio, caption alignment, and cleanup.
5. Test network recovery and TURN relay selection on a restricted network.
6. Arrange qualified ISL review; do not mark signs verified before evidence.
7. Prepare a schema-specific migration only after a production backup, clone,
   and schema comparison. Do not alter the actual DB during experiments.
8. Add shared notification pub/sub before multi-worker deployment.

## Phase 12 validation commands

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q

Set-Location ..\frontend
npm test
```

The Phase 12 frontend production build was intentionally not run. Full
Phase 12 evidence and PASS / FAIL / BLOCKED / NOT RUN statuses are in
`docs/TEST_REPORT.md`, `docs/FEATURE_STATUS.md`, and
`docs/REAL_WORLD_TEST_GUIDE.md`. The next owner should follow the two-laptop
procedure in that guide on a trusted Private LAN, then use a trusted HTTPS/WSS
origin for media.
