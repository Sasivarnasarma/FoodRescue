# Phase 3 request data and approval integration

Member 3 provides rules and shared mobile data helpers. Request forms, donor screens, location input and scoring remain the other members' tasks.

## Contract

Requests live at `foodListings/{listingId}/requests/{organizationUid}`. See the schema for exact fields. Initial status is `requested`; recipients withdraw to `withdrawn`, and donors approve to `approved`. Cancellation, collection and expiry transitions remain Phase 4 work. One organization has one request per listing and cannot resubmit a withdrawn request.

Requests require the whole donation, affirmative storage compatibility, a pickup proposal at or after server time inside the pickup window, and at least 15 minutes before the deadline. `departureLocation` is an optional GeoPoint; missing coordinates do not block requesting. Declarations and coordinates are organization supplied. Scoring remains advisory.

Approval atomically writes the listing to `assigned` with `acceptedOrganizationUid` and the selected request to `approved`. Rules recheck active approved donor and organization accounts, pickup timing, storage declaration and reciprocal after-states. Other pending requests remain unchanged; effective availability comes from the parent. Donors cannot approve two requests or change an assignment through these Phase 3 operations.

## Shared helpers

`mobile/src/lib/requests.ts` exposes `submitDonationRequest`, `withdrawDonationRequest`, `approveDonationRequest`, `getListingRequest`, `subscribeToListingRequests`, `subscribeToOrganizationRequests` and `subscribeToMyRequestForListing`.

The single-request listener also supplies cache/pending metadata as its second callback argument. Both query subscriptions use `(requests, page)` callbacks. `page` supplies `fromCache`, `hasPendingWrites` and `nextCursor`. Pass `{ after: page.nextCursor }` as the final options argument for another page, scoped to the same query. Queries return at most 50 documents. Unsubscribe on screen exit and label cached/pending results. Mutation promises resolve after server acknowledgement; approval transactions require a connection. Organizations can read their own missing request before submitting and their request history without other organizations' locations. Rules check private recipient eligibility during donor approval; donors cannot read private recipient profiles directly.

## Smart matching and request ranking engine

Member 4 provides pure, deterministic client-side request ranking in `mobile/src/lib/request-ranking.ts`:

- `checkRequestEligibility(listing, request, currentTime)`: Rechecks open listing status, pending request status (`requested`), affirmative storage compatibility declaration (`canMeetStorageRequirement`), non-stale pickup proposal, window boundaries (`pickupStartsAt` to `pickupDeadline`), and the required 15 minutes between current approval time and the deadline. Returns descriptive reasons if ineligible.
- `calculateRequestScore(listing, request, currentTime)`: Computes straight-line Haversine distance normalized to 10 km (`distanceScore = 100 * clamp(1 - distanceKm / 10, 0, 1)` with 60% weight) and pickup window buffer normalized to 30 minutes (`bufferScore = 100 * clamp(bufferMinutes / 30, 0, 1)` with 40% weight). Yields total composite score (`0.6 * distanceScore + 0.4 * bufferScore`).
- `rankListingRequests(listing, requests, currentTime)`: Categorizes requests into `rankedEligible` (scored and sorted deterministically), `manualAssessment` (eligible requests missing coordinates for manual donor review), and `ineligible` (violating requirements). Applies tie-breaking: higher total score, earlier proposed pickup time, then alphabetical organization UID.
- `generateRankingExplanation(request, listing, eligibility, breakdown, rank)` and `explainRankingComparison(first, second)`: Output structured factors, readable summaries, and comparative rationales explaining why one proposal outranks another (e.g. earlier pickup buffer outweighing distance). Includes disclaimers stating pickup time is an organization commitment, not a travel prediction.
- `getListingUrgency(listing, currentTime)`: Computes deadline proximity separately from request rankings.
- Seeded competing request fixtures for emulator rehearsal are provided in `firebase/scripts/demo-fixtures.mjs` (`competingRequestFixtures`) and seeded via `firebase/scripts/seed-donation-demo.mjs`.

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
The shared departure card is intended for the recipient request form; there is one submission/status flow maintained with Member 2.


## Checks and deployment

From the root:

```powershell
pnpm test:rules
pnpm test:mobile
pnpm --dir mobile lint
pnpm --dir mobile format:check
pnpm --dir mobile typecheck
```

Tests cover revoked verification/account status, concurrent approvals, two approvals in one batch, stale proposals, historical reads and bounded collection-group queries. Deploy reviewed rules and indexes with:

```powershell
pnpm --dir firebase exec firebase deploy --only firestore --project foodrescue-4ff0b
```

Wait for the request-history collection-group index to build. Deployment was not performed during this review. Once the remaining screens exist, submit two competing requests, compare recommendations, approve one and verify the committed assignment on both devices. Retry a competing approval and confirm failure. Reject one applicant after submission and verify it cannot be selected. Physical-device integration remains pending.

## Recipient requests implementation (Member 2)

Member 2 implemented the mobile recipient request flow:
- `mobile/src/lib/request-validation.ts`: pure functions for client-side validation of proposed pickup time (not in the past and inside the window; submission must be at least 15 minutes before deadline), affirmative storage confirmation, optional departure coordinates, and real-time derived state calculation.
- `mobile/src/components/request-form.tsx`: whole-listing request form embedded in listing detail. Includes pickup time proposal with quick selectors, affirmative storage requirement confirmation, optional departure GPS coordinates, client-side validation, loading spinner, and retryable error handling.
- `mobile/src/components/request-status-card.tsx`: displays the live status of the organization's request on the listing detail sheet. Distinguishes pending approval, approved assignment (with Phase 4 QR handover advisory), withdrawal status, assignment to another organization derived from parent listing status, and listing cancellation/expiry. Provides direct withdrawal action with confirmation dialog.
- `mobile/src/components/organization-requests-view.tsx`: dedicated "My Requests" view subscribing to all requests for the signed-in organization via collection-group query, showing listing summary, status badges, proposed times, and withdrawal actions.
- `mobile/src/components/recipient-feed.tsx`: top-level tab switcher between "Nearby Donations" and "My Requests", preserving navigation state and location settings.
- `mobile/tests/recipient-requests.test.mjs`: unit tests for pickup proposal timing, storage confirmation, coordinate bounds, and derived state transitions.

Review integration: the recipient form uses the shared departure card. Request history observes parent listings as well as request documents, supports bounded pages, and blocks mutations on cached or pending data. Expiry labels refresh while screens remain open; cancelled, collected and expired parents override stale approval displays. Physical-device acceptance is still pending.
