# 05 — Database Schema (Cloud Firestore)

Planned contract for the donation-only MVP. See [MVP decisions](15_MVP_DECISIONS_AND_FREE_TIER.md) and [security requirements](09_SECURITY_AND_PERMISSIONS.md).

## 1. Identity and verification

- `users/{uid}` is private to the owner and admin. Fields: immutable `role` (`provider` or `organization`), `accountStatus` (`active` or `suspended`), `displayName`, `createdAt`, `updatedAt`. Public signup starts active. An admin custom claim grants admin authority independently of the profile role.
- `profiles/{uid}` stores the donor or organization `name`, `type` (matching the account's role), and `verificationStatus` (`pending`, `approved`, or `rejected`). One profile per user. The owner can create a pending profile, and a claimed admin reviews it. The reviewed profile records `lastAuditId`. Admin audit rules bind that new ID, target UID, previous and new verification statuses, actor and server time. Use synthetic application details for the assignment. The owner sees the decision and latest `rejectionReason`. Approval clears that field. Historical audit records remain admin-only.
- Use Firestore Timestamp values. Rules compare authoritative write times with `request.time`. Role, verification, and account status are protected fields.

## 2. Donation listings

`foodListings/{listingId}`

| Fields | Contract |
|---|---|
| providerUid, providerName | Owner UID and verified profile name snapshot |
| title, description, category | Donor-provided text and a category from the MVP category list |
| quantity, unit | Positive integer and one of pack, portion, item, g. The full quantity is allocated together |
| storageRequirement, storageInstructions | Requirement is ambient, chilled, or frozen. Instructions are donor-provided |
| allergenInfo, allergenDeclaration | Published details and explicit provided or unknown status |
| pickupAddress, pickupLocation | Donor-confirmed address and GeoPoint. Use a business pickup location |
| pickupStartsAt, pickupDeadline, bestBeforeAt?, useByAt? | Start precedes deadline. If use-by is supplied, pickup deadline must not exceed it |
| status | draft, open, assigned, collected, cancelled, expired |
| acceptedOrganizationUid? | Set on assignment and retained on collection. Cleared when a cancelled assignment reopens or closes as expired |
| createdAt, updatedAt, collectedAt? | Server timestamps |
| demoImageKey? | Labelled bundled fallback image |

Publish only with a valid pickup location and complete required details. Lock material fields on publication. Correct material errors by cancelling the old listing and publishing a replacement. No numeric stock counters are needed because an assignment covers the whole listing.

### Photo document

`foodListings/{listingId}/photos/primary` contains `jpeg: Bytes` and `updatedAt: Timestamp`. The active, approved owner can create, replace, or remove this one optional photo while the parent is a draft. Rules enforce exact fields, server time, and a nonempty payload of at most 153,600 bytes. The app re-encodes on Android and handles decode failures. Exempt `jpeg` from indexing. Use direct reads on listing detail with the parent's access rules. Feed queries exclude photo documents.

## 3. Requests and pickup

`foodListings/{listingId}/requests/{organizationUid}`

| Fields | Contract |
|---|---|
| organizationUid, providerUid | Match the document ID and parent owner |
| organizationName | Approved profile name snapshot |
| departureLocation? | Organization-provided operational location for matching. Visible only to the parties and admin |
| plannedPickupAt | Organization's proposed time inside the pickup window |
| canMeetStorageRequirement | Explicit affirmative declaration for this listing |
| status | requested, approved, withdrawn, cancelled, collected, expired |
| recipientConfirmedAt? | Recipient-controlled server timestamp for QR handover acknowledgement |
| createdAt, updatedAt | Server timestamps |

One request per organization per listing. A withdrawn or cancelled request stays in history and cannot be resubmitted for that listing. Pending requests do not hold food. Once another request is approved, the UI derives “assigned to another recipient” from the parent instead of writing to every request. If the assignment is cancelled and the listing reopens, pending requests are eligible again only if their proposed pickup time is still valid.

Approval and collection update the listing and chosen request in the same transaction. Use reciprocal `getAfter()` checks linking the selected organization on both writes. The collected request and listing serve as the handover record. No separate stock ledger or pickup-record collection is needed for the MVP. See [state transitions](06_USER_FLOWS.md).

## 4. Audit and reads

`adminAuditLogs/{auditId}` stores `adminUid`, `targetUid`, `action` (`review_profile`), `reason` (1–500 characters for rejection, empty for approval), `previousStatus` (`pending`, `approved` or `rejected`), `newStatus` (`approved` or `rejected`), and `createdAt`. Use a new Firestore auto-ID and save it as the profile's `lastAuditId`. The profile update and audit creation must commit together. Only admins read full audit records. Owners read the current decision and latest `rejectionReason` on their profile. Approval clears the reason. Older profiles may lack this field until their next review.

Browse uses bounded pages of open listings. Clients filter elapsed deadlines and locally rank nearby results. Server time governs eligibility to write. Providers query their own listings and read requests under those listings. Organizations find their requests with a requests collection-group query constrained to their own organizationUid. Enable explicit collection-group Rules for that query while restricting writes to the documented listing path. They can fetch a historical listing by ID when their own request exists. Add the indexes required by the actual queries and test allowed and denied reads with Rules. Query results must satisfy authorization without relying on client filtering. In-app updates derive from authorized listing and request changes.
