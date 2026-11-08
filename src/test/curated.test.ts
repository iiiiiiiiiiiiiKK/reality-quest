import { describe, expect, it } from 'vitest';
import { CURATED_PLACES, CURATED_CITIES, curatedToQuest, nearestCurated, nearestCuratedCity } from '../lib/curated';
import { isValidLatLng } from '../lib/geo';
import { RADIUS_BY_DIFFICULTY, xpForDifficulty } from '../lib/levels';

describe('curated landmark catalogue', () => {
  it('has a meaningful number of real places', () => {
    expect(CURATED_PLACES.length).toBeGreaterThan(50);
  });

  it('every coordinate is a valid WGS84 point', () => {
    for (const place of CURATED_PLACES) {
      expect(isValidLatLng(place), place.id).toBe(true);
      expect(place.lat).not.toBe(0);
      expect(place.lng).not.toBe(0);
    }
  });

  it('has unique ids', () => {
    const ids = CURATED_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has bilingual names and hooks for every place', () => {
    for (const place of CURATED_PLACES) {
      expect(place.nameZh.length, place.id).toBeGreaterThan(0);
      expect(place.nameEn.length, place.id).toBeGreaterThan(0);
      expect(place.hookZh.length, place.id).toBeGreaterThan(10);
      expect(place.hookEn.length, place.id).toBeGreaterThan(10);
      expect(place.cityZh.length, place.id).toBeGreaterThan(0);
      expect(place.cityEn.length, place.id).toBeGreaterThan(0);
    }
  });

  it('exposes at least 10 distinct cities', () => {
    expect(CURATED_CITIES.length).toBeGreaterThanOrEqual(10);
  });
});

describe('curatedToQuest', () => {
  it('builds a deterministic, provenance-carrying quest', () => {
    const place = CURATED_PLACES[0]!;
    const a = curatedToQuest(place);
    const b = curatedToQuest(place);
    expect(a.id).toBe(b.id);
    expect(a.id.startsWith('curated-')).toBe(true);
    expect(a.source).toBe('curated');
    expect(a.lat).toBe(place.lat);
    expect(a.lng).toBe(place.lng);
    expect(a.radius).toBe(RADIUS_BY_DIFFICULTY[place.difficulty]);
    expect(a.xp).toBe(xpForDifficulty(place.difficulty));
    expect(a.sourceUrl).toContain('openstreetmap.org');
  });

  it('embeds the real place name in both languages', () => {
    const place = CURATED_PLACES[0]!;
    const q = curatedToQuest(place);
    expect(q.title.zh).toContain(place.nameZh);
    expect(q.title.en).toContain(place.nameEn);
  });

  it('requires a photo only for photo quests', () => {
    for (const place of CURATED_PLACES) {
      expect(curatedToQuest(place).requiresPhoto).toBe(place.category === 'photo');
    }
  });
});

describe('nearestCurated', () => {
  it('finds Shanghai landmarks from central Shanghai', () => {
    const near = nearestCurated(31.2304, 121.4737, 40, 10);
    expect(near.length).toBeGreaterThan(0);
    expect(near[0]!.cityEn).toBe('Shanghai');
  });

  it('sorts by real distance', () => {
    const near = nearestCurated(51.5007, -0.1246, 60, 20); // London
    expect(near[0]!.cityEn).toBe('London');
  });

  it('returns nothing in an area with no curated landmark', () => {
    // Middle of the South Pacific — deliberately uncurated.
    expect(nearestCurated(-40, -140, 500, 10)).toHaveLength(0);
  });

  it('respects the limit', () => {
    expect(nearestCurated(31.2304, 121.4737, 25_000, 3)).toHaveLength(3);
  });
});

describe('nearestCuratedCity', () => {
  it('identifies the nearest curated city', () => {
    expect(nearestCuratedCity(48.8566, 2.3522)?.cityEn).toBe('Paris');
    expect(nearestCuratedCity(35.6762, 139.6503)?.cityEn).toBe('Tokyo');
  });
});
