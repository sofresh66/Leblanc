import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CATEGORIES, type Event } from '@leblanc/shared';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/events/EventCard';
import { ErrorState } from '../components/common/ErrorState';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { buildLocalizedPath } from '../routes/routeMapping';

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'events', 'common', 'nav']);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  const { data, isLoading, isError, error, refetch } = useEvents({
    lang: currentLang,
    limit: 15,
  });

  const allEvents: Event[] = data?.items ?? [];

  // Découpage des sections d'événements
  const topEvents = allEvents.slice(0, 3);
  const weekendEvents = allEvents.filter((e) => {
    const day = new Date(e.startDate).getDay();
    return day === 0 || day === 6; // Dimanche (0) ou Samedi (6)
  }).slice(0, 3);
  const recentEvents = allEvents.slice(3, 6);

  // Catégories avec leurs icônes et couleurs
  const categoryMeta: Record<string, { icon: string; bg: string; text: string }> = {
    culture: {
      icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
      bg: 'bg-creuse-100 hover:bg-creuse-200',
      text: 'text-creuse-800',
    },
    sport: {
      icon: 'M13 10V3L4 14h7v7l9-11h-7z',
      bg: 'bg-emerald-100 hover:bg-emerald-200',
      text: 'text-emerald-800',
    },
    fete: {
      icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      bg: 'bg-amber-100 hover:bg-amber-200',
      text: 'text-amber-800',
    },
    association: {
      icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
      bg: 'bg-indigo-100 hover:bg-indigo-200',
      text: 'text-indigo-800',
    },
    autre: {
      icon: 'M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z',
      bg: 'bg-gray-100 hover:bg-gray-200',
      text: 'text-gray-800',
    },
  };

  return (
    <div className="space-y-16 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brenne-900 via-brenne-800 to-brenne-950 text-white shadow-lg p-8 sm:p-12 lg:p-16">
        <div className="relative z-10 max-w-2xl space-y-6">
          <span className="inline-block px-3.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full bg-brenne-700/80 text-brenne-100 backdrop-blur-sm border border-brenne-600/50">
            {t('app.name', { ns: 'common' })}
          </span>

          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
            {t('home.title', { ns: 'pages' })}
          </h1>

          <p className="text-base sm:text-lg text-brenne-100/90 leading-relaxed font-normal">
            {t('home.subtitle', { ns: 'pages' })}
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to={buildLocalizedPath('map', currentLang)}
              className="btn-primary bg-white text-brenne-900 hover:bg-brenne-50 inline-flex items-center gap-2 px-6 py-3 text-sm font-bold shadow-md transition-all"
            >
              <svg className="w-5 h-5 text-brenne-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              {t('home.viewMap', { ns: 'pages' })}
            </Link>

            <Link
              to={buildLocalizedPath('list', currentLang)}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg bg-brenne-800/80 hover:bg-brenne-700/90 text-white backdrop-blur-sm border border-brenne-600/40 transition-all"
            >
              <svg className="w-5 h-5 text-brenne-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              {t('home.viewAll', { ns: 'pages' })}
            </Link>
          </div>
        </div>

        {/* Décoration d'arrière-plan */}
        <div className="absolute -right-16 -bottom-16 w-80 h-80 rounded-full bg-brenne-600/20 blur-3xl pointer-events-none" />
        <div className="absolute right-1/4 -top-12 w-64 h-64 rounded-full bg-creuse-500/10 blur-2xl pointer-events-none" />
      </section>

      {/* Section 1 : Top du moment */}
      <section className="space-y-6">
        <div className="flex items-end justify-between border-b border-gray-100 pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-gray-900 tracking-tight">
              {t('home.topTitle', { ns: 'pages' })}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t('home.topSubtitle', { ns: 'pages' })}
            </p>
          </div>
          <Link
            to={buildLocalizedPath('list', currentLang)}
            className="text-sm font-bold text-brenne-700 hover:text-brenne-900 inline-flex items-center gap-1 group"
          >
            <span>{t('home.viewAll', { ns: 'pages' })}</span>
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-80 bg-gray-200 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {topEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2 : Explorer par thématique (Catégories) */}
      <section className="space-y-6">
        <h2 className="font-display text-2xl font-bold text-gray-900 tracking-tight">
          {t('home.categoriesTitle', { ns: 'pages' })}
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {CATEGORIES.map((cat) => {
            const meta = categoryMeta[cat] ?? categoryMeta.autre!;
            return (
              <Link
                key={cat}
                to={`${buildLocalizedPath('list', currentLang)}?category=${cat}`}
                className={`p-5 rounded-2xl border border-gray-100 flex flex-col items-center justify-center text-center gap-3 transition-all duration-200 group shadow-sm hover:shadow-md bg-white hover:-translate-y-0.5`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${meta.bg} ${meta.text}`}>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={meta.icon} />
                  </svg>
                </div>
                <span className="text-sm font-bold text-gray-800 group-hover:text-brenne-800 transition-colors">
                  {t(`categories.${cat}`, { ns: 'events' })}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Section 3 : Ce week-end */}
      {weekendEvents.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-end justify-between border-b border-gray-100 pb-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-gray-900 tracking-tight">
                {t('home.weekendTitle', { ns: 'pages' })}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {t('home.weekendSubtitle', { ns: 'pages' })}
              </p>
            </div>
            <Link
              to={buildLocalizedPath('list', currentLang)}
              className="text-sm font-bold text-brenne-700 hover:text-brenne-900 inline-flex items-center gap-1 group"
            >
              <span>{t('home.viewAll', { ns: 'pages' })}</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {weekendEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Section 4 : Récents */}
      {recentEvents.length > 0 && (
        <section className="space-y-6">
          <div className="flex items-end justify-between border-b border-gray-100 pb-4">
            <h2 className="font-display text-2xl font-bold text-gray-900 tracking-tight">
              {t('home.recentTitle', { ns: 'pages' })}
            </h2>
            <Link
              to={buildLocalizedPath('list', currentLang)}
              className="text-sm font-bold text-brenne-700 hover:text-brenne-900 inline-flex items-center gap-1 group"
            >
              <span>{t('home.viewAll', { ns: 'pages' })}</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default HomePage;
