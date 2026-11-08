/**
 * IndexedDB persistence layer (local-first, no account needed).
 *
 * Photos live in their own store as Blobs — never in localStorage.
 * `localStorage` is limited to the tiny UI settings cache written by the store.
 */

import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import {
  EMPTY_PROFILE,
  DEFAULT_SETTINGS,
  type AchievementDef,
  type Completion,
  type GeoCacheEntry,
  type LocalizedText,
  type PhotoRecord,
  type PoiCacheEntry,
  type Quest,
  type QuestProgress,
  type UserAchievement,
  type UserProfile,
  type UserSettings,
} from './types';

export const DB_NAME = 'reality-quest';
export const DB_VERSION = 3;

interface QuestDB extends DBSchema {
  profile: { key: string; value: UserProfile };
  settings: { key: string; value: UserSettings };
  quests: { key: string; value: Quest; indexes: { 'by-created': number } };
  progress: { key: string; value: QuestProgress };
  completions: {
    key: string;
    value: Completion;
    indexes: { 'by-completed': number; 'by-quest': string };
  };
  photos: { key: string; value: PhotoRecord };
  achievements: { key: string; value: UserAchievement };
  poiCache: { key: string; value: PoiCacheEntry };
  geoCache: { key: string; value: GeoCacheEntry };
  meta: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<QuestDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<QuestDB>> {
  if (!dbPromise) {
    dbPromise = openDB<QuestDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('profile', { keyPath: 'id' });
          // Settings use an out-of-line key so the plain UserSettings object
          // stays free of storage bookkeeping fields.
          db.createObjectStore('settings');
          db.createObjectStore('quests', { keyPath: 'id' }).createIndex('by-created', 'createdAt');
          db.createObjectStore('progress', { keyPath: 'questId' });
          const comp = db.createObjectStore('completions', { keyPath: 'id' });
          comp.createIndex('by-completed', 'completedAt');
          comp.createIndex('by-quest', 'questId');
          db.createObjectStore('photos', { keyPath: 'id' });
          db.createObjectStore('achievements', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('poiCache', { keyPath: 'key' });
          db.createObjectStore('geoCache', { keyPath: 'key' });
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (oldVersion >= 1 && oldVersion < 3) {
          // v3: moved `settings` to an out-of-line key. Recreate the store;
          // the UI settings are mirrored in localStorage and re-bootstrap on
          // the next read, so nothing user-visible is lost.
          db.deleteObjectStore('settings');
          db.createObjectStore('settings');
        }
      },
    });
  }
  return dbPromise;
}

/* ------------------------------------------------------------------ profile */

export async function loadProfile(): Promise<UserProfile> {
  const db = await getDb();
  const existing = await db.get('profile', 'me');
  if (existing) return existing;
  const fresh: UserProfile = { ...EMPTY_PROFILE, createdAt: Date.now() };
  await db.put('profile', fresh);
  return fresh;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const db = await getDb();
  await db.put('profile', profile);
}

/* ----------------------------------------------------------------- settings */

const SETTINGS_KEY = 'settings';
const LOCAL_SETTINGS_KEY = 'rq.settings.v1';

export async function loadSettings(): Promise<UserSettings> {
  const db = await getDb();
  const existing = (await db.get('settings', SETTINGS_KEY)) as UserSettings | undefined;
  if (existing) return { ...DEFAULT_SETTINGS, ...existing };

  // First run: bootstrap from the localStorage mirror, and if that is absent
  // pick the language from the browser rather than always defaulting to one.
  let bootstrap: UserSettings = DEFAULT_SETTINGS;
  let mirrored = false;
  try {
    const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
    if (raw) {
      bootstrap = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<UserSettings>) };
      mirrored = true;
    }
  } catch {
    /* ignore */
  }
  if (!mirrored) {
    const prefersZh =
      typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '');
    const prefersLight =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    bootstrap = {
      ...DEFAULT_SETTINGS,
      lang: prefersZh ? 'zh' : 'en',
      theme: prefersLight ? 'light' : 'dark',
    };
  }
  await db.put('settings', bootstrap, SETTINGS_KEY);
  return bootstrap;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', settings, SETTINGS_KEY);
  try {
    localStorage.setItem(
      LOCAL_SETTINGS_KEY,
      JSON.stringify({ lang: settings.lang, theme: settings.theme, onboarded: settings.onboarded }),
    );
  } catch {
    /* private mode — non fatal */
  }
}

