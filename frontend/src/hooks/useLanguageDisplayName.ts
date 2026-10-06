import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage, LANGUAGES_META, type SupportedLanguage } from '../i18n/languages';

/**
 * Nom d'une langue de contenu dans la langue de l'interface
 * (« francese » en italien, « French » en anglais).
 */
export function useLanguageDisplayName(): (code: SupportedLanguage) => string {
  const { i18n } = useTranslation();
  const uiLanguage = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const displayNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([LANGUAGES_META[uiLanguage].locale], { type: 'language' });
    } catch {
      return null;
    }
  }, [uiLanguage]);

  return useCallback(
    (code: SupportedLanguage) => displayNames?.of(code) ?? LANGUAGES_META[code].nativeName,
    [displayNames],
  );
}
