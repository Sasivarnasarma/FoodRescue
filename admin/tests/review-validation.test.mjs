import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isReviewableSnapshot,
  validateReviewReason,
} from '../src/lib/review-validation.ts';

test('rejection requires real nonblank bounded feedback', () => {
  for (const value of ['', '  ', null, undefined, 'a'.repeat(501)])
    assert.equal(validateReviewReason('rejected', value).valid, false);
  assert.equal(validateReviewReason('rejected', 'a'.repeat(500)).valid, true);
  assert.equal(
    validateReviewReason('rejected', '  Please complete your profile.  ').valid,
    true,
  );
});

test('approval requires no reason and discards old rejection text', () => {
  assert.equal(validateReviewReason('approved', '').valid, true);
  assert.equal(validateReviewReason('approved', 'a'.repeat(501)).valid, true);
});

test('review controls require a valid server-confirmed profile snapshot', () => {
  const data = { type: 'organization', verificationStatus: 'approved' };
  const metadata = { fromCache: false, hasPendingWrites: false };
  assert.equal(isReviewableSnapshot(data, metadata), true);
  assert.equal(
    isReviewableSnapshot({ ...data, verificationStatus: 'rejected' }, metadata),
    true,
  );
  assert.equal(
    isReviewableSnapshot(data, { ...metadata, fromCache: true }),
    false,
  );
  assert.equal(
    isReviewableSnapshot(data, { ...metadata, hasPendingWrites: true }),
    false,
  );
  assert.equal(isReviewableSnapshot(null, metadata), false);
  assert.equal(
    isReviewableSnapshot({ ...data, verificationStatus: 'unknown' }, metadata),
    false,
  );
});