/* ------------------------------------------------------------------- quests */

export async function loadQuests(): Promise<Quest[]> {
  const db = await getDb();
  return db.getAll('quests');
}

export async function putQuest(quest: Quest): Promise<void> {
  const db = await getDb();
  await db.put('quests', quest);
}

export async function deleteQuest(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('quests', id);
}

/* ----------------------------------------------------------------- progress */

export async function loadProgress(): Promise<QuestProgress[]> {
  const db = await getDb();
  return db.getAll('progress');
}

export async function putProgress(progress: QuestProgress): Promise<void> {
  const db = await getDb();
  await db.put('progress', progress);
}

export async function deleteProgress(questId: string): Promise<void> {
  const db = await getDb();
  await db.delete('progress', questId);
}

/* -------------------------------------------------------------- completions */

export async function loadCompletions(): Promise<Completion[]> {
  const db = await getDb();
  return db.getAllFromIndex('completions', 'by-completed');
}

export async function completionForQuest(questId: string): Promise<Completion | undefined> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('completions', 'by-quest', questId);
  return rows[0];
}

/**
 * Idempotent completion write. Runs profile XP, the completion record and the
 * progress cleanup inside one transaction, and refuses to award XP twice for
 * the same quest.
 */
export async function commitCompletion(
  completion: Completion,
  xpGain: number,
  levelAfter: number,
  levelUp: boolean,
): Promise<{ alreadyDone: boolean; profile: UserProfile }> {
  const db = await getDb();
  const tx = db.transaction(['completions', 'profile', 'progress'], 'readwrite');
  const comps = tx.objectStore('completions');
  const existing = await comps.index('by-quest').getAll(completion.questId);
  if (existing.length > 0) {
    await tx.done;
    const profile = await loadProfile();
    return { alreadyDone: true, profile };
  }

  await comps.add(completion);
  const profile = (await tx.objectStore('profile').get('me')) ?? { ...EMPTY_PROFILE, createdAt: Date.now() };
  profile.xp += xpGain;
  profile.level = Math.max(profile.level, levelAfter);
  if (levelUp) profile.levelHistory.push({ level: levelAfter, at: completion.completedAt });
  await tx.objectStore('profile').put(profile);
  await tx.objectStore('progress').delete(completion.questId);
  await tx.done;
  return { alreadyDone: false, profile };
}

export async function deleteCompletion(id: string): Promise<Completion | undefined> {
  const db = await getDb();
  const tx = db.transaction(['completions', 'profile', 'photos'], 'readwrite');
  const row = await tx.objectStore('completions').get(id);
  if (!row) {
    await tx.done;
    return undefined;
  }
  await tx.objectStore('completions').delete(id);
  const profile = (await tx.objectStore('profile').get('me')) ?? null;
  if (profile) {
    // Removing the record also removes the XP it granted: the game state must
    // always be reconstructible from the completion log.
    profile.xp = Math.max(0, profile.xp - row.xpAwarded);
    await tx.objectStore('profile').put(profile);
  }
  if (row.photoId) await tx.objectStore('photos').delete(row.photoId);
  await tx.done;
  return row;
}

export async function updateCompletion(id: string, patch: Partial<Completion>): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('completions', 'readwrite');
  const row = await tx.store.get(id);
  if (row) await tx.store.put({ ...row, ...patch });
  await tx.done;
}

/* ------------------------------------------------------------------- photos */

export async function putPhoto(record: PhotoRecord): Promise<void> {
  const db = await getDb();
  await db.put('photos', record);
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const db = await getDb();
  return db.get('photos', id);
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('photos', id);
}

/* ------------------------------------------------------------- achievements */

