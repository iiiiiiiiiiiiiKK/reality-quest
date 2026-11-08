/**
 * Badge catalogue.
 *
 * Every badge is a *pure predicate over verified completion records*, so a
 * badge can never be unlocked by tapping it, and it is fully recomputable after
 * an import or a record deletion.
 */

import type { AchievementDef, AchievementStats, Completion, QuestCategory } from './types';

const emptyByCategory = (): Record<QuestCategory, number> => ({
  city: 0,
  nature: 0,
  culture: 0,
  photo: 0,
  random: 0,
});

export function computeStats(
  completions: Completion[],
  level: number,
  trailKm: number,
): AchievementStats {
  const byCategory = emptyByCategory();
  const localities = new Set<string>();
  const parks = new Set<string>();
  let photos = 0;
  let night = 0;
  let weekend = 0;
  let epic = 0;

  for (const c of completions) {
    byCategory[c.quest.category] = (byCategory[c.quest.category] ?? 0) + 1;
    if (c.hasPhoto) photos += 1;
    if (c.locality) localities.add(c.locality.trim().toLowerCase());
    if (c.quest.category === 'nature' && c.quest.placeName) {
      parks.add(c.quest.placeName.trim().toLowerCase());
    }
    if (c.quest.difficulty === 'epic') epic += 1;
    const d = new Date(c.completedAt);
    const hour = d.getHours();
    if (hour >= 21 || hour < 5) night += 1;
    const day = d.getDay();
    if (day === 0 || day === 6) weekend += 1;
  }

  return {
    totalCompletions: completions.length,
    byCategory,
    photoCount: photos,
    distinctParks: parks.size,
    trailKm,
    nightCompletions: night,
    weekendCompletions: weekend,
    distinctLocalities: localities.size,
    level,
    epicCompletions: epic,
    longestStreakDays: longestStreak(completions),
  };
}

const DAY_MS = 86_400_000;

export function longestStreak(completions: Completion[]): number {
  const days = Array.from(
    new Set(
      completions.map((c) => {
        const d = new Date(c.completedAt);
        return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
      }),
    ),
  ).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev: number | undefined;
  for (const day of days) {
    run = prev !== undefined && day - prev === 1 ? run + 1 : 1;
    prev = day;
    if (run > best) best = run;
  }
  return best;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_step',
    name: { zh: '第一步', en: 'FIRST STEP' },
    description: { zh: '完成第一个探索任务', en: 'Complete your first quest' },
    glyph: '◈',
    accent: '#f5b942',
    check: (s) => s.totalCompletions >= 1,
    progress: (s) => ({ current: Math.min(s.totalCompletions, 1), target: 1 }),
  },
  {
    id: 'city_walker',
    name: { zh: '城市漫步者', en: 'CITY WALKER' },
    description: { zh: '完成 10 个城市探索任务', en: 'Complete 10 city quests' },
    glyph: '▦',
    accent: '#4fa8ff',
    check: (s) => s.byCategory.city >= 10,
    progress: (s) => ({ current: s.byCategory.city, target: 10 }),
  },
  {
    id: 'night_explorer',
    name: { zh: '夜间探索者', en: 'NIGHT EXPLORER' },
    description: { zh: '在 21:00 之后或 05:00 之前完成 3 个任务', en: 'Complete 3 quests after 21:00 or before 05:00' },
    glyph: '☾',
    accent: '#8b7bff',
    check: (s) => s.nightCompletions >= 3,
    progress: (s) => ({ current: s.nightCompletions, target: 3 }),
  },
  {
    id: 'photo_hunter',
    name: { zh: '摄影猎人', en: 'PHOTO HUNTER' },
    description: { zh: '提交 10 张探索照片', en: 'Submit 10 exploration photos' },
    glyph: '◉',
    accent: '#ff7a5c',
    check: (s) => s.photoCount >= 10,
    progress: (s) => ({ current: s.photoCount, target: 10 }),
  },
  {
    id: 'park_lover',
    name: { zh: '公园爱好者', en: 'PARK LOVER' },
    description: { zh: '探索 5 个不同的自然地点', en: 'Explore 5 different natural places' },
    glyph: '❧',
    accent: '#52d19d',
    check: (s) => s.distinctParks >= 5,
    progress: (s) => ({ current: s.distinctParks, target: 5 }),
  },
  {
    id: 'distance_master',
    name: { zh: '里程大师', en: 'DISTANCE MASTER' },
    description: { zh: '累计探索足迹达到 50 公里', en: 'Accumulate 50 km of verified trail' },
    glyph: '➤',
    accent: '#ffb03a',
    check: (s) => s.trailKm >= 50,
    progress: (s) => ({ current: Math.floor(s.trailKm), target: 50 }),
  },
  {
    id: 'weekend_adventurer',
    name: { zh: '周末冒险家', en: 'WEEKEND ADVENTURER' },
    description: { zh: '在周末完成 4 个任务', en: 'Complete 4 quests on weekends' },
    glyph: '☼',
    accent: '#ffd166',
    check: (s) => s.weekendCompletions >= 4,
    progress: (s) => ({ current: s.weekendCompletions, target: 4 }),
  },
  {
    id: 'culture_seeker',
    name: { zh: '文化探寻者', en: 'CULTURE SEEKER' },
    description: { zh: '完成 5 个文化探索任务', en: 'Complete 5 culture quests' },
    glyph: '❖',
    accent: '#c084fc',
    check: (s) => s.byCategory.culture >= 5,
    progress: (s) => ({ current: s.byCategory.culture, target: 5 }),
  },
  {
    id: 'cartographer',
    name: { zh: '制图师', en: 'CARTOGRAPHER' },
    description: { zh: '在 3 个不同的城市或地区留下足迹', en: 'Leave footprints in 3 different localities' },
    glyph: '⌘',
    accent: '#38bdf8',
    check: (s) => s.distinctLocalities >= 3,
    progress: (s) => ({ current: s.distinctLocalities, target: 3 }),
  },
  {
    id: 'epic_legend',
    name: { zh: '史诗传说', en: 'EPIC LEGEND' },
    description: { zh: '完成 3 个史诗难度任务', en: 'Complete 3 epic quests' },
    glyph: '★',
    accent: '#f43f5e',
    check: (s) => s.epicCompletions >= 3,
    progress: (s) => ({ current: s.epicCompletions, target: 3 }),
  },
  {
    id: 'streak_three',
    name: { zh: '连续探索', en: 'STREAK KEEPER' },
    description: { zh: '连续 3 天完成探索任务', en: 'Complete quests on 3 consecutive days' },
    glyph: '⟡',
    accent: '#22d3ee',
    check: (s) => s.longestStreakDays >= 3,
    progress: (s) => ({ current: s.longestStreakDays, target: 3 }),
  },
  {
    id: 'level_five',
    name: { zh: '城市探险家', en: 'URBAN ADVENTURER' },
    description: { zh: '达到 Lv.5', en: 'Reach level 5' },
    glyph: '⬢',
    accent: '#a3e635',
    check: (s) => s.level >= 5,
    progress: (s) => ({ current: Math.min(s.level, 5), target: 5 }),
  },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Returns the badges that are newly satisfied and not yet stored. */
export function newlyUnlocked(stats: AchievementStats, unlockedIds: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !unlockedIds.has(a.id) && a.check(stats));
}
