import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EventCategory, EventListParamsInput } from '@leblanc/shared';
import { EventFilters } from '../components/events/EventFilters';
import { EventList } from '../components/events/EventList';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';

export const ListPage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'events', 'common']);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  const filters = useMemo<Omit<EventListParamsInput, 'cursor'>>(() => {
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const category = searchParams.get('category');
    const isFreeParam = searchParams.get('isFree');
    const distParam = searchParams.get('maxDistanceKm');

    return {
      lang: currentLang,
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

  const handleResetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Page Header */}
      <div className="space-y-2">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
          {t('list.title', { ns: 'pages' })}
        </h1>
        <p className="text-sm sm:text-base text-gray-600">
          {t('list.subtitle', { ns: 'pages' })}
        </p>
      </div>

      {/* Main Grid: Filters Sidebar + Event List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        <aside className="lg:col-span-1 lg:sticky lg:top-24">
          <EventFilters />
        </aside>

        <div className="lg:col-span-3">
          <EventList
            filters={filters}
            onResetFilters={handleResetFilters}
          />
        </div>
      </div>
    </div>
  );
};

export default ListPage;
