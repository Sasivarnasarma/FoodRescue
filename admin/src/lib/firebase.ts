import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const measurementId: string | undefined =
  import.meta.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();

const config = {
  apiKey: import.meta.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  ...(measurementId && measurementId !== 'replace_me' ? { measurementId } : {}),
};

export const hasFirebaseConfig = [
  config.apiKey,
  config.authDomain,
  config.projectId,
  config.appId,
].every(
  (value) =>
    typeof value === 'string' && value.trim() && value.trim() !== 'replace_me',
);

function getFirebaseApp() {
  if (!hasFirebaseConfig) {
    throw new Error(
      'Set the Firebase client configuration in the repository root .env.',
    );
  }

  return (
    getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp(config)
  );
}

export function getFirebaseClients() {
  const app = getFirebaseApp();
  return { auth: getAuth(app), db: getFirestore(app) };
}

export async function startFirebaseAnalytics() {
  if (!import.meta.env.PROD || !hasFirebaseConfig || !config.measurementId) {
    return;
  }

  const { getAnalytics, isSupported } = await import('firebase/analytics');
  if (await isSupported()) {
    getAnalytics(getFirebaseApp());
  }
}
