import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clamp,
  checkRequestEligibility,
  calculateRequestScore,
  generateRankingExplanation,
  getListingUrgency,
  rankListingRequests,
  explainRankingComparison,
  MAX_DISTANCE_KM,
  MAX_BUFFER_MINUTES,
  MIN_LEAD_TIME_MINUTES,
  WEIGHT_DISTANCE,
  WEIGHT_BUFFER,
} from '../src/lib/request-ranking.ts';

// Helper to create mock listing
function createMockListing(overrides = {}) {
  const baseTime = 1700000000000;
  return {
    id: 'listing-123',
    providerUid: 'donor-1',
    providerName: 'Test Bakery',
    title: 'Surplus Sourdough Bread',
    description: 'Fresh loaves',
    category: 'Bakery',
    quantity: 10,
    unit: 'item',
    storageRequirement: 'ambient',
    storageInstructions: 'Keep dry at room temperature',
    allergenInfo: 'Gluten',
    allergenDeclaration: 'provided',
    pickupAddress: '100 Main St, Colombo',
    pickupLocation: { latitude: 6.9271, longitude: 79.8612 },
    pickupStartsAt: new Date(baseTime),
    pickupDeadline: new Date(baseTime + 120 * 60 * 1000), // 2 hours later
    status: 'open',
    ...overrides,
  };
}

// Helper to create mock request
function createMockRequest(overrides = {}) {
  const baseTime = 1700000000000;
  return {
    id: 'org-1',
    listingId: 'listing-123',
    organizationUid: 'org-1',
    providerUid: 'donor-1',
    organizationName: 'Community Kitchen A',
    departureLocation: { latitude: 6.935, longitude: 79.865 },
    plannedPickupAt: new Date(baseTime + 60 * 60 * 1000), // 60 mins into window
    canMeetStorageRequirement: true,
    status: 'requested',
    ...overrides,
  };
}

