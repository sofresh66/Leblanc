import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PageSeo } from '../components/PageSeo';
import { SearchField } from '../components/common/SearchField';
import { PlaceFilters } from '../components/places/PlaceFilters';
import { PlaceList } from '../components/places/PlaceList';
import { readPlaceFilterParams, writePlaceFilterParams } from '../components/places/placeFilterParams';
import { usePlaceCategories } from '../hooks/usePlaceCategories';
import { usePlacesForMap } from '../hooks/usePlaces';
import { ErrorState } from '../components/common/ErrorState';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/languages';

// Leaflet n'est chargé que si la vue carte est demandée.
const PlacesMapView = lazy(() => import('../components/places/PlacesMapView'));

export function EatPage() {
  const { t, i18n } = useTranslation('places');
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const categories = usePlaceCategories();
  const total = categories.data?.types.reduce((sum, type) => sum + type.count, 0);
  const filters = useMemo(() => {
    const values = readPlaceFilterParams(searchParams);
    const q = searchParams.get('q')?.trim();
    return {
      ...(q && q.length >= 2 ? { q: q.slice(0, 80) } : {}),
      lang,
      ...(values.types.length ? { types: values.types } : {}),
      ...(values.cuisines.length ? { cuisines: values.cuisines } : {}),
      ...(values.openNow ? { isOpenNow: true } : {}),
      ...(values.maxDistanceKm < 20 ? { maxDistance: values.maxDistanceKm * 1000 } : {}),
    };
  }, [lang, searchParams]);

  const view = searchParams.get('view') === 'map' ? 'map' : 'list';
  const mapPlaces = usePlacesForMap(filters, view === 'map');
  const setView = (next: 'list' | 'map') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'map') params.set('view', 'map');
    else params.delete('view');
    params.delete('cursor');
    setSearchParams(params, { replace: true });
  };

  const resetFilters = () => {
    setSearchParams(writePlaceFilterParams(searchParams, {
      types: [], cuisines: [], openNow: false, maxDistanceKm: 20,
    }), { replace: true });
  };

  return (
    <div className="space-y-10 py-6 pb-12 sm:space-y-12 sm:py-8">
      <PageSeo section="eat" />
      <header className="space-y-5">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere]">{t('title')}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-gray-600">{t('subtitle')}</p>
        {total !== undefined && (
          <p className="inline-flex rounded-full border border-brenne-200 bg-brenne-50 px-4 py-2 text-sm font-semibold text-brenne-900" role="status">
            {t('count', { count: total })}
          </p>
        )}
      </header>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24"><PlaceFilters /></div>
        <section id="place-results" className="min-w-0 scroll-mt-24" aria-label={t('list.results')}>
          <SearchField
            className="mb-6"
            label={t('filters.search.label')}
            placeholder={t('filters.search.placeholder')}
            clearLabel={t('filters.search.clear')}
            resetParams={['cursor']}
          />
          <div role="group" aria-label={t('view.label')} className="mb-6 inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {(['list', 'map'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`min-h-10 rounded-md px-4 text-sm font-semibold ${view === option ? 'bg-brenne-700 text-white' : 'text-brenne-900 hover:bg-brenne-50'}`}
              >
                {t(`view.${option}`)}
              </button>
            ))}
          </div>
          {view === 'list' ? (
            <PlaceList filters={filters} onResetFilters={resetFilters} />
          ) : mapPlaces.isError ? (
            <ErrorState error={mapPlaces.error} onRetry={() => void mapPlaces.refetch()} />
          ) : mapPlaces.data ? (
            <Suspense fallback={<div role="status" aria-busy="true" className="h-[70vh] rounded-2xl bg-brenne-100 animate-pulse">{t('detail.mapLoading')}</div>}>
              <PlacesMapView places={mapPlaces.data} lang={lang} />
            </Suspense>
          ) : (
            <div role="status" aria-busy="true" className="h-[70vh] rounded-2xl bg-brenne-100 animate-pulse">{t('detail.mapLoading')}</div>
          )}
        </section>
      </div>
    </div>
  );
}
