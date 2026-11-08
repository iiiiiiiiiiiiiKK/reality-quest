import { describe, expect, it } from 'vitest';
import { poiToQuest, normalizePois, poiCacheKey, navigationUrl, proximityScore } from '../lib/services';
import type { PoiFact } from '../lib/types';
import { RADIUS_BY_DIFFICULTY } from '../lib/levels';

const park: PoiFact = {
  osmType: 'way',
  osmId: 12345,
  lat: 31.2304,
  lng: 121.4737,
  name: 'Fuxing Park',
  category: 'nature',
  tags: { leisure: 'park', name: 'Fuxing Park' },
};

describe('normalizePois', () => {
  it('drops unnamed and coordinate-less features', () => {
    const out = normalizePois([
      { type: 'node', id: 1, lat: 1, lon: 1, tags: {} },
      { type: 'node', id: 2, tags: { name: 'No coords' } },
      { type: 'way', id: 3, center: { lat: 2, lon: 2 }, tags: { name: 'Has center' } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Has center');
    expect(out[0]!.osmType).toBe('way');
  });

  it('deduplicates identical OSM identities', () => {
    const dup = { type: 'node' as const, id: 7, lat: 1, lon: 1, tags: { name: 'A' } };
    expect(normalizePois([dup, dup])).toHaveLength(1);
  });

  it('classifies features into quest categories', () => {
    const out = normalizePois([
      { type: 'node', id: 10, lat: 0, lon: 0, tags: { name: 'Museum', tourism: 'museum' } },
      { type: 'node', id: 11, lat: 0, lon: 0, tags: { name: 'Park', leisure: 'park' } },
      { type: 'node', id: 12, lat: 0, lon: 0, tags: { name: 'Mural', tourism: 'artwork' } },
      { type: 'node', id: 13, lat: 0, lon: 0, tags: { name: 'Square', place: 'square' } },
    ]);
    expect(out.map((p) => p.category)).toEqual(['culture', 'nature', 'photo', 'city']);
  });

  it('rejects non-finite coordinates', () => {
    const out = normalizePois([{ type: 'node', id: 20, lat: Number.NaN, lon: 0, tags: { name: 'X' } }]);
    expect(out).toHaveLength(0);
  });
});

describe('poiToQuest', () => {
  it('is deterministic for the same OSM id', () => {
    const a = poiToQuest(park);
    const b = poiToQuest({ ...park });
    expect(a.difficulty).toBe(b.difficulty);
    expect(a.xp).toBe(b.xp);
    expect(a.id).toBe(b.id);
  });

  it('keeps the real coordinate and provenance', () => {
    const q = poiToQuest(park);
    expect(q.lat).toBe(park.lat);
    expect(q.lng).toBe(park.lng);
    expect(q.source).toBe('osm');
    expect(q.osmId).toBe(park.osmId);
    expect(q.sourceUrl).toContain('openstreetmap.org');
  });

  it('derives radius and XP from the difficulty', () => {
    const q = poiToQuest(park);
    expect(q.radius).toBe(RADIUS_BY_DIFFICULTY[q.difficulty]);
    expect(q.xp).toBeGreaterThan(0);
  });

  it('embeds the place name into both languages', () => {
    const q = poiToQuest(park);
    expect(q.title.zh).toContain(park.name);
    expect(q.title.en).toContain(park.name);
  });

  it('requires a photo only for photo quests', () => {
    expect(poiToQuest({ ...park, category: 'photo' }).requiresPhoto).toBe(true);
    expect(poiToQuest(park).requiresPhoto).toBe(false);
  });
});

describe('poiCacheKey', () => {
  it('buckets nearby coordinates together', () => {
    const a = poiCacheKey(31.2304, 121.4737, 1500);
    const b = poiCacheKey(31.2309, 121.4741, 1500);
    expect(a).toBe(b);
  });
  it('separates distinct areas', () => {
    expect(poiCacheKey(31.23, 121.47, 1500)).not.toBe(poiCacheKey(39.9, 116.4, 1500));
  });
});

describe('navigationUrl', () => {
  it('includes the exact destination', () => {
    expect(navigationUrl(31.2304, 121.4737)).toBe(
      'https://www.openstreetmap.org/directions?to=31.230400%2C121.473700',
    );
  });
});

describe('proximityScore', () => {
  it('is smaller for a closer quest', () => {
    const near = { ...poiToQuest(park) };
    const far = { ...near, lat: 31.3, lng: 121.4737, id: 'far' };
    const origin = { lat: park.lat, lng: park.lng };
    expect(proximityScore(origin, near)).toBeLessThan(proximityScore(origin, far));
  });
});
