import { initializeApp } from 'firebase-admin/app';
import { getFirestore, GeoPoint, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { donationFixtures } from './demo-fixtures.mjs';
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
    name: `Synthetic ${uid}`,
    verificationStatus: 'approved',
  });
}
for (const fixture of donationFixtures())
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
console.log(
  'Seeded 2 synthetic accounts and 4 demo listings in the emulators.',
);
