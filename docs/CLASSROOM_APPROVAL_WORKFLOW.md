# Classroom join approval workflow

Students submit the join code from **My classrooms**. `POST /api/student/classrooms/join`
creates or returns a pending join request; it does not create classroom
membership. The student waits at `/student/join-requests/{request_id}`.

Teachers review requests from the dashboard, the **Join requests** navigation
item, or the relevant live classroom. Approval is atomic with enrollment
creation. Rejections and cancellations do not create membership. After a
rejection or cancellation, a student may submit a new request; only one
pending request per student/classroom is allowed at a time.

## API

- `GET /api/teacher/join-requests` — pending requests for the authenticated
  teacher's classrooms.
- `GET /api/teacher/classrooms/{classroom_id}/join-requests` — pending
  requests for a classroom owned by the teacher.
- `GET /api/student/join-requests` — the authenticated student's request
  history, including its current status.
- `POST /api/classroom-join-requests/{request_id}/approve`
- `POST /api/classroom-join-requests/{request_id}/reject`
- `POST /api/classroom-join-requests/{request_id}/cancel`

The authenticated notifications socket is `/ws/notifications`. Authenticate
with the first message: `{"type":"auth","token":"<access_token>"}`. Events
are best-effort; clients refresh the REST endpoints after connection and
periodically so reconnects or missed events do not change authorization.
Pending students are not allowed on `/ws/classroom/{classroom_id}`.

## Migration

The join-request migration is `20261101_join_requests`, the sole Alembic head.
On a new, empty database, apply the full migration chain before starting the
application:

```powershell
Set-Location backend
python -m alembic upgrade head
```

The migration adds request history, foreign keys, indexes, status constraints,
and a portable unique pending-request slot. It does not modify existing
classroom memberships.

### Existing unversioned databases

The application currently has `AUTO_CREATE_TABLES=true` by default, so startup
can create the latest model schema without recording any Alembic revision. On
such a database, `alembic upgrade head` is **not** safe: the initial-schema
revision attempts to create tables that already exist. Do not run that command
against an unversioned existing database.

For an unversioned database that has been verified to match the current model
schema, take a backup, test against a clone, then baseline it with
`python -m alembic stamp head`; run `python -m alembic check` against the clone
and require “No new upgrade operations detected” before considering the same
baseline operation on the target. An older or partially upgraded unversioned
database must not be stamped at head; it needs a schema-specific baseline /
upgrade plan first. No application database was changed during this audit.

## Final integration audit

### Test results

On 2026-11-01:

- `python -m pytest -q` — **43 passed**.
- Focused approval integration, transactional rollback, and language-catalog
  tests — **3 passed**.
- `npm test` — **20 passed**.
- `npm run build` — **passed**.
- `python -m compileall -q app tests` — **passed**.
- `python -m alembic heads` — one head: `20261101_join_requests`.
- `alembic upgrade head` against a disposable empty SQLite database — **passed**
  through the initial, recording-offset, and join-request revisions.
- A disposable clone of the configured SQLite database had no Alembic version
  table, but already had the join-request table. Direct `upgrade head` failed
  at the initial revision because existing tables were present. On that clone,
  `stamp head` followed by `alembic check` reported **no schema drift**. The
  configured database itself was not stamped or otherwise modified.

The new end-to-end test performs teacher login and classroom creation, student
registration/login and join request, verifies the persisted pending row and
real-time teacher notification, confirms unauthorized teacher review is
denied, and approves through the owner account. It then verifies persisted
approval and active membership, REST status after refresh, student approval
notification, classroom WebSocket access, and reconnect. The rejection branch
verifies the student notification and persisted rejected status, absence of
membership, and WebSocket denial. A separate failure-injection test raises
during membership insertion and confirms both the request remains pending and
no membership is created.

The original language-count failure was a stale expectation: the canonical
`SUPPORTED_LANGUAGES` list contains **13** entries, including Assamese (`as`),
and the legacy translation endpoint returns that same catalog. The regression
test now asserts 13 and explicitly asserts the Assamese code; it does not
silence the catalog behavior.

Existing backend coverage for Hearing/Deaf preferences, captions, translation,
WebRTC signaling, and recordings also passed as part of the 43-test suite.

### Remaining limitations

- The configured SQLite database was inspected only through a disposable
  backup clone; no actual or production database migration was run.
- A physical two-laptop classroom session and actual media-stream delivery
  were not performed. Backend WebSocket connection/reconnection and WebRTC
  signaling are covered by automated tests, not by real devices.
