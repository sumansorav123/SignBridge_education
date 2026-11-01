# SignBridge test report

**Validation date:** 2026-11-01  
**Scope:** Phase 12 physical acceptance preparation and Phase 11 local validation / recording-source fix  
**Workspace:** SignBridge repository in the current Windows environment  
**Rule:** Automated checks do not imply physical-device, actual media, or qualified ISL validation.

## Phase 12 results

| Test / check | Status | Evidence / limitation |
|---|---|---|
| Backend regression suite rerun | **PASS** | `Set-Location backend; ..\.venv\Scripts\python.exe -m pytest -q` — exit 0; 43 passed. Existing pytest deprecation warnings only. |
| Frontend unit tests rerun | **PASS** | `Set-Location frontend; npm test` — exit 0; 25 passed, 0 failed. |
| Production build | **NOT RUN** | Explicit Phase 12 instruction was not to rebuild; Phase 11 build success is historical and not a Phase 12 result. |
| Local API health through LAN-hosted Vite | **PASS** | `http://192.168.205.101:5173/api/health` returned HTTP 200 on the server laptop. This was not a request from a second device. |
| CORS preflight for the LAN frontend origin | **PASS** | `OPTIONS http://127.0.0.1:8000/api/auth/login`, with Origin `http://192.168.205.101:5173`, returned 200 and `Access-Control-Allow-Origin` matched that origin. |
| Live teacher/student request, approval, and rejection | **PASS (single process, scripted HTTP/WebSocket)** | A disposable SQLite database was used. Teacher received the pending-request event; pending student socket was denied with 4403; approved request persisted and created membership; student received approval event, connected with `ready`, and reconnected; rejected request persisted without membership, sent rejection event, and socket access was denied with 4403. This was not a browser UI or second-laptop test. The one-off driver was not saved as a reusable repository command. |
| Teacher sign-in page rendering at the LAN origin | **PASS (page load only)** | The shared browser loaded and rendered the teacher login route at the LAN-hosted frontend. No login or classroom UI journey was performed. |
| Student/teacher browser flow and refresh UI behavior | **NOT RUN** | No browser-driven sign-in, approval page, or UI refresh test was performed. |
| Second-laptop same-Wi-Fi access | **NOT RUN** | The server's Wi-Fi IPv4 was `192.168.205.101`; testing the address locally is not evidence of remote access. No second-client request was made. |
| Firewall readiness for external LAN clients | **BLOCKED** | Active Wi-Fi profile was Public; Windows Firewall was enabled. No rule/profile changes were made. |
| Real camera, microphone, remote WebRTC media, screen share, and network interruption | **NOT RUN** | No physical-device or actual media session was performed. |
| Actual recording output and playback/synchronization | **NOT RUN** | Phase 12 did not create or inspect a real MediaRecorder output. |
| Captions, translation, Hearing/Deaf Mode, avatar, reduced motion, attendance, and materials acceptance | **NOT RUN** | No browser/device acceptance was performed. ISL content remains experimental and has no qualified review evidence. |
| Configured database / Alembic | **PASS (safety)** | No Alembic command was run and the configured application database was not modified. Phase 12 used and then removed only its disposable database/storage directory. |
| Phase 12 full standalone runtime eval plan | **NOT RUN** | The existing frontend plan includes `npm run build`; it was not run because Phase 12 explicitly prohibited rebuilding. The separate frontend tests were run directly. |
| Phase 12 server cleanup | **PASS** | The owned backend and Vite sessions were stopped; subsequent health probes to `127.0.0.1:8000` and `192.168.205.101:5173` failed to connect. The exact disposable Phase 12 directory was removed. |

### Phase 12 commands and observed output

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
# 43 passed, exit 0

Set-Location ..\frontend
npm test
# 25 passed, 0 failed, exit 0

Invoke-WebRequest -Uri 'http://192.168.205.101:5173/api/health' -TimeoutSec 10
# HTTP 200 (from the server laptop)

$headers = @{
  Origin = 'http://192.168.205.101:5173'
  'Access-Control-Request-Method' = 'POST'
  'Access-Control-Request-Headers' = 'authorization,content-type'
}
Invoke-WebRequest -Uri 'http://127.0.0.1:8000/api/auth/login' `
  -Method Options -Headers $headers -TimeoutSec 10
# HTTP 200; Access-Control-Allow-Origin matched the LAN frontend origin
```

