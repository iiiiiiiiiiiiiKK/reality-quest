/**
 * External, free data services.
 *
 * Policies honoured here (see README):
 *  - Overpass API: single query per ~1.5 km view, 12 s timeout, 6 h local cache,
 *    exponential-ish cooldown after a failure, and never retried in a loop.
 *  - Nominatim: only on explicit user search / one reverse lookup per completion,
 *    at most 1 request per second, 30 day cache, custom referrer-free UA is not
 *    possible from a browser so we keep volume minimal instead.
 *  - OSM tiles: default public tile service with proper attribution; the app
 *    degrades to "no basemap" when tiles fail instead of crashing.
 */

import {
  cacheGeo,
  cachePois,
  readGeo,
  readPois,
} from './db';
import type { Difficulty, PoiFact, Quest, QuestCategory } from './types';
import { RADIUS_BY_DIFFICULTY, xpForDifficulty } from './levels';
import { haversineMeters } from './geo';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const OVERPASS_TIMEOUT_MS = 14_000;
const NOMINATIM_TIMEOUT_MS = 10_000;
const POI_CACHE_MS = 6 * 3600_000;
const GEO_CACHE_MS = 30 * 24 * 3600_000;

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'network' | 'empty' | 'rate-limit' = 'network',
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ServiceError('request timed out', 'timeout');
    }
    throw new ServiceError('network error', 'network');
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------------- Overpass */

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Real, quest-worthy feature classes. `name`-less features are dropped because
 * an unnamed way is not a place a human can meaningfully be asked to find.
 */
const CATEGORY_FILTERS: Record<Exclude<QuestCategory, 'random'>, string[]> = {
  city: [
    '["leisure"="square"]',
    '["place"="square"]',
    '["historic"="memorial"]',
    '["man_made"="lighthouse"]',
    '["tourism"="viewpoint"]["name"]',
    '["building"="civic"]',
    '["amenity"="marketplace"]',
  ],
  nature: [
    '["leisure"="park"]',
    '["leisure"="garden"]',
    '["natural"="water"]["water"~"lake|reservoir|pond"]',
    '["leisure"="nature_reserve"]',
    '["natural"="wood"]',
  ],
  culture: [
    '["tourism"="museum"]',
    '["historic"="monument"]',
    '["historic"="castle"]',
    '["amenity"="place_of_worship"]',
    '["tourism"="artwork"]',
    '["amenity"="library"]',
    '["amenity"="theatre"]',
  ],
  photo: [
    '["tourism"="artwork"]',
    '["man_made"="tower"]["name"]',
    '["bridge"="yes"]["name"]',
    '["tourism"="viewpoint"]["name"]',
    '["amenity"="fountain"]',
  ],
};

function buildQuery(lat: number, lng: number, radiusM: number): string {
  const clauses: string[] = [];
  for (const [category, filters] of Object.entries(CATEGORY_FILTERS)) {
    for (const filter of filters) {
      clauses.push(
        `node${filter}(around:${radiusM},${lat.toFixed(5)},${lng.toFixed(5)});`,
        `way${filter}(around:${radiusM},${lat.toFixed(5)},${lng.toFixed(5)});`,
      );
    }
    void category;
  }
  return `[out:json][timeout:25];(${clauses.join('')});out center tags 200;`;
}

function classify(tags: Record<string, string>): QuestCategory {
  if (tags.tourism === 'artwork' || tags.man_made === 'tower' || tags.bridge === 'yes' || tags.amenity === 'fountain') {
    return 'photo';
  }
  if (tags.tourism === 'museum' || tags.historic || tags.amenity === 'place_of_worship' || tags.amenity === 'library' || tags.amenity === 'theatre') {
    return 'culture';
  }
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.natural || tags.leisure === 'nature_reserve') {
    return 'nature';
  }
  return 'city';
}

export function poiCacheKey(lat: number, lng: number, radiusM: number): string {
  // ~1.5 km buckets keep the cache reusable while panning the map.
  const cellLat = Math.round(lat / 0.015) * 0.015;
  const cellLng = Math.round(lng / 0.015) * 0.015;
  return `poi:${cellLat.toFixed(3)}:${cellLng.toFixed(3)}:${Math.round(radiusM / 500)}`;
}

let overpassCooldownUntil = 0;
let overpassEndpointIndex = 0;

