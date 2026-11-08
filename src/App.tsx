/**
 * App shell.
 *
 * Layout contract:
 *  - >=1024px : nav rail | map/content | side panel
 *  - <1024px  : full-bleed content + fixed bottom tab bar (thumb reach)
 *
 * The author's X link lives in the top bar on every viewport.
 */

import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { translate, AUTHOR } from './lib/i18n';
import { ToastStack, AuthorLink, Spinner } from './components/ui';
import MapView from './components/MapView';
import QuestsView from './components/QuestsView';
import FootprintsView from './components/FootprintsView';
import ProfileView from './components/ProfileView';
import RanksView from './components/RanksView';
import SettingsView from './components/SettingsView';
import CreateQuestView from './components/CreateQuestView';
import Onboarding from './components/Onboarding';
import QuestDetail from './components/QuestDetail';
import RewardOverlays from './components/RewardOverlays';

export type Tab = 'map' | 'quests' | 'footprints' | 'profile';

const TABS: Array<{ id: Tab; key: string; glyph: string }> = [
  { id: 'map', key: 'navMap', glyph: '\u25C8' },
  { id: 'quests', key: 'navQuests', glyph: '\u2756' },
  { id: 'footprints', key: 'navFootprints', glyph: '\u2318' },
  { id: 'profile', key: 'navProfile', glyph: '\u25CD' },
];

