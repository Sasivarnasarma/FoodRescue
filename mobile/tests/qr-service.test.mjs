import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CURRENT_QR_VERSION,
  encodePickupQrPayload,
  generateQrMatrix,
  isValidListingId,
  parsePickupReference,
} from '../src/lib/qr-service.ts';

test('isValidListingId validates alphanumeric, dashes, and underscores within length', () => {
  assert.equal(isValidListingId('listing123'), true);
  assert.equal(isValidListingId('list_abc-456'), true);
  assert.equal(isValidListingId('A'), true);
  assert.equal(isValidListingId('a'.repeat(128)), true);

  // Invalid cases
  assert.equal(isValidListingId(''), false);
  assert.equal(isValidListingId('   '), false);
  assert.equal(isValidListingId('list/123'), false);
  assert.equal(isValidListingId('list:123'), false);
  assert.equal(isValidListingId('list?query=1'), false);
  assert.equal(isValidListingId('list 123'), false);
  assert.equal(isValidListingId('a'.repeat(129)), false);
  assert.equal(isValidListingId(null), false);
  assert.equal(isValidListingId(undefined), false);
  assert.equal(isValidListingId(12345), false);
});

test('encodePickupQrPayload produces versioned prefix and validates ID', () => {
  assert.equal(
    encodePickupQrPayload('item_456'),
    `foodrescue:v${CURRENT_QR_VERSION}:item_456`,
  );
  assert.equal(encodePickupQrPayload('  item_456  '), 'foodrescue:v1:item_456');

  // Throws on invalid ID
  assert.throws(
    () => encodePickupQrPayload(''),
    /Invalid listing ID for QR generation/,
  );
  assert.throws(
    () => encodePickupQrPayload('invalid/id'),
    /Invalid listing ID for QR generation/,
  );
  assert.throws(
    () => encodePickupQrPayload('item_1', 0),
    /QR payload version must be a positive integer/,
  );
});

test('parsePickupReference correctly parses valid QR payload and plain reference IDs', () => {
  // Full QR payload
  const fromQr = parsePickupReference('foodrescue:v1:donation_xyz');
  assert.deepEqual(fromQr, {
    valid: true,
    listingId: 'donation_xyz',
    version: 1,
  });

  // Case insensitive prefix handling
  const upperQr = parsePickupReference('FOODRESCUE:V1:donation_xyz');
  assert.equal(upperQr.valid, true);
  assert.equal(upperQr.listingId, 'donation_xyz');

  // Plain manual ID entry
  const fromManual = parsePickupReference('donation_xyz');
  assert.deepEqual(fromManual, {
    valid: true,
    listingId: 'donation_xyz',
    version: 1,
  });

  // Whitespace trimming
  const trimmed = parsePickupReference('   donation_xyz   ');
  assert.equal(trimmed.valid, true);
  assert.equal(trimmed.listingId, 'donation_xyz');
});

test('parsePickupReference strictly rejects external URLs and phishing attempts', () => {
  for (const url of [
    'https://phishing.com/claim',
    'http://malicious.org/pickup',
    'ftp://files.example.com',
    'www.foodrescue-fake.com',
    '   https://site.org   ',
  ]) {
    const result = parsePickupReference(url);
    assert.equal(result.valid, false);
    assert.ok(
      result.error &&
        result.error.includes(
          'External URLs are not valid FoodRescue pickup references',
        ),
    );
  }
});

test('parsePickupReference rejects unsupported versions, oversized inputs, and malformed formats', () => {
  // Unsupported version
  const futureVersion = parsePickupReference('foodrescue:v99:donation_xyz');
  assert.equal(futureVersion.valid, false);
  assert.equal(futureVersion.version, 99);
  assert.ok(
    futureVersion.error &&
      futureVersion.error.includes('Unsupported QR version'),
  );

  // Invalid version format
  const badVersion = parsePickupReference('foodrescue:vABC:donation_xyz');
  assert.equal(badVersion.valid, false);
  assert.ok(
    badVersion.error && badVersion.error.includes('Invalid QR version format'),
  );

  // Malformed structure
  const shortFormat = parsePickupReference('foodrescue:donation_xyz');
  assert.equal(shortFormat.valid, false);

  // Oversized payload
  const oversized = parsePickupReference('foodrescue:v1:' + 'a'.repeat(300));
  assert.equal(oversized.valid, false);
  assert.ok(
    oversized.error && oversized.error.includes('maximum supported length'),
  );

  // Empty or non-string input
  assert.equal(parsePickupReference('').valid, false);
  assert.equal(parsePickupReference('   ').valid, false);
  assert.equal(parsePickupReference(null).valid, false);
  assert.equal(parsePickupReference(12345).valid, false);
});

test('generateQrMatrix produces a square boolean matrix suitable for vector rendering', () => {
  const payload = 'foodrescue:v1:demo-listing-123';
  const qr = generateQrMatrix(payload);

  assert.ok(qr.size >= 21);
  assert.equal(qr.modules.length, qr.size);

  for (const row of qr.modules) {
    assert.equal(row.length, qr.size);
    for (const cell of row) {
      assert.equal(typeof cell, 'boolean');
    }
  }

  // Top-left finder pattern corner must be true (dark)
  assert.equal(qr.modules[0][0], true);
  assert.equal(qr.modules[0][6], true);
  assert.equal(qr.modules[6][0], true);
  assert.equal(qr.modules[6][6], true);
});

test('the generator cannot emit a version this app cannot scan', () => {
  assert.throws(
    () => encodePickupQrPayload('listing_1', 2),
    /Unsupported QR version/,
  );
});
