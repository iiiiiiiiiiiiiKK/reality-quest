/**
 * Footprints — the personal exploration archive: stats, badge wall, timeline
 * and a map of *verified arrival points* (never quest creation coordinates).
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore, estimateTrailKm } from '../store';
import { pickLang, translate, formatDate } from '../lib/i18n';
import { formatDistance } from '../lib/geo';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, levelForXp, levelProgress } from '../lib/levels';
import { ACHIEVEMENTS, computeStats } from '../lib/achievements';
import { getPhoto } from '../lib/db';
import { CategoryDot, EmptyState, ProgressBar, Segmented } from './ui';
import QuestMap from './QuestMap';
import type { Completion, Lang } from '../lib/types';

type Range = '7d' | '30d' | 'all';

export default function FootprintsView({ lang }: { lang: Lang }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const completions = useStore((s) => s.completions);
  const achievements = useStore((s) => s.achievements);
  const profile = useStore((s) => s.profile);
  const location = useStore((s) => s.location);
  const setRecordVisibility = useStore((s) => s.setRecordVisibility);
  const removeCompletion = useStore((s) => s.removeCompletion);
  const pushToast = useStore((s) => s.pushToast);

  const [range, setRange] = useState<Range>('all');
  const [showMap, setShowMap] = useState(true);
  const [photoFor, setPhotoFor] = useState<string | undefined>();

  const unlockedIds = useMemo(() => new Set(achievements.map((a) => a.id)), [achievements]);
  const trailKm = useMemo(() => estimateTrailKm(completions), [completions]);
  const stats = useMemo(
    () => computeStats(completions, levelForXp(profile.xp).level, trailKm),
    [completions, profile.xp, trailKm],
  );
  const progress = levelProgress(profile.xp);

  const filtered = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - (range === '7d' ? 7 : 30) * 86_400_000;
    return [...completions].filter((c) => c.completedAt >= cutoff).sort((a, b) => b.completedAt - a.completedAt);
  }, [completions, range]);

  const cities = useMemo(
    () => new Set(completions.map((c) => c.locality).filter((x): x is string => Boolean(x))).size,
    [completions],
  );

  const center = useMemo(() => {
    if (completions.length > 0) {
      const c = completions[completions.length - 1]!;
      return { lat: c.location.lat, lng: c.location.lng };
    }
    return location ?? { lat: 31.2304, lng: 121.4737 };
  }, [completions, location]);

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-3xl px-4 pb-8 pt-4">
        <h1 className="display text-lg font-bold text-chalk-50">{t('footprints')}</h1>

        {/* ------------------------------------------------------ stats grid */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t('statQuests')} value={String(completions.length)} accent="var(--accent-city)" />
          <Stat label={t('statCities')} value={String(cities)} accent="var(--accent-nature)" />
          <Stat label={t('statDistance')} value={`${trailKm.toFixed(1)} km`} accent="var(--accent-culture)" />
          <Stat label={t('statXp')} value={`${profile.xp}`} accent="var(--signal)" />
        </div>

        {/* ---------------------------------------------------- level banner */}
        <div className="card mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="mono text-[10px] uppercase tracking-wider text-chalk-500">
                {t('statLevel')} {progress.level.level}
              </p>
              <p className="display truncate text-sm font-semibold text-chalk-50">
                {lang === 'zh' ? progress.level.name.zh : progress.level.name.en}
              </p>
            </div>
            <p className="mono shrink-0 text-[11px] text-chalk-300">
              {progress.next ? `${progress.current} / ${progress.target} XP` : `${profile.xp} XP`}
            </p>
          </div>
          <div className="mt-2">
            <ProgressBar ratio={progress.ratio} label="level" />
          </div>
        </div>

        {/* --------------------------------------------------------- badges */}
        <section className="mt-5">
          <div className="flex items-baseline justify-between">
            <h2 className="display text-sm font-bold text-chalk-50">{t('badges')}</h2>
            <span className="mono text-[10px] text-chalk-500">
              {unlockedIds.size}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {ACHIEVEMENTS.map((badge) => {
              const unlocked = unlockedIds.has(badge.id);
              const p = badge.progress?.(stats);
              return (
                <li key={badge.id}>
                  <div
                    className="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition"
                    style={{
                      borderColor: unlocked
                        ? `color-mix(in srgb, ${badge.accent} 40%, transparent)`
                        : 'var(--panel-border)',
                      background: unlocked
                        ? `color-mix(in srgb, ${badge.accent} 8%, transparent)`
                        : 'transparent',
                      opacity: unlocked ? 1 : 0.62,
                    }}
                    title={pickLang(badge.description, lang)}
                  >
                    <span
                      aria-hidden
                      className="grid h-11 w-11 place-items-center rounded-full text-lg"
                      style={
                        unlocked
                          ? {
                              background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${badge.accent} 92%, white), ${badge.accent})`,
                              color: '#0d1210',
                              boxShadow: `0 0 26px -8px ${badge.accent}`,
                            }
                          : {
                              background: 'color-mix(in srgb, var(--chalk-50) 7%, transparent)',
                              color: 'var(--chalk-500)',
                              filter: 'grayscale(1)',
                            }
                      }
                    >
                      {unlocked ? badge.glyph : '◌'}
                    </span>
                    <p className="clamp-2 text-[10.5px] font-semibold leading-tight text-chalk-100">
                      {pickLang(badge.name, lang)}
                    </p>
                    {!unlocked && p ? (
                      <p className="mono text-[9px] text-chalk-500">
                        {p.current}/{p.target}
                      </p>
                    ) : null}
                    {unlocked ? (
                      <p className="mono text-[9px]" style={{ color: badge.accent }}>
                        ✓
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---------------------------------------------------- footprint map */}
        <section className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="display text-sm font-bold text-chalk-50">{t('footprintMap')}</h2>
            <button
              type="button"
              onClick={() => setShowMap((v) => !v)}
              className="chip"
              aria-expanded={showMap}
            >
              {showMap ? '▾' : '▸'} {t('map')}
            </button>
          </div>
          {showMap ? (
            <div className="mt-2 h-[260px] overflow-hidden rounded-2xl border hairline sm:h-[320px]">
              <QuestMap
                lang={lang}
                center={center}
                zoom={completions.length > 0 ? 13 : 11}
                quests={[]}
                completions={completions}
                location={location}
                showFootprint
              />
            </div>
          ) : null}
        </section>

        {/* -------------------------------------------------------- timeline */}
        <section className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="display text-sm font-bold text-chalk-50">{t('timeline')}</h2>
            <Segmented
              ariaLabel={t('timeline')}
              value={range}
              onChange={setRange}
              options={[
                { value: '7d', label: t('filter7d') },
                { value: '30d', label: t('filter30d') },
                { value: 'all', label: t('filterAll') },
              ]}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="◌" title={t('noRecords')} body={t('noRecordsHelp')} />
          ) : (
            <ul className="mt-2 space-y-2">
              {filtered.map((c) => (
                <li key={c.id}>
                  <RecordRow
                    lang={lang}
                    completion={c}
                    t={t}
                    onTogglePublic={() => void setRecordVisibility(c.id, !c.isPublic)}
                    onDelete={() => {
                      if (window.confirm(t('confirmDeleteRecord'))) {
                        void removeCompletion(c.id);
                        pushToast('success', t('done'));
                      }
                    }}
                    onViewPhoto={() => setPhotoFor(c.photoId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {photoFor ? <PhotoModal photoId={photoFor} lang={lang} onClose={() => setPhotoFor(undefined)} /> : null}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border px-3 py-2.5 hairline">
      <p className="mono text-[9.5px] uppercase tracking-wider text-chalk-500">{label}</p>
      <p className="mono mt-0.5 text-[17px] font-bold leading-none" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}

function RecordRow({
  lang,
  completion,
  t,
  onTogglePublic,
  onDelete,
  onViewPhoto,
}: {
  lang: Lang;
  completion: Completion;
  t: (k: string, v?: Record<string, string | number>) => string;
  onTogglePublic: () => void;
  onDelete: () => void;
  onViewPhoto: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <button
        type="button"
        className="flex w-full items-start gap-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="mt-1">
          <CategoryDot category={completion.quest.category} size={9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-1 block text-[13px] font-semibold text-chalk-50">
            {pickLang(completion.quest.title, lang)}
          </span>
          <span className="mono mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-chalk-500">
            <span>{formatDate(completion.completedAt, lang)}</span>
            <span aria-hidden>·</span>
            <span style={{ color: `var(--diff-${completion.quest.difficulty})` }}>
              {DIFFICULTY_LABEL[completion.quest.difficulty][lang]}
            </span>
            <span aria-hidden>·</span>
            <span style={{ color: 'var(--signal)' }}>+{completion.xpAwarded} XP</span>
            {completion.hasPhoto ? <span aria-hidden>◉</span> : null}
            <span aria-hidden>·</span>
            <span>{completion.isPublic ? t('publicRecord') : t('privateRecord')}</span>
          </span>
        </span>
        <span aria-hidden className="mt-0.5 text-chalk-500">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        <div className="mt-2.5 space-y-2 border-t pt-2.5 hairline">
          {completion.text ? (
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-chalk-300">{completion.text}</p>
          ) : null}
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="mono text-[9px] uppercase tracking-wider text-chalk-500">{t('recordLocation')}</dt>
              <dd className="mono text-[10.5px] text-chalk-300">
                {completion.location.lat.toFixed(5)}, {completion.location.lng.toFixed(5)}
              </dd>
            </div>
            <div>
              <dt className="mono text-[9px] uppercase tracking-wider text-chalk-500">{t('distance')}</dt>
              <dd className="mono text-[10.5px] text-chalk-300">
                {formatDistance(completion.distanceMeters, lang)} ±{Math.round(completion.location.accuracy)}m
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {completion.hasPhoto && completion.photoId ? (
              <button type="button" className="chip" onClick={onViewPhoto}>
                ◉ {t('recordPhoto')}
              </button>
            ) : null}
            <a
              className="chip"
              href={`https://www.openstreetmap.org/?mlat=${completion.location.lat}&mlon=${completion.location.lng}#map=17/${completion.location.lat}/${completion.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              ⌖ OSM
            </a>
            <button type="button" className="chip" onClick={onTogglePublic}>
              {completion.isPublic ? '◐ ' + t('privateRecord') : '◑ ' + t('publicRecord')}
            </button>
            <button type="button" className="chip" style={{ color: 'var(--diff-epic)' }} onClick={onDelete}>
              ✕ {t('deleteRecord')}
            </button>
          </div>
          <p className="mono text-[9.5px] text-chalk-500">
            {CATEGORY_LABEL[completion.quest.category][lang]}
            {completion.locality ? ` · ${completion.locality}` : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PhotoModal({ photoId, lang, onClose }: { photoId: string; lang: Lang; onClose: () => void }) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked: string | undefined;
    void (async () => {
      const rec = await getPhoto(photoId);
      if (!rec) {
        setError(true);
        return;
      }
      const u = URL.createObjectURL(rec.blob);
      revoked = u;
      setUrl(u);
    })();
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [photoId]);

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center px-3">
      <button type="button" aria-label="close" className="absolute inset-0 bg-black/82 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[86dvh] w-full max-w-2xl overflow-hidden rounded-2xl">
        {error ? (
          <div className="panel p-6 text-center text-sm text-chalk-300">{translate(lang, 'notAvailable')}</div>
        ) : url ? (
          <img src={url} alt="" className="max-h-[86dvh] w-full object-contain" />
        ) : (
          <div className="panel grid h-56 place-items-center text-sm text-chalk-500">{translate(lang, 'loading')}</div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="btn btn-ghost absolute right-2 top-2 h-9 min-h-0 w-9 rounded-full p-0 text-sm"
          aria-label={translate(lang, 'close')}
        >
          ×
        </button>
      </div>
    </div>
  );
}
