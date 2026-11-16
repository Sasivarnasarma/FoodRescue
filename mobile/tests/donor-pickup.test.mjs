import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generatePickupQrPayload,
  parsePickupQrPayload,
} from '../src/lib/pickup-qr.ts';
import { checkDonorCollectionEligibility } from '../src/lib/pickup-validation.ts';

test('parsePickupQrPayload handles empty, blank or invalid inputs', () => {
  assert.equal(parsePickupQrPayload('').isValid, false);
  assert.equal(parsePickupQrPayload('   ').isValid, false);
  // @ts-expect-error testing invalid argument types
  assert.equal(parsePickupQrPayload(null).isValid, false);
  // @ts-expect-error testing invalid argument types
  assert.equal(parsePickupQrPayload(undefined).isValid, false);
});

test('parsePickupQrPayload parses JSON QR payloads', () => {
  const jsonPayload = JSON.stringify({
    listingId: 'listing_test_123',
    version: 1,
  });
  const result = parsePickupQrPayload(jsonPayload);
  assert.equal(result.isValid, true);
  assert.equal(result.listingId, 'listing_test_123');
  assert.equal(result.version, 1);
});

test('generatePickupQrPayload produces parseable JSON payload', () => {
  const payload = generatePickupQrPayload('offer_xyz', 2);
  const parsed = parsePickupQrPayload(payload);
  assert.equal(parsed.isValid, true);
  assert.equal(parsed.listingId, 'offer_xyz');
  assert.equal(parsed.version, 2);
});

test('parsePickupQrPayload parses custom URL and deep link schemes', () => {
  const queryResult = parsePickupQrPayload(
    'foodrescue://pickup?listingId=listing_from_param',
  );
  assert.equal(queryResult.isValid, true);
  assert.equal(queryResult.listingId, 'listing_from_param');

  const pathResult = parsePickupQrPayload(
    'foodrescue://pickup/listing_from_path',
  );
  assert.equal(pathResult.isValid, true);
  assert.equal(pathResult.listingId, 'listing_from_path');
});

test('parsePickupQrPayload parses raw ID strings and manual reference entry', () => {
  const rawResult = parsePickupQrPayload('donation_ref_999');
  assert.equal(rawResult.isValid, true);
  assert.equal(rawResult.listingId, 'donation_ref_999');
});

test('checkDonorCollectionEligibility returns outside_window when window timing is missing', () => {
  const res1 = checkDonorCollectionEligibility(null, 1_000_000, 500_000);
  assert.equal(res1.canCollect, false);
  assert.equal(res1.status, 'outside_window');

  const res2 = checkDonorCollectionEligibility(100_000, null, 500_000);
  assert.equal(res2.canCollect, false);
  assert.equal(res2.status, 'outside_window');
});

test('checkDonorCollectionEligibility detects elapsed pickup deadline', () => {
  const startsAt = 100_000;
  const deadline = 500_000;
  const confirmedAt = 200_000;
  const now = 500_000; // at or past deadline

  const res = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    now,
  );
  assert.equal(res.canCollect, false);
  assert.equal(res.status, 'deadline_expired');
});

test('checkDonorCollectionEligibility detects window not opened yet', () => {
  const startsAt = 200_000;
  const deadline = 500_000;
  const confirmedAt = null;
  const now = 150_000; // before window opens

  const res = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    now,
  );
  assert.equal(res.canCollect, false);
  assert.equal(res.status, 'outside_window');
});

test('checkDonorCollectionEligibility detects awaiting recipient confirmation', () => {
  const startsAt = 100_000;
  const deadline = 500_000;
  const now = 200_000;

  const res = checkDonorCollectionEligibility(startsAt, deadline, null, now);
  assert.equal(res.canCollect, false);
  assert.equal(res.status, 'awaiting_confirmation');
});

test('checkDonorCollectionEligibility rejects confirmation prior to window start', () => {
  const startsAt = 200_000;
  const deadline = 500_000;
  const confirmedAt = 150_000; // before startsAt
  const now = 250_000;

  const res = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    now,
  );
  assert.equal(res.canCollect, false);
  assert.equal(res.status, 'outside_window');
});

test('checkDonorCollectionEligibility detects future confirmation timestamp', () => {
  const startsAt = 100_000;
  const deadline = 500_000;
  const now = 200_000;
  const confirmedAt = 250_000; // ahead of now

  const res = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    now,
  );
  assert.equal(res.canCollect, false);
  assert.equal(res.status, 'awaiting_confirmation');
});

test('checkDonorCollectionEligibility enforces 5-minute security limit and expiration', () => {
  const startsAt = 100_000;
  const deadline = 800_000;
  const confirmedAt = 200_000;

  // 5 minutes and 1 ms later
  const expiredNow = confirmedAt + 300_001;
  const expiredRes = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    expiredNow,
  );
  assert.equal(expiredRes.canCollect, false);
  assert.equal(expiredRes.status, 'expired_confirmation');
  assert.equal(expiredRes.remainingConfirmationMs, 0);

  // Exactly 5 minutes (300,000 ms) is inclusive
  const boundaryNow = confirmedAt + 300_000;
  const boundaryRes = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    boundaryNow,
  );
  assert.equal(boundaryRes.canCollect, true);
  assert.equal(boundaryRes.status, 'ready');
  assert.equal(boundaryRes.remainingConfirmationMs, 0);

  // 2 minutes later (120,000 ms elapsed -> 180,000 ms remaining)
  const validNow = confirmedAt + 120_000;
  const validRes = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    validNow,
  );
  assert.equal(validRes.canCollect, true);
  assert.equal(validRes.status, 'ready');
  assert.equal(validRes.remainingConfirmationMs, 180_000);
});

test('checkDonorCollectionEligibility accepts Date instances identically to timestamps', () => {
  const startsAt = new Date('2026-11-16T12:00:00Z');
  const deadline = new Date('2026-11-16T14:00:00Z');
  const confirmedAt = new Date('2026-11-16T12:10:00Z');
  const now = new Date('2026-11-16T12:12:00Z').getTime(); // 2 minutes elapsed

  const res = checkDonorCollectionEligibility(
    startsAt,
    deadline,
    confirmedAt,
    now,
  );
  assert.equal(res.canCollect, true);
  assert.equal(res.status, 'ready');
  assert.equal(res.remainingConfirmationMs, 180_000);
});
