/**
 * Level-up and badge-reveal overlays.
 *
 * These are pure presentation: they read state that `completeQuest` already
 * committed, so dismissing them can never roll back a reward.
 */

import { useMemo } from 'react';
import { useStore } from '../store';
import { pickLang, translate } from '../lib/i18n';
import { levelForXp } from '../lib/levels';
import type { Lang } from '../lib/types';

export default function RewardOverlays({ lang }: { lang: Lang }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const levelUp = useStore((s) => s.levelUp);
  const dismissLevelUp = useStore((s) => s.dismissLevelUp);
  const badgeQueue = useStore((s) => s.badgeQueue);
  const dismissBadge = useStore((s) => s.dismissBadge);
  const profile = useStore((s) => s.profile);

  const badge = badgeQueue[0];

  if (levelUp) {
    const def = levelForXp(profile.xp).level === levelUp.level ? levelForXp(profile.xp) : levelForXp(0);
    const name = lang === 'zh' ? def.name.zh : def.name.en;
    return (
      <div className="fixed inset-0 z-[1400] flex items-center justify-center px-5">
        <button type="button" aria-label="close" className="absolute inset-0 animate-fade bg-black/72 backdrop-blur-sm" onClick={dismissLevelUp} />
        <div className="panel relative w-full max-w-sm animate-rise rounded-3xl p-6 text-center">
          <div
            aria-hidden
            className="mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl"
            style={{
              background: 'radial-gradient(circle at 30% 25%, var(--signal-soft), var(--signal))',
              color: '#14100a',
              boxShadow: '0 0 60px -10px var(--signal-glow)',
            }}
          >
            ⬢
          </div>
          <p className="display mt-4 text-xl font-bold text-chalk-50">{t('levelUpTitle')}</p>
          <p className="mt-1 text-[13px] text-chalk-300">
            {t('levelUpBody', { n: levelUp.level, name })}
          </p>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={dismissLevelUp}>
            {t('keepExploring')}
          </button>
        </div>
      </div>
    );
  }

  if (badge) {
    const name = pickLang(badge.badge.name, lang);
    const desc = pickLang(badge.badge.description, lang);
    return (
      <div className="fixed inset-0 z-[1400] flex items-center justify-center px-5">
        <button type="button" aria-label="close" className="absolute inset-0 animate-fade bg-black/72 backdrop-blur-sm" onClick={dismissBadge} />
        <div className="panel relative w-full max-w-sm animate-rise rounded-3xl p-6 text-center">
          <p className="mono text-[10px] uppercase tracking-[0.22em] text-chalk-500">{t('badgeUnlocked')}</p>
          <div
            aria-hidden
            className="mx-auto mt-3 grid h-24 w-24 animate-badgePop place-items-center rounded-full text-3xl"
            style={{
              background: `radial-gradient(circle at 32% 26%, color-mix(in srgb, ${badge.badge.accent} 92%, white), ${badge.badge.accent})`,
              color: '#0d1210',
              boxShadow: `0 0 70px -12px ${badge.badge.accent}`,
            }}
          >
            {badge.badge.glyph}
          </div>
          <p className="display mt-4 text-lg font-bold text-chalk-50">{name}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-chalk-300">{desc}</p>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={dismissBadge}>
            {badgeQueue.length > 1 ? `${t('done')} (${badgeQueue.length})` : t('done')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
