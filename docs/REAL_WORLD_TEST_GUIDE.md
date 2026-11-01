# SignBridge real-world classroom test guide

This is a manual acceptance guide for a real classroom session. Automated API
and browser smoke results do not replace these device, media, network, and
accessibility checks. Record the date, app version/commit, browser versions,
server LAN address, network type, and tester initials before starting. Never
record real student personal information in evidence; use test accounts.

## Status convention

Use **PASS**, **FAIL**, **BLOCKED**, or **NOT RUN** per scenario. Attach
sanitised evidence (timestamps, console/network errors, WebRTC stats, and
screenshots with personal details removed). Do not mark a scenario passed from
code inspection alone.

## Setup and safety

1. Use a disposable test database, not the current application database.
2. Ensure the server and all clients use the same backend/database. Do not use
   `localhost` as the backend host from a second device.
3. Use HTTPS/WSS for camera, microphone, and screen-capture trials. Browser
   media APIs may be blocked on LAN HTTP.
4. Configure exact `CORS_ORIGINS`; configure real TURN credentials only in a
   protected server-side environment. Never put production TURN secrets in
   `VITE_*` variables.
5. Use current Chrome or Edge on all devices for baseline. Record the exact
   versions and OS. Do not use real student accounts.
6. Confirm `/api/health` reports a healthy database and reports ISL entries as
   experimental unless qualified interpreter evidence exists.
7. Prepare one teacher account and at least three student accounts. Use one
   student for approval, one for rejection, and one for the multi-student /
   reconnect checks.

## Phase 11 local validation baseline

| Check | Status | Evidence / boundary |
|---|---|---|
| Backend automated suite | PASS | 43 passed, exit 0. Includes approval, rejection, ownership, transaction rollback, and classroom WebSocket access tests. |
| Frontend automated tests | PASS | 25 passed, exit 0, including five recording-capture helper tests. |
| Frontend production build | PASS | `npm run build`, exit 0. |
| Backend Python compilation | PASS | `python -m compileall -q app tests`, exit 0. |
| FastAPI/Vite disposable local startup | PASS | `/api/health` and Vite `/` each returned HTTP 200; temporary SQLite only. |
| Playwright/browser approval journey | NOT RUN | Recorder child unavailable; HTTP-probe fallback used. |
| Physical two-laptop/media acceptance | NOT RUN | Requires project-owner devices and a trusted HTTPS LAN origin. |
| Actual MediaRecorder output and caption/audio synchronization | NOT RUN | Unit tests do not create or inspect a real recording. |

Commands used (run from the repository root):

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m compileall -q app tests

Set-Location ..\frontend
npm test
npm run build
```

The local startup test set `DATABASE_URL` and `STORAGE_ROOT` to a unique
`%TEMP%\SignBridge-Phase11-*` location, with `SEED_DEMO_DATA=false`; it did not
open or alter the configured application database. The test only proves local
process startup and HTTP readiness, not a browser sign-in or classroom flow.

## Phase 12 local live-workflow evidence

| Check | Status | Evidence / boundary |
|---|---|---|
| Backend regression tests | **PASS** | 43 passed, exit 0. |
| Frontend unit tests | **PASS** | 25 passed, 0 failed. |
| LAN-origin frontend/API health | **PASS (same machine only)** | Server laptop IPv4 was `192.168.205.101`; Vite-proxied `/api/health` returned 200 from that laptop. This does not verify a remote client. |
| CORS preflight | **PASS** | Origin `http://192.168.205.101:5173` was allowed by the backend. |
| Scripted live join-request/approval/rejection WebSocket flow | **PASS (single process)** | Teacher received request; pending student denied with 4403; approval persisted membership and delivered a notification; approved student connected and reconnected; rejection delivered a notification and denied classroom access without membership. No browser UI was used. |
| Teacher login route page load | **PASS (page load only)** | Shared browser rendered the teacher login page from the LAN origin; no sign-in or classroom controls were exercised. |
| Browser-driven flow / refresh persistence | **NOT RUN** | A browser did not sign in or operate the dashboard/waiting page during Phase 12. |
| Second laptop and same-Wi-Fi client access | **NOT RUN** | No remote client request was made; same-machine access is not physical LAN evidence. |
| Firewall readiness for external LAN clients | **BLOCKED** | Active server Wi-Fi profile was Public and Windows Firewall was enabled; no firewall/profile changes were made. |
| Camera, microphone, WebRTC media, screen share, and interruption recovery | **NOT RUN** | No physical devices or live media tracks were tested. |
| Recording capture, saved playback, A/V sync, caption alignment | **NOT RUN** | No real recording was created or inspected. Helper tests are not media acceptance. |
| Accessibility UI, translation provider, avatar, attendance, and learning materials | **NOT RUN** | No browser/device acceptance was performed. ISL remains experimental. |
| Configured database safety | **PASS** | No migration/stamp/upgrade was run against the configured database. The disposable Phase 12 database was removed after the local services stopped. |
| Production build in Phase 12 | **NOT RUN** | Intentionally skipped to comply with the no-rebuild instruction; Phase 11 result is historical only. |

