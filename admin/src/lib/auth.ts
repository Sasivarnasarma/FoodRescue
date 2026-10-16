import {
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseErrorMessage } from './error-message';
import { getFirebaseClients } from './firebase';

export type AdminSession =
  | { status: 'signed-out' | 'denied' }
  | { status: 'admin'; user: User }
  | { status: 'error'; message: string };

export function watchAdminSession(onChange: (session: AdminSession) => void) {
  let revision = 0;

  try {
    const unsubscribe = onIdTokenChanged(getFirebaseClients().auth, (user) => {
      const current = ++revision;
      if (!user) {
        onChange({ status: 'signed-out' });
        return;
      }

      void user
        .getIdTokenResult()
        .then(({ claims }) => {
          if (current !== revision) return;
          onChange(
            claims.admin === true
              ? { status: 'admin', user }
              : { status: 'denied' },
          );
        })
        .catch((cause: unknown) => {
          if (current === revision) {
            onChange({
              status: 'error',
              message: firebaseErrorMessage(
                cause,
                'Could not check administrator access.',
              ),
            });
          }
        });
    });

    return () => {
      revision++;
      unsubscribe();
    };
  } catch (cause) {
    onChange({
      status: 'error',
      message: firebaseErrorMessage(
        cause,
        'Could not start Firebase Authentication.',
      ),
    });
  }
}

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

  try {
    const token = await user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      throw new Error('This account does not have administrator access.');
    }
  } catch (cause) {
    if (auth.currentUser === user) await signOut(auth);
    throw cause;
  }

  return user;
}

export function signOutAdmin() {
  return signOut(getFirebaseClients().auth);
}
