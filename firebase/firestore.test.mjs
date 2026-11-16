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
  collectionGroup,
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

async function approvedOrganization(uid = 'org-1', name = 'Demo Shelter') {
  const db = applicant(uid);
  await submit(
    db,
    uid,
    {
      role: 'organization',
      accountStatus: 'active',
      displayName: name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    {
      name,
      type: 'organization',
      verificationStatus: 'pending',
    },
  );
  await review(admin(), uid, 'approved');
  return db;
}

function validRequest(listing, orgUid = 'org-1', overrides = {}) {
  const now = Date.now();
  const planned = new Timestamp(Math.floor(now / 1000) + 2400, 0);
  return {
    organizationUid: orgUid,
    providerUid: listing.providerUid,
    organizationName: 'Demo Shelter',
    plannedPickupAt: planned,
    canMeetStorageRequirement: true,
    status: 'requested',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

test('approved organization can submit a valid whole-listing request', async () => {
  const donorDb = await approvedDonor();
  const listingRef = doc(donorDb, 'foodListings', 'listing-req-1');
  const listing = validListing('donor');
  await setDoc(listingRef, listing);

  const orgDb = await approvedOrganization('org-1');
  const reqRef = doc(
    orgDb,
    'foodListings',
    'listing-req-1',
    'requests',
    'org-1',
  );
  await assertSucceeds(setDoc(reqRef, validRequest(listing, 'org-1')));

  const saved = (await getDoc(reqRef)).data();
  assert.equal(saved.status, 'requested');
  assert.equal(saved.canMeetStorageRequirement, true);
  assert.equal(saved.organizationUid, 'org-1');
});

test('unapproved organizations and providers cannot submit requests', async () => {
  const donorDb = await approvedDonor();
  const listingRef = doc(donorDb, 'foodListings', 'listing-req-2');
  const listing = validListing('donor');
  await setDoc(listingRef, listing);

  // Unapproved applicant cannot submit
  const pendingOrgDb = applicant('pending-org');
  await submit(
    pendingOrgDb,
    'pending-org',
    user('organization'),
    profile('organization'),
  );
  await assertFails(
    setDoc(
      doc(
        pendingOrgDb,
        'foodListings',
        'listing-req-2',
        'requests',
        'pending-org',
      ),
      validRequest(listing, 'pending-org'),
    ),
  );

  // Provider cannot submit a request
  await assertFails(
    setDoc(
      doc(donorDb, 'foodListings', 'listing-req-2', 'requests', 'donor'),
      validRequest(listing, 'donor'),
    ),
  );

  // Organization cannot submit with mismatched document ID or organizationUid
  const orgDb = await approvedOrganization('org-1');
  await assertFails(
    setDoc(
      doc(orgDb, 'foodListings', 'listing-req-2', 'requests', 'org-2'),
      validRequest(listing, 'org-1'),
    ),
  );
  await assertFails(
    setDoc(
      doc(orgDb, 'foodListings', 'listing-req-2', 'requests', 'org-1'),
      validRequest(listing, 'org-2'),
    ),
  );
});

test('request validation enforces storage requirement, timing, and deadline cutoff', async () => {
  const donorDb = await approvedDonor();
  const orgDb = await approvedOrganization('org-1');
  const now = Date.now();

  const listingRef = doc(donorDb, 'foodListings', 'listing-req-val');
  const listing = validListing('donor', {
    pickupStartsAt: new Timestamp(Math.floor(now / 1000) + 1800, 0),
    pickupDeadline: new Timestamp(Math.floor(now / 1000) + 7200, 0),
  });
  await setDoc(listingRef, listing);

  const reqRef = doc(
    orgDb,
    'foodListings',
    'listing-req-val',
    'requests',
    'org-1',
  );

  // canMeetStorageRequirement must be true
  await assertFails(
    setDoc(
      reqRef,
      validRequest(listing, 'org-1', { canMeetStorageRequirement: false }),
    ),
  );

  // plannedPickupAt before request.time fails
  await assertFails(
    setDoc(
      reqRef,
      validRequest(listing, 'org-1', {
        plannedPickupAt: new Timestamp(Math.floor(now / 1000) - 100, 0),
      }),
    ),
  );

  // plannedPickupAt after pickupDeadline fails
  await assertFails(
    setDoc(
      reqRef,
      validRequest(listing, 'org-1', {
        plannedPickupAt: new Timestamp(Math.floor(now / 1000) + 8000, 0),
      }),
    ),
  );

  // extra fields fail
  await assertFails(
    setDoc(
      reqRef,
      validRequest(listing, 'org-1', { unauthorizedField: 'bad' }),
    ),
  );

  // optional departureLocation succeeds with GeoPoint
  await assertSucceeds(
    setDoc(
      reqRef,
      validRequest(listing, 'org-1', {
        departureLocation: new GeoPoint(43.6532, -79.3832),
      }),
    ),
  );
});

test('rejects request submission within 15 minutes of deadline or on non-open listings', async () => {
  const donorDb = await approvedDonor();
  const orgDb = await approvedOrganization('org-1');
  const now = Date.now();

  // Listing ending in 10 minutes (< 15 min cutoff)
  const urgentListingRef = doc(donorDb, 'foodListings', 'listing-urgent');
  const urgentListing = validListing('donor', {
    pickupStartsAt: new Timestamp(Math.floor(now / 1000) - 3600, 0),
    pickupDeadline: new Timestamp(Math.floor(now / 1000) + 600, 0),
  });
  await setDoc(urgentListingRef, urgentListing);

  const urgentReqRef = doc(
    orgDb,
    'foodListings',
    'listing-urgent',
    'requests',
    'org-1',
  );
  await assertFails(
    setDoc(
      urgentReqRef,
      validRequest(urgentListing, 'org-1', {
        plannedPickupAt: new Timestamp(Math.floor(now / 1000) + 300, 0),
      }),
    ),
  );

  // Draft listing cannot accept requests
  const draftRef = doc(donorDb, 'foodListings', 'listing-draft');
  await setDoc(draftRef, draftListing('donor'));
  await assertFails(
    setDoc(
      doc(orgDb, 'foodListings', 'listing-draft', 'requests', 'org-1'),
      validRequest({ providerUid: 'donor' }, 'org-1'),
    ),
  );
});

test('recipient can withdraw their own pending request and cannot resubmit', async () => {
  const donorDb = await approvedDonor();
  const listingRef = doc(donorDb, 'foodListings', 'listing-withdraw');
  const listing = validListing('donor');
  await setDoc(listingRef, listing);

  const orgDb = await approvedOrganization('org-1');
  const reqRef = doc(
    orgDb,
    'foodListings',
    'listing-withdraw',
    'requests',
    'org-1',
  );
  await assertSucceeds(setDoc(reqRef, validRequest(listing, 'org-1')));

  // Other organization cannot withdraw org-1's request
  const org2Db = await approvedOrganization('org-2', 'Second Shelter');
  await assertFails(
    updateDoc(
      doc(org2Db, 'foodListings', 'listing-withdraw', 'requests', 'org-1'),
      {
        status: 'withdrawn',
        updatedAt: serverTimestamp(),
      },
    ),
  );

  // Recipient can withdraw their request
  await assertSucceeds(
    updateDoc(reqRef, {
      status: 'withdrawn',
      updatedAt: serverTimestamp(),
    }),
  );

  const withdrawnData = (await getDoc(reqRef)).data();
  assert.equal(withdrawnData.status, 'withdrawn');

  // Once withdrawn, organization cannot update back to requested or resubmit
  await assertFails(
    updateDoc(reqRef, {
      status: 'requested',
      updatedAt: serverTimestamp(),
    }),
  );
});

test('donor can atomically approve one request; rules enforce single assignment invariant', async () => {
  const donorDb = await approvedDonor();
  const listingRef = doc(donorDb, 'foodListings', 'listing-approval');
  const listing = validListing('donor');
  await setDoc(listingRef, listing);

  const org1Db = await approvedOrganization('org-1', 'First Shelter');
  const org2Db = await approvedOrganization('org-2', 'Second Shelter');

  const req1Ref = doc(
    org1Db,
    'foodListings',
    'listing-approval',
    'requests',
    'org-1',
  );
  const req2Ref = doc(
    org2Db,
    'foodListings',
    'listing-approval',
    'requests',
    'org-2',
  );

  await assertSucceeds(
    setDoc(
      req1Ref,
      validRequest(listing, 'org-1', { organizationName: 'First Shelter' }),
    ),
  );
  await assertSucceeds(
    setDoc(
      req2Ref,
      validRequest(listing, 'org-2', { organizationName: 'Second Shelter' }),
    ),
  );

  // Non-atomic listing update (without request update) fails
  await assertFails(
    updateDoc(listingRef, {
      status: 'assigned',
      acceptedOrganizationUid: 'org-1',
      updatedAt: serverTimestamp(),
    }),
  );

  // Non-atomic request update (without listing update) fails
  await assertFails(
    updateDoc(
      doc(donorDb, 'foodListings', 'listing-approval', 'requests', 'org-1'),
      {
        status: 'approved',
        updatedAt: serverTimestamp(),
      },
    ),
  );

  // Atomic approval transaction succeeds
  await assertSucceeds(
    runTransaction(donorDb, async (tx) => {
      const snapListing = await tx.get(listingRef);
      const snapReq = await tx.get(
        doc(donorDb, 'foodListings', 'listing-approval', 'requests', 'org-1'),
      );
      assert.equal(snapListing.data().status, 'open');
      assert.equal(snapReq.data().status, 'requested');

      tx.update(listingRef, {
        status: 'assigned',
        acceptedOrganizationUid: 'org-1',
        updatedAt: serverTimestamp(),
      });
      tx.update(
        doc(donorDb, 'foodListings', 'listing-approval', 'requests', 'org-1'),
        {
          status: 'approved',
          updatedAt: serverTimestamp(),
        },
      );
    }),
  );

  const assignedListing = (await getDoc(listingRef)).data();
  assert.equal(assignedListing.status, 'assigned');
  assert.equal(assignedListing.acceptedOrganizationUid, 'org-1');

  const approvedReq = (await getDoc(req1Ref)).data();
  assert.equal(approvedReq.status, 'approved');

  // Competing approval of org-2 now fails because listing is no longer open
  await assertFails(
    runTransaction(donorDb, async (tx) => {
      tx.update(listingRef, {
        status: 'assigned',
        acceptedOrganizationUid: 'org-2',
        updatedAt: serverTimestamp(),
      });
      tx.update(
        doc(donorDb, 'foodListings', 'listing-approval', 'requests', 'org-2'),
        {
          status: 'approved',
          updatedAt: serverTimestamp(),
        },
      );
    }),
  );
});

test('request read access: donor lists, recipient reads own and queries collectionGroup', async () => {
  const donorDb = await approvedDonor();
  const listingRef = doc(donorDb, 'foodListings', 'listing-reads');
  const listing = validListing('donor');
  await setDoc(listingRef, listing);

  const org1Db = await approvedOrganization('org-1', 'First Shelter');
  const org2Db = await approvedOrganization('org-2', 'Second Shelter');

  const req1Ref = doc(
    org1Db,
    'foodListings',
    'listing-reads',
    'requests',
    'org-1',
  );
  const req2Ref = doc(
    org2Db,
    'foodListings',
    'listing-reads',
    'requests',
    'org-2',
  );

  await setDoc(
    req1Ref,
    validRequest(listing, 'org-1', { organizationName: 'First Shelter' }),
  );
  await setDoc(
    req2Ref,
    validRequest(listing, 'org-2', { organizationName: 'Second Shelter' }),
  );

  // Owning donor can list requests for their listing
  const donorRequests = await assertSucceeds(
    getDocs(
      query(
        collection(donorDb, 'foodListings', 'listing-reads', 'requests'),
        limit(50),
      ),
    ),
  );
  assert.equal(donorRequests.size, 2);

  // Recipient org-1 can read their own request
  await assertSucceeds(
    getDoc(doc(org1Db, 'foodListings', 'listing-reads', 'requests', 'org-1')),
  );

  // Recipient org-1 CANNOT read org-2's request
  await assertFails(
    getDoc(doc(org1Db, 'foodListings', 'listing-reads', 'requests', 'org-2')),
  );

  // Recipient org-1 CANNOT list all requests under listing
  await assertFails(
    getDocs(
      query(
        collection(org1Db, 'foodListings', 'listing-reads', 'requests'),
        limit(50),
      ),
    ),
  );

  // Recipient org-1 can query collectionGroup requests filtered by their organizationUid
  const orgGroupQuery = query(
    collectionGroup(org1Db, 'requests'),
    where('organizationUid', '==', 'org-1'),
    limit(50),
  );
  const myRequests = await assertSucceeds(getDocs(orgGroupQuery));
  assert.equal(myRequests.size, 1);

  // Recipient org-1 CANNOT query collectionGroup without their own organizationUid
  const allGroupQuery = query(collectionGroup(org1Db, 'requests'), limit(50));
  await assertFails(getDocs(allGroupQuery));

  // Recipient who submitted request can still read parent listing after assignment
  await runTransaction(donorDb, async (tx) => {
    tx.update(listingRef, {
      status: 'assigned',
      acceptedOrganizationUid: 'org-1',
      updatedAt: serverTimestamp(),
    });
    tx.update(
      doc(donorDb, 'foodListings', 'listing-reads', 'requests', 'org-1'),
      {
        status: 'approved',
        updatedAt: serverTimestamp(),
      },
    );
  });

  // Participating org-1 can get listing
  await assertSucceeds(getDoc(doc(org1Db, 'foodListings', 'listing-reads')));

  // Non-participating org-3 cannot get assigned listing
  const org3Db = await approvedOrganization('org-3', 'Third Shelter');
  await assertFails(getDoc(doc(org3Db, 'foodListings', 'listing-reads')));
});

function approvalBatch(db, id, uid) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'foodListings', id), {
    status: 'assigned',
    acceptedOrganizationUid: uid,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'foodListings', id, 'requests', uid), {
    status: 'approved',
    updatedAt: serverTimestamp(),
  });
  return batch;
}
async function requestFixture(id, uids = ['org-1']) {
  const db = await approvedDonor();
  const listing = validListing();
  await setDoc(doc(db, 'foodListings', id), listing);
  for (const uid of uids) {
    const orgDb = await approvedOrganization(uid);
    await setDoc(
      doc(orgDb, 'foodListings', id, 'requests', uid),
      validRequest(listing, uid),
    );
  }
  return db;
}
test('approval rejects revoked verification and suspended recipient accounts', async () => {
  const db = await requestFixture('revoked');
  await review(admin(), 'org-1', 'rejected');
  await assertFails(approvalBatch(db, 'revoked', 'org-1').commit());
  await review(admin(), 'org-1', 'approved');
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'users', 'org-1'), {
      accountStatus: 'suspended',
    });
  });
  await assertFails(approvalBatch(db, 'revoked', 'org-1').commit());
  assert.equal(
    (await getDoc(doc(db, 'foodListings', 'revoked'))).data().status,
    'open',
  );
});
test('concurrent approval transactions assign exactly one organization', async () => {
  const db = await requestFixture('race', ['org-1', 'org-2']);
  const approve = (uid) => {
    const client = applicant('donor');
    return runTransaction(client, async (tx) => {
      const parent = doc(client, 'foodListings', 'race');
      const request = doc(client, 'foodListings', 'race', 'requests', uid);
      const [listing, candidate] = await Promise.all([
        tx.get(parent),
        tx.get(request),
      ]);
      if (
        listing.data().status !== 'open' ||
        candidate.data().status !== 'requested'
      )
        throw new Error('Already assigned');
      tx.update(parent, {
        status: 'assigned',
        acceptedOrganizationUid: uid,
        updatedAt: serverTimestamp(),
      });
      tx.update(request, { status: 'approved', updatedAt: serverTimestamp() });
    });
  };
  const results = await Promise.allSettled(['org-1', 'org-2'].map(approve));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const selected = (await getDoc(doc(db, 'foodListings', 'race'))).data()
    .acceptedOrganizationUid;
  for (const uid of ['org-1', 'org-2']) {
    const request = (
      await getDoc(doc(db, 'foodListings', 'race', 'requests', uid))
    ).data();
    assert.equal(request.status, uid === selected ? 'approved' : 'requested');
  }
});
test('one batch cannot approve two requests or approve a stale pickup proposal', async () => {
  const db = await requestFixture('multiple', ['org-1', 'org-2']);
  const batch = approvalBatch(db, 'multiple', 'org-1');
  batch.update(doc(db, 'foodListings', 'multiple', 'requests', 'org-2'), {
    status: 'approved',
    updatedAt: serverTimestamp(),
  });
  await assertFails(batch.commit());
  // Represent a previously valid proposal whose pickup time has elapsed.
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(
      doc(context.firestore(), 'foodListings', 'multiple', 'requests', 'org-1'),
      { plannedPickupAt: Timestamp.fromMillis(Date.now() - 60_000) },
    );
  });
  await assertFails(approvalBatch(db, 'multiple', 'org-1').commit());
});
test('request history queries require an explicit limit of at most 50 for every role', async () => {
  const donorDb = await requestFixture('bounded');
  const orgDb = applicant('org-1');
  for (const db of [admin(), orgDb]) {
    const group = collectionGroup(db, 'requests');
    const scope = db === orgDb ? [where('organizationUid', '==', 'org-1')] : [];
    await assertFails(getDocs(query(group, ...scope)));
    await assertFails(getDocs(query(group, ...scope, limit(51))));
    const page = await assertSucceeds(
      getDocs(query(group, ...scope, orderBy('createdAt', 'desc'), limit(50))),
    );
    assert.equal(page.size, 1);
  }
  await assertFails(
    getDocs(collection(donorDb, 'foodListings', 'bounded', 'requests')),
  );
  await assertFails(
    getDoc(
      doc(unauthenticated(), 'foodListings', 'bounded', 'requests', 'org-1'),
    ),
  );
});

