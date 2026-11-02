# Runtime Validation Report

**Generated:** 2026-11-02  
**Target:** `C:\Users\Hello\Downloads\SignBridge_Final_Handover\SignBridge`

## Summary

| Step | Status | Exit code | Details |
|---|---|---:|---|
| Startup | PASS | 0 | Disposable FastAPI/Uvicorn API on `127.0.0.1:8128` and Vite frontend on `127.0.0.1:5184` were responsive during the isolated browser flow. |
| Backend integration | PASS | 0 | Full pytest suite: 73 passed, 0 failed, 0 skipped. |
| Frontend tests | PASS | 0 | `npm test`: 31 passed, 0 failed, 0 skipped. |
| Production build | PASS | 0 | `npm run build`: 2,293 modules. |
| Browser E2E | PARTIAL | N/A | Teacher/student classroom/material flow and download response/UI initiation verified; browser did not emit the awaited download event. |
| PostgreSQL | UNVERIFIED | N/A | Offline Alembic SQL compilation passed; no PostgreSQL server was available for live integration. |

**Overall:** PARTIAL — automated suites and build pass, but browser-saved material bytes and live PostgreSQL integration remain unverified.

## Browser flow evidence

The isolated database and storage were disposable. Teacher/student registration and login, classroom
creation, join request, approval, entry, materials listing, and upload succeeded. The selected
material request returned HTTP 200 with the expected content type, attachment filename, private
cache headers, and 45 fixture bytes. Frontend instrumentation observed a 45-byte Blob URL and a
download-anchor click while user activation was active. The browser automation timed out waiting for
its download event; the final file on disk was not verified. No production service or real user data
was used.

## Environment and evidence

```text
environment:
  docker: UNAVAILABLE — Docker CLI not installed
  node: AVAILABLE — v24.21.0
  playwright: PARTIAL — browser automation ran; download event capture timed out
  infra-tier: FALLBACK(embedded/in-memory) — disposable SQLite test database; no Docker
  browser-tier: PARTIAL(Playwright/browser automation) — browser flow ran, saved-file capture incomplete
startup: PASS — Uvicorn and Vite served the isolated test flow
integration: PASS — exit_code: 0, passed: 73, failed: 0, skipped: 0
e2e: PARTIAL — exit_code: N/A (browser-tool download-event wait timed out), flow and boundaries described above
overall: PARTIAL — PostgreSQL live integration and final browser file save remain unverified
```

Python compilation, focused material-download/database-configuration tests (14 passed), production
build, and `git diff --check` also passed. No database migration or deployment was performed. No
testing-strategy artifact was supplied for this phase, so this report does not claim strategy
conformance or production acceptance.
