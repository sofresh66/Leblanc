import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LANGUAGE_STORAGE_KEY,
  LANGUAGES_META,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../i18n/languages';
import { buildLocalizedPath, resolveRoute } from '../routes/routeMapping';

export function useLanguage() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const currentLanguage = (SUPPORTED_LANGUAGES.includes(i18n.language as SupportedLanguage)
    ? i18n.language
    : 'fr') as SupportedLanguage;

  const setLanguage = useCallback(
    (newLang: SupportedLanguage) => {
      if (newLang === currentLanguage) return;

      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
      } catch {
        // Ignorer si localStorage inaccessible
      }

      const resolved = resolveRoute(location.pathname);
      const targetPath = buildLocalizedPath(resolved.section, newLang, resolved.id);
      navigate(targetPath + location.search + location.hash, { replace: false });
    },
    [currentLanguage, location.hash, location.pathname, location.search, navigate],
  );

  return {
    currentLanguage,
    setLanguage,
    availableLanguages: SUPPORTED_LANGUAGES,
    languagesMeta: LANGUAGES_META,
  };
}
