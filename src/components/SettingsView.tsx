/**
 * Settings: language, theme, data export/import/clear, privacy + service
 * limits. Every control here performs a real action.
 */

import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { translate } from '../lib/i18n';
import { AUTHOR } from '../lib/i18n';
import { exportBundle } from '../lib/db';
import { AuthorLink, Sheet, Spinner } from './ui';
import type { Lang } from '../lib/types';

export default function SettingsView({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const settings = useStore((s) => s.settings);
  const setLang = useStore((s) => s.setLang);
  const setTheme = useStore((s) => s.setTheme);
  const importData = useStore((s) => s.importData);
  const wipe = useStore((s) => s.wipe);
  const pushToast = useStore((s) => s.pushToast);
  const completions = useStore((s) => s.completions);
  const localQuests = useStore((s) => s.localQuests);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'wipe' | null>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      await exportBundle().then((bundle) => {
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
        pushToast('success', t('exportDone', { n: bundle.quests.length, m: bundle.completions.length }));
      });
    } catch {
      pushToast('error', t('importFailed', { reason: 'export' }));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File | undefined) => {
    if (!file) return;
    setBusy('import');
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const summary = await importData(raw);
      pushToast(
        'success',
        t('importDone', {
          q: summary.quests,
          c: summary.completions,
          p: summary.photos,
          s: summary.skipped,
        }),
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      pushToast('error', /schema|invalid|missing|empty|wrong/i.test(reason) ? t('importInvalid') : t('importFailed', { reason }));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('settings')}>
      <div className="space-y-5">
        {/* -------------------------------------------------------- language */}
        <section>
          <h3 className="label">{t('language')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['zh', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => void setLang(l)}
                className={`btn ${settings.lang === l ? 'btn-primary' : 'btn-ghost'}`}
                aria-pressed={settings.lang === l}
              >
                {l === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------- theme */}
        <section>
          <h3 className="label">{t('theme')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => void setTheme(th)}
                className={`btn ${settings.theme === th ? 'btn-primary' : 'btn-ghost'}`}
                aria-pressed={settings.theme === th}
              >
                {th === 'dark' ? `☾ ${t('themeDark')}` : `☀ ${t('themeLight')}`}
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ data */}
        <section>
          <h3 className="label">{t('dataSection')}</h3>
          <div className="space-y-1.5">
            <button type="button" className="btn btn-ghost w-full justify-start text-xs" onClick={() => void doExport()} disabled={busy !== null}>
              {busy === 'export' ? <Spinner size={13} /> : '↓'} {t('exportData')}
            </button>
            <button type="button" className="btn btn-ghost w-full justify-start text-xs" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
              {busy === 'import' ? <Spinner size={13} /> : '↑'} {t('importData')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void doImport(e.target.files?.[0])}
              aria-label={t('importData')}
            />
            <button
              type="button"
              className="btn btn-ghost w-full justify-start text-xs"
              style={{ color: 'var(--diff-epic)' }}
              onClick={() => {
                if (window.confirm(t('confirmClear'))) {
                  setBusy('wipe');
                  void wipe().then(() => {
                    pushToast('success', t('cleared'));
                    setBusy(null);
                  });
                }
              }}
              disabled={busy !== null}
            >
              {busy === 'wipe' ? <Spinner size={13} /> : '✕'} {t('clearData')}
            </button>
          </div>
          <p className="mono mt-1.5 text-[10px] text-chalk-500">
            {localQuests.length} {t('navCreate')} · {completions.length} {t('statQuests')}
          </p>
        </section>

        {/* --------------------------------------------------------- privacy */}
        <section>
          <h3 className="label">{t('privacySection')}</h3>
          <p className="text-[11.5px] leading-relaxed text-chalk-300">{t('privacyBody')}</p>
        </section>

        <section>
          <h3 className="label">{t('storageSection')}</h3>
          <p className="text-[11.5px] leading-relaxed text-chalk-300">{t('storageBody')}</p>
        </section>

        <section>
          <h3 className="label">{t('limitsSection')}</h3>
          <p className="text-[11.5px] leading-relaxed text-chalk-300">{t('limitsBody')}</p>
        </section>

        <section className="rounded-xl border p-3 hairline">
          <h3 className="label">{t('aboutSection')}</h3>
          <p className="text-[11.5px] leading-relaxed text-chalk-300">
            Reality Quest · 现实探索 — {t('tagline')}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="mono text-[10px] text-chalk-500">MIT License</span>
            <AuthorLink lang={lang} />
          </div>
          <p className="mono mt-1.5 text-[10px] text-chalk-500">{AUTHOR.url}</p>
        </section>
      </div>
    </Sheet>
  );
}
