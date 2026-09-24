import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { resolveRoute } from '../routes/routeMapping';
import { DEFAULT_LANGUAGE, isSupportedLanguage, type SupportedLanguage } from '../i18n/languages';

export function DocumentLang() {
  const { t, i18n } = useTranslation(['seo']);
  const location = useLocation();

  useEffect(() => {
    const currentLang = (isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE) as SupportedLanguage;
    document.documentElement.lang = currentLang;

    const resolved = resolveRoute(location.pathname);
    const seoKey = resolved.section === 'events' ? 'event' : resolved.section;
    const pageTitle = t(`seo.${seoKey}.title`, { defaultValue: 'Le Blanc & Moi' });
    document.title = pageTitle;
  }, [i18n.language, location.pathname, t]);

  return null;
}
