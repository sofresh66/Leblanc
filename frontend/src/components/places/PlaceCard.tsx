import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PlaceApi } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../../i18n/languages';
import { buildLocalizedPath } from '../../routes/routeMapping';
import { PlacePriceBadge, PlaceStatusBadge, PlaceTypeBadge } from './PlaceBadges';
import { PlacePlaceholder } from './PlacePlaceholder';

export function PlaceCard({ place }: { place: PlaceApi }) {
  const { t, i18n } = useTranslation('places');
  const [imageFailed, setImageFailed] = useState(false);
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const address = [place.address, place.postalCode, place.city].filter(Boolean).join(', ');
  const distance = place.distance === null ? null
    : new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(place.distance / 1000);
  const detailPath = buildLocalizedPath('places', lang, place.id);

  return (
    <article data-testid={`place-card-${place.id}`} className="card-event h-full border border-brenne-900/5">
      <Link to={detailPath} className="group flex h-full flex-col rounded-xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-creuse-700" aria-label={t('card.view', { title: place.title })}>
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-brenne-100 sm:aspect-[4/3]">
          <PlacePlaceholder type={place.type} city={place.city} />
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
            {distance !== null && <span className="text-sm font-semibold text-brenne-800">{t('distanceKm', { distance })}</span>}
          </div>
        </div>
      </Link>
    </article>
  );
}
