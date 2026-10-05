import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseClients } from './firebase';

export type AccountRole = 'provider' | 'organization';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export async function submitProfile(
  role: AccountRole,
  displayName: string,
  name: string,
) {
  const { auth, db } = getFirebaseClients();
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before submitting a profile.');

  const cleanDisplayName = displayName.trim();
  const cleanName = name.trim();
  if (
    !cleanDisplayName ||
    cleanDisplayName.length > 80 ||
    !cleanName ||
    cleanName.length > 120
  ) {
    throw new Error(
      'Enter a display name up to 80 characters and a profile name up to 120 characters.',
    );
  }

  const userRef = doc(db, 'users', uid);
  const profileRef = doc(db, 'profiles', uid);
  await runTransaction(db, async (transaction) => {
    const user = await transaction.get(userRef);
    const profile = await transaction.get(profileRef);
    if (
      user.exists() &&
      (user.data().role !== role || user.data().accountStatus !== 'active')
    ) {
      throw new Error('This account cannot submit a profile for that role.');
    }
    if (profile.exists()) {
      if (profile.data().type !== role)
        throw new Error('A profile already exists for a different role.');
      return;
    }
    if (!user.exists()) {
      transaction.set(userRef, {
        role,
        accountStatus: 'active',
        displayName: cleanDisplayName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    transaction.set(profileRef, {
      name: cleanName,
      type: role,
      verificationStatus: 'pending',
    });
  });
}

export function watchVerification(
  onChange: (status: VerificationStatus | null, fromCache: boolean) => void,
  onError: (error: Error) => void,
) {
  const { auth, db } = getFirebaseClients();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before checking verification.');
  return onSnapshot(
    doc(db, 'profiles', uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      onChange(
        snapshot.data()?.verificationStatus ?? null,
        snapshot.metadata.fromCache,
      );
    },
    onError,
  );
}
