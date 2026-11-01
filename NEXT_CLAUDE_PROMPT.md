# Next SignBridge task

Read `PROJECT_PROGRESS.md`, `HANDOVER_FOR_NEXT_CLAUDE.md`,
`docs/TEST_REPORT.md`, `docs/REAL_WORLD_TEST_GUIDE.md`,
`docs/CLASSROOM_APPROVAL_WORKFLOW.md`, and `docs/DEPLOYMENT.md` first.
Inspect current code and test results; documentation is not proof of behavior.

## Current acceptance status

Backend 43 tests, frontend 20 tests, production build, Python compile, clean
SQLite Alembic upgrade, local isolated startup, and landing-page responsive
smoke have passed. Full classroom browser E2E and physical-device/media testing
have not been performed. All ISL entries remain experimental.

## Priority

1. Run the detailed manual guide on two laptops using a disposable database.
2. Verify actual camera, microphone, remote playback, 3+ participants,
   screen-share switching, network reconnect, TURN relay, and resource cleanup.
3. Test captions, real translation provider pairs, Deaf/Hearing layouts,
   reduced motion, recording and caption synchronization.
4. Obtain qualified ISL review before changing any review/verified metadata.
5. Before migrating an existing database, back it up and validate a
   schema-specific plan on a clone. Never blindly `stamp head`, `upgrade head`,
   drop, reset, or delete user/classroom data.
6. Add shared notification pub/sub and cross-worker tests before multi-worker
   deployment. Notifications are process-local today.
7. Record each test as PASSED, FAILED, BLOCKED, or NOT RUN with reproducible
   evidence and update progress/report/handover docs.

Keep all test services on disposable data and storage. Do not expose `.env`,
credentials, or real database files. Do not claim browser/device testing that
was not performed.
