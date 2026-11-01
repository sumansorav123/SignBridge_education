# Registration HTTP 500 investigation

## Root cause

The reported HTTP 500 was not reproduced in the available workspace, so its
production/runtime root cause is not confirmed. No backend server was running
when the investigation began, and there was no `backend/.env`, project database,
or backend traceback available to identify the database and settings used by
the failing instance. Naming a specific exception without that evidence would
be speculation.

The registration endpoint works in an isolated local run using a disposable
SQLite database. This confirms that the checked-in registration path can
register and authenticate both account roles; it does not prove that the
environment that produced the original 500 is configured the same way.

## Files changed

- `backend/tests/test_auth.py` — added student registration/login, duplicate
  email, response password-exclusion, and invalid registration-payload
  coverage.
- `docs/REGISTRATION_BUG_FIX.md` — this investigation report.

No registration implementation, frontend API configuration, migration, or
production database was changed.

## Database changes

No persistent database was changed. Existing Alembic migrations were applied
to a disposable SQLite database, and the registration tables and required user
columns were present. The temporary database was removed after verification.

## API and frontend findings

- The frontend posts to `POST /api/auth/register`; login uses
  `POST /api/auth/login`.
- The request uses JSON and includes the role (`teacher` or `student`).
- Registration normalizes email, rejects an existing account with HTTP 409,
  hashes the password, creates the user and role-specific profile, commits,
  and returns the authentication response.
- Request validation rejects malformed email, weak passwords, missing
  required fields, and unsupported roles with HTTP 422.
- The response serializer does not return the password or password hash.
- No API behavior change was made because the available evidence did not
  identify a defect in the registration implementation.

## Tests and results

- `python -m pytest tests/test_auth.py -q` — **12 passed**.
- HTTP checks against the app backed by disposable SQLite — **passed**:
  health/database check; teacher and student registration (201); login after
  registration (200); duplicate registration (409).
- Browser checks through the frontend — **passed**: teacher and student forms
  created accounts and navigated to their respective portals; the created
  accounts also logged in against the isolated database.
- Alembic upgrade and schema inspection on disposable SQLite — registration
  tables and user columns verified.
- Full backend test suite — **34 passed, 1 failed**. The unrelated existing
  failure is `tests/test_accessibility_recordings.py::test_language_and_translation_status`:
  the test expects 12 languages but the application returns 13 (including
  Assamese).

## Remaining issue

The original HTTP 500 remains unconfirmed and therefore is not represented as
fixed. To identify and repair that runtime failure, capture the complete
backend traceback for one failed request and provide the active database
engine (not credentials), whether `alembic upgrade head` has been run against
that database, and the relevant non-secret settings such as
`AUTO_CREATE_TABLES` and `API_PREFIX`. Redact passwords, tokens, secret keys,
and connection-string credentials before sharing logs.
