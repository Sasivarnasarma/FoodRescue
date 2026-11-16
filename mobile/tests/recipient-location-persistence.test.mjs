import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  getSavedRecipientLocation,
  saveRecipientLocation,
  clearSavedRecipientLocation,
  setLocationStorageAdapter,
} from '../src/lib/departure-location.ts';

class MockStorage {
  constructor() {
    this.map = new Map();
  }
  async getItem(key) {
    return this.map.get(key) ?? null;
  }
  async setItem(key, value) {
    this.map.set(key, value);
  }
  async removeItem(key) {
    this.map.delete(key);
  }
}

let mockStorage;

beforeEach(() => {
  mockStorage = new MockStorage();
  setLocationStorageAdapter(mockStorage);
});

test('getSavedRecipientLocation returns null when nothing is stored', async () => {
  const result = await getSavedRecipientLocation();
  assert.equal(result, null);
});

test('saveRecipientLocation persists coordinates and address', async () => {
  const coords = { latitude: 6.9271, longitude: 79.8612 };
  const address = 'Colombo Community Hall, Sri Lanka';

  await saveRecipientLocation(coords, address);
  const retrieved = await getSavedRecipientLocation();

  assert.ok(retrieved !== null);
  assert.equal(retrieved.coordinates.latitude, 6.9271);
  assert.equal(retrieved.coordinates.longitude, 79.8612);
  assert.equal(retrieved.address, 'Colombo Community Hall, Sri Lanka');
});

test('organization-specific uid scoping isolates and falls back correctly', async () => {
  const org1Coords = { latitude: 6.9001, longitude: 79.8501 };
  const org2Coords = { latitude: 7.2906, longitude: 80.6337 };

  // Save for org1
  await saveRecipientLocation(org1Coords, 'Colombo Center', 'org_1');
  // Save for org2
  await saveRecipientLocation(org2Coords, 'Kandy Food Bank', 'org_2');

  const retrieved1 = await getSavedRecipientLocation('org_1');
  const retrieved2 = await getSavedRecipientLocation('org_2');

  assert.equal(retrieved1?.coordinates.latitude, 6.9001);
  assert.equal(retrieved1?.address, 'Colombo Center');

  assert.equal(retrieved2?.coordinates.latitude, 7.2906);
  assert.equal(retrieved2?.address, 'Kandy Food Bank');

  // Unknown org falls back to the most recent generic key
  const retrievedUnknown = await getSavedRecipientLocation('org_unknown');
  assert.ok(retrievedUnknown !== null);
  assert.equal(retrievedUnknown?.coordinates.latitude, 7.2906);
});

test('clearSavedRecipientLocation removes saved coordinates', async () => {
  await saveRecipientLocation({ latitude: 6.9, longitude: 79.8 }, 'Test Loc');
  let current = await getSavedRecipientLocation();
  assert.ok(current !== null);

  await clearSavedRecipientLocation();
  current = await getSavedRecipientLocation();
  assert.equal(current, null);
});

test('corrupted or invalid storage payload returns null gracefully', async () => {
  await mockStorage.setItem(
    '@foodrescue_recipient_saved_location',
    'not-valid-json',
  );
  const result1 = await getSavedRecipientLocation();
  assert.equal(result1, null);

  await mockStorage.setItem(
    '@foodrescue_recipient_saved_location',
    JSON.stringify({ coordinates: { latitude: 'invalid', longitude: 80 } }),
  );
  const result2 = await getSavedRecipientLocation();
  assert.equal(result2, null);
});
