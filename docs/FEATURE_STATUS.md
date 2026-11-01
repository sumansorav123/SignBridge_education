# SignBridge feature status

Statuses describe the evidence in [TEST_REPORT.md](./TEST_REPORT.md). A PASS
may apply only to the explicitly named automated layer; it does not imply
physical-device or full browser acceptance.

| Feature / validation layer | Status | Evidence / limitation |
|---|---|---|
| JWT authentication, roles, password hashing | PASS | Backend auth integration tests pass. Teacher/student browser sign-in and refresh persistence: NOT RUN. |
| Classroom creation and join approval APIs | PASS | Backend integration tests cover persisted pending requests, owner checks, approval/rejection, transaction rollback, and membership. Full browser journey: NOT RUN. |
| Teacher/student request notifications | PASS | Single-process notification integration tests pass; REST remains authoritative. Browser notification rendering: NOT RUN. |
| Classroom WebSocket authentication and membership authorization | PASS | Automated tests cover first-message auth, teacher ownership, approved enrollment, denied pending/rejected users, and approved reconnect. Physical network: NOT RUN. |
| Cross-worker notification delivery | BLOCKED | Notifications are process-local; no shared broker is configured. |
| WebRTC offer/answer signaling | PASS | Backend integration tests pass. |
| WebRTC ICE/media, camera, microphone, remote playback | NOT RUN | No physical device/browser media test was run. |
| Peer retry/backoff helpers | PASS | Helper tests pass. Wi-Fi-loss and live multi-peer recovery: NOT RUN. |
| STUN/TURN configuration builder | PASS | Unit tests cover STUN/TURN config handling. |
| TURN relay traversal | BLOCKED | No TURN server/credentials or restricted-network test is available. |
| Screen-share WebRTC track replacement | NOT RUN | Source path is present; live share/restore was not exercised. |
| Browser speech-to-text captions | NOT RUN | Requires supported browser, microphone, and live session. |
| Caption backend pipeline and manual caption handling | PASS | Backend tests pass. On-device caption timing: NOT RUN. |
| Translation fallback/status handling | PASS | Backend tests cover fallback/status. Real provider output and language-pair accuracy: NOT RUN. |
| Hearing Mode / Deaf Mode browser UI | NOT RUN | Preference/backend behavior is covered, but no visual or assistive-technology run was performed. |
| ISL catalog review safeguards | PASS | Automated checks report 0 reviewed / 100 experimental entries. |
| ISL sign correctness / qualified interpreter review | NOT RUN | No qualified review has occurred; do not describe signs as verified. |
| Avatar timeline/pose helper logic | PASS | Unit tests pass. |
| 3D avatar rendering, controls, visual acceptance | NOT RUN | No browser rendering acceptance was performed; avatar is experimental, not interpreter-certified. |
| MediaPipe hand-tracking demo | NOT RUN | Not run in browser; hand tracking is not sign recognition. |
| Recording authorization and playback permissions | PASS | Backend tests cover owner/enrolled-user authorization. |
| Recording capture stream helper | PASS | Five unit tests cover stable canvas video track, dynamic preview source, retained mic audio, aspect ratio, frame-error reporting, unsupported-capture error, and cleanup. |
| Actual recording start/pause/resume/stop, playback, A/V sync | NOT RUN | No real MediaRecorder output was created or inspected. |
| Camera-to-screen-share recording transition | PASS | Source-level fix and helper unit tests ensure the stable canvas output samples the current preview element. Actual recorded transition remains NOT RUN. |
| Caption timestamps, recording alignment, translation sync | NOT RUN | No playback/timing comparison was run. |
| Attendance and learning materials | NOT RUN | No manual classroom acceptance was performed. |
| Frontend unit tests and production build | PASS | `npm test`: 25 passed; `npm run build`: exit 0. |
| Local FastAPI/Vite startup | PASS | Disposable SQLite only; health and Vite root returned HTTP 200. |
| Browser E2E / approval journey | NOT RUN | Playwright recorder child unavailable; HTTP probe fallback only. |
| Landing responsive smoke | PASS | Phase 10 landing page only, 320–1920 CSS px. Classroom/dashboard/registration responsive acceptance: NOT RUN. |
| Existing configured database migration | BLOCKED | Unversioned DB remains unchanged; schema-specific backup/clone plan required. |
| Docker-based validation | BLOCKED | Docker command unavailable. |
| Phase 12 backend regression suite | PASS | Reran `pytest -q`: 43 passed. |
| Phase 12 frontend unit tests | PASS | Reran `npm test`: 25 passed, 0 failed. |
| Same-machine LAN-origin API health and CORS preflight | PASS | Vite proxy health returned 200; backend allowed `http://192.168.205.101:5173`. Not a second-device check. |
| Scripted live approval/rejection notifications and classroom WebSockets | PASS | Single-process disposable-DB flow: pending/rejected denied (4403), approved connected (`ready`) and reconnected; approval created membership, rejection did not. No UI/browser. |
| Teacher login route render from LAN origin | PASS | Page load only in the shared browser; no login or classroom UI interaction. |
| Physical same-Wi-Fi access | NOT RUN | No second-laptop request; same-machine LAN-IP access does not verify remote reachability. |
| Windows Firewall readiness for remote clients | BLOCKED | Active network profile was Public and firewall enabled; no rule/profile changes were made. |
| Phase 12 production build | NOT RUN | Skipped as requested; Phase 11 build result is not a Phase 12 result. |
| Browser-driven login/approval/refresh journey | NOT RUN | No browser session exercised the UI in Phase 12. |
| Physical media, recording playback, and accessibility acceptance | NOT RUN | Camera/mic, WebRTC media, screen share, real recording, captions/translation, Deaf Mode, avatar, and assistive technology remain untested. |

## ISL review rule

All 100 ISL catalog entries remain experimental. No content should be represented
as interpreter-reviewed, verified, or instructional until qualified review
evidence is recorded.
