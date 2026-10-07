import { PageSeo } from '../components/PageSeo';
import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  SEARCH_RADIUS_METERS,
  type EventCategory,
  type EventListParamsInput,
} from '@leblanc/shared';
import { SearchField } from '../components/common/SearchField';
import { EventFilters } from '../components/events/EventFilters';
import { EventList } from '../components/events/EventList';
import { resolveMaxDistanceMeters } from '../hooks/useEvents';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';

export const ListPage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'events', 'common', 'filters']);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  const filters = useMemo<Omit<EventListParamsInput, 'cursor'>>(() => {
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const category = searchParams.get('category');
    const isFreeParam = searchParams.get('isFree');
    const q = searchParams.get('q')?.trim();
    const maxDistanceMeters = resolveMaxDistanceMeters(searchParams);

    return {
      lang: currentLang,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(category && category !== 'all' ? { categories: [category as EventCategory] } : {}),
      ...(isFreeParam === 'true'
        ? { isFree: true }
        : isFreeParam === 'false'
          ? { isFree: false }
          : isFreeParam === 'unknown'
            ? { isFree: null }
            : {}),
      ...(q && q.length >= 2 ? { q } : {}),
      ...(maxDistanceMeters !== undefined && maxDistanceMeters < SEARCH_RADIUS_METERS
        ? { maxDistance: maxDistanceMeters }
        : {}),
    };
  }, [searchParams, currentLang]);

  const handleResetFilters = () => {
    // `replace: true` évite d'empiler une entrée d'historique à chaque changement de filtre.
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  return (
    <div className="space-y-10 sm:space-y-12 py-6 sm:py-8 pb-12">
      <PageSeo section="list" />
      {/* Page Header */}
      <div className="space-y-5">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere]">
          {t('list.title', { ns: 'pages' })}
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-gray-600">
          {t('list.subtitle', { ns: 'pages' })}
        </p>
      </div>

      {/* Main Grid: Filters Sidebar + Event List */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-8 items-start">
        <aside className="lg:sticky lg:top-24">
          <EventFilters />
        </aside>

        <div className="min-w-0 space-y-6">
          <SearchField
            label={t('search.label', { ns: 'filters' })}
            placeholder={t('search.placeholder', { ns: 'filters' })}
            clearLabel={t('search.clear', { ns: 'filters' })}
          />
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
