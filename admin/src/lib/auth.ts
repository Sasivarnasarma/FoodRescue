import { signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFirebaseClients } from './firebase';

export async function signInAdmin(
  email: string,
  password: string,
): Promise<User> {
  const { auth } = getFirebaseClients();
  const { user } = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) {
    await signOut(auth);
    throw new Error('This account does not have administrator access.');
  }
  return user;
}

export function signOutAdmin() {
  return signOut(getFirebaseClients().auth);
}