async function assignedFixture(id, uid = 'org-1') {
  const db = await approvedDonor();
  const listing = validListing('donor');
  await setDoc(doc(db, 'foodListings', id), listing);
  const orgDb = await approvedOrganization(uid);
  await setDoc(
    doc(orgDb, 'foodListings', id, 'requests', uid),
    validRequest(listing, uid),
  );
  await approvalBatch(db, id, uid).commit();
  return { donorDb: db, orgDb };
}

test('assigned recipient confirms pickup handover in pickup window and can retract', async () => {
  const { donorDb, orgDb } = await assignedFixture('handover-1', 'org-1');
  const reqRef = doc(orgDb, 'foodListings', 'handover-1', 'requests', 'org-1');

  // Set pickup window to include current time
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', 'handover-1'), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1800_000),
    });
  });

  // Assigned recipient confirms handover in pickup window -> succeeds
  await assertSucceeds(
    updateDoc(reqRef, {
      recipientConfirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  const snap = await getDoc(reqRef);
  assert.equal(snap.data().status, 'approved');
  assert.ok(snap.data().recipientConfirmedAt instanceof Timestamp);

  // Recipient can retract handover confirmation
  await assertSucceeds(
    updateDoc(reqRef, {
      recipientConfirmedAt: deleteField(),
      updatedAt: serverTimestamp(),
    }),
  );
  const retracted = await getDoc(reqRef);
  assert.equal('recipientConfirmedAt' in retracted.data(), false);

  // Donor cannot set recipientConfirmedAt
  await assertFails(
    updateDoc(doc(donorDb, 'foodListings', 'handover-1', 'requests', 'org-1'), {
      recipientConfirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test('handover confirmation fails before pickup window or by unassigned organization', async () => {
  const { orgDb } = await assignedFixture('future-pickup', 'org-1');
  const reqRef = doc(
    orgDb,
    'foodListings',
    'future-pickup',
    'requests',
    'org-1',
  );

  // Handover confirmation fails before pickup window starts (validListing starts in +1800s)
  await assertFails(
    updateDoc(reqRef, {
      recipientConfirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  // Put into pickup window
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', 'future-pickup'), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1800_000),
    });
  });

  // Other organization cannot set recipientConfirmedAt
  const org2Db = await approvedOrganization('org-2', 'Second Shelter');
  await assertFails(
    updateDoc(
      doc(org2Db, 'foodListings', 'future-pickup', 'requests', 'org-1'),
      {
        recipientConfirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    ),
  );
});

test('atomic collection completes within 5 minutes of recipient confirmation', async () => {
  const { donorDb, orgDb } = await assignedFixture('collect-1', 'org-1');
  const listingRef = doc(donorDb, 'foodListings', 'collect-1');
  const reqRef = doc(orgDb, 'foodListings', 'collect-1', 'requests', 'org-1');

  // Put into pickup window and confirm handover
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', 'collect-1'), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1800_000),
    });
  });
  await assertSucceeds(
    updateDoc(reqRef, {
      recipientConfirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  // Non-atomic listing update fails
  await assertFails(
    updateDoc(listingRef, {
      status: 'collected',
      collectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  // Non-atomic request update fails
  await assertFails(
    updateDoc(doc(donorDb, 'foodListings', 'collect-1', 'requests', 'org-1'), {
      status: 'collected',
      updatedAt: serverTimestamp(),
    }),
  );

  // Atomic collection transaction succeeds
  await assertSucceeds(
    runTransaction(donorDb, async (tx) => {
      tx.update(listingRef, {
        status: 'collected',
        collectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(
        doc(donorDb, 'foodListings', 'collect-1', 'requests', 'org-1'),
        {
          status: 'collected',
          updatedAt: serverTimestamp(),
        },
      );
    }),
  );

  const collectedListing = (await getDoc(listingRef)).data();
  assert.equal(collectedListing.status, 'collected');
  assert.ok(collectedListing.collectedAt instanceof Timestamp);

  const collectedReq = (await getDoc(reqRef)).data();
  assert.equal(collectedReq.status, 'collected');

  // Replay protection: once collected, no further updates allowed
  await assertFails(
    updateDoc(listingRef, {
      status: 'assigned',
      updatedAt: serverTimestamp(),
    }),
  );
});

test('collection fails if confirmation is stale or deadline passed', async () => {
  const { donorDb } = await assignedFixture('stale-collect', 'org-1');
  const listingRef = doc(donorDb, 'foodListings', 'stale-collect');
  const reqRef = doc(
    donorDb,
    'foodListings',
    'stale-collect',
    'requests',
    'org-1',
  );

  // Stale confirmation (> 5 minutes ago)
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', 'stale-collect'), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1800_000),
    });
    await updateDoc(
      doc(
        context.firestore(),
        'foodListings',
        'stale-collect',
        'requests',
        'org-1',
      ),
      {
        recipientConfirmedAt: Timestamp.fromMillis(Date.now() - 360_000), // 6 minutes ago
      },
    );
  });

  await assertFails(
    runTransaction(donorDb, async (tx) => {
      tx.update(listingRef, {
        status: 'collected',
        collectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(reqRef, {
        status: 'collected',
        updatedAt: serverTimestamp(),
      });
    }),
  );

  // Overdue collection (deadline passed)
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', 'stale-collect'), {
      pickupDeadline: Timestamp.fromMillis(Date.now() - 10_000), // deadline elapsed
    });
    await updateDoc(
      doc(
        context.firestore(),
        'foodListings',
        'stale-collect',
        'requests',
        'org-1',
      ),
      {
        recipientConfirmedAt: Timestamp.fromMillis(Date.now() - 60_000), // 1 minute ago
      },
    );
  });

  await assertFails(
    runTransaction(donorDb, async (tx) => {
      tx.update(listingRef, {
        status: 'collected',
        collectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(reqRef, {
        status: 'collected',
        updatedAt: serverTimestamp(),
      });
    }),
  );
});

test('assigned cancellation reopens listing when at least 15 minutes remain', async () => {
  const { donorDb, orgDb } = await assignedFixture('reopen-1', 'org-1');
  const reopenListingRef = doc(donorDb, 'foodListings', 'reopen-1');
  const reopenReqRef = doc(
    donorDb,
    'foodListings',
    'reopen-1',
    'requests',
    'org-1',
  );

  // Recipient cancels assignment with >= 15 min left (validListing has deadline in +7200s)
  await assertSucceeds(
    runTransaction(orgDb, async (tx) => {
      tx.update(doc(orgDb, 'foodListings', 'reopen-1'), {
        status: 'open',
        acceptedOrganizationUid: deleteField(),
        updatedAt: serverTimestamp(),
      });
      tx.update(doc(orgDb, 'foodListings', 'reopen-1', 'requests', 'org-1'), {
        status: 'cancelled',
        recipientConfirmedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }),
  );

  const reopenedData = (await getDoc(reopenListingRef)).data();
  assert.equal(reopenedData.status, 'open');
  assert.equal('acceptedOrganizationUid' in reopenedData, false);

  const cancelledReqData = (await getDoc(reopenReqRef)).data();
  assert.equal(cancelledReqData.status, 'cancelled');
});

test('assigned cancellation closes listing completely when less than 15 minutes remain', async () => {
  const { donorDb, orgDb } = await assignedFixture('close-1', 'org-1');
  const closeListingRef = doc(donorDb, 'foodListings', 'close-1');
  const closeReqRef = doc(
    donorDb,
    'foodListings',
    'close-1',
    'requests',
    'org-1',
  );

  // Set deadline to 10 minutes in the future (< 15 min cutoff)
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', 'close-1'), {
      pickupDeadline: Timestamp.fromMillis(Date.now() + 600_000),
    });
  });

  // Reopening fails when < 15 min left
  await assertFails(
    runTransaction(orgDb, async (tx) => {
      tx.update(doc(orgDb, 'foodListings', 'close-1'), {
        status: 'open',
        acceptedOrganizationUid: deleteField(),
        updatedAt: serverTimestamp(),
      });
      tx.update(doc(orgDb, 'foodListings', 'close-1', 'requests', 'org-1'), {
        status: 'cancelled',
        recipientConfirmedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }),
  );

  // Complete cancellation succeeds when < 15 min left
  await assertSucceeds(
    runTransaction(orgDb, async (tx) => {
      tx.update(doc(orgDb, 'foodListings', 'close-1'), {
        status: 'cancelled',
        acceptedOrganizationUid: deleteField(),
        updatedAt: serverTimestamp(),
      });
      tx.update(doc(orgDb, 'foodListings', 'close-1', 'requests', 'org-1'), {
        status: 'cancelled',
        recipientConfirmedAt: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }),
  );

  const closedListingData = (await getDoc(closeListingRef)).data();
  assert.equal(closedListingData.status, 'cancelled');
});

test('expiry reconciliation marks overdue open and assigned listings as expired', async () => {
  const now = Date.now();
  const donorDb = await approvedDonor();

  // Active open listing cannot be expired before deadline
  const activeListingRef = doc(donorDb, 'foodListings', 'active-expiry');
  await setDoc(
    activeListingRef,
    validListing('donor', {
      pickupDeadline: new Timestamp(Math.floor(now / 1000) + 3600, 0),
    }),
  );
  await assertFails(
    updateDoc(activeListingRef, {
      status: 'expired',
      updatedAt: serverTimestamp(),
    }),
  );

  // Overdue open listing can be expired after deadline
  const overdueOpenRef = doc(donorDb, 'foodListings', 'overdue-open');
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'foodListings', 'overdue-open'),
      validListing('donor', {
        pickupDeadline: Timestamp.fromMillis(now - 10_000),
      }),
    );
  });
  await assertSucceeds(
    updateDoc(overdueOpenRef, {
      status: 'expired',
      updatedAt: serverTimestamp(),
    }),
  );
  assert.equal((await getDoc(overdueOpenRef)).data().status, 'expired');
});

test('expiry reconciliation marks overdue assigned listings and requests as expired', async () => {
  const { donorDb, orgDb } = await assignedFixture('overdue-assigned', 'org-1');
  const now = Date.now();

  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(
      doc(context.firestore(), 'foodListings', 'overdue-assigned'),
      {
        pickupDeadline: Timestamp.fromMillis(now - 10_000),
      },
    );
  });

  const assignedRef = doc(donorDb, 'foodListings', 'overdue-assigned');
  const reqRef = doc(
    donorDb,
    'foodListings',
    'overdue-assigned',
    'requests',
    'org-1',
  );

  // Assigned recipient can reconcile their overdue assignment
  await assertSucceeds(
    runTransaction(orgDb, async (tx) => {
      tx.update(doc(orgDb, 'foodListings', 'overdue-assigned'), {
        status: 'expired',
        acceptedOrganizationUid: deleteField(),
        updatedAt: serverTimestamp(),
      });
      tx.update(
        doc(orgDb, 'foodListings', 'overdue-assigned', 'requests', 'org-1'),
        {
          status: 'expired',
          updatedAt: serverTimestamp(),
        },
      );
    }),
  );

  assert.equal((await getDoc(assignedRef)).data().status, 'expired');
  assert.equal((await getDoc(reqRef)).data().status, 'expired');
});

function pickupTransition(
  db,
  id,
  status,
  uid = 'org-1',
  clearConfirmation = true,
) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'foodListings', id), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === 'collected'
      ? { collectedAt: serverTimestamp() }
      : { acceptedOrganizationUid: deleteField() }),
  });
  batch.update(doc(db, 'foodListings', id, 'requests', uid), {
    status: status === 'open' ? 'cancelled' : status,
    updatedAt: serverTimestamp(),
    ...(status !== 'collected' && clearConfirmation
      ? { recipientConfirmedAt: deleteField() }
      : {}),
  });
  return batch;
}

