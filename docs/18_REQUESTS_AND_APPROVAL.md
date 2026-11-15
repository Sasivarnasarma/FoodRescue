# Phase 3 request data and approval integration

Member 3 provides rules and shared mobile data helpers. Request forms, donor screens, location input and scoring remain the other members' tasks.

## Contract

Requests live at `foodListings/{listingId}/requests/{organizationUid}`. See the schema for exact fields. Initial status is `requested`; recipients withdraw to `withdrawn`, and donors approve to `approved`. Cancellation, collection and expiry transitions remain Phase 4 work. One organization has one request per listing and cannot resubmit a withdrawn request.

Requests require the whole donation, affirmative storage compatibility, a pickup proposal at or after server time inside the pickup window, and at least 15 minutes before the deadline. `departureLocation` is an optional GeoPoint; missing coordinates do not block requesting. Declarations and coordinates are organization supplied. Scoring remains advisory.

Approval atomically writes the listing to `assigned` with `acceptedOrganizationUid` and the selected request to `approved`. Rules recheck active approved donor and organization accounts, pickup timing, storage declaration and reciprocal after-states. Other pending requests remain unchanged; effective availability comes from the parent. Donors cannot approve two requests or change an assignment through these Phase 3 operations.

## Shared helpers

`mobile/src/lib/requests.ts` exposes `submitDonationRequest`, `withdrawDonationRequest`, `approveDonationRequest`, `getListingRequest`, `subscribeToListingRequests`, `subscribeToOrganizationRequests` and `subscribeToMyRequestForListing`.

The single-request listener also supplies cache/pending metadata as its second callback argument. Both query subscriptions use `(requests, page)` callbacks. `page` supplies `fromCache`, `hasPendingWrites` and `nextCursor`. Pass `{ after: page.nextCursor }` as the final options argument for another page, scoped to the same query. Queries return at most 50 documents. Unsubscribe on screen exit and label cached/pending results. Mutation promises resolve after server acknowledgement; approval transactions require a connection. Organizations can read their own missing request before submitting and their request history without other organizations' locations. Rules check private recipient eligibility during donor approval; donors cannot read private recipient profiles directly.

## Checks and deployment

From the root:

```powershell
pnpm test:rules
pnpm --dir mobile lint
pnpm --dir mobile format:check
pnpm --dir mobile typecheck
```

Tests cover revoked verification/account status, concurrent approvals, two approvals in one batch, stale proposals, historical reads and bounded collection-group queries. Deploy reviewed rules and indexes with:

```powershell
pnpm --dir firebase exec firebase deploy --only firestore --project foodrescue-4ff0b
```

Wait for the request-history collection-group index to build. Deployment was not performed during this review. Once the remaining screens exist, submit two competing requests, compare recommendations, approve one and verify the committed assignment on both devices. Retry a competing approval and confirm failure. Reject one applicant after submission and verify it cannot be selected. Physical-device integration remains pending.