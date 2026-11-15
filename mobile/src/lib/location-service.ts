import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

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
 * Requests location permission and fetches the device's current GPS position.
 */
export async function getCurrentDeviceLocation(): Promise<LocationCoordinates> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && !permission.canAskAgain)
    throw new Error(
      'Location access is blocked. Open device Settings or enter coordinates manually.',
    );
  if (!permission.granted)
    permission = await Location.requestForegroundPermissionsAsync();
  const { status } = permission;
  if (status !== 'granted') {
    throw new Error(
      'Location permission was denied. You can enter an address manually.',
    );
  }

  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('Turn on device location or enter coordinates manually.');
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
