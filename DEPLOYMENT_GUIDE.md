# SignBridge — Deployment Guide

**Status:** pre-production. Automated tests and the production build pass, but physical WebRTC/media,
TURN traversal, real translation/speech providers, and qualified ISL review are **not verified**.
Do not present this as production-ready until the acceptance checklist in §9 is complete.

**Related:** [`PROJECT_AUDIT.md`](PROJECT_AUDIT.md) · [`BUG_REPORT.md`](BUG_REPORT.md) ·
[`TEST_REPORT.md`](TEST_REPORT.md) · [`ID_AUDIT_REPORT.md`](ID_AUDIT_REPORT.md) ·
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) (historical, less authoritative).

---

## 1. Architecture

| Component | Runtime | Persistence |
|---|---|---|
| Frontend | Static Vite build served by a CDN/reverse proxy | None |
| Backend API | Uvicorn/FastAPI | PostgreSQL (driver/URL support implemented, live integration unverified), MySQL, or SQLite (single instance only) |
| Realtime | WebSocket `/ws/classroom/{id}` and `/ws/notifications` | In-process hubs |
| Media | Browser WebRTC peer connections | Optional TURN relay |
| Files | Local `STORAGE_ROOT` for recordings/materials | Must be a persistent volume |

The backend must be reachable over HTTPS/WSS in production; browser camera/microphone/screen capture
requires a secure context.

---

## 2. Required production settings

Copy `.env.example` to `backend/.env` (never commit it) and set at minimum:

```dotenv
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=<48+ random chars>        # python -c "import secrets; print(secrets.token_urlsafe(48))"
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
AUTO_CREATE_TABLES=false              # apply reviewed migrations instead
SEED_DEMO_DATA=false                  # startup fails if true in production
CORS_ORIGINS=https://your-frontend.example
STORAGE_ROOT=/srv/signbridge/storage  # persistent volume
```

When `ENVIRONMENT=production`, startup requires a non-default `SECRET_KEY`,
`SEED_DEMO_DATA=false`, and `AUTO_CREATE_TABLES=false`. `DEBUG=false` is also required operationally,
although it is not currently enforced by the settings validator. Schema changes must be applied
through a reviewed migration plan; startup will not create tables in production.

Frontend (`frontend/.env`, build-time values):

```dotenv
VITE_API_URL=https://api.example.com
VITE_WS_URL=wss://api.example.com
VITE_STUN_URLS=stun:stun.l.google.com:19302
VITE_TURN_URLS=turn:turn.example.com:3478
VITE_TURN_USERNAME=<testing only>
VITE_TURN_CREDENTIAL=<testing only>
```

`frontend/src/api/config.js` appends `/api` to `VITE_API_URL`, so set the value to the backend origin
only (no `/api` suffix). `VITE_*` values are public in the bundle. Static TURN credentials are for
testing only; production should mint short-lived coturn credentials server-side (not implemented).

---

## 3. PostgreSQL compatibility and database migration — do not skip this

PostgreSQL driver and URL support are implemented, but live PostgreSQL integration is **not
verified**. The backend declares `psycopg[binary]`; `postgres://` and `postgresql://` URLs are
normalized to `postgresql+psycopg://`. SQLAlchemy-generic JSON, Boolean, timezone-aware DateTime,
integer primary keys, foreign keys, checks, and unique constraints were inspected. Raw SQLite
`PRAGMA foreign_keys=ON` is guarded by a SQLite-dialect check. The complete Alembic chain compiled
to PostgreSQL SQL in offline mode, including PostgreSQL identity/`SERIAL` DDL; it did not connect
to a server or execute DDL. There was no disposable PostgreSQL server available to test runtime
connectivity, migrations, data round-trips, constraints, or workflows. SQLite remains the
development/test default; MySQL support remains declared via PyMySQL.

The local SQLite database previously inspected is unversioned and already contains managed tables;
running `alembic upgrade head` against it failed because the initial migration tried to create
existing tables. This does not establish the live Render database's schema.

