import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageSeo } from '../components/PageSeo';
import { ErrorState } from '../components/common/ErrorState';
import { NotFoundPage } from './NotFoundPage';
import { OpeningHoursTable } from '../components/places/OpeningHoursTable';
import { PlaceMap, googleMapsDirectionsUrl, hasValidPlaceCoordinates } from '../components/places/PlaceMap';
import { PlacePriceBadge, PlaceStatusBadge, PlaceTypeBadge } from '../components/places/PlaceBadges';
import { PlacePlaceholder } from '../components/places/PlacePlaceholder';
import { useLanguageDisplayName } from '../hooks/useLanguageDisplayName';
import { usePlace } from '../hooks/usePlace';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGES_META } from '../i18n/languages';
import { buildLocalizedPath } from '../routes/routeMapping';
import { getRestaurantJsonLd } from '../utils/seo-places';
import { serializeJsonLd } from '../utils/seo';

// Sources connues : leur libellé porte l'attribution exigée par les licences.
const KNOWN_PLACE_SOURCES = ['datatourisme_places', 'openstreetmap', 'manuel'] as const;
type KnownPlaceSource = (typeof KNOWN_PLACE_SOURCES)[number];

function isKnownPlaceSource(source: string): source is KnownPlaceSource {
  return (KNOWN_PLACE_SOURCES as readonly string[]).includes(source);
}

// L'API agrège les sources d'un lieu (« datatourisme_places, manuel »).
function splitPlaceSources(source: string): string[] {
  return source.split(',').map((item) => item.trim()).filter(Boolean);
}

