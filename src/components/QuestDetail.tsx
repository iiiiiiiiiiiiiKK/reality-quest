/**
 * Quest detail sheet: mission briefing, distance, requirements, and the
 * check-in -> proof -> completion flow.
 *
 * Everything that grants XP goes through `store.completeQuest`, which is
 * idempotent. The UI never writes XP itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { pickLang, translate } from '../lib/i18n';
import { formatDistance, haversineMeters, walkMinutes } from '../lib/geo';
import { CATEGORY_LABEL, levelForXp } from '../lib/levels';
import { navigationUrl } from '../lib/services';
import { compressPhoto, formatBytes, PhotoError, type CompressedPhoto } from '../lib/photo';
import { CategoryDot, DifficultyTag, Sheet, Spinner } from './ui';
import type { Lang, Quest } from '../lib/types';

type Stage = 'brief' | 'proof';

const CATEGORY_GLYPH: Record<Quest['category'], string> = {
  city: '\u25A6',
  nature: '\u2767',
  culture: '\u2756',
  photo: '\u25C9',
  random: '\u2726',
};

export default function QuestDetail({ lang }: { lang: Lang }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const selectedId = useStore((s) => s.selectedQuestId);
  const selectQuest = useStore((s) => s.selectQuest);
  const discovered = useStore((s) => s.discovered);
  const localQuests = useStore((s) => s.localQuests);
  const completions = useStore((s) => s.completions);
  const progress = useStore((s) => s.progress);
  const location = useStore((s) => s.location);
  const profile = useStore((s) => s.profile);
  const startQuest = useStore((s) => s.startQuest);
  const abandonQuest = useStore((s) => s.abandonQuest);
  const checkIn = useStore((s) => s.checkIn);
  const completeQuest = useStore((s) => s.completeQuest);
  const locate = useStore((s) => s.locate);
  const pushToast = useStore((s) => s.pushToast);
  const removeQuest = useStore((s) => s.removeQuest);

  const [stage, setStage] = useState<Stage>('brief');
  const [busy, setBusy] = useState(false);
  const [checkMessage, setCheckMessage] = useState<{ kind: 'ok' | 'far' | 'acc' | 'noloc'; text: string } | null>(null);
  const [verified, setVerified] = useState<{ distance: number } | null>(null);
  const [photo, setPhoto] = useState<CompressedPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [text, setText] = useState('');
  const [share, setShare] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const quest: Quest | undefined = useMemo(() => {
    if (!selectedId) return undefined;
    return discovered.find((q) => q.id === selectedId) ?? localQuests.find((q) => q.id === selectedId);
  }, [selectedId, discovered, localQuests]);

  const completion = useMemo(
    () => completions.find((c) => c.questId === selectedId),
    [completions, selectedId],
  );
  const isActive = useMemo(() => progress.some((p) => p.questId === selectedId), [progress, selectedId]);

  useEffect(() => {
    setStage('brief');
    setCheckMessage(null);
    setVerified(null);
    setPhoto(null);
    setText('');
    setShare(false);
  }, [selectedId]);

  const distance = quest && location ? haversineMeters(location, { lat: quest.lat, lng: quest.lng }) : undefined;
  const level = levelForXp(profile.xp).level;

  const close = useCallback(() => {
    selectQuest(undefined);
  }, [selectQuest]);

  if (!quest) return null;

  const doCheckIn = async () => {
    setBusy(true);
    setCheckMessage(null);
    try {
      const result = await checkIn(quest);
      if (result.ok) {
        setVerified({ distance: result.distance ?? 0 });
        setCheckMessage({ kind: 'ok', text: t('arriveSuccessBody', { n: quest.radius }) });
        if (!isActive) await startQuest(quest.id);
      } else if (result.reason === 'no-location') {
        setCheckMessage({ kind: 'noloc', text: t('checkInNeedsGps') });
      } else if (result.reason === 'low-accuracy') {
        setCheckMessage({
          kind: 'acc',
          text: t('lowAccuracyBlocked', { a: Math.round(result.accuracy ?? 0) }),
        });
      } else {
        setCheckMessage({
          kind: 'far',
          text: t('needCloser', { d: formatDistance(result.distance ?? 0, lang) }),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const onPhotoPicked = async (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const compressed = await compressPhoto(file);
      setPhoto(compressed);
    } catch (err) {
      if (err instanceof PhotoError && err.kind === 'too-large') pushToast('error', t('proofTooLarge'));
      else pushToast('error', t('proofInvalidImage'));
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    if (!verified) return;
    if (quest.requiresPhoto && !photo) {
      pushToast('error', t('proofPhotoRequired'));
      return;
    }
    setBusy(true);
    try {
      const fix = location;
      if (!fix) {
        pushToast('error', t('checkInNeedsGps'));
        return;
      }
      const result = await completeQuest({
        quest,
        location: fix,
        distance: verified.distance,
        photo: photo ?? undefined,
        text,
        share,
      });
      if (result.alreadyDone) {
        pushToast('info', t('alreadyCompleted'));
        close();
      } else if (result.ok) {
        close();
      }
    } finally {
      setBusy(false);
    }
  };

  const locked = Boolean(quest.minLevel && quest.minLevel > level);
  const sourceLabel =
    quest.source === 'osm'
      ? t('sourceOsm')
      : quest.source === 'curated'
        ? t('sourceCurated')
        : t('sourceCommunity');

  return (
    <Sheet open={Boolean(selectedId)} onClose={close} title={completion ? t('completed') : t('questDetail')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg"
          style={{
            background: `color-mix(in srgb, var(--accent-${quest.category}) 16%, transparent)`,
            color: `var(--accent-${quest.category})`,
          }}
        >
          {CATEGORY_GLYPH[quest.category]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="display text-[17px] font-bold leading-tight text-chalk-50">
            {pickLang(quest.title, lang)}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <DifficultyTag difficulty={quest.difficulty} lang={lang} />
            <span className="chip">
              <CategoryDot category={quest.category} size={7} />
              {CATEGORY_LABEL[quest.category][lang]}
            </span>
            <span className="chip mono" style={{ color: 'var(--signal)' }}>
              +{quest.xp} XP
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-chalk-300">{pickLang(quest.description, lang)}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric
          label={t('distance')}
          value={distance !== undefined ? formatDistance(distance, lang) : '\u2014'}
          hint={distance !== undefined ? `~${walkMinutes(distance)} ${t('minutes')}` : undefined}
        />
        <Metric label={t('radius')} value={`${quest.radius} ${t('meters')}`} />
        <Metric label={t('estMinutes')} value={`${quest.estimatedMinutes} ${t('minutes')}`} />
      </dl>

      <div className="mt-3 rounded-xl border p-3 hairline">
        <div className="flex items-start gap-2">
          <span aria-hidden className="mt-0.5 text-sm text-chalk-500">
            &#8982;
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-chalk-100">
              {quest.placeName ?? pickLang(quest.title, lang)}
            </p>
            <p className="mono mt-0.5 text-[10.5px] text-chalk-500">
              {quest.lat.toFixed(5)}, {quest.lng.toFixed(5)}
            </p>
            <p className="mt-1 text-[10.5px] text-chalk-500">
              <span>{sourceLabel}</span>
              {quest.sourceUrl ? (
                <>
                  {' \u00B7 '}
                  <a
                    className="underline decoration-dotted underline-offset-2 hover:text-chalk-100"
                    href={quest.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('viewOnOsm')}
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <a
            href={navigationUrl(quest.lat, quest.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost shrink-0 px-2.5 py-2 text-[11px]"
            style={{ minHeight: 38 }}
            title={t('openInMaps')}
          >
            &#10148;
          </a>
        </div>
      </div>

      <section className="mt-4">
        <h4 className="label">{t('requirements')}</h4>
        <ul className="space-y-1.5">
          <Req done={Boolean(verified)} text={t('requirementReach', { n: quest.radius })} />
          {quest.requiresPhoto ? <Req done={Boolean(photo)} text={t('requirementPhoto')} /> : null}
          <Req done text={t('requirementAccuracy', { n: 200 })} />
        </ul>
      </section>

      <p className="mt-3 text-[10.5px] text-chalk-500">
        {t('creator')}: <span className="text-chalk-300">{quest.creator}</span>
      </p>

      {completion ? (
        <div
          className="mt-4 rounded-xl border p-3"
          style={{ borderColor: 'color-mix(in srgb, var(--diff-easy) 34%, transparent)' }}
        >
          <p className="text-[13px] font-semibold" style={{ color: 'var(--diff-easy)' }}>
            &#10003; {t('questCompleted')}
          </p>
          <p className="mono mt-1 text-[11px] text-chalk-500">
            +{completion.xpAwarded} XP {'\u00B7'} {formatDistance(completion.distanceMeters, lang)}
          </p>
        </div>
      ) : stage === 'brief' ? (
        <div className="mt-4 space-y-2">
          {locked ? (
            <div
              className="rounded-xl border p-3 text-[12.5px]"
              style={{
                borderColor: 'color-mix(in srgb, var(--diff-hard) 34%, transparent)',
                color: 'var(--diff-hard)',
              }}
            >
              {t('requiresLevel', { n: quest.minLevel ?? 1 })}
            </div>
          ) : null}

          {checkMessage ? (
            <div
              className="rounded-xl border p-2.5 text-[12px] leading-relaxed"
              style={{
                borderColor:
                  checkMessage.kind === 'ok'
                    ? 'color-mix(in srgb, var(--diff-easy) 40%, transparent)'
                    : 'color-mix(in srgb, var(--diff-hard) 40%, transparent)',
                color: checkMessage.kind === 'ok' ? 'var(--diff-easy)' : 'var(--diff-hard)',
                background:
                  checkMessage.kind === 'ok'
                    ? 'color-mix(in srgb, var(--diff-easy) 8%, transparent)'
                    : 'color-mix(in srgb, var(--diff-hard) 8%, transparent)',
              }}
              role="status"
            >
              {checkMessage.text}
            </div>
          ) : null}

          {verified ? (
            <button type="button" className="btn btn-primary w-full" onClick={() => setStage('proof')}>
              {t('proofTitle')} &#8594;
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={busy || locked}
                onClick={() => void doCheckIn()}
              >
                {busy ? <Spinner size={14} label={t('checkingIn')} /> : isActive ? t('checkIn') : t('startQuest')}
              </button>
              {!location ? (
                <button type="button" className="btn btn-ghost w-full" disabled={busy} onClick={() => void locate()}>
                  {t('getLocationOnce')}
                </button>
              ) : distance !== undefined && distance > quest.radius ? (
                <button type="button" className="btn btn-ghost w-full" onClick={() => void locate()}>
                  {t('retryLocate')}
                </button>
              ) : null}
              {isActive ? (
                <button
                  type="button"
                  className="btn btn-quiet w-full text-xs"
                  onClick={() => {
                    void abandonQuest(quest.id);
                    close();
                  }}
                >
                  {t('abandonQuest')}
                </button>
              ) : null}
            </>
          )}

          {quest.source === 'community' ? (
            <button
              type="button"
              className="btn btn-quiet w-full text-[11px]"
              onClick={() => {
                if (window.confirm(t('confirmDeleteQuest'))) {
                  void removeQuest(quest.id);
                  close();
                }
              }}
            >
              {t('deleteQuest')}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <h4 className="label">{t('proofTitle')}</h4>
            <p className="text-[11.5px] leading-relaxed text-chalk-500">{t('proofPhotoHint')}</p>
          </div>

          <button
            type="button"
            className="btn btn-ghost w-full text-xs"
            disabled={photoBusy}
            onClick={() => fileRef.current?.click()}
          >
            {photoBusy ? t('proofCompressing') : photo ? `\u21BA ${t('proofAddPhoto')}` : `\u25A3 ${t('proofAddPhoto')}`}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onPhotoPicked(e.target.files?.[0])}
            aria-label={t('proofAddPhoto')}
          />

          {photo ? (
            <div className="flex items-center gap-3 rounded-xl border p-2 hairline">
              <PhotoPreview blob={photo.blob} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-chalk-100">
                  {photo.width} {'\u00D7'} {photo.height}
                </p>
                <p className="mono text-[10.5px] text-chalk-500">{formatBytes(photo.bytes)}</p>
              </div>
              <button
                type="button"
                className="btn btn-quiet px-2 py-1 text-xs"
                onClick={() => setPhoto(null)}
                aria-label={t('proofRemove')}
              >
                &#215;
              </button>
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="proof-text">
              {t('proofTextLabel')}
            </label>
            <textarea
              id="proof-text"
              className="field resize-none"
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('proofTextPlaceholder')}
            />
            <p className="mono mt-1 text-right text-[10px] text-chalk-500">{text.length}/2000</p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 hairline">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--signal)]"
            />
            <span className="text-[11.5px] leading-relaxed text-chalk-300">{t('proofShare')}</span>
          </label>

          <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? <Spinner size={14} label={t('proofSubmitting')} /> : t('proofSubmit')}
          </button>
          <button type="button" className="btn btn-quiet w-full text-xs" onClick={() => setStage('brief')}>
            &#8592; {t('back')}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border px-2.5 py-2 hairline">
      <dt className="mono text-[9.5px] uppercase tracking-wider text-chalk-500">{label}</dt>
      <dd className="mono mt-0.5 text-[12.5px] font-semibold text-chalk-50">{value}</dd>
      {hint ? <dd className="mono text-[9.5px] text-chalk-500">{hint}</dd> : null}
    </div>
  );
}

function Req({ done, text }: { done: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2 text-[12px]">
      <span aria-hidden style={{ color: done ? 'var(--diff-easy)' : 'var(--chalk-500)' }}>
        {done ? '\u2713' : '\u25CB'}
      </span>
      <span className={done ? 'text-chalk-100' : 'text-chalk-300'}>{text}</span>
    </li>
  );
}

function PhotoPreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return <div className="h-12 w-12 rounded-lg" style={{ background: 'var(--ink-800)' }} />;
  return <img src={url} alt="" className="h-12 w-12 rounded-lg object-cover" />;
}
