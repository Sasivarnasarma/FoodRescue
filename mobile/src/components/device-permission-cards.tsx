import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  type DevicePermission,
  useDevicePermission,
} from '@/hooks/use-device-permission';

const details = {
  location: {
    title: 'Location',
    purpose: 'Find nearby donations while using FoodRescue.',
    fallback:
      'You can enter a pickup location manually when location access is unavailable.',
  },
  camera: {
    title: 'Camera',
    purpose: 'Photograph a donation or scan a pickup QR code.',
    fallback: 'You can skip the photo or enter the pickup reference manually.',
  },
};

function PermissionCard({ kind }: { kind: DevicePermission }) {
  const { permission, busy, error, request, openSettings } =
    useDevicePermission(kind);
  const { title, purpose, fallback } = details[kind];
  const blocked = permission?.status === 'denied' && !permission.canAskAgain;

  let status = 'Checking access…';
  if (permission?.granted) status = 'Allowed';
  else if (blocked) status = 'Blocked in Settings';
  else if (permission?.status === 'denied') status = 'Denied';
  else if (permission) status = 'Not requested';
  else if (error) status = 'Unavailable';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText themeColor="textSecondary">{purpose}</ThemedText>
      <ThemedText accessibilityLiveRegion="polite">{status}</ThemedText>
      {!permission?.granted && (
        <ThemedText themeColor="textSecondary">{fallback}</ThemedText>
      )}
      {error ? (
        <ThemedText accessibilityRole="alert">{error}</ThemedText>
      ) : null}
      {!permission?.granted &&
        (permission || error ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={() => void (blocked ? openSettings() : request())}
            style={({ pressed }) => [styles.action, pressed && styles.muted]}
          >
            <ThemedText type="link">
              {busy
                ? 'Waiting for permission…'
                : blocked
                  ? 'Open Settings'
                  : `Allow ${kind}`}
            </ThemedText>
          </Pressable>
        ) : (
          <ActivityIndicator
            accessibilityLabel={`Checking ${kind} permission`}
          />
        ))}
    </ThemedView>
  );
}

export function DevicePermissionCards() {
  if (Platform.OS === 'web') {
    return (
      <ThemedText>Check device permissions in the Android app.</ThemedText>
    );
  }

  return (
    <View style={styles.cards}>
      <PermissionCard kind="location" />
      <PermissionCard kind="camera" />
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: Spacing.three },
  card: {
    borderRadius: Spacing.three,
    gap: Spacing.one,
    padding: Spacing.three,
  },
  action: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48 },
  muted: { opacity: 0.6 },
});
