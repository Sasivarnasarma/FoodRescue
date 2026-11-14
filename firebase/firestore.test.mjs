import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Bytes,
  GeoPoint,
  Timestamp,
  collection,
  doc,
  deleteDoc,
  deleteField,
  getDoc,
  getDocs,
  limit,
  orderBy,
  startAfter,
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

const validListing = (providerUid = 'donor', overrides = {}) => {
  const now = Date.now();
  return {
    providerUid,
    providerName: 'Demo profile',
    title: 'Surplus Pastries',
    description: 'Fresh croissants and muffins from morning bake.',
    category: 'Bakery',
    quantity: 10,
    unit: 'pack',
    storageRequirement: 'ambient',
    storageInstructions: 'Keep in dry room temperature.',
    allergenInfo: 'Contains gluten, eggs, dairy.',
    allergenDeclaration: 'provided',
    pickupAddress: '123 University Ave',
    pickupLocation: new GeoPoint(43.6532, -79.3832),
    pickupStartsAt: new Timestamp(Math.floor(now / 1000) + 1800, 0),
    pickupDeadline: new Timestamp(Math.floor(now / 1000) + 7200, 0),
    status: 'open',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
};

const draftListing = (providerUid = 'donor', overrides = {}) => ({
  providerUid,
  providerName: 'Demo profile',
  title: 'Draft Pastries',
  status: 'draft',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
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
    update: {
      verificationStatus: decision,
      lastAuditId: auditRef.id,
      rejectionReason:
        decision === 'rejected'
          ? (overrides.reason ?? 'Synthetic profile checked')
          : '',
    },
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
    if (!snapshot.exists()) throw new Error('Missing profile');
    audit.previousStatus = snapshot.data().verificationStatus;
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
  ]) {
    await assertFails(review(db, 'donor', 'approved', overrides));
  }
  await assertFails(review(applicant('donor'), 'donor', 'approved'));
});

test('competing reviews keep each successful decision linked to its audit', async () => {
  await submit(applicant('donor'), 'donor');
  const results = await Promise.allSettled([
    review(admin(), 'donor', 'approved'),
    review(admin(), 'donor', 'rejected'),
  ]);
  const committed = results.filter(
    (result) => result.status === 'fulfilled',
  ).length;
  assert.ok(committed >= 1);
  const audits = await getDocs(
    query(collection(admin(), 'adminAuditLogs'), limit(50)),
  );
  assert.equal(audits.size, committed);
  const current = (await getDoc(doc(admin(), 'profiles', 'donor'))).data();
  const latest = (
    await getDoc(doc(admin(), 'adminAuditLogs', current.lastAuditId))
  ).data();
  assert.equal(latest.newStatus, current.verificationStatus);
});

test('unapproved applicants and arbitrary data cannot create listings', async () => {
  await assertFails(
    setDoc(doc(applicant('donor'), 'foodListings', 'draft'), { title: 'demo' }),
  );
  await assertFails(
    setDoc(doc(admin(), 'foodListings', 'draft'), { title: 'demo' }),
  );
  await submit(applicant('donor'), 'donor');
  await assertFails(
    setDoc(
      doc(applicant('donor'), 'foodListings', 'draft1'),
      draftListing('donor'),
    ),
  );
});

test('approved donor can draft, publish, update, and cancel listings', async () => {
  const donorDb = applicant('donor');
  await submit(donorDb, 'donor');
  await review(admin(), 'donor', 'approved');

  // Draft creation
  const listingRef = doc(donorDb, 'foodListings', 'listing-1');
  await assertSucceeds(setDoc(listingRef, draftListing('donor')));

  // Other user cannot update draft
  const otherDb = applicant('other');
  await assertFails(
    updateDoc(doc(otherDb, 'foodListings', 'listing-1'), { title: 'Hacked' }),
  );

  // Donor can update draft
  await assertSucceeds(
    updateDoc(listingRef, {
      title: 'Updated Draft',
      updatedAt: serverTimestamp(),
    }),
  );

  // Donor can publish draft to open with valid details (preserving createdAt)
  const draftSnap = await getDoc(listingRef);
  const openData = validListing('donor', {
    title: 'Published Bread',
    createdAt: draftSnap.data().createdAt,
  });
  await assertSucceeds(setDoc(listingRef, openData));

  // Material fields are locked once open
  await assertFails(
    updateDoc(listingRef, { quantity: 99, updatedAt: serverTimestamp() }),
  );

  // Donor can cancel open listing
  await assertSucceeds(
    updateDoc(listingRef, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    }),
  );
});

