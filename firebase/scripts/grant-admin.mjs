import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [projectId, uid, ...extra] = process.argv.slice(2);
if (
  !projectId ||
  !uid ||
  extra.length ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST
) {
  throw new Error(
    'Usage: pnpm admin:grant <project-id> <existing-auth-uid> (cloud only)',
  );
}

const app = initializeApp({ credential: applicationDefault(), projectId });
try {
  const auth = getAuth(app);
  const user = await auth.getUser(uid);
  if (user.disabled)
    throw new Error('Cannot grant admin to a disabled account.');
  if (user.customClaims?.admin !== true) {
    await auth.setCustomUserClaims(uid, { ...user.customClaims, admin: true });
  }
  if ((await auth.getUser(uid)).customClaims?.admin !== true) {
    throw new Error('Could not verify the admin claim.');
  }
  console.log(
    'Admin claim verified. Sign out and back in to refresh the token.',
  );
} finally {
  await deleteApp(app);
}
