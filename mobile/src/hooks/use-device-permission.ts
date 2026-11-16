import { Camera } from 'expo-camera';
import {
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
} from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';

const permissionApis = {
  location: {
    read: getForegroundPermissionsAsync,
    request: requestForegroundPermissionsAsync,
  },
  camera: {
    read: Camera.getCameraPermissionsAsync,
    request: Camera.requestCameraPermissionsAsync,
  },
};

export type DevicePermission = keyof typeof permissionApis;

type PermissionResponse = Awaited<
  ReturnType<typeof getForegroundPermissionsAsync>
>;

export function useDevicePermission(kind: DevicePermission) {
  const api = permissionApis[kind];
  const [permission, setPermission] = useState<PermissionResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requesting = useRef(false);

  useEffect(() => {
    let active = true;
    let readVersion = 0;

    async function refresh() {
      const version = ++readVersion;
      try {
        const result = await api.read();
        if (active && version === readVersion && !requesting.current) {
          setPermission(result);
          setError('');
        }
      } catch {
        if (active && version === readVersion && !requesting.current) {
          setError('Permission status is unavailable. Try again.');
        }
      }
    }

    void refresh();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });

    return () => {
      active = false;
      listener.remove();
    };
  }, [api]);

  async function request() {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setError('');

    try {
      const current = await api.read();
      setPermission(current);
      if (!current.granted && current.canAskAgain) {
        setPermission(await api.request());
      }
    } catch {
      setError('Could not request permission. Try again.');
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  }

  async function openSettings() {
    if (requesting.current) return;
    requesting.current = true;
    setBusy(true);
    setError('');
    try {
      // Recheck before sending someone to Settings: access may already have
      // changed while the app was in the background.
      const current = await api.read();
      setPermission(current);
      if (!current.granted) {
        if (current.canAskAgain) setPermission(await api.request());
        else await Linking.openSettings();
      }
    } catch {
      setError(
        'Open the Settings app and update FoodRescue permissions there.',
      );
    } finally {
      requesting.current = false;
      setBusy(false);
    }
  }

  return { permission, busy, error, request, openSettings };
}
