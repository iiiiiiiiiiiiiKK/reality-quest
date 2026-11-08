/**
 * Global client state (Zustand). All persistence goes through `lib/db.ts`;
 * this store is the single place that decides *when* a write happens, so
 * idempotency (no double XP) is enforced in one spot.
 */

import { create } from 'zustand';
import {
  clearAllData,
  commitCompletion,
  deleteCompletion,
  deletePhoto,
  deleteQuest as dbDeleteQuest,
  deleteProgress,
  exportBundle,
  importBundle,
  loadAchievements,
  loadCompletions,
  loadProfile,
  loadProgress,
  loadQuests,
  loadSettings,
  putPhoto,
  putProgress,
  putQuest,
  saveAchievements,
  saveProfile,
  saveSettings,
  updateCompletion,
  type ImportSummary,
} from './lib/db';
import { computeStats, newlyUnlocked } from './lib/achievements';
import { evaluateCheckIn, haversineMeters, trailIncrement } from './lib/geo';
import { levelForXp, xpForDifficulty } from './lib/levels';
import { fetchNearbyPois, poiToQuest, reverseLocality } from './lib/services';
import { curatedToQuest, nearestCurated } from './lib/curated';
import type {
  AchievementDef,
  Completion,
  GeoFix,
  Lang,
  PoiFact,
  Quest,
  QuestCategory,
  QuestProgress,
  Theme,
  UserAchievement,
  UserProfile,
  UserSettings,
} from './lib/types';
import { DEFAULT_SETTINGS, EMPTY_PROFILE } from './lib/types';
import type { CompressedPhoto } from './lib/photo';

export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export interface PendingLevelUp {
  level: number;
}

export interface BadgeReveal {
  badge: AchievementDef;
}

export interface CheckInResult {
  ok: boolean;
  reason?: 'too-far' | 'low-accuracy' | 'no-location';
  distance?: number;
  accuracy?: number;
}

interface State {
  ready: boolean;
  bootError?: string;

  settings: UserSettings;
  profile: UserProfile;
  completions: Completion[];
  achievements: UserAchievement[];
  localQuests: Quest[];
  progress: QuestProgress[];

  permission: PermissionState;
  location: GeoFix | null;
  locating: boolean;
  locationError?: 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'failed';

  /** Quests discovered from OpenStreetMap at the current view. */
  discovered: Quest[];
  discovering: boolean;
  discoverError?: string;
  discoveredAt?: number;
  discoveredCached: boolean;

  selectedQuestId?: string;
  mapCenter?: { lat: number; lng: number; zoom: number };
  toasts: Toast[];
  levelUp?: PendingLevelUp;
  badgeQueue: BadgeReveal[];

  /** Session-scoped trail (metres) built from verified fixes. */
  sessionTrailM: number;

  boot: () => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  setNickname: (name: string) => Promise<void>;

  locate: (opts?: { silent?: boolean; fresh?: boolean }) => Promise<GeoFix | null>;
  setMapCenter: (c: { lat: number; lng: number; zoom: number }) => void;

  discover: (lat: number, lng: number, opts?: { force?: boolean; radius?: number }) => Promise<void>;
  addPoiQuests: (pois: PoiFact[]) => void;

  selectQuest: (id?: string) => void;
  startQuest: (id: string) => Promise<void>;
  abandonQuest: (id: string) => Promise<void>;
  checkIn: (quest: Quest) => Promise<CheckInResult>;
  completeQuest: (args: {
    quest: Quest;
    location: GeoFix;
    distance: number;
    photo?: CompressedPhoto;
    text?: string;
    share: boolean;
  }) => Promise<{ ok: boolean; alreadyDone?: boolean; xp?: number }>;

  createCommunityQuest: (input: {
    title: string;
    description: string;
    category: QuestCategory;
    lat: number;
    lng: number;
    radius: number;
    difficulty: Quest['difficulty'];
    requiresPhoto: boolean;
    isPublic: boolean;
  }) => Promise<Quest>;
  removeQuest: (id: string) => Promise<void>;

  removeCompletion: (id: string) => Promise<void>;
  setRecordVisibility: (id: string, isPublic: boolean) => Promise<void>;

  exportData: () => Promise<void>;
  importData: (raw: unknown) => Promise<ImportSummary>;
  wipe: () => Promise<void>;

  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: string) => void;
  dismissLevelUp: () => void;
  dismissBadge: () => void;
}

