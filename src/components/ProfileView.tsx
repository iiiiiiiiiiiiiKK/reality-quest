/**
 * Profile tab: identity, level card, entry points to ranks / settings.
 * Also doubles as the mobile "more" sheet, so every secondary destination is
 * reachable in one tap on a phone.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore, estimateTrailKm } from '../store';
import { translate, formatDate, AUTHOR } from '../lib/i18n';
import { levelProgress } from '../lib/levels';
import { AuthorLink, ProgressBar, Sheet } from './ui';
import type { Lang } from '../lib/types';

export default function ProfileView({
  lang,
  modal,
  onClose,
  onOpenSettings,
  onOpenRanks,
}: {
  lang: Lang;
  modal?: boolean;
  onClose?: () => void;
  onOpenSettings: () => void;
  onOpenRanks: () => void;
}) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const profile = useStore((s) => s.profile);
  const completions = useStore((s) => s.completions);
  const achievements = useStore((s) => s.achievements);
  const setNickname = useStore((s) => s.setNickname);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const setLang = useStore((s) => s.setLang);
  const setTheme = useStore((s) => s.setTheme);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState(profile.displayName);
  useEffect(() => setName(profile.displayName), [profile.displayName]);

  const progress = levelProgress(profile.xp);
  const trailKm = useMemo(() => estimateTrailKm(completions), [completions]);
  const cities = useMemo(
    () => new Set(completions.map((c) => c.locality).filter(Boolean)).size,
    [completions],
  );

  const body = (
    <div className="scroll-y h-full px-4 pb-8 pt-4">
      <div className="mx-auto max-w-xl">
        <div className="card">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-bold"
              style={{
                background: 'linear-gradient(150deg, var(--signal-soft), var(--signal))',
                color: '#131009',
              }}
            >
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="display truncate text-base font-bold text-chalk-50">{profile.displayName}</p>
              <p className="mono text-[10.5px] text-chalk-500">
                Lv.{progress.level.level} {'\u00B7'} {lang === 'zh' ? progress.level.name.zh : progress.level.name.en}
              </p>
              <p className="mono text-[10px] text-chalk-500">
                {t('joinedAt', { date: formatDate(profile.createdAt, lang) })}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="mono text-[10px] uppercase tracking-wider text-chalk-500">
                {progress.next ? `${t('statXp')} \u2192 Lv.${progress.next.level}` : `${t('statXp')} (MAX)`}
              </span>
              <span className="mono text-[10.5px] text-chalk-300">
                {progress.next ? `${progress.current}/${progress.target}` : `${profile.xp}`}
              </span>
            </div>
            <div className="mt-1.5">
              <ProgressBar ratio={progress.ratio} label="xp" />
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="field flex-1"
              value={name}
              maxLength={32}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('nickname')}
              placeholder={t('nickname')}
            />
            <button
              type="button"
              className="btn btn-ghost shrink-0 px-3.5 text-xs"
              onClick={() => {
                void setNickname(name);
                pushToast('success', t('done'));
              }}
            >
              {t('saveName')}
            </button>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <Mini label={t('statQuests')} value={String(completions.length)} />
          <Mini label={t('statCities')} value={String(cities)} />
          <Mini label={t('statDistance')} value={`${trailKm.toFixed(1)}km`} />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <Mini label={t('badges')} value={String(achievements.length)} />
          <Mini label={t('statXp')} value={String(profile.xp)} />
          <Mini label={t('statLevel')} value={`Lv.${progress.level.level}`} />
        </div>

        <div className="mt-3 space-y-1.5">
          <RowAction glyph={'\u265B'} label={t('navRanks')} onClick={onOpenRanks} />
          <RowAction glyph={'\u2699'} label={t('navSettings')} onClick={onOpenSettings} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => void setLang(lang === 'zh' ? 'en' : 'zh')}
          >
            {lang === 'zh' ? 'EN \u00B7 English' : '\u4E2D \u00B7 \u4E2D\u6587'}
          </button>
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => void setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
          >
            {settings.theme === 'dark' ? `\u2600 ${t('themeLight')}` : `\u263E ${t('themeDark')}`}
          </button>
        </div>

        <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 hairline">
          <input
            type="checkbox"
            checked={settings.shareRecords}
            onChange={(e) => void updateSettings({ shareRecords: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-[var(--signal)]"
          />
          <span className="text-[11.5px] leading-relaxed text-chalk-300">{t('proofShare')}</span>
        </label>

        <section className="mt-4">
          <h2 className="display text-sm font-bold text-chalk-50">{t('levelHistory')}</h2>
          {profile.levelHistory.length === 0 ? (
            <p className="mt-1 text-[11.5px] text-chalk-500">{t('noLevelHistory')}</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {[...profile.levelHistory].reverse().map((h, i) => (
                <li
                  key={`${h.level}-${h.at}-${i}`}
                  className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 hairline"
                >
                  <span className="mono text-[11px]" style={{ color: 'var(--signal)' }}>
                    Lv.{h.level}
                  </span>
                  <span className="mono text-[10px] text-chalk-500">{formatDate(h.at, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 rounded-xl border p-3 hairline">
          <p className="mono text-[9.5px] uppercase tracking-wider text-chalk-500">{t('author')}</p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="mono text-[12px] text-chalk-100">{AUTHOR.handle}</p>
              <p className="text-[10.5px] leading-snug text-chalk-500">{t('authorFollow')}</p>
            </div>
            <AuthorLink lang={lang} />
          </div>
        </section>

        <p className="mono mt-4 text-center text-[9.5px] leading-relaxed text-chalk-500">
          Reality Quest {'\u00B7'} MIT License {'\u00B7'}{' '}
          <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted">
            {AUTHOR.handle}
          </a>
        </p>
      </div>
    </div>
  );

  if (modal) {
    return (
      <Sheet open onClose={onClose ?? (() => undefined)} title={t('profile')}>
        <div className="-mx-5 px-0">{body}</div>
      </Sheet>
    );
  }
  return <div className="h-full">{body}</div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border px-2.5 py-2 text-center hairline">
      <p className="mono text-[15px] font-bold leading-none text-chalk-50">{value}</p>
      <p className="mono mt-0.5 text-[9px] uppercase tracking-wider text-chalk-500">{label}</p>
    </div>
  );
}

function RowAction({ glyph, label, onClick }: { glyph: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-[color-mix(in_srgb,var(--chalk-50)_4%,transparent)] hairline"
      style={{ minHeight: 48 }}
    >
      <span aria-hidden className="text-sm text-chalk-300">
        {glyph}
      </span>
      <span className="flex-1 text-[13px] text-chalk-100">{label}</span>
      <span aria-hidden className="text-chalk-500">
        {'\u203A'}
      </span>
    </button>
  );
}
