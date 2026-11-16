import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCollectionTiming,
  assignmentCancellationStatus,
} from '../src/lib/pickup-validation.ts';

test('collection uses an inclusive five-minute confirmation limit and exclusive deadline', () => {
  const starts = 0,
    deadline = 1_000_000,
    confirmed = 100_000;
  assert.doesNotThrow(() =>
    assertCollectionTiming(starts, deadline, confirmed, confirmed + 300_000),
  );
  assert.throws(() =>
    assertCollectionTiming(starts, deadline, confirmed, confirmed + 300_001),
  );
  assert.throws(() =>
    assertCollectionTiming(starts, deadline, deadline - 1000, deadline),
  );
  assert.throws(() =>
    assertCollectionTiming(starts, deadline, 500_001, 500_000),
  );
  assert.throws(() =>
    assertCollectionTiming(200_000, deadline, 100_000, 300_000),
  );
  assert.throws(() =>
    assertCollectionTiming(200_000, deadline, 100_000, 100_000),
  );
  assert.throws(() => assertCollectionTiming(starts, NaN, confirmed, 300_000));
});

test('assignment release reopens exactly at 15 minutes and closes below the cutoff', () => {
  const now = 1_000_000;
  assert.equal(
    assignmentCancellationStatus(now + 900_000, false, 'release', now),
    'open',
  );
  assert.equal(
    assignmentCancellationStatus(now + 899_999, false, 'release', now),
    'cancelled',
  );
  assert.throws(() => assignmentCancellationStatus(now, true, 'release', now));
  assert.throws(() => assignmentCancellationStatus(NaN, true, 'release', now));
});

test('the donor can close an early assignment while the recipient must release it', () => {
  const now = 1_000_000,
    deadline = now + 3_600_000;
  assert.equal(
    assignmentCancellationStatus(deadline, true, 'close', now),
    'cancelled',
  );
  assert.throws(() =>
    assignmentCancellationStatus(deadline, false, 'close', now),
  );
  assert.equal(
    assignmentCancellationStatus(now + 60_000, false, 'close', now),
    'cancelled',
  );
});
