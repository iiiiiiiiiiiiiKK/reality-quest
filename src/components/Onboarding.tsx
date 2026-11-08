/**
 * First-run onboarding: three real steps + an explicit location-permission
 * disclosure. It never requests location by itself; the user chooses.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { translate, AUTHOR } from '../lib/i18n';
import type { Lang } from '../lib/types';

const STEPS = [
  { key: 'obStep1', glyph: '◈' },
  { key: 'obStep2', glyph: '⌖' },
  { key: 'obStep3', glyph: '⬢' },
] as const;

export default function Onboarding({ lang }: { lang: Lang }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const updateSettings = useStore((s) => s.updateSettings);
  const locate = useStore((s) => s.locate);
  const setLang = useStore((s) => s.setLang);
  const setTheme = useStore((s) => s.setTheme);
  const settings = useStore((s) => s.settings);
  const [step, setStep] = useState(0);
  const [wantsLocation, setWantsLocation] = useState(true);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    try {
      await updateSettings({ onboarded: true });
      if (wantsLocation) void locate();
    } finally {
      setFinishing(false);
    }
  };

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[1350] flex flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--signal) 16%, var(--ink-950)) 0%, var(--ink-950) 58%)',
        }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* top bar with lang/theme so the very first screen is usable */}
        <div
          className="flex items-center gap-2 px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg text-sm font-bold"
            style={{ background: 'linear-gradient(150deg, var(--signal-soft), var(--signal))', color: '#131009' }}
          >
            ◈
          </span>
          <span className="display text-[13px] font-bold tracking-tight">
            {lang === 'zh' ? '现实探索' : 'Reality Quest'}
          </span>
          <div className="flex-1" />
          <button type="button" className="chip" onClick={() => void setLang(lang === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? '中' : 'EN'}
          </button>
          <button
            type="button"
            className="chip px-2.5"
            onClick={() => void setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
          >
            {settings.theme === 'dark' ? '☾' : '☀'}
          </button>
        </div>

        <div className="scroll-y flex min-h-0 flex-1 flex-col justify-center px-5 py-6">
          <div className="mx-auto w-full max-w-md">
            {step === 0 ? (
              <div className="animate-rise">
                <h1 className="display text-[26px] font-bold leading-tight text-chalk-50 sm:text-3xl">
                  {t('obTitle')}
                </h1>
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-chalk-300">{t('obSubtitle')}</p>
                <p className="mono mt-3 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'var(--signal)' }}>
                  {t('tagline')}
                </p>
              </div>
            ) : (
              <div key={current.key} className="animate-rise">
                <span
                  aria-hidden
                  className="grid h-14 w-14 place-items-center rounded-2xl text-xl"
                  style={{
                    background: 'color-mix(in srgb, var(--signal) 16%, transparent)',
                    color: 'var(--signal)',
                  }}
                >
                  {current.glyph}
                </span>
                <h2 className="display mt-4 text-xl font-bold text-chalk-50">{t(`${current.key}Title`)}</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-chalk-300">{t(`${current.key}Body`)}</p>
              </div>
            )}

            {/* step 2 also shows the permission disclosure */}
            {step === 1 ? (
              <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--panel-border)' }}>
                <p className="text-[12px] font-semibold text-chalk-100">{t('obLocationTitle')}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-chalk-500">{t('obLocationBody')}</p>
                <label className="mt-2.5 flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={wantsLocation}
                    onChange={(e) => setWantsLocation(e.target.checked)}
                    className="h-4 w-4 accent-[var(--signal)]"
                  />
                  <span className="text-[11.5px] text-chalk-300">{t('locate')}</span>
                </label>
              </div>
            ) : null}

            {/* dots */}
            <div className="mt-6 flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <span
                  key={s.key}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === step ? 22 : 6,
                    background: i === step ? 'var(--signal)' : 'color-mix(in srgb, var(--chalk-50) 18%, transparent)',
                  }}
                />
              ))}
            </div>

            <div className="mt-5 flex gap-2">
              {step > 0 ? (
                <button type="button" className="btn btn-ghost flex-1" onClick={() => setStep((s) => s - 1)}>
                  {t('back')}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-primary flex-[2]"
                data-testid="onboarding-next"
                disabled={finishing}
                onClick={() => (isLast ? void finish() : setStep((s) => s + 1))}
              >
                {isLast ? t('obStart') : lang === 'zh' ? '下一步' : 'Next'}
              </button>
            </div>

            <p className="mono mt-5 text-center text-[10px] text-chalk-500">
              {t('author')}{' '}
              <a href={AUTHOR.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted" style={{ color: 'var(--signal)' }}>
                {AUTHOR.glyph} {AUTHOR.handle}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
