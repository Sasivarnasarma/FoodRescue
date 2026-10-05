import { getApps, initializeApp } from 'firebase/app';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = [
  config.apiKey,
  config.authDomain,
  config.projectId,
  config.appId,
].every((value) => value?.trim() && value.trim() !== 'replace_me');

export function getFirebaseClients() {
  if (!hasFirebaseConfig) {
    throw new Error(
      'Set the Firebase client configuration in the repository root .env.',
    );
  }

  const existingApp = getApps().find(({ name }) => name === '[DEFAULT]');
  const app = existingApp ?? initializeApp(config);
  const auth =
    existingApp || Platform.OS === 'web'
      ? getAuth(app)
      : initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });

  return { auth, db: getFirestore(app) };
}
