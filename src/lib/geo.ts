/**
 * Geodesy helpers. Pure functions, no DOM access, fully unit-tested.
 */

export interface LatLngLiteral {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

/** Haversine great-circle distance in metres. */
export function haversineMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(p: { lat?: unknown; lng?: unknown } | null | undefined): boolean {
  if (!p) return false;
  const { lat, lng } = p;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function formatDistance(meters: number, lang: 'zh' | 'en'): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) {
    const m = Math.round(meters);
    return lang === 'zh' ? `${m} 米` : `${m} m`;
  }
  const km = meters / 1000;
  const rounded = km < 10 ? km.toFixed(1) : Math.round(km).toString();
  return lang === 'zh' ? `${rounded} 公里` : `${rounded} km`;
}

/** Metres → "walking minutes" estimate at ~4.5 km/h. */
export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round((meters / 1000 / 4.5) * 60));
}

/**
 * Check-in verdict.
 *
 * Accuracy-aware on purpose: a reading whose accuracy circle does not fit
 * inside the quest radius cannot prove arrival, and is reported as
 * `low-accuracy` rather than a success (anti-false-positive rule).
 */
export type CheckInVerdict =
  | { ok: true; distance: number }
  | { ok: false; distance: number; reason: 'too-far' | 'low-accuracy' };

export const MAX_ACCEPTED_ACCURACY_M = 200;

export function evaluateCheckIn(
  target: LatLngLiteral,
  fix: LatLngLiteral & { accuracy: number },
  radius: number,
): CheckInVerdict {
  const distance = haversineMeters(target, fix);
  const accuracy = Number.isFinite(fix.accuracy) ? Math.max(0, fix.accuracy) : Infinity;

  if (accuracy > MAX_ACCEPTED_ACCURACY_M) {
    return { ok: false, distance, reason: 'low-accuracy' };
  }
  // Require the whole accuracy circle inside the radius. This stops a 150 m
  // reading from "verifying" a 50 m epic quest.
  if (distance + accuracy > radius) {
    if (distance > radius) return { ok: false, distance, reason: 'too-far' };
    return { ok: false, distance, reason: 'low-accuracy' };
  }
  return { ok: true, distance };
}

/** Distance travelled between two fixes, ignoring teleports above `maxJump`. */
export function trailIncrement(
  prev: LatLngLiteral | null,
  next: LatLngLiteral,
  maxJumpMeters = 5000,
): number {
  if (!prev) return 0;
  const d = haversineMeters(prev, next);
  return d <= maxJumpMeters ? d : 0;
}

export function boundingBox(points: LatLngLiteral[], paddingKm = 1) {
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const padLat = paddingKm / 111;
  const padLng = paddingKm / 85;
  return {
    minLat: Math.min(...lats) - padLat,
    maxLat: Math.max(...lats) + padLat,
    minLng: Math.min(...lngs) - padLng,
    maxLng: Math.max(...lngs) + padLng,
  };
}