The temporary test origin `192.168.205.101` is specific to this run and will
change across networks. A request to that address from the server laptop proves
only local reachability. Current firewall/profile evidence is not permission
to open a port on a Public profile; use a trusted Private LAN and a narrowly
scoped rule only after the owner confirms the network is trusted.

The scripted workflow driver was not saved as a reusable repository command.
The exact owner-run procedure below is still required for browser and physical
acceptance. Keep the checklist rows in sections A–F marked **NOT RUN** until
the corresponding browser/device actions are performed and evidence is
recorded.

Harness issues during this run were corrected without changing application
code: special-use `.test` email domains were rejected with HTTP 422, and a
reused generated address received HTTP 409. Retries used accepted unique test
addresses. The browser also logged `ERR_CONNECTION_REFUSED` for the old
`localhost:5173` address before Vite was ready; the login route rendered after
the server started. No post-start browser console trace was captured.

## Windows PowerShell: two laptops on one Wi-Fi network

Use the teacher laptop as the sole server. Pick a **new, empty** test-data
folder and disposable database; never point this test at the configured or
production database. Keep PowerShell window 1 (backend) and window 2 (frontend)
open while testing.

### 1. Find the server laptop IPv4 address

On the teacher/server laptop:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notmatch '^127\.' -and
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet'
  } |
  Select-Object InterfaceAlias, IPAddress
```

Choose the IPv4 address for the Wi-Fi adapter, for example `192.168.1.25`.
Confirm both laptops are on the same Wi-Fi/subnet and that the access point
does not enable client/AP isolation.

### 2. Start a disposable backend on the server laptop

Use a new empty directory. If `C:\SignBridgePhase11Test` already exists, choose
a different path rather than reusing or deleting it.

```powershell
$testRoot = 'C:\SignBridgePhase11Test'
if (Test-Path $testRoot) {
  throw 'Choose a new, empty test folder; do not reuse existing application data.'
}
New-Item -ItemType Directory -Path $testRoot | Out-Null
New-Item -ItemType Directory -Path (Join-Path $testRoot 'storage') | Out-Null
$env:DATABASE_URL = 'sqlite:///C:/SignBridgePhase11Test/signbridge-test.db'
$env:STORAGE_ROOT = 'C:\SignBridgePhase11Test\storage'
$env:SEED_DEMO_DATA = 'false'
$env:AUTO_CREATE_TABLES = 'true'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://<SERVER-IP>:5173'
Set-Location C:\path\to\SignBridge\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Replace `<SERVER-IP>` with the Wi-Fi IPv4, and replace the repository path.
Adjust the Python path if the virtual environment is elsewhere. The backend
can stay bound to loopback when Vite on that same laptop proxies API and
WebSocket requests. Do not expose port 8000 to the LAN unless direct browser
API access is intentionally configured and protected.

### 3. Start the frontend on the server laptop

In a second PowerShell window:

```powershell
Set-Location C:\path\to\SignBridge\frontend
$env:VITE_API_URL = ''
$env:VITE_WS_URL = ''
npm run dev -- --host 0.0.0.0 --strictPort
```

Open `http://<SERVER-IP>:5173` on both laptops for login/join-request/API
checks. The browser must use the server laptop address, not `localhost` or
`127.0.0.1`, on the student laptop. Verify the shared backend from the student
device:

```powershell
Invoke-RestMethod http://<SERVER-IP>:5173/api/health
```

Vite proxies `/api` and `/ws` to the backend on the server laptop. If the Vite
port changes, update the URL and exact `CORS_ORIGINS` entry. If using a direct
API URL instead, configure the backend LAN address, exact CORS origin, and
firewall access deliberately.

### 4. Windows Firewall

For Vite-proxied development, only the Vite TCP port needs an inbound LAN rule.
Run elevated PowerShell on the server laptop and limit the rule to the Private
profile:

```powershell
New-NetFirewallRule `
  -DisplayName 'SignBridge Vite dev (Private LAN)' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 `
  -Profile Private
```

Do not open ports on a Public network profile. Remove the named rule after the
test only if the owner confirms it is no longer needed. With direct API access,
the backend port would also need a carefully scoped rule; the preferred Vite
proxy setup keeps backend port 8000 local.

### 5. Camera, microphone, and screen sharing