export default function App() {
  const ready = useStore((s) => s.ready);
  const boot = useStore((s) => s.boot);
  const settings = useStore((s) => s.settings);
  const profile = useStore((s) => s.profile);
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);
  const setLang = useStore((s) => s.setLang);
  const setTheme = useStore((s) => s.setTheme);
  const selectedQuestId = useStore((s) => s.selectedQuestId);
  const selectQuest = useStore((s) => s.selectQuest);

  const [tab, setTab] = useState<Tab>('map');
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'ranks' | 'create' | 'profile-extra'>('none');

  const lang = settings.lang;
  const t = useMemo(
    () => (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  useEffect(() => {
    void boot();
  }, [boot]);

  /* --------------------------------------------------------- theme / lang */
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [settings.theme, lang]);

  /* ------------------------------------------------------ native back key */
  useEffect(() => {
    const onPop = () => {
      if (selectedQuestId) selectQuest(undefined);
      else if (overlay !== 'none') setOverlay('none');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [selectedQuestId, overlay, selectQuest]);

  if (!ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="grid h-16 w-16 animate-pulse place-items-center rounded-2xl text-2xl"
            style={{
              background: 'color-mix(in srgb, var(--signal) 18%, transparent)',
              color: 'var(--signal)',
            }}
          >
            {'\u25C8'}
          </div>
          <Spinner label={t('loading')} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ============================================================ top bar */}
      <header
        className="relative z-30 flex shrink-0 items-center gap-2 border-b px-3 hairline sm:px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          paddingBottom: '0.5rem',
          background: 'color-mix(in srgb, var(--ink-900) 88%, transparent)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <button
          type="button"
          onClick={() => setTab('map')}
          className="flex min-w-0 items-center gap-2 rounded-lg pr-1 text-left transition hover:opacity-90"
          aria-label={t('appName')}
        >
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold"
            style={{
              background: 'linear-gradient(150deg, var(--signal-soft), var(--signal))',
              color: '#131009',
            }}
          >
            {'\u25C8'}
          </span>
          <span className="min-w-0">
            <span className="display block truncate text-[15px] font-bold leading-tight tracking-tight">
              {lang === 'zh' ? '\u73B0\u5B9E\u63A2\u7D22' : 'Reality Quest'}
            </span>
            <span className="mono hidden truncate text-[10px] leading-tight text-chalk-500 sm:block">
              REALITY QUEST
            </span>
          </span>
        </button>

        <div className="flex-1" />

        {/* Level pill - always visible, the core progression signal. */}
        <button
          type="button"
          onClick={() => setTab('profile')}
          className="chip hidden shrink-0 sm:inline-flex"
          aria-label={t('statLevel')}
        >
          <span className="mono text-[10px] font-bold" style={{ color: 'var(--signal)' }}>
            Lv.{profile.level}
          </span>
          <span className="mono text-[10px] text-chalk-500">{profile.xp} XP</span>
        </button>

        {/* Author X link (top of page, hyperlink to the profile). */}
        <AuthorLink lang={lang} />

        <button
          type="button"
          onClick={() => void setLang(lang === 'zh' ? 'en' : 'zh')}
          className="chip shrink-0"
          aria-label={t('language')}
          title={t('language')}
          data-testid="lang-toggle"
        >
          {lang === 'zh' ? '\u4E2D' : 'EN'}
        </button>

        <button
          type="button"
          onClick={() => void setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
          className="chip shrink-0 px-2.5"
          aria-label={t('theme')}
          title={settings.theme === 'dark' ? t('themeLight') : t('themeDark')}
          data-testid="theme-toggle"
        >
          {settings.theme === 'dark' ? '\u263E' : '\u2600'}
        </button>
      </header>

      {/* ================================================================ body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Desktop nav rail */}
        <nav
          className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-r py-3 hairline lg:flex"
          aria-label="desktop-nav"
          style={{ background: 'color-mix(in srgb, var(--ink-900) 70%, transparent)' }}
        >
          {TABS.map((item) => (
            <NavRailButton
              key={item.id}
              active={tab === item.id}
              glyph={item.glyph}
              label={t(item.key)}
              onClick={() => setTab(item.id)}
            />
          ))}
          <div className="my-2 h-px w-8" style={{ background: 'var(--panel-border)' }} />
          <NavRailButton glyph={'\uFF0B'} label={t('navCreate')} onClick={() => setOverlay('create')} />
          <NavRailButton glyph={'\u265B'} label={t('navRanks')} onClick={() => setOverlay('ranks')} />
          <div className="flex-1" />
          <NavRailButton glyph={'\u2699'} label={t('navSettings')} onClick={() => setOverlay('settings')} />
        </nav>

        {/* Main content */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {tab === 'map' && <MapView lang={lang} onOpenQuests={() => setTab('quests')} />}
          {tab === 'quests' && <QuestsView lang={lang} />}
          {tab === 'footprints' && <FootprintsView lang={lang} />}
          {tab === 'profile' && (
            <ProfileView
              lang={lang}
              onOpenSettings={() => setOverlay('settings')}
              onOpenRanks={() => setOverlay('ranks')}
            />
          )}
        </main>
      </div>

      {/* ======================================================= mobile tabs */}
      <nav
        className="relative z-30 flex shrink-0 items-stretch justify-around border-t lg:hidden hairline"
        aria-label="mobile-tabs"
        data-testid="tabbar"
        style={{
          background: 'color-mix(in srgb, var(--ink-900) 94%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className="relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 transition active:scale-95"
              style={{ color: active ? 'var(--signal)' : 'var(--chalk-500)' }}
            >
              <span aria-hidden className="text-[17px] leading-none">
                {item.glyph}
              </span>
              <span className="text-[10px] font-medium leading-none">{t(item.key)}</span>
              {active ? (
                <span
                  aria-hidden
                  className="absolute top-0 h-[2px] w-8 rounded-full"
                  style={{ background: 'var(--signal)' }}
                />
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setOverlay('profile-extra')}
          className="relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 transition active:scale-95"
          style={{ color: 'var(--chalk-500)' }}
          aria-label={t('more')}
        >
          <span aria-hidden className="text-[17px] leading-none">
            {'\u22EF'}
          </span>
          <span className="text-[10px] font-medium leading-none">{t('more')}</span>
        </button>
      </nav>

      {/* =============================================================== sheets */}
      <QuestDetail lang={lang} />
      <RewardOverlays lang={lang} />

      {overlay === 'settings' && <SettingsView lang={lang} onClose={() => setOverlay('none')} />}
      {overlay === 'ranks' && <RanksView lang={lang} onClose={() => setOverlay('none')} />}
      {overlay === 'create' && <CreateQuestView lang={lang} onClose={() => setOverlay('none')} />}
      {overlay === 'profile-extra' && (
        <ProfileView
          lang={lang}
          modal
          onClose={() => setOverlay('none')}
          onOpenSettings={() => setOverlay('settings')}
          onOpenRanks={() => setOverlay('ranks')}
        />
      )}

      {!settings.onboarded && <Onboarding lang={lang} />}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <p className="sr-only">
        {translate(lang, 'author')}: {AUTHOR.handle} - {AUTHOR.url}
      </p>
    </div>
  );
}

function NavRailButton({
  glyph,
  label,
  active,
  onClick,
}: {
  glyph: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="group flex w-[62px] flex-col items-center gap-1 rounded-xl py-2 transition"
      style={{
        background: active ? 'color-mix(in srgb, var(--signal) 14%, transparent)' : 'transparent',
        color: active ? 'var(--signal)' : 'var(--chalk-500)',
      }}
      title={label}
    >
      <span aria-hidden className="text-[18px] leading-none transition group-hover:scale-110">
        {glyph}
      </span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  );
}
