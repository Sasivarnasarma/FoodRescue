import * as Location from 'expo-location';
import { Alert, Linking, Platform } from 'react-native';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
}

export interface CurrentLocationResult {
  coordinates: LocationCoordinates;
  address?: string;
  source: 'gps' | 'manual';
}

/**
 * Shows an alert popup notifying the user that location is disabled or permission denied,
 * with an action button to open device settings.
 */
export function promptLocationNotEnabledAlert(customMessage?: string): void {
  const title = 'Location Not Enabled';
  const message =
    customMessage ||
    'Device location is not enabled or permission was not granted. Please enable location services in your device settings to use your current location.';

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Enable in Settings',
      onPress: () => {
        void Linking.openSettings().catch(() => {});
      },
    },
  ]);
}

/**
 * Checks if location services are enabled on the device.
 * On Android, if disabled, attempts to prompt user via system dialog first.
 */
export async function ensureLocationServicesEnabled(): Promise<boolean> {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    if (enabled) return true;

    if (Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
        const nowEnabled = await Location.hasServicesEnabledAsync();
        if (nowEnabled) return true;
      } catch {
        // User dismissed Android system dialog or unsupported
      }
    }
  } catch {
    // Non-blocking fallback
  }

  promptLocationNotEnabledAlert(
    'Location services are turned off on your device. Please turn on location to use your current location.',
  );
  return false;
}

/**
 * Requests location permission and fetches the device's current GPS position.
 */
export async function getCurrentDeviceLocation(): Promise<LocationCoordinates> {
  const servicesOk = await ensureLocationServicesEnabled();
  if (!servicesOk) {
    throw new Error(
      'Location services are disabled. Turn on device location in Settings or enter coordinates manually.',
    );
  }

  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && !permission.canAskAgain) {
    promptLocationNotEnabledAlert(
      'Location access is blocked. Open device Settings to grant location access.',
    );
    throw new Error(
      'Location access is blocked. Open device Settings or enter coordinates manually.',
    );
  }
  if (!permission.granted) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  const { status } = permission;
  if (status !== 'granted') {
    promptLocationNotEnabledAlert(
      'Location permission was denied. You can enable location in Settings or enter an address manually.',
    );
    throw new Error(
      'Location permission was denied. You can enter an address manually.',
    );
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let location: Location.LocationObject;
  try {
    location = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                'Location timed out. Retry or enter coordinates manually.',
              ),
            ),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

/**
 * Reverse geocodes coordinates to a human-readable address if available.
 */
export async function reverseGeocode(
  coords: LocationCoordinates,
): Promise<string | undefined> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    if (results.length > 0) {
      const item = results[0];
      const parts = [
        item.streetNumber,
        item.street,
        item.city,
        item.region,
        item.postalCode,
      ].filter(Boolean);
      return parts.join(', ');
    }
  } catch {
    // Reverse geocoding failure is non-blocking
  }
  return undefined;
}

/**
 * Calculates straight-line distance in kilometers between two coordinates using the Haversine formula.
 */
export { calculateHaversineDistanceKm } from './listing-helpers';

/**
 * Formats a distance in kilometers for user-friendly display.
 */
export function formatDistance(distanceKm: number | null | undefined): string {
  if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) {
    return 'Distance unavailable';
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}

/**
 * Opens navigation directions to the target coordinates in the device's default maps application.
 */
export async function openMapsNavigation(
  destination: LocationCoordinates,
  destinationName?: string,
): Promise<void> {
  const { latitude, longitude } = destination;
  const label = encodeURIComponent(destinationName ?? 'FoodRescue Pickup');

  const url =
    Platform.OS === 'android'
      ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`
      : Platform.OS === 'ios'
        ? `maps:0,0?q=${label}@${latitude},${longitude}`
        : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  } else {
    await Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    );
  }
}

export {
  calculateRequestDistanceKm,
  calculateDistanceScore,
  formatRequestDistance,
  formatCoordinates,
  getRequestDistanceInfo,
  parseDepartureCoordinates,
  validateDepartureCoordinates,
  isValidCoordinate,
  type DistanceStatus,
  type RequestDistanceInfo,
  type DistanceScoreResult,
} from './departure-location';
