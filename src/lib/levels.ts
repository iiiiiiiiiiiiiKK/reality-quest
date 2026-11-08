/**
 * Level curve and reward rules.
 *
 * Rewards are keyed to difficulty and rounded through `xpForDifficulty` so the
 * game rules live in exactly one place (used by the UI *and* by the completion
 * transaction that writes the completion record).
 */

import type { Difficulty, QuestCategory } from './types';

export interface LevelDef {
  level: number;
  /** Total XP required to reach this level. */
  minXp: number;
  name: { zh: string; en: string };
}

export const LEVELS: LevelDef[] = [
  { level: 1, minXp: 0, name: { zh: '新手探索者', en: 'Novice Explorer' } },
  { level: 2, minXp: 100, name: { zh: '街区漫游者', en: 'Block Roamer' } },
  { level: 3, minXp: 250, name: { zh: '城市发现者', en: 'City Discoverer' } },
  { level: 4, minXp: 500, name: { zh: '地图猎人', en: 'Map Hunter' } },
  { level: 5, minXp: 900, name: { zh: '城市探险家', en: 'Urban Adventurer' } },
  { level: 6, minXp: 1500, name: { zh: '世界漫游者', en: 'World Wanderer' } },
  { level: 7, minXp: 2400, name: { zh: '传奇探索者', en: 'Legendary Explorer' } },
];

export const MAX_LEVEL = LEVELS[LEVELS.length - 1]!.level;

export function levelForXp(xp: number): LevelDef {
  let current = LEVELS[0]!;
  for (const def of LEVELS) {
    if (xp >= def.minXp) current = def;
  }
  return current;
}

export function nextLevel(level: number): LevelDef | undefined {
  return LEVELS.find((l) => l.level === level + 1);
}

export function levelProgress(xp: number): {
  level: LevelDef;
  next?: LevelDef;
  current: number;
  target: number;
  ratio: number;
} {
  const level = levelForXp(xp);
  const next = nextLevel(level.level);
  const span = next ? next.minXp - level.minXp : 1;
  const current = xp - level.minXp;
  return {
    level,
    next,
    current,
    target: span,
    ratio: next ? Math.min(1, Math.max(0, current / span)) : 1,
  };
}

export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 20,
  normal: 50,
  hard: 100,
  epic: 200,
};

export function xpForDifficulty(difficulty: Difficulty): number {
  return XP_BY_DIFFICULTY[difficulty];
}

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'epic'];

/** Default check-in radius per difficulty, in metres. */
export const RADIUS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 120,
  normal: 100,
  hard: 50,
  epic: 40,
};

export const CATEGORY_XP_BONUS: Record<QuestCategory, number> = {
  city: 0,
  nature: 5,
  culture: 5,
  photo: 0,
  random: 10,
};

export const DIFFICULTY_LABEL: Record<Difficulty, { zh: string; en: string }> = {
  easy: { zh: '简单', en: 'Easy' },
  normal: { zh: '普通', en: 'Normal' },
  hard: { zh: '困难', en: 'Hard' },
  epic: { zh: '史诗', en: 'Epic' },
};

export const CATEGORY_LABEL: Record<QuestCategory, { zh: string; en: string }> = {
  city: { zh: '城市探索', en: 'City' },
  nature: { zh: '自然探索', en: 'Nature' },
  culture: { zh: '文化探索', en: 'Culture' },
  photo: { zh: '摄影挑战', en: 'Photo' },
  random: { zh: '随机探索', en: 'Random' },
};
