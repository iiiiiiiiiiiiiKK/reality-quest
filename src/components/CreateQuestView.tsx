/**
 * Create a community quest.
 *
 * Community quests are explicitly local-only: the copy says so, and the store
 * never pretends they are visible to others. Target coordinates are always
 * user-chosen (current GPS fix or a map tap) - never synthesized.
 */

import { useCallback, useMemo, useState } from 'react';
import { useStore } from '../store';
import { translate } from '../lib/i18n';
import { CATEGORY_LABEL, DIFFICULTY_LABEL, RADIUS_BY_DIFFICULTY, xpForDifficulty } from '../lib/levels';
import QuestMap from './QuestMap';
import { Sheet, Spinner } from './ui';
import type { Difficulty, Lang, QuestCategory } from '../lib/types';

export default function CreateQuestView({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = useMemo(() => (k: string, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  const locate = useStore((s) => s.locate);
  const location = useStore((s) => s.location);
  const mapCenter = useStore((s) => s.mapCenter);
  const createCommunityQuest = useStore((s) => s.createCommunityQuest);
  const selectQuest = useStore((s) => s.selectQuest);
  const pushToast = useStore((s) => s.pushToast);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<QuestCategory>('city');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [radius, setRadius] = useState(RADIUS_BY_DIFFICULTY.normal);
  const [requiresPhoto, setRequiresPhoto] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const center = useMemo(() => {
    const base = point ?? mapCenter ?? location ?? { lat: 31.2304, lng: 121.4737 };
    return { lat: base.lat, lng: base.lng };
  }, [point, mapCenter, location]);

  const applyMyLocation = useCallback(async () => {
    const fix = await locate({ silent: true });
    if (fix) setPoint({ lat: fix.lat, lng: fix.lng });
  }, [locate]);

  const submit = async () => {
    if (!title.trim() || !description.trim() || !point) {
      pushToast('error', t('createInvalid'));
      return;
    }
    setBusy(true);
    try {
      const quest = await createCommunityQuest({
        title: title.trim(),
        description: description.trim(),
        category,
        lat: point.lat,
        lng: point.lng,
        radius,
        difficulty,
        requiresPhoto,
        isPublic,
      });
      pushToast('success', t('createSuccess'));
      onClose();
      selectQuest(quest.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t('createQuest')}>
      <div className="space-y-3">
        <div
          className="rounded-xl border p-2.5 text-[11px] leading-relaxed"
          style={{
            borderColor: 'color-mix(in srgb, var(--diff-hard) 30%, transparent)',
            background: 'color-mix(in srgb, var(--diff-hard) 7%, transparent)',
            color: 'var(--chalk-300)',
          }}
        >
          {'\u24D8'} {t('createNote')}
        </div>

        <div>
          <label className="label" htmlFor="q-title">
            {t('questTitle')}
          </label>
          <input
            id="q-title"
            className="field"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('questTitlePlaceholder')}
          />
        </div>

        <div>
          <label className="label" htmlFor="q-desc">
            {t('questDesc')}
          </label>
          <textarea
            id="q-desc"
            className="field resize-none"
            rows={3}
            maxLength={600}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('questDescPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="q-cat">
              {t('category')}
            </label>
            <select
              id="q-cat"
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value as QuestCategory)}
            >
              {(['city', 'nature', 'culture', 'photo', 'random'] as const).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c][lang]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="q-diff">
              {t('difficulty')}
            </label>
            <select
              id="q-diff"
              className="field"
              value={difficulty}
              onChange={(e) => {
                const d = e.target.value as Difficulty;
                setDifficulty(d);
                setRadius(RADIUS_BY_DIFFICULTY[d]);
              }}
            >
              {(['easy', 'normal', 'hard', 'epic'] as const).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABEL[d][lang]} {'\u00B7'} {xpForDifficulty(d)} XP
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="q-radius">
            {t('radiusLabel')} {'\u2014'} {radius} {t('meters')}
          </label>
          <input
            id="q-radius"
            type="range"
            min={25}
            max={300}
            step={5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-full accent-[var(--signal)]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="label mb-0">{t('pickOnMap')}</span>
            <div className="flex gap-1.5">
              <button type="button" className="chip" onClick={() => void applyMyLocation()}>
                {'\u2316'} {t('useMyLocationBtn')}
              </button>
              <button
                type="button"
                className={`chip ${picking ? 'chip-active' : ''}`}
                onClick={() => setPicking((v) => !v)}
                aria-pressed={picking}
              >
                {'\u271B'} {t('pickOnMap')}
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10.5px] text-chalk-500">
            {point ? `${t('pickedCoord')}: ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : t('noCoordYet')}
          </p>
          <div className="mt-1.5 h-[210px] overflow-hidden rounded-xl border hairline">
            <QuestMap
              lang={lang}
              center={center}
              zoom={15}
              quests={[]}
              completions={[]}
              location={location}
              mode={picking ? 'pick' : 'browse'}
              pickPoint={point}
              onPick={(p) => {
                setPoint(p);
                setPicking(false);
              }}
            />
          </div>
          {picking ? (
            <p className="mt-1 text-[10.5px]" style={{ color: 'var(--signal)' }}>
              {t('pickOnMapHint')}
            </p>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 hairline">
          <input
            type="checkbox"
            checked={requiresPhoto}
            onChange={(e) => setRequiresPhoto(e.target.checked)}
            className="h-4 w-4 accent-[var(--signal)]"
          />
          <span className="text-[12px] text-chalk-300">{t('photoRequiredLabel')}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 hairline">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 accent-[var(--signal)]"
          />
          <span className="text-[12px] text-chalk-300">{t('publicLabel')}</span>
        </label>

        <button type="button" className="btn btn-primary w-full" onClick={() => void submit()} disabled={busy}>
          {busy ? <Spinner size={14} /> : '\uFF0B'} {t('createSubmit')}
        </button>
      </div>
    </Sheet>
  );
}
