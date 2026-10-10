import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TrailSummary } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../../i18n/languages';
import { buildLocalizedPath } from '../../routes/routeMapping';
import { officialWebsite } from '../../utils/officialWebsite';
import { formatKm, formatTrailDuration, loopLabel } from './trailFormat';

/** Crédit de l'image tel que fourni par la source ; licence seulement si elle est indiquée. */
function ImageCredit({ credit, license }: { credit: string | null; license: string | null }) {
  const { t } = useTranslation('walks');
  if (!credit) return null;
  return (
    <figcaption className="absolute inset-x-0 bottom-0 bg-black/65 px-3 py-1.5 text-[11px] leading-snug text-white [overflow-wrap:anywhere]">
      {license ? t('card.photoCreditLicense', { credit, license }) : t('card.photoCredit', { credit })}
    </figcaption>
  );
}

export function TrailCard({ trail }: { trail: TrailSummary }) {
  const { t, i18n } = useTranslation('walks');
  const [imageFailed, setImageFailed] = useState(false);
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const duration = formatTrailDuration(trail, t, lang);
  const loop = loopLabel(trail.isLoop, t);
  const official = officialWebsite(trail.officialUrl);
  const showImage = trail.imageUrl !== null && !imageFailed;
  // La fiche reçoit les filtres de la liste pour son lien de retour.
  const { search } = useLocation();

  return (
    <article data-testid={`trail-card-${trail.id}`} className="card-event flex h-full flex-col border border-brenne-900/5" lang={trail.contentLanguage}>
      <figure className="relative m-0 aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-brenne-100 to-sable-100">
        {showImage && trail.imageUrl && (
          <img src={trail.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {showImage && <ImageCredit credit={trail.imageCredit} license={trail.imageLicense} />}
      </figure>
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6" lang={lang}>
        <ul className="flex flex-wrap items-center gap-2" aria-label={t('card.modesLabel')}>
          {trail.modes.map((mode) => (
            <li key={mode} className="rounded-full bg-brenne-50 px-2.5 py-1 text-xs font-semibold text-brenne-900">{t(`modes.${mode}`)}</li>
          ))}
          {loop && <li className="rounded-full bg-sable-100 px-2.5 py-1 text-xs font-semibold text-brenne-950">{loop}</li>}
        </ul>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold leading-snug text-brenne-950 [overflow-wrap:anywhere]" lang={trail.contentLanguage}>
            <Link
              to={buildLocalizedPath('walks', lang, trail.id)}
              state={{ listSearch: search }}
              className="hover:text-brenne-800 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creuse-700"
            >
              {trail.title}
            </Link>
          </h2>
          <p className="text-sm leading-relaxed text-gray-700">
            {[trail.startCity, t('card.fromLeBlanc', { distance: formatKm(trail.distanceFromLeBlancM, lang) })].filter(Boolean).join(' · ')}
          </p>
        </div>
        {(trail.distanceM !== null || duration) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-brenne-800">
            {trail.distanceM !== null && <span>{t('card.distanceKm', { distance: formatKm(trail.distanceM, lang) })}</span>}
            {duration && <span>{duration}</span>}
          </p>
        )}
        <div className="mt-auto space-y-3 border-t border-brenne-900/10 pt-4">
          <p className={`text-sm font-semibold ${trail.hasTrack ? 'text-brenne-800' : 'text-gray-700'}`}>
            {trail.hasTrack ? t('card.trackAvailable') : t('card.trackUnavailable')}
          </p>
          {official && (
            <a
              href={official}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('card.officialLinkLabel', { title: trail.title })}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-creuse-800 underline underline-offset-2 hover:text-creuse-900 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-creuse-700"
            >
              {t('card.officialLink')}<span aria-hidden="true">↗</span>
            </a>
          )}
          <p className="text-xs text-gray-600">
            {trail.producer ? t('card.source', { producer: trail.producer }) : t('card.sourceUnknown')}
          </p>
        </div>
      </div>
    </article>
  );
}
