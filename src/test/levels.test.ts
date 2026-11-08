import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  MAX_LEVEL,
  RADIUS_BY_DIFFICULTY,
  XP_BY_DIFFICULTY,
  levelForXp,
  levelProgress,
  nextLevel,
  xpForDifficulty,
} from '../lib/levels';

describe('level curve', () => {
  it('is monotonically increasing', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.minXp).toBeGreaterThan(LEVELS[i - 1]!.minXp);
    }
  });

  it('starts at level 1 with 0 XP', () => {
    expect(levelForXp(0).level).toBe(1);
  });

  it('clamps negative XP to level 1', () => {
    expect(levelForXp(-500).level).toBe(1);
  });

  it('promotes exactly at the threshold', () => {
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(250).level).toBe(3);
  });

  it('caps at the maximum level', () => {
    expect(levelForXp(9_999_999).level).toBe(MAX_LEVEL);
  });

  it('reports no next level at max', () => {
    expect(nextLevel(MAX_LEVEL)).toBeUndefined();
  });

  it('computes progress inside the current band', () => {
    const p = levelProgress(175); // between 100 (Lv2) and 250 (Lv3)
    expect(p.level.level).toBe(2);
    expect(p.next?.level).toBe(3);
    expect(p.current).toBe(75);
    expect(p.target).toBe(150);
    expect(p.ratio).toBeCloseTo(0.5, 5);
  });

  it('reports full progress at max level', () => {
    expect(levelProgress(99_999).ratio).toBe(1);
  });
});

describe('rewards', () => {
  it('matches the spec XP table', () => {
    expect(XP_BY_DIFFICULTY.easy).toBe(20);
    expect(XP_BY_DIFFICULTY.normal).toBe(50);
    expect(XP_BY_DIFFICULTY.hard).toBe(100);
    expect(XP_BY_DIFFICULTY.epic).toBe(200);
    expect(xpForDifficulty('hard')).toBe(100);
  });

  it('shrinks the radius as difficulty rises', () => {
    expect(RADIUS_BY_DIFFICULTY.easy).toBeGreaterThan(RADIUS_BY_DIFFICULTY.normal);
    expect(RADIUS_BY_DIFFICULTY.normal).toBeGreaterThan(RADIUS_BY_DIFFICULTY.hard);
    expect(RADIUS_BY_DIFFICULTY.hard).toBeGreaterThanOrEqual(RADIUS_BY_DIFFICULTY.epic);
  });
});
