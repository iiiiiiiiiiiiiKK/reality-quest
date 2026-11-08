/**
 * Small shared UI primitives. Kept deliberately plain: no design-system
 * framework, so the visual language of the app is ours.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { AUTHOR, translate } from '../lib/i18n';
import type { Difficulty, Lang, QuestCategory } from '../lib/types';
import { DIFFICULTY_LABEL, CATEGORY_LABEL } from '../lib/levels';

export function useT(lang: Lang) {
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

export function CategoryDot({ category, size = 10 }: { category: QuestCategory; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: `var(--accent-${category})`,
        boxShadow: `0 0 0 3px color-mix(in srgb, var(--accent-${category}) 22%, transparent)`,
      }}
    />
  );
}

export function DifficultyTag({ difficulty, lang }: { difficulty: Difficulty; lang: Lang }) {
  return (
    <span
      className="mono inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color: `var(--diff-${difficulty})`,
        background: `color-mix(in srgb, var(--diff-${difficulty}) 14%, transparent)`,
        border: `1px solid color-mix(in srgb, var(--diff-${difficulty}) 34%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `var(--diff-${difficulty})` }}
      />
      {DIFFICULTY_LABEL[difficulty][lang]}
    </span>
  );
}

export function CategoryLabel({ category, lang }: { category: QuestCategory; lang: Lang }) {
  return <span className="text-xs text-chalk-300">{CATEGORY_LABEL[category][lang]}</span>;
}

/** Author credit — the 𝕏 glyph links to the author's profile. */
export function AuthorLink({ lang, compact = false }: { lang: Lang; compact?: boolean }) {
  const t = useT(lang);
  return (
    <a
      href={AUTHOR.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition hover:border-[color-mix(in_srgb,var(--signal)_45%,transparent)] hover:bg-[color-mix(in_srgb,var(--signal)_10%,transparent)]"
      style={{ borderColor: 'var(--panel-border)' }}
      aria-label={t('authorFollow')}
      title={t('authorFollow')}
    >
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-full text-[13px] font-semibold leading-none transition group-hover:scale-105"
        style={{ background: 'color-mix(in srgb, var(--chalk-50) 8%, transparent)', color: 'var(--chalk-50)' }}
      >
        {AUTHOR.glyph}
      </span>
      {!compact && (
        <span className="mono text-[11px] leading-none text-chalk-300 group-hover:text-chalk-50">
          {AUTHOR.handle}
        </span>
      )}
    </a>
  );
}

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span
        className="inline-block animate-spin rounded-full border-2 border-transparent"
        style={{
          width: size,
          height: size,
          borderTopColor: 'var(--signal)',
          borderRightColor: 'color-mix(in srgb, var(--signal) 35%, transparent)',
        }}
      />
      {label ? <span className="text-xs text-chalk-300">{label}</span> : null}
    </span>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded-full"
          style={{
            width: `${92 - i * 12}%`,
            background: 'color-mix(in srgb, var(--chalk-50) 8%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
        style={{ background: 'color-mix(in srgb, var(--chalk-50) 6%, transparent)', color: 'var(--chalk-300)' }}
      >
        {icon ?? '◌'}
      </div>
      <p className="display text-sm font-semibold text-chalk-100">{title}</p>
      {body ? <p className="max-w-[34ch] text-xs leading-relaxed text-chalk-500">{body}</p> : null}
      {action}
    </div>
  );
}

export function ProgressBar({
  ratio,
  height = 8,
  label,
}: {
  ratio: number;
  height?: number;
  label?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{ height, background: 'color-mix(in srgb, var(--chalk-50) 10%, transparent)' }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, var(--signal-soft), var(--signal))',
          boxShadow: '0 0 14px -2px var(--signal-glow)',
        }}
      />
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy = 'sheet-title',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="panel relative max-h-[92dvh] w-full animate-rise overflow-hidden rounded-t-3xl sm:max-w-lg sm:rounded-3xl"
        style={{ boxShadow: '0 30px 90px -30px #000' }}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5 hairline">
          <h2 id={labelledBy} className="display text-base font-semibold text-chalk-50">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-quiet h-9 min-h-0 w-9 rounded-lg p-0 text-lg"
            aria-label="close"
          >
            ×
          </button>
        </div>
        <div className="scroll-y max-h-[70dvh] px-5 py-4">{children}</div>
        {footer ? <div className="border-t px-5 py-3 hairline">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-xl border p-0.5 hairline"
      style={{ background: 'color-mix(in srgb, var(--chalk-50) 4%, transparent)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(opt.value)}
            className="rounded-[10px] px-3 py-1.5 text-xs font-medium transition"
            style={{
              background: active ? 'color-mix(in srgb, var(--signal) 18%, transparent)' : 'transparent',
              color: active ? 'var(--signal-soft)' : 'var(--chalk-300)',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Array<{ id: string; kind: 'success' | 'error' | 'info'; message: string }>;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[1500] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onDismiss(t.id)}
          className="pointer-events-auto flex w-full max-w-md animate-rise items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-[13px] shadow-panel"
          style={{
            borderColor:
              t.kind === 'error'
                ? 'color-mix(in srgb, var(--diff-epic) 45%, transparent)'
                : t.kind === 'success'
                  ? 'color-mix(in srgb, var(--diff-easy) 45%, transparent)'
                  : 'var(--panel-border)',
            background: 'var(--panel-bg-solid)',
            color: 'var(--chalk-100)',
          }}
        >
          <span aria-hidden className="mt-0.5 text-sm">
            {t.kind === 'error' ? '⚠' : t.kind === 'success' ? '✓' : 'ℹ'}
          </span>
          <span className="leading-snug">{t.message}</span>
        </button>
      ))}
    </div>
  );
}
