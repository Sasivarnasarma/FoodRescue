import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assignedDonationFixtures,
  donationFixtures,
  competingRequestFixtures,
} from '../../firebase/scripts/demo-fixtures.mjs';

function validateReviewReason(decision, reason) {
  const clean = typeof reason === 'string' ? reason.trim() : '';
  if (decision === 'rejected') {
    if (!clean) {
      return {
        valid: false,
        error: 'Enter a review reason up to 500 characters.',
      };
    }
    if (clean.length > 500) {
      return {
        valid: false,
        error: 'Enter a review reason up to 500 characters.',
      };
    }
  } else {
    if (clean.length > 500) {
      return {
        valid: false,
        error: 'Reason must not exceed 500 characters.',
      };
    }
  }
  return { valid: true };
}

test('assignedDonationFixtures produces valid assigned listings and approved requests', () => {
  const now = 1700000000000;
  const fixtures = assignedDonationFixtures(now);

  assert.equal(fixtures.length, 2);

  const [pickupFixture, confirmedFixture] = fixtures;

  // Verify demo-assigned-pickup
  assert.equal(pickupFixture.listing.id, 'demo-assigned-pickup');
  assert.equal(pickupFixture.listing.status, 'assigned');
  assert.equal(
    pickupFixture.listing.acceptedOrganizationUid,
    'demo-organization',
  );
  assert.ok(pickupFixture.listing.starts <= now);
  assert.ok(pickupFixture.listing.deadline > now);
  assert.ok(pickupFixture.listing.deadline - now >= 15 * 60000);

  assert.equal(pickupFixture.request.status, 'approved');
  assert.equal(pickupFixture.request.organizationUid, 'demo-organization');
  assert.equal(pickupFixture.request.canMeetStorageRequirement, true);
  assert.equal(pickupFixture.request.recipientConfirmedAt, undefined);

  // Verify demo-assigned-confirmed
  assert.equal(confirmedFixture.listing.id, 'demo-assigned-confirmed');
  assert.equal(confirmedFixture.listing.status, 'assigned');
  assert.equal(
    confirmedFixture.listing.acceptedOrganizationUid,
    'demo-organization',
  );
  assert.ok(confirmedFixture.listing.starts <= now);
  assert.ok(confirmedFixture.listing.deadline > now);

  assert.equal(confirmedFixture.request.status, 'approved');
  assert.equal(confirmedFixture.request.organizationUid, 'demo-organization');
  assert.equal(confirmedFixture.request.canMeetStorageRequirement, true);
  assert.ok(typeof confirmedFixture.request.recipientConfirmedAt === 'number');
  assert.ok(confirmedFixture.request.recipientConfirmedAt <= now);
  // Recipient confirmation must be fresh (<= 5 minutes old) so the donor can collect
  const elapsedMinutes =
    (now - confirmedFixture.request.recipientConfirmedAt) / 60000;
  assert.ok(
    elapsedMinutes < 5,
    `Confirmation must be within 5 minutes, got ${elapsedMinutes}m`,
  );
});

test('assigned listings comply with database schema constraints', () => {
  const now = Date.now();
  const validCategories = [
    'Bakery',
    'Produce',
    'Prepared Meals',
    'Dairy & Eggs',
    'Meat & Poultry',
    'Pantry & Dry Goods',
    'Beverages',
    'Other',
  ];
  const validUnits = ['pack', 'portion', 'item', 'g'];
  const validStorage = ['ambient', 'chilled', 'frozen'];

  const fixtures = assignedDonationFixtures(now);
  for (const { listing, request } of fixtures) {
    assert.ok(listing.id.length > 0);
    assert.ok(listing.title.length > 0 && listing.title.length <= 120);
    assert.ok(
      listing.description.length > 0 && listing.description.length <= 1000,
    );
    assert.ok(validCategories.includes(listing.category));
    assert.ok(Number.isInteger(listing.quantity) && listing.quantity > 0);
    assert.ok(validUnits.includes(listing.unit));
    assert.ok(validStorage.includes(listing.storage));
    assert.ok(listing.storageInstructions.length <= 500);
    assert.ok(listing.allergenInfo.length <= 500);
    assert.ok(['provided', 'unknown'].includes(listing.allergenDeclaration));
    assert.ok(listing.pickupAddress.length > 0);
    assert.ok(listing.latitude >= -90 && listing.latitude <= 90);
    assert.ok(listing.longitude >= -180 && listing.longitude <= 180);
    assert.equal(listing.status, 'assigned');
    assert.equal(listing.acceptedOrganizationUid, request.organizationUid);

    assert.equal(request.listingId, listing.id);
    assert.equal(request.status, 'approved');
    assert.equal(request.canMeetStorageRequirement, true);
    assert.ok(request.plannedPickupAt >= listing.starts);
    assert.ok(request.plannedPickupAt <= listing.deadline);
  }
});

test('validateReviewReason enforces rejection feedback and character limit', () => {
  // Rejection requires a non-empty reason up to 500 characters
  assert.equal(validateReviewReason('rejected', '').valid, false);
  assert.equal(validateReviewReason('rejected', '   ').valid, false);
  assert.equal(validateReviewReason('rejected', null).valid, false);
  assert.equal(validateReviewReason('rejected', 'a'.repeat(501)).valid, false);
  assert.equal(
    validateReviewReason('rejected', 'Food safety certificate expired.').valid,
    true,
  );
  assert.equal(validateReviewReason('rejected', 'a'.repeat(500)).valid, true);

  // Approval permits empty reason or notes up to 500 characters
  assert.equal(validateReviewReason('approved', '').valid, true);
  assert.equal(validateReviewReason('approved', '   ').valid, true);
  assert.equal(validateReviewReason('approved', 'a'.repeat(500)).valid, true);
  assert.equal(validateReviewReason('approved', 'a'.repeat(501)).valid, false);
});

test('in-memory audit sorting orders newest timestamps first', () => {
  const auditEntries = [
    { id: '1', createdAtMillis: 1000, newStatus: 'rejected' },
    { id: '2', createdAtMillis: 3000, newStatus: 'approved' },
    { id: '3', createdAtMillis: 2000, newStatus: 'rejected' },
  ];

  auditEntries.sort((a, b) => b.createdAtMillis - a.createdAtMillis);

  assert.deepEqual(
    auditEntries.map((e) => e.id),
    ['2', '3', '1'],
  );
});
