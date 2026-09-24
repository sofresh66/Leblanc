import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGES_META } from '../i18n/languages';

const TIMEZONE = 'Europe/Paris';

export function useLocalizedDate() {
  const { i18n } = useTranslation();
  const currentLang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const locale = LANGUAGES_META[currentLang].locale;

  const formatDate = useCallback(
    (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
      const d = date instanceof Date ? date : new Date(date);
      const mergedOptions: Intl.DateTimeFormatOptions = {
        timeZone: TIMEZONE,
        dateStyle: 'medium',
        ...options,
      };
      return new Intl.DateTimeFormat(locale, mergedOptions).format(d);
    },
    [locale],
  );

  return { formatDate, timeZone: TIMEZONE };
}
