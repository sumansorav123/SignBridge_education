# Deployment

## Pre-deployment checklist
- [ ] `ENVIRONMENT=production` and a strong `SECRET_KEY`
- [ ] `SEED_DEMO_DATA=false` (backend refuses to start otherwise); remove demo users from the DB
- [ ] Frontend built without `VITE_SHOW_DEMO_LOGIN=true`
- [ ] `package-lock.json` regenerated (current one is incomplete – see TEST_REPORT)
- [ ] TURN configured and verified with a `relay` candidate pair
- [ ] HTTPS/WSS, exact `CORS_ORIGINS`

## Backend
```bash
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env        # edit values; never commit .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Database migration safety

The configured local SQLite database was inspected during Phase 10: it exists,
has no `alembic_version` table, and already contains the current
`classroom_join_requests` table. A disposable clone accepted
`alembic stamp head` followed by `alembic check` with no drift, but the live database was not
modified. Do **not** blindly run `alembic upgrade head` or `stamp head` against
an existing/unversioned database: the initial migration may try to recreate
tables, and stamping an older/partial schema would conceal missing changes.

For a new empty database, run `python -m alembic upgrade head`. For an existing
unversioned database, first make a verified backup and an isolated clone,
inspect its Alembic version and actual table/column/constraint/index schema,
compare it with the intended migration history, and test the proposed migration
on that clone. Only if the clone exactly matches the current head schema should
an operator consider baseline stamping that database. Otherwise, author a
schema-specific forward-only migration that preserves records and reconciles
the observed schema; do not drop/reset tables. Keep `AUTO_CREATE_TABLES=false`
in migration-managed deployment environments so application startup does not
silently mask missing migrations. Confirm backup restore procedures before
applying any production change.

Production: `ENVIRONMENT=production`, strong `SECRET_KEY` (`python -c "import secrets;print(secrets.token_urlsafe(48))"`),
MySQL `DATABASE_URL`, `SEED_DEMO_DATA=false`, `CORS_ORIGINS` = your exact https origin(s), HTTPS + WSS behind a reverse proxy.

## Clean demo database
No database is shipped. For a synthetic demo DB: `SEED_DEMO_DATA=true` and start the backend once; it creates
`signbridge.db` with the demo teacher/students/classroom from `app/seed.py` (synthetic only). Not executed in this session.

## Frontend
`cd frontend && npm ci && npm test && npm run build`; serve `dist/` over HTTPS (camera/mic/screen share need a secure context).
Dev: `npm run dev` (proxies `/api` and `/ws` to 127.0.0.1:8000).

## Two-device classroom testing on a Windows LAN

Follow [REAL_WORLD_TEST_GUIDE.md](./REAL_WORLD_TEST_GUIDE.md) for the full
checklist. Use one backend and one Vite process on the teacher/server laptop.
For Vite-proxied development, keep the backend bound to loopback (`127.0.0.1`);
bind Vite to `0.0.0.0` so the student laptop can reach the frontend. The
student must open the server laptop's LAN address, never its own `localhost`.

Find the Wi-Fi IPv4 on the server laptop:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notmatch '^127\.' -and
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet'
  } |
  Select-Object InterfaceAlias, IPAddress
```

Use a **new empty disposable test directory** and do not point at
`backend/signbridge.db` or any production database. From an elevated PowerShell
window, permit Vite only on the Private profile:

```powershell
New-NetFirewallRule `
  -DisplayName 'SignBridge Vite dev (Private LAN)' `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 `
  -Profile Private
```

In the backend PowerShell window, set environment variables for the disposable
database/storage and exact frontend origin, then run Uvicorn:

```powershell
$env:DATABASE_URL = 'sqlite:///C:/SignBridgePhase11Test/signbridge-test.db'
$env:STORAGE_ROOT = 'C:\SignBridgePhase11Test\storage'
$env:SEED_DEMO_DATA = 'false'
$env:AUTO_CREATE_TABLES = 'true'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173,http://<SERVER-IP>:5173'
Set-Location C:\path\to\SignBridge\backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Replace `<SERVER-IP>` and repository paths. Select a different new empty
directory if `C:\SignBridgePhase11Test` already exists; do not overwrite or
delete existing files. Adjust the venv path to the actual installation.

In a second PowerShell window:

```powershell
Set-Location C:\path\to\SignBridge\frontend
$env:VITE_API_URL = ''
$env:VITE_WS_URL = ''
npm run dev -- --host 0.0.0.0 --strictPort
```

Open `http://<SERVER-IP>:5173` on both laptops. The Vite proxy sends `/api` and
`/ws` to the server laptop's loopback backend. Check the same backend from the
student laptop with:

```powershell
Invoke-RestMethod http://<SERVER-IP>:5173/api/health
```

LAN HTTP is suitable only for login, approval, and API checks. Camera,
microphone, and screen capture require a secure context; for media testing,
serve the shared origin over HTTPS/WSS with a certificate trusted by both
devices. Do not ignore certificate warnings or use production secrets in a
development certificate. Do not open backend port 8000 to the LAN when the
Vite proxy is sufficient. If using a direct API instead, intentionally bind
the backend to the LAN interface and configure exact CORS/origin checks and a
scoped firewall rule.

### Phase 12 local network probe

The Phase 12 server laptop reported Wi-Fi IPv4 `192.168.205.101` and an active
**Public** network profile. From that same laptop, Vite-proxied
`http://192.168.205.101:5173/api/health` returned HTTP 200, and an OPTIONS
preflight with Origin `http://192.168.205.101:5173` returned 200 with the
matching `Access-Control-Allow-Origin`. These checks do **not** prove that a
second laptop can reach Vite, that Windows Firewall permits remote traffic, or
that browser workflows/media work. No firewall rule or profile change was
made; do not open a port on a Public profile. The local disposable app services
were stopped and their temporary database/storage directory removed after the
test. See [REAL_WORLD_TEST_GUIDE.md](./REAL_WORLD_TEST_GUIDE.md) for the owner
run.

## TURN (needed for students behind strict NAT/firewalls)
Not configured or tested. Browser ICE currently defaults to public STUN
servers. Static `VITE_TURN_USERNAME` / `VITE_TURN_CREDENTIAL` values are
bundled into public JavaScript and are for local testing only. Example coturn
(`/etc/turnserver.conf`):
```
listening-port=3478
tls-listening-port=5349
realm=turn.example.com
fingerprint
use-auth-secret
static-auth-secret=<long random secret>
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
no-cli
```
Open UDP/TCP 3478, TCP 5349 and a UDP relay range (e.g. 49152-65535). For local testing only set in `frontend/.env`:
`VITE_TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`.
For production, add a backend endpoint returning `username = <expiry-unix-ts>:<user>` and
`credential = base64(HMAC-SHA1(static-auth-secret, username))` and have the frontend fetch it per join (not built yet).
Verify with Chrome `chrome://webrtc-internals` (a `relay` candidate pair) with direct paths blocked.

## Recording source changes

The teacher recorder now uses a stable canvas-captured video track that draws
the current teacher preview, plus the active microphone audio tracks. This
avoids mutating the `MediaRecorder` input track set when camera and screen-share
streams change. Automated tests cover the helper's source sampling, audio
retention, aspect fit, and cleanup. Actual browser recording, camera-to-share
capture, playback, audio/video synchronization, caption timing, and system
audio remain unverified; complete the manual checks in
[REAL_WORLD_TEST_GUIDE.md](./REAL_WORLD_TEST_GUIDE.md) before relying on them.

## Multi-worker notifications

`/ws/notifications` currently uses a process-local in-memory hub. It works
when the API request that publishes an event and the WebSocket subscriber are
handled by the same worker, but it does not fan out across multiple Uvicorn
workers/replicas. Use a single worker for a local classroom test. Before
multi-worker production, add a shared broker adapter (Redis Pub/Sub is the
smallest fit for best-effort wake-up events) that fans committed events to
each worker's local subscribers. Keep REST as the source of truth; Pub/Sub is
not durable, so clients must continue refresh/reconnect polling. Add
cross-worker tests before enabling multiple workers. Redis Streams or another
durable broker is appropriate only if delivery/replay guarantees beyond REST
refresh become a requirement. No broker dependency is currently configured.

## Translation / speech keys
`TRANSLATION_PROVIDER=auto` tries DeepL → Google → LibreTranslate → MyMemory. Set at least one key/URL for reliable
Indian-language output. Server-side transcription (`OPENAI_API_KEY`, Whisper) is billed per audio minute; browser
Web Speech is free but Chrome/Edge only and sends audio to the browser vendor.

## MediaPipe hand tracking
Defaults fetch the WASM from jsDelivr and the `.task` model from Google storage. To self-host copy
`node_modules/@mediapipe/tasks-vision/wasm` and the model into `frontend/public/mediapipe/` and set
`VITE_MEDIAPIPE_WASM_URL=/mediapipe/wasm`, `VITE_HAND_MODEL_URL=/mediapipe/hand_landmarker.task`.
`package.json` pins `@mediapipe/tasks-vision` `1.2.0`; confirm that version exists on npm and that the WASM
folder matches it (the default CDN URL pins 0.10.14, which may mismatch).