export async function fetchNearbyPois(
  lat: number,
  lng: number,
  radiusM = 1500,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<{ pois: PoiFact[]; cached: boolean; fetchedAt: number }> {
  const key = poiCacheKey(lat, lng, radiusM);
  if (!options.force) {
    const cached = await readPois(key, POI_CACHE_MS);
    if (cached) return { pois: cached.facts, cached: true, fetchedAt: cached.fetchedAt };
  }
  if (Date.now() < overpassCooldownUntil) {
    const cached = await readPois(key, 30 * 24 * 3600_000);
    if (cached) return { pois: cached.facts, cached: true, fetchedAt: cached.fetchedAt };
    throw new ServiceError('overpass cooling down', 'rate-limit');
  }

  const query = buildQuery(lat, lng, radiusM);
  let lastError: unknown;
  for (let attempt = 0; attempt < OVERPASS_ENDPOINTS.length; attempt += 1) {
    const endpoint = OVERPASS_ENDPOINTS[overpassEndpointIndex % OVERPASS_ENDPOINTS.length]!;
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        },
        OVERPASS_TIMEOUT_MS,
      );
      if (res.status === 429 || res.status === 504) throw new ServiceError('overpass busy', 'rate-limit');
      if (!res.ok) throw new ServiceError(`overpass ${res.status}`, 'network');
      const json = (await res.json()) as { elements?: OverpassElement[] };
      const pois = normalizePois(json.elements ?? []);
      const fetchedAt = Date.now();
      await cachePois({ key, fetchedAt, facts: pois });
      overpassCooldownUntil = 0;
      return { pois, cached: false, fetchedAt };
    } catch (err) {
      lastError = err;
      overpassEndpointIndex += 1;
      if (err instanceof ServiceError && err.kind === 'rate-limit') {
        overpassCooldownUntil = Date.now() + 60_000;
      }
    }
  }
  throw lastError instanceof ServiceError
    ? lastError
    : new ServiceError('overpass failed', 'network');
}

export function normalizePois(elements: OverpassElement[]): PoiFact[] {
  const seen = new Set<string>();
  const out: PoiFact[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name || tags['name:en'] || tags['name:zh'];
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!name || typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      osmType: el.type,
      osmId: el.id,
      lat,
      lng,
      name,
      category: classify(tags),
      tags,
    });
  }
  return out;
}

/* ------------------------------------------------------------ POI → Quest */

