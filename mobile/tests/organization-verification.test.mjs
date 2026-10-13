import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOrganizationVerification } from '../src/lib/organization-verification.ts';

const active = { role: 'organization', accountStatus: 'active' };
const profile = { type: 'organization', name: 'Example Organization' };

test('only confirmed missing profiles offer submission', () => {
  const account = { data: null, confirmed: true };
  assert.equal(
    getOrganizationVerification(account, { data: null, confirmed: true }).state,
    'form',
  );
  assert.equal(
    getOrganizationVerification(account, { data: null, confirmed: false })
      .state,
    'waiting',
  );
});

test('an existing donor or suspended account cannot submit an organization profile', () => {
  const account = { data: active, confirmed: true };
  const noProfile = { data: null, confirmed: true };
  assert.equal(
    getOrganizationVerification(
      { ...account, data: { ...active, role: 'provider' } },
      noProfile,
    ).state,
    'other-role',
  );
  assert.equal(
    getOrganizationVerification(
      { ...account, data: { ...active, accountStatus: 'suspended' } },
      noProfile,
    ).state,
    'suspended',
  );
});

test('only organization profiles report valid review states and indicate cached reads', () => {
  const account = { data: active, confirmed: true };
  for (const state of ['pending', 'approved', 'rejected']) {
    assert.deepEqual(
      getOrganizationVerification(account, {
        data: { ...profile, verificationStatus: state },
        confirmed: false,
      }),
      { state, name: profile.name, confirmed: false },
    );
  }
  assert.equal(
    getOrganizationVerification(account, {
      data: { ...profile, verificationStatus: 'unknown' },
      confirmed: true,
    }).state,
    'invalid',
  );
});
