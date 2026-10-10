import { useEffect, useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TRAIL_MODES, type TrailMode } from '@leblanc/shared';
import {
  DEFAULT_WALK_FILTERS,
  DISTANCE_RANGES,
  DURATION_LIMITS,
  readWalkFilterParams,
  writeWalkFilterParams,
  type WalkFilterValues,
} from './walkFilterParams';

const optionClass = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-800 hover:bg-brenne-50 focus-within:ring-2 focus-within:ring-creuse-700';
const legendClass = 'mb-3 text-xs font-bold uppercase tracking-wider text-gray-700';

export function WalkFilters() {
  const { t } = useTranslation('walks');
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<WalkFilterValues>(() => readWalkFilterParams(searchParams));
  const [expanded, setExpanded] = useState(false);
  const formId = useId();

  useEffect(() => {
    setDraft(readWalkFilterParams(searchParams));
  }, [searchParams]);

  const noMode = draft.modes.length === 0;

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noMode) return;
    setSearchParams(writeWalkFilterParams(searchParams, draft), { replace: true });
    setExpanded(false);
    window.requestAnimationFrame?.(() => {
      document.getElementById('walk-results')?.scrollIntoView?.({ block: 'start' });
    });
  }

  function reset() {
    setDraft(DEFAULT_WALK_FILTERS);
    setSearchParams(writeWalkFilterParams(searchParams, DEFAULT_WALK_FILTERS), { replace: true });
  }

  function toggleMode(mode: TrailMode) {
    setDraft((current) => ({
      ...current,
      modes: current.modes.includes(mode) ? current.modes.filter((value) => value !== mode) : [...current.modes, mode],
    }));
  }

  return (
    <aside className="rounded-2xl border border-brenne-900/5 bg-white p-5 shadow-md sm:p-6" aria-label={t('filters.title')}>
      <div className="flex items-center justify-between gap-3 lg:mb-5">
        <h2 className="font-display text-2xl font-bold text-brenne-950">{t('filters.title')}</h2>
        <button type="button" className="btn-secondary min-h-11 lg:hidden" aria-controls={formId} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? t('filters.hide') : t('filters.show')}
        </button>
      </div>

      <form id={formId} onSubmit={apply} className={`${expanded ? 'block' : 'hidden'} space-y-6 pt-5 lg:block lg:pt-0`} noValidate>
        <fieldset aria-describedby={noMode ? `${formId}-modes-error` : undefined}>
          <legend className={legendClass}>{t('filters.modes')}</legend>
          <div className="space-y-1">
            {TRAIL_MODES.map((mode) => (
              <label key={mode} className={optionClass}>
                <input type="checkbox" name="modes" value={mode} checked={draft.modes.includes(mode)} onChange={() => toggleMode(mode)} className="h-4 w-4 accent-brenne-700" />
                <span className="min-w-0 flex-1">{t(`modes.${mode}`)}</span>
                {mode === 'horse' && <span className="text-xs text-gray-600">{t('filters.horseHint')}</span>}
              </label>
            ))}
          </div>
          {noMode && <p id={`${formId}-modes-error`} role="alert" className="mt-2 text-sm font-semibold text-red-800">{t('filters.modesRequired')}</p>}
        </fieldset>

        <fieldset>
          <legend className={legendClass}>{t('filters.track')}</legend>
          <label className={optionClass}>
            <input type="checkbox" name="withTrack" checked={draft.withTrack} onChange={(event) => setDraft((current) => ({ ...current, withTrack: event.target.checked }))} className="h-4 w-4 accent-brenne-700" />
            {t('filters.withTrack')}
          </label>
        </fieldset>

        <fieldset>
          <legend className={legendClass}>{t('filters.loop')}</legend>
          <label className={optionClass}>
            <input type="checkbox" name="loop" checked={draft.loop} onChange={(event) => setDraft((current) => ({ ...current, loop: event.target.checked }))} className="h-4 w-4 accent-brenne-700" />
            {t('filters.loopOnly')}
          </label>
        </fieldset>

        <div>
          <label htmlFor={`${formId}-distance`} className={`${legendClass} block`}>{t('filters.distance')}</label>
          <select
            id={`${formId}-distance`}
            value={draft.distance ?? ''}
            onChange={(event) => setDraft((current) => ({
              ...current, distance: DISTANCE_RANGES.find((range) => range === event.target.value) ?? null,
            }))}
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-creuse-700"
          >
            <option value="">{t('filters.any')}</option>
            {DISTANCE_RANGES.map((range) => <option key={range} value={range}>{t(`filters.distances.${range}`)}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor={`${formId}-duration`} className={`${legendClass} block`}>{t('filters.duration')}</label>
          <select
            id={`${formId}-duration`}
            value={draft.duration ?? ''}
            onChange={(event) => setDraft((current) => ({
              ...current, duration: DURATION_LIMITS.find((limit) => String(limit) === event.target.value) ?? null,
            }))}
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-creuse-700"
          >
            <option value="">{t('filters.any')}</option>
            {DURATION_LIMITS.map((limit) => <option key={limit} value={limit}>{t(`filters.durations.${limit}`)}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-brenne-900/10 pt-5">
          <button type="submit" className="btn-primary min-h-11 flex-1" disabled={noMode} aria-disabled={noMode}>{t('filters.apply')}</button>
          <button type="button" onClick={reset} className="btn-secondary min-h-11">{t('filters.reset')}</button>
        </div>
      </form>
    </aside>
  );
}
