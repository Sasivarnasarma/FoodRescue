import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

let app;
let auth;
let adminApp;

before(() => {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host?.startsWith('127.0.0.1:')) {
    throw new Error('Run this test against the local Auth emulator only.');
  }
  app = initializeApp({ apiKey: 'demo-api-key', projectId: 'demo-foodrescue' });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
  adminApp = initializeAdminApp({ projectId: 'demo-foodrescue' });
});

after(async () => {
  await Promise.all([deleteApp(app), deleteAdminApp(adminApp)]);
});

test('email/password sign-in, rejection and admin token refresh', async () => {
  const email = `demo-${Date.now()}@example.invalid`;
  const password = 'SyntheticPassword123!';
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  assert.equal((await user.getIdTokenResult()).claims.admin, undefined);
  await signOut(auth);
  assert.equal(auth.currentUser, null);
  await assert.rejects(
    signInWithEmailAndPassword(auth, email, 'wrong-password'),
  );
  const signedIn = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(signedIn.user.uid, user.uid);
  const adminAuth = getAdminAuth(adminApp);
  await adminAuth.setCustomUserClaims(user.uid, { demo: true, admin: true });
  const claims = (await signedIn.user.getIdTokenResult(true)).claims;
  assert.equal(claims.admin, true);
  assert.equal(claims.demo, true);
  await adminAuth.deleteUser(user.uid);
});
