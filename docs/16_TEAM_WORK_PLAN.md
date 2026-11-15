# 16 — Team Work Plan

This plan starts with the existing Expo Android and React web templates. Replace Member 1–5 with your group members' names when assigning tasks. Change **Pending** to **Done** when the task is complete.

| Member | Main responsibility |
|---|---|
| 1 | Donor Android screens |
| 2 | Recipient Android screens |
| 3 | Firebase Auth, Firestore, and Security Rules |
| 4 | Admin web app and smart matching |
| 5 | Shared Android features |

## Phase 1 — Sign-in and verification

| Member | Work | Status |
|---|---|---|
| 1 | Build donor sign-in, profile form, and verification status screen. | Done |
| 2 | Build organization sign-in, profile form, and verification status screen. | Done |
| 3 | Configure Firebase Spark and email/password sign-in. Protect roles and verification in Firestore Rules. | Done |
| 4 | Build admin sign-in, the verification queue, and approve/reject actions with audit history. | Done |
| 5 | Build shared location and camera permission handling. | Done |

**Ready when** the admin can approve a demo donor and organization, and pending users cannot publish or request food.

Phase 1 implementation is merged. The donor and organization screens use the shared Firebase project, and the admin app reviews submissions through Firestore. The Firebase Auth emulator test and all eight Firestore rules tests passed. Email/Password is enabled, the tested rules are deployed, and the first admin claim is verified.

**Manual verification pending:** Submit a test donor and organization profile from Android, review both in the admin browser, and confirm that their status updates without a refresh. On a physical Android phone, check the location and camera prompts, denial handling, and updates after returning from Settings.

## Phase 2 — Post and discover donations

| Member | Work | Status |
|---|---|---|
| 1 | Build the draft and publish screens. Include quantity, storage details, allergens, and the pickup window. | Done |
| 2 | Build the nearby donations feed and listing detail. Show distance, deadline, and pickup information. | Done |
| 3 | Implement listing and photo access rules. Connect live listing reads to the shared Firebase project. | Done |
| 4 | Prepare synthetic donor, organization, and listing data. Set up examples for comparing nearby and urgent donations. | Done |
| 5 | Add GPS, manual location entry, maps directions, and camera/gallery selection. Compress optional photos to the 150 KiB limit and connect the preview to the donor form. | Done |

**Ready when** a listing published on phone A appears on phone B without a refresh.

Implementation is integrated into main through reviewed feature branches. Physical Android and live two-phone acceptance are still pending. See [Phase 2 integration](17_PHASE2_INTEGRATION.md) for test commands and synthetic demo scenarios.

## Phase 3 — Request, match, and approve

| Member | Work | Status |
|---|---|---|
| 1 | Build the donor's incoming request list, ranking explanation, and approval screen. | Pending |
| 2 | Build whole-listing requests. Include proposed pickup time and storage confirmation. Show withdrawal and approval status. | Pending |
| 3 | Implement request rules and the atomic approval transaction. Ensure only one organization can be assigned. | Pending |
| 4 | Implement request scoring by distance and pickup timing, with storage compatibility as an eligibility check. Verify scoring with two competing requests. | Pending |
| 5 | Connect GPS or manual coordinates to the recipient's proposed departure point. Handle unavailable distance in coordination with Members 2 and 4. | Pending |

**Ready when** a donor can explain the order of two requests, approve one, and see the assignment update on the recipient's phone.

## Phase 4 — QR pickup and integration

| Member | Work | Status |
|---|---|---|
| 1 | Connect the scanner to the donor's pickup screen. Show recipient confirmation, complete collection, and update donor history. | Pending |
| 2 | Build the recipient pickup screen with the QR reference, signed-in handover confirmation, and collection history. Add cancellation and expiry messages. | Pending |
| 3 | Enforce confirmation ownership, the five-minute confirmation window, and atomic collection. Implement approved cancellation and expiry transitions. | Pending |
| 4 | Connect verification feedback and audit history to the admin review flow. Prepare an assigned donation with valid pickup times for integration. | Pending |
| 5 | Add QR display and scanning, manual reference entry, and camera permission fallback. Add local pickup reminders if time permits. | Pending |

**Ready when** the recipient confirms pickup on phone B and the donor completes it on phone A. Both phones show collected.

## Phase 5 — Test, fix, and rehearse

| Member | Work | Status |
|---|---|---|
| 1 | Test the full donor flow on phone A, including failed publish, competing approvals, cancellation, and repeated pickup. Fix donor screen issues. | Pending |
| 2 | Test the full recipient flow on phone B, including live updates, withdrawal, expiry, and reconnect. Fix recipient screen issues. | Pending |
| 3 | Run Firestore Emulator tests for unauthorized access, competing approvals, oversized photos, expired pickup, and duplicate collection. Fix rule failures. | Pending |
| 4 | Verify admin approval and audit history. Check scoring examples and prepare the demo explanation. | Pending |
| 5 | Test GPS, camera and QR on both phones. Check denied permissions, manual fallbacks, and photo compression. | Pending |

**Done when** the group rehearses one complete free donation on two physical Android phones with the admin web app, and the key authorization and pickup tests pass. Run focused checks as each feature is built and use Phase 5 for the full test pass.

See the [MVP decisions](15_MVP_DECISIONS_AND_FREE_TIER.md) and [demo checklist](12_TESTING_AND_DEMO.md).