The workflow exercise used a one-off in-session HTTP/WebSocket driver against
the disposable service, not a saved/repeatable CLI script. It exercised the
approval and rejection states described above, but did not use a browser UI.
The first harness attempt used `.test` email domains and received HTTP 422;
the inputs were changed to accepted, unique test addresses. Reusing an address
then received the expected HTTP 409 duplicate-account response; unique
addresses were used on retry. These were harness-data errors, not application
code failures, and required no source change.
The host Wi-Fi profile was Public. No firewall rule or network-profile change
was made. Old browser logs included `ERR_CONNECTION_REFUSED` for
`localhost:5173` before the frontend service started; after startup, the
teacher login page rendered over the LAN origin. No Phase 12 browser console
trace was captured after startup, so this is not evidence of a clean browser
journey.

## Status summary

| Test / check | Status | Evidence / limitation |
|---|---|---|
| Docker capability | **BLOCKED** | `Get-Command docker` found no Docker command. |
| Node.js capability | **PASS** | `node --version` returned `v24.21.0`. |
| Playwright/browser capability | **BLOCKED for recorded E2E** | Cached Playwright/Chromium was noted in Phase 10, but the required JSTS Playwright Spec Author child is unavailable in this session. Per workflow, used an HTTP-probe fallback; no Phase 11 browser flow was recorded. |
| Backend full suite | **PASS** | `Set-Location backend; ..\.venv\Scripts\python.exe -m pytest -q` — exit 0; 43 passed. |
| Backend classroom approval / rejection / ownership / rollback | **PASS** | Included in full suite; verifies persisted states, notifications, membership, denied unauthorized WS and approved WS reconnect. |
| Frontend unit tests | **PASS** | `Set-Location frontend; npm test` — exit 0; 25 passed, including five recording-capture tests. |
| Frontend production build | **PASS** | `Set-Location frontend; npm run build` — exit 0 after the recording fix. |
| Python compilation | **PASS** | `Set-Location backend; ..\.venv\Scripts\python.exe -m compileall -q app tests` — exit 0. |
| Alembic chain | **PASS** | `python -m alembic heads` returned the sole head `20261101_join_requests`. |
| Alembic clean-database migration | **PASS** | Full chain upgraded an isolated, empty SQLite DB to `20261101_join_requests`; verified `classroom_join_requests` exists. |
| Configured database inspection | **PASS** | Local config points to SQLite file `backend/signbridge.db`; file exists, has no `alembic_version`, and already has `classroom_join_requests`. |
| Direct upgrade of unversioned existing-schema clone | **FAIL (expected unsafe path)** | `upgrade head` hit `table sign_language_animations already exists` at the initial revision; this demonstrates why direct upgrade is unsafe for the current unversioned schema. |
| Baseline comparison on disposable clone | **PASS** | Only the clone was stamped at head; `alembic check` reported no schema drift. This does not authorize stamping another database without repeating backup/clone/schema verification. |
| Migration of configured application database | **BLOCKED** | Actual DB remains unversioned and unchanged; no application or production database was stamped/upgraded. |
| Local application startup | **PASS (isolated test DB)** | Phase 11 started FastAPI on `127.0.0.1:8000` and Vite on `127.0.0.1:5173`. Health returned HTTP 200 with database `ok`, 0 reviewed / 100 experimental ISL entries, and first-message WebSocket auth. |
| Frontend runtime eval plan | **PASS, HTTP fallback** | Standalone evaluator ran 3 assertions: tests, production build, and Vite root HTTP probe. All exited successfully; Node test-count parsing was unavailable in the evaluator, so use the direct `npm test` output for the 25-test count. |
| Browser landing-page smoke | **PASS, Phase 10 limited** | Integrated browser rendered landing page. Horizontal overflow check at 320, 375, 430, 768, 1024, 1440, and 1920 CSS px: none on that page only. This is not a Phase 11 classroom/browser journey. |
| Browser approval end-to-end | **NOT RUN** | No complete teacher + student browser journey was executed; the recorder child agent was unavailable. |
| Physical two-laptop / same-Wi-Fi test | **NOT RUN** | Requires physical devices and LAN environment. |
| Camera/microphone actual media delivery | **NOT RUN** | Automated signaling does not verify capture devices or remote media playback. |
| STUN/TURN traversal / relay candidate | **NOT RUN** | No TURN server or restricted-network test was configured. |
| Multi-student WebRTC load | **NOT RUN** | No multi-device media or resource test. |
| Hearing/Deaf visual accessibility in browser | **NOT RUN** | API and preference behavior covered by backend tests; page-level user testing pending. |
| Live speech recognition / real provider translation | **NOT RUN** | Requires supported browser, microphone, and provider credentials/network. |
| Experimental avatar visual and qualified ISL review | **NOT RUN** | No rendered avatar acceptance or qualified interpreter review. Automated catalog guard confirms 0 reviewed entries. |
| Recording capture-source switching | **PASS (unit/source composition)** | Five new unit tests verify a stable canvas video track samples the current local video element across source changes, preserves microphone audio, letterboxes the source, reports frame errors, cleans up, and rejects unsupported canvas capture. Actual MediaRecorder output and A/V sync remain **NOT RUN**. |
| Recording lifecycle / actual audio-video sync / screen-share recording | **NOT RUN** | Backend playback/access tests pass; no physical/browser recording or playback was performed in Phase 11. |
| Reduced-motion browser interaction | **NOT RUN** | CSS and avatar preference handling found in source; runtime accessibility test pending. |
| Cross-worker notification delivery | **BLOCKED** | Current hub is process-local; no shared broker configured or deployed. |
| Docker-based database validation | **BLOCKED** | Docker command unavailable in this environment. SQLite migration/testing used instead. |
| Playwright suite | **NOT RUN** | No repository Playwright E2E suite exists; required recorder child agent was unavailable. The HTTP-probe fallback verified only Vite's root response. |

