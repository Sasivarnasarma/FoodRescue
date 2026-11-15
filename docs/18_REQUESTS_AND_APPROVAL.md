# Phase 3 request data and approval integration

Member 3 provides rules and shared mobile data helpers. Request forms, donor screens, location input and scoring remain the other members' tasks.

## Contract

Requests live at `foodListings/{listingId}/requests/{organizationUid}`. See the schema for exact fields. Initial status is `requested`; recipients withdraw to `withdrawn`, and donors approve to `approved`. Cancellation, collection and expiry transitions remain Phase 4 work. One organization has one request per listing and cannot resubmit a withdrawn request.

Requests require the whole donation, affirmative storage compatibility, a pickup proposal at or after server time inside the pickup window, and at least 15 minutes before the deadline. `departureLocation` is an optional GeoPoint; missing coordinates do not block requesting. Declarations and coordinates are organization supplied. Scoring remains advisory.

Approval atomically writes the listing to `assigned` with `acceptedOrganizationUid` and the selected request to `approved`. Rules recheck active approved donor and organization accounts, pickup timing, storage declaration and reciprocal after-states. Other pending requests remain unchanged; effective availability comes from the parent. Donors cannot approve two requests or change an assignment through these Phase 3 operations.

## Shared helpers

`mobile/src/lib/requests.ts` exposes `submitDonationRequest`, `withdrawDonationRequest`, `approveDonationRequest`, `getListingRequest`, `subscribeToListingRequests`, `subscribeToOrganizationRequests` and `subscribeToMyRequestForListing`.

The single-request listener also supplies cache/pending metadata as its second callback argument. Both query subscriptions use `(requests, page)` callbacks. `page` supplies `fromCache`, `hasPendingWrites` and `nextCursor`. Pass `{ after: page.nextCursor }` as the final options argument for another page, scoped to the same query. Queries return at most 50 documents. Unsubscribe on screen exit and label cached/pending results. Mutation promises resolve after server acknowledgement; approval transactions require a connection. Organizations can read their own missing request before submitting and their request history without other organizations' locations. Rules check private recipient eligibility during donor approval; donors cannot read private recipient profiles directly.

## Departure point and distance coordination (Member 5)

Member 5 implements the coordinates connection and distance resolution for recipient requests:

- `mobile/src/lib/departure-location.ts`:
  - `calculateRequestDistanceKm(departureLocation?, pickupLocation?)`: Computes straight-line Haversine distance between recipient departure point and listing pickup location. Returns `null` if either point is missing or invalid.
  - `getRequestDistanceInfo(departureLocation?, pickupLocation?)`: Evaluates both locations, categorizing state into `'available'`, `'missing_departure'`, `'missing_pickup'`, or `'invalid_coordinates'`, accompanied by formatted distance and human-readable explanation.
  - `calculateDistanceScore(distanceKm)`: Normalizes straight-line distance score `100 * clamp(1 - distanceKm / 10, 0, 1)` per Section 2 of `08_SMART_MATCHING_ENGINE.md`. Returns `score: null` and `isAvailable: false` when distance is unavailable, allowing Member 4's smart matching engine to flag the request for manual donor assessment without crashing.
  - `parseDepartureCoordinates(latStr, lonStr)` & `validateDepartureCoordinates(coords)`: Strict validation for manual inputs and optional coordinates.
  - `formatRequestDistance(distanceKm, reason?)`: User-friendly distance formatting (meters if < 1 km, otherwise km).
- `mobile/src/components/departure-location-card.tsx`:
  - Interactive UI card for recipient departure coordinates.
  - Handles GPS device lookup with loading/busy indicators, location permission denial with Settings redirect fallback, and manual coordinate input.
  - Supports clearing coordinates so recipient can choose to omit departure location without blocking request submission.
  - Provides real-time straight-line distance feedback to the listing pickup location.
- `mobile/src/components/recipient-request-modal.tsx`:
  - Connects the departure location picker, storage requirement affirmative checkbox, and proposed pickup window validation with `submitDonationRequest`.
  - Subscribes to existing request status and provides withdrawal capability via `withdrawDonationRequest`.

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