Safe SQLite-to-managed-PostgreSQL procedure (planning only; **not executed**):

1. Identify the actual source database and storage location with the operator. Make consistent,
   verified backups of the SQLite file and all of `STORAGE_ROOT`; record table row counts, schema,
   `alembic_version`, and foreign-key check results. Do not infer Render data from local SQLite.
2. Clone those backups and rehearse only on the clones. Keep source IDs and related files intact.
   Never run schema inspection or migrations against the configured/production database.
3. Provision a separate disposable PostgreSQL database and test credentials. Confirm a live
   psycopg connection, then run reviewed `alembic upgrade head` only against this empty target.
   Migration order is `2360156ebd08` → `20261101_add_recording_start_offset` →
   `20261101_join_requests`.
4. Reconcile the cloned SQLite schema against the PostgreSQL head schema. Do not blindly stamp the
   unversioned source or run the initial migration against it. Any baseline/adoption or forward
   migration must be authored and reviewed for the exact source schema.
5. Transfer rows in foreign-key order: users; profiles and classrooms; enrollments/join requests,
   lectures and independent sign catalog; subtitles, recordings, attendance and preferences; then
   translations/materials. Preserve every primary key, nullable value, timestamp, status, JSON
   payload, and foreign-key relationship. Reset PostgreSQL identity sequences above each imported
   maximum ID.
6. Copy files from the verified storage backup while preserving `storage_key`. Compare per-table
   row counts, relationships/foreign-key results, unique/check constraints, indexes, sequence next
   values, and SHA-256 hashes for every material/recording file. Run auth, approval, classroom,
   material-download, recording-authorization, and other critical flows against the clone.
7. Rehearse rollback before cutover: freeze writes and retain the untouched SQLite and storage
   backups. If checks fail, restore both together. After cutover, rollback requires a write freeze
   and a verified reverse-delta/restore plan; do not silently switch back and lose new writes.
8. Only after explicit owner approval, repeat during a maintenance window with a final backup and
   delta transfer, reviewed configuration change, smoke checks, monitoring, and documented
   rollback trigger. Retain the source unchanged until acceptance and retention requirements are met.

No database was switched, altered, migrated, or reset during this work.

---

## 4. Backend hosting

- Run behind a reverse proxy that supports WebSocket upgrade (`/api/*` and `/ws/*`).
- Use one worker for demos, or add shared pub/sub (e.g. Redis) before scaling out; notification and
  live-room hubs are process-local.
- Serve uploads from a persistent volume. Ephemeral/serverless filesystems lose recordings/materials.
- Set request-size/time limits above `MAX_RECORDING_MB`/`MAX_MATERIAL_MB`.
- Keep CORS restricted to the real frontend origin.
- Do not enable demo seeding in production.

Health check: `GET /api/health` returns database, translation, sign-language, and WebSocket status.

---

## 5. Frontend hosting

```bash
cd frontend
npm ci
npm run build          # outputs dist/
```

Serve `dist/` from a CDN or static host. Route unknown paths to `index.html` (React Router), and
proxy `/api` and `/ws` if same-origin deployment is preferred. Keep the frontend and backend origins
consistent with `CORS_ORIGINS`.

---

## 6. TURN / network

- Public STUN is enough only on permissive networks.
- For restricted NAT/firewalls, configure a TURN service (coturn) and verify a relay candidate pair.
- Test with two real devices on different networks; loopback/LAN tests do not prove traversal.
- WebSocket reconnect/catch-up is implemented, but cross-worker delivery is not.

---

## 7. Storage and backups

Back up **both** the database and `STORAGE_ROOT`; file rows and bytes must stay consistent. Recordings
and materials are local files today, so a mounted persistent volume is the minimum safe Render
option for a single instance. Render disk configuration was inaccessible, so persistence of the
live service is **not verified**.

