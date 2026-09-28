import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PlaceApi } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../../i18n/languages';
import { PlacePriceBadge, PlaceStatusBadge, PlaceTypeBadge } from './PlaceBadges';

/** Temporaire jusqu'à l'ajout de la section places dans routeMapping (sous-lot 3.4). */
const DETAIL_SEGMENT: Record<SupportedLanguage, string> = {
  fr: 'lieux', en: 'places', es: 'lugares', de: 'orte', it: 'luoghi', nl: 'plaatsen',
};

export function PlaceCard({ place }: { place: PlaceApi }) {
  const { t, i18n } = useTranslation('places');
  const [imageFailed, setImageFailed] = useState(false);
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const address = [place.address, place.postalCode, place.city].filter(Boolean).join(', ');
  const distance = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(place.distance / 1000);
  const detailPath = `/${lang}/${DETAIL_SEGMENT[lang]}/${encodeURIComponent(place.id)}`;

  return (
    <article data-testid={`place-card-${place.id}`} className="card-event h-full border border-brenne-900/5">
      <Link to={detailPath} className="group flex h-full flex-col rounded-xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-creuse-700" aria-label={t('card.view', { title: place.title })}>
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-brenne-100 sm:aspect-[4/3]">
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-brenne-100 via-sable-100 to-brenne-200 text-brenne-700" aria-hidden="true">
            <svg className="mb-2 h-14 w-14 opacity-50" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10 13v16c0 7 5 12 12 12v12M22 13v40M16 13v16M38 53V28c0-10 5-16 15-18v43M38 36h15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {place.city && <span className="text-xs font-semibold uppercase tracking-wide">{place.city}</span>}
          </div>
          {place.imageUrl && !imageFailed && (
            <img src={place.imageUrl} alt="" loading="lazy" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.035]" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <PlaceTypeBadge type={place.type} />
            <PlaceStatusBadge isOpenNow={place.isOpenNow} />
          </div>
          <div className="space-y-2">
            <h2 className="font-display text-xl font-bold leading-snug text-brenne-950 transition-colors group-hover:text-brenne-800 [overflow-wrap:anywhere]">{place.title}</h2>
            {address && <p className="text-sm leading-relaxed text-gray-600 [overflow-wrap:anywhere]">{address}</p>}
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-brenne-900/10 pt-4">
            <PlacePriceBadge place={place} />
            <span className="text-sm font-semibold text-brenne-800">{t('distanceKm', { distance })}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