test('listing validation enforces required fields and chronological pickup window', async () => {
  const donorDb = applicant('donor');
  await submit(donorDb, 'donor');
  await review(admin(), 'donor', 'approved');

  const listingRef = doc(donorDb, 'foodListings', 'listing-bad');
  const now = Date.now();

  // Invalid: pickupStartsAt > pickupDeadline
  await assertFails(
    setDoc(
      listingRef,
      validListing('donor', {
        pickupStartsAt: new Timestamp(Math.floor(now / 1000) + 7200, 0),
        pickupDeadline: new Timestamp(Math.floor(now / 1000) + 3600, 0),
      }),
    ),
  );

  // Invalid: useByAt before pickupDeadline
  await assertFails(
    setDoc(
      listingRef,
      validListing('donor', {
        useByAt: new Timestamp(Math.floor(now / 1000) + 3600, 0),
        pickupDeadline: new Timestamp(Math.floor(now / 1000) + 7200, 0),
      }),
    ),
  );

  // Invalid: quantity <= 0
  await assertFails(
    setDoc(
      listingRef,
      validListing('donor', {
        quantity: 0,
      }),
    ),
  );
});

test('organizations can discover open listings but cannot view unpublished drafts', async () => {
  const donorDb = applicant('donor');
  await submit(donorDb, 'donor');
  await review(admin(), 'donor', 'approved');

  const orgDb = applicant('org');
  await submit(orgDb, 'org', user('organization'), profile('organization'));
  await review(admin(), 'org', 'approved');

  // Create one draft and one open listing
  await setDoc(doc(donorDb, 'foodListings', 'draft-1'), draftListing('donor'));
  await setDoc(doc(donorDb, 'foodListings', 'open-1'), validListing('donor'));

  // Org cannot get draft
  await assertFails(getDoc(doc(orgDb, 'foodListings', 'draft-1')));

  // Org can get open listing
  await assertSucceeds(getDoc(doc(orgDb, 'foodListings', 'open-1')));

  // Org can query open listings
  const openQuery = query(
    collection(orgDb, 'foodListings'),
    where('status', '==', 'open'),
    limit(50),
  );
  await assertSucceeds(getDocs(openQuery));

  // Org cannot query without status filter
  const unconstrainedQuery = query(
    collection(orgDb, 'foodListings'),
    limit(50),
  );
  await assertFails(getDocs(unconstrainedQuery));

  // Donor can query their own listings
  const donorQuery = query(
    collection(donorDb, 'foodListings'),
    where('providerUid', '==', 'donor'),
    limit(50),
  );
  await assertSucceeds(getDocs(donorQuery));
});

