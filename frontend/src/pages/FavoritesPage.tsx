import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EventDetail } from '@leblanc/shared';
import { PageSeo } from '../components/PageSeo';
import { EventCard } from '../components/events/EventCard';
import { HeartIcon } from '../components/favorites/FavoriteButton';
import { useFavorites } from '../hooks/useFavorites';
import { useFavoriteEvents } from '../hooks/useFavoriteEvents';
import { useLocalizedPath } from '../hooks/useLocalizedPath';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../i18n/languages';
import { occurrenceStatus } from '../utils/eventDates';

const gridStyle = 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6';
const sectionTitle = 'font-display text-[28px] font-bold text-brenne-950';

/** Passé : toutes les séances (ou, à défaut, les dates de l'événement) sont terminées. */
export function isPastEvent(event: EventDetail, now: Date = new Date()): boolean {
  const occurrences = event.occurrences.length > 0 ? event.occurrences : [event];
  return occurrences.every((occurrence) => occurrenceStatus(occurrence, now) === 'past');
}

const byStartDate = (a: EventDetail, b: EventDetail) => Date.parse(a.startDate) - Date.parse(b.startDate);

const CardSkeleton: React.FC = () => (
  <div aria-hidden="true" className="bg-white rounded-xl shadow-md overflow-hidden motion-safe:animate-pulse flex flex-col pb-6">
    <div className="w-full aspect-[4/3] bg-brenne-100 mb-6" />
    <div className="h-6 bg-gray-200 rounded w-4/5 mx-5 mb-3" />
    <div className="h-3 bg-gray-200 rounded w-2/3 mx-5" />
  </div>
);

export const FavoritesPage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'common']);
  const getLocalizedPath = useLocalizedPath();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const { items, count, persistent, removeEvent, clear } = useFavorites();
  const states = useFavoriteEvents(items, lang);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questionId = useId();

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);
  // Après « Annuler » : le bouton « Tout retirer » est de nouveau rendu, il reprend le focus.
  useEffect(() => {
    if (!restoreFocus) return;
    clearButton.current?.focus();
    setRestoreFocus(false);
  }, [restoreFocus]);
  useEffect(() => {
    if (count > 0) setCleared(false);
  }, [count]);

  const cancel = () => {
    setConfirming(false);
    setRestoreFocus(true);
  };
  const confirmClear = () => {
    if (!clear()) return;
    setConfirming(false);
    setCleared(true);
    headingRef.current?.focus();
  };

  const now = new Date();
  const ready = states.flatMap((state) => (state.status === 'ready' ? [state.event] : []));
  const upcoming = ready.filter((event) => !isPastEvent(event, now)).sort(byStartDate);
  const past = ready.filter((event) => isPastEvent(event, now)).sort(byStartDate);
  const loading = states.filter((state) => state.status === 'loading');
  const unavailable = states.filter((state) => state.status === 'missing' || state.status === 'error');

  return (
    <div className="space-y-8 py-6 sm:py-8">
      <PageSeo section="favorites" noindex noCanonical />
      <header className="space-y-3">
        <h1 ref={headingRef} tabIndex={-1} className="section-title text-4xl sm:text-[40px] focus:outline-none">
          {t('favorites.title')}
        </h1>
        <p className="text-base text-gray-700">{t('favorites.intro')}</p>
        {!persistent && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('favorites.notPersistent')}</p>
        )}
      </header>

      <p role="status" className="sr-only">{cleared ? t('favorites.cleared') : ''}</p>

      {count === 0 ? (
        <div data-testid="favorites-empty" className="text-center py-16 px-6 bg-white rounded-2xl border border-brenne-900/5 max-w-xl mx-auto shadow-md">
          <div className="w-16 h-16 bg-brenne-50 text-brenne-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <HeartIcon filled={false} className="w-8 h-8" />
          </div>
          <h2 className={`${sectionTitle} mb-4`}>{t('favorites.emptyTitle')}</h2>
          <p className="text-base leading-relaxed text-gray-600 mb-8">{t('favorites.emptyBody')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to={getLocalizedPath('list')} className="btn-primary min-h-11 inline-flex items-center">{t('favorites.browse')}</Link>
            <Link to={getLocalizedPath('home')} className="btn-secondary min-h-11 inline-flex items-center">{t('favorites.home')}</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {confirming ? (
              <div
                role="group"
                aria-labelledby={questionId}
                onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-brenne-900/10 bg-white px-4 py-2 shadow-sm"
              >
                <p id={questionId} className="text-sm font-semibold text-gray-900">{t('favorites.confirmClear', { count })}</p>
                <button ref={confirmButton} type="button" onClick={confirmClear} className="btn-primary min-h-11 text-sm">
                  {t('favorites.confirm')}
                </button>
                <button type="button" onClick={cancel} className="btn-secondary min-h-11 text-sm">{t('favorites.cancel')}</button>
              </div>
            ) : (
              <button ref={clearButton} type="button" onClick={() => setConfirming(true)} className="btn-secondary min-h-11 text-sm">
                {t('favorites.clearAll')}
              </button>
            )}
          </div>

          {(upcoming.length > 0 || loading.length > 0) && (
            <section aria-labelledby="favorites-upcoming" className="space-y-4">
              <h2 id="favorites-upcoming" className={sectionTitle}>{t('favorites.upcoming')}</h2>
              <div className={gridStyle} aria-busy={loading.length > 0}>
                {upcoming.map((event) => <EventCard key={event.id} event={event} />)}
                {loading.map((state) => <CardSkeleton key={state.id} />)}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section aria-labelledby="favorites-past" className="space-y-4">
              <h2 id="favorites-past" className={sectionTitle}>{t('favorites.past')}</h2>
              <div className={gridStyle}>
                {past.map((event) => <EventCard key={event.id} event={event} />)}
              </div>
            </section>
          )}

          {unavailable.length > 0 && (
            <section aria-labelledby="favorites-missing" className="space-y-4">
              <h2 id="favorites-missing" className={sectionTitle}>{t('favorites.missingTitle')}</h2>
              <ul className="space-y-3">
                {unavailable.map((state) => (
                  <li key={state.id} data-testid="favorite-unavailable" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brenne-900/10 bg-white px-4 py-3">
                    <p className="text-sm text-gray-700">
                      {t(state.status === 'missing' ? 'favorites.missingItem' : 'favorites.errorItem')}
                    </p>
                    <div className="flex gap-2">
                      {state.status === 'error' && (
                        <button type="button" onClick={state.retry} className="btn-secondary min-h-11 text-sm">{t('favorites.retry')}</button>
                      )}
                      <button type="button" onClick={() => removeEvent(state.id)} className="btn-secondary min-h-11 text-sm">
                        {t('favorites.remove')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default FavoritesPage;
