import type AsyncStorage from '@react-native-async-storage/async-storage';
import 'firebase/auth';
import type { Persistence } from 'firebase/auth';

// Firebase exports this helper at runtime through its React Native entry point,
// but firebase/auth's top-level declarations do not include that export.
declare module 'firebase/auth' {
  export function getReactNativePersistence(
    storage: typeof AsyncStorage,
  ): Persistence;
}
