/**
 * Reality Quest — core data model.
 *
 * Everything below is stored locally in IndexedDB (see `lib/db.ts`).
 * The shape is versioned by `DB_VERSION` and migrated in `runMigrations()`
 * so a future release can upgrade users without losing data.
 */

export type Lang = 'zh' | 'en';
export type Theme = 'dark' | 'light';

export type QuestCategory = 'city' | 'nature' | 'culture' | 'photo' | 'random';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'epic';

/**
 * Where a quest comes from:
 * - `osm`       — a real OpenStreetMap place, converted into a quest at runtime.
 * - `curated`   — a hand-curated real landmark with a fixed, verifiable coordinate.
 * - `community` — created by the user on this device (local only, never presented
 *                 as being visible to other people).
 */
export type QuestSource = 'osm' | 'curated' | 'community';

export type QuestState = 'locked' | 'available' | 'active' | 'completed';

export interface LocalizedText {
  zh: string;
  en: string;
}

export interface Quest {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  category: QuestCategory;
  /** Target coordinate (WGS84). Always a real place for `osm`/`curated`. */
  lat: number;
  lng: number;
  /** Suggested check-in radius in metres. */
  radius: number;
  difficulty: Difficulty;
  xp: number;
  estimatedMinutes: number;
  requiresPhoto: boolean;
  source: QuestSource;
  creator: string;
  createdAt: number;
  isPublic: boolean;
  /** Human readable place name from the data source (OSM tag / landmark name). */
  placeName?: string;
  /** Provenance for OSM-derived quests. */
  osmType?: string;
  osmId?: number;
  sourceUrl?: string;
  /** Minimum explorer level required before the quest unlocks. */
  minLevel?: number;
}

export interface QuestProgress {
  questId: string;
  state: 'active' | 'abandoned';
  startedAt: number;
  lastCheckedAt?: number;
}

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface QuestSnapshot {
  title: LocalizedText;
  category: QuestCategory;
  difficulty: Difficulty;
  lat: number;
  lng: number;
  placeName?: string;
  source: QuestSource;
}

/** One and only one completion may ever exist per quest (idempotent rewards). */
export interface Completion {
  id: string;
  questId: string;
  quest: QuestSnapshot;
  completedAt: number;
  /** The user's *actual* verified position — never the quest coordinate. */
  location: GeoFix;
  distanceMeters: number;
  xpAwarded: number;
  hasPhoto: boolean;
  text?: string;
  photoId?: string;
  isPublic: boolean;
  /** Best-effort reverse-geocoded locality, used for "cities explored". */
  locality?: string;
}

export interface PhotoRecord {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  createdAt: number;
}

export interface AchievementDef {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  /** Short glyph used inside the badge medallion. */
  glyph: string;
  /** Accent colour (hex) used for the unlocked medallion. */
  accent: string;
  /** Hidden badges show only a silhouette until unlocked. */
  hidden?: boolean;
  check: (s: AchievementStats) => boolean;
  progress?: (s: AchievementStats) => { current: number; target: number };
}

export interface UserAchievement {
  id: string;
  unlockedAt: number;
}

export interface AchievementStats {
  totalCompletions: number;
  byCategory: Record<QuestCategory, number>;
  photoCount: number;
  distinctParks: number;
  trailKm: number;
  nightCompletions: number;
  weekendCompletions: number;
  distinctLocalities: number;
  level: number;
  epicCompletions: number;
  longestStreakDays: number;
}

export interface LevelUpEvent {
  level: number;
  at: number;
}

export interface UserProfile {
  id: 'me';
  displayName: string;
  createdAt: number;
  xp: number;
  level: number;
  levelHistory: LevelUpEvent[];
}

export interface UserSettings {
  lang: Lang;
  theme: Theme;
  onboarded: boolean;
  /** Ask for the photo on completion. */
  autoLocate: boolean;
  /** Opt-in: publish my exploration records on the public feed (this device). */
  shareRecords: boolean;
  lastMapCenter?: { lat: number; lng: number; zoom: number };
  lastLocation?: GeoFix;
}

export interface PoiCacheEntry {
  key: string;
  fetchedAt: number;
  facts: PoiFact[];
}

/** A real nearby place returned by Overpass. */
export interface PoiFact {
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  lat: number;
  lng: number;
  name: string;
  category: QuestCategory;
  tags: Record<string, string>;
}

export interface GeoCacheEntry {
  key: string;
  fetchedAt: number;
  locality: string;
  displayName?: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  lang: 'zh',
  theme: 'dark',
  onboarded: false,
  autoLocate: true,
  shareRecords: false,
};

export const EMPTY_PROFILE: UserProfile = {
  id: 'me',
  displayName: 'Explorer',
  createdAt: 0,
  xp: 0,
  level: 1,
  levelHistory: [],
};
