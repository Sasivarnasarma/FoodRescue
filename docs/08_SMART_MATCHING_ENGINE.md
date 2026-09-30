# 08 — Smart Matching and Recommendation Engine

The novelty is prioritizing time-sensitive donations and recommending feasible recipients. Use a deterministic TypeScript function driven by explicit inputs and current time. Run it on the client. The donor makes the final selection.

## 1. Prioritize donations for recipients

Fetch a bounded set of open listings and compute Haversine distance from the recipient's device location or a manually supplied coordinate. Allow the user to browse without GPS and label distance as unavailable when no coordinates exist. Hide listings past deadline and disable requesting when fewer than 15 minutes remain. Default sort is earliest deadline, then distance when known, then listing ID. This surfaces donations with less time left in the nearby feed.

## 2. Rank requests for donors

Rank requests for the entire listing. A candidate must be pending and belong to an active, approved organization. The donor must own an open listing. Reject stale pickup times and times outside the pickup window. Require the organization to declare that it can accept the full quantity under the donor's specified storage requirement. A chilled or frozen listing needs that explicit confirmation. Storage compatibility is a logistical check based on declarations.

Calculate:

- `distanceKm` from the request's operational departure point to pickup, using Haversine. These are straight-line distances.
- `bufferMinutes` as the minutes between proposed pickup and deadline. A pickup proposal must still be at or after the current time at approval, including when ranking refreshes.
- `distanceScore = 100 * clamp(1 - distanceKm / 10, 0, 1)`.
- `bufferScore = 100 * clamp(bufferMinutes / 30, 0, 1)`.
- `score = 0.6 * distanceScore + 0.4 * bufferScore`.

The 10 km and 30 minute values normalize scores. Distance beyond 10 km scores zero for that factor and can still be shown. Use the score for ordering, followed by earlier proposed pickup and then organization UID for ties. Show requests missing coordinates separately with a reason and allow the donor to assess a valid request manually. The score is a recommendation, and the selected request must still pass Firestore Rules.

Example: for a 12:00 deadline, a request 2 km away proposing 11:50 scores about 61. A request 4 km away proposing 11:30 scores 76. The second request ranks higher because its proposed pickup leaves more time before the deadline.

## 3. Explain and test

Show distance or unknown, proposed pickup, time before deadline, declared storage compatibility, and an explanation of the score. Show listing urgency separately from the ranking because the deadline is shared by all requests. A proposal is a commitment supplied by the organization. Do not present it as a travel-time prediction.

Test distance, score calculations, tie-breaking, timestamps at pickup-window boundaries, deadline and 15-minute cutoff, withdrawals, storage declaration, and missing coordinates. Use two seeded competing requests for the demo so the ranking has a meaningful comparison. Firebase Rules enforce identity, state, time and the declaration. Haversine and scores are advisory.