test('collection rejects future confirmations, early pickup, and revoked recipients', async () => {
  const id = 'collection-guards';
  const { donorDb, orgDb } = await assignedFixture(id);
  const parent = doc(donorDb, 'foodListings', id);
  const request = doc(orgDb, 'foodListings', id, 'requests', 'org-1');
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1_800_000),
    });
    await updateDoc(
      doc(context.firestore(), 'foodListings', id, 'requests', 'org-1'),
      { recipientConfirmedAt: Timestamp.fromMillis(Date.now() + 120_000) },
    );
  });
  await assertFails(pickupTransition(donorDb, id, 'collected').commit());
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() + 600_000),
    });
    await updateDoc(
      doc(context.firestore(), 'foodListings', id, 'requests', 'org-1'),
      { recipientConfirmedAt: Timestamp.now() },
    );
  });
  await assertFails(pickupTransition(donorDb, id, 'collected').commit());
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1_800_000),
    });
  });
  await updateDoc(request, {
    recipientConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await review(admin(), 'org-1', 'rejected');
  await assertFails(pickupTransition(donorDb, id, 'collected').commit());
  await review(admin(), 'org-1', 'approved');
  await assertFails(pickupTransition(admin(), id, 'collected').commit());
  await assertSucceeds(pickupTransition(donorDb, id, 'collected').commit());
  assert.equal((await getDoc(parent)).data().status, 'collected');
});

