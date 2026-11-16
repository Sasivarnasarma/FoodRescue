# Phase 4 pickup rules and shared helpers

Member 3 implements the shared data operations and rules. Donor/recipient pickup screens, QR display/scanning, manual reference entry, reminders and admin/demo integration remain the other members' tasks.

## Pickup contract

The QR identifies an opaque listing reference and version; it grants no authority by itself. Use the same signed-in operations for QR scanning and manual entry. Do not put credentials or personal details in the QR.

- The active approved assigned organization confirms handover while the listing is assigned and `pickupStartsAt <= server time < pickupDeadline`. The request stays approved and gets `recipientConfirmedAt` and `updatedAt` as server timestamps. It may clear its own confirmation while still approved/assigned, including after the deadline; it cannot alter a collected request.
- The active approved owning donor completes collection while the assigned organization remains active/approved. Server time must be inside the pickup window, the confirmation must be at or after pickup start and no later than server time, and completion must be no more than five minutes after confirmation. The five-minute limit is inclusive; the pickup deadline is exclusive.
- Completion changes both the listing and selected request to `collected` in one transaction. The listing gets server `collectedAt`, retains the selected organization, and both records retain their immutable donation/request details. Duplicate collection and donor-forged confirmation are rejected.

## Cancellation and expiry

| Action                                                                           | Result                                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Either participant releases an assignment with at least 15 minutes remaining     | Listing becomes open; selected request becomes cancelled                              |
| Either participant releases with less than 15 minutes remaining, before deadline | Listing and selected request become cancelled                                         |
| Donor explicitly closes an assignment before deadline                            | Listing and selected request become cancelled, even with 15 minutes or more remaining |
| Assigned recipient attempts to close with at least 15 minutes remaining          | Rejected; release must reopen the listing                                             |
| Owning donor, admin or assigned organization reconciles at/after deadline        | Open listing expires; an assigned listing and its selected request expire atomically  |

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

## Member 1 — Donor pickup screen and scanner integration

Member 1 connects the camera scanner to the donor pickup screen, displays live recipient confirmation, completes collection inside the pickup window, and updates donor history:

1. **Pickup QR Parser (`mobile/src/lib/pickup-qr.ts`)**:
   - Parses standard JSON payload (`{"listingId": "...", "version": 1}`), custom deep link URI schemes (`foodrescue://pickup?listingId=...` / `foodrescue://pickup/...`), and manual alphanumeric reference strings.
   - Generates JSON payload for QR codes via `generatePickupQrPayload(listingId, version)`.

2. **Collection Timing & Eligibility (`mobile/src/lib/pickup-validation.ts`)**:
   - `checkDonorCollectionEligibility` determines whether collection is ready, awaiting confirmation, expired (> 5 minutes elapsed), outside window (< startsAt), or expired (>= deadline).
   - Computes `remainingConfirmationMs` for live countdown timers.

3. **Donor Pickup Screen (`mobile/src/components/donor-pickup-screen.tsx`)**:
   - Subscribes in real time to both listing and approved recipient request.
   - Live 5-minute security countdown timer with second-by-second updates via `useCurrentTime()`.
   - Clear visual status panels for:
     - Ready for collection: displays recipient confirmation time, remaining validity countdown, and primary "Complete Collection Handover" button.
     - Awaiting recipient confirmation: guides donor to ask recipient to tap "Confirm Handover".
     - Confirmation expired: prompts recipient to re-confirm handover.
     - Pickup window closed or deadline expired: offers expiry reconciliation.
   - Cancellation actions:
     - "Release Assignment": reopens listing to other organizations if >= 15 min remain.
     - "Close Donation Listing": permanently cancels listing and approved request.
     - "Reconcile Expired Donation": marks overdue listing and request as expired.
   - Completed Collection Receipt: displays official completion timestamp, accepted organization ID, quantity, and food safety handover notice.

4. **Pickup QR Scanner Modal (`mobile/src/components/donor-pickup-scanner.tsx`)**:
   - Integrated camera scanning via `CameraView` from `expo-camera` with `useDevicePermission('camera')` handling.
   - Viewfinder overlay targeting frame with green corner guides and scanning feedback.
   - Full manual reference entry fallback allowing direct input or copy-pasting of references, JSON, or URIs.
   - Web platform fallback advising manual entry.
   - Validates that scanned/entered listing exists and is owned by the signed-in donor.

5. **Feed & Profile Navigation (`mobile/src/components/donor-listings-feed.tsx`, `mobile/src/components/donor-profile.tsx`)**:
   - Feed header bar includes "📷 Scan / Lookup" shortcut.
   - Assigned cards display "Handover & Pickup →" action.
   - Collected cards display "View Collection Receipt" action.
   - Donor profile includes direct "📷 Scan Pickup QR / Handover" shortcut when approved.

## Verification and deployment

From the repository root:

```powershell
pnpm test:mobile
pnpm test:rules
pnpm --dir mobile lint
pnpm --dir mobile typecheck
pnpm --dir mobile format:check
```

The review passed 54 mobile tests and 44 rules tests. Coverage includes confirmation/retraction ownership, stale/future confirmations, revoked recipient eligibility, replay, atomic cancellation/expiry, admin expiry, detached requests and collection racing with retraction. Pure timing tests cover exact five-minute, 15-minute and deadline boundaries.

The latest rules still need deployment before live integration:

```powershell
pnpm --dir firebase exec firebase deploy --only firestore:rules --project foodrescue-4ff0b
```

No deployment was performed during this review. After the other pickup screens are integrated, rehearse on two physical Android devices: confirm then collect, clear and reconfirm, let confirmation expire, cancel with and without enough remaining time, close as donor, and reconcile an overdue assignment. Verify both devices show the same committed state and denied/duplicate actions show errors. Physical testing is pending; automated checks do not verify QR camera behavior.