## Detailed automated evidence

### Backend

Command:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
```

Result: **PASS**, exit code 0, **43 passed**. Includes tests for the classroom approval flow, request/rejection notifications, authentication, enrollment-gated classroom socket access, live caption pipeline, WebRTC signaling offers/answers, translation status/fallback, recording access/playback authorization, and student preference behavior.

An approval rollback test injects an enrollment persistence failure and confirms
the request remains pending and no enrollment exists. A join integration test
verifies approval creates active membership, an approved student can open and
reopen the classroom socket, a rejected student has no membership and receives
4403, and an unrelated teacher cannot approve another teacher's request.

The health endpoint was corrected during this audit: it now reports the actual
ISL catalog count and first-message WebSocket auth, rather than claiming 100
verified signs or accepting URL-token authentication. The full backend suite
passed after this correction.

### Frontend

Commands:

```powershell
Set-Location frontend
npm test
npm run build
```

Results: **PASS**, `npm test` exit code 0 with 25 passing tests; build exit
code 0. Pure logic tests do not exercise React rendering, the camera, WebRTC,
the avatar, or real providers.

Five new `recordingCapture` tests verify the stable canvas-output track samples
the current local video element as its `srcObject` changes, microphone audio is
preserved, portrait video is letterboxed, generated tracks/animation frames are
cleaned up, and unsupported canvas capture fails explicitly. These use fakes;
they do not prove actual MediaRecorder output.

An intermediate run while adding frame-error reporting failed four recording
tests with `ReferenceError: error is not defined`. The callback had been placed
outside the `drawImage` catch block; it was moved into that catch, and the final
direct test run passed all 25 tests (exit 0).

The Phase 11 standalone runtime plan reported all three assertions passing:
frontend tests (exit 0), production build (exit 0), and Vite root HTTP probe
(200). Its test-count parser could not parse Node's test output and recorded
zero parsed counts; the direct `npm test` output is the source for the 25-pass
count. The plan is
[`eval-plan.json`](../frontend/.tsupgrader/runtime-validation/eval-plan.json);
the evaluator result is saved under
`frontend/.tsupgrader/runtime-validation/standalone-result.json`.

The Phase 10 integrated browser rendered only the landing page and checked
horizontal overflow at seven widths. Phase 11 did not exercise a browser
journey. The required Playwright recorder child was unavailable, so validation
used the HTTP-probe fallback. No classroom, registration, dashboard,
accessibility, or cross-device E2E run is claimed.

An initial `npm test` from the repository root failed with `ENOENT` because the
frontend `package.json` is in `frontend/`; an initial root-level pytest command
failed collection with `ModuleNotFoundError: app`. Both were rerun from their
project directories with the explicit backend virtual-environment interpreter
and passed. These were working-directory mistakes, not application failures.

### Phase 11 local startup and HTTP evidence

The app was started only with a unique disposable SQLite database and
disposable storage under
`C:\Users\Hello\AppData\Local\Temp\SignBridge-Phase11-64f63789fe73433797a89e018793929b`;
the configured
`backend/signbridge.db` was not opened or changed. `AUTO_CREATE_TABLES=true`
created schema only in that temporary database. No Alembic migration or stamp
was run.

```powershell
# Backend, from repository root
$env:DATABASE_URL = 'sqlite:///C:/Users/Hello/AppData/Local/Temp/SignBridge-Phase11-64f63789fe73433797a89e018793929b/validation.db'
$env:STORAGE_ROOT = 'C:\Users\Hello\AppData\Local\Temp\SignBridge-Phase11-64f63789fe73433797a89e018793929b\storage'
$env:SEED_DEMO_DATA = 'false'
$env:AUTO_CREATE_TABLES = 'true'
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend
Set-Location frontend
npm run dev -- --host 127.0.0.1
```

The first readiness probe ran before both background servers completed startup
and returned a connection error/timeout. After Uvicorn and Vite printed their
ready messages, `Invoke-WebRequest http://127.0.0.1:8000/api/health` returned **200** with
database status `ok`, 0 reviewed / 100 experimental ISL entries, and
`url_token_auth: false`. `Invoke-WebRequest http://127.0.0.1:5173/` returned
**200**. This verifies startup and HTTP readiness only; no auth, classroom,
WebSocket, or browser journey was run. Both owned processes were stopped.