- Browser reload itself was not automated. Student/teacher REST refresh and
  persisted statuses are covered by the API integration test, and the UI
  reloads those endpoints on page mount.
- Notifications are process-local and best-effort. In a multi-worker backend
  deployment, workers need shared pub/sub for notifications to reach sockets
  connected to a different worker; REST remains authoritative and clients
  refresh state.
- Older or partially upgraded unversioned databases need a schema-specific
  migration plan before Alembic can safely manage them.

## Phase 10 integration audit update

The final backend regression run after the latest health metadata correction
passed: `python -m pytest -q` — **43 passed**, exit 0. Frontend `npm test`
passed **20/20**, `npm run build` passed, and `python -m compileall -q app
tests` passed. The new teacher/student approval integration test covers
request persistence, teacher notification, unauthorized review denial,
approval/membership, request status after REST refresh, student notification,
approved WebSocket reconnect, rejection notification/status, no rejected
membership, and rejected WebSocket denial. A failure-injection test confirms a
failed membership write rolls the approval back.

Migration checks passed on an empty SQLite database. The configured local
SQLite DB is unversioned yet already has the request table; `upgrade head`
failed on a disposable clone because the initial revision attempted to create
existing tables. `stamp head` plus `alembic check` on that clone found no drift.
Neither the actual local application DB nor a production DB was changed.
Follow the [schema safety guide](./DEPLOYMENT.md#database-migration-safety)
before any migration to an existing DB.

The API health response now reflects catalog reality: 0 interpreter-reviewed
ISL entries, 100 experimental entries, and first-message WebSocket
authentication (no URL-token auth). This is guarded by `test_health`.

Real devices and media remain outstanding. No physical two-laptop test,
camera/microphone delivery, TURN relay, or browser approval flow was performed.
Use [REAL_WORLD_TEST_GUIDE.md](./REAL_WORLD_TEST_GUIDE.md) and record actual
evidence before marking those tests passed. Notifications remain process-local;
multi-worker production requires shared event fan-out (Redis Pub/Sub is the
recommended best-effort option, with REST as the source of truth).

## Phase 12 approved-student access recheck

The uploaded source ZIP and the current working tree are different revisions:
the current tree contains the teacher approval API in
`backend/app/api/join_requests.py`, whereas the reported ZIP inventory did not.
The ZIP itself was not available in the working tree for a direct diff. In the
current tree, `approve_join_request` validates teacher ownership and pending
status, updates the request, creates/reactivates the matching
`ClassroomEnrollment`, and calls `db.commit()` before publishing approval or
returning success.

The student join endpoint in `backend/app/api/student.py::join_classroom`
creates a pending request and does not create membership. Its response carries
separate request `id`, `classroom_id`, and `student_id` values. The waiting UI
in `frontend/src/pages/JoinRequests.jsx` navigates using the approved
request's `classroom_id`, not the request ID. The WebSocket endpoint
`backend/app/api/websocket.py::classroom_socket` authenticates the token and
calls `backend/app/services/live_service.py::classroom_access`, which checks
an active enrollment matching both the requested classroom ID and authenticated
user ID. Both approval's `DbSession` and the WebSocket's `SessionLocal` use the
same module-level engine in `backend/app/database/session.py`. The default
SQLite URL is absolute and rooted at the backend directory, not the current
working directory.

No approved-student authorization failure was reproducible against the current
tree using its actual classroom WebSocket route. Regression coverage verifies
the enrollment is persisted in the same disposable SQLite database, an
already-authenticated approved student connects immediately and reconnects,
and pending, rejected, wrong-student, and wrong-classroom connections are
denied with 4403. The audit therefore confirms the source-ZIP mismatch, but
does not identify the cause of an access-denied response from a different
deployed/archived revision.

Student dashboards and the classroom list now reload their enrollment-backed
data when the authenticated student's approval notification arrives.
WebSocket authorization diagnostics log only that authenticated student's
matching enrollment fields plus the active engine URL with credentials and
secret URL parameters redacted; they do not include student email or name.

Validation on 2026-11-01: backend suite **46 passed**; frontend tests
**25 passed**; frontend production build passed. Backend tests force
`DATABASE_URL` and `STORAGE_ROOT` to a new `signbridge-tests-*` temporary
directory, even if an external database URL is present. The configured
`backend/signbridge.db` was not modified. Physical/deployed-server testing was
not performed.