test('photo rules enforce draft status, owner approval, and 150 KiB payload limit', async () => {
  const donorDb = applicant('donor');
  await submit(donorDb, 'donor');
  await review(admin(), 'donor', 'approved');

  const orgDb = applicant('org');
  await submit(orgDb, 'org', user('organization'), profile('organization'));
  await review(admin(), 'org', 'approved');

  const listingRef = doc(donorDb, 'foodListings', 'photo-listing');
  await setDoc(listingRef, draftListing('donor'));

  const photoRef = doc(
    donorDb,
    'foodListings',
    'photo-listing',
    'photos',
    'primary',
  );

  // Non-owner cannot upload photo
  await assertFails(
    setDoc(
      doc(
        applicant('other'),
        'foodListings',
        'photo-listing',
        'photos',
        'primary',
      ),
      {
        jpeg: Bytes.fromUint8Array(new Uint8Array(100)),
        updatedAt: serverTimestamp(),
      },
    ),
  );

  // Oversized photo (> 153,600 bytes) fails
  await assertFails(
    setDoc(photoRef, {
      jpeg: Bytes.fromUint8Array(new Uint8Array(153601)),
      updatedAt: serverTimestamp(),
    }),
  );

  // Valid photo (<= 153,600 bytes) succeeds
  await assertSucceeds(
    setDoc(photoRef, {
      jpeg: Bytes.fromUint8Array(new Uint8Array(2048)),
      updatedAt: serverTimestamp(),
    }),
  );

  // Org cannot read photo while listing is draft
  await assertFails(
    getDoc(doc(orgDb, 'foodListings', 'photo-listing', 'photos', 'primary')),
  );

  // Once published, photo cannot be modified or replaced
  const photoListingSnap = await getDoc(listingRef);
  await setDoc(
    listingRef,
    validListing('donor', {
      createdAt: photoListingSnap.data().createdAt,
    }),
  );
  await assertFails(
    setDoc(photoRef, {
      jpeg: Bytes.fromUint8Array(new Uint8Array(1024)),
      updatedAt: serverTimestamp(),
    }),
  );

  // But org can read photo once listing is open
  await assertSucceeds(
    getDoc(doc(orgDb, 'foodListings', 'photo-listing', 'photos', 'primary')),
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

test('repeat decisions publish only the latest rejection reason to its owner', async () => {
  const owner = applicant('donor');
  await submit(owner, 'donor');
  await assertFails(review(admin(), 'donor', 'rejected', { reason: '' }));
  await assertFails(review(admin(), 'donor', 'rejected', { reason: '   ' }));
  await assertSucceeds(review(admin(), 'donor', 'approved', { reason: '' }));
  await assertSucceeds(
    review(admin(), 'donor', 'rejected', {
      reason: 'Please confirm business details.',
    }),
  );
  assert.equal(
    (await getDoc(doc(owner, 'profiles', 'donor'))).data().rejectionReason,
    'Please confirm business details.',
  );
  await assertFails(getDoc(doc(applicant('other'), 'profiles', 'donor')));
  await assertSucceeds(review(admin(), 'donor', 'approved', { reason: '' }));
  assert.equal(
    (await getDoc(doc(owner, 'profiles', 'donor'))).data().rejectionReason,
    '',
  );
});

async function approvedDonor() {
  const db = applicant('donor');
  await submit(db, 'donor');
  await review(admin(), 'donor', 'approved');
  return db;
}
test('rejects preassigned or collected fields and forged provider snapshots', async () => {
  const db = await approvedDonor();
  for (const extra of [
    { acceptedOrganizationUid: 'forged' },
    { collectedAt: serverTimestamp() },
  ]) {
    await assertFails(
      setDoc(doc(db, 'foodListings', 'forged'), validListing('donor', extra)),
    );
    await assertFails(
      setDoc(doc(db, 'foodListings', 'forged'), draftListing('donor', extra)),
    );
  }
  const ref = doc(db, 'foodListings', 'rename');
  await setDoc(ref, draftListing('donor'));
  await assertFails(
    updateDoc(ref, {
      providerName: 'Different business',
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(ref, {
      acceptedOrganizationUid: 'forged',
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    setDoc(
      doc(db, 'foodListings', 'category'),
      validListing('donor', { category: 'Invented' }),
    ),
  );
});
test('only active approved owners delete drafts', async () => {
  const db = await approvedDonor();
  const ref = doc(db, 'foodListings', 'delete');
  await setDoc(ref, draftListing('donor'));
  await assertFails(
    deleteDoc(doc(applicant('other'), 'foodListings', 'delete')),
  );
  await review(admin(), 'donor', 'rejected', { reason: 'Check details' });
  await assertFails(deleteDoc(ref));
  await review(admin(), 'donor', 'approved');
  await assertSucceeds(deleteDoc(ref));
});
test('photo writes require a draft after an atomic batch', async () => {
  const db = await approvedDonor();
  const ref = doc(db, 'foodListings', 'batch');
  await setDoc(ref, draftListing('donor'));
  const photo = doc(db, 'foodListings', 'batch', 'photos', 'primary');
  await setDoc(photo, {
    jpeg: Bytes.fromUint8Array(new Uint8Array(153600)),
    updatedAt: serverTimestamp(),
  });
  const old = (await getDoc(ref)).data();
  for (const mode of ['set', 'delete']) {
    const batch = writeBatch(db);
    batch.set(ref, validListing('donor', { createdAt: old.createdAt }));
    if (mode === 'set')
      batch.set(photo, {
        jpeg: Bytes.fromUint8Array(new Uint8Array(10)),
        updatedAt: serverTimestamp(),
      });
    else batch.delete(photo);
    await assertFails(batch.commit());
  }
  await assertSucceeds(
    setDoc(ref, validListing('donor', { createdAt: old.createdAt })),
  );
});
test('deadline-filtered discovery skips elapsed listings and supports bounded pages', async () => {
  const db = await approvedDonor();
  const recipient = applicant('org');
  await submit(recipient, 'org', user('organization'), profile('organization'));
  await review(admin(), 'org', 'approved');
  const past = Timestamp.fromMillis(Date.now() - 3600000);
  for (let i = 0; i < 51; i++)
    await setDoc(
      doc(db, 'foodListings', 'old-' + i),
      validListing('donor', {
        pickupStartsAt: Timestamp.fromMillis(past.toMillis() - 1000),
        pickupDeadline: past,
      }),
    );
  for (let i = 0; i < 3; i++)
    await setDoc(doc(db, 'foodListings', 'live-' + i), validListing('donor'));
  const base = [
    where('status', '==', 'open'),
    where('pickupDeadline', '>', Timestamp.now()),
    orderBy('pickupDeadline', 'asc'),
  ];
  const first = await assertSucceeds(
    getDocs(query(collection(recipient, 'foodListings'), ...base, limit(2))),
  );
  assert.equal(first.size, 2);
  assert.ok(first.docs.every((d) => d.id.startsWith('live-')));
  const next = await assertSucceeds(
    getDocs(
      query(
        collection(recipient, 'foodListings'),
        ...base,
        startAfter(first.docs[1]),
        limit(2),
      ),
    ),
  );
  assert.equal(next.size, 1);
  assert.ok(!first.docs.some((d) => d.id === next.docs[0].id));
});

test('multiline food descriptions and storage instructions remain publishable', async () => {
  const db = await approvedDonor();
  await assertSucceeds(
    setDoc(
      doc(db, 'foodListings', 'multiline'),
      validListing('donor', {
        description: 'Fresh bread\nPacked for pickup',
        storageInstructions: 'Keep dry\nCollect at counter',
      }),
    ),
  );
});

test('donor can clear optional dates and manual location on a saved draft', async () => {
  const db = await approvedDonor();
  const ref = doc(db, 'foodListings', 'clear-draft');
  await setDoc(
    ref,
    draftListing('donor', {
      pickupLocation: new GeoPoint(0, 0),
      pickupStartsAt: Timestamp.now(),
      pickupDeadline: Timestamp.now(),
      useByAt: Timestamp.now(),
      bestBeforeAt: Timestamp.now(),
    }),
  );
  await assertSucceeds(
    updateDoc(ref, {
      pickupLocation: deleteField(),
      pickupStartsAt: deleteField(),
      pickupDeadline: deleteField(),
      useByAt: deleteField(),
      bestBeforeAt: deleteField(),
      updatedAt: serverTimestamp(),
    }),
  );
  const saved = (await getDoc(ref)).data();
  for (const key of [
    'pickupLocation',
    'pickupStartsAt',
    'pickupDeadline',
    'useByAt',
    'bestBeforeAt',
  ])
    assert.equal(key in saved, false);
});
