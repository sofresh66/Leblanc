import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import type { EventDetail } from '@leblanc/shared';
import { DEFAULT_LANGUAGE, isSupportedLanguage, SUPPORTED_LANGUAGES } from '../i18n/languages';
import { buildLocalizedPath, type RouteSection } from '../routes/routeMapping';
import { eventStructuredData, serializeJsonLd } from '../utils/seo';

const SITE_URL = (
  import.meta.env.VITE_SITE_URL?.trim() || 'https://leblanc-et-moi.pages.dev'
).replace(/\/+$/, '');
const LOCALES = { fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT', nl: 'nl_NL' };

interface PageSeoProps {
  section: RouteSection | 'notFound';
  event?: EventDetail;
  noindex?: boolean;
}

export function PageSeo({ section, event, noindex = false }: PageSeoProps) {
  const { t, i18n } = useTranslation(['seo', 'nav']);
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const key = section === 'events' ? 'event' : section;
  const title = event ? t('event.dynamicTitle', { title: event.title }) : t(`${key}.title`);
  const description = event?.description.trim()
    ? event.description
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160)
    : t(`${key}.description`);
  const absolute = (path: string) => new URL(path, `${SITE_URL}/`).href;
  const canonical = absolute(
    section === 'notFound' ? pathname : buildLocalizedPath(section, lang, id),
  );
  const image = absolute(event?.imageUrl || '/images/hero-le-blanc.jpg');
  const excluded = noindex || section === 'notFound';
  const breadcrumbs = [{ name: t('nav:home'), item: absolute(buildLocalizedPath('home', lang)) }];
  if (section === 'events') {
    breadcrumbs.push({ name: t('nav:list'), item: absolute(buildLocalizedPath('list', lang)) });
    if (event) breadcrumbs.push({ name: event.title, item: canonical });
  } else if (section !== 'home' && section !== 'notFound') {
    breadcrumbs.push({ name: t(`nav:${section}`), item: canonical });
  }
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Le Blanc & Moi',
      url: SITE_URL,
      logo: absolute('/favicon.svg'),
    },
  ];
  if (!excluded) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        ...crumb,
      })),
    });
    if (event) graph.push(eventStructuredData(event, canonical, image));
  }

  return (
    <Helmet>
      <html lang={lang} />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={excluded ? 'noindex, follow' : 'index, follow'} />
      <link rel="canonical" href={canonical} />
      {!excluded &&
        SUPPORTED_LANGUAGES.map((language) => (
          <link
            key={language}
            rel="alternate"
            hrefLang={language}
            href={absolute(buildLocalizedPath(section, language, id))}
          />
        ))}
      {!excluded && (
        <link
          rel="alternate"
          hrefLang="x-default"
          href={absolute(buildLocalizedPath(section, 'fr', id))}
        />
      )}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content={LOCALES[lang]} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <script type="application/ld+json">
        {serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}
      </script>
    </Helmet>
  );
}
