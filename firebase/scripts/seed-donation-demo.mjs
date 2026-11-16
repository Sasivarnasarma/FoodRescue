import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import {
  donationFixtures,
  competingRequestFixtures,
} from './demo-fixtures.mjs';
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error(
    'Start the Auth and Firestore emulators first. This script only seeds demo-foodrescue.',
  );
initializeApp({ projectId: 'demo-foodrescue' });
const db = getFirestore();
const auth = getAuth();
for (const [uid, role] of [
  ['demo-donor', 'provider'],
  ['demo-organization', 'organization'],
  ['demo-competing-org-1', 'organization'],
  ['demo-competing-org-2', 'organization'],
]) {
  try {
    await auth.getUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid,
      email: `${uid}@example.invalid`,
      password: 'DemoFoodRescue123!',
    });
  }
  await db.doc(`users/${uid}`).set({
    role,
    accountStatus: 'active',
    displayName: `Synthetic ${uid}`,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await db.doc(`profiles/${uid}`).set({
    type: role,
    name:
      uid === 'demo-competing-org-1'
        ? 'Synthetic Hope Kitchen'
        : uid === 'demo-competing-org-2'
          ? 'Synthetic Care Foundation'
          : `Synthetic ${uid}`,
    verificationStatus: 'approved',
  });
}
const fixtures = donationFixtures();
for (const fixture of fixtures)
  await db.doc(`foodListings/${fixture.id}`).set({
    providerUid: 'demo-donor',
    providerName: 'Synthetic demo-donor',
    title: fixture.title,
    description: 'Synthetic demonstration food. No real donation.',
    category: fixture.category,
    quantity: 5,
    unit: 'pack',
    storageRequirement: fixture.storage,
    storageInstructions: 'Synthetic storage details',
    allergenDeclaration: 'unknown',
    allergenInfo: '',
    pickupAddress: 'Synthetic demonstration pickup location',
    pickupLocation: new GeoPoint(fixture.latitude, fixture.longitude),
    pickupStartsAt: Timestamp.fromMillis(fixture.starts),
    pickupDeadline: Timestamp.fromMillis(fixture.deadline),
    status: 'open',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

const urgentNear = fixtures.find((f) => f.id === 'demo-urgent-near');
if (urgentNear) {
  for (const req of competingRequestFixtures(
    urgentNear.id,
    urgentNear.deadline,
  )) {
    await db
      .doc(`foodListings/${urgentNear.id}/requests/${req.organizationUid}`)
      .set({
        organizationUid: req.organizationUid,
        providerUid: req.providerUid,
        organizationName: req.organizationName,
        departureLocation: new GeoPoint(req.latitude, req.longitude),
        plannedPickupAt: Timestamp.fromMillis(req.plannedPickupAt),
        canMeetStorageRequirement: req.canMeetStorageRequirement,
        status: req.status,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
  }
}
console.log(
  'Seeded 4 synthetic accounts, 4 demo listings, and 2 competing requests in the emulators.',
);
