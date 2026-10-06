import { PriceBadge } from '../components/events/PriceBadge';
import { PageSeo } from '../components/PageSeo';
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '../components/common/ErrorState';
import { useEvent } from '../hooks/useEvent';
import { useLanguageDisplayName } from '../hooks/useLanguageDisplayName';
import { useLocalizedDate } from '../hooks/useLocalizedDate';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { buildLocalizedPath } from '../routes/routeMapping';
import { formatVenueCity } from '../utils/eventLocation';
import { downloadIcsFile } from '../utils/ics';

export const EventPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation(['events', 'pages', 'common', 'errors', 'filters']);
  const languageName = useLanguageDisplayName();
  const [copied, setCopied] = useState(false);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const { formatDate } = useLocalizedDate();

  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
  const { data: event, isLoading, isError, error, refetch } = useEvent(id, currentLang);

  const handleShare = async () => {
    if (!event) return;
    const shareData = {
      title: event.title,
      text: event.description,
      url: window.location.href,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Fallback to clipboard if share was cancelled or failed
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  // État de chargement
  if (isLoading) {
    return (
      <div className="mx-auto space-y-8 py-6 sm:py-8 animate-pulse" role="status" aria-busy="true">
        <PageSeo section="events" />
        <div className="w-full aspect-[21/9] bg-gray-200 rounded-2xl" />
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded w-2/3" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 min-w-0 space-y-4">
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
          <div className="space-y-4">
            <div className="h-28 bg-gray-200 rounded-xl" />
            <div className="h-28 bg-gray-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Erreur d'appel API (réseau, cold start Neon, 5xx) : état d'erreur avec bouton Réessayer
  if (isError) {
    return <><PageSeo section="events" noindex /><ErrorState error={error} onRetry={() => void refetch()} /></>;
  }

  // Événement introuvable (identifiant inconnu ou 404 retourné par l'API)
  if (!event) {
    return (
      <div className="text-center py-20 px-4 max-w-lg mx-auto bg-white rounded-2xl border border-gray-100 shadow-sm my-8">
        <PageSeo section="notFound" />
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="font-display text-[28px] font-bold text-brenne-950 mb-2">
          {t('event.notFound', { ns: 'pages' })}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          {t('generic', { ns: 'errors' })}
        </p>
        <Link
          to={buildLocalizedPath('list', currentLang)}
          className="btn-primary inline-flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('list.title', { ns: 'pages' })}
        </Link>
      </div>
    );
  }

  // Format dates & times
  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const isSameDay = !endDate || startDate.toDateString() === endDate.toDateString();

  const fullDateFormatter = new Intl.DateTimeFormat(currentLang, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: event.timezone || 'Europe/Paris',
  });
  const timeFormatter = new Intl.DateTimeFormat(currentLang, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: event.timezone || 'Europe/Paris',
  });

  const formattedDate = isSameDay
    ? `${fullDateFormatter.format(startDate)} • ${timeFormatter.format(startDate)}`
    : `${fullDateFormatter.format(startDate)} - ${fullDateFormatter.format(endDate!)}`;

  // Format distance
  const distanceKm =
    event.distance !== undefined
      ? new Intl.NumberFormat(currentLang, {
          maximumFractionDigits: 1,
          minimumFractionDigits: 0,
        }).format(event.distance / 1000)
      : null;

  // Category styles
  const categoryBadgeColors: Record<string, string> = {
    culture: 'bg-violet-100 text-violet-900 border-violet-200',
    sport: 'bg-creuse-100 text-creuse-900 border-creuse-200',
    fete: 'bg-orange-100 text-orange-900 border-orange-200',
    association: 'bg-brenne-100 text-brenne-900 border-brenne-200',
    autre: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  const badgeClass = categoryBadgeColors[event.category] || categoryBadgeColors.autre;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`;
  // Lieu et ville sont nullables : la ligne est masquée si les deux sont absents.
  const venueCity = formatVenueCity(event);

  return (
    <article className="mx-auto space-y-8 sm:space-y-12 py-6 sm:py-8">
      <PageSeo section="events" event={event} />
      {/* Navigation retour */}
      <div>
        <Link
          to={buildLocalizedPath('list', currentLang)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-creuse-800 hover:text-creuse-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('list.title', { ns: 'pages' })}
        </Link>
      </div>

      {/* Hero Header */}
      <div className="relative isolate rounded-2xl overflow-hidden shadow-md bg-brenne-900 text-white">
        {event.imageUrl && event.imageUrl !== failedImageUrl ? (
          <div className="absolute inset-0 -z-10">
            <img
              src={event.imageUrl}
              alt={event.title}
              onError={() => setFailedImageUrl(event.imageUrl ?? null)}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-black/50" />
          </div>
        ) : (
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-brenne-700 via-brenne-900 to-brenne-950"><div className="absolute -right-16 -top-16 h-80 w-80 rounded-full border-[40px] border-white/5" /><div className="absolute -bottom-24 right-20 h-72 w-72 rounded-full border border-white/10" /></div>
        )}

        {/* Hero Content Overlay / Header */}
        <div className="relative flex min-h-[360px] flex-col justify-end p-6 pt-20 sm:min-h-[460px] sm:p-12 sm:pt-28 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border shadow-sm ${badgeClass}`}>
              {t(`categories.${event.category}`, { ns: 'events' })}
            </span>
            <PriceBadge event={event} />
            {event.isFallback && (
              <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-950 backdrop-blur-sm tracking-wide">
                {t('details.fallbackNotice', { ns: 'events', language: languageName(event.descriptionLanguage ?? event.contentLanguage) })}
              </span>
            )}
          </div>

          <h1 lang={event.contentLanguage} className="max-w-4xl font-display text-3xl sm:text-[40px] font-bold text-white leading-[1.3] break-words [overflow-wrap:anywhere]">
            {event.title}
          </h1>

          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-sm text-gray-200">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-brenne-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{formattedDate}</span>
            </div>

            {venueCity && (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-brenne-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{venueCity}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Barre d'actions principales */}
      <div className="flex flex-wrap items-center gap-3 p-5 sm:p-6 bg-white rounded-2xl border border-brenne-900/5 shadow-md">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          {t('details.directions', { ns: 'events' })}
        </a>

        <button
          type="button"
          onClick={() => downloadIcsFile(event)}
          className="btn-secondary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {t('details.addToCalendar', { ns: 'events' })}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="btn-secondary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center relative"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {t('details.share', { ns: 'events' })}
        </button>

        {copied && (
          <span
            role="status"
            className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
          >
            {t('details.linkCopied', { ns: 'events' })}
          </span>
        )}
      </div>

      {/* Contenu principal : 2 colonnes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Colonne gauche : Description */}
        <div className="lg:col-span-2 min-w-0 space-y-6">
          <div className="bg-white rounded-2xl p-6 sm:p-8 border border-brenne-900/5 shadow-md space-y-4">
            <h2 className="font-display text-[28px] sm:text-[32px] leading-tight font-bold text-brenne-950 border-b border-brenne-900/10 pb-4">
              {t('event.title', { ns: 'pages' })}
            </h2>

            <div lang={event.descriptionLanguage} className="text-gray-700 whitespace-pre-line leading-loose text-base break-words [overflow-wrap:anywhere]">
              {event.description}
            </div>

            {event.publicUrl && (
              <div className="pt-4 border-t border-gray-100">
                <a
                  href={event.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-creuse-800 hover:text-creuse-900 font-semibold inline-flex items-center gap-1.5 text-sm"
                >
                  <span>{t('details.viewWebsite', { ns: 'events' })}</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>

          <section aria-label={t('details.occurrencesTitle', { ns: 'events' })} className="bg-white rounded-2xl p-6 sm:p-8 border border-brenne-900/5 shadow-md space-y-6">
            <h2 className="font-display text-[28px] sm:text-[32px] font-bold text-brenne-950">{t('details.occurrencesTitle', { ns: 'events' })}</h2>
            <ol className="space-y-2">
              {event.occurrences.map((occurrence) => {
                const isPast = new Date(occurrence.startDate).getTime() < Date.now();
                const dateOptions: Intl.DateTimeFormatOptions = {
                  dateStyle: 'full',
                  timeZone: occurrence.timezone,
                };
                const timeOptions: Intl.DateTimeFormatOptions = {
                  dateStyle: undefined,
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: occurrence.timezone,
                };
                const startDay = formatDate(occurrence.startDate, dateOptions);
                const startTime = formatDate(occurrence.startDate, timeOptions);
                const endDay = occurrence.endDate ? formatDate(occurrence.endDate, dateOptions) : null;
                const endTime = occurrence.endDate ? formatDate(occurrence.endDate, timeOptions) : null;

                return (
                  <li key={occurrence.id} data-testid="event-occurrence" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-brenne-200 bg-sable-50 px-4 py-4">
                    <div className="text-sm text-gray-800">
                      <time dateTime={occurrence.startDate} className="font-semibold capitalize">{startDay}</time>
                      <span className="block text-gray-600">
                        {startTime}{endTime ? ` – ${endDay !== startDay ? `${endDay} ` : ''}${endTime}` : ''}
                      </span>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isPast ? 'bg-gray-200 text-gray-700' : 'bg-brenne-100 text-brenne-900'}`}>
                      {t(isPast ? 'details.occurrencePast' : 'details.occurrenceFuture', { ns: 'events' })}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* Colonne droite : Informations pratiques */}
        <div className="order-first lg:order-last space-y-6">
          {/* Dates principales */}
          <div className="bg-white rounded-2xl p-6 border border-brenne-900/5 shadow-md space-y-3">
            <span className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">{t('dates.label', { ns: 'filters' })}</span>
            <p className="font-semibold text-brenne-900 leading-relaxed">{formattedDate}</p>
          </div>
          {/* Bloc Tarif */}
          <div className="bg-white rounded-2xl p-6 border border-brenne-900/5 shadow-md">
            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              {t('price.label', { ns: 'filters' })}
            </span>
            <PriceBadge event={event} />
          </div>

          {/* Bloc Lieu & Distance */}
          <div className="bg-white rounded-2xl p-6 border border-brenne-900/5 shadow-md space-y-3">
            <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
              {t('details.location', { ns: 'events' })}
            </span>
            {(event.venueName || event.address || event.postalCode || event.city) && (
              <div className="text-sm text-gray-800 space-y-1">
                {event.venueName && <p className="font-bold text-gray-900">{event.venueName}</p>}
                {event.address && <p>{event.address}</p>}
                {(event.postalCode || event.city) && (
                  <p>{[event.postalCode, event.city].filter(Boolean).join(' ')}</p>
                )}
              </div>
            )}
            {distanceKm !== null && (
              <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 text-xs text-brenne-700 font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{t('distance.km', { distance: distanceKm, ns: 'events' })}</span>
              </div>
            )}
          </div>

        </div>
      </div>
      <div className="border-t border-brenne-900/10 pt-6 text-[13px] text-gray-600">
        {t('details.source', { source: event.source, ns: 'events' })}
      </div>
    </article>
  );
};

export default EventPage;
