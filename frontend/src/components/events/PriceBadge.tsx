import type { Event } from '@leblanc/shared';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../../i18n/languages';

type Price = Pick<Event, 'isFree' | 'priceMin' | 'currency'>;

/** Un tarif inconnu ne doit jamais être présenté comme gratuit ou payant. */
export function PriceBadge({ event }: { event: Price }) {
  const { t, i18n } = useTranslation('events');
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  let label = t('price.unknown');
  let colors = 'bg-gray-100 text-gray-700 border-gray-200';

  if (event.isFree === true) {
    label = t('price.free');
    colors = 'bg-green-100 text-green-900 border-green-200';
  } else if (event.isFree === false) {
    label = event.priceMin === null
      ? t('price.paid')
      : t('price.from', {
          price: new Intl.NumberFormat(lang, {
            style: 'currency', currency: event.currency, maximumFractionDigits: 2,
          }).format(event.priceMin),
        });
    colors = 'bg-orange-100 text-orange-900 border-orange-200';
  }

  return (
    <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-full border shadow-sm ${colors}`}>
      {label}
    </span>
  );
}
