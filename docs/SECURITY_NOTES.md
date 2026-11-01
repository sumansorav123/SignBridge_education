# Security notes

Findings from reading the code (no penetration test or dynamic scan was run).

## Changed this session
* **WebSocket URL tokens removed.** `backend/app/api/websocket.py` no longer reads `?token=`. Browsers send
  `{"type":"auth","token":...}` as the first message (10 s timeout, close 4401 on failure, 4403 for forbidden /
  bad origin). `Authorization: Bearer` headers still work for non-browser clients. Regression tests added (not run).
* **ISL review claims.** A sign can only be `verified` if `review_status="interpreter_reviewed"` **and** `reviewed_by` +
  `reviewed_at` are set; otherwise the model forces it back to experimental.

## Observed, acceptable
* Origin check on the WebSocket upgrade against `CORS_ORIGINS` (requests without an Origin header are allowed for native clients).
* Recording playback uses a short-lived playback token plus enrollment/ownership checks; listing/get/transcript check access.
* Upload size is enforced while streaming (`MAX_RECORDING_MB`, `MAX_MATERIAL_MB`).
* Production start-up refuses the built-in dev `SECRET_KEY`.
* No token logging found by grep.

## Changed in session 2 (not dynamically tested)
* `core/config.py`: with `ENVIRONMENT=production` the backend now **refuses to start if `SEED_DEMO_DATA=true`**.
* `pages/auth/Login.jsx`: the demo-account button and password hint render only in dev builds or when
  `VITE_SHOW_DEMO_LOGIN=true` is set at build time. Production builds omit it. (Demo credentials remain in the JS source
  string constants of `Login.jsx` and `seed.py`; the seed is the only place they take effect.)
* Deployment checklist: `ENVIRONMENT=production`, `SEED_DEMO_DATA=false`, `VITE_SHOW_DEMO_LOGIN` unset/false, delete any
  pre-existing demo users from the production DB.

## Risks / to do
1. **Demo accounts** (now guarded, see above): `SEED_DEMO_DATA=true` creates `teacher@signbridge.app` etc. with the public password in `seed.py`,
   and `Login.jsx` pre-fills them. **Set `SEED_DEMO_DATA=false` and remove the prefill before any real deployment.**
2. **Rate limiting** exists only for login/register and is in-process memory (resets on restart, not shared across workers).
   Add a shared limiter (Redis / reverse proxy) and limit uploads, translation and WebSocket connects.
3. **Upload validation is extension + size based.** No content sniffing was found; add MIME/magic-byte checks and antivirus for materials.
4. **TURN credentials in `VITE_*` are public.** Add a backend endpoint that mints time-limited coturn credentials.
5. **Third-party calls**: translation providers receive caption text; MyMemory is a free public service. Use self-hosted LibreTranslate for privacy-sensitive classes.
6. MediaPipe model/WASM load from Google/jsDelivr by default; self-host for strict privacy or CSP.
7. Not reviewed in depth: SQL layer (SQLAlchemy ORM used, no raw SQL spotted in grep), refresh-token rotation/revocation, CORS in production, security headers.
8. The access token is held in JS (`tokenStore`), so XSS would expose it. Keep dependencies patched and add a CSP.
