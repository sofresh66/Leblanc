import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PageSeo } from '../components/PageSeo';
import { ErrorState } from '../components/common/ErrorState';
import { SearchField } from '../components/common/SearchField';
import { TrailList } from '../components/walks/TrailList';
import { WalkFilters } from '../components/walks/WalkFilters';
import { DEFAULT_WALK_FILTERS, readWalkFilterParams, toTrailFilters, writeWalkFilterParams } from '../components/walks/walkFilterParams';
import { useTrailGeo } from '../hooks/useTrails';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/languages';

// Leaflet n'est chargé que si la vue carte est demandée.
const TrailsMapView = lazy(() => import('../components/walks/TrailsMapView'));

export function WalksPage() {
  const { t, i18n } = useTranslation('walks');
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const filters = useMemo(() => {
    const q = searchParams.get('q')?.trim();
    return toTrailFilters(readWalkFilterParams(searchParams), lang, q && q.length >= 2 ? q.slice(0, 80) : undefined);
  }, [lang, searchParams]);

  const view = searchParams.get('view') === 'map' ? 'map' : 'list';
  const geo = useTrailGeo(filters, view === 'map');
  const setView = (next: 'list' | 'map') => {
    const params = new URLSearchParams(searchParams);
    if (next === 'map') params.set('view', 'map');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  };
  const resetFilters = () => setSearchParams(writeWalkFilterParams(searchParams, DEFAULT_WALK_FILTERS), { replace: true });
  const mapLoading = <div role="status" aria-busy="true" className="h-[70vh] min-h-[360px] rounded-2xl bg-brenne-100 animate-pulse">{t('map.loading')}</div>;

  return (
    <div className="space-y-10 py-6 pb-12 sm:space-y-12 sm:py-8">
      <PageSeo section="walks" />
      <header className="space-y-5">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere]">{t('title')}</h1>
        <p className="max-w-2xl text-base leading-relaxed text-gray-700">{t('subtitle')}</p>
      </header>
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24"><WalkFilters /></div>
        <section id="walk-results" className="min-w-0 scroll-mt-24" aria-label={t('list.results')}>
          <SearchField
            className="mb-6"
            label={t('filters.search.label')}
            placeholder={t('filters.search.placeholder')}
            clearLabel={t('filters.search.clear')}
          />
          <div role="group" aria-label={t('view.label')} className="mb-6 inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {(['list', 'map'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`min-h-10 rounded-md px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creuse-700 ${view === option ? 'bg-brenne-700 text-white' : 'text-brenne-900 hover:bg-brenne-50'}`}
              >
                {t(`view.${option}`)}
              </button>
            ))}
          </div>
          {view === 'list' ? (
            <TrailList filters={filters} onResetFilters={resetFilters} />
          ) : geo.isError ? (
            <ErrorState error={geo.error} onRetry={() => void geo.refetch()} />
          ) : geo.data ? (
            <Suspense fallback={mapLoading}>
              <TrailsMapView items={geo.data.items} truncated={geo.data.truncated} lang={lang} />
            </Suspense>
          ) : mapLoading}
        </section>
      </div>
    </div>
  );
}
