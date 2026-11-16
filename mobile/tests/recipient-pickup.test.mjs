import {
  encodePickupQrPayload,
  parsePickupReference,
} from '../src/lib/qr-service.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatSecondsCountdown,
  formatTimeSpan,
  isRecipientAssignment,
  isRecipientCollection,
  deriveRequestState,
  getRecipientPickupTiming,
} from '../src/lib/request-validation.ts';

test('recipient QR payload round trips through the shared donor parser', () => {
  const listingId = 'listing-AbC-123';
  const payload = {
    version: 1,
    reference: listingId,
    raw: encodePickupQrPayload(listingId),
  };

  assert.equal(payload.version, 1);
  assert.equal(payload.reference, listingId);
  assert.equal(parsePickupReference(payload.raw).listingId, listingId);
  assert.equal(parsePickupReference(payload.reference).listingId, listingId);
  // Does not embed sensitive tokens, passwords, or personal details
  assert.ok(!payload.raw.includes('bearer'));
  assert.ok(!payload.raw.includes('token'));
  assert.ok(!payload.raw.includes('auth'));
});

test('getRecipientPickupTiming detects before_start, active, and elapsed window states', () => {
  const baseListing = {
    id: 'l1',
    providerUid: 'donor1',
    providerName: 'Baker Street Deli',
    title: 'Surplus Pastries',
    description: 'Assorted croissants',
    category: 'Bakery',
    quantity: 10,
    unit: 'portion',
    storageRequirement: 'ambient',
    storageInstructions: 'Dry area',
    allergenInfo: 'Gluten',
    allergenDeclaration: 'provided',
    pickupAddress: '123 Baker St',
    status: 'assigned',
    acceptedOrganizationUid: 'org1',
    pickupStartsAt: new Date('2026-11-16T14:00:00Z'),
    pickupDeadline: new Date('2026-11-16T16:00:00Z'),
  };

  const baseRequest = {
    id: 'org1',
    listingId: 'l1',
    organizationUid: 'org1',
    providerUid: 'donor1',
    organizationName: 'City Shelter',
    plannedPickupAt: new Date('2026-11-16T14:30:00Z'),
    canMeetStorageRequirement: true,
    status: 'approved',
  };

  // 1. Before window starts (13:50 UTC)
  const timingBefore = getRecipientPickupTiming(
    baseListing,
    baseRequest,
    new Date('2026-11-16T13:50:00Z'),
  );
  assert.equal(timingBefore.windowStatus, 'before_start');
  assert.equal(timingBefore.canConfirmHandover, false);
  assert.equal(timingBefore.canReconcileExpiry, false);
  assert.equal(timingBefore.cancellationEffect, 'open');

  // 2. Active window (14:30 UTC)
  const timingActive = getRecipientPickupTiming(
    baseListing,
    baseRequest,
    new Date('2026-11-16T14:30:00Z'),
  );
  assert.equal(timingActive.windowStatus, 'active');
  assert.equal(timingActive.canConfirmHandover, true);
  assert.equal(timingActive.canReconcileExpiry, false);
  assert.equal(timingActive.cancellationEffect, 'open');

  // 3. Less than 15 minutes before deadline (15:50 UTC, deadline is 16:00 UTC)
  const timingLate = getRecipientPickupTiming(
    baseListing,
    baseRequest,
    new Date('2026-11-16T15:50:00Z'),
  );
  assert.equal(timingLate.windowStatus, 'active');
  assert.equal(timingLate.canConfirmHandover, true);
  assert.equal(timingLate.canReconcileExpiry, false);
  // With less than 15 minutes remaining, cancellation closes the listing instead of reopening
  assert.equal(timingLate.cancellationEffect, 'cancelled');

  // 4. Elapsed window (16:05 UTC)
  const timingElapsed = getRecipientPickupTiming(
    baseListing,
    baseRequest,
    new Date('2026-11-16T16:05:00Z'),
  );
  assert.equal(timingElapsed.windowStatus, 'elapsed');
  assert.equal(timingElapsed.canConfirmHandover, false);
  assert.equal(timingElapsed.canReconcileExpiry, true);
  assert.equal(timingElapsed.cancellationEffect, 'cancelled');
});

test('getRecipientPickupTiming manages the 5-minute handover confirmation countdown and stale states', () => {
  const listing = {
    id: 'l1',
    providerUid: 'donor1',
    providerName: 'Baker Street Deli',
    title: 'Surplus Pastries',
    description: 'Assorted croissants',
    category: 'Bakery',
    quantity: 10,
    unit: 'portion',
    storageRequirement: 'ambient',
    storageInstructions: 'Dry area',
    allergenInfo: 'Gluten',
    allergenDeclaration: 'provided',
    pickupAddress: '123 Baker St',
    status: 'assigned',
    acceptedOrganizationUid: 'org1',
    pickupStartsAt: new Date('2026-11-16T14:00:00Z'),
    pickupDeadline: new Date('2026-11-16T16:00:00Z'),
  };

  const confirmedAt = new Date('2026-11-16T14:30:00Z');
  const confirmedRequest = {
    id: 'org1',
    listingId: 'l1',
    organizationUid: 'org1',
    providerUid: 'donor1',
    organizationName: 'City Shelter',
    plannedPickupAt: new Date('2026-11-16T14:30:00Z'),
    canMeetStorageRequirement: true,
    status: 'approved',
    recipientConfirmedAt: confirmedAt,
  };

  // Immediate confirmation check (at 14:30:00 UTC): full 300 seconds
  const timingAtConfirm = getRecipientPickupTiming(
    listing,
    confirmedRequest,
    confirmedAt,
  );
  assert.equal(timingAtConfirm.confirmationStatus, 'confirmed_valid');
  assert.equal(timingAtConfirm.remainingConfirmationSeconds, 300);

  // 2 minutes later (14:32:00 UTC): 180 seconds remaining
  const timing2Min = getRecipientPickupTiming(
    listing,
    confirmedRequest,
    new Date('2026-11-16T14:32:00Z'),
  );
  assert.equal(timing2Min.confirmationStatus, 'confirmed_valid');
  assert.equal(timing2Min.remainingConfirmationSeconds, 180);

  // Exactly 5 minutes (14:35:00 UTC): 0 seconds remaining, inclusive limit
  const timing5Min = getRecipientPickupTiming(
    listing,
    confirmedRequest,
    new Date('2026-11-16T14:35:00Z'),
  );
  assert.equal(timing5Min.confirmationStatus, 'confirmed_valid');
  assert.equal(timing5Min.remainingConfirmationSeconds, 0);

  // 5 minutes and 1 second (14:35:01 UTC): confirmation is stale!
  const timingStale = getRecipientPickupTiming(
    listing,
    confirmedRequest,
    new Date('2026-11-16T14:35:01Z'),
  );
  assert.equal(timingStale.confirmationStatus, 'confirmed_stale');
  assert.equal(timingStale.remainingConfirmationSeconds, 0);
});

