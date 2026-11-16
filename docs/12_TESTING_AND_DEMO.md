# 12 — Testing Plan and Demonstration Script

## Independent tests

| Area | Required checks |
|---|---|
| Roles | Public signup cannot grant admin, approve itself or access other users' private records. Pending, rejected and suspended accounts cannot publish, request or collect |
| Requests | Only approved organizations can request. Reject forged ownership, repeat submissions, missing storage confirmation, stale times and late writes |
| Approval | Two sessions try to approve different requests. Exactly one succeeds. Reject listing-only, request-only and mismatched transactions |
| Pickup | Manual reference and QR use the same checks. Reject absent, forged or expired confirmation, wrong participant and replay. Collection updates both records atomically |
| Cancellation and expiry | Cancel only permitted states. Release the assignment atomically, reopen only with enough time and block late operations even if cleanup has not run |
| Matching | Exact deadline and cutoff, scoring example, ties, stale proposals, storage declarations and unknown distance |
| Photo | Save one optional JPEG under a draft. Reject nonowner writes, post-publication edits, wrong field types and oversize bytes. Missing or invalid pictures show fallback |
| Two devices | Phone B sees the published listing and assignment without refresh. Phone A sees requests and handover acknowledgement. Test permission denial, offline indications and reconnect |
| Admin | Review requires the admin claim and matching immutable audit |

## Demonstration on two Android phones

1. Prepare the same Firebase Spark project on both phones and the admin web client. Use separate synthetic donor and organization accounts, plus a second seeded organization request.
2. Use the web client to approve demo accounts. Sign into phone A as donor and phone B as organization.
3. On phone A, create a donation with a pickup deadline, location, storage requirement and optional compressed photo. Publish it. Open the listing on phone B and check the photo on detail.
4. On phone B, discover the donation with location access and submit a request with a proposed pickup time. On phone A, compare request scores and approve one. Use a fixture where the organization on phone B is selected. Show the assignment update and directions on phone B.
5. During the pickup window show the QR on phone B, scan on phone A, confirm handover on phone B, and complete on phone A. Verify both show collected.
6. Explain why the top-ranked organization was suggested and demonstrate a stale or repeated pickup being rejected.

Rehearse using synthetic data, fresh pickup windows, valid clocks, working network and camera permissions. Use manual location/reference entry and the bundled image fallback if needed. A seeded competing request must be created with the actual listing ID and valid times before showing rankings. Test the scoring function and Firestore Rules locally before the live demo. This repository currently contains the plan and starter Firebase config.

## Recipient donation detail regression check

On Android, sign in as an approved organization, open Browse Food and tap a
donation. Confirm the detail panel fills the space between the app header and
bottom navigation, displays the title and Back to Feed action, and scrolls down
to the request section. Test with and without a listing photo, then return and
open a different donation. Repeat by selecting a donation from My Requests.

While details are loading, the loading message and Back to donations action must
remain visible. If the donation is removed or access is denied, verify the
unavailable message and Back action appear. Repeat at a small screen size and
with an offline cached listing. Native layout still requires device verification;
TypeScript and data-logic tests do not exercise Android layout measurement.
