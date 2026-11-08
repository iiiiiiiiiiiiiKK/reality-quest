import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, computeStats, longestStreak, newlyUnlocked } from '../lib/achievements';
import type { Completion, QuestCategory } from '../lib/types';

const DAY = 86_400_000;

function completion(opts: {
  id?: string;
  category?: QuestCategory;
  difficulty?: Completion['quest']['difficulty'];
  at?: number;
  hasPhoto?: boolean;
  locality?: string;
  placeName?: string;
}): Completion {
  const at = opts.at ?? Date.now();
  return {
    id: opts.id ?? `c-${Math.random().toString(36).slice(2)}`,
    questId: opts.id ?? `q-${Math.random().toString(36).slice(2)}`,
    quest: {
      title: { zh: 't', en: 't' },
      category: opts.category ?? 'city',
      difficulty: opts.difficulty ?? 'normal',
      lat: 0,
      lng: 0,
      placeName: opts.placeName,
      source: 'osm',
    },
    completedAt: at,
    location: { lat: 0, lng: 0, accuracy: 10, timestamp: at },
    distanceMeters: 5,
    xpAwarded: 50,
    hasPhoto: opts.hasPhoto ?? false,
    isPublic: false,
    locality: opts.locality,
  };
}

describe('computeStats', () => {
  it('counts by category and photos', () => {
    const stats = computeStats(
      [
        completion({ id: 'a', category: 'city', hasPhoto: true }),
        completion({ id: 'b', category: 'city' }),
        completion({ id: 'c', category: 'nature', placeName: 'Park A' }),
        completion({ id: 'd', category: 'culture', difficulty: 'epic' }),
      ],
      3,
      12.5,
    );
    expect(stats.totalCompletions).toBe(4);
    expect(stats.byCategory.city).toBe(2);
    expect(stats.byCategory.nature).toBe(1);
    expect(stats.photoCount).toBe(1);
    expect(stats.distinctParks).toBe(1);
    expect(stats.epicCompletions).toBe(1);
    expect(stats.trailKm).toBe(12.5);
    expect(stats.level).toBe(3);
  });

  it('counts distinct localities case-insensitively', () => {
    const stats = computeStats(
      [completion({ locality: 'Shanghai' }), completion({ locality: 'shanghai' }), completion({ locality: 'Hangzhou' })],
      1,
      0,
    );
    expect(stats.distinctLocalities).toBe(2);
  });

  it('detects night completions', () => {
    const night = new Date();
    night.setHours(23, 30, 0, 0);
    const stats = computeStats([completion({ at: night.getTime() })], 1, 0);
    expect(stats.nightCompletions).toBe(1);
  });
});

describe('longestStreak', () => {
  it('is 0 with no completions', () => {
    expect(longestStreak([])).toBe(0);
  });

  it('counts consecutive calendar days', () => {
    const base = new Date(2025, 0, 1, 12).getTime();
    const rows = [0, 1, 2, 5].map((d) => completion({ id: `s${d}`, at: base + d * DAY }));
    expect(longestStreak(rows)).toBe(3);
  });

  it('handles duplicate days', () => {
    const base = new Date(2025, 0, 1, 9).getTime();
    const rows = [0, 0, 1].map((d, i) => completion({ id: `d${i}`, at: base + d * DAY }));
    expect(longestStreak(rows)).toBe(2);
  });
});

describe('badge unlocking', () => {
  it('never unlocks anything from an empty history', () => {
    const stats = computeStats([], 1, 0);
    expect(newlyUnlocked(stats, new Set())).toHaveLength(0);
  });

  it('unlocks FIRST STEP after one completion only', () => {
    const stats = computeStats([completion({ id: 'one' })], 1, 0);
    const ids = newlyUnlocked(stats, new Set()).map((b) => b.id);
    expect(ids).toContain('first_step');
    expect(ids).not.toContain('city_walker');
  });

  it('does not re-unlock an already stored badge', () => {
    const stats = computeStats([completion({ id: 'one' })], 1, 0);
    expect(newlyUnlocked(stats, new Set(['first_step']))).toHaveLength(0);
  });

  it('unlocks CITY WALKER at exactly 10 city quests', () => {
    const rows = Array.from({ length: 10 }, (_, i) => completion({ id: `cw${i}`, category: 'city' }));
    const nine = Array.from({ length: 9 }, (_, i) => completion({ id: `cw${i}`, category: 'city' }));
    expect(newlyUnlocked(computeStats(nine, 5, 0), new Set(['first_step'])).map((b) => b.id)).not.toContain('city_walker');
    expect(newlyUnlocked(computeStats(rows, 5, 0), new Set(['first_step'])).map((b) => b.id)).toContain('city_walker');
  });

  it('defines a stable, unique badge catalogue', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(10);
    for (const badge of ACHIEVEMENTS) {
      expect(badge.name.en.length).toBeGreaterThan(0);
      expect(badge.name.zh.length).toBeGreaterThan(0);
      expect(badge.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