test('formatSecondsCountdown formats mm:ss accurately and handles non-positive values', () => {
  assert.equal(formatSecondsCountdown(300), '5:00');
  assert.equal(formatSecondsCountdown(180), '3:00');
  assert.equal(formatSecondsCountdown(65), '1:05');
  assert.equal(formatSecondsCountdown(9), '0:09');
  assert.equal(formatSecondsCountdown(0), '0:00');
  assert.equal(formatSecondsCountdown(-10), '0:00');
});

test('formatTimeSpan formats spans across minutes and hours', () => {
  assert.equal(formatTimeSpan(45), '45s');
  assert.equal(formatTimeSpan(45 * 60), '45m');
  assert.equal(formatTimeSpan(60 * 60), '1h');
  assert.equal(formatTimeSpan(90 * 60), '1h 30m');
  assert.equal(formatTimeSpan(150 * 60), '2h 30m');
  assert.equal(formatTimeSpan(0), '0s');
  assert.equal(formatTimeSpan(-5), '0s');
});

test('recipient history excludes collections received by a different organization', () => {
  const listing = {
    id: 'l1',
    providerUid: 'donor1',
    status: 'collected',
    acceptedOrganizationUid: 'winner',
  };
  const loser = {
    listingId: 'l1',
    providerUid: 'donor1',
    organizationUid: 'loser',
    status: 'requested',
  };
  const winner = { ...loser, organizationUid: 'winner', status: 'collected' };
  assert.equal(isRecipientCollection(listing, loser, 'loser'), false);
  assert.equal(isRecipientCollection(listing, winner, 'winner'), true);
  assert.equal(
    isRecipientCollection(listing, { ...winner, status: 'approved' }, 'winner'),
    false,
  );
  assert.equal(
    deriveRequestState(loser, listing, 'loser').status,
    'assigned_to_other',
  );
  assert.equal(
    isRecipientAssignment(
      { ...listing, status: 'assigned' },
      { ...winner, status: 'approved' },
      'loser',
    ),
    false,
  );
});

test('recipient timing fails closed for missing windows and wrong assignments', () => {
  const listing = {
    id: 'l1',
    providerUid: 'donor',
    status: 'assigned',
    acceptedOrganizationUid: 'org',
    pickupStartsAt: new Date(0),
    pickupDeadline: new Date(2_000_000),
  };
  const request = {
    listingId: 'l1',
    providerUid: 'donor',
    organizationUid: 'org',
    status: 'approved',
    recipientConfirmedAt: new Date(500_000),
  };
  const now = new Date(600_000);
  assert.equal(
    getRecipientPickupTiming(listing, request, now).canConfirmHandover,
    true,
  );
  assert.equal(
    getRecipientPickupTiming(
      { ...listing, pickupStartsAt: undefined },
      request,
      now,
    ).canConfirmHandover,
    false,
  );
  assert.equal(
    getRecipientPickupTiming(
      listing,
      { ...request, organizationUid: 'other' },
      now,
    ).canConfirmHandover,
    false,
  );
  assert.equal(
    getRecipientPickupTiming(
      { ...listing, status: 'open' },
      request,
      new Date(2_000_000),
    ).canReconcileExpiry,
    false,
  );
  assert.equal(
    getRecipientPickupTiming(listing, request, new Date(2_000_000))
      .canReconcileExpiry,
    true,
  );
});

test('recipient confirmation is invalid outside the pickup window', () => {
  const listing = {
    id: 'l1',
    providerUid: 'donor',
    status: 'assigned',
    acceptedOrganizationUid: 'org',
    pickupStartsAt: new Date(100_000),
    pickupDeadline: new Date(500_000),
  };
  const request = {
    listingId: 'l1',
    providerUid: 'donor',
    organizationUid: 'org',
    status: 'approved',
    recipientConfirmedAt: new Date(400_000),
  };
  assert.equal(
    getRecipientPickupTiming(listing, request, new Date(500_000))
      .confirmationStatus,
    'confirmed_stale',
  );
  assert.equal(
    getRecipientPickupTiming(
      listing,
      { ...request, recipientConfirmedAt: new Date(99_999) },
      new Date(200_000),
    ).confirmationStatus,
    'confirmed_stale',
  );
  assert.equal(formatSecondsCountdown(NaN), '0:00');
});