test('clamp correctly bounds values within [min, max]', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test('computes exact doc 08 specification example (2 km @ 11:50 scores ~61 vs 4 km @ 11:30 scores 76)', () => {
  // Deadline: 12:00
  const deadline = new Date('2026-11-15T12:00:00Z');
  const starts = new Date('2026-11-15T10:00:00Z');
  const now = new Date('2026-11-15T10:30:00Z');

  const listing = createMockListing({
    pickupStartsAt: starts,
    pickupDeadline: deadline,
    pickupLocation: { latitude: 0, longitude: 0 },
  });

  // Haversine distance for 1 degree lat is ~111.195 km
  // 2 km corresponds to lat ~ 2 / 111.195 = 0.017986 deg
  // 4 km corresponds to lat ~ 4 / 111.195 = 0.035973 deg
  const coords2km = { latitude: 2 / 111.195, longitude: 0 };
  const coords4km = { latitude: 4 / 111.195, longitude: 0 };

  const request1 = createMockRequest({
    organizationUid: 'org-close-later',
    organizationName: 'Close Organization',
    departureLocation: coords2km,
    plannedPickupAt: new Date('2026-11-15T11:50:00Z'), // 10 min buffer
    canMeetStorageRequirement: true,
  });

  const request2 = createMockRequest({
    organizationUid: 'org-far-earlier',
    organizationName: 'Far Organization',
    departureLocation: coords4km,
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'), // 30 min buffer
    canMeetStorageRequirement: true,
  });

  const score1 = calculateRequestScore(listing, request1, now);
  const score2 = calculateRequestScore(listing, request2, now);

  assert.ok(Math.abs((score1.distanceKm ?? 0) - 2.0) < 0.01);
  assert.ok(Math.abs((score2.distanceKm ?? 0) - 4.0) < 0.01);

  assert.equal(score1.bufferMinutes, 10);
  assert.equal(score2.bufferMinutes, 30);

  // Score 1: 0.6 * (100 * (1 - 2/10)) + 0.4 * (100 * (10/30)) = 0.6*80 + 0.4*33.33 = 48 + 13.33 = 61.3
  assert.ok(Math.abs((score1.totalScore ?? 0) - 61.3) < 0.2);

  // Score 2: 0.6 * (100 * (1 - 4/10)) + 0.4 * (100 * (30/30)) = 0.6*60 + 0.4*100 = 36 + 40 = 76.0
  assert.equal(score2.totalScore, 76.0);

  // Request 2 ranks higher than Request 1
  assert.ok((score2.totalScore ?? 0) > (score1.totalScore ?? 0));
});

test('distance score clamps at boundaries: 0 km = 100, 10 km = 0, >10 km = 0', () => {
  const deadline = new Date('2026-11-15T12:00:00Z');
  const now = new Date('2026-11-15T10:00:00Z');
  const listing = createMockListing({
    pickupStartsAt: now,
    pickupDeadline: deadline,
    pickupLocation: { latitude: 0, longitude: 0 },
  });

  // Coincident (0 km)
  const reqCoincident = createMockRequest({
    departureLocation: { latitude: 0, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:00:00Z'),
  });
  const scoreCoincident = calculateRequestScore(listing, reqCoincident, now);
  assert.equal(scoreCoincident.distanceKm, 0);
  assert.equal(scoreCoincident.distanceScore, 100);

  // Exactly 10 km
  const req10km = createMockRequest({
    departureLocation: { latitude: 10 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:00:00Z'),
  });
  const score10km = calculateRequestScore(listing, req10km, now);
  assert.ok(Math.abs((score10km.distanceKm ?? 0) - 10) < 0.05);
  assert.equal(score10km.distanceScore, 0);

  // Far away (50 km)
  const req50km = createMockRequest({
    departureLocation: { latitude: 50 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:00:00Z'),
  });
  const score50km = calculateRequestScore(listing, req50km, now);
  assert.ok((score50km.distanceKm ?? 0) > 40);
  assert.equal(score50km.distanceScore, 0);
});

test('buffer score clamps at boundaries: >=30 min = 100, 15 min = 50, 0 min = 0', () => {
  const deadline = new Date('2026-11-15T12:00:00Z');
  const now = new Date('2026-11-15T10:00:00Z');
  const listing = createMockListing({
    pickupStartsAt: now,
    pickupDeadline: deadline,
    pickupLocation: { latitude: 0, longitude: 0 },
  });

  // Buffer 60 mins (> 30 min max)
  const req60 = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:00:00Z'),
  });
  assert.equal(calculateRequestScore(listing, req60, now).bufferScore, 100);

  // Buffer exactly 30 mins
  const req30 = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'),
  });
  assert.equal(calculateRequestScore(listing, req30, now).bufferScore, 100);

  // Buffer 15 mins
  const req15 = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:45:00Z'),
  });
  assert.equal(calculateRequestScore(listing, req15, now).bufferScore, 50);

  // Buffer 0 mins
  const req0 = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T12:00:00Z'),
  });
  assert.equal(calculateRequestScore(listing, req0, now).bufferScore, 0);
});

