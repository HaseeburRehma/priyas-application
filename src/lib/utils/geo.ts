/**
 * Great-circle distance between two lat/long pairs, in metres.
 * Haversine formula — fine for distances under a few thousand km.
 */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Extra slack for a poor GPS fix, capped so a wild reading can't open the fence. */
export const MAX_ACCURACY_SLACK_M = 100;

/**
 * How far from the property a check-in may be before staff must confirm
 * they are on site: the property's radius plus the fix's own accuracy
 * (capped). Indoors a phone often reports ±50–80 m, which on its own
 * would push an honest cleaner outside a 100 m fence.
 */
export function geofenceLimitMeters(
  radiusM: number | null | undefined,
  accuracyM: number | null | undefined,
): number {
  const radius = Number.isFinite(radiusM) && (radiusM as number) > 0 ? (radiusM as number) : 100;
  const slack =
    Number.isFinite(accuracyM) && (accuracyM as number) > 0
      ? Math.min(accuracyM as number, MAX_ACCURACY_SLACK_M)
      : 0;
  return radius + slack;
}