For multi-instance deployment or durable independent scaling, recommend a private S3-compatible
object store. No object-storage adapter or related environment variables exist today. The minimum
source changes would be to add a storage interface behind `backend/app/services/storage.py`, replace
local `Path` resolution/FileResponse use in `backend/app/api/materials.py` and
`backend/app/api/recordings.py` with authenticated streaming or short-lived signed downloads, add
validated provider/bucket/credential settings to `backend/app/core/config.py`, and preserve the
existing database `storage_key` semantics while implementing copy/hash/rollback tooling. Keep all
existing classroom ownership/enrollment checks before issuing download access. Do not introduce a
paid provider or configure new secrets without approval.

Plan retention/deletion and malware scanning for untrusted uploads before broad public access.

---

## 8. Observability and security checklist

- [ ] `ENVIRONMENT=production`, `DEBUG=false`, strong `SECRET_KEY`.
- [ ] `SEED_DEMO_DATA=false`; demo accounts absent.
- [ ] TLS/HTTPS/WSS terminated correctly; HSTS and a strict CSP considered.
- [ ] `CORS_ORIGINS` limited to the real frontend.
- [ ] Database and storage backups tested, not just scheduled.
- [ ] Upload MIME/magic-byte validation and malware scanning reviewed.
- [ ] Rate limiting moved to a shared layer or edge proxy.
- [ ] Logs redact credentials (the backend redacts DB URLs; verify your platform).
- [ ] Monitoring for `/api/health`, error rate, disk usage, and WebSocket failures.
- [ ] Rollback plan written and rehearsed.

---

## 9. Production acceptance checklist

- [ ] Browser login/refresh/logout and role routing.
- [ ] Teacher + two students on separate devices; camera, mic, screen share, remote playback.
- [ ] 3+ participant mesh and reconnect after network loss.
- [ ] TURN relay confirmed with direct paths blocked.
- [ ] Real recording capture, playback, and A/V/caption sync.
- [ ] Browser speech recognition and at least one real translation provider per language family.
- [ ] Hearing/Deaf layouts, reduced motion, keyboard and screen-reader checks.
- [ ] ISL entries remain labelled experimental unless qualified interpreter evidence exists.
- [ ] Configured database migrated via the procedure in §3.
- [ ] Explicit owner approval before push/deploy.

Until every item is checked, describe the deployment as a **functional prototype / pre-production**.

## 10. Render and Vercel deployment checklist

### Observed live Render API (2026-11-02)

A read-only request to `https://signbridge-education-2.onrender.com/api/health` and `/health`
returned HTTP 200 with `status=ok`, `environment=development`, and `database.dialect=sqlite`.
The service root `/` returned HTTP 404; the FastAPI source defines no root route, so this is expected
and does not indicate application failure. A previously observed root 503 was not reproduced.
Translation reported `configured=auto`, `active_provider=mymemory`, and `available=true`; the sign
catalog reported 0 verified and 100 experimental entries. An earlier root request had returned
HTTP 503, but current read-only probes returned the expected 404 and did not reproduce that 503.

This confirms the running API is **not configured as production** and is using SQLite. The health
response does not establish whether the SQLite file is on persistent storage, whether demo seeding
is explicitly disabled, or which environment values are set in the Render dashboard. No Render or
Vercel manifests are present in this repository, and remote dashboard settings were not changed.
Treat the current deployment as a public prototype; do not store real student data in it.

### Render backend