### Database and migration

The migration graph reports one head, `20261101_join_requests`. The full
migration chain passed on an empty disposable SQLite database. The configured
local database was inspected read-only: it is SQLite, has no Alembic version
table, and already contains the join request table. Its backup clone failed a
direct `upgrade head` because the initial revision attempted to create existing
tables. On that clone only, `stamp head` followed by `alembic check` reported
no schema drift.

**The configured database and any production database were not migrated,
stamped, deleted, or reset.** Do not apply a generic migration command to an
existing unversioned schema. See [DEPLOYMENT.md](./DEPLOYMENT.md) for the safe
schema-specific process.

## Findings and follow-up

1. **Health metadata was inaccurate:** API health previously reported
   `verified_isl_entries: 100` and claimed deprecated query-string WebSocket
   authentication remained supported. Source and catalog review showed all
   entries experimental and the WebSocket implementation required first-message
   authentication. Fixed and covered by `test_health`.
2. **Recording screen-share capture root cause and fix:** before Phase 11,
   `MediaRecorder` received the `media.stream` active at recording start.
   `useLocalMedia` creates a new stream when switching between camera and
   screen-share, and `useWebRTC` replaces sender tracks; neither changes the
   original MediaRecorder stream. The old recorder input could therefore keep
   capturing the camera if screen sharing began during recording. The recorder
   now uses a stable canvas-captured video track that draws the current teacher
   preview, plus the active microphone tracks. Source changes update the
   preview element sampled by the canvas without mutating the recorder's track
   set. Stopping teacher media now stops/saves any active recording before
   stopping the source tracks. Helper unit tests and the production build pass;
   the UI stop-media path has not been browser-tested. Actual recording,
   playback, screen-share content, audio synchronization, and caption drift
   remain **NOT RUN**.
3. **Notifications are process-local:** production multi-worker fan-out needs a
   shared broker. Redis Pub/Sub is a practical best-effort event fan-out option;
   REST refresh remains authoritative. No broker code or dependency has been
   added.
4. **No real-world acceptance:** the manual test checklist is in
   [REAL_WORLD_TEST_GUIDE.md](./REAL_WORLD_TEST_GUIDE.md). Physical devices,
   actual media tracks, TURN relay, provider translations, avatar rendering,
   recording synchronization, and interpreter sign-off remain unverified.

## Live classroom and feature audit

These are source-path findings supported where applicable by the automated
tests above. Static inspection is not equivalent to a device/runtime pass.

