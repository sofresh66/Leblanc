import React, { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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
import { buildLocalizedPath } from '../routes/routeMapping';

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
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          {t('map.title', { ns: 'pages' })}
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          {t('map.subtitle', { ns: 'pages' })}
        </p>
      </div>

      {/* Main Container: Filters Sidebar + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        <aside className="lg:col-span-1">
          <EventFilters />

          {/* Quick list of mapped events */}
          <div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hidden lg:block max-h-96 overflow-y-auto space-y-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
              {events.length} {t('list.title', { ns: 'pages' })}
            </span>
            {events.map((event) => {
              const isSelected = event.id === selectedEventId;
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setSelectedEventId(event.id)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors flex flex-col gap-1 border ${
                    isSelected
                      ? 'bg-brenne-50 border-brenne-500 text-brenne-900 font-bold'
                      : 'hover:bg-gray-50 border-transparent text-gray-700'
                  }`}
                >
                  <span className="truncate">{event.title}</span>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-normal">
                    <span>{event.city}</span>
                    <Link
                      to={buildLocalizedPath('events', currentLang, event.id)}
                      className="text-brenne-700 hover:underline font-semibold"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t('actions.view', { ns: 'common' })}
                    </Link>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-3">
          {isAtMapLimit && !isError && (
            <p
              role="status"
              className="text-xs sm:text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5"
            >
              {t('map.limitBanner', { ns: 'pages', count: events.length })}
            </p>
          )}

          {isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading && events.length === 0 ? (
            <div className="h-[500px] lg:h-[650px] w-full bg-gray-200 rounded-2xl animate-pulse flex items-center justify-center text-gray-500 text-sm">
              {t('actions.loading', { ns: 'common' })}
            </div>
          ) : (
            <EventMap
              events={events}
              selectedEventId={selectedEventId}
              onSelectEvent={(e) => setSelectedEventId(e.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MapPage;
