/**
 * Explore map — the core page.
 *
 * Desktop: map is the hero, quests are docked to the right.
 * Mobile: map fills the viewport, a bottom sheet holds the quest list and can
 * be collapsed to a single handle so the map stays usable with one hand.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { translate, pickLang } from '../lib/i18n';
import { formatDistance, haversineMeters } from '../lib/geo';
import { searchPlaces, type PlaceResult } from '../lib/services';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, levelForXp } from '../lib/levels';
import QuestMap from './QuestMap';
import { AuthorLink, CategoryDot, EmptyState, Sheet, Skeleton, Spinner, useMediaQuery } from './ui';
import type { Lang, Quest, QuestCategory } from '../lib/types';

type SortMode = 'distance' | 'xp';
const FALLBACK_CENTER = { lat: 31.2304, lng: 121.4737 }; // Shanghai — only a default view, never a quest.

export default function MapView({ lang, onOpenQuests }: { lang: Lang; onOpenQuests: () => void }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);

  const location = useStore((s) => s.location);
  const locating = useStore((s) => s.locating);
  const locationError = useStore((s) => s.locationError);
  const locate = useStore((s) => s.locate);
  const permission = useStore((s) => s.permission);

  const discovered = useStore((s) => s.discovered);
  const discovering = useStore((s) => s.discovering);
  const discoverError = useStore((s) => s.discoverError);
  const discover = useStore((s) => s.discover);
  const discoveredAt = useStore((s) => s.discoveredAt);
  const discoveredCached = useStore((s) => s.discoveredCached);

  const localQuests = useStore((s) => s.localQuests);
  const completions = useStore((s) => s.completions);
  const progress = useStore((s) => s.progress);
  const selectedQuestId = useStore((s) => s.selectedQuestId);
  const selectQuest = useStore((s) => s.selectQuest);
  const setMapCenter = useStore((s) => s.setMapCenter);
  const mapCenter = useStore((s) => s.mapCenter);
  const profile = useStore((s) => s.profile);
  const pushToast = useStore((s) => s.pushToast);

  const [category, setCategory] = useState<QuestCategory | 'all'>('all');
  const [sort, setSort] = useState<SortMode>('distance');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [randomBusy, setRandomBusy] = useState(false);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const didInitialDiscover = useRef(false);

  const center = useMemo(() => {
    const base = mapCenter ?? location ?? FALLBACK_CENTER;
    return { lat: base.lat, lng: base.lng, zoom: mapCenter?.zoom ?? 14 };
  }, [mapCenter, location]);

  /* --------------------------------------------------- initial discovery */
  useEffect(() => {
    if (didInitialDiscover.current) return;
    didInitialDiscover.current = true;
    // Works with or without a GPS fix: without one we seed the curated real
    // landmarks around the default view so the app is never an empty map.
    const origin = location ?? mapCenter ?? FALLBACK_CENTER;
    void discover(origin.lat, origin.lng);
  }, [location, mapCenter, discover]);

  useEffect(() => {
    if (location && discovered.length === 0 && !discovering) {
      void discover(location.lat, location.lng);
    }
    // Only re-run when the user moves substantially; discovery is cached anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.lat, location?.lng]);

  /* ----------------------------------------------------- ask for location */
  const requestLocation = useCallback(async () => {
    const fix = await locate();
    if (!fix) return;
    setFlyTarget({ lat: fix.lat, lng: fix.lng, zoom: 15 });
    await discover(fix.lat, fix.lng);
  }, [locate, discover]);

  /* --------------------------------------------------------------- search */
  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(false);
    try {
      const found = await searchPlaces(q, lang);
      setResults(found);
      if (found.length === 0) pushToast('info', t('searchEmpty'));
    } catch {
      setSearchError(true);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, lang, pushToast, t]);

  const goToPlace = useCallback(
    (place: PlaceResult) => {
      setFlyTarget({ lat: place.lat, lng: place.lng, zoom: 14 });
      setMapCenter({ lat: place.lat, lng: place.lng, zoom: 14 });
      setSearchOpen(false);
      setResults([]);
      void discover(place.lat, place.lng, { force: true });
    },
    [discover, setMapCenter],
  );

  /* -------------------------------------------------------- merged quests */
  const allQuests = useMemo(() => {
    const map = new Map<string, Quest>();
    for (const q of discovered) map.set(q.id, q);
    for (const q of localQuests) map.set(q.id, q);
    return Array.from(map.values());
  }, [discovered, localQuests]);

  const completedIds = useMemo(() => new Set(completions.map((c) => c.questId)), [completions]);
  const activeIds = useMemo(() => new Set(progress.map((p) => p.questId)), [progress]);

  const visible = useMemo(() => {
    const origin = location ?? center;
    const withDistance = allQuests.map((q) => ({
      quest: q,
      distance: haversineMeters(origin, { lat: q.lat, lng: q.lng }),
    }));
    const filtered = withDistance.filter(({ quest }) => category === 'all' || quest.category === category);
    filtered.sort((a, b) => {
      const ac = completedIds.has(a.quest.id) ? 1 : 0;
      const bc = completedIds.has(b.quest.id) ? 1 : 0;
      if (ac !== bc) return ac - bc; // unfinished first
      return sort === 'distance' ? a.distance - b.distance : b.quest.xp - a.quest.xp;
    });
    return filtered;
  }, [allQuests, category, sort, location, center, completedIds]);

  /* -------------------------------------------------------- random quest */
  const randomPick = useCallback(async () => {
    setRandomBusy(true);
    try {
      let pool = allQuests.filter((q) => !completedIds.has(q.id) && q.source !== 'community');
      if (pool.length === 0 && location) {
        await discover(location.lat, location.lng, { force: true });
        pool = useStore
          .getState()
          .discovered.filter((q) => !completedIds.has(q.id));
      }
      if (pool.length === 0) {
        pushToast('info', t('randomEmpty'));
        return;
      }
      // Prefer places that are walkable (<= 3 km) but never invent a location.
      const origin = location ?? center;
      const walkable = pool.filter((q) => haversineMeters(origin, q) <= 3000);
      const chosen = (walkable.length > 0 ? walkable : pool)[
        Math.floor(Math.random() * (walkable.length > 0 ? walkable.length : pool.length))
      ];
      if (!chosen) return;
      selectQuest(chosen.id);
      setFlyTarget({ lat: chosen.lat, lng: chosen.lng, zoom: 16 });
      pushToast('success', `${t('randomFound')}: ${pickLang(chosen.title, lang)}`);
    } finally {
      setRandomBusy(false);
    }
  }, [allQuests, completedIds, location, center, discover, selectQuest, pushToast, t, lang]);

  const statusOf = (id: string): 'completed' | 'active' | 'available' => {
    if (completedIds.has(id)) return 'completed';
    if (activeIds.has(id)) return 'active';
    return 'available';
  };

  const level = levelForXp(profile.xp).level;

  /* ------------------------------------------------------------------ UI */
  return (
    <div className="relative flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <QuestMap
          lang={lang}
          center={center}
          zoom={center.zoom}
          quests={allQuests}
          completions={completions}
          selectedId={selectedQuestId}
          location={location}
          flyTo={flyTarget}
          onSelect={(id) => {
            selectQuest(id);
            const q = allQuests.find((x) => x.id === id);
            if (q) setFlyTarget({ lat: q.lat, lng: q.lng });
          }}
          onCenterChange={(c) => setMapCenter(c)}
          onTileError={() => setTilesFailed(true)}
        />

        {/* ------------------------------------------------------ map HUD */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex flex-col gap-2 p-2.5 sm:p-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          <div className="pointer-events-auto flex items-start gap-2">
            {searchOpen ? (
              <form
                className="panel flex min-w-0 flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runSearch();
                }}
              >
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm outline-none placeholder:text-chalk-500"
                  aria-label={t('search')}
                  inputMode="search"
                  enterKeyHint="search"
                />
                <button type="submit" className="btn btn-primary min-h-0 px-3 py-1.5 text-xs" disabled={searching}>
                  {searching ? '…' : '⌕'}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet min-h-0 px-2 py-1.5 text-sm"
                  onClick={() => {
                    setSearchOpen(false);
                    setResults([]);
                    setQuery('');
                  }}
                  aria-label={t('clearSearch')}
                >
                  ×
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="panel pointer-events-auto flex h-11 items-center gap-2 rounded-xl px-3.5 text-sm text-chalk-300 shadow-panel"
                  aria-label={t('search')}
                >
                  <span aria-hidden>⌕</span>
                  <span className="hidden sm:inline">{t('search')}</span>
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => void randomPick()}
                  disabled={randomBusy}
                  className="panel pointer-events-auto flex h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-medium shadow-panel"
                  style={{ color: 'var(--signal)' }}
                  aria-label={t('randomTitle')}
                >
                  <span aria-hidden className={randomBusy ? 'animate-spin' : ''}>
                    ✦
                  </span>
                  <span className="hidden sm:inline">{randomBusy ? t('randomPicking') : t('randomTitle')}</span>
                </button>
                {!isDesktop && (
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    className="panel pointer-events-auto flex h-11 items-center gap-2 rounded-xl px-3 text-sm shadow-panel"
                    aria-label={t('nearbyQuests')}
                  >
                    <span aria-hidden>☰</span>
                    <span className="mono text-[11px] text-chalk-300">{visible.length}</span>
                  </button>
                )}
              </>
            )}
          </div>

          {searchOpen && results.length > 0 ? (
            <div className="panel pointer-events-auto max-h-[42dvh] overflow-hidden rounded-xl shadow-panel">
              <div className="scroll-y max-h-[42dvh]">
                {results.map((r) => (
                  <button
                    key={`${r.lat},${r.lng},${r.displayName}`}
                    type="button"
                    onClick={() => goToPlace(r)}
                    className="flex w-full items-start gap-2 border-b px-3 py-2.5 text-left text-xs leading-snug last:border-0 hairline hover:bg-[color-mix(in_srgb,var(--chalk-50)_5%,transparent)]"
                  >
                    <span aria-hidden className="mt-0.5 text-chalk-500">
                      ⌖
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-chalk-100">{r.displayName}</span>
                      {r.type ? <span className="mono mt-0.5 block text-[10px] text-chalk-500">{r.type}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {searchOpen && searchError ? (
            <div className="panel pointer-events-auto rounded-xl px-3 py-2 text-xs text-chalk-300 shadow-panel">
              {t('searchFailed')}
            </div>
          ) : null}

          {tilesFailed ? (
            <div
              className="panel pointer-events-auto self-start rounded-lg px-2.5 py-1.5 text-[11px]"
              style={{ color: 'var(--diff-hard)' }}
            >
              {t('mapTilesFailed')}
            </div>
          ) : null}
        </div>

        {/* --------------------------------------------------- map controls */}
        <div
          className="absolute right-2.5 z-[500] flex flex-col gap-2 sm:right-3"
          style={{ bottom: isDesktop ? '1rem' : 'calc(6.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={() => void requestLocation()}
            disabled={locating}
            className="grid h-11 w-11 place-items-center rounded-xl border text-lg shadow-panel transition active:scale-95"
            style={{
              background: 'var(--panel-bg-solid)',
              borderColor: 'var(--panel-border)',
              color: location ? '#2ea8ff' : 'var(--chalk-300)',
            }}
            aria-label={location ? t('recenter') : t('locate')}
            title={location ? t('recenter') : t('locate')}
          >
            {locating ? <Spinner size={15} /> : '⌖'}
          </button>
          {location ? (
            <div
              className="rounded-xl border px-1.5 py-1 text-center shadow-panel"
              style={{ background: 'var(--panel-bg-solid)', borderColor: 'var(--panel-border)' }}
            >
              <span className="mono block text-[9px] leading-none text-chalk-500">{t('accuracyValue')}</span>
              <span className="mono block text-[10px] font-semibold leading-tight text-chalk-100">
                ±{Math.round(location.accuracy)}m
              </span>
            </div>
          ) : null}
        </div>

        {/* ------------------------------------------------ mobile bottom sheet */}
        {!isDesktop && (
          <>
            {!sheetOpen ? (
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="panel absolute inset-x-2 z-[600] flex items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-panel transition active:scale-[.99]"
                style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
              >
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm"
                  style={{ background: 'color-mix(in srgb, var(--signal) 16%, transparent)', color: 'var(--signal)' }}
                >
                  ❖
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-chalk-50">{t('nearbyQuests')}</span>
                  <span className="mono block text-[11px] text-chalk-500">
                    {discovering ? t('loadingQuests') : `${visible.length} ${t('nearbyQuests')}`}
                  </span>
                </span>
                <span aria-hidden className="text-chalk-500">
                  ↑
                </span>
              </button>
            ) : null}

            <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('nearbyQuests')}>
              <QuestList
                lang={lang}
                items={visible}
                statusOf={statusOf}
                level={level}
                category={category}
                setCategory={setCategory}
                sort={sort}
                setSort={setSort}
                loading={discovering}
                error={discoverError}
                discoveredAt={discoveredAt}
                cached={discoveredCached}
                hasLocation={Boolean(location)}
                searching={discovering}
                onRetry={() => {
                  const origin = location ?? center;
                  void discover(origin.lat, origin.lng, { force: true });
                }}
                onLocate={() => void requestLocation()}
                onSelect={(id) => {
                  selectQuest(id);
                  setSheetOpen(false);
                }}
                onOpenQuests={() => {
                  setSheetOpen(false);
                  onOpenQuests();
                }}
                t={t}
              />
            </Sheet>
          </>
        )}

        {/* ------------------------------------------------- location nudges */}
        {!location && !locating && (permission === 'denied' || locationError) ? (
          <div
            className="panel absolute inset-x-2 z-[610] rounded-xl p-3 shadow-panel"
            style={{
              bottom: isDesktop ? '1rem' : 'calc(4.75rem + env(safe-area-inset-bottom, 0px))',
              borderColor: 'color-mix(in srgb, var(--diff-hard) 34%, transparent)',
            }}
            role="alert"
          >
            <p className="text-[13px] font-semibold" style={{ color: 'var(--diff-hard)' }}>
              {locationError === 'unsupported' ? t('locationUnsupported') : t('locationDenied')}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-chalk-300">
              {locationError === 'unsupported' ? t('locationUnsupportedHelp') : t('locationDeniedHelp')}
            </p>
            {locationError !== 'unsupported' ? (
              <button type="button" className="btn btn-ghost mt-2 min-h-0 px-3 py-1.5 text-xs" onClick={() => void requestLocation()}>
                {t('retryLocate')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------------ desktop dock */}
      {isDesktop ? (
        <aside className="hidden w-[382px] shrink-0 flex-col border-l lg:flex hairline" style={{ background: 'color-mix(in srgb, var(--ink-900) 62%, transparent)' }}>
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3 hairline">
            <div className="min-w-0">
              <h1 className="display truncate text-sm font-bold text-chalk-50">{t('nearbyQuests')}</h1>
              <p className="mono truncate text-[10px] text-chalk-500">{t('questsSource')}</p>
            </div>
            <AuthorLink lang={lang} compact />
          </div>
          <div className="scroll-y min-h-0 flex-1">
            <QuestList
              lang={lang}
              items={visible}
              statusOf={statusOf}
              level={level}
              category={category}
              setCategory={setCategory}
              sort={sort}
              setSort={setSort}
              loading={discovering}
              error={discoverError}
              discoveredAt={discoveredAt}
              cached={discoveredCached}
              hasLocation={Boolean(location)}
              searching={discovering}
              onRetry={() => {
                const origin = location ?? center;
                void discover(origin.lat, origin.lng, { force: true });
              }}
              onLocate={() => void requestLocation()}
              onSelect={(id) => selectQuest(id)}
              onOpenQuests={onOpenQuests}
              t={t}
            />
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- quest list */

interface QuestListProps {
  lang: Lang;
  items: Array<{ quest: Quest; distance: number }>;
  statusOf: (id: string) => 'completed' | 'active' | 'available';
  level: number;
  category: QuestCategory | 'all';
  setCategory: (c: QuestCategory | 'all') => void;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  loading: boolean;
  error?: string;
  discoveredAt?: number;
  cached: boolean;
  hasLocation: boolean;
  searching: boolean;
  onRetry: () => void;
  onLocate: () => void;
  onSelect: (id: string) => void;
  onOpenQuests: () => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}

const CATEGORIES: Array<QuestCategory | 'all'> = ['all', 'city', 'nature', 'culture', 'photo', 'random'];

export function QuestList(props: QuestListProps) {
  const { lang, items, statusOf, level, category, setCategory, sort, setSort, loading, error, onRetry, onLocate, onSelect, t, cached, discoveredAt, hasLocation } = props;

  return (
    <div className="flex flex-col">
      {/* filters — horizontally scrollable on small screens, never wrapping */}
      <div className="sticky top-0 z-10 border-b px-3 py-2 hairline" style={{ background: 'color-mix(in srgb, var(--ink-900) 92%, transparent)' }}>
        <div className="scroll-x -mx-1 flex gap-1.5 px-1 pb-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`chip min-h-[40px] shrink-0 ${category === c ? 'chip-active' : ''}`}
              aria-pressed={category === c}
            >
              {c === 'all' ? t('allCategories') : CATEGORY_LABEL[c][lang]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="mono flex min-h-[40px] min-w-[40px] items-center text-[10px] uppercase tracking-wider text-chalk-500 transition hover:text-chalk-100"
            onClick={() => setSort(sort === 'distance' ? 'xp' : 'distance')}
          >
            {sort === 'distance' ? `⇅ ${t('sortByDistance')}` : `⇅ ${t('sortByXp')}`}
          </button>
          {cached && discoveredAt ? (
            <span className="mono text-[10px] text-chalk-500">
              {t('cachedData', {
                time: new Date(discoveredAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </span>
          ) : null}
        </div>
      </div>

      {error && items.length > 0 ? (
        <div
          className="mx-3 mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[10.5px] leading-snug"
          style={{
            borderColor: 'color-mix(in srgb, var(--diff-hard) 32%, transparent)',
            background: 'color-mix(in srgb, var(--diff-hard) 7%, transparent)',
            color: 'var(--chalk-300)',
          }}
          role="status"
        >
          <span aria-hidden style={{ color: 'var(--diff-hard)' }}>
            {'\u26A0'}
          </span>
          <span className="flex-1">
            {t('degradedOffline')}
            <button
              type="button"
              className="ml-1.5 underline decoration-dotted underline-offset-2"
              onClick={onRetry}
            >
              {t('retry')}
            </button>
          </span>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="space-y-3 px-4 py-4">
          <p className="text-xs text-chalk-500">{t('loadingQuests')}</p>
          <Skeleton lines={4} />
          <Skeleton lines={4} />
          <Skeleton lines={3} />
        </div>
      ) : error && items.length === 0 ? (
        <EmptyState
          icon="⚠"
          title={t('questsFailed')}
          body={t('questsFailedHelp')}
          action={
            <button type="button" className="btn btn-ghost mt-1 min-h-0 px-3.5 py-2 text-xs" onClick={onRetry}>
              {t('retry')}
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="◌"
          title={t('noQuests')}
          body={t('noQuestsHelp')}
          action={
            !hasLocation ? (
              <button type="button" className="btn btn-primary mt-2 text-xs" onClick={onLocate}>
                {t('locate')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--panel-border)' }}>
          {items.map(({ quest, distance }) => {
            const state = statusOf(quest.id);
            const locked = Boolean(quest.minLevel && quest.minLevel > level);
            return (
              <li key={quest.id}>
                <button
                  type="button"
                  onClick={() => onSelect(quest.id)}
                  className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition hover:bg-[color-mix(in_srgb,var(--chalk-50)_4%,transparent)] active:bg-[color-mix(in_srgb,var(--chalk-50)_7%,transparent)]"
                  style={{ minHeight: 68 }}
                >
                  <span className="mt-1.5">
                    <CategoryDot category={quest.category} size={9} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="clamp-1 flex-1 text-[13.5px] font-semibold leading-snug text-chalk-50">
                        {pickLang(quest.title, lang)}
                      </span>
                      {state === 'completed' ? (
                        <span className="mono shrink-0 text-[10px]" style={{ color: 'var(--diff-easy)' }}>
                          ✓
                        </span>
                      ) : state === 'active' ? (
                        <span className="mono shrink-0 text-[10px]" style={{ color: 'var(--signal)' }}>
                          ◐
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="mono text-[10.5px] text-chalk-500">
                        {formatDistance(distance, lang)}
                      </span>
                      <span aria-hidden className="text-[9px] text-chalk-500">
                        ·
                      </span>
                      <span className="mono text-[10.5px]" style={{ color: `var(--diff-${quest.difficulty})` }}>
                        {DIFFICULTY_LABEL[quest.difficulty][lang]}
                      </span>
                      <span aria-hidden className="text-[9px] text-chalk-500">
                        ·
                      </span>
                      <span className="mono text-[10.5px] text-chalk-500">+{quest.xp} XP</span>
                      {quest.source === 'community' ? (
                        <span className="chip px-1.5 py-0 text-[9px]">{t('sourceCommunity')}</span>
                      ) : null}
                      {locked ? (
                        <span className="chip px-1.5 py-0 text-[9px]" style={{ color: 'var(--diff-hard)' }}>
                          {t('requiresLevel', { n: quest.minLevel ?? 1 })}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="px-4 py-3 text-center">
            <span className="mono text-[10px] text-chalk-500">{t('questsSource')}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
