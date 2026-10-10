import { Suspense, lazy, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TrailDetail, TrailNearbyResponse } from '@leblanc/shared';
import { PageSeo } from '../components/PageSeo';
import { ErrorState } from '../components/common/ErrorState';
import { googleMapsDirectionsUrl } from '../components/places/PlaceMap';
import { formatKm, formatTrailDuration, loopLabel } from '../components/walks/trailFormat';
import { trailGpxUrl } from '../api/trailsRepository';
import { useLanguageDisplayName } from '../hooks/useLanguageDisplayName';
import { useTrail, useTrailNearby } from '../hooks/useTrails';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { buildLocalizedPath } from '../routes/routeMapping';
import { formatEventDate } from '../utils/eventDates';
import { officialWebsite } from '../utils/officialWebsite';
import { NotFoundPage } from './NotFoundPage';

// Leaflet n'est chargé qu'à l'affichage de la fiche, dans son propre fichier.
const TrailDetailMap = lazy(() => import('../components/walks/TrailDetailMap'));

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const OSM_RELATION_URL = 'https://www.openstreetmap.org/relation/';

/** Recherche de la liste transmise par la carte ou la liste, pour un retour avec les mêmes filtres. */
export function listSearchFromState(state: unknown): string {
  const value = typeof state === 'object' && state !== null ? (state as { listSearch?: unknown }).listSearch : undefined;
  return typeof value === 'string' && /^\?[^#]{0,500}$/.test(value) ? value : '';
}

function NearbySection({ nearby, lang }: { nearby: TrailNearbyResponse; lang: SupportedLanguage }) {
  const { t } = useTranslation(['walks', 'events']);
  if (nearby.events.length === 0 && nearby.places.length === 0) return null;
  // Même libellé que les cartes événement : « Jusqu'au … » pour un événement en cours.
  const eventDate = (event: TrailNearbyResponse['events'][number]) => formatEventDate(event, lang, 'short', {
    allDay: t('events:dates.allDay'),
    until: (date) => t('events:dates.until', { date }),
  });
  const distance = (meters: number) => t('walks:detail.distanceFromStart', { distance: formatKm(meters, lang) });
  const linkClass = 'font-semibold text-creuse-800 underline-offset-2 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creuse-700';
  return (
    <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8" aria-labelledby="walk-nearby">
      <h2 id="walk-nearby" className="mb-5 font-display text-[28px] font-bold text-brenne-950">{t('walks:detail.sections.nearby')}</h2>
      <div className="grid gap-8 md:grid-cols-2">
        {nearby.events.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-700">{t('walks:detail.nearbyEvents')}</h3>
            <ul className="space-y-3">
              {nearby.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <Link to={buildLocalizedPath('events', lang, event.id)} className={linkClass}>{event.title}</Link>
                  <p className="text-gray-700">{[eventDate(event), event.city, distance(event.distanceFromStartM)].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        {nearby.places.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-700">{t('walks:detail.nearbyPlaces')}</h3>
            <ul className="space-y-3">
              {nearby.places.map((place) => (
                <li key={place.id} className="text-sm">
                  <Link to={buildLocalizedPath('places', lang, place.id)} className={linkClass}>{place.title}</Link>
                  <p className="text-gray-700">{[place.city, distance(place.distanceFromStartM)].filter(Boolean).join(' · ')}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Hero({ trail }: { trail: TrailDetail }) {
  const { t } = useTranslation('walks');
  const [failed, setFailed] = useState<string | null>(null);
  const image = trail.imageUrl && failed !== trail.imageUrl ? trail.imageUrl : null;
  return (
    <header className="relative isolate overflow-hidden rounded-2xl bg-brenne-900 text-white shadow-md">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-br from-brenne-700 via-brenne-900 to-brenne-950" />
      {image && (
        <div className="absolute inset-0 -z-10">
          <img src={image} alt="" onError={() => setFailed(image)} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/65 to-black/30" />
        </div>
      )}
      <div className="flex min-h-[300px] flex-col justify-end gap-4 p-6 pt-20 sm:min-h-[420px] sm:p-10 sm:pt-28">
        <ul className="flex flex-wrap gap-2" aria-label={t('detail.fields.modes')}>
          {trail.modes.map((mode) => <li key={mode} className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brenne-950">{t(`modes.${mode}`)}</li>)}
        </ul>
        <h1 lang={trail.contentLanguage} className="max-w-4xl font-display text-3xl font-bold leading-tight text-white sm:text-[40px] [overflow-wrap:anywhere]">{trail.title}</h1>
        {trail.startCity && <p className="text-sm text-gray-100 sm:text-base">{trail.startCity}</p>}
        {image && trail.imageCredit && (
          <p className="self-end text-xs text-gray-100">
            {trail.imageLicense ? t('card.photoCreditLicense', { credit: trail.imageCredit, license: trail.imageLicense }) : t('card.photoCredit', { credit: trail.imageCredit })}
          </p>
        )}
      </div>
    </header>
  );
}

export function WalkPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { t, i18n } = useTranslation(['walks', 'common']);
  const languageName = useLanguageDisplayName();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const validId = typeof id === 'string' && UUID.test(id);
  const { data: trail, isLoading, isError, error, refetch } = useTrail(validId ? id : undefined, lang);
  const nearby = useTrailNearby(validId ? id : undefined, lang, Boolean(trail));
  const listPath = `${buildLocalizedPath('walks', lang)}${listSearchFromState(location.state)}`;

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label={t('common:actions.loading')} className="animate-pulse space-y-8 py-6 sm:py-8">
        <PageSeo section="walks" noindex />
        <div className="h-5 w-1/3 rounded bg-gray-200" />
        <div className="h-80 rounded-2xl bg-brenne-100 sm:h-[420px]" />
      </div>
    );
  }
  if (isError) return <><PageSeo section="walks" noindex /><ErrorState error={error} onRetry={() => void refetch()} /></>;
  if (!validId || !trail) {
    return (
      <div>
        <div role="status" className="mx-auto mt-8 max-w-3xl rounded-xl border border-brenne-200 bg-brenne-50 px-6 py-5 text-center text-brenne-950">
          {/* Le h1 est celui de NotFoundPage, rendue juste en dessous. */}
          <h2 className="font-display text-2xl font-bold">{t('walks:detail.notFound.title')}</h2>
          <p className="mt-2 text-sm">{t('walks:detail.notFound.description')}</p>
        </div>
        <NotFoundPage />
      </div>
    );
  }

  const duration = formatTrailDuration(trail, t, lang);
  const loop = loopLabel(trail.isLoop, t);
  const official = officialWebsite(trail.officialUrl);
  const osm = trail.attributions.find((attribution) => attribution.source === 'osm');
  const relationUrl = trail.osmRelationId !== null ? `${OSM_RELATION_URL}${trail.osmRelationId}` : null;
  const datatourisme = trail.attributions.find((attribution) => attribution.source === 'datatourisme');
  const facts: [string, string][] = [
    [t('walks:detail.fields.modes'), trail.modes.map((mode) => t(`walks:modes.${mode}`)).join(', ')],
    ...(trail.distanceM !== null ? [[t('walks:detail.fields.distance'), t('walks:card.distanceKm', { distance: formatKm(trail.distanceM, lang) })] as [string, string]] : []),
    ...(duration ? [[t('walks:detail.fields.duration'), duration] as [string, string]] : []),
    ...(loop ? [[t('walks:detail.fields.loop'), loop] as [string, string]] : []),
    [t('walks:detail.fields.start'), [trail.startCity, trail.startPostalCode].filter(Boolean).join(' ') || '—'],
    [t('walks:detail.fields.fromLeBlanc'), t('walks:card.distanceKm', { distance: formatKm(trail.distanceFromLeBlancM, lang) })],
  ];
  const linkClass = 'font-semibold text-creuse-800 underline underline-offset-2 hover:text-creuse-900 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creuse-700';

  return (
    <article className="space-y-8 py-6 pb-12 sm:space-y-10 sm:py-8">
      <PageSeo
        section="walks"
        titleOverride={`${trail.title} — Le Blanc & Moi`}
        breadcrumbName={trail.title}
        descriptionOverride={trail.description || t('walks:detail.noDescription')}
        canonicalPath={buildLocalizedPath('walks', lang, trail.id)}
        {...(trail.imageUrl ? { imageOverride: trail.imageUrl } : {})}
      />
      <nav aria-label={t('walks:detail.breadcrumbLabel')}>
        <ol className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          <li><Link to={buildLocalizedPath('home', lang)} className="font-semibold text-creuse-800 hover:underline">{t('walks:detail.home')}</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link to={listPath} className="font-semibold text-creuse-800 hover:underline">{t('walks:title')}</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="max-w-full truncate text-brenne-950">{trail.title}</li>
        </ol>
      </nav>

      <Hero trail={trail} />

      <div className="flex flex-wrap gap-3 rounded-2xl border border-brenne-900/5 bg-white p-5 shadow-md sm:p-6">
        <a href={googleMapsDirectionsUrl(trail.start.lat, trail.start.lng)} target="_blank" rel="noopener noreferrer" className="btn-primary min-h-12 w-full sm:w-auto">{t('walks:detail.actions.directions')}</a>
        {trail.gpxAvailable && <a href={trailGpxUrl(trail.id)} download className="btn-secondary min-h-12 w-full sm:w-auto">{t('walks:detail.actions.gpx')}</a>}
        {official && (
          <a href={official} target="_blank" rel="noopener noreferrer" aria-label={t('walks:detail.actions.officialLabel', { title: trail.title })} className="btn-secondary min-h-12 w-full sm:w-auto">
            {t('walks:detail.actions.official')} <span aria-hidden="true">↗</span>
          </a>
        )}
        <Link to={listPath} className="btn-secondary min-h-12 w-full sm:ml-auto sm:w-auto">{t('walks:detail.backToList')}</Link>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-3">
        <section className="min-w-0 rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8 md:col-span-2" aria-labelledby="walk-description">
          <h2 id="walk-description" className="mb-5 border-b border-brenne-900/10 pb-4 font-display text-[28px] font-bold text-brenne-950">{t('walks:detail.sections.description')}</h2>
          {trail.description.trim()
            ? <p lang={trail.descriptionLanguage} className="whitespace-pre-line break-words text-base leading-loose text-gray-800">{trail.description}</p>
            : <p className="text-gray-700">{t('walks:detail.noDescription')}</p>}
          {trail.isFallback && <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">{t('walks:detail.fallbackNotice', { language: languageName(trail.descriptionLanguage) })}</p>}
        </section>
        <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md" aria-labelledby="walk-facts">
          <h2 id="walk-facts" className="mb-5 font-display text-2xl font-bold text-brenne-950">{t('walks:detail.sections.characteristics')}</h2>
          <dl className="space-y-4 text-sm">
            {facts.map(([label, value]) => <div key={label}><dt className="font-semibold text-gray-700">{label}</dt><dd className="mt-1 text-brenne-950">{value}</dd></div>)}
          </dl>
        </section>
      </div>

      <section className="space-y-4 rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8" aria-labelledby="walk-map">
        <h2 id="walk-map" className="font-display text-[28px] font-bold text-brenne-950">{t('walks:detail.sections.map')}</h2>
        <Suspense fallback={<div role="status" aria-busy="true" className="h-72 w-full animate-pulse rounded-xl bg-brenne-100 sm:h-[420px]">{t('walks:map.loading')}</div>}>
          <TrailDetailMap
            start={trail.start}
            track={trail.track}
            label={t('walks:detail.mapLabel', { title: trail.title })}
            startLabel={t('walks:detail.startMarker')}
            attribution={osm && relationUrl ? { text: t('walks:map.osmAttribution'), relationUrl } : null}
          />
        </Suspense>
        {osm && relationUrl ? (
          <p className="text-sm text-gray-700">
            <a href={relationUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{t('walks:map.osmAttribution')}</a>
            {' · '}
            <a href={relationUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{t('walks:detail.osmRelation', { id: trail.osmRelationId })}</a>
          </p>
        ) : (
          <div className="space-y-2 text-sm text-gray-800">
            <p className="font-semibold">{t('walks:detail.trackUnavailable')}</p>
            {official && <a href={official} target="_blank" rel="noopener noreferrer" aria-label={t('walks:detail.actions.officialLabel', { title: trail.title })} className={linkClass}>{t('walks:detail.actions.official')} <span aria-hidden="true">↗</span></a>}
          </div>
        )}
      </section>

      {nearby.data && <NearbySection nearby={nearby.data} lang={lang} />}

      <section className="rounded-2xl border border-brenne-900/5 bg-white p-6 text-sm text-gray-700 shadow-md" aria-labelledby="walk-sources">
        <h2 id="walk-sources" className="mb-3 font-display text-xl font-bold text-brenne-950">{t('walks:detail.sections.sources')}</h2>
        <ul className="space-y-2">
          {datatourisme && (
            <li>
              {trail.producer ? t('walks:detail.datatourisme', { producer: trail.producer }) : t('walks:detail.datatourismeUnknown')}
              {' · '}<a href={datatourisme.licenseUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{t('walks:detail.licenceOuverte')}</a>
            </li>
          )}
          {osm && relationUrl && (
            <li>
              <a href={osm.url ?? relationUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>{t('walks:map.osmAttribution')}</a>
              {trail.gpxAvailable && <span> · {t('walks:detail.actions.gpxLicense')}</span>}
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
