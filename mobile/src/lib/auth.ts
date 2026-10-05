import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseClients } from './firebase';

export function createAccount(email: string, password: string) {
  return createUserWithEmailAndPassword(
    getFirebaseClients().auth,
    email.trim(),
    password,
  );
}

export function signInAccount(email: string, password: string) {
  return signInWithEmailAndPassword(
    getFirebaseClients().auth,
    email.trim(),
    password,
  );
}

export function signOutAccount() {
  return signOut(getFirebaseClients().auth);
}

export function watchSession(onChange: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseClients().auth, onChange);
}