| Area | Audit finding | Status |
|---|---|---|
| Teacher join-request notification | Request insert commits before publish; authenticated `/ws/notifications` delivers to in-process user subscribers. Integration test receives the teacher event and REST refresh recovers state. | **PASS** in single-process integration |
| Student approval / rejection notification | Review commits before event publish; integration tests verify both events/statuses. REST request history remains authoritative. | **PASS** in single-process integration |
| Membership authorization | Classroom access checks teacher ownership or active student enrollment. Approval creates enrollment in the same DB transaction as status change; injected enrollment failure leaves pending/no membership. | **PASS** automated |
| Pending/rejected WebSocket access | Authenticated pending and rejected students receive close code 4403; approved student receives `ready` and reconnects. Missing/invalid/expired auth has separate 4401 behavior covered by tests. | **PASS** automated |
| Teacher media capture | `useLocalMedia` calls `getUserMedia` for audio/video, maps permission/device errors, and stops tracks on cleanup. `LiveClassroom` sends the stream to peer connections. No device was accessed. | **NOT RUN** on hardware |
| Student media reception | Student peer uses `ontrack` and passes received stream to remote video UI. Browser mute/autoplay/device behavior has not been exercised. | **NOT RUN** on hardware |
| ICE exchange | Candidates are sent as `webrtc-ice`, parsed/queued until remote description, deduplicated, then added. Backend integration tests exercise offer/answer signaling, not real ICE gathering or candidate-pair selection. | Signaling **PASS**; media/ICE **NOT RUN** |
| STUN/TURN | Defaults include public Google STUN. TURN can be configured through `VITE_TURN_*`, which exposes static credentials in the client bundle. No short-lived credential endpoint or real TURN service is configured. | STUN/TURN traversal **NOT RUN**; production TURN setup **BLOCKED** |
| Peer retry / reconnect | Hook has a 5-second disconnect grace period, bounded backoff, per-peer retry timers, and cleanup. Helper tests pass; actual Wi-Fi loss/recovery and multi-peer race behavior not tested. | Logic tests **PASS**; physical reconnect **NOT RUN** |
| Multiple students | Teacher keeps peers keyed per student connection and sends its stream separately to each requesting student. No multi-device performance/resource measurement was run. | Implementation inspected; load test **NOT RUN** |
| Screen-share track replacement | `useLocalMedia` publishes the screen video track with camera microphone audio; `replaceTracks` calls `RTCRtpSender.replaceTrack`. Share stop restores the camera stream at the WebRTC layer. | Source inspected; browser **NOT RUN** |
| Disconnect cleanup | `useWebRTC` closes peer connections and clears retry timers; local media hook stops camera/screen tracks on stop/unmount. | Source inspected; device cleanup **NOT RUN** |
| Hearing/Deaf mode and captions | Backend preference and caption tests pass, including the live caption pipeline. Responsive classroom UI and assistive-technology operation were not browser-tested. | Backend **PASS**; UI **NOT RUN** |
| Translation | Backend status/fallback tests pass. Runtime output from the isolated app reported MyMemory active, but no real provider/pair acceptance was done during this task. | Fallback **PASS**; provider accuracy **NOT RUN** |
| ISL avatar and review status | Catalog enforces reviewer evidence; 100 entries report experimental and zero reviewed. Pose/lexicon unit tests pass; avatar was not rendered or reviewed by a qualified interpreter. | Review safeguard **PASS**; visual/qualified review **NOT RUN** |
| Reduced motion | Global CSS has a `prefers-reduced-motion` override and avatar checks the media query. No browser/OS preference interaction was tested. | Source inspected; runtime **NOT RUN** |
| Recording capture and timing | Backend recording authorization/playback tests pass; playback checks active enrollment and teacher ownership. `LiveClassroom` records a stable canvas video track that draws the current teacher preview and includes the active microphone tracks; lecture-relative `start_offset_ms` remains unchanged. Unit tests cover stream composition and cleanup. Real A/V and caption drift are unknown. | Authorization and capture-helper unit tests **PASS**; actual recording/sync **NOT RUN** |
| Screen-share recording | Root cause fixed: the old recorder held the stream active at start. Canvas capture now samples the preview element as it changes between camera and share, while preserving the recorder input track set. Display capture still requests `audio:false`; system audio is not included. | Helper tests **PASS**; actual recorded camera-to-share transition **NOT RUN** |
| Responsive UI | Landing page rendered without horizontal overflow at seven widths. Registration/dashboard/classroom screens were not included in browser smoke. | Landing smoke **PASS**; remaining pages **NOT RUN** |
| Multi-worker event fan-out | Notification hub is per-process memory and cannot reach subscribers on another worker. Redis Pub/Sub can fan committed events to worker-local hubs; it is non-durable, so retain REST polling/recovery. | Cross-worker test **BLOCKED**; broker not implemented |

## Runbook

Use the checklist in [REAL_WORLD_TEST_GUIDE.md](./REAL_WORLD_TEST_GUIDE.md).
Record each manual test as **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN**
with sanitised evidence. Do not mark the project ready for production until
physical classroom and required accessibility/recording acceptance criteria
are completed.