test('confirmed assignments expire atomically and must clear confirmation', async () => {
  const id = 'expiry-confirmed';
  const { donorDb, orgDb } = await assignedFixture(id);
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1_800_000),
    });
  });
  const request = doc(orgDb, 'foodListings', id, 'requests', 'org-1');
  await updateDoc(request, {
    recipientConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupDeadline: Timestamp.fromMillis(Date.now() - 1000),
    });
  });
  await assertFails(
    pickupTransition(donorDb, id, 'expired', 'org-1', false).commit(),
  );
  await assertSucceeds(pickupTransition(orgDb, id, 'expired').commit());
  assert.equal('recipientConfirmedAt' in (await getDoc(request)).data(), false);
  assert.equal(
    'acceptedOrganizationUid' in
      (await getDoc(doc(donorDb, 'foodListings', id))).data(),
    false,
  );
});

test('donor can close an early assignment but recipient cannot bypass the reopen policy', async () => {
  const id = 'donor-close';
  const { donorDb, orgDb } = await assignedFixture(id);
  await assertFails(pickupTransition(orgDb, id, 'cancelled').commit());
  await assertFails(
    updateDoc(doc(donorDb, 'foodListings', id), {
      status: 'cancelled',
      acceptedOrganizationUid: deleteField(),
      updatedAt: serverTimestamp(),
    }),
  );
  await assertSucceeds(pickupTransition(donorDb, id, 'cancelled').commit());
  assert.equal(
    (await getDoc(doc(orgDb, 'foodListings', id, 'requests', 'org-1'))).data()
      .status,
    'cancelled',
  );
});

