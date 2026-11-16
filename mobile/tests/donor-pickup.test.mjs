import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  encodePickupQrPayload,
  parsePickupReference,
} from '../src/lib/qr-service.ts';
import { checkDonorCollectionEligibility } from '../src/lib/pickup-validation.ts';

test('donor scans the same versioned reference shown by the recipient', () => {
  const payload = encodePickupQrPayload('listing_test_123');
  assert.deepEqual(parsePickupReference(payload), {
    valid: true,
    listingId: 'listing_test_123',
    version: 1,
  });
  assert.equal(parsePickupReference('listing_test_123').valid, true);
  for (const value of [
    '',
    null,
    undefined,
    'https://example.com/listing',
    'foodrescue://pickup?id=a',
    'foodrescue:v99:a',
    '{"listingId":"a","version":1}',
    'bad/id',
  ]) {
    assert.equal(parsePickupReference(value).valid, false);
  }
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

test('donor eligibility rejects malformed clocks and reversed pickup windows', () => {
  assert.equal(
    checkDonorCollectionEligibility(100_000, 900_000, 150_000, NaN).canCollect,
    false,
  );
  assert.equal(
    checkDonorCollectionEligibility(900_000, 100_000, 150_000, 200_000)
      .canCollect,
    false,
  );
});
