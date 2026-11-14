export interface Coordinates {
  latitude: number;
  longitude: number;
}
export function parseCoordinates(
  latitude: string,
  longitude: string,
): Coordinates {
  if (!latitude.trim() || !longitude.trim())
    throw new Error('Enter latitude and longitude.');
  const lat = Number(latitude),
    lon = Number(longitude);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    throw new Error(
      'Latitude must be between -90 and 90, and longitude between -180 and 180.',
    );
  return { latitude: lat, longitude: lon };
}
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
export function getBase64ByteLength(base64: string): number {
  return (
    Math.floor((base64.length * 3) / 4) -
    (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)
  );
}
export function compareDonations(
  a: { id: string; deadline: number; distance: number | null },
  b: { id: string; deadline: number; distance: number | null },
): number {
  return (
    a.deadline - b.deadline ||
    (a.distance ?? Infinity) - (b.distance ?? Infinity) ||
    a.id.localeCompare(b.id)
  );
}