LAN HTTP may load the application and support API/approval testing, but it is
not a secure browser context for camera, microphone, or screen capture on a
remote laptop. For media tests, serve the same frontend/API/WebSocket origin
through HTTPS/WSS using a certificate trusted by **both** laptops. Do not
ignore certificate warnings or distribute a private production key. In each
browser, allow camera and microphone for the HTTPS origin, reload, and confirm
the selected devices. Browser screen-share prompts are separate; system audio
availability varies by browser and OS.

The commands above are setup guidance, not evidence that a physical LAN or
media test has passed. Record actual client IPs, browser versions, chosen
devices, ICE candidate type, errors, and statuses in the tables below.

## A. Two laptops on the same Wi-Fi

| # | Action | Expected result / evidence | Status |
|---|---|---|---|
| A1 | Start one backend on loopback behind Vite, one Vite frontend bound to `0.0.0.0`, and one shared disposable DB on the server laptop. | Both devices visit the server LAN origin; `/api/health` is healthy. | NOT RUN |
| A2 | Open the Vite origin on both laptops; use a trusted HTTPS/WSS origin for camera, microphone, and screen-capture trials. | Student browser uses the server laptop's LAN host, never its own `localhost`; API and WebSocket requests reach the server backend. | NOT RUN |
| A3 | Inspect browser network requests and WebSocket URLs on both clients. | API, classroom WS, and notifications WS all reach the same host and server instance/cluster. No credentials in URL except the short-lived recording stream token endpoint's documented contract. | NOT RUN |
| A4 | Sign in as teacher on laptop 1 and an enrolled/test student on laptop 2. | Correct roles appear; both sessions remain authenticated after reload. | NOT RUN |
| A5 | Submit an invalid classroom code as the student. | Clear error; no request, enrollment, or classroom access is created. | NOT RUN |

## B. Join approval, rejection, and persistence

| # | Action | Expected result / evidence | Status |
|---|---|---|---|
| B1 | Teacher creates an active classroom and copies its join code. | Classroom and code are visible to the owner. | NOT RUN |
| B2 | Student submits that code. | Waiting page shows classroom and teacher; status is `pending`; no active enrollment or live classroom socket exists. | NOT RUN |
| B3 | Observe teacher dashboard and relevant classroom without refreshing. | Exactly one new pending request appears and the badge count increments. | NOT RUN |
| B4 | Refresh both pages while request remains pending. | Teacher pending list and student's waiting state are restored from REST; no duplicate request appears. | NOT RUN |
| B5 | Try to approve from a different teacher account. | Request is not disclosed/reviewable (expected 404); request remains pending. | NOT RUN |
| B6 | Owner approves. | Request becomes `approved`, one active enrollment is created, student receives notification and enters classroom. | NOT RUN |
| B7 | Refresh both pages after approval. | Student status remains approved and enrollment remains active; teacher pending count no longer includes it. | NOT RUN |
| B8 | Reconnect the approved student's classroom WS (close/reopen browser tab or reconnect network). | Authenticated socket returns `ready`; student receives current participants/lecture state. | NOT RUN |
| B9 | A second student submits a request; owner rejects it. | Request becomes `rejected`; student sees decline state/message; no membership or classroom WS access. | NOT RUN |
| B10 | Student refreshes after rejection and then submits a fresh code request. | Rejection persists; retry creates a new pending request rather than rewriting old history. | NOT RUN |
| B11 | Cancel a pending request, then refresh both roles. | Request is cancelled, no enrollment exists, teacher list is refreshed, and retry policy allows a new request. | NOT RUN |
| B12 | Attempt a classroom socket with no token, invalid/expired token, pending student, rejected student, and approved student. | Missing/expired authentication closes with 4401; unauthorized classroom access closes with 4403; approved enrollment connects. Query-string auth is rejected. | NOT RUN |

## C. Multiple students, media, and network recovery

Use a third device or a separate browser profile for each student. Verify
participant identity carefully; one browser profile's local storage must not
be shared across roles.

