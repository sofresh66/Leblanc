import { PageSeo } from '../components/PageSeo';
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  SEARCH_RADIUS_METERS,
  type Event,
  type EventCategory,
  type EventListParamsInput,
} from '@leblanc/shared';
import { ErrorState } from '../components/common/ErrorState';
import { EventFilters } from '../components/events/EventFilters';
import { EventMap } from '../components/map/EventMap';
import { resolveMaxDistanceMeters, useEvents } from '../hooks/useEvents';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { EventCard } from '../components/events/EventCard';

/** Nombre maximal d'événements demandé à l'API pour l'affichage cartographique. */
const MAP_LIMIT = 50;

export const MapPage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'events', 'common']);
  const [searchParams] = useSearchParams();
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  const filters = useMemo<EventListParamsInput>(() => {
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const category = searchParams.get('category');
    const isFreeParam = searchParams.get('isFree');
    const maxDistanceMeters = resolveMaxDistanceMeters(searchParams);

    return {
      lang: currentLang,
      limit: MAP_LIMIT,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(category && category !== 'all' ? { categories: [category as EventCategory] } : {}),
      ...(isFreeParam === 'true'
        ? { isFree: true }
        : isFreeParam === 'false'
          ? { isFree: false }
          : {}),
      ...(maxDistanceMeters !== undefined && maxDistanceMeters < SEARCH_RADIUS_METERS
        ? { maxDistance: maxDistanceMeters }
        : {}),
    };
  }, [searchParams, currentLang]);

  const { data, isLoading, isError, error, refetch } = useEvents(filters);
  const events: Event[] = data?.items ?? [];
  // La carte ne gère pas le curseur : au-delà de la limite, on invite à affiner les filtres.
  const isAtMapLimit = events.length >= MAP_LIMIT;

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

      <EventFilters layout="horizontal" />

      {isAtMapLimit && !isError && (
        <p role="status" className="rounded-xl border border-creuse-200 bg-creuse-50 px-5 py-4 text-sm leading-relaxed text-creuse-900">
          {t(data?.total !== undefined ? 'map.limitBannerWithTotal' : 'map.limitBanner', {
            ns: 'pages', count: events.length, total: data?.total,
          })}
        </p>
      )}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading && events.length === 0 ? (
        <div role="status" aria-busy="true" className="h-[420px] lg:h-[720px] w-full bg-brenne-100 rounded-2xl animate-pulse flex items-center justify-center text-brenne-900 text-sm">
          {t('actions.loading', { ns: 'common' })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
          <EventMap
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={(event) => setSelectedEventId(event.id)}
            className="h-[420px] sm:h-[520px] lg:h-[720px] w-full shadow-md"
          />
          <section aria-label={t('map.results', { ns: 'pages', count: events.length })} className="min-w-0">
            <h2 className="font-display text-[28px] leading-tight text-brenne-950 mb-5">
              {t('map.results', { ns: 'pages', count: events.length })}
            </h2>
            {events.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 shadow-md space-y-3">
                <h3 className="font-display text-2xl text-brenne-950">{t('list.emptyTitle', { ns: 'events' })}</h3>
                <p className="text-gray-600 leading-relaxed">{t('list.emptyDescription', { ns: 'events' })}</p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-6 lg:max-h-[664px] lg:overflow-y-auto p-1 pb-4 lg:pr-3">
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
  );
};

export default MapPage;
