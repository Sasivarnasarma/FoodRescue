import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';

let env;
const applicant = (uid) => env.authenticatedContext(uid).firestore();
const admin = () =>
  env.authenticatedContext('reviewer', { admin: true }).firestore();
const unauthenticated = () => env.unauthenticatedContext().firestore();
const user = (role = 'provider') => ({
  role,
  accountStatus: 'active',
  displayName: 'Demo user',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
const profile = (type = 'provider') => ({
  name: 'Demo profile',
  type,
  verificationStatus: 'pending',
});

function submit(db, uid, userData = user(), profileData = profile()) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), userData);
  batch.set(doc(db, 'profiles', uid), profileData);
  return batch.commit();
}

function reviewWrites(db, uid, decision, overrides = {}) {
  const profileRef = doc(db, 'profiles', uid);
  const auditRef = doc(collection(db, 'adminAuditLogs'));
  return {
    profileRef,
    auditRef,
    update: { verificationStatus: decision, lastAuditId: auditRef.id },
    audit: {
      adminUid: 'reviewer',
      targetUid: uid,
      action: 'review_profile',
      reason: 'Synthetic profile checked',
      previousStatus: 'pending',
      newStatus: decision,
      createdAt: serverTimestamp(),
      ...overrides,
    },
  };
}

function review(db, uid, decision, overrides) {
  const { profileRef, auditRef, update, audit } = reviewWrites(
    db,
    uid,
    decision,
    overrides,
  );
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(profileRef);
    if (snapshot.data()?.verificationStatus !== 'pending')
      throw new Error('Profile no longer pending');
    transaction.update(profileRef, update);
    transaction.set(auditRef, audit);
  });
}

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error('Run pnpm test with the Firestore emulator.');
  env = await initializeTestEnvironment({
    projectId: 'demo-foodrescue',
    firestore: {
      rules: readFileSync(
        new URL('./firestore.rules', import.meta.url),
        'utf8',
      ),
    },
  });
});
beforeEach(async () => env.clearFirestore());
after(async () => env?.cleanup());

test('donor and organization submit their own pending profiles', async () => {
  for (const role of ['provider', 'organization']) {
    const db = applicant(role);
    await assertSucceeds(submit(db, role, user(role), profile(role)));
    assert.equal(
      (await getDoc(doc(db, 'profiles', role))).data().verificationStatus,
      'pending',
    );
  }
});

test('rejects admin signup, self-approval, mismatched role, and forged fields', async () => {
  const db = applicant('donor');
  await assertFails(submit(db, 'donor', user('admin')));
  await assertFails(
    submit(db, 'donor', user(), {
      ...profile(),
      verificationStatus: 'approved',
    }),
  );
  await assertFails(submit(db, 'donor', user(), profile('organization')));
  await assertFails(submit(db, 'donor', { ...user(), admin: true }));
  await assertFails(submit(db, 'donor', { ...user(), displayName: '   ' }));
  await assertSucceeds(submit(db, 'donor'));
  await assertFails(
    updateDoc(doc(db, 'users', 'donor'), { role: 'organization' }),
  );
  await assertFails(
    updateDoc(doc(db, 'profiles', 'donor'), { verificationStatus: 'approved' }),
  );
});

test('restricts private reads and allows a bounded admin queue', async () => {
  await assertSucceeds(submit(applicant('donor'), 'donor'));
  await assertFails(getDoc(doc(unauthenticated(), 'profiles', 'donor')));
  await assertFails(getDoc(doc(applicant('other'), 'users', 'donor')));
  await assertFails(getDoc(doc(applicant('other'), 'profiles', 'donor')));
  const queue = (db) =>
    query(
      collection(db, 'profiles'),
      where('verificationStatus', '==', 'pending'),
      limit(50),
    );
  await assertFails(getDocs(queue(applicant('donor'))));
  assert.equal((await assertSucceeds(getDocs(queue(admin())))).size, 1);
  await assertFails(getDocs(collection(admin(), 'profiles')));
});

test('admin approves or rejects with an immutable audit visible only to admin', async () => {
  for (const decision of ['approved', 'rejected']) {
    const owner = applicant(decision);
    const reviewer = admin();
    await assertSucceeds(submit(owner, decision));
    await assertSucceeds(review(reviewer, decision, decision));
    const result = (await getDoc(doc(owner, 'profiles', decision))).data();
    assert.equal(result.verificationStatus, decision);
    const auditRef = doc(reviewer, 'adminAuditLogs', result.lastAuditId);
    const audit = (await assertSucceeds(getDoc(auditRef))).data();
    assert.equal(audit.newStatus, decision);
    assert.equal(audit.adminUid, 'reviewer');
    await assertFails(getDoc(doc(owner, 'adminAuditLogs', result.lastAuditId)));
    await assertFails(updateDoc(auditRef, { reason: 'rewritten' }));
    await assertFails(deleteDoc(auditRef));
  }
});

test('rejects missing, detached, forged, or mismatched audits', async () => {
  await assertSucceeds(submit(applicant('donor'), 'donor'));
  const db = admin();
  const { profileRef, auditRef, update, audit } = reviewWrites(
    db,
    'donor',
    'approved',
  );
  await assertFails(updateDoc(profileRef, update));
  await assertFails(setDoc(auditRef, audit));
  for (const overrides of [
    { adminUid: 'someone' },
    { newStatus: 'rejected' },
    { targetUid: 'other' },
    { reason: '   ' },
  ]) {
    await assertFails(review(db, 'donor', 'approved', overrides));
  }
  await assertFails(review(applicant('donor'), 'donor', 'approved'));
});

test('competing reviews leave one decision and one audit', async () => {
  await assertSucceeds(submit(applicant('donor'), 'donor'));
  const results = await Promise.allSettled([
    review(admin(), 'donor', 'approved'),
    review(admin(), 'donor', 'rejected'),
  ]);
  assert.equal(
    results.filter(({ status }) => status === 'fulfilled').length,
    1,
  );
  assert.equal(
    (await getDocs(query(collection(admin(), 'adminAuditLogs'), limit(50))))
      .size,
    1,
  );
});

test('future donation collections remain closed', async () => {
  await assertFails(
    setDoc(doc(applicant('donor'), 'foodListings', 'draft'), { title: 'demo' }),
  );
  await assertFails(
    setDoc(doc(admin(), 'foodListings', 'draft'), { title: 'demo' }),
  );
});

test('account creation and profiles reject cross-user and incomplete writes', async () => {
  await assertFails(submit(applicant('other'), 'donor'));
  await assertFails(submit(unauthenticated(), 'donor'));
  const db = applicant('donor');
  await assertFails(setDoc(doc(db, 'profiles', 'donor'), profile()));
  await assertSucceeds(submit(db, 'donor'));
  await assertFails(
    updateDoc(doc(db, 'users', 'donor'), { accountStatus: 'suspended' }),
  );
  await assertFails(deleteDoc(doc(db, 'profiles', 'donor')));
});
