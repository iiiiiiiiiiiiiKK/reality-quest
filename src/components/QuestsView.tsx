/**
 * Quests tab — the full discovery surface for small screens where the map has
 * no side dock. Shares the exact same list component as the map dock so the
 * two views can never drift apart.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { translate } from '../lib/i18n';
import { haversineMeters } from '../lib/geo';
import { levelForXp } from '../lib/levels';
import { QuestList } from './MapView';
import type { Lang, Quest, QuestCategory } from '../lib/types';

export default function QuestsView({ lang }: { lang: Lang }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const discovered = useStore((s) => s.discovered);
  const localQuests = useStore((s) => s.localQuests);
  const completions = useStore((s) => s.completions);
  const progress = useStore((s) => s.progress);
  const location = useStore((s) => s.location);
  const mapCenter = useStore((s) => s.mapCenter);
  const discovering = useStore((s) => s.discovering);
  const discoverError = useStore((s) => s.discoverError);
  const discover = useStore((s) => s.discover);
  const discoveredAt = useStore((s) => s.discoveredAt);
  const discoveredCached = useStore((s) => s.discoveredCached);
  const selectQuest = useStore((s) => s.selectQuest);
  const locate = useStore((s) => s.locate);
  const profile = useStore((s) => s.profile);

  const [category, setCategory] = useState<QuestCategory | 'all'>('all');
  const [sort, setSort] = useState<'distance' | 'xp'>('distance');

  const completedIds = useMemo(() => new Set(completions.map((c) => c.questId)), [completions]);
  const activeIds = useMemo(() => new Set(progress.map((p) => p.questId)), [progress]);

  const all = useMemo(() => {
    const map = new Map<string, Quest>();
    for (const q of discovered) map.set(q.id, q);
    for (const q of localQuests) map.set(q.id, q);
    return Array.from(map.values());
  }, [discovered, localQuests]);

  const items = useMemo(() => {
    const origin = location ?? mapCenter ?? { lat: 0, lng: 0 };
    const withDistance = all.map((q) => ({ quest: q, distance: haversineMeters(origin, q) }));
    const filtered = withDistance.filter(({ quest }) => category === 'all' || quest.category === category);
    filtered.sort((a, b) => {
      const ac = completedIds.has(a.quest.id) ? 1 : 0;
      const bc = completedIds.has(b.quest.id) ? 1 : 0;
      if (ac !== bc) return ac - bc;
      return sort === 'distance' ? a.distance - b.distance : b.quest.xp - a.quest.xp;
    });
    return filtered;
  }, [all, category, sort, location, mapCenter, completedIds]);

  const statusOf = (id: string) =>
    completedIds.has(id) ? 'completed' : activeIds.has(id) ? 'active' : 'available';

  return (
    <div className="scroll-y h-full">
      <div className="mx-auto max-w-3xl pb-6">
        <header className="px-4 pb-2 pt-4">
          <h1 className="display text-lg font-bold text-chalk-50">{t('nearbyQuests')}</h1>
          <p className="mono mt-0.5 text-[10px] text-chalk-500">{t('questsSource')}</p>
        </header>
        <QuestList
          lang={lang}
          items={items}
          statusOf={statusOf}
          level={levelForXp(profile.xp).level}
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
            const origin = location ?? mapCenter ?? { lat: 0, lng: 0 };
            void discover(origin.lat, origin.lng, { force: true });
          }}
          onLocate={() => void locate()}
          onSelect={(id) => selectQuest(id)}
          onOpenQuests={() => undefined}
          t={t}
        />
      </div>
    </div>
  );
}