test('expiry and cancellation cannot mutate a detached approved request', async () => {
  const id = 'detached';
  const { donorDb } = await assignedFixture(id);
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      status: 'expired',
      acceptedOrganizationUid: deleteField(),
      pickupDeadline: Timestamp.fromMillis(Date.now() - 1000),
    });
  });
  const request = doc(donorDb, 'foodListings', id, 'requests', 'org-1');
  await assertFails(
    updateDoc(request, {
      status: 'expired',
      updatedAt: serverTimestamp(),
      recipientConfirmedAt: deleteField(),
    }),
  );
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      status: 'cancelled',
    });
  });
  await assertFails(
    updateDoc(request, {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
      recipientConfirmedAt: deleteField(),
    }),
  );
});

test('admin can expire an assignment but an unrelated organization cannot', async () => {
  const id = 'admin-expiry';
  const { donorDb } = await assignedFixture(id);
  const other = await approvedOrganization('org-other');
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupDeadline: Timestamp.fromMillis(Date.now() - 1000),
    });
  });
  await assertFails(pickupTransition(other, id, 'expired').commit());
  await assertSucceeds(pickupTransition(admin(), id, 'expired').commit());
  assert.equal(
    (await getDoc(doc(donorDb, 'foodListings', id))).data().status,
    'expired',
  );
});

