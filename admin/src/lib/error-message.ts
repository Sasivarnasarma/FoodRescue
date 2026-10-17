import { FirebaseError } from 'firebase/app';

export function firebaseErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : fallback;
  }

  switch (error.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a moment and try again.';
    case 'auth/network-request-failed':
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Could not reach Firebase. Check your connection and try again.';
    case 'permission-denied':
      return 'Administrator access is required. Check your access and sign in again.';
    default:
      return fallback;
  }
}
