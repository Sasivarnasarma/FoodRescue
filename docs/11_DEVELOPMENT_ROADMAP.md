# 11 — Development Roadmap

Build one complete donation flow before expanding screens.

| Order | Deliverable | Exit check |
|---|---|---|
| 1 | Set up Android and admin clients, shared Firebase Spark configuration, email/password and emulator tests | Roles sign in and unauthorized access is denied |
| 2 | Minimal web verification and donor listing creation | Admin approves synthetic accounts and another device discovers an open listing |
| 3 | Whole-listing requests, atomic approval and smart matching | Donor compares two requests and can approve only one |
| 4 | GPS and maps handoff, optional photo capture/gallery and compression, QR handover | Two physical Android phones complete a free pickup |
| 5 | Cancellation and expiry checks, permission fallbacks, local reminders if time permits, and demo rehearsal | Two-phone flow and security tests pass |

Use focused issues and PRs with the affected flow, Rules tests, and manual device steps. Prioritize authorization, cross-device state, smart matching and QR pickup. Category-suggestion AI is optional if the assignment calls for it. IoT and broader recipient onboarding are future work.