| # | Action | Expected result / evidence | Status |
|---|---|---|---|
| C1 | Connect teacher plus three approved students. | All participants appear once; teacher can request/send the teacher stream to each student. Record per-peer state and CPU/network use. | NOT RUN |
| C2 | Teacher grants camera/microphone permission and starts media. | Local preview displays; tracks are live; students receive video and audio. Confirm playback is not muted by autoplay policy. | NOT RUN |
| C3 | Deny camera and microphone permissions, then grant permissions and retry. | Clear error on denial; UI recovers after permission is allowed; no leaked tracks after stopping. | NOT RUN |
| C4 | Toggle teacher camera and microphone independently. | Remote tracks reflect muted/disabled states and participant-media indicators update. | NOT RUN |
| C5 | Allow ICE gathering and inspect `chrome://webrtc-internals` or browser WebRTC stats. | Record selected candidate pair and transport state. STUN-only success is not evidence that TURN works. | NOT RUN |
| C6 | Repeat from a restricted network with the configured TURN server and direct candidates blocked. | A selected `relay` candidate pair is required to pass the TURN trial. Capture TURN server logs and WebRTC stats. | NOT RUN |
| C7 | Briefly disable Wi-Fi on one student, restore it, and repeat for teacher. | Auth reconnects; approved classroom access remains; peers are recreated once; no unbounded retry loop or duplicate participant. | NOT RUN |
| C8 | Start screen share, stop using the browser's native share-stop control, and restore camera. | Remote video transitions share → camera; audio remains as expected; no dead video sender. | NOT RUN |
| C9 | Close a student tab and then the teacher tab. | Participant/presence state and peer resources clear; server disconnect state is correct. | NOT RUN |

## D. Hearing/Deaf accessibility, captions, and avatar

| # | Action | Expected result / evidence | Status |
|---|---|---|---|
| D1 | Test a student with Hearing Mode and one with Deaf Mode in the same live lecture. | Both use the same class/lecture; saved preference persists after reload; each layout exposes the intended caption/avatar controls. | NOT RUN |
| D2 | Speak a short, clearly separated sentence as teacher. | Capture speech-recognition support, interim/final caption latency, source text, timestamps, and errors. Verify manual caption fallback. | NOT RUN |
| D3 | Request an available translation pair with a configured provider. | Confirm target language, provider, translated flag, failure fallback, and source-language retention. Test network/provider error. | NOT RUN |
| D4 | Open the experimental ISL avatar and exercise pause, replay, speed, and unsupported text. | UI remains operable and clearly labels experimental/unreviewed content; unsupported gloss uses text fallback. Do not use as interpreted instruction. | NOT RUN |
| D5 | Request interpreter review from a qualified ISL reviewer. | Only update review metadata after documented review; record reviewer, date, and evidence. Until then all entries stay experimental. | NOT RUN |
| D6 | Enable OS/browser reduced-motion preference and navigate classroom/avatar screens. | Nonessential animation is reduced and functionality remains available. | NOT RUN |
| D7 | Resize browser to 320, 375, 430, 768, 1024, and 1440 CSS pixels; test keyboard and screen-reader labels. | No horizontal overflow/clipping; controls remain reachable and labelled. The prior landing-page-only smoke check passed these widths; classroom pages remain unverified. | NOT RUN |

## E. Recording lifecycle, synchronization, and authorization

| # | Action | Expected result / evidence | Status |
|---|---|---|---|
| E1 | Start a live lecture; start recording; pause, resume, and stop/save. | Correct recording metadata and file are saved; errors leave recording state recoverable. | NOT RUN |
| E2 | Publish captions before and after the recording starts. | Compare playback time against lecture-relative `start_ms` and saved `start_offset_ms`; check pause/resume gaps and drift. | NOT RUN |
| E3 | Play recording as owner and an actively enrolled student. | Playback token works only for authorised users; video and transcript align. | NOT RUN |
| E4 | Try to fetch metadata, transcript, and playback as a non-enrolled student and unrelated teacher. | Access denied; no file or transcript is disclosed. | NOT RUN |
| E5 | Start recording with camera active, then switch to screen share. Repeat with share already active before recording. | Record exactly which track the saved file contains. Current recorder binds to `media.stream` at recorder start; it is not dynamically switched when the stream changes. | NOT RUN |
| E6 | Test screen-share audio, system audio, pause/resume, browser close, and upload interruption. | Record browser/platform limitations and cleanup behavior; do not assume system audio is captured. | NOT RUN |

## F. Attendance and learning materials

| # | Action | Expected result / evidence | Status |
|---|---|---|---|
| F1 | Teacher opens attendance before and after the live session; compare the student list with approved participants. | Correct users/status/timestamps; pending and rejected requests are not attendance. | NOT RUN |
| F2 | Teacher uploads a harmless test PDF/material; student opens and downloads it. | Material is associated with the correct classroom and permitted roles; content is readable. | NOT RUN |
| F3 | Try to access the material as an unrelated student/teacher and test a rejected file type/oversized file. | Access denied for outsiders; validation error is clear and no partial file is left. | NOT RUN |

## Sign-off

Do not mark the classroom ready for production until sections A–C pass on
physical devices and the required accessibility/recording acceptance criteria
are signed off. TURN is required for networks where direct ICE paths fail.
Qualified ISL review is a separate accessibility prerequisite; automated tests
cannot establish sign correctness.
