import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Event, EventListParamsInput } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';
import { useInfiniteEvents } from '../../hooks/useEvents';
import { EventCard } from './EventCard';

export interface EventListProps {
  /** Liste statique d'événements à afficher (prioritaire si fournie) */
  events?: Event[] | undefined;
  /** Paramètres de filtres pour charger les événements de manière paginée */
  filters?: Omit<EventListParamsInput, 'cursor'> | undefined;
  /** État de chargement manuel (utilisé si events est fourni) */
  isLoading?: boolean | undefined;
  /** Callback optionnel pour réinitialiser les filtres en état vide */
  onResetFilters?: (() => void) | undefined;
  /** Masquer le bouton de pagination (ex: pour affichage d'un aperçu) */
  hidePagination?: boolean | undefined;
}

export const EventList: React.FC<EventListProps> = ({
  events: propEvents,
  filters: propFilters,
  isLoading: propIsLoading,
  onResetFilters,
  hidePagination = false,
}) => {
  const { t, i18n } = useTranslation(['events', 'common', 'errors']);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  const effectiveFilters: Omit<EventListParamsInput, 'cursor'> = propFilters ?? { lang: currentLang };
  const query = useInfiniteEvents(effectiveFilters);

  const isQueryMode = propEvents === undefined;
  const isLoading = isQueryMode ? query.isLoading : (propIsLoading ?? false);
  const isError = isQueryMode ? query.isError : false;
  const error = isQueryMode ? query.error : null;

  const events: Event[] = isQueryMode
    ? (query.data?.pages.flatMap((page) => page.items) ?? [])
    : propEvents;

  // Skeletons de chargement
  if (isLoading && events.length === 0) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t('actions.loading', { ns: 'common' })}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm animate-pulse flex flex-col h-96"
          >
            <div className="w-full aspect-[16/9] bg-gray-200 rounded-lg mb-4" />
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-6 bg-gray-200 rounded w-4/5 mb-3" />
            <div className="space-y-2 flex-grow">
              <div className="h-3 bg-gray-200 rounded w-full" />
              <div className="h-3 bg-gray-200 rounded w-5/6" />
            </div>
            <div className="pt-4 border-t border-gray-100 flex justify-between items-center mt-auto">
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-4 bg-gray-200 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // État d'erreur
  if (isError) {
    return (
      <div
        role="alert"
        className="p-8 text-center bg-red-50 border border-red-200 rounded-2xl max-w-xl mx-auto my-8"
      >
        <svg
          className="w-12 h-12 text-red-500 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <h3 className="text-lg font-bold text-red-900 mb-2">
          {t('generic', { ns: 'errors' })}
        </h3>
        {error && <p className="text-sm text-red-700 mb-4">{error.message}</p>}
        <button
          type="button"
          onClick={() => query.refetch()}
          className="btn-primary inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('actions.retry', { ns: 'common' })}
        </button>
      </div>
    );
  }

  // État vide
  if (events.length === 0) {
    return (
      <div className="text-center py-16 px-4 bg-white rounded-2xl border border-gray-100 max-w-lg mx-auto shadow-sm my-6">
        <div className="w-16 h-16 bg-brenne-50 text-brenne-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {t('list.emptyTitle', { ns: 'events' })}
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          {t('list.emptyDescription', { ns: 'events' })}
        </p>
        {onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="btn-secondary text-sm inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {t('list.resetFilters', { ns: 'events' })}
          </button>
        )}
      </div>
    );
  }

  // Grille d'événements
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Pagination par curseur "Charger plus" */}
      {isQueryMode && !hidePagination && (
        <div className="text-center pt-4">
          {query.hasNextPage ? (
            <button
              type="button"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="btn-primary inline-flex items-center gap-2 px-8 py-3 text-base shadow-sm disabled:opacity-60"
            >
              {query.isFetchingNextPage ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>{t('actions.loading', { ns: 'common' })}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span>{t('list.loadMore', { ns: 'events' })}</span>
                </>
              )}
            </button>
          ) : (
            <p className="text-xs text-gray-500 font-medium">
              {t('list.noMoreEvents', { ns: 'events' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