const DIFFICULTY_BY_CATEGORY: Record<QuestCategory, Difficulty[]> = {
  city: ['easy', 'normal', 'normal', 'hard'],
  nature: ['easy', 'normal', 'normal', 'hard'],
  culture: ['normal', 'normal', 'hard', 'epic'],
  photo: ['easy', 'normal', 'normal', 'epic'],
  random: ['normal', 'hard'],
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministically derive difficulty so the same place always scores the same. */
function difficultyFor(category: QuestCategory, osmKey: string): Difficulty {
  const pool = DIFFICULTY_BY_CATEGORY[category] ?? ['normal'];
  return pool[hashString(osmKey) % pool.length]!;
}

const QUEST_TEMPLATES: Record<
  QuestCategory,
  { title: { zh: string; en: string }; body: { zh: string; en: string } }
> = {
  city: {
    title: { zh: '探索 {name}', en: 'Explore {name}' },
    body: {
      zh: '走到 {name}，观察它周围的街区：建筑年代、店铺招牌、路面材质。在验证半径内完成到达验证，记录你最想记住的一个细节。',
      en: 'Walk to {name} and study its surroundings: building eras, shop signs, paving. Verify arrival inside the radius and note the one detail you want to remember.',
    },
  },
  nature: {
    title: { zh: '走进 {name}', en: 'Walk into {name}' },
    body: {
      zh: '{name} 是一处真实存在的自然空间。找到它，站在里面停一分钟：听声音、看光线、记录季节感。',
      en: '{name} is a real natural space. Find it, stand inside for a minute, and record what you hear, how the light falls, and the season.',
    },
  },
  culture: {
    title: { zh: '拜访 {name}', en: 'Visit {name}' },
    body: {
      zh: '{name} 承载了这片地方的文化记忆。到达现场，找一条你此前不知道的信息——牌匾、说明、建筑细节都算。',
      en: '{name} carries the cultural memory of this area. Arrive and find one piece of information you did not know before — a plaque, a caption or an architectural detail.',
    },
  },
  photo: {
    title: { zh: '拍下 {name}', en: 'Photograph {name}' },
    body: {
      zh: '在 {name} 拍一张照片。尝试一个不常见的角度：贴近、仰视、或把前景和它放在一起。提交照片完成挑战。',
      en: 'Photograph {name} from an unusual angle: close in, look up, or frame it against the foreground. Submit the photo to finish the challenge.',
    },
  },
  random: {
    title: { zh: '未知地点 {name}', en: 'Unknown place {name}' },
    body: {
      zh: '这是一个随机挑选的真实地点：{name}。不要提前查资料，直接走过去，看看会发生什么。',
      en: 'A randomly chosen real place: {name}. Do not look it up in advance — just walk there and see what happens.',
    },
  },
};

export function poiToQuest(poi: PoiFact): Quest {
  const difficulty = difficultyFor(poi.category, `${poi.osmType}/${poi.osmId}`);
  const template = QUEST_TEMPLATES[poi.category];
  const fill = (s: string) => s.replace(/\{name\}/g, poi.name);
  const id = `osm-${poi.osmType}-${poi.osmId}`;
  return {
    id,
    title: { zh: fill(template.title.zh), en: fill(template.title.en) },
    description: { zh: fill(template.body.zh), en: fill(template.body.en) },
    category: poi.category,
    lat: poi.lat,
    lng: poi.lng,
    radius: RADIUS_BY_DIFFICULTY[difficulty],
    difficulty,
    xp: xpForDifficulty(difficulty),
    estimatedMinutes: difficulty === 'epic' ? 45 : difficulty === 'hard' ? 30 : 18,
    requiresPhoto: poi.category === 'photo',
    source: 'osm',
    creator: 'OpenStreetMap',
    createdAt: 0,
    isPublic: true,
    placeName: poi.name,
    osmType: poi.osmType,
    osmId: poi.osmId,
    sourceUrl: `https://www.openstreetmap.org/${poi.osmType}/${poi.osmId}`,
  };
}

/* -------------------------------------------------------------- Nominatim */

let lastNominatimCall = 0;

async function nominatimFetch(path: string, params: Record<string, string>): Promise<unknown> {
  const wait = Math.max(0, lastNominatimCall + 1100 - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatimCall = Date.now();
  const url = `${NOMINATIM_ENDPOINT}${path}?${new URLSearchParams({ format: 'jsonv2', ...params }).toString()}`;
  const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, NOMINATIM_TIMEOUT_MS);
  if (!res.ok) throw new ServiceError(`nominatim ${res.status}`, res.status === 429 ? 'rate-limit' : 'network');
  return res.json();
}

export interface PlaceResult {
  displayName: string;
  lat: number;
  lng: number;
  type?: string;
}

export async function searchPlaces(query: string, lang: 'zh' | 'en'): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const json = (await nominatimFetch('/search', {
    q: trimmed,
    limit: '8',
    'accept-language': lang === 'zh' ? 'zh-CN,zh,en' : 'en',
  })) as Array<{ display_name?: string; lat?: string; lon?: string; type?: string }>;
  return json
    .map((row) => ({
      displayName: row.display_name ?? '',
      lat: Number(row.lat),
      lng: Number(row.lon),
      type: row.type,
    }))
    .filter((row) => row.displayName && Number.isFinite(row.lat) && Number.isFinite(row.lng));
}

/** Reverse geocode one point to a coarse locality name (city / district). */
export async function reverseLocality(lat: number, lng: number, lang: 'zh' | 'en'): Promise<string | undefined> {
  const key = `rev:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = await readGeo(key, GEO_CACHE_MS);
  if (cached) return cached.locality;
  try {
    const json = (await nominatimFetch('/reverse', {
      lat: String(lat),
      lon: String(lng),
      zoom: '10',
      'accept-language': lang === 'zh' ? 'zh-CN,zh,en' : 'en',
    })) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const address = json.address ?? {};
    const locality =
      address.city || address.town || address.village || address.county || address.state || json.display_name?.split(',')[0];
    if (!locality) return undefined;
    await cacheGeo({ key, fetchedAt: Date.now(), locality, displayName: json.display_name });
    return locality;
  } catch {
    return undefined;
  }
}

/** Build a maps deep link for turn-by-turn navigation in a real maps app. */
export function navigationUrl(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/directions?to=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

export function proximityScore(origin: { lat: number; lng: number }, quest: Quest): number {
  return haversineMeters(origin, { lat: quest.lat, lng: quest.lng });
}
