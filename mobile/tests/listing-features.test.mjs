import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseCoordinates,
  calculateHaversineDistanceKm,
  getBase64ByteLength,
  compareDonations,
} from '../src/lib/listing-helpers.ts';
import {
  parseLocalDate,
  positiveQuantity,
} from '../src/lib/listing-form-validation.ts';
test('manual coordinates reject blanks, nonfinite and out of range values', () => {
  for (const values of [
    ['', '0'],
    ['91', '0'],
    ['0', '181'],
    ['Infinity', '0'],
    ['no', '0'],
  ])
    assert.throws(() => parseCoordinates(...values));
  assert.deepEqual(parseCoordinates('0', '0'), { latitude: 0, longitude: 0 });
});
test('distance is stable for coincident, known and antipodal points', () => {
  assert.equal(
    calculateHaversineDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0 },
    ),
    0,
  );
  assert.ok(
    Math.abs(
      calculateHaversineDistanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
      ) - 111.195,
    ) < 0.01,
  );
  assert.ok(
    Number.isFinite(
      calculateHaversineDistanceKm(
        { latitude: 90, longitude: 0 },
        { latitude: -90, longitude: 180 },
      ),
    ),
  );
});
test('ordering consistently prioritizes deadline over distance', () => {
  const values = [
    { id: 'b', deadline: 200, distance: 0 },
    { id: 'a', deadline: 100, distance: 50 },
    { id: 'c', deadline: 200, distance: null },
  ];
  assert.deepEqual(
    values.sort(compareDonations).map((x) => x.id),
    ['a', 'b', 'c'],
  );
});
test('base64 byte size includes correct padding at the photo limit', () => {
  for (const n of [1, 2, 3, 153599, 153600, 153601])
    assert.equal(getBase64ByteLength(Buffer.alloc(n).toString('base64')), n);
});
test('draft form rejects fractional quantities and invalid calendar dates', () => {
  for (const value of ['', '1.5', '2x', '0', '-1'])
    assert.throws(() => positiveQuantity(value));
  assert.equal(positiveQuantity('5'), 5);
  assert.throws(() => parseLocalDate('2026-02-30 12:00'));
  assert.throws(() => parseLocalDate('2026-12-01 25:00'));
  assert.equal(parseLocalDate('2026-12-01 12:30').getMinutes(), 30);
});
