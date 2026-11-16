import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkRequestEligibility,
  calculateRequestScore,
  generateRankingExplanation,
  getListingUrgency,
  rankListingRequests,
  explainRankingComparison,
} from '../src/lib/request-ranking.ts';

function createMockListing(overrides = {}) {
  const now = new Date('2026-11-16T10:00:00Z');
  return {
    id: 'listing-demo-1',
    providerUid: 'provider-1',
    providerName: 'Fresh Bakery',
    title: 'Surplus Sourdough Bread',
    description: 'Freshly baked artisanal sourdough loaves.',
    category: 'bakery',
    quantity: 20,
    unit: 'item',
    storageRequirement: 'ambient',
    storageInstructions: 'Keep in dry room temperature.',
    allergenDeclaration: 'provided',
    allergenInfo: 'Wheat, Gluten',
    pickupAddress: '123 Baker Street, Colombo',
    pickupLocation: { latitude: 6.9271, longitude: 79.8612 },
    pickupStartsAt: new Date('2026-11-16T10:00:00Z'),
    pickupDeadline: new Date('2026-11-16T12:00:00Z'), // 120 minutes window
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createMockRequest(
  orgUid,
  plannedPickupAt,
  departureLocation,
  overrides = {},
) {
  return {
    id: orgUid,
    listingId: 'listing-demo-1',
    organizationUid: orgUid,
    providerUid: 'provider-1',
    organizationName: `Charity Org ${orgUid}`,
    departureLocation,
    plannedPickupAt,
    canMeetStorageRequirement: true,
    status: 'requested',
    createdAt: new Date('2026-11-16T10:05:00Z'),
    updatedAt: new Date('2026-11-16T10:05:00Z'),
    ...overrides,
  };
}

test('donor request ranking ranks closer and earlier requests higher', () => {
  const listing = createMockListing();
  const evaluationTime = new Date('2026-11-16T10:30:00Z');

  // Request A: 2 km away, proposed pickup 11:30 (buffer: 30m -> bufferScore 100)
  // Distance ~2 km -> distanceScore ~80. Total score = 0.6*80 + 0.4*100 = 88
  const reqA = createMockRequest(
    'org-a',
    new Date('2026-11-16T11:30:00Z'),
    { latitude: 6.945, longitude: 79.8612 }, // ~2 km north
  );

  // Request B: 8 km away, proposed pickup 11:40 (buffer: 20m -> bufferScore 66.7)
  const reqB = createMockRequest(
    'org-b',
    new Date('2026-11-16T11:40:00Z'),
    { latitude: 7.0, longitude: 79.8612 }, // ~8 km north
  );

  const result = rankListingRequests(listing, [reqB, reqA], evaluationTime);

  assert.equal(result.rankedEligible.length, 2);
  assert.equal(result.rankedEligible[0].request.organizationUid, 'org-a');
  assert.equal(result.rankedEligible[1].request.organizationUid, 'org-b');
  assert.ok(
    result.rankedEligible[0].breakdown.totalScore >
      result.rankedEligible[1].breakdown.totalScore,
  );
});

test('ranks request with larger buffer ahead of closer request per spec example', () => {
  const listing = createMockListing({
    pickupLocation: { latitude: 0, longitude: 0 },
    pickupStartsAt: new Date('2026-11-16T10:00:00Z'),
    pickupDeadline: new Date('2026-11-16T12:00:00Z'),
  });
  const evaluationTime = new Date('2026-11-16T10:30:00Z');

  // Request 1: 2 km away, proposed 11:50 (buffer = 10 min -> bufferScore = 33.33)
  // distanceScore = 100 * (1 - 2/10) = 80
  // totalScore = 0.6*80 + 0.4*33.33 = 48 + 13.33 = 61.33 (~61)
  const lat2km = 2 / 111.195;
  const reqCloseLate = createMockRequest(
    'close-late',
    new Date('2026-11-16T11:50:00Z'),
    { latitude: lat2km, longitude: 0 },
  );

  // Request 2: 4 km away, proposed 11:30 (buffer = 30 min -> bufferScore = 100)
  // distanceScore = 100 * (1 - 4/10) = 60
  // totalScore = 0.6*60 + 0.4*100 = 36 + 40 = 76
  const lat4km = 4 / 111.195;
  const reqFarEarly = createMockRequest(
    'far-early',
    new Date('2026-11-16T11:30:00Z'),
    { latitude: lat4km, longitude: 0 },
  );

  // Verify raw scores match doc 08 calculation
  const scoreCloseLate = calculateRequestScore(
    listing,
    reqCloseLate,
    evaluationTime,
  );
  const scoreFarEarly = calculateRequestScore(
    listing,
    reqFarEarly,
    evaluationTime,
  );
  assert.ok(Math.abs(scoreCloseLate.totalScore - 61.3) < 0.2);
  assert.equal(scoreFarEarly.totalScore, 76.0);
  assert.ok(scoreFarEarly.totalScore > scoreCloseLate.totalScore);

  // Both proposals are valid; the 15-minute cutoff concerns approval time.
  const result = rankListingRequests(
    listing,
    [reqCloseLate, reqFarEarly],
    evaluationTime,
  );
  assert.equal(result.rankedEligible.length, 2);
  assert.equal(result.rankedEligible[0].request.organizationUid, 'far-early');
  assert.equal(result.ineligible.length, 0);

  // Now test with both eligible (e.g. 11:40 buffer = 20m vs 11:30 buffer = 30m)
  const reqCloseEligible = createMockRequest(
    'close-eligible',
    new Date('2026-11-16T11:40:00Z'), // buffer = 20m, distance = 2km -> score = 0.6*80 + 0.4*66.67 = 74.7
    { latitude: lat2km, longitude: 0 },
  );
  const eligibleResult = rankListingRequests(
    listing,
    [reqCloseEligible, reqFarEarly],
    evaluationTime,
  );
  assert.equal(eligibleResult.rankedEligible.length, 2);
  assert.equal(
    eligibleResult.rankedEligible[0].request.organizationUid,
    'far-early',
  );
  assert.equal(
    eligibleResult.rankedEligible[1].request.organizationUid,
    'close-eligible',
  );
  assert.equal(eligibleResult.rankedEligible[0].breakdown.totalScore, 76.0);
  assert.equal(eligibleResult.rankedEligible[1].breakdown.totalScore, 74.7);

  // Natural language comparison explains why far-early ranked higher
  const comparison = explainRankingComparison(
    eligibleResult.rankedEligible[0],
    eligibleResult.rankedEligible[1],
  );
  assert.ok(comparison.includes('more minutes before the deadline'));
});

test('partitions missing coordinates into manual assessment', () => {
  const listing = createMockListing();
  const evaluationTime = new Date('2026-11-16T10:30:00Z');

  const reqWithCoords = createMockRequest(
    'with-coords',
    new Date('2026-11-16T11:30:00Z'),
    { latitude: 6.93, longitude: 79.86 },
  );
  const reqWithoutCoords = createMockRequest(
    'without-coords',
    new Date('2026-11-16T11:20:00Z'),
    undefined, // missing departureLocation
  );

  const result = rankListingRequests(
    listing,
    [reqWithCoords, reqWithoutCoords],
    evaluationTime,
  );

  assert.equal(result.rankedEligible.length, 1);
  assert.equal(result.rankedEligible[0].request.organizationUid, 'with-coords');

  assert.equal(result.manualAssessment.length, 1);
  assert.equal(
    result.manualAssessment[0].request.organizationUid,
    'without-coords',
  );
  assert.equal(result.manualAssessment[0].breakdown.distanceKm, null);
  assert.equal(result.manualAssessment[0].breakdown.totalScore, null);
  assert.ok(result.manualAssessment[0].breakdown.bufferScore > 0);
});

test('partitions withdrawn and ineligible requests with specific failure reasons', () => {
  const listing = createMockListing({
    pickupDeadline: new Date('2026-11-16T12:00:00Z'),
  });
  const evaluationTime = new Date('2026-11-16T10:30:00Z');

  // 1. Withdrawn request
  const reqWithdrawn = createMockRequest(
    'org-withdrawn',
    new Date('2026-11-16T11:30:00Z'),
    { latitude: 6.93, longitude: 79.86 },
    { status: 'withdrawn' },
  );

  // 2. Storage requirement not affirmed
  const reqNoStorage = createMockRequest(
    'org-no-storage',
    new Date('2026-11-16T11:30:00Z'),
    { latitude: 6.93, longitude: 79.86 },
    { canMeetStorageRequirement: false },
  );

  // 3. Proposed pickup is in the past
  const reqPastPickup = createMockRequest(
    'org-past',
    new Date('2026-11-16T10:15:00Z'), // before 10:30 evaluationTime
    { latitude: 6.93, longitude: 79.86 },
  );

  // 4. Proposed pickup is after the deadline
  const reqTooLate = createMockRequest(
    'org-too-late',
    new Date('2026-11-16T12:01:00Z'), // after the window
    { latitude: 6.93, longitude: 79.86 },
  );

  const result = rankListingRequests(
    listing,
    [reqWithdrawn, reqNoStorage, reqPastPickup, reqTooLate],
    evaluationTime,
  );

  assert.equal(result.rankedEligible.length, 0);
  assert.equal(result.ineligible.length, 4);

  const reasons = result.ineligible.flatMap((i) => i.eligibility.reasons);
  assert.ok(reasons.some((r) => r.includes('withdrawn')));
  assert.ok(reasons.some((r) => r.includes('storage')));
  assert.ok(reasons.some((r) => r.includes('past')));
  assert.ok(reasons.some((r) => r.includes('after the pickup deadline')));
});

test('evaluates listing urgency levels based on deadline buffer', () => {
  const baseTime = new Date('2026-11-16T12:00:00Z');

  // Critical: 20 minutes remaining (<30m)
  const listingCritical = createMockListing({
    pickupDeadline: new Date('2026-11-16T12:20:00Z'),
  });
  const urgencyCritical = getListingUrgency(listingCritical, baseTime);
  assert.equal(urgencyCritical.urgencyLevel, 'critical');

  // Urgent: 45 minutes remaining (<60m)
  const listingUrgent = createMockListing({
    pickupDeadline: new Date('2026-11-16T12:45:00Z'),
  });
  const urgencyUrgent = getListingUrgency(listingUrgent, baseTime);
  assert.equal(urgencyUrgent.urgencyLevel, 'urgent');

  // Moderate: 120 minutes remaining (<180m)
  const listingModerate = createMockListing({
    pickupDeadline: new Date('2026-11-16T14:00:00Z'),
  });
  const urgencyModerate = getListingUrgency(listingModerate, baseTime);
  assert.equal(urgencyModerate.urgencyLevel, 'moderate');

  // Relaxed: 300 minutes remaining (>=180m)
  const listingRelaxed = createMockListing({
    pickupDeadline: new Date('2026-11-16T17:00:00Z'),
  });
  const urgencyRelaxed = getListingUrgency(listingRelaxed, baseTime);
  assert.equal(urgencyRelaxed.urgencyLevel, 'relaxed');

  // Expired: past deadline
  const listingExpired = createMockListing({
    pickupDeadline: new Date('2026-11-16T11:00:00Z'),
  });
  const urgencyExpired = getListingUrgency(listingExpired, baseTime);
  assert.equal(urgencyExpired.urgencyLevel, 'expired');
});

test('generates transparent breakdown and disclaimer in ranking explanation', () => {
  const listing = createMockListing();
  const req = createMockRequest('org-demo', new Date('2026-11-16T11:30:00Z'), {
    latitude: 6.945,
    longitude: 79.8612,
  });
  const evaluationTime = new Date('2026-11-16T10:30:00Z');

  const ranked = rankListingRequests(listing, [req], evaluationTime)
    .rankedEligible[0];

  assert.ok(ranked.explanation.summary.length > 0);
  assert.ok(ranked.explanation.detailedLines.length >= 3);
  assert.ok(
    ranked.explanation.disclaimer.includes(
      'commitment supplied by the organization',
    ),
  );
  assert.ok(ranked.explanation.factors.storageText.includes('Affirmed'));
});