export function PlacePage() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation(['places', 'common']);
  const languageName = useLanguageDisplayName();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'copied' | 'unavailable' | null>(null);
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const validId = typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  const { data: place, isLoading, isError, error, refetch } = usePlace(validId ? id : undefined, lang);

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common:actions.loading')} className="animate-pulse space-y-8 py-6 sm:py-8">
        <PageSeo section="eat" noindex />
        <div className="h-5 w-1/3 rounded bg-gray-200" />
        <div className="h-80 rounded-2xl bg-brenne-100 sm:h-[440px]" />
        <div className="grid gap-8 md:grid-cols-3">
          <div className="h-60 rounded-2xl bg-white md:col-span-2" />
          <div className="h-60 rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  if (isError) {
    return <><PageSeo section="eat" noindex /><ErrorState error={error} onRetry={() => void refetch()} /></>;
  }

  if (!validId || !place) {
    return (
      <div>
        <div role="status" className="mx-auto mt-8 max-w-3xl rounded-xl border border-brenne-200 bg-brenne-50 px-6 py-5 text-center text-brenne-950">
          {/* Le h1 est celui de NotFoundPage, rendue juste en dessous. */}
          <h2 className="font-display text-2xl font-bold">{t('places:detail.notFound.title')}</h2>
          <p className="mt-2 text-sm">{t('places:detail.notFound.description')}</p>
        </div>
        <NotFoundPage />
      </div>
    );
  }

  const address = [place.address, [place.postalCode, place.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const locale = LANGUAGES_META[lang].locale;
  const distance = place.distance === null ? null
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(place.distance / 1000);
  const hasCoordinates = hasValidPlaceCoordinates(place.latitude, place.longitude);
  const directionsUrl = hasCoordinates && place.latitude !== null && place.longitude !== null
    ? googleMapsDirectionsUrl(place.latitude, place.longitude)
    : address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
      : null;
  const sources = splitPlaceSources(place.source);
  const sourceLabels = sources.map((source) => t(`places:detail.sources.${isKnownPlaceSource(source) ? source : 'other'}`));
  const phoneHref = place.phone ? `tel:${place.phone.replace(/[^\d+]/g, '')}` : null;

  async function share() {
    if (!place) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: place.title, text: place.description, url });
        return;
      } catch {
        // La copie du lien reste possible si le partage natif est annulé ou indisponible.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
    } catch {
      setShareStatus('unavailable');
    }
  }

  return (
    <article className="space-y-8 py-6 pb-12 sm:space-y-10 sm:py-8">
      <PageSeo
        section="places"
        titleOverride={`${place.title} — Le Blanc & Moi`}
        breadcrumbName={place.title}
        descriptionOverride={place.description || t('places:detail.noDescription')}
        canonicalPath={pathname}
        {...(place.imageUrl ? { imageOverride: place.imageUrl } : {})}
      />
      <Helmet><script type="application/ld+json">{serializeJsonLd(getRestaurantJsonLd(place))}</script></Helmet>

      <nav aria-label={t('places:detail.breadcrumb.label')}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <li><Link to={buildLocalizedPath('home', lang)} className="font-semibold text-creuse-800 hover:underline">{t('places:detail.breadcrumb.home')}</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link to={buildLocalizedPath('eat', lang)} className="font-semibold text-creuse-800 hover:underline">{t('places:detail.breadcrumb.places')}</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="max-w-full truncate text-brenne-950">{place.title}</li>
        </ol>
      </nav>

      <header className="relative isolate overflow-hidden rounded-2xl bg-brenne-900 text-white shadow-md">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-brenne-700 via-brenne-900 to-brenne-950" />
        {(!place.imageUrl || failedImageUrl === place.imageUrl) && (
          <div className="absolute inset-0 -z-10">
            <PlacePlaceholder type={place.type} />
            <div className="absolute inset-0 bg-gradient-to-t from-brenne-950/90 via-brenne-950/65 to-brenne-950/30" />
          </div>
        )}
        {place.imageUrl && failedImageUrl !== place.imageUrl && (
          <div className="absolute inset-0 -z-10">
            <img src={place.imageUrl} alt="" onError={() => setFailedImageUrl(place.imageUrl)} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/70 to-black/40" />
          </div>
        )}
        <div className="flex min-h-[320px] flex-col justify-end gap-5 p-6 pt-20 sm:min-h-[440px] sm:p-10 sm:pt-28">
          <div className="flex flex-wrap items-center gap-2">
            <PlaceTypeBadge type={place.type} />
            <PlaceStatusBadge isOpenNow={place.isOpenNow} />
            <PlacePriceBadge place={place} />
          </div>
          <h1 className="max-w-4xl font-display text-3xl font-bold leading-tight text-white sm:text-[40px] [overflow-wrap:anywhere]">{place.title}</h1>
          {address && <p className="text-sm text-gray-100 sm:text-base">{address}</p>}
        </div>
      </header>

      <div className="flex flex-wrap gap-3 rounded-2xl border border-brenne-900/5 bg-white p-5 shadow-md sm:p-6">
        {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-12 w-full sm:w-auto">{t('places:detail.actions.getDirections')}</a>}
        {phoneHref && <a href={phoneHref} className="btn-secondary min-h-12 w-full sm:w-auto">{t('places:detail.actions.call')}</a>}
        {place.website && <a href={place.website} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-12 w-full sm:w-auto">{t('places:detail.actions.visitWebsite')}</a>}
        <button type="button" onClick={() => void share()} className="btn-secondary min-h-12 w-full sm:w-auto">{t('places:detail.actions.share')}</button>
        {shareStatus && <span role="status" className="self-center text-sm font-semibold text-brenne-800">{t(`places:detail.actions.${shareStatus}`)}</span>}
      </div>

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8 md:col-span-2" aria-labelledby="place-description">
          <h2 id="place-description" className="mb-5 border-b border-brenne-900/10 pb-4 font-display text-[28px] font-bold text-brenne-950">{t('places:detail.sections.description')}</h2>
          {place.description.trim()
            ? <p className="whitespace-pre-line break-words text-base leading-loose text-gray-700">{place.description}</p>
            : <p className="text-gray-600">{t('places:detail.noDescription')}</p>}
          {place.isFallback && <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('places:detail.fallbackNotice', { language: languageName(place.descriptionLanguage ?? place.contentLanguage) })}</p>}
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md" aria-labelledby="place-practical">
            <h2 id="place-practical" className="mb-5 font-display text-2xl font-bold text-brenne-950">{t('places:detail.sections.practicalInfo')}</h2>
            <dl className="space-y-4 text-sm">
              <div><dt className="font-semibold text-gray-600">{t('places:detail.fields.address')}</dt><dd className="mt-1 break-words text-brenne-950">{address || t('places:detail.addressUnknown')}{!hasCoordinates && <p className="mt-2 text-xs text-gray-500">{t('places:detail.addressNotMapped')}</p>}</dd></div>
              {distance !== null && <div><dt className="font-semibold text-gray-600">{t('places:detail.fields.distance')}</dt><dd className="mt-1 text-brenne-950">{t('places:distanceKm', { distance })}</dd></div>}
              {phoneHref && <div><dt className="font-semibold text-gray-600">{t('places:detail.fields.phone')}</dt><dd className="mt-1"><a href={phoneHref} className="break-all font-semibold text-creuse-800 underline-offset-2 hover:underline">{place.phone}</a></dd></div>}
              {place.website && <div><dt className="font-semibold text-gray-600">{t('places:detail.fields.website')}</dt><dd className="mt-1"><a href={place.website} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-creuse-800 underline-offset-2 hover:underline">{t('places:detail.actions.visitWebsite')}</a></dd></div>}
              {place.email && <div><dt className="font-semibold text-gray-600">{t('places:detail.fields.email')}</dt><dd className="mt-1"><a href={`mailto:${place.email}`} className="break-all font-semibold text-creuse-800 underline-offset-2 hover:underline">{place.email}</a></dd></div>}
            </dl>
          </section>
          <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md" aria-labelledby="place-price">
            <h2 id="place-price" className="mb-4 font-display text-2xl font-bold text-brenne-950">{t('places:detail.sections.price')}</h2>
            <PlacePriceBadge place={place} />
            {place.priceRangeMin === null && place.priceRangeMax === null && <p className="text-sm text-gray-600">{t('places:price.unknown')}</p>}
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8" aria-labelledby="place-hours">
        <h2 id="place-hours" className="mb-5 font-display text-[28px] font-bold text-brenne-950">{t('places:detail.sections.hours')}</h2>
        {place.openingHoursRaw && place.openingHours.length === 0 ? (
          <div className="space-y-3 text-gray-700">
            <h3 className="font-semibold text-brenne-950">{t(sources.includes('manuel') ? 'places:detail.hours.sourceManual' : 'places:detail.hours.sourceOsm')}</h3>
            <p className="whitespace-pre-wrap [overflow-wrap:break-word]">{place.openingHoursRaw}</p>
            <p className="text-sm text-gray-600">{t(sources.includes('manuel') ? 'places:detail.hours.manualDisclaimer' : 'places:detail.hours.osmDisclaimer')}</p>
          </div>
        ) : <OpeningHoursTable rules={place.openingHours} status={place.openingHoursStatus} />}
      </section>

      {hasCoordinates && (
        <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8" aria-labelledby="place-location">
          <h2 id="place-location" className="mb-5 font-display text-[28px] font-bold text-brenne-950">{t('places:detail.sections.location')}</h2>
          <PlaceMap latitude={place.latitude} longitude={place.longitude} title={place.title} />
        </section>
      )}

      <p className="text-xs text-gray-500">{t('places:detail.sourceLine', { sources: [...new Set(sourceLabels)].join(', ') })}</p>
    </article>
  );
}
