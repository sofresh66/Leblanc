import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Event } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';
import { buildLocalizedPath } from '../../routes/routeMapping';

export interface EventCardProps {
  event: Event;
  showDistance?: boolean;
}

export const EventCard: React.FC<EventCardProps> = ({ event, showDistance = true }) => {
  const { t, i18n } = useTranslation(['events', 'common']);
  const [imageError, setImageError] = useState(false);

  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
  const detailUrl = buildLocalizedPath('events', currentLang, event.id);

  // Format dates
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const isSameDay = !endDate || startDate.toDateString() === endDate.toDateString();

  const dateFormatter = new Intl.DateTimeFormat(currentLang, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: event.timezone || 'Europe/Paris',
  });
  const timeFormatter = new Intl.DateTimeFormat(currentLang, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: event.timezone || 'Europe/Paris',
  });

  const formattedDate = isSameDay
    ? `${dateFormatter.format(startDate)} • ${timeFormatter.format(startDate)}`
    : `${dateFormatter.format(startDate)} - ${dateFormatter.format(endDate!)}`;

  // Format distance (en mètres dans le modèle -> converti en km avec Intl.NumberFormat)
  const distanceKm =
    event.distance !== undefined
      ? new Intl.NumberFormat(currentLang, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 0,
        }).format(event.distance / 1000)
      : null;

  // Format price
  let priceText = '';
  if (event.isFree) {
    priceText = t('price.free', { ns: 'events' });
  } else if (event.priceMin !== null && event.priceMin !== undefined) {
    const formattedAmount = new Intl.NumberFormat(currentLang, {
      style: 'currency',
      currency: event.currency || 'EUR',
      maximumFractionDigits: 2,
    }).format(event.priceMin);
    priceText = t('price.from', { price: formattedAmount, ns: 'events' });
  } else {
    priceText = t('price.paid', { ns: 'events' });
  }

  // Category color accents
  const categoryBadgeColors: Record<string, string> = {
    culture: 'bg-creuse-100 text-creuse-800 border-creuse-200',
    sport: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    fete: 'bg-amber-100 text-amber-800 border-amber-200',
    association: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    autre: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const badgeClass = categoryBadgeColors[event.category] || categoryBadgeColors.autre;

  return (
    <article
      data-testid={`event-card-${event.id}`}
      className="card group flex flex-col h-full bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100"
    >
      {/* Image header with category badge */}
      <div className="relative aspect-[16/9] w-full bg-brenne-50 overflow-hidden">
        {event.imageUrl && !imageError ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-brenne-100 to-brenne-200 text-brenne-700">
            <svg
              className="w-12 h-12 opacity-40 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs font-medium text-brenne-800 tracking-wide uppercase">
              {event.city}
            </span>
          </div>
        )}

        {/* Category Badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border shadow-sm ${badgeClass}`}>
            {t(`categories.${event.category}`, { ns: 'events' })}
          </span>
          {event.isFallback && (
            <span
              title={t('details.fallbackNotice', { ns: 'events' })}
              className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-900/70 text-white backdrop-blur-sm tracking-wider uppercase"
            >
              FR
            </span>
          )}
        </div>

        {/* Price tag */}
        <div className="absolute bottom-3 right-3">
          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white/95 text-gray-900 shadow-sm backdrop-blur-sm border border-gray-100">
            {priceText}
          </span>
        </div>
      </div>

      {/* Content body */}
      <div className="p-4 sm:p-5 flex flex-col flex-grow">
        {/* Date and Distance */}
        <div className="flex items-center justify-between text-xs text-brenne-700 font-medium mb-2 gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <svg className="w-4 h-4 flex-shrink-0 text-brenne-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">{formattedDate}</span>
          </div>

          {showDistance && distanceKm !== null && (
            <span className="flex-shrink-0 text-gray-500 font-normal">
              {t('distance.km', { distance: distanceKm, ns: 'events' })}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-base sm:text-lg font-bold text-gray-900 group-hover:text-brenne-800 transition-colors line-clamp-2 mb-1.5">
          <Link to={detailUrl} className="focus:outline-none focus:underline">
            {event.title}
          </Link>
        </h3>

        {/* Description preview */}
        <p className="text-sm text-gray-600 line-clamp-2 mb-4 flex-grow">
          {event.description}
        </p>

        {/* Footer info: Venue & City & Action */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 mt-auto">
          <span className="flex items-center gap-1 truncate font-medium text-gray-700">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{event.venueName ? `${event.venueName}, ${event.city}` : event.city}</span>
          </span>

          <Link
            to={detailUrl}
            className="text-brenne-700 hover:text-brenne-900 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-all focus:outline-none"
            aria-label={`${t('actions.view', { ns: 'common' })} - ${event.title}`}
          >
            <span>{t('actions.view', { ns: 'common' })}</span>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </article>
  );
};
