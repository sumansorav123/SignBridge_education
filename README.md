# SignBridge

Inclusive live-learning platform: one teacher, hearing and deaf students in the same live classroom.

**Status: functional prototype / pre-production.** Automated backend and frontend tests pass and the production
frontend build succeeds, but physical two-device WebRTC/media, live speech recognition, real translation
providers, TURN relay traversal, and qualified ISL review have **not** been verified. See
[`docs/FEATURE_STATUS.md`](docs/FEATURE_STATUS.md), [`TEST_REPORT.md`](TEST_REPORT.md),
[`BUG_REPORT.md`](BUG_REPORT.md), and [`ID_AUDIT_REPORT.md`](ID_AUDIT_REPORT.md) for what is actually tested.

## Features (see FEATURE_STATUS for verification level)

Teacher/student accounts · live classrooms with join approval · WebRTC teacher video/audio/screen share · live
captions (browser speech or typed) · per-student caption translation (13 languages incl. 10 Indian + English) ·
Hearing / Deaf mode · **experimental** procedural 3D ISL avatar (Three.js) · MediaPipe hand-tracking demo
(detection only) · attendance · materials · recording & playback.

> The ISL animations are experimental and **not reviewed by an ISL interpreter**. The avatar does not translate
> arbitrary speech into natural ISL. MediaPipe tracking does not recognise signs.

## Stack

React 19, Vite 6, Tailwind, Three.js, MediaPipe Tasks Vision · FastAPI, SQLAlchemy 2, Alembic, PyJWT, bcrypt ·
PostgreSQL in production, explicitly configured SQLite for development/tests · WebRTC + WebSocket.

## Layout

```text
backend/app/{api,core,database,models,schemas,services,sign_language,speech,translation,websocket}
backend/alembic   backend/tests
frontend/src/{api,components,context,hooks,lib,pages}   frontend/src/lib/__tests__
docs/   PROJECT_AUDIT.md   PROJECT_PROGRESS.md   BUG_REPORT.md   TEST_REPORT.md   ID_AUDIT_REPORT.md
        DEPLOYMENT_GUIDE.md   HANDOVER_FOR_NEXT_AGENT.md
```

## Setup

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env            # edit; never commit; SQLite is explicitly configured here
uvicorn app.main:app --reload      # http://127.0.0.1:8000  (local migrations + demo seed)

# frontend (second terminal)
cd frontend && cp .env.example .env && npm ci && npm run dev    # http://localhost:5173
```

The backend runs Alembic migrations before seeding on every startup. For Render's Root Directory,
commands, PostgreSQL environment, and verification steps, see [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).

`frontend/package-lock.json` is present and `npm ci` works. If dependency versions are changed, run
`npm install` once to refresh the lockfile.

Environment variables: `.env.example` (backend) and `frontend/.env.example` (API URL, STUN/TURN, MediaPipe
URLs). Never commit real secrets or put production TURN credentials in `VITE_*` variables.

## Repair an existing unversioned SQLite database safely

Some older local databases may already contain the current tables but have an empty or missing
`alembic_version` record. Do **not** run `alembic upgrade head` against such a database blindly:
the initial migration can fail because its tables already exist.

From `backend`, run a read-only schema check first:

```powershell
python scripts/adopt_existing_sqlite_schema.py
```

The helper checks the current ORM/Alembic schema, SQLite integrity, and foreign keys. It refuses
to adopt a database with schema differences. Only if the check reports no differences, review the
database path and then run:

```powershell
python scripts/adopt_existing_sqlite_schema.py --apply
```

`--apply` makes a verified SQLite backup next to the database, then records Alembic `head`; it
does not create, drop, or alter application tables or data. Keep the backup until the app and
migration workflow are verified. The helper is SQLite-only and refuses MySQL/PostgreSQL URLs.
For a schema mismatch, do not stamp or auto-repair; back up the database and create a reviewed
forward migration for that exact schema.

## Tests

```bash
cd backend && pytest -q          # full suite (needs requirements installed)
cd frontend && npm test          # pure-logic unit tests (Node 22+)
cd frontend && npm run build
```

Latest previously verified run (2026-11-02): backend **73 passed**; frontend **31 passed**; Python compilation
passed; production build **exit 0**. Material download authorization, response headers, contents,
missing-file behavior, and large-file bodies are covered by backend tests. The isolated browser run
also verified HTTP 200, expected headers/body, and Blob/anchor initiation, but the browser download
event did not fire, so the saved file itself remains unverified. PostgreSQL URL/driver and offline
Alembic compilation are verified; live PostgreSQL integration is not. Redeploy the backend and verify
its health endpoint reports production + PostgreSQL before using it with real student data; see
[`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).
These are automated layers only — see [`TEST_REPORT.md`](TEST_REPORT.md).

## Common errors

* **Camera/mic/screen share blocked** – use `https://` or `localhost`; LAN HTTP is not a secure context.
* **Student sees "Waiting for the teacher"** – the teacher must start the lecture and enable camera & mic first.
* **No video across networks** – add a TURN server; see [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).
* **Captions show "translation unavailable"** – no translation provider reachable/configured; set a key or
  LibreTranslate URL.
* **Avatar shows a WebGL message** – browser/GPU lacks WebGL; captions and text sign chips still work.
* **Login with demo accounts fails in production** – demo seeding is development-only and is blocked when
  `ENVIRONMENT=production`.
* **Existing SQLite database and Alembic** – do not blindly run `alembic upgrade head` or `stamp head`; see the
  migration guidance in [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md).
