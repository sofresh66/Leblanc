import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Event } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';
import { buildLocalizedPath } from '../../routes/routeMapping';
import { formatVenueCity } from '../../utils/eventLocation';

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

  // Lieu et ville peuvent être nuls : aucun texte n'est affiché si les deux manquent.
  const venueCity = formatVenueCity(event);

  // Category color accents
  const categoryBadgeColors: Record<string, string> = {
    culture: 'bg-violet-100 text-violet-900 border-violet-200',
    sport: 'bg-creuse-100 text-creuse-900 border-creuse-200',
    fete: 'bg-orange-100 text-orange-900 border-orange-200',
    association: 'bg-brenne-100 text-brenne-900 border-brenne-200',
    autre: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const badgeClass = categoryBadgeColors[event.category] || categoryBadgeColors.autre;

  return (
    <article
      data-testid={`event-card-${event.id}`}
      className="card-event group flex flex-col h-full border border-brenne-900/5"
    >
      {/* Image header with category badge */}
      <div className="relative aspect-[4/3] w-full bg-brenne-50 overflow-hidden">
        {event.imageUrl && !imageError ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            loading="lazy"
            onError={() => setImageError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.035] transition-transform duration-300"
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
            {event.city && (
              <span className="text-xs font-medium text-brenne-800 tracking-wide uppercase">
                {event.city}
              </span>
            )}
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
        <div className="absolute top-3 right-3">
          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-white/95 text-brenne-950 shadow-sm backdrop-blur-sm border border-white">
            {priceText}
          </span>
        </div>
      </div>

      {/* Content body */}
      <div className="p-5 sm:p-6 flex flex-col flex-grow">
        {/* Title */}
        <h3 className="font-display text-xl leading-snug font-bold text-brenne-950 group-hover:text-brenne-800 transition-colors line-clamp-2 mb-2 min-h-[3.4rem]">
          <Link to={detailUrl} className="focus-visible:underline">
            {event.title}
          </Link>
        </h3>

        {/* Description preview */}
        <p className="text-sm leading-relaxed text-gray-600 line-clamp-2 mb-5 flex-grow">
          {event.description}
        </p>

        {/* Practical information */}
        <div className="pt-4 border-t border-brenne-900/10 space-y-2 text-[13px] leading-snug text-gray-600 mt-auto">
          <div className="flex items-start gap-2 text-brenne-800 font-semibold">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formattedDate}</span>
          </div>
          {venueCity ? (
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-brenne-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{venueCity}</span>
            </div>
          ) : null}
          {showDistance && distanceKm !== null && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brenne-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <circle cx="12" cy="12" r="2" strokeWidth="2" />
                <path strokeWidth="2" strokeLinecap="round" d="M12 3v3m0 12v3M3 12h3m12 0h3" />
              </svg>
              <span>{t('distance.km', { distance: distanceKm, ns: 'events' })}</span>
            </div>
          )}
          <Link
            to={detailUrl}
            className="pt-2 text-creuse-800 hover:text-creuse-900 font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all"
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
