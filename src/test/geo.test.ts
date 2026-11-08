import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  evaluateCheckIn,
  formatDistance,
  haversineMeters,
  isValidLatLng,
  trailIncrement,
  walkMinutes,
} from '../lib/geo';

describe('haversineMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineMeters({ lat: 31.23, lng: 121.47 }, { lat: 31.23, lng: 121.47 })).toBeCloseTo(0, 6);
  });

  it('matches the known Shanghai–Beijing great-circle distance', () => {
    // Real-world reference: ~1067 km.
    const d = haversineMeters({ lat: 31.2304, lng: 121.4737 }, { lat: 39.9042, lng: 116.4074 });
    expect(d / 1000).toBeGreaterThan(1050);
    expect(d / 1000).toBeLessThan(1090);
  });

  it('measures a short hop in metres', () => {
    // 0.001 deg latitude ≈ 111 m.
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it('is symmetric', () => {
    const a = { lat: 48.8584, lng: 2.2945 };
    const b = { lat: 51.5007, lng: -0.1246 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe('evaluateCheckIn', () => {
  const target = { lat: 31.2304, lng: 121.4737 };

  it('accepts a precise fix well inside the radius', () => {
    const verdict = evaluateCheckIn(target, { ...target, accuracy: 8 }, 100);
    expect(verdict.ok).toBe(true);
  });

  it('rejects a fix that is clearly too far away', () => {
    const verdict = evaluateCheckIn(target, { lat: 31.2404, lng: 121.4737, accuracy: 10 }, 100);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('too-far');
  });

  it('rejects a fix whose accuracy circle overflows the radius', () => {
    // Inside the radius, but ±150 m accuracy on a 50 m epic quest.
    const verdict = evaluateCheckIn(target, { ...target, accuracy: 150 }, 50);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('low-accuracy');
  });

  it('rejects any reading above the absolute accuracy ceiling', () => {
    const verdict = evaluateCheckIn(target, { ...target, accuracy: 901 }, 5000);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe('low-accuracy');
  });

  it('treats a non-finite accuracy as unusable rather than perfect', () => {
    const verdict = evaluateCheckIn(target, { ...target, accuracy: Number.NaN }, 100);
    expect(verdict.ok).toBe(false);
  });
});

describe('formatDistance', () => {
  it('uses metres below 1 km', () => {
    expect(formatDistance(48, 'zh')).toBe('48 米');
    expect(formatDistance(48, 'en')).toBe('48 m');
  });

  it('uses kilometres above 1 km', () => {
    expect(formatDistance(1240, 'en')).toBe('1.2 km');
    expect(formatDistance(1240, 'zh')).toBe('1.2 公里');
  });

  it('rounds big distances without decimals', () => {
    expect(formatDistance(54_300, 'en')).toBe('54 km');
  });

  it('handles junk input', () => {
    expect(formatDistance(Number.NaN, 'en')).toBe('—');
    expect(formatDistance(-1, 'en')).toBe('—');
  });
});

describe('walkMinutes', () => {
  it('never returns zero', () => {
    expect(walkMinutes(0)).toBe(1);
  });
  it('estimates ~13 min for 1 km at 4.5 km/h', () => {
    expect(walkMinutes(1000)).toBe(13);
  });
});

describe('trailIncrement', () => {
  it('returns 0 without a previous fix', () => {
    expect(trailIncrement(null, { lat: 0, lng: 0 })).toBe(0);
  });
  it('accumulates a plausible step', () => {
    expect(trailIncrement({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 })).toBeGreaterThan(110);
  });
  it('discards teleports larger than the jump limit', () => {
    expect(trailIncrement({ lat: 0, lng: 0 }, { lat: 10, lng: 10 })).toBe(0);
  });
});

describe('isValidLatLng', () => {
  it('accepts valid coordinates', () => {
    expect(isValidLatLng({ lat: 31.2, lng: 121.4 })).toBe(true);
  });
  it('rejects out-of-range and non-numeric input', () => {
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidLatLng({ lat: '0', lng: 0 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });
});

describe('boundingBox', () => {
  it('returns undefined for an empty set', () => {
    expect(boundingBox([])).toBeUndefined();
  });
  it('pads the box outward', () => {
    const box = boundingBox([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }], 1);
    expect(box!.minLat).toBeLessThan(1);
    expect(box!.maxLat).toBeGreaterThan(2);
  });
});
