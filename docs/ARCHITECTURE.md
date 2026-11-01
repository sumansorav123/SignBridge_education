# Architecture

```
Browser (React 19 + Vite + Tailwind)                  FastAPI backend (SQLAlchemy 2, Alembic)
 ├─ pages/LiveClassroom.jsx ─ REST (axios) ───────────▶ api/{auth,teacher,student,recordings,materials,accessibility}
 │    ├─ hooks/useClassroomSocket ── WebSocket ───────▶ api/websocket.py + websocket/manager.py
 │    │      first-message JWT auth, presence, subtitles, media-state, WebRTC signalling relay
 │    ├─ hooks/useWebRTC (teacher → each student mesh)  (media goes browser↔browser; server only relays SDP/ICE)
 │    ├─ hooks/useLocalMedia (camera, mic, screen share)
 │    ├─ hooks/useSpeechRecognition (Web Speech API, teacher)
 │    ├─ components/IslAvatar.jsx (Three.js)  ◀── lib/islPose.js ◀── signs.glosses from the caption message
 │    └─ components/HandTrackingDemo.jsx (MediaPipe HandLandmarker, standalone)
 └─ lib/ (pure, unit-tested): webrtcSignaling, reconnect, mediaState, iceServers, islPose, handTracking

Caption path: teacher speech/typed text → WS `subtitle` → translation/service.py (per-student language, cache,
 fallback flag) → sign_language/engine.py (gloss lookup) → WS `subtitle` to each student with `signs`.
Storage: SQLite (dev) / MySQL (prod) for metadata; recordings & materials on disk via services/storage.py.
```

* ISL data: `backend/app/sign_language/data/isl_lexicon.json` (100 experimental entries) → `lexicon.py` validates the
  controlled vocabularies → `engine.py` converts text to glosses (phrase lookup, stopword removal, time-first, WH-last).
* Avatar: `islPose.js` maps handshape/location/palm/movement/face/head/body to numeric pose; `IslAvatar.jsx` applies it
  to a procedural rig (two-bone arm IK, 3-joint fingers). Only one timeline plays at a time; new captions queue (max 3).
* Realistic limit: WebRTC is a **mesh from the teacher** (one upstream per student). Large classes need an SFU; no load test was done.
