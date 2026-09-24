import { useTranslation } from 'react-i18next';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';
import { buildLocalizedPath, type RouteSection } from '../routes/routeMapping';

export function useLocalizedPath() {
  const { i18n } = useTranslation();
  const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;

  return (section: RouteSection, id?: string) => buildLocalizedPath(section, currentLang, id);
}