test('eligibility checks enforce storage requirement, state, and 15-minute cutoff', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const deadline = new Date('2026-11-15T12:00:00Z');
  const starts = new Date('2026-11-15T10:00:00Z');

  const listing = createMockListing({
    pickupStartsAt: starts,
    pickupDeadline: deadline,
    storageRequirement: 'chilled',
    status: 'open',
  });

  // 1. Valid eligible request
  const validReq = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'), // 30m before deadline
    canMeetStorageRequirement: true,
    status: 'requested',
  });
  const validResult = checkRequestEligibility(listing, validReq, now);
  assert.equal(validResult.isEligible, true);
  assert.equal(validResult.reasons.length, 0);

  // 2. Storage requirement not met
  const noStorageReq = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'),
    canMeetStorageRequirement: false,
    status: 'requested',
  });
  const noStorageResult = checkRequestEligibility(listing, noStorageReq, now);
  assert.equal(noStorageResult.isEligible, false);
  assert.ok(noStorageResult.reasons[0].includes('chilled storage'));

  // 3. Withdrawn status
  const withdrawnReq = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'),
    canMeetStorageRequirement: true,
    status: 'withdrawn',
  });
  const withdrawnResult = checkRequestEligibility(listing, withdrawnReq, now);
  assert.equal(withdrawnResult.isEligible, false);
  assert.ok(withdrawnResult.reasons[0].includes('withdrawn'));

  // 4. Listing not open (e.g. assigned)
  const closedListing = createMockListing({ ...listing, status: 'assigned' });
  const closedResult = checkRequestEligibility(closedListing, validReq, now);
  assert.equal(closedResult.isEligible, false);
  assert.ok(closedResult.reasons[0].includes('not open'));

  // 5. Stale pickup proposal (in the past)
  const staleReq = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T09:45:00Z'), // past relative to now (10:00)
    canMeetStorageRequirement: true,
    status: 'requested',
  });
  const staleResult = checkRequestEligibility(listing, staleReq, now);
  assert.equal(staleResult.isEligible, false);
  assert.ok(staleResult.reasons.some((r) => r.includes('in the past')));

  // 6. Proposed pickup before pickupStartsAt
  const earlyReq = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T09:30:00Z'),
    canMeetStorageRequirement: true,
    status: 'requested',
  });
  const earlyResult = checkRequestEligibility(
    createMockListing({
      ...listing,
      pickupStartsAt: new Date('2026-11-15T10:30:00Z'),
    }),
    earlyReq,
    new Date('2026-11-15T09:00:00Z'),
  );
  assert.equal(earlyResult.isEligible, false);
  assert.ok(
    earlyResult.reasons.some((r) =>
      r.includes('before the pickup window opens'),
    ),
  );

  // 7. Proposed pickup after deadline
  const lateReq = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T12:15:00Z'),
    canMeetStorageRequirement: true,
    status: 'requested',
  });
  const lateResult = checkRequestEligibility(listing, lateReq, now);
  assert.equal(lateResult.isEligible, false);
  assert.ok(
    lateResult.reasons.some((r) => r.includes('after the pickup deadline')),
  );

  // 8. 15-minute lead-time cutoff: 14 mins fails, exactly 15 mins passes
  const req14mins = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:50:00Z'), // valid proposal; approval is too late
    canMeetStorageRequirement: true,
    status: 'requested',
  });
  const res14 = checkRequestEligibility(
    listing,
    req14mins,
    new Date('2026-11-15T11:46:00Z'),
  );
  assert.equal(res14.isEligible, false);
  assert.ok(res14.reasons.some((r) => r.includes('at least 15 minutes')));

  const req15mins = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:50:00Z'), // five-minute proposal buffer remains valid
    canMeetStorageRequirement: true,
    status: 'requested',
  });
  const res15 = checkRequestEligibility(
    listing,
    req15mins,
    new Date('2026-11-15T11:45:00Z'),
  );
  assert.equal(res15.isEligible, true);
});

