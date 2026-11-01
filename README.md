<<<<<<< HEAD
# SignBridge

Inclusive live-learning platform: one teacher, hearing and deaf students in the same live classroom.

**Status: work in progress.** Much of the code exists but was **not run end to end**. See `docs/FEATURE_STATUS.md` and
`docs/TEST_REPORT.md` for what is actually verified.

## Features (see FEATURE_STATUS for verification level)
Teacher/student accounts · live classrooms · WebRTC teacher video/audio/screen share · live captions (browser speech or
typed) · per-student caption translation (13 languages incl. 10 Indian + English) · Hearing / Deaf mode ·
**experimental** procedural 3D ISL avatar (Three.js) · MediaPipe hand-tracking demo (detection only) · attendance ·
materials · recording & playback.

> The ISL animations are experimental and **not reviewed by an ISL interpreter**. The avatar does not translate
> arbitrary speech into natural ISL. MediaPipe tracking does not recognise signs.

## Stack
React 19, Vite 6, Tailwind, Three.js, MediaPipe Tasks Vision · FastAPI, SQLAlchemy 2, Alembic, PyJWT, bcrypt ·
SQLite (dev) / MySQL (prod) · WebRTC + WebSocket.

## Layout
```
backend/app/{api,core,database,models,schemas,services,sign_language,speech,translation,websocket}  backend/alembic  backend/tests
frontend/src/{api,components,context,hooks,lib,pages}   frontend/src/lib/__tests__
docs/  PROJECT_PROGRESS.md  HANDOVER_FOR_NEXT_CLAUDE.md  NEXT_CLAUDE_PROMPT.md
```

## Setup
```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env            # edit; never commit
uvicorn app.main:app --reload      # http://127.0.0.1:8000  (SQLite + demo seed by default)

# frontend (second terminal)
cd frontend && cp .env.example .env && npm ci && npm run dev    # http://localhost:5173
```
**Note:** `frontend/package-lock.json` is currently incomplete; run `rm package-lock.json && npm install` instead of `npm ci` until it is regenerated.

Environment variables: `.env.example` (backend) and `frontend/.env.example` (API URL, STUN/TURN, MediaPipe URLs).

## Tests
```bash
cd backend && pytest -q          # full suite (needs requirements installed)
cd frontend && npm test          # pure-logic unit tests (Node 22+), no install needed beyond Node
cd frontend && npm run build
```

## Common errors
* **Camera/mic/screen share blocked** – use `https://` or `localhost`.
* **Student sees "Waiting for the teacher"** – the teacher must start the lecture and enable camera & mic first.
* **No video across networks** – add a TURN server (`docs/DEPLOYMENT.md`).
* **Captions show "translation unavailable"** – no translation provider reachable/configured; set a key or LibreTranslate URL.
* **Avatar shows a WebGL message** – browser/GPU lacks WebGL; captions and text sign chips still work.
* **Login with demo accounts fails in production** – demo seeding is for development only.
=======
# SignBridge_education
>>>>>>> c40948d924b8fa39018b67d1287a7393cae3d3ae
