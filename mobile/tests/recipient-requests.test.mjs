import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validatePickupProposal,
  validateStorageConfirmation,
  validateDepartureLocation,
  deriveRequestState,
} from '../src/lib/request-validation.ts';

test('validatePickupProposal rejects nonfinite, past, out of window, and late requests', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const windowStart = new Date('2026-11-15T13:00:00Z');
  const windowDeadline = new Date('2026-11-15T18:00:00Z');

  // Invalid date
  assert.equal(
    validatePickupProposal(
      new Date('invalid'),
      windowStart,
      windowDeadline,
      now,
    ).valid,
    false,
  );

  // Past proposed time
  assert.equal(
    validatePickupProposal(
      new Date('2026-11-15T11:59:00Z'),
      windowStart,
      windowDeadline,
      now,
    ).valid,
    false,
  );

  // Proposed time before pickup starts
  assert.equal(
    validatePickupProposal(
      new Date('2026-11-15T12:30:00Z'),
      windowStart,
      windowDeadline,
      now,
    ).valid,
    false,
  );

  // Proposed time after pickup deadline
  assert.equal(
    validatePickupProposal(
      new Date('2026-11-15T18:05:00Z'),
      windowStart,
      windowDeadline,
      now,
    ).valid,
    false,
  );

  // Valid proposed time inside window and well before deadline
  assert.equal(
    validatePickupProposal(
      new Date('2026-11-15T14:30:00Z'),
      windowStart,
      windowDeadline,
      now,
    ).valid,
    true,
  );

  // Submission within 15 minutes of deadline rejected
  const lateNow = new Date('2026-11-15T17:46:00Z'); // 14 minutes before 18:00
  const lateAttempt = validatePickupProposal(
    new Date('2026-11-15T17:50:00Z'),
    windowStart,
    windowDeadline,
    lateNow,
  );
  assert.equal(lateAttempt.valid, false);
  assert.match(lateAttempt.error ?? '', /15 minutes/);

  // Submission exactly 15 minutes before deadline allowed
  const exactFifteenNow = new Date('2026-11-15T17:45:00Z');
  const exactAttempt = validatePickupProposal(
    new Date('2026-11-15T17:50:00Z'),
    windowStart,
    windowDeadline,
    exactFifteenNow,
  );
  assert.equal(exactAttempt.valid, true);
});

test('validateStorageConfirmation requires explicit affirmative confirmation', () => {
  assert.equal(validateStorageConfirmation(false).valid, false);
  assert.match(
    validateStorageConfirmation(false).error ?? '',
    /storage requirements/,
  );
  assert.equal(validateStorageConfirmation(true).valid, true);
});

test('validateDepartureLocation allows optional empty and validates coordinate boundaries', () => {
  assert.equal(validateDepartureLocation(null).valid, true);
  assert.equal(validateDepartureLocation(undefined).valid, true);
  assert.equal(
    validateDepartureLocation({ latitude: 12.9716, longitude: 77.5946 }).valid,
    true,
  );

  // Invalid coordinates
  assert.equal(
    validateDepartureLocation({ latitude: 91, longitude: 0 }).valid,
    false,
  );
  assert.equal(
    validateDepartureLocation({ latitude: -91, longitude: 0 }).valid,
    false,
  );
  assert.equal(
    validateDepartureLocation({ latitude: 0, longitude: 181 }).valid,
    false,
  );
  assert.equal(
    validateDepartureLocation({ latitude: 0, longitude: -181 }).valid,
    false,
  );
  assert.equal(
    validateDepartureLocation({ latitude: NaN, longitude: 0 }).valid,
    false,
  );
});

test('deriveRequestState correctly models all recipient after-states and parent assignments', () => {
  const currentUid = 'org-recipient-1';
  const otherUid = 'org-recipient-2';
  const now = new Date('2026-11-15T12:00:00Z');

  const baseListing = {
    id: 'listing-1',
    providerUid: 'donor-1',
    providerName: 'Bakery Surplus',
    title: 'Surplus Pastries',
    description: 'Fresh croissants',
    category: 'Bakery',
    quantity: 10,
    unit: 'item',
    storageRequirement: 'ambient',
    storageInstructions: 'Dry place',
    allergenInfo: 'Gluten',
    allergenDeclaration: 'provided',
    pickupAddress: '123 High St',
    pickupStartsAt: new Date('2026-11-15T13:00:00Z'),
    pickupDeadline: new Date('2026-11-15T18:00:00Z'),
    status: 'open',
  };

  const baseRequest = {
    id: currentUid,
    listingId: 'listing-1',
    organizationUid: currentUid,
    providerUid: 'donor-1',
    organizationName: 'Community Shelter',
    plannedPickupAt: new Date('2026-11-15T14:00:00Z'),
    canMeetStorageRequirement: true,
    status: 'requested',
  };

  // 1. No request yet, open listing: canRequest = true
  const stateNoReq = deriveRequestState(null, baseListing, currentUid, now);
  assert.equal(stateNoReq.canRequest, true);
  assert.equal(stateNoReq.canWithdraw, false);
  assert.equal(stateNoReq.status, 'none');

  // 2. Pending request: canWithdraw = true
  const statePending = deriveRequestState(
    baseRequest,
    baseListing,
    currentUid,
    now,
  );
  assert.equal(statePending.status, 'pending');
  assert.equal(statePending.canWithdraw, true);
  assert.equal(statePending.canRequest, false);

  // 3. User request approved
  const stateApproved = deriveRequestState(
    { ...baseRequest, status: 'approved' },
    { ...baseListing, status: 'assigned', acceptedOrganizationUid: currentUid },
    currentUid,
    now,
  );
  assert.equal(stateApproved.status, 'approved');
  assert.equal(stateApproved.tone, 'success');
  assert.equal(stateApproved.canWithdraw, false);

  // 4. Listing assigned to another organization derives 'assigned_to_other'
  const stateOther = deriveRequestState(
    baseRequest,
    { ...baseListing, status: 'assigned', acceptedOrganizationUid: otherUid },
    currentUid,
    now,
  );
  assert.equal(stateOther.status, 'assigned_to_other');
  assert.equal(stateOther.canRequest, false);
  assert.equal(stateOther.canWithdraw, false);

  // 5. Withdrawn request cannot be resubmitted
  const stateWithdrawn = deriveRequestState(
    { ...baseRequest, status: 'withdrawn' },
    baseListing,
    currentUid,
    now,
  );
  assert.equal(stateWithdrawn.status, 'withdrawn');
  assert.equal(stateWithdrawn.canRequest, false);
  assert.equal(stateWithdrawn.canWithdraw, false);

  // 6. Expired listing / past deadline
  const pastNow = new Date('2026-11-15T19:00:00Z');
  const stateExpired = deriveRequestState(
    null,
    baseListing,
    currentUid,
    pastNow,
  );
  assert.equal(stateExpired.status, 'expired');
  assert.equal(stateExpired.canRequest, false);

  // 7. Listing closing within 15 minutes: cannot request
  const closingSoonNow = new Date('2026-11-15T17:50:00Z');
  const stateClosing = deriveRequestState(
    null,
    baseListing,
    currentUid,
    closingSoonNow,
  );
  assert.equal(stateClosing.canRequest, false);
  assert.match(stateClosing.description, /15 minutes/);
});
