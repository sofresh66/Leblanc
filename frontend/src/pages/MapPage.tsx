import { PageSeo } from '../components/PageSeo';
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Event } from '@leblanc/shared';
import { ErrorState } from '../components/common/ErrorState';
import { EventFilters } from '../components/events/EventFilters';
import { EventMap } from '../components/map/EventMap';
import { useEvents, useEventsGeo } from '../hooks/useEvents';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { EventCard } from '../components/events/EventCard';
import { buildLocalizedPath } from '../routes/routeMapping';
import { eventFiltersFromSearchParams } from '../utils/eventFilterParams';

/** Nombre d'événements détaillés dans la colonne à côté de la carte. */
const SIDE_LIST_LIMIT = 20;

export const MapPage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'events', 'common']);
  const [searchParams] = useSearchParams();
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  const filters = useMemo(() => eventFiltersFromSearchParams(searchParams, currentLang), [searchParams, currentLang]);
  // Tous les points pour la carte ; la colonne latérale détaille les premiers.
  const geo = useEventsGeo(filters);
  const side = useEvents({ ...filters, limit: SIDE_LIST_LIMIT });
  const points = geo.data?.items ?? [];
  const events: Event[] = side.data?.items ?? [];
  const listUrl = `${buildLocalizedPath('list', currentLang)}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  return (
    <div className="space-y-10 sm:space-y-12 py-6 sm:py-8 pb-12">
      <PageSeo section="map" />
      <header className="space-y-5">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere]">
          {t('map.title', { ns: 'pages' })}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-gray-600">
          {t('map.subtitle', { ns: 'pages' })}
        </p>
      </header>

      {/* Mobile : carte d'abord, filtres ensuite (tiroir) ; ordre inversé sur grand écran. */}
      <div className="flex flex-col gap-8">
        <EventFilters layout="horizontal" className="order-2 lg:order-1" />

        <div className="order-1 lg:order-2 space-y-6">
          {geo.data?.truncated && (
            <p role="status" className="rounded-xl border border-creuse-200 bg-creuse-50 px-5 py-4 text-sm leading-relaxed text-creuse-900">
              {t('map.truncated', { ns: 'pages', count: points.length })}
            </p>
          )}

          {geo.isError ? (
            <ErrorState error={geo.error} onRetry={() => void geo.refetch()} />
          ) : geo.isLoading ? (
            <div role="status" aria-busy="true" className="h-[70vh] lg:h-[720px] w-full bg-brenne-100 rounded-2xl animate-pulse flex items-center justify-center text-brenne-900 text-sm">
              {t('actions.loading', { ns: 'common' })}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
              <EventMap
                points={points}
                selectedEventId={selectedEventId}
                onSelectEvent={setSelectedEventId}
                className="h-[70vh] min-h-[360px] lg:h-[720px] w-full shadow-md"
              />
              <section aria-label={t('map.results', { ns: 'pages', count: points.length })} className="min-w-0 space-y-5">
                <h2 className="font-display text-[28px] leading-tight text-brenne-950">
                  {t('map.results', { ns: 'pages', count: points.length })}
                </h2>
                {/* Alternative textuelle à la carte : la liste complète avec les mêmes filtres. */}
                <Link to={listUrl} className="btn-secondary min-h-11 w-full justify-center">
                  {t('map.listLink', { ns: 'pages' })}
                </Link>
                {side.isError ? (
                  <ErrorState error={side.error} onRetry={() => void side.refetch()} />
                ) : points.length === 0 ? (
                  <div className="rounded-2xl bg-white p-6 shadow-md space-y-3">
                    <h3 className="font-display text-2xl text-brenne-950">{t('list.emptyTitle', { ns: 'events' })}</h3>
                    <p className="text-gray-600 leading-relaxed">{t('list.emptyDescription', { ns: 'events' })}</p>
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6 lg:max-h-[600px] lg:overflow-y-auto p-1 pb-4 lg:pr-3">
                    {events.map((event) => (
                      <li key={event.id} className={'rounded-xl p-1 ' + (event.id === selectedEventId ? 'ring-2 ring-brenne-700 bg-brenne-50' : '')}>
                        <div><EventCard event={event} /></div>
                        <button
                          type="button"
                          aria-pressed={event.id === selectedEventId}
                          aria-label={t('map.selectEvent', { ns: 'pages', title: event.title })}
                          onClick={() => setSelectedEventId(event.id)}
                          className="btn-secondary w-full min-h-11 mt-3 text-creuse-800 border-creuse-200 hover:bg-creuse-50"
                        >
                          {t(event.id === selectedEventId ? 'map.selected' : 'map.showOnMap', { ns: 'pages' })}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MapPage;
