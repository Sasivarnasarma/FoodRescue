import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calculateDistanceScore,
  calculateRequestDistanceKm,
  formatCoordinates,
  formatRequestDistance,
  getRequestDistanceInfo,
  isValidCoordinate,
  parseDepartureCoordinates,
  validateDepartureCoordinates,
} from '../src/lib/departure-location.ts';

test('isValidCoordinate validates numeric boundaries and types', () => {
  assert.equal(isValidCoordinate(0, 0), true);
  assert.equal(isValidCoordinate(-90, -180), true);
  assert.equal(isValidCoordinate(90, 180), true);
  assert.equal(isValidCoordinate(45.5, -73.5), true);

  // Out of bounds
  assert.equal(isValidCoordinate(90.1, 0), false);
  assert.equal(isValidCoordinate(-90.1, 0), false);
  assert.equal(isValidCoordinate(0, 180.1), false);
  assert.equal(isValidCoordinate(0, -180.1), false);

  // Non-finite and wrong types
  assert.equal(isValidCoordinate(NaN, 0), false);
  assert.equal(isValidCoordinate(0, Infinity), false);
  assert.equal(isValidCoordinate('45', '10'), false);
  assert.equal(isValidCoordinate(null, 0), false);
  assert.equal(isValidCoordinate(undefined, 0), false);
});

test('validateDepartureCoordinates treats omission as valid and checks range if present', () => {
  // Departure point is optional per specifications
  assert.deepEqual(validateDepartureCoordinates(null), { valid: true });
  assert.deepEqual(validateDepartureCoordinates(undefined), { valid: true });

  // Valid coordinates
  assert.deepEqual(
    validateDepartureCoordinates({ latitude: 6.9271, longitude: 79.8612 }),
    { valid: true },
  );

  // Invalid coordinates
  const result = validateDepartureCoordinates({
    latitude: 100,
    longitude: 79.8612,
  });
  assert.equal(result.valid, false);
  assert.ok(result.error && result.error.includes('between -90 and 90'));
});

test('parseDepartureCoordinates parses valid strings and rejects blanks/malformed input', () => {
  // Valid strings
  assert.deepEqual(parseDepartureCoordinates('6.9271', '79.8612'), {
    latitude: 6.9271,
    longitude: 79.8612,
  });

  // Whitespace trimmed
  assert.deepEqual(parseDepartureCoordinates('  -33.8688 ', ' 151.2093  '), {
    latitude: -33.8688,
    longitude: 151.2093,
  });

  // Boundary coordinates
  assert.deepEqual(parseDepartureCoordinates('90', '-180'), {
    latitude: 90,
    longitude: -180,
  });

  // Missing or empty inputs
  assert.throws(
    () => parseDepartureCoordinates('', ''),
    /Enter latitude and longitude/,
  );
  assert.throws(
    () => parseDepartureCoordinates('10', ''),
    /Enter both latitude and longitude/,
  );
  assert.throws(
    () => parseDepartureCoordinates('', '20'),
    /Enter both latitude and longitude/,
  );

  // Non-numeric
  assert.throws(
    () => parseDepartureCoordinates('abc', '20'),
    /must be valid numbers/,
  );
  assert.throws(
    () => parseDepartureCoordinates('10', 'xyz'),
    /must be valid numbers/,
  );

  // Out of range
  assert.throws(
    () => parseDepartureCoordinates('91', '0'),
    /between -90 and 90/,
  );
  assert.throws(
    () => parseDepartureCoordinates('0', '185'),
    /between -180 and 180/,
  );
  assert.throws(
    () => parseDepartureCoordinates('-95', '0'),
    /between -90 and 90/,
  );
});

test('calculateRequestDistanceKm returns null when either location is missing or invalid', () => {
  const validPickup = { latitude: 6.9271, longitude: 79.8612 };
  const validDeparture = { latitude: 6.935, longitude: 79.85 };

  // Valid coordinates
  const distance = calculateRequestDistanceKm(validDeparture, validPickup);
  assert.ok(distance !== null && distance > 0);

  // Same coordinates yield 0 km
  assert.equal(calculateRequestDistanceKm(validPickup, validPickup), 0);

  // Missing coordinates return null without throwing
  assert.equal(calculateRequestDistanceKm(null, validPickup), null);
  assert.equal(calculateRequestDistanceKm(undefined, validPickup), null);
  assert.equal(calculateRequestDistanceKm(validDeparture, null), null);
  assert.equal(calculateRequestDistanceKm(validDeparture, undefined), null);
  assert.equal(calculateRequestDistanceKm(null, null), null);

  // Invalid coordinates return null
  assert.equal(
    calculateRequestDistanceKm({ latitude: 100, longitude: 0 }, validPickup),
    null,
  );
  assert.equal(
    calculateRequestDistanceKm(validDeparture, { latitude: 0, longitude: 200 }),
    null,
  );
});