test('deterministic tie-breaking: totalScore, earlier pickup time, then organizationUid', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const deadline = new Date('2026-11-15T12:00:00Z');
  const listing = createMockListing({
    pickupStartsAt: now,
    pickupDeadline: deadline,
    pickupLocation: { latitude: 0, longitude: 0 },
  });

  // Candidate 1 & 2: Same distance and buffer (same totalScore), but Candidate 2 proposes earlier pickup
  const candidate1 = createMockRequest({
    organizationUid: 'org-beta',
    organizationName: 'Org Beta',
    departureLocation: { latitude: 2 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'), // 30m buffer -> bufferScore 100
  });

  const candidate2 = createMockRequest({
    organizationUid: 'org-alpha',
    organizationName: 'Org Alpha',
    departureLocation: { latitude: 2 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:15:00Z'), // 45m buffer -> bufferScore 100 (both 100!)
  });

  // Candidate 3: Identical score and identical pickup time as Candidate 4, but UID is 'org-aaa' vs 'org-zzz'
  const candidate3 = createMockRequest({
    organizationUid: 'org-zzz',
    organizationName: 'Org Z',
    departureLocation: { latitude: 5 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:20:00Z'),
  });

  const candidate4 = createMockRequest({
    organizationUid: 'org-aaa',
    organizationName: 'Org A',
    departureLocation: { latitude: 5 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:20:00Z'),
  });

  const result = rankListingRequests(listing, [candidate1, candidate2], now);
  assert.equal(result.rankedEligible.length, 2);
  // Both have distanceScore = 80, bufferScore = 100 -> totalScore = 88.0
  assert.equal(result.rankedEligible[0].breakdown.totalScore, 88.0);
  assert.equal(result.rankedEligible[1].breakdown.totalScore, 88.0);
  // Earlier pickup time (11:15 vs 11:30) wins rank 1
  assert.equal(result.rankedEligible[0].request.organizationUid, 'org-alpha');
  assert.equal(result.rankedEligible[0].rank, 1);
  assert.equal(result.rankedEligible[1].request.organizationUid, 'org-beta');
  assert.equal(result.rankedEligible[1].rank, 2);

  // UID tie-break
  const resultTiedUID = rankListingRequests(
    listing,
    [candidate3, candidate4],
    now,
  );
  assert.equal(
    resultTiedUID.rankedEligible[0].request.organizationUid,
    'org-aaa',
  );
  assert.equal(
    resultTiedUID.rankedEligible[1].request.organizationUid,
    'org-zzz',
  );
});

test('handles missing coordinates gracefully under manualAssessment without skewing ranked requests', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const deadline = new Date('2026-11-15T12:00:00Z');
  const listing = createMockListing({
    pickupStartsAt: now,
    pickupDeadline: deadline,
    pickupLocation: { latitude: 0, longitude: 0 },
  });

  const reqWithCoords = createMockRequest({
    organizationUid: 'org-with-gps',
    departureLocation: { latitude: 2 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'),
  });

  const reqWithoutCoords = createMockRequest({
    organizationUid: 'org-no-gps',
    departureLocation: undefined,
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'),
  });

  const result = rankListingRequests(
    listing,
    [reqWithCoords, reqWithoutCoords],
    now,
  );

  assert.equal(result.rankedEligible.length, 1);
  assert.equal(
    result.rankedEligible[0].request.organizationUid,
    'org-with-gps',
  );
  assert.equal(result.rankedEligible[0].rank, 1);

  assert.equal(result.manualAssessment.length, 1);
  assert.equal(
    result.manualAssessment[0].request.organizationUid,
    'org-no-gps',
  );
  assert.equal(result.manualAssessment[0].breakdown.distanceKm, null);
  assert.equal(result.manualAssessment[0].breakdown.totalScore, null);
  assert.equal(result.manualAssessment[0].breakdown.bufferScore, 100);
  assert.ok(
    result.manualAssessment[0].explanation.summary.includes(
      'Manual assessment needed',
    ),
  );
});

test('generates clear comparative explanations between competing requests', () => {
  const now = new Date('2026-11-15T10:30:00Z');
  const deadline = new Date('2026-11-15T12:00:00Z');
  const listing = createMockListing({
    pickupStartsAt: new Date('2026-11-15T10:00:00Z'),
    pickupDeadline: deadline,
    pickupLocation: { latitude: 0, longitude: 0 },
  });

  // Req 1: 2 km away, proposing 11:45 (15 min buffer -> eligible, score = 68.0)
  const req1 = createMockRequest({
    organizationUid: 'org-near',
    organizationName: 'Near Org',
    departureLocation: { latitude: 2 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:45:00Z'),
    canMeetStorageRequirement: true,
  });

  // Req 2: 4 km away, proposing 11:30 (30 min buffer -> eligible, score = 76.0)
  const req2 = createMockRequest({
    organizationUid: 'org-far',
    organizationName: 'Far Org',
    departureLocation: { latitude: 4 / 111.195, longitude: 0 },
    plannedPickupAt: new Date('2026-11-15T11:30:00Z'),
    canMeetStorageRequirement: true,
  });

  const rankedResult = rankListingRequests(listing, [req1, req2], now);
  assert.equal(rankedResult.rankedEligible.length, 2);
  const higher = rankedResult.rankedEligible[0]; // Far Org (score 76.0)
  const lower = rankedResult.rankedEligible[1]; // Near Org (score 68.0)

  const comparison = explainRankingComparison(higher, lower);
  assert.ok(comparison.includes('Far Org ranks higher'));
  assert.ok(comparison.includes('outweighing Near Org'));

  // Comparison between eligible and ineligible
  const ineligibleReq = createMockRequest({
    organizationUid: 'org-ineligible',
    organizationName: 'Ineligible Org',
    canMeetStorageRequirement: false,
  });
  const ineligResult = rankListingRequests(listing, [ineligibleReq], now);
  assert.equal(ineligResult.ineligible.length, 1);
  const ineligComparison = explainRankingComparison(
    higher,
    ineligResult.ineligible[0],
  );
  assert.ok(
    ineligComparison.includes(
      'Far Org is eligible, whereas Ineligible Org is ineligible',
    ),
  );
});

test('listing urgency reflects deadline proximity independently of requests', () => {
  const now = new Date('2026-11-15T10:00:00Z');

  // Critical (<30 mins)
  const criticalListing = createMockListing({
    pickupDeadline: new Date('2026-11-15T10:20:00Z'),
  });
  assert.equal(
    getListingUrgency(criticalListing, now).urgencyLevel,
    'critical',
  );

  // Urgent (<60 mins)
  const urgentListing = createMockListing({
    pickupDeadline: new Date('2026-11-15T10:45:00Z'),
  });
  assert.equal(getListingUrgency(urgentListing, now).urgencyLevel, 'urgent');

  // Moderate (<180 mins)
  const moderateListing = createMockListing({
    pickupDeadline: new Date('2026-11-15T12:00:00Z'),
  });
  assert.equal(
    getListingUrgency(moderateListing, now).urgencyLevel,
    'moderate',
  );

  // Relaxed (>=180 mins)
  const relaxedListing = createMockListing({
    pickupDeadline: new Date('2026-11-15T16:00:00Z'),
  });
  assert.equal(getListingUrgency(relaxedListing, now).urgencyLevel, 'relaxed');

  // Expired
  const expiredListing = createMockListing({
    pickupDeadline: new Date('2026-11-15T09:50:00Z'),
  });
  assert.equal(getListingUrgency(expiredListing, now).urgencyLevel, 'expired');
});

test('short pickup buffers stay eligible while approval time obeys the server cutoff', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const listing = createMockListing({
    pickupStartsAt: now,
    pickupDeadline: new Date('2026-11-15T12:00:00Z'),
  });
  const request = createMockRequest({
    plannedPickupAt: new Date('2026-11-15T11:50:00Z'),
  });
  assert.equal(checkRequestEligibility(listing, request, now).isEligible, true);
  assert.equal(
    checkRequestEligibility(listing, request, new Date('2026-11-15T11:45:00Z'))
      .isEligible,
    true,
  );
  assert.equal(
    checkRequestEligibility(
      listing,
      request,
      new Date('2026-11-15T11:45:00.001Z'),
    ).isEligible,
    false,
  );
  assert.equal(
    checkRequestEligibility(
      listing,
      { ...request, plannedPickupAt: new Date(NaN) },
      now,
    ).isEligible,
    false,
  );
  assert.equal(
    checkRequestEligibility(
      { ...listing, pickupStartsAt: undefined },
      request,
      now,
    ).isEligible,
    false,
  );
});
