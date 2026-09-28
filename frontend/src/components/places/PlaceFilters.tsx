import { useEffect, useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PlaceTypeSchema, type PlaceType } from '@leblanc/shared';
import { usePlaceCategories } from '../../hooks/usePlaceCategories';
import { readPlaceFilterParams, writePlaceFilterParams, type PlaceFilterValues } from './placeFilterParams';

export function PlaceFilters() {
  const { t } = useTranslation('places');
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = useState<PlaceFilterValues>(() => readPlaceFilterParams(searchParams));
  const [expanded, setExpanded] = useState(false);
  const formId = useId();
  const categories = usePlaceCategories();

  useEffect(() => {
    setDraft(readPlaceFilterParams(searchParams));
  }, [searchParams]);

  const counts = new Map(categories.data?.types.map(({ value, count }) => [value, count]) ?? []);
  const cuisines = [...new Set([
    ...(categories.data?.cuisines.map(({ value }) => value) ?? []),
    ...draft.cuisines,
  ])];

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchParams(writePlaceFilterParams(searchParams, draft), { replace: true });
    setExpanded(false);
    window.requestAnimationFrame?.(() => {
      document.getElementById('place-results')?.scrollIntoView?.({ block: 'start' });
    });
  }

  function reset() {
    const empty: PlaceFilterValues = { types: [], cuisines: [], openNow: false, maxDistanceKm: 20 };
    setDraft(empty);
    setSearchParams(writePlaceFilterParams(searchParams, empty), { replace: true });
  }

  function toggleType(type: PlaceType) {
    setDraft((current) => ({
      ...current,
      types: current.types.includes(type)
        ? current.types.filter((value) => value !== type)
        : [...current.types, type],
    }));
  }

  function toggleCuisine(cuisine: string) {
    setDraft((current) => ({
      ...current,
      cuisines: current.cuisines.includes(cuisine)
        ? current.cuisines.filter((value) => value !== cuisine)
        : [...current.cuisines, cuisine],
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

      <form id={formId} onSubmit={apply} className={`${expanded ? 'block' : 'hidden'} space-y-6 pt-5 lg:block lg:pt-0`}>
        <fieldset>
          <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-700">{t('filters.type')}</legend>
          <div className="space-y-1">
            {PlaceTypeSchema.options.map((type) => (
              <label key={type} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-800 hover:bg-brenne-50 focus-within:ring-2 focus-within:ring-creuse-700">
                <input type="checkbox" checked={draft.types.includes(type)} onChange={() => toggleType(type)} className="h-4 w-4 accent-brenne-700" />
                <span className="min-w-0 flex-1">{t(`types.${type}`)}</span>
                {counts.has(type) && <span className="text-xs text-gray-500">{counts.get(type)}</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-700">{t('filters.cuisine')}</legend>
          {categories.isError && (
            <div className="mb-3 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">
              <p>{t('filters.cuisineUnavailable')}</p>
              <button type="button" onClick={() => void categories.refetch()} className="font-semibold underline underline-offset-2">{t('filters.retry')}</button>
            </div>
          )}
          {categories.isLoading && <p className="text-sm text-gray-600" role="status">{t('filters.loadingCuisines')}</p>}
          <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
            {cuisines.map((cuisine) => (
              <label key={cuisine} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-800 hover:bg-brenne-50 focus-within:ring-2 focus-within:ring-creuse-700">
                <input type="checkbox" checked={draft.cuisines.includes(cuisine)} onChange={() => toggleCuisine(cuisine)} className="h-4 w-4 accent-brenne-700" />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t(`cuisines.${cuisine}`, { defaultValue: cuisine })}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-700">{t('filters.openNow')}</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-800 hover:bg-brenne-50 focus-within:ring-2 focus-within:ring-creuse-700">
            <input type="checkbox" checked={draft.openNow} onChange={(event) => setDraft((current) => ({ ...current, openNow: event.target.checked }))} className="h-4 w-4 accent-brenne-700" />
            {t('filters.openOnly')}
          </label>
        </fieldset>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor={`${formId}-distance`} className="text-xs font-bold uppercase tracking-wider text-gray-700">{t('filters.distance')}</label>
            <output htmlFor={`${formId}-distance`} className="text-sm font-bold text-brenne-800">{t('distanceKm', { distance: draft.maxDistanceKm })}</output>
          </div>
          <input id={`${formId}-distance`} type="range" min="1" max="20" step="1" value={draft.maxDistanceKm} onChange={(event) => setDraft((current) => ({ ...current, maxDistanceKm: Number(event.target.value) }))} className="w-full accent-brenne-700" />
          <div className="flex justify-between text-xs text-gray-600"><span>1 km</span><span>20 km</span></div>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-brenne-900/10 pt-5">
          <button type="submit" className="btn-primary min-h-11 flex-1">{t('filters.apply')}</button>
          <button type="button" onClick={reset} className="btn-secondary min-h-11">{t('filters.reset')}</button>
        </div>
      </form>
    </aside>
  );
}
