export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type DistanceStatus =
  'available' | 'missing_departure' | 'missing_pickup' | 'invalid_coordinates';

export interface RequestDistanceInfo {
  status: DistanceStatus;
  isAvailable: boolean;
  distanceKm: number | null;
  formattedDistance: string;
  explanation: string;
  distanceScore: number | null;
}

export interface DistanceScoreResult {
  score: number | null;
  isAvailable: boolean;
  reason?: string;
}

/**
 * Calculates straight-line distance in kilometers between two coordinates using the Haversine formula.
 */
export function calculateHaversineDistanceKm(
  from: Coordinates,
  to: Coordinates,
): number {
  const rad = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(rad(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(rad(from.latitude)) *
      Math.cos(rad(to.latitude)) *
      Math.sin(rad(to.longitude - from.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/**
 * Validates whether latitude and longitude are valid numeric geographic coordinates.
 */
export function isValidCoordinate(
  latitude: unknown,
  longitude: unknown,
): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Validates departure coordinates. Because departure point is optional,
 * null or undefined is valid. If provided, coordinates must be finite and within range.
 */
export function validateDepartureCoordinates(coords?: Coordinates | null): {
  valid: boolean;
  error?: string;
} {
  if (coords === null || coords === undefined) {
    return { valid: true };
  }
  if (!isValidCoordinate(coords.latitude, coords.longitude)) {
    return {
      valid: false,
      error:
        'Departure coordinates must have latitude between -90 and 90, and longitude between -180 and 180.',
    };
  }
  return { valid: true };
}

/**
 * Parses and strictly validates manual departure coordinates from text fields.
 */
export function parseDepartureCoordinates(
  latitudeStr: string,
  longitudeStr: string,
): Coordinates {
  const latTrim = latitudeStr.trim();
  const lonTrim = longitudeStr.trim();
  if (!latTrim && !lonTrim) {
    throw new Error('Enter latitude and longitude for the departure point.');
  }
  if (!latTrim || !lonTrim) {
    throw new Error(
      'Enter both latitude and longitude for the departure point.',
    );
  }

  const lat = Number(latTrim);
  const lon = Number(lonTrim);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('Latitude and longitude must be valid numbers.');
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error(
      'Latitude must be between -90 and 90, and longitude between -180 and 180.',
    );
  }

  return { latitude: lat, longitude: lon };
}

/**
 * Calculates straight-line distance in kilometers between the recipient's proposed
 * departure point and the listing pickup location.
 * Returns null if either location is missing or invalid.
 */
export function calculateRequestDistanceKm(
  departureLocation?: Coordinates | null,
  pickupLocation?: Coordinates | null,
): number | null {
  if (!departureLocation || !pickupLocation) {
    return null;
  }
  if (
    !isValidCoordinate(
      departureLocation.latitude,
      departureLocation.longitude,
    ) ||
    !isValidCoordinate(pickupLocation.latitude, pickupLocation.longitude)
  ) {
    return null;
  }

  return calculateHaversineDistanceKm(departureLocation, pickupLocation);
}

/**
 * Formats a distance value for user-facing display.
 * If distance is null or undefined, returns a helpful explanation string.
 */
export function formatRequestDistance(
  distanceKm: number | null | undefined,
  fallbackReason?: string,
): string {
  if (
    distanceKm === null ||
    distanceKm === undefined ||
    !Number.isFinite(distanceKm)
  ) {
    return fallbackReason
      ? `Distance unavailable (${fallbackReason})`
      : 'Distance unavailable';
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Computes the distance score based on Section 2 of docs/08_SMART_MATCHING_ENGINE.md:
 * distanceScore = 100 * clamp(1 - distanceKm / 10, 0, 1)
 *
 * If distance is unavailable (null/undefined/NaN), returns null score with isAvailable: false
 * so the recommendation engine and donor UI can flag it for manual review.
 */
export function calculateDistanceScore(
  distanceKm: number | null | undefined,
): DistanceScoreResult {
  if (
    distanceKm === null ||
    distanceKm === undefined ||
    !Number.isFinite(distanceKm)
  ) {
    return {
      score: null,
      isAvailable: false,
      reason: 'Departure point or pickup location is missing',
    };
  }

  // 10 km normalizes the score to 0; closer is higher
  const normalized = Math.min(1, Math.max(0, 1 - distanceKm / 10));
  const score = Math.round(100 * normalized * 10) / 10;

  return {
    score,
    isAvailable: true,
  };
}

/**
 * Evaluates the departure and pickup coordinates to provide comprehensive
 * distance, formatting, score, and explanation of availability.
 */
export function getRequestDistanceInfo(
  departureLocation?: Coordinates | null,
  pickupLocation?: Coordinates | null,
): RequestDistanceInfo {
  // Check for missing departure point
  if (!departureLocation) {
    return {
      status: 'missing_departure',
      isAvailable: false,
      distanceKm: null,
      formattedDistance: 'Distance unavailable',
      explanation: 'No departure point provided by recipient',
      distanceScore: null,
    };
  }

  // Check for invalid departure coordinates
  if (
    !isValidCoordinate(departureLocation.latitude, departureLocation.longitude)
  ) {
    return {
      status: 'invalid_coordinates',
      isAvailable: false,
      distanceKm: null,
      formattedDistance: 'Distance unavailable',
      explanation: 'Departure coordinates are invalid or out of range',
      distanceScore: null,
    };
  }

  // Check for missing pickup location
  if (!pickupLocation) {
    return {
      status: 'missing_pickup',
      isAvailable: false,
      distanceKm: null,
      formattedDistance: 'Distance unavailable',
      explanation: 'Donation listing does not specify a pickup location',
      distanceScore: null,
    };
  }

  // Check for invalid pickup coordinates
  if (!isValidCoordinate(pickupLocation.latitude, pickupLocation.longitude)) {
    return {
      status: 'invalid_coordinates',
      isAvailable: false,
      distanceKm: null,
      formattedDistance: 'Distance unavailable',
      explanation: 'Listing pickup coordinates are invalid',
      distanceScore: null,
    };
  }

  const distanceKm = calculateHaversineDistanceKm(
    departureLocation,
    pickupLocation,
  );
  const formatted = formatRequestDistance(distanceKm);
  const { score } = calculateDistanceScore(distanceKm);

  return {
    status: 'available',
    isAvailable: true,
    distanceKm,
    formattedDistance: formatted,
    explanation: `${formatted} from proposed departure point`,
    distanceScore: score,
  };
}

/**
 * Formats coordinates for readable display, e.g. "6.92710, 79.86120".
 */
export function formatCoordinates(coords?: Coordinates | null): string {
  if (!coords) return 'None';
  return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}
