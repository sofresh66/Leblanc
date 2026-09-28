import { useTranslation } from 'react-i18next';
import type { PlaceApi, PlaceType } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../../i18n/languages';

export function PlaceTypeBadge({ type }: { type: PlaceType }) {
  const { t } = useTranslation('places');
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brenne-200 bg-brenne-50 px-2.5 py-1 text-xs font-semibold text-brenne-950">
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 3v7a3 3 0 0 0 3 3v8m0-18v10m3-10v7a3 3 0 0 1-3 3m10-10c-2 2-3 5-3 9h4V3h-1Zm1 9v9" />
      </svg>
      {t(`types.${type}`)}
    </span>
  );
}

export function PlaceStatusBadge({ isOpenNow }: { isOpenNow: boolean | null }) {
  const { t } = useTranslation('places');
  const status = isOpenNow === true ? 'open' : isOpenNow === false ? 'closed' : 'unknown';
  const color = status === 'open'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : status === 'closed'
      ? 'border-gray-300 bg-gray-100 text-gray-800'
      : 'border-gray-200 bg-white text-gray-700';
  return (
    <span data-testid="place-status" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${color}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status === 'open' ? 'bg-emerald-600' : 'bg-gray-500'}`} />
      {t(`status.${status}`)}
    </span>
  );
}

export function PlacePriceBadge({ place }: { place: Pick<PlaceApi, 'priceRangeMin' | 'priceRangeMax' | 'currency'> }) {
  const { t, i18n } = useTranslation('places');
  const { priceRangeMin: min, priceRangeMax: max } = place;
  if (min === null && max === null) return null;
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const format = (value: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(value);
  const currency = place.currency === 'EUR' ? '€' : place.currency;
  const label = min !== null && max !== null
    ? min === max
      ? t('price.exact', { value: format(min), currency })
      : t('price.range', { min: format(min), max: format(max), currency })
    : min !== null
      ? t('price.from', { min: format(min), currency })
      : t('price.to', { max: format(max!), currency });
  return (
    <span data-testid="place-price" className="inline-flex items-center rounded-full border border-sable-200 bg-sable-100 px-2.5 py-1 text-xs font-semibold text-brenne-950">
      {label}
    </span>
  );
}