test('collection and recipient retraction cannot both succeed concurrently', async () => {
  const id = 'collection-race';
  const { donorDb, orgDb } = await assignedFixture(id);
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'foodListings', id), {
      pickupStartsAt: Timestamp.fromMillis(Date.now() - 1_800_000),
    });
  });
  const request = doc(orgDb, 'foodListings', id, 'requests', 'org-1');
  await updateDoc(request, {
    recipientConfirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const results = await Promise.allSettled([
    pickupTransition(donorDb, id, 'collected').commit(),
    updateDoc(request, {
      recipientConfirmedAt: deleteField(),
      updatedAt: serverTimestamp(),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const parent = (await getDoc(doc(donorDb, 'foodListings', id))).data();
  const child = (await getDoc(request)).data();
  if (parent.status === 'collected') assert.equal(child.status, 'collected');
  else {
    assert.equal(parent.status, 'assigned');
    assert.equal('recipientConfirmedAt' in child, false);
  }
});

test('per-profile audit history returns the newest 50 reviews with private pagination', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    for (let i = 0; i < 53; i++)
      batch.set(
        doc(db, 'adminAuditLogs', `history-${String(i).padStart(3, '0')}`),
        {
          targetUid: 'audited-profile',
          adminUid: 'reviewer',
          action: 'review_profile',
          reason: '',
          previousStatus: 'pending',
          newStatus: 'approved',
          createdAt: Timestamp.fromMillis(1_000 + i),
        },
      );
    batch.set(doc(db, 'adminAuditLogs', 'unrelated-profile'), {
      targetUid: 'other',
      createdAt: Timestamp.fromMillis(99_999),
    });
    await batch.commit();
  });
  const db = admin();
  const base = [
    where('targetUid', '==', 'audited-profile'),
    orderBy('createdAt', 'desc'),
  ];
  const first = await assertSucceeds(
    getDocs(query(collection(db, 'adminAuditLogs'), ...base, limit(50))),
  );
  assert.equal(first.size, 50);
  assert.equal(first.docs[0].id, 'history-052');
  assert.equal(first.docs[49].id, 'history-003');
  const second = await assertSucceeds(
    getDocs(
      query(
        collection(db, 'adminAuditLogs'),
        ...base,
        startAfter(first.docs[49]),
        limit(50),
      ),
    ),
  );
  assert.deepEqual(
    second.docs.map((item) => item.id),
    ['history-002', 'history-001', 'history-000'],
  );
  await assertFails(
    getDocs(
      query(
        collection(applicant('audited-profile'), 'adminAuditLogs'),
        ...base,
        limit(50),
      ),
    ),
  );
  await assertFails(
    getDocs(query(collection(db, 'adminAuditLogs'), ...base, limit(51))),
  );
});
