import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';

export function DocumentLang() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
    document.documentElement.lang = currentLang;

  }, [i18n.language]);

  return null;
}
