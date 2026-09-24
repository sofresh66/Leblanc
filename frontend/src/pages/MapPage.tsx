import React, { useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Event, EventCategory, EventListParamsInput } from '@leblanc/shared';
import { EventFilters } from '../components/events/EventFilters';
import { EventMap } from '../components/map/EventMap';
import { useEvents } from '../hooks/useEvents';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { buildLocalizedPath } from '../routes/routeMapping';

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
    const distParam = searchParams.get('maxDistanceKm');

    return {
      lang: currentLang,
      limit: 50,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(category && category !== 'all' ? { categories: [category as EventCategory] } : {}),
      ...(isFreeParam === 'true'
        ? { isFree: true }
        : isFreeParam === 'false'
          ? { isFree: false }
          : {}),
      ...(distParam && Number(distParam) < 20 ? { maxDistance: Number(distParam) * 1000 } : {}),
    };
  }, [searchParams, currentLang]);

  const { data, isLoading } = useEvents(filters);
  const events: Event[] = data?.items ?? [];

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

        <div className="lg:col-span-3">
          {isLoading && events.length === 0 ? (
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