test('formatRequestDistance formats meters, kilometers, and unavailable states', () => {
  assert.equal(formatRequestDistance(0.5), '500 m');
  assert.equal(formatRequestDistance(0.025), '25 m');
  assert.equal(formatRequestDistance(1.234), '1.2 km');
  assert.equal(formatRequestDistance(15.78), '15.8 km');

  // Unavailable states
  assert.equal(formatRequestDistance(null), 'Distance unavailable');
  assert.equal(formatRequestDistance(undefined), 'Distance unavailable');
  assert.equal(formatRequestDistance(NaN), 'Distance unavailable');
  assert.equal(
    formatRequestDistance(null, 'no departure point provided'),
    'Distance unavailable (no departure point provided)',
  );
});

test('calculateDistanceScore implements Section 2 smart matching formula and handles unavailable distance', () => {
  // distanceScore = 100 * clamp(1 - distanceKm / 10, 0, 1)
  // At 0 km: 100
  const score0 = calculateDistanceScore(0);
  assert.equal(score0.isAvailable, true);
  assert.equal(score0.score, 100);

  // At 2 km: 100 * (1 - 0.2) = 80
  const score2 = calculateDistanceScore(2);
  assert.equal(score2.isAvailable, true);
  assert.equal(score2.score, 80);

  // At 5 km: 100 * (1 - 0.5) = 50
  const score5 = calculateDistanceScore(5);
  assert.equal(score5.isAvailable, true);
  assert.equal(score5.score, 50);

  // At 10 km: 100 * (1 - 1.0) = 0
  const score10 = calculateDistanceScore(10);
  assert.equal(score10.isAvailable, true);
  assert.equal(score10.score, 0);

  // Beyond 10 km: clamps to 0
  const score15 = calculateDistanceScore(15);
  assert.equal(score15.isAvailable, true);
  assert.equal(score15.score, 0);

  // Unavailable distance: returns null score with isAvailable: false
  const scoreNull = calculateDistanceScore(null);
  assert.equal(scoreNull.isAvailable, false);
  assert.equal(scoreNull.score, null);
  assert.ok(scoreNull.reason);

  const scoreUndef = calculateDistanceScore(undefined);
  assert.equal(scoreUndef.isAvailable, false);
  assert.equal(scoreUndef.score, null);

  const scoreNaN = calculateDistanceScore(NaN);
  assert.equal(scoreNaN.isAvailable, false);
  assert.equal(scoreNaN.score, null);
});

test('getRequestDistanceInfo handles missing departure, missing pickup, and available distance states', () => {
  const pickup = { latitude: 6.9271, longitude: 79.8612 };
  const departure = { latitude: 6.935, longitude: 79.85 };

  // Both provided: available
  const available = getRequestDistanceInfo(departure, pickup);
  assert.equal(available.status, 'available');
  assert.equal(available.isAvailable, true);
  assert.ok(available.distanceKm !== null && available.distanceKm > 0);
  assert.ok(available.distanceScore !== null && available.distanceScore > 0);
  assert.ok(
    available.formattedDistance.includes('km') ||
      available.formattedDistance.includes('m'),
  );
  assert.ok(available.explanation.includes('from proposed departure point'));

  // Missing departure point
  const missingDeparture = getRequestDistanceInfo(null, pickup);
  assert.equal(missingDeparture.status, 'missing_departure');
  assert.equal(missingDeparture.isAvailable, false);
  assert.equal(missingDeparture.distanceKm, null);
  assert.equal(missingDeparture.distanceScore, null);
  assert.equal(missingDeparture.formattedDistance, 'Distance unavailable');
  assert.equal(
    missingDeparture.explanation,
    'No departure point provided by recipient',
  );

  // Missing pickup location
  const missingPickup = getRequestDistanceInfo(departure, null);
  assert.equal(missingPickup.status, 'missing_pickup');
  assert.equal(missingPickup.isAvailable, false);
  assert.equal(missingPickup.distanceKm, null);
  assert.equal(missingPickup.distanceScore, null);
  assert.equal(
    missingPickup.explanation,
    'Donation listing does not specify a pickup location',
  );

  // Invalid coordinates
  const invalidDep = getRequestDistanceInfo(
    { latitude: 120, longitude: 0 },
    pickup,
  );
  assert.equal(invalidDep.status, 'invalid_coordinates');
  assert.equal(invalidDep.isAvailable, false);
  assert.equal(invalidDep.distanceKm, null);
});

test('formatCoordinates returns readable strings or None fallback', () => {
  assert.equal(
    formatCoordinates({ latitude: 6.9271, longitude: 79.8612 }),
    '6.92710, 79.86120',
  );
  assert.equal(formatCoordinates(null), 'None');
  assert.equal(formatCoordinates(undefined), 'None');
});
