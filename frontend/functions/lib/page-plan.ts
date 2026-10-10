import {
  EventDetailSchema,
  PlaceApiSchema,
  TrailDetailSchema,
  buildLocalizedPath,
  buildPageHead,
  eventStructuredData,
  getRestaurantJsonLd,
  resolveRoute,
  summarizeText,
  touristTripStructuredData,
  trailSeoDescription,
  type PageHead,
  type RouteSection,
  type SupportedLanguage,
} from '@leblanc/shared';

// Décide, pour une URL de page, du statut HTTP et des balises <head> à
// servir aux robots sans JavaScript (aperçus WhatsApp, Facebook, LinkedIn).

export interface PlanDeps {
  siteUrl: string;
  /** Fichier de traduction servi par le site (/locales/{lang}/{ns}.json), null si absent. */
  loadLocale(lang: SupportedLanguage, namespace: 'seo' | 'nav'): Promise<Record<string, unknown> | null>;
  /** GET sur l'API (chemin après /api). Lève une erreur en cas de panne réseau. */
  fetchApi(path: string): Promise<{ status: number; body: unknown }>;
}

export interface PagePlan {
  status: 200 | 404;
  lang: SupportedLanguage;
  head: PageHead;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_NAME = 'Le Blanc & Moi';

function pick(source: Record<string, unknown> | null, path: string): string | undefined {
  let value: unknown = source;
  for (const key of path.split('.')) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

class UpstreamUnavailable extends Error {}

async function apiDetail(deps: PlanDeps, path: string): Promise<unknown | null> {
  const { status, body } = await deps.fetchApi(path);
  if (status === 404 || status === 400) return null;
  if (status !== 200) throw new UpstreamUnavailable(`API ${status}`);
  return body;
}

/**
 * Plan de la page, ou null quand le HTML doit être servi tel quel : racine
 * (redirection côté client) ou API indisponible (on ne désindexe pas une
 * fiche sur une panne : statut 200 et balises génériques du HTML).
 */
export async function planPage(pathname: string, deps: PlanDeps): Promise<PagePlan | null> {
  const route = resolveRoute(pathname);
  if (route.lang === null && route.section === 'home') return null;
  const lang: SupportedLanguage = route.lang ?? 'fr';
  const [seo, nav] = await Promise.all([deps.loadLocale(lang, 'seo'), deps.loadLocale(lang, 'nav')]);
  const absolute = (path: string) => new URL(path, `${deps.siteUrl.replace(/\/+$/, '')}/`).href;
  const home = { name: pick(nav, 'home') ?? SITE_NAME, path: buildLocalizedPath('home', lang) };

  const notFound = (): PagePlan => ({
    status: 404,
    lang,
    head: buildPageHead({
      siteUrl: deps.siteUrl, lang, section: 'notFound',
      title: pick(seo, 'notFound.title') ?? SITE_NAME,
      description: pick(seo, 'notFound.description') ?? '',
    }),
  });

  if (route.section === 'notFound' || route.lang === null) return notFound();

  try {
    if (route.section === 'events') {
      if (!route.id || !UUID.test(route.id)) return notFound();
      const body = await apiDetail(deps, `/v1/events/${route.id}?lang=${lang}`);
      if (body === null) return notFound();
      const parsed = EventDetailSchema.safeParse(body);
      if (!parsed.success) return null;
      const event = parsed.data;
      const canonical = absolute(buildLocalizedPath('events', lang, event.id));
      const image = absolute(event.imageUrl || '/images/hero-le-blanc.jpg');
      return {
        status: 200,
        lang,
        head: buildPageHead({
          siteUrl: deps.siteUrl, lang, section: 'events', id: event.id,
          title: (pick(seo, 'event.dynamicTitle') ?? '{{title}} — Le Blanc & Moi').replace('{{title}}', event.title),
          description: summarizeText(event.description) || (pick(seo, 'event.description') ?? ''),
          image,
          breadcrumb: [home, { name: pick(nav, 'list') ?? '', path: buildLocalizedPath('list', lang) },
            { name: event.title, path: buildLocalizedPath('events', lang, event.id) }],
          structuredData: [eventStructuredData(event, canonical, image)],
        }),
      };
    }

    if (route.section === 'places') {
      if (!route.id || !UUID.test(route.id)) return notFound();
      const body = await apiDetail(deps, `/v1/places/${route.id}?lang=${lang}`);
      if (body === null) return notFound();
      const parsed = PlaceApiSchema.safeParse(body);
      if (!parsed.success) return null;
      const place = parsed.data;
      // Dans un @graph, chaque nœud hérite du @context racine.
      const restaurant = getRestaurantJsonLd(place);
      delete restaurant['@context'];
      return {
        status: 200,
        lang,
        head: buildPageHead({
          siteUrl: deps.siteUrl, lang, section: 'places', id: place.id,
          title: `${place.title} — ${SITE_NAME}`,
          description: summarizeText(place.description, 150) || (pick(seo, 'eat.description') ?? ''),
          image: place.imageUrl,
          // Le fil d'Ariane nomme le lieu seul, sans le nom du site.
          breadcrumb: [home, { name: pick(nav, 'eat') ?? '', path: buildLocalizedPath('eat', lang) },
            { name: place.title, path: buildLocalizedPath('places', lang, place.id) }],
          structuredData: [restaurant],
        }),
      };
    }

    if (route.section === 'walks' && route.id !== undefined) {
      if (!UUID.test(route.id)) return notFound();
      const body = await apiDetail(deps, `/v1/routes/${route.id}?lang=${lang}`);
      // 404 de l'API : parcours inconnu ou masqué.
      if (body === null) return notFound();
      const parsed = TrailDetailSchema.safeParse(body);
      if (!parsed.success) return null;
      const trail = parsed.data;
      const canonical = absolute(buildLocalizedPath('walks', lang, trail.id));
      return {
        status: 200,
        lang,
        head: buildPageHead({
          siteUrl: deps.siteUrl, lang, section: 'walks', id: trail.id,
          title: `${trail.title} — ${SITE_NAME}`,
          description: trailSeoDescription(trail, {
            withDistance: pick(seo, 'walks.detailDescriptionDistance'),
            withoutDistance: pick(seo, 'walks.detailDescription'),
            fallback: pick(seo, 'walks.description'),
          }, lang),
          // Photo du parcours si elle existe, sinon l'image par défaut du site.
          image: trail.imageUrl,
          breadcrumb: [home, { name: pick(nav, 'walks') ?? '', path: buildLocalizedPath('walks', lang) },
            { name: trail.title, path: buildLocalizedPath('walks', lang, trail.id) }],
          structuredData: [touristTripStructuredData(trail, canonical)],
        }),
      };
    }
  } catch (error) {
    if (error instanceof UpstreamUnavailable) return null;
    throw error;
  }

  const section: RouteSection = route.section;
  const key = section;
  return {
    status: 200,
    lang,
    head: buildPageHead({
      siteUrl: deps.siteUrl, lang, section,
      title: pick(seo, `${key}.title`) ?? SITE_NAME,
      description: pick(seo, `${key}.description`) ?? '',
      breadcrumb: section === 'home' ? [home] : [home, { name: pick(nav, section) ?? '', path: buildLocalizedPath(section, lang) }],
    }),
  };
}
