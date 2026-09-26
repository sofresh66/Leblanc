import { PageSeo } from '../components/PageSeo';
import React, { useEffect } from 'react';
import { prefetchPage } from '../routes/pageImports';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CATEGORIES, type Event, type EventCategory } from '@leblanc/shared';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/events/EventCard';
import { ErrorState } from '../components/common/ErrorState';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { buildLocalizedPath } from '../routes/routeMapping';

const categoryMeta: Record<EventCategory, { icon: string; surface: string; iconColor: string; border: string }> = {
  culture: {
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    surface: 'bg-violet-50 group-hover:bg-violet-100', iconColor: 'text-violet-800', border: 'group-hover:border-violet-200',
  },
  sport: {
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
    surface: 'bg-creuse-50 group-hover:bg-creuse-100', iconColor: 'text-creuse-800', border: 'group-hover:border-creuse-200',
  },
  fete: {
    icon: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    surface: 'bg-orange-50 group-hover:bg-orange-100', iconColor: 'text-orange-800', border: 'group-hover:border-orange-200',
  },
  association: {
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    surface: 'bg-brenne-50 group-hover:bg-brenne-100', iconColor: 'text-brenne-800', border: 'group-hover:border-brenne-200',
  },
  autre: {
    icon: 'M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z',
    surface: 'bg-gray-100 group-hover:bg-gray-200', iconColor: 'text-gray-700', border: 'group-hover:border-gray-300',
  },
};

function SectionHeader({ id, title, subtitle, href, action }: { id: string; title: string; subtitle?: string; href?: string; action?: string }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id={id} className="section-title">{title}</h2>
        {subtitle && <p className="mt-4 text-base leading-relaxed text-gray-600">{subtitle}</p>}
      </div>
      {href && action && (
        <Link to={href} className="group inline-flex shrink-0 items-center gap-2 self-start text-sm font-bold text-creuse-800 hover:text-creuse-900 sm:mb-1">
          {action}
          <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        </Link>
      )}
    </div>
  );
}

function EventGrid({ events }: { events: Event[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
      {events.map((event) => <EventCard key={event.id} event={event} />)}
    </div>
  );
}

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation(['pages', 'events', 'common']);
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
  const listPath = buildLocalizedPath('list', currentLang);
  useEffect(() => {
    const timer = window.setTimeout(() => prefetchPage(listPath), 2000);
    return () => window.clearTimeout(timer);
  }, [listPath]);

  const { data, isLoading, isError, error, refetch } = useEvents({ lang: currentLang, limit: 15 });
  const allEvents: Event[] = data?.items ?? [];

  // La sélection conserve volontairement la logique existante jusqu'au sous-lot 8.2.
  const topEvents = allEvents.slice(0, 3);
  const weekendEvents = allEvents.filter((event) => {
    const day = new Date(event.startDate).getDay();
    return day === 0 || day === 6;
  }).slice(0, 3);
  const recentEvents = allEvents.slice(3, 6);

  return (
    <div className="-mt-2 sm:-mt-4">
      <PageSeo section="home" />
      <section
        aria-labelledby="home-title"
        className="relative isolate flex min-h-[510px] items-center overflow-hidden rounded-[24px] bg-brenne-950 bg-cover bg-center px-6 py-14 text-white shadow-xl sm:min-h-[540px] sm:rounded-[32px] sm:px-12 lg:min-h-[580px] lg:px-20"
        style={{ backgroundImage: "url('/images/hero-le-blanc.jpg')" }}
      >
        <div className="absolute inset-0 -z-10 bg-black/60" aria-hidden="true" />
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-brenne-300" />
            {t('app.name', { ns: 'common' })}
          </span>
          <h1 id="home-title" className="mt-6 font-display text-5xl font-bold leading-[1.08] tracking-tight sm:text-6xl lg:text-7xl">
            {t('home.title', { ns: 'pages' })}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/95 sm:text-xl">
            {t('home.subtitle', { ns: 'pages' })}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
            <Link to={buildLocalizedPath('map', currentLang)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brenne-700 px-6 py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-brenne-800 focus-visible:ring-white">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15" /></svg>
              {t('home.viewMap', { ns: 'pages' })}
            </Link>
            <Link to={listPath} className="inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-white px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-white hover:text-brenne-950 focus-visible:ring-white">
              {t('home.viewAll', { ns: 'pages' })}
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-8 py-16 sm:py-20" aria-labelledby="top-title">
        <SectionHeader id="top-title" title={t('home.topTitle', { ns: 'pages' })} subtitle={t('home.topSubtitle', { ns: 'pages' })} href={listPath} action={t('home.viewAll', { ns: 'pages' })} />
        {isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : isLoading ? (
          <div role="status" aria-busy="true" aria-label={t('actions.loading', { ns: 'common' })} className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-xl bg-brenne-100" />)}
          </div>
        ) : <EventGrid events={topEvents} />}
      </section>

      {weekendEvents.length > 0 && (
        <section className="-mx-4 space-y-8 bg-sable-100 px-4 py-16 sm:-mx-6 sm:px-6 sm:py-20 lg:-mx-8 lg:px-8" aria-labelledby="weekend-title">
          <SectionHeader id="weekend-title" title={t('home.weekendTitle', { ns: 'pages' })} subtitle={t('home.weekendSubtitle', { ns: 'pages' })} href={listPath} action={t('home.viewAll', { ns: 'pages' })} />
          <EventGrid events={weekendEvents} />
        </section>
      )}

      <section className="space-y-8 py-16 sm:py-20" aria-labelledby="categories-title">
        <SectionHeader id="categories-title" title={t('home.categoriesTitle', { ns: 'pages' })} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {CATEGORIES.map((category) => {
            const meta = categoryMeta[category];
            return (
              <Link
                key={category}
                to={`${listPath}?category=${category}`}
                className={`group flex min-h-44 flex-col justify-between rounded-xl border border-brenne-900/10 bg-white p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-px hover:shadow-lg ${meta.border}`}
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${meta.surface} ${meta.iconColor}`}>
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} /></svg>
                </span>
                <span className="flex items-end justify-between gap-2 text-left">
                  <span className="font-display text-lg font-bold leading-tight text-brenne-950">{t(`categories.${category}`, { ns: 'events' })}</span>
                  <span className="text-brenne-700" aria-hidden="true">↗</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {recentEvents.length > 0 && (
        <section className="space-y-8 border-t border-brenne-900/10 py-16 sm:py-20" aria-labelledby="recent-title">
          <SectionHeader id="recent-title" title={t('home.recentTitle', { ns: 'pages' })} href={listPath} action={t('home.viewAll', { ns: 'pages' })} />
          <EventGrid events={recentEvents} />
        </section>
      )}
    </div>
  );
};

export default HomePage;
