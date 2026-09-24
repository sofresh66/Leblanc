import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGES_META } from '../i18n/languages';

export function useLocalizedNumber() {
  const { i18n } = useTranslation();
  const currentLang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const locale = LANGUAGES_META[currentLang].locale;

  const formatNumber = useCallback(
    (value: number, options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(locale, options).format(value);
    },
    [locale],
  );

  const formatCurrency = useCallback(
    (value: number, currency = 'EUR', options?: Intl.NumberFormatOptions): string => {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        ...options,
      }).format(value);
    },
    [locale],
  );

  return { formatNumber, formatCurrency };
}
