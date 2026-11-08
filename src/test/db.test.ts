import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllData,
  commitCompletion,
  deleteCompletion,
  exportBundle,
  importBundle,
  loadCompletions,
  loadProfile,
  validateBundle,
} from '../lib/db';
import { levelForXp } from '../lib/levels';
import type { Completion, Quest } from '../lib/types';

const quest: Quest = {
  id: 'osm-node-1',
  title: { zh: '探索测试公园', en: 'Explore Test Park' },
  description: { zh: '测试描述', en: 'Test description' },
  category: 'nature',
  lat: 31.2304,
  lng: 121.4737,
  radius: 100,
  difficulty: 'normal',
  xp: 50,
  estimatedMinutes: 18,
  requiresPhoto: false,
  source: 'osm',
  creator: 'OpenStreetMap',
  createdAt: 0,
  isPublic: true,
  placeName: 'Test Park',
  osmType: 'node',
  osmId: 1,
};

function completionFor(questId: string, xp: number, at = Date.now()): Completion {
  return {
    id: `c-${questId}-${at}`,
    questId,
    quest: {
      title: quest.title,
      category: quest.category,
      difficulty: quest.difficulty,
      lat: quest.lat,
      lng: quest.lng,
      placeName: quest.placeName,
      source: quest.source,
    },
    completedAt: at,
    location: { lat: 31.23048, lng: 121.47371, accuracy: 9, timestamp: at },
    distanceMeters: 6,
    xpAwarded: xp,
    hasPhoto: false,
    isPublic: false,
  };
}

describe('completion idempotency', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('awards XP exactly once for the same quest', async () => {
    const first = await commitCompletion(completionFor(quest.id, 50), 50, levelForXp(50).level, false);
    expect(first.alreadyDone).toBe(false);
    expect(first.profile.xp).toBe(50);

    const second = await commitCompletion(
      completionFor(quest.id, 50, Date.now() + 1000),
      50,
      levelForXp(100).level,
      true,
    );
    expect(second.alreadyDone).toBe(true);
    expect(second.profile.xp).toBe(50);

    const all = await loadCompletions();
    expect(all).toHaveLength(1);
  });

  it('counts separate quests separately', async () => {
    await commitCompletion(completionFor(quest.id, 50), 50, 2, true);
    await commitCompletion(completionFor('osm-node-2', 20), 20, 2, false);
    const profile = await loadProfile();
    expect(profile.xp).toBe(70);
    expect((await loadCompletions())).toHaveLength(2);
  });

  it('removing a record also removes its XP', async () => {
    const c = completionFor(quest.id, 100);
    await commitCompletion(c, 100, 3, true);
    expect((await loadProfile()).xp).toBe(100);

    const removed = await deleteCompletion(c.id);
    expect(removed?.id).toBe(c.id);
    expect((await loadProfile()).xp).toBe(0);
    expect(await loadCompletions()).toHaveLength(0);
  });
});

describe('export / import', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('round-trips a bundle', async () => {
    await commitCompletion(completionFor(quest.id, 50), 50, 2, true);
    const bundle = await exportBundle();
    expect(bundle.schema).toBe('reality-quest-export');
    expect(bundle.completions).toHaveLength(1);

    const parsed = JSON.parse(JSON.stringify(bundle)) as unknown;
    const summary = await importBundle(parsed);
    // Already present → everything is skipped, nothing duplicated.
    expect(summary.completions).toBe(0);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(await loadCompletions()).toHaveLength(1);
  });

  it('imports into an empty database', async () => {
    await commitCompletion(completionFor(quest.id, 50), 50, 2, true);
    const bundle = await exportBundle();
    const snapshot = JSON.parse(JSON.stringify(bundle)) as unknown;

    await clearAllData();
    const summary = await importBundle(snapshot);
    expect(summary.completions).toBe(1);
    expect((await loadProfile()).xp).toBe(50);
  });

  it('rejects a bundle with the wrong schema without touching data', async () => {
    await commitCompletion(completionFor(quest.id, 50), 50, 2, true);
    await expect(importBundle({ schema: 'something-else', version: 1, quests: [], completions: [] })).rejects.toThrow();
    expect(await loadCompletions()).toHaveLength(1);
  });

  it('rejects completions with an invalid coordinate', () => {
    const bad = {
      schema: 'reality-quest-export',
      version: 2,
      exportedAt: Date.now(),
      quests: [],
      completions: [
        {
          id: 'x',
          questId: 'q',
          quest: { title: { zh: 'a', en: 'a' }, category: 'city', difficulty: 'easy', lat: 0, lng: 0, source: 'osm' },
          completedAt: Date.now(),
          location: { lat: 'nope', lng: 0, accuracy: 5, timestamp: 0 },
          distanceMeters: 1,
          xpAwarded: 20,
          hasPhoto: false,
          isPublic: false,
        },
      ],
    };
    expect(() => validateBundle(bad)).toThrow();
  });

  it('rejects a non-image photo payload', () => {
    const bad = {
      schema: 'reality-quest-export',
      version: 2,
      exportedAt: Date.now(),
      quests: [],
      completions: [],
      photos: [{ id: 'p', mime: 'image/png', dataUrl: 'data:text/html,<script>', createdAt: 0 }],
    };
    expect(() => validateBundle(bad)).toThrow();
  });
});
