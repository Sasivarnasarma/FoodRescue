# 02 — Product Requirements

| Role | Requirements |
|---|---|
| Donor business | Sign in, submit a profile, create a draft, optionally upload a compressed photo, publish a free donation, review ranked requests, approve one, scan the pickup QR, complete collection and view history |
| Recipient organization | Sign in, submit a profile, browse nearby donations, view offer details, request an entire listing with a proposed pickup time and storage declaration, receive approval status, get directions, display QR and confirm handover |
| Admin | Sign in to a separate web client, review synthetic donor and organization profiles, approve or reject them, and record who performed the review |

A donation includes a title, description, category, whole quantity, unit, storage instructions, allergen declaration, pickup location and pickup window. Best-before and use-by dates are separate when supplied. The pickup deadline must respect the stated use-by time. The optional photo is one compressed JPEG up to 150 KiB. Buyers, prices and payments are outside the MVP.

## Acceptance criteria

1. An approved donor on Android phone A publishes a donation. An eligible organization on phone B sees it through the shared Firestore project without refreshing.
2. Phone B requests the full listing and declares that it can meet storage requirements. Phone A sees the request and a ranking explanation. A second seeded request makes the comparison visible.
3. Phone A approves one eligible organization. Rules reject competing approval attempts. Phone B sees the updated assignment.
4. Phone B displays the pickup QR and confirms handover. Phone A scans, completes collection and sees the same completed state as phone B.
5. Unauthorized, duplicate and late operations are rejected. Camera and GPS denial have manual fallbacks. The apps show loading, empty, error, offline, permission-denied and success states.
6. The demo runs on Firebase Spark and shows GPS discovery, maps handoff, optional camera/gallery photo, QR scanning and cross-device updates. Local reminders are optional.

See [user flows](06_USER_FLOWS.md) and the [demo procedure](12_TESTING_AND_DEMO.md).
