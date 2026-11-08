/**
 * Local ranks.
 *
 * The spec forbids fake global leaderboards, so this view is explicit: it ranks
 * *your own verified records* by three metrics and states clearly that no
 * multi-user data exists until a backend is deployed.
 */

import { useMemo, useState } from 'react';
import { useStore, estimateTrailKm } from '../store';
import { pickLang, translate } from '../lib/i18n';
import { haversineMeters } from '../lib/geo';
import { Sheet, Segmented, EmptyState } from './ui';
import type { Lang } from '../lib/types';

type Metric = 'xp' | 'quests' | 'distance';

export default function RanksView({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const profile = useStore((s) => s.profile);
  const completions = useStore((s) => s.completions);
  const [metric, setMetric] = useState<Metric>('xp');

  const trailKm = useMemo(() => estimateTrailKm(completions), [completions]);
  const localities = useMemo(() => {
    const map = new Map<string, { count: number; xp: number; km: number }>();
    const sorted = [...completions].sort((a, b) => a.completedAt - b.completedAt);
    sorted.forEach((c, i) => {
      const key = (c.locality || (lang === 'zh' ? '未知地区' : 'Unknown area')).trim();
      const row = map.get(key) ?? { count: 0, xp: 0, km: 0 };
      row.count += 1;
      row.xp += c.xpAwarded;
      const prev = sorted[i - 1];
      if (prev) {
        const d = haversineMeters(prev.location, c.location);
        if (d > 0 && d < 80_000) row.km += d / 1000;
      }
      map.set(key, row);
    });
    return Array.from(map.entries());
  }, [completions, lang]);

  const rows = useMemo(() => {
    const base = localities.map(([name, row]) => ({ name, ...row }));
    if (base.length === 0 && completions.length > 0) {
      base.push({ name: profile.displayName, count: completions.length, xp: profile.xp, km: trailKm });
    }
    const sorted = [...base].sort((a, b) => {
      if (metric === 'xp') return b.xp - a.xp;
      if (metric === 'quests') return b.count - a.count;
      return b.km - a.km;
    });
    return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
  }, [localities, metric, completions.length, profile, trailKm]);

  return (
    <Sheet open onClose={onClose} title={t('ranks')}>
      <div
        className="mb-3 rounded-xl border p-2.5 text-[11.5px] leading-relaxed"
        style={{
          borderColor: 'color-mix(in srgb, var(--diff-hard) 30%, transparent)',
          background: 'color-mix(in srgb, var(--diff-hard) 7%, transparent)',
          color: 'var(--chalk-300)',
        }}
      >
        ℹ {t('ranksNote')}
      </div>

      <Segmented
        ariaLabel={t('ranks')}
        value={metric}
        onChange={setMetric}
        options={[
          { value: 'xp', label: t('rankByXp') },
          { value: 'quests', label: t('rankByQuests') },
          { value: 'distance', label: t('rankByDistance') },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState icon="♛" title={t('ranksEmpty')} />
      ) : (
        <ol className="mt-3 space-y-1.5">
          {rows.map((row) => (
            <li
              key={row.name}
              className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 hairline"
              style={
                row.name === profile.displayName
                  ? { borderColor: 'color-mix(in srgb, var(--signal) 40%, transparent)' }
                  : undefined
              }
            >
              <span
                className="mono grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold"
                style={{
                  background: row.rank <= 3 ? 'color-mix(in srgb, var(--signal) 18%, transparent)' : 'transparent',
                  color: row.rank <= 3 ? 'var(--signal)' : 'var(--chalk-500)',
                }}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-[12.5px] font-medium text-chalk-50">{row.name}</span>
                <span className="mono text-[10px] text-chalk-500">
                  {row.count} × · {row.xp} XP · {row.km.toFixed(1)} km
                </span>
              </span>
              <span className="mono shrink-0 text-[12px] font-semibold" style={{ color: 'var(--signal)' }}>
                {metric === 'xp' ? `${row.xp}` : metric === 'quests' ? `${row.count}` : `${row.km.toFixed(1)}`}
              </span>
            </li>
          ))}
        </ol>
      )}

      <p className="mono mt-4 text-center text-[9.5px] text-chalk-500">
        {pickLang({ zh: '本机记录', en: 'Local records' }, lang)} · {completions.length}
      </p>
    </Sheet>
  );
}
