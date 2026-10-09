/**
 * Straight-line distance between two points, in kilometres.
 *
 * Discovery (Step 5) uses PostGIS for the heavy spatial work. Recommendations
 * only ever rank a short candidate list that has already been narrowed by the
 * database, so doing the arithmetic here keeps the query simple and the
 * ranking logic testable without a database.
 */
const EARTH_RADIUS_KM = 6371;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
