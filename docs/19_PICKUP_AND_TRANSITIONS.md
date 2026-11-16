# Phase 4 pickup rules and shared helpers

Member 3 implements the shared data operations and rules. Donor/recipient pickup screens, QR display/scanning, manual reference entry, reminders and admin/demo integration remain the other members' tasks.

## Pickup contract

The QR identifies an opaque listing reference and version; it grants no authority by itself. Use the same signed-in operations for QR scanning and manual entry. Do not put credentials or personal details in the QR.

- The active approved assigned organization confirms handover while the listing is assigned and `pickupStartsAt <= server time < pickupDeadline`. The request stays approved and gets `recipientConfirmedAt` and `updatedAt` as server timestamps. It may clear its own confirmation while still approved/assigned, including after the deadline; it cannot alter a collected request.
- The active approved owning donor completes collection while the assigned organization remains active/approved. Server time must be inside the pickup window, the confirmation must be at or after pickup start and no later than server time, and completion must be no more than five minutes after confirmation. The five-minute limit is inclusive; the pickup deadline is exclusive.
- Completion changes both the listing and selected request to `collected` in one transaction. The listing gets server `collectedAt`, retains the selected organization, and both records retain their immutable donation/request details. Duplicate collection and donor-forged confirmation are rejected.

## Cancellation and expiry

| Action | Result |
|---|---|
| Either participant releases an assignment with at least 15 minutes remaining | Listing becomes open; selected request becomes cancelled |
| Either participant releases with less than 15 minutes remaining, before deadline | Listing and selected request become cancelled |
| Donor explicitly closes an assignment before deadline | Listing and selected request become cancelled, even with 15 minutes or more remaining |
| Assigned recipient attempts to close with at least 15 minutes remaining | Rejected; release must reopen the listing |
| Owning donor, admin or assigned organization reconciles at/after deadline | Open listing expires; an assigned listing and its selected request expire atomically |

Cancellation and assigned expiry clear both `acceptedOrganizationUid` and `recipientConfirmedAt`. Other pending requests stay unchanged. After reopening, an organization whose request was cancelled cannot resubmit for that listing; other pending proposals are eligible only if still valid. Closed listings cannot reopen. Removing confirmation competes safely with collection: they cannot both succeed against the same approved state.

## Mobile API

Import from `mobile/src/lib/pickup.ts`:

- `confirmPickupHandover(listingId, organizationUid)` — assigned organization acknowledges handover.
- `clearPickupHandover(listingId, organizationUid)` — retracts that acknowledgement.
- `completePickupCollection(listingId, organizationUid)` — owning donor completes the selected assignment.
- `cancelApprovedDonation(listingId, organizationUid, mode?)` — mode defaults to `release`; donors may choose `close`. Returns `{ reopened: boolean }` after a successful commit.
- `reconcileExpiredListing(listingId)` — authorized expiry reconciliation.

Every operation waits for authentication restoration and uses a transaction, including confirmation and retraction. Transactions require connectivity and avoid queuing a handover for later. Await the promise before showing success. Firebase Rules use authoritative server time; local timing checks only provide early feedback and may differ if the device clock is wrong. On rejection, refresh the listing/request, show the error and allow retry. Confirm destructive close/cancellation actions in the UI.

Use existing `subscribeToListing` and `subscribeToMyRequestForListing` callbacks for live state, including cache/pending metadata. Cached state is informational; do not enable pickup actions until the listing and request are confirmed by the server. Existing listing parsing exposes `collectedAt`; request parsing exposes `recipientConfirmedAt`. History remains based on authorized listing/request reads; no new collection or index is needed for these operations.

## Shared QR and reference components (Member 5)

Member 5 implements the shared QR display, camera scanning, manual reference fallback, and pickup reminder utilities:

- `mobile/src/lib/qr-service.ts`:
  - `CURRENT_QR_VERSION = 1`, `QR_PREFIX = 'foodrescue'`.
  - `encodePickupQrPayload(listingId, version?)`: produces versioned payload `foodrescue:v1:<listingId>`.
  - `parsePickupReference(rawInput)`: strictly validates scanned QR payload or manual reference input. Strips whitespace, rejects arbitrary URLs (e.g. `https://...`) to prevent phishing or redirection, enforces maximum payload length, validates QR version, and validates listing ID format. Supports entering either full payload or plain reference ID.
  - `generateQrMatrix(payload)`: generates a 2D boolean module matrix for pure React Native vector rendering.
- `mobile/src/lib/pickup-reminders.ts`:
  - `getPickupCountdown(startsAt, deadline, now?)`: models pickup window progression across `upcoming`, `active`, `expiring_soon` (<= 15 minutes before deadline), and `expired` phases.
  - `computeReminderSchedule(listingId, startsAt, deadline)`: calculates reminder checkpoints.
  - `isPickupReminderSet(listingId)` & `setPickupReminder(listingId, enabled)`: manages persistent in-app local pickup reminder preferences in `AsyncStorage`.
- `mobile/src/components/qr-display-card.tsx`:
  - Recipient pickup display card rendering a crisp vector-grid QR code without native SVG dependencies.
  - Displays human-readable monospace Reference ID with tap-to-copy action.
  - Shows real-time window timing/countdown badge and handover confirmation guidance.
  - In-app pickup reminder toggle button.
  - Embedded into `mobile/src/components/request-status-card.tsx` for approved requests.
- `mobile/src/components/qr-scanner-card.tsx`:
  - Donor scanner component with live `CameraView` barcode scanner, target reticle overlay, and camera permission handling (request prompt, denial banner, and device Settings link).
  - Integrated "Enter Manually" tab providing full manual reference entry fallback without camera.
  - In-place QR payload validation and optional `expectedListingId` match verification.

## Verification and deployment

From the repository root:

```powershell
pnpm test:mobile
pnpm test:rules
pnpm --dir mobile lint
pnpm --dir mobile typecheck
pnpm --dir mobile format:check
```

The review passed 41 mobile tests and 44 rules tests. Coverage includes confirmation/retraction ownership, stale/future confirmations, revoked recipient eligibility, replay, atomic cancellation/expiry, admin expiry, detached requests and collection racing with retraction. Pure timing tests cover exact five-minute, 15-minute and deadline boundaries.

The latest rules still need deployment before live integration:

```powershell
pnpm --dir firebase exec firebase deploy --only firestore:rules --project foodrescue-4ff0b
```

No deployment was performed during this review. After the other pickup screens are integrated, rehearse on two physical Android devices: confirm then collect, clear and reconfirm, let confirmation expire, cancel with and without enough remaining time, close as donor, and reconcile an overdue assignment. Verify both devices show the same committed state and denied/duplicate actions show errors. Physical testing is pending; automated checks do not verify QR camera behavior.