const uid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const useStore = create<State>((set, get) => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  profile: EMPTY_PROFILE,
  completions: [],
  achievements: [],
  localQuests: [],
  progress: [],
  permission: 'unknown',
  location: null,
  locating: false,
  discovered: [],
  discovering: false,
  discoveredCached: false,
  toasts: [],
  badgeQueue: [],
  sessionTrailM: 0,

  async boot() {
    try {
      const [settings, profile, completions, achievements, quests, progress] = await Promise.all([
        loadSettings(),
        loadProfile(),
        loadCompletions(),
        loadAchievements(),
        loadQuests(),
        loadProgress(),
      ]);
      profile.level = levelForXp(profile.xp).level;
      set({ settings, profile, completions, achievements, localQuests: quests, progress, ready: true });
      if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          const map: Record<string, PermissionState> = { granted: 'granted', denied: 'denied', prompt: 'prompt' };
          set({ permission: map[status.state] ?? 'prompt' });
        } catch {
          set({ permission: 'prompt' });
        }
      }
    } catch (err) {
      set({ ready: true, bootError: err instanceof Error ? err.message : 'boot failed' });
    }
  },

  async setLang(lang) {
    const settings = { ...get().settings, lang };
    set({ settings });
    await saveSettings(settings);
  },

  async setTheme(theme) {
    const settings = { ...get().settings, theme };
    set({ settings });
    await saveSettings(settings);
  },

  async updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await saveSettings(settings);
  },

  async setNickname(name) {
    const profile = { ...get().profile, displayName: name.trim().slice(0, 32) || 'Explorer' };
    set({ profile });
    await saveProfile(profile);
  },

  setMapCenter(c) {
    set({ mapCenter: c });
  },

  async locate(opts) {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      set({ permission: 'unsupported', locationError: 'unsupported', locating: false });
      return null;
    }
    if (get().locating) return get().location;
    set({ locating: true, locationError: undefined });
    return new Promise<GeoFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const fix: GeoFix = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 9999,
            timestamp: pos.timestamp || Date.now(),
          };
          const prev = get().location;
          const inc = trailIncrement(prev, fix);
          const settings = { ...get().settings, lastLocation: fix };
          set({
            location: fix,
            locating: false,
            permission: 'granted',
            sessionTrailM: get().sessionTrailM + inc,
            settings,
          });
          void saveSettings(settings);
          if (opts?.silent !== true) {
            const center = get().mapCenter;
            if (!center || haversineMeters(center, fix) > 800) {
              get().setMapCenter({ lat: fix.lat, lng: fix.lng, zoom: 15 });
            }
          }
          resolve(fix);
        },
        (err) => {
          const code = err.code;
          const locationError =
            code === 1 ? 'denied' : code === 2 ? 'unavailable' : code === 3 ? 'timeout' : 'failed';
          set({
            locating: false,
            locationError,
            permission: code === 1 ? 'denied' : get().permission,
          });
          resolve(null);
        },
        // `fresh` forbids reusing a cached reading, which is required before
        // deciding whether the user is currently inside a quest radius.
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: opts?.fresh ? 0 : 30_000 },
      );
    });
  },

  async discover(lat, lng, opts) {
    set({ discovering: true, discoverError: undefined });
    const radius = opts?.radius ?? 1500;
    // Curated real landmarks: nearest first, and if none are within 60 km
    // (user is somewhere we have not curated yet) fall back to the globally
    // nearest ones so the map is never empty and never fabricated.
    const near = nearestCurated(lat, lng, 60, 40);
    const baseline = (near.length > 0 ? near : nearestCurated(lat, lng, 25_000, 60)).map(curatedToQuest);
    try {
      const { pois, cached, fetchedAt } = await fetchNearbyPois(lat, lng, radius, { force: opts?.force });
      const quests = pois.map(poiToQuest);
      const merged = new Map<string, Quest>();
      // Curated real landmarks first (always available), then live OSM quests.
      for (const q of baseline) merged.set(q.id, q);
      for (const q of get().discovered) merged.set(q.id, q);
      for (const q of quests) merged.set(q.id, q);
      // Keep quests that belong to completions but are outside the current view.
      for (const c of get().completions) {
        if (!merged.has(c.questId)) {
          merged.set(c.questId, {
            id: c.questId,
            title: c.quest.title,
            description: { zh: '', en: '' },
            category: c.quest.category,
            lat: c.quest.lat,
            lng: c.quest.lng,
            radius: 100,
            difficulty: c.quest.difficulty,
            xp: c.xpAwarded,
            estimatedMinutes: 0,
            requiresPhoto: false,
            source: c.quest.source,
            creator: 'unknown',
            createdAt: 0,
            isPublic: true,
            placeName: c.quest.placeName,
          });
        }
      }
      set({
        discovered: Array.from(merged.values()),
        discovering: false,
        discoveredAt: fetchedAt,
        discoveredCached: cached,
        discoverError: quests.length === 0 ? 'empty' : undefined,
      });
    } catch (err) {
      const kind = (err as { kind?: string }).kind;
      // Degrade to the shipped curated landmarks rather than showing nothing.
      // The UI reports the service problem *and* still offers real places.
      const merged = new Map<string, Quest>();
      for (const q of baseline) merged.set(q.id, q);
      for (const q of get().discovered) merged.set(q.id, q);
      set({
        discovered: Array.from(merged.values()),
        discovering: false,
        discoverError: kind === 'timeout' ? 'timeout' : kind === 'rate-limit' ? 'rate-limit' : 'failed',
      });
    }
  },

  addPoiQuests(pois) {
    const merged = new Map<string, Quest>();
    for (const q of get().discovered) merged.set(q.id, q);
    for (const poi of pois) {
      const q = poiToQuest(poi);
      merged.set(q.id, q);
    }
    set({ discovered: Array.from(merged.values()) });
  },

  selectQuest(id) {
    set({ selectedQuestId: id });
  },

  async startQuest(id) {
    const progress: QuestProgress = { questId: id, state: 'active', startedAt: Date.now() };
    const next = get().progress.filter((p) => p.questId !== id);
    set({ progress: [...next, progress] });
    await putProgress(progress);
  },

  async abandonQuest(id) {
    set({ progress: get().progress.filter((p) => p.questId !== id) });
    await deleteProgress(id);
  },

  async checkIn(quest) {
    // Always take a *fresh* fix here. Check-in is a deliberate user action and
    // reusing a cached position would let a stale reading verify a location the
    // user has already left (and would make the anti-false-positive rule moot).
    const fix = await get().locate({ silent: true, fresh: true });
    if (!fix) return { ok: false, reason: 'no-location' };
    const verdict = evaluateCheckIn({ lat: quest.lat, lng: quest.lng }, fix, quest.radius);
    if (verdict.ok) return { ok: true, distance: verdict.distance };
    return { ok: false, reason: verdict.reason, distance: verdict.distance, accuracy: fix.accuracy };
  },

  async completeQuest({ quest, location, distance, photo, text, share }) {
    if (get().completions.some((c) => c.questId === quest.id)) {
      return { ok: false, alreadyDone: true };
    }
    const xp = Number.isFinite(quest.xp) ? quest.xp : xpForDifficulty(quest.difficulty);
    const photoId = photo ? uid() : undefined;
    if (photo && photoId) {
      await putPhoto({
        id: photoId,
        blob: photo.blob,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes,
        createdAt: Date.now(),
      });
    }

    // Reverse geocoding is purely cosmetic (it labels the "cities explored"
    // stat). It must never block the completion write, so it is resolved
    // *after* the record is committed and patched in when it arrives.
    const completion: Completion = {
      id: uid(),
      questId: quest.id,
      quest: {
        title: quest.title,
        category: quest.category,
        difficulty: quest.difficulty,
        lat: quest.lat,
        lng: quest.lng,
        placeName: quest.placeName,
        source: quest.source,
      },
      completedAt: Date.now(),
      location,
      distanceMeters: Math.round(distance),
      xpAwarded: xp,
      hasPhoto: Boolean(photo),
      text: text?.trim() ? text.trim().slice(0, 2000) : undefined,
      photoId,
      isPublic: share,
      locality: undefined,
    };

    const beforeXp = get().profile.xp;
    const levelBefore = levelForXp(beforeXp).level;
    const levelAfter = levelForXp(beforeXp + xp).level;
    const result = await commitCompletion(completion, xp, levelAfter, levelAfter > levelBefore);
    if (result.alreadyDone) {
      if (photoId) await deletePhoto(photoId);
      set({ profile: result.profile, completions: await loadCompletions() });
      return { ok: false, alreadyDone: true };
    }

    const completions = await loadCompletions();
    const trailKm = estimateTrailKm(completions);
    const stats = computeStats(completions, result.profile.level, trailKm);
    const unlockedIds = new Set(get().achievements.map((a) => a.id));
    const fresh = newlyUnlocked(stats, unlockedIds);
    const newRows: UserAchievement[] = fresh.map((badge) => ({ id: badge.id, unlockedAt: Date.now() }));
    if (newRows.length > 0) await saveAchievements(newRows);

    set({
      profile: result.profile,
      completions,
      achievements: [...get().achievements, ...newRows],
      progress: get().progress.filter((p) => p.questId !== quest.id),
      selectedQuestId: undefined,
      levelUp: levelAfter > levelBefore ? { level: levelAfter } : undefined,
      badgeQueue: [...get().badgeQueue, ...fresh.map((badge) => ({ badge }))],
    });

    // Fire-and-forget locality label; a slow or failing Nominatim never delays
    // or blocks the reward the user just earned.
    void (async () => {
      try {
        const locality = await reverseLocality(location.lat, location.lng, get().settings.lang);
        if (!locality) return;
        await updateCompletion(completion.id, { locality });
        const refreshed = await loadCompletions();
        set({ completions: refreshed });
      } catch {
        /* cosmetic only */
      }
    })();

    return { ok: true, xp };
  },

  async createCommunityQuest(input) {
    const quest: Quest = {
      id: `local-${uid()}`,
      title: { zh: input.title, en: input.title },
      description: { zh: input.description, en: input.description },
      category: input.category,
      lat: input.lat,
      lng: input.lng,
      radius: input.radius,
      difficulty: input.difficulty,
      xp: xpForDifficulty(input.difficulty),
      estimatedMinutes: 20,
      requiresPhoto: input.requiresPhoto,
      source: 'community',
      creator: get().profile.displayName,
      createdAt: Date.now(),
      isPublic: input.isPublic,
    };
    await putQuest(quest);
    set({ localQuests: [...get().localQuests, quest] });
    return quest;
  },

  async removeQuest(id) {
    await dbDeleteQuest(id);
    set({
      localQuests: get().localQuests.filter((q) => q.id !== id),
      discovered: get().discovered.filter((q) => q.id !== id),
      progress: get().progress.filter((p) => p.questId !== id),
    });
  },

  async removeCompletion(id) {
    const removed = await deleteCompletion(id);
    if (!removed) return;
    const [completions, profile, achievements] = await Promise.all([
      loadCompletions(),
      loadProfile(),
      loadAchievements(),
    ]);
    profile.level = levelForXp(profile.xp).level;
    await saveProfile(profile);
    set({ completions, profile, achievements });
  },

  async setRecordVisibility(id, isPublic) {
    await updateCompletion(id, { isPublic });
    set({ completions: await loadCompletions() });
  },

  async exportData() {
    const bundle = await exportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `reality-quest-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  async importData(raw) {
    const summary = await importBundle(raw);
    const [completions, profile, achievements, quests] = await Promise.all([
      loadCompletions(),
      loadProfile(),
      loadAchievements(),
      loadQuests(),
    ]);
    profile.level = levelForXp(profile.xp).level;
    await saveProfile(profile);
    set({ completions, profile, achievements, localQuests: quests });
    return summary;
  },

  async wipe() {
    await clearAllData();
    const profile = await loadProfile();
    set({
      completions: [],
      achievements: [],
      localQuests: [],
      progress: [],
      profile,
      discovered: [],
      selectedQuestId: undefined,
      sessionTrailM: 0,
    });
  },

  pushToast(kind, message) {
    const toast: Toast = { id: uid(), kind, message };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().dismissToast(toast.id), 5200);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  dismissLevelUp() {
    set({ levelUp: undefined });
  },

  dismissBadge() {
    set({ badgeQueue: get().badgeQueue.slice(1) });
  },
}));

/**
 * Trail length is derived, never stored as a mutable counter, so deleting a
 * record or importing a bundle always yields a consistent number.
 *
 * Only the *verified* legs are measurable, which is why the UI describes it as
 * a lower bound rather than an exact walking distance.
 */
export function estimateTrailKm(completions: Completion[]): number {
  const sorted = [...completions].sort((a, b) => a.completedAt - b.completedAt);
  let metres = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const d = haversineMeters(prev.location, cur.location);
    if (d > 0 && d < 80_000) metres += d;
  }
  return metres / 1000;
}