export async function loadAchievements(): Promise<UserAchievement[]> {
  const db = await getDb();
  return db.getAll('achievements');
}

export async function saveAchievements(rows: UserAchievement[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('achievements', 'readwrite');
  for (const row of rows) await tx.store.put(row);
  await tx.done;
}

/* ------------------------------------------------------------------- caches */

export async function cachePois(entry: PoiCacheEntry): Promise<void> {
  const db = await getDb();
  await db.put('poiCache', entry);
  // Keep the cache small; drop anything older than 30 days.
  const all = await db.getAll('poiCache');
  const cutoff = Date.now() - 30 * 24 * 3600_000;
  for (const row of all) if (row.fetchedAt < cutoff) await db.delete('poiCache', row.key);
}

export async function readPois(key: string, maxAgeMs: number): Promise<PoiCacheEntry | undefined> {
  const db = await getDb();
  const row = await db.get('poiCache', key);
  if (!row) return undefined;
  if (Date.now() - row.fetchedAt > maxAgeMs) return undefined;
  return row;
}

export async function cacheGeo(entry: GeoCacheEntry): Promise<void> {
  const db = await getDb();
  await db.put('geoCache', entry);
}

export async function readGeo(key: string, maxAgeMs: number): Promise<GeoCacheEntry | undefined> {
  const db = await getDb();
  const row = await db.get('geoCache', key);
  if (!row) return undefined;
  if (Date.now() - row.fetchedAt > maxAgeMs) return undefined;
  return row;
}

/* ------------------------------------------------------- export / import / */

export interface ExportedPhoto {
  id: string;
  mime: string;
  dataUrl: string;
  createdAt: number;
}

export interface ExportBundle {
  schema: 'reality-quest-export';
  version: number;
  exportedAt: number;
  profile: UserProfile;
  settings: Omit<UserSettings, 'lastLocation'>;
  quests: Quest[];
  completions: Completion[];
  achievements: UserAchievement[];
  /** Photos are inlined as data URLs so the JSON export is self-contained. */
  photos: ExportedPhoto[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

export async function exportBundle(): Promise<ExportBundle> {
  const db = await getDb();
  const profile = await loadProfile();
  const settings = await loadSettings();
  const quests = await db.getAll('quests');
  const completions = await db.getAll('completions');
  const achievements = await db.getAll('achievements');
  const photos: ExportBundle['photos'] = [];
  for (const rec of await db.getAll('photos')) {
    const dataUrl = await blobToDataUrl(rec.blob);
    photos.push({ id: rec.id, mime: rec.blob.type, dataUrl, createdAt: rec.createdAt });
  }
  const { lastLocation: _omit, ...safeSettings } = settings;
  void _omit;
  return {
    schema: 'reality-quest-export',
    version: DB_VERSION,
    exportedAt: Date.now(),
    profile,
    settings: safeSettings,
    quests,
    completions,
    achievements,
    photos,
  };
}

export interface ImportSummary {
  quests: number;
  completions: number;
  achievements: number;
  photos: number;
  skipped: number;
}

/**
 * Strict validation, then merge. Import never deletes existing records: it
 * only adds what is missing, reported as `skipped` counts so the user sees
 * exactly what happened.
 */
export async function importBundle(raw: unknown): Promise<ImportSummary> {
  const bundle = validateBundle(raw);
  const db = await getDb();
  const summary: ImportSummary = { quests: 0, completions: 0, achievements: 0, photos: 0, skipped: 0 };

  for (const quest of bundle.quests) {
    if (await db.get('quests', quest.id)) {
      summary.skipped += 1;
      continue;
    }
    await db.put('quests', quest);
    summary.quests += 1;
  }
  for (const c of bundle.completions) {
    if (await db.get('completions', c.id)) {
      summary.skipped += 1;
      continue;
    }
    await db.put('completions', c);
    summary.completions += 1;
  }
  for (const a of bundle.achievements) {
    if (await db.get('achievements', a.id)) {
      summary.skipped += 1;
      continue;
    }
    await db.put('achievements', a);
    summary.achievements += 1;
  }
  for (const p of bundle.photos) {
    if (await db.get('photos', p.id)) {
      summary.skipped += 1;
      continue;
    }
    const blob = dataUrlToBlob(p.dataUrl, p.mime);
    await db.put('photos', {
      id: p.id,
      blob,
      width: 0,
      height: 0,
      bytes: blob.size,
      createdAt: p.createdAt,
    });
    summary.photos += 1;
  }

  // Recompute XP/level from the merged completion log so a partial import can
  // never inflate the profile.
  const completions = await db.getAll('completions');
  const profile = await loadProfile();
  const xp = completions.reduce((sum, c) => sum + (Number.isFinite(c.xpAwarded) ? c.xpAwarded : 0), 0);
  profile.xp = xp;
  await db.put('profile', profile);
  return summary;
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('invalid photo payload');
  const mime = match[1] || fallbackMime || 'image/jpeg';
  const isBase64 = Boolean(match[2]);
  const body = match[3] ?? '';
  if (!isBase64) return new Blob([decodeURIComponent(body)], { type: mime });
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ------------------------------------------------------------- validation */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const text = (v: unknown): LocalizedText => {
  if (!isObj(v)) throw new Error('invalid localized text');
  const zh = typeof v.zh === 'string' ? v.zh : '';
  const en = typeof v.en === 'string' ? v.en : '';
  if (!zh && !en) throw new Error('empty localized text');
  return { zh, en };
};

const num = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`invalid number: ${field}`);
  return v;
};

const str = (v: unknown, field: string): string => {
  if (typeof v !== 'string' || v.length === 0) throw new Error(`invalid string: ${field}`);
  return v;
};

export function validateBundle(raw: unknown): ExportBundle {
  if (!isObj(raw)) throw new Error('not an object');
  if (raw.schema !== 'reality-quest-export') throw new Error('wrong schema');
  if (typeof raw.version !== 'number') throw new Error('missing version');
  if (!Array.isArray(raw.quests)) throw new Error('missing quests');
  if (!Array.isArray(raw.completions)) throw new Error('missing completions');

  const quests: Quest[] = raw.quests.map((q) => {
    if (!isObj(q)) throw new Error('invalid quest');
    const category = str(q.category, 'category');
    const difficulty = str(q.difficulty, 'difficulty');
    const source = str(q.source, 'source');
    if (!['city', 'nature', 'culture', 'photo', 'random'].includes(category)) throw new Error('bad category');
    if (!['easy', 'normal', 'hard', 'epic'].includes(difficulty)) throw new Error('bad difficulty');
    if (!['osm', 'curated', 'community'].includes(source)) throw new Error('bad source');
    return {
      id: str(q.id, 'id'),
      title: text(q.title),
      description: text(q.description),
      category: category as Quest['category'],
      lat: num(q.lat, 'lat'),
      lng: num(q.lng, 'lng'),
      radius: num(q.radius, 'radius'),
      difficulty: difficulty as Quest['difficulty'],
      xp: num(q.xp, 'xp'),
      estimatedMinutes: num(q.estimatedMinutes, 'estimatedMinutes'),
      requiresPhoto: Boolean(q.requiresPhoto),
      source: source as Quest['source'],
      creator: typeof q.creator === 'string' ? q.creator : 'unknown',
      createdAt: num(q.createdAt, 'createdAt'),
      isPublic: Boolean(q.isPublic),
      placeName: typeof q.placeName === 'string' ? q.placeName : undefined,
      osmType: typeof q.osmType === 'string' ? q.osmType : undefined,
      osmId: typeof q.osmId === 'number' ? q.osmId : undefined,
      sourceUrl: typeof q.sourceUrl === 'string' ? q.sourceUrl : undefined,
      minLevel: typeof q.minLevel === 'number' ? q.minLevel : undefined,
    };
  });

  const completions: Completion[] = raw.completions.map((c) => {
    if (!isObj(c)) throw new Error('invalid completion');
    const loc = c.location;
    if (!isObj(loc)) throw new Error('invalid completion location');
    return {
      id: str(c.id, 'id'),
      questId: str(c.questId, 'questId'),
      quest: {
        title: text(isObj(c.quest) ? c.quest.title : undefined),
        category: str(isObj(c.quest) ? c.quest.category : '', 'category') as Quest['category'],
        difficulty: str(isObj(c.quest) ? c.quest.difficulty : '', 'difficulty') as Quest['difficulty'],
        lat: num(isObj(c.quest) ? c.quest.lat : NaN, 'lat'),
        lng: num(isObj(c.quest) ? c.quest.lng : NaN, 'lng'),
        placeName: isObj(c.quest) && typeof c.quest.placeName === 'string' ? c.quest.placeName : undefined,
        source: (isObj(c.quest) ? str(c.quest.source, 'source') : 'community') as Quest['source'],
      },
      completedAt: num(c.completedAt, 'completedAt'),
      location: {
        lat: num(loc.lat, 'lat'),
        lng: num(loc.lng, 'lng'),
        accuracy: num(loc.accuracy, 'accuracy'),
        timestamp: num(loc.timestamp, 'timestamp'),
      },
      distanceMeters: num(c.distanceMeters, 'distanceMeters'),
      xpAwarded: num(c.xpAwarded, 'xpAwarded'),
      hasPhoto: Boolean(c.hasPhoto),
      text: typeof c.text === 'string' ? c.text : undefined,
      photoId: typeof c.photoId === 'string' ? c.photoId : undefined,
      isPublic: Boolean(c.isPublic),
      locality: typeof c.locality === 'string' ? c.locality : undefined,
    };
  });

  const achievements = Array.isArray(raw.achievements)
    ? raw.achievements.map((a) => {
        if (!isObj(a)) throw new Error('invalid achievement');
        return { id: str(a.id, 'id'), unlockedAt: num(a.unlockedAt, 'unlockedAt') };
      })
    : [];

  const photos = Array.isArray(raw.photos)
    ? raw.photos.map((p) => {
        if (!isObj(p)) throw new Error('invalid photo');
        const dataUrl = str(p.dataUrl, 'dataUrl');
        if (!dataUrl.startsWith('data:image/')) throw new Error('invalid photo payload');
        return {
          id: str(p.id, 'id'),
          mime: typeof p.mime === 'string' ? p.mime : 'image/jpeg',
          dataUrl,
          createdAt: num(p.createdAt, 'createdAt'),
        };
      })
    : [];

  return {
    schema: 'reality-quest-export',
    version: num(raw.version, 'version'),
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : Date.now(),
    profile: isObj(raw.profile)
      ? ({
          id: 'me',
          displayName: typeof raw.profile.displayName === 'string' ? raw.profile.displayName : 'Explorer',
          createdAt: typeof raw.profile.createdAt === 'number' ? raw.profile.createdAt : Date.now(),
          xp: typeof raw.profile.xp === 'number' ? raw.profile.xp : 0,
          level: typeof raw.profile.level === 'number' ? raw.profile.level : 1,
          levelHistory: [],
        } satisfies UserProfile)
      : { ...EMPTY_PROFILE, createdAt: Date.now() },
    settings: DEFAULT_SETTINGS,
    quests,
    completions,
    achievements,
    photos,
  };
}

/* --------------------------------------------------------------- destructive */

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ['quests', 'progress', 'completions', 'photos', 'achievements', 'poiCache', 'geoCache'],
    'readwrite',
  );
  for (const name of ['quests', 'progress', 'completions', 'photos', 'achievements', 'poiCache', 'geoCache'] as const) {
    await tx.objectStore(name).clear();
  }
  await tx.done;
  const profileTx = db.transaction('profile', 'readwrite');
  await profileTx.store.put({ ...EMPTY_PROFILE, createdAt: Date.now() });
  await profileTx.done;
}

export function achievementIds(rows: UserAchievement[]): Set<string> {
  return new Set(rows.map((r) => r.id));
}

export type { AchievementDef };
