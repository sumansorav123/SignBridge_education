# Student classroom access investigation

## Root cause

The exact message, “You do not have access to this classroom,” is returned by
the classroom WebSocket authorization path. The path originally used the same
WebSocket close code (`4403`, forbidden) both when authentication failed
(including an expired access token) and when a valid user lacked an active
classroom enrollment. The frontend correctly treats `4401` as an expired
session that may be refreshed, but treats `4403` as a permanent membership
denial. An expired session could therefore be reported as a classroom access
problem.

The classroom join and membership code otherwise uses the correct student
`User.id`, commits the enrollment, and checks for an active enrollment before
granting WebSocket access. The newly added end-to-end regression test proves
that a student who joins a newly created classroom can connect and signal the
teacher when both requests reach the same backend/database.

The original two-laptop runtime configuration was not available to inspect.
There is a separate, important LAN configuration risk: the default Vite
development proxy points to `127.0.0.1:8000`. If the student runs a separate
frontend/backend locally, `localhost` refers to the student laptop and its
local SQLite database, not the teacher's server. Separate API and WebSocket
URLs or backend databases can also make an enrollment appear absent. The
single-backend LAN setup is documented below; whether this caused the
reported occurrence cannot be confirmed without the devices' URLs and server
configuration.

## Files changed

- `backend/app/api/websocket.py` — return close code `4401` for invalid,
  expired, inactive, or otherwise unauthenticated sessions; retain `4403`
  for classroom authorization denials.
- `backend/app/api/student.py` — recover idempotently if simultaneous join
  requests race to create the same enrollment; preserve errors if no active
  enrollment exists afterward.
- `backend/tests/test_websocket.py` — cover expired-token classification and
  newly joined student access, teacher presence notification, and WebRTC
  offer signaling.
- `backend/tests/test_classrooms.py` — verify archived classes reject new
  joins and duplicate/rejoin requests remain successful.
- `frontend/package.json` — add `npm run dev:lan` to bind Vite to the LAN.
- `docs/DEPLOYMENT.md` — document the one-server/two-device configuration.

## Database changes

No schema or persistent data changes. Existing unique enrollment constraints
remain in place; a concurrent duplicate insert now checks for the active row
before treating the request as successful.

## Authorization changes

- Teachers continue to access only their own classrooms.
- Students continue to require an active enrollment to access a classroom.
- Invalid/expired authentication is now distinct from missing membership.
- Joining still requires an authenticated student, an active classroom, and
  a valid join code. Invalid or inactive classroom codes return 404.

## Tests and results

- `python -m pytest tests/test_classrooms.py tests/test_websocket.py -q` —
  **14 passed**.
- The new end-to-end test creates a classroom, joins a student by code,
  verifies WebSocket authorization, confirms the teacher receives the
  student-joined event, and relays a WebRTC offer.
- Existing WebSocket tests verify an un-enrolled student is denied.
- `npm test` — **20 passed**.
- `npm run build` — **passed**.
- Python compile check and `git diff --check` — **passed**.
- LAN-origin smoke check served the frontend and returned API health through
  the Vite proxy. Port 8000 was already occupied by a pre-existing SignBridge
  server, so this smoke check did not establish an isolated backend/database
  across two physical laptops.
- Full backend suite — **37 passed, 1 failed**. The unrelated existing failure
  is `tests/test_accessibility_recordings.py::test_language_and_translation_status`:
  the assertion expects 12 languages but the application returns 13,
  including Assamese.

## Remaining issues

- The original laptop configuration and failing session were not available,
  so the specific runtime trigger (expired token versus mismatched API,
  WebSocket, or database host) remains unconfirmed.
- A physical two-laptop test and real camera/microphone WebRTC stream were not
  performed. The automated test verifies WebSocket access and offer
  signaling, not media connectivity. LAN HTTP is not a secure browser context
  for camera/microphone access; test media over HTTPS/WSS and configure TURN
  where direct connectivity is blocked.
- Follow `docs/DEPLOYMENT.md` “Two-device classroom testing on a LAN”: use one
  backend/database on the server laptop, run Vite with `npm run dev:lan`, open
  the server laptop's LAN URL on both devices, and allow that exact origin in
  `CORS_ORIGINS`.