- [ ] Set the service root directory to `backend`.
- [ ] Build/install dependencies with `pip install -r requirements.txt`.
- [ ] Start with `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (`PORT` is supplied by Render).
- [ ] Configure these backend settings using names read from `backend/app/core/config.py` and
  `.env.example`:
  - `ENVIRONMENT=production`
  - `DEBUG=false`
  - `SECRET_KEY` set to a generated secret (never a checked-in value)
  - `DATABASE_URL` set to the explicitly selected managed database
  - `AUTO_CREATE_TABLES=false`
  - `SEED_DEMO_DATA=false`
  - `CORS_ORIGINS` set to the exact Vercel production origin
  - `STORAGE_ROOT` set to the mount path of a persistent Render disk
  - `LOG_LEVEL=INFO`
- [ ] Set `DEBUG=false`; this is source-confirmed but is not currently rejected by the startup
  validator if accidentally enabled.
- [ ] Configure optional translation/speech settings only if used: `TRANSLATION_PROVIDER`,
  `MYMEMORY_EMAIL`, `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`, `DEEPL_API_KEY`,
  `DEEPL_API_URL`, `GOOGLE_TRANSLATE_API_KEY`, `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL`,
  `ENABLE_LOCAL_WHISPER`, `WHISPER_MODEL`.
- [ ] Configure a Render persistent disk before using local filesystem uploads. Choose and mount
  the disk first, then set `STORAGE_ROOT` to that mount path. Current recordings/materials are stored
  on local disk; ephemeral storage is not suitable.
- [ ] Run a backed-up, isolated schema review and migration rehearsal before directing this service
  at real data. Do not have the service run Alembic automatically and do not point it at the
  existing unversioned SQLite database without an approved migration plan.
- [ ] Set the health check path to `/api/health`; confirm the response reports
  `environment=production` and the selected database dialect after deployment.
- [ ] Confirm WebSocket upgrade works for `/ws/classroom/{classroom_id}` and `/ws/notifications`.

PostgreSQL driver and URL support are now present, and offline migration SQL compiles. Live database
integration remains **unverified**. Before selecting PostgreSQL for production, provision a
disposable PostgreSQL instance and validate migrations, data types, identity sequences, foreign
keys, JSON/datetime round-trips, and critical workflows. Do not change Render's `DATABASE_URL`
without explicit approval and a rehearsed migration.

### Vercel frontend

- [ ] Set the project root directory to `frontend`, install with `npm ci`, build with `npm run build`,
  and serve the generated `dist` directory with SPA fallback to `index.html`.
- [ ] Set build-time `VITE_API_URL=https://signbridge-education-2.onrender.com` (origin only; the frontend appends `/api`).
- [ ] Set build-time `VITE_WS_URL=wss://signbridge-education-2.onrender.com`.
- [ ] Set the backend `CORS_ORIGINS` value to the exact production Vercel origin (not a guessed
  preview/domain URL).
- [ ] Keep `VITE_SHOW_DEMO_LOGIN=false`. `VITE_*` values are public in the bundle; do not place
  provider secrets or production TURN credentials in them.
- [ ] Optional frontend settings confirmed by `frontend/.env.example`: `VITE_STUN_URLS`,
  `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`, `VITE_HAND_MODEL_URL`, and
  `VITE_MEDIAPIPE_WASM_URL`. TURN credentials are public in the bundle; use testing credentials
  only.
- [ ] Treat static TURN values as testing-only: they are public build-time values. Production TURN
  credentials need a short-lived backend issuance flow, which is not implemented.
- [ ] After setting environment values, trigger a fresh build and verify API calls use HTTPS and
  classroom/notification sockets use WSS.

### Isolated browser verification (local only)

- Teacher/student registration and login, classroom creation, student join request, teacher
  approval, student entry, material listing, and material upload succeeded using a disposable local
  SQLite database and temporary storage.
- The upload returned HTTP 201 and the stored bytes matched the test fixture.
- The isolated student request reached `/api/materials/1/download` and returned HTTP 200,
  `text/plain; charset=utf-8`, attachment filename `material-download-smoke.txt`, private cache
  headers, and 45 bytes. The frontend created a 45-byte Blob and clicked its download anchor while
  user activation was active. The integrated browser did not emit the awaited Playwright `download`
  event, so the browser-saved file bytes remain **not verified**. Repeat with a desktop browser or
  a browser harness that captures Blob downloads.
- An earlier browser timeout also showed `ERR_CONNECTION_REFUSED` for the local frontend/API after
  the test servers had stopped. The fresh isolated run kept both services available and verified
  the API response and frontend download initiation.
- Early WebSocket disconnects before auth were fixed and have automated regression coverage.
  Physical camera/microphone/WebRTC, TURN, and cross-network behavior remain untested.

These are operator steps only. No database switch, migration, Render setting change, Vercel
deployment, or data operation was performed during this audit.
