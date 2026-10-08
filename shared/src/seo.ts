import { SupportedLanguageSchema } from './schemas.js';
import { buildLocalizedPath, type RouteSection } from './routes.js';
import type { EventDetail, PlaceApi, SupportedLanguage } from './types.js';

// Fonctions pures de SEO, partagées par le frontend (react-helmet-async) et le
// middleware Pages Functions (HTML servi aux robots sans JavaScript).

export const OG_LOCALES: Record<SupportedLanguage, string> = {
  fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT', nl: 'nl_NL',
};

/** Empêche une description externe de terminer la balise script JSON-LD. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Description courte sans balises ni espaces superflus. */
export function summarizeText(text: string, maxLength = 160): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function eventStructuredData(
  event: EventDetail,
  url: string,
  image: string,
): Record<string, unknown> {
  return {
    '@type': 'Event',
    name: event.title,
    description: event.description,
    startDate: event.startDate,
    ...(event.endDate ? { endDate: event.endDate } : {}),
    url,
    image,
    location: {
      '@type': 'Place',
      ...(event.venueName ? { name: event.venueName } : {}),
      ...(event.address || event.postalCode || event.city
        ? {
            address: {
              '@type': 'PostalAddress',
              ...(event.address ? { streetAddress: event.address } : {}),
              ...(event.postalCode ? { postalCode: event.postalCode } : {}),
              ...(event.city ? { addressLocality: event.city } : {}),
            },
          }
        : {}),
      geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude },
    },
    ...(event.isFree === true || (event.isFree === false && event.priceMin !== null)
      ? {
          offers: {
            '@type': 'Offer',
            price: event.isFree ? 0 : event.priceMin,
            priceCurrency: event.currency,
            url: event.publicUrl || url,
          },
        }
      : {}),
    ...(event.isFree !== null ? { isAccessibleForFree: event.isFree } : {}),
    // Le contrat API ne fournit pas d'organisateur : ne pas confondre avec la source.
  };
}

const PLACE_TYPES: Record<PlaceApi['type'], string> = {
  restaurant: 'Restaurant',
  bar: 'BarOrPub',
  cafe: 'CafeOrCoffeeShop',
  fast_food: 'FastFoodRestaurant',
  food_truck: 'FoodEstablishment',
  other_food: 'FoodEstablishment',
};
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function getRestaurantJsonLd(place: PlaceApi): Record<string, unknown> {
  const address = {
    '@type': 'PostalAddress',
    ...(place.address ? { streetAddress: place.address } : {}),
    ...(place.postalCode ? { postalCode: place.postalCode } : {}),
    ...(place.city ? { addressLocality: place.city } : {}),
  };
  const hours = place.openingHours
    .filter((rule) => rule.weekOfMonth === null && rule.opens !== rule.closes)
    .map((rule) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: rule.dayOfWeek.map((day) => `https://schema.org/${DAYS[day - 1]}`),
      opens: rule.opens,
      closes: rule.closes,
      ...(rule.validFrom ? { validFrom: rule.validFrom } : {}),
      ...(rule.validThrough ? { validThrough: rule.validThrough } : {}),
    }));
  const prices = [place.priceRangeMin, place.priceRangeMax].filter((price): price is number => price !== null);
  return {
    '@context': 'https://schema.org',
    '@type': PLACE_TYPES[place.type],
    name: place.title,
    ...(place.description.trim() ? { description: place.description.trim() } : {}),
    ...(Object.keys(address).length > 1 ? { address } : {}),
    ...(place.latitude !== null && place.longitude !== null
      && Number.isFinite(place.latitude) && Number.isFinite(place.longitude)
      && !(place.latitude === 0 && place.longitude === 0)
      ? { geo: { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude } } : {}),
    ...(place.phone ? { telephone: place.phone } : {}),
    ...(place.website ? { url: place.website } : {}),
    ...(place.imageUrl ? { image: place.imageUrl } : {}),
    ...(prices.length ? { priceRange: `${prices.join('–')} ${place.currency}` } : {}),
    ...(place.cuisines.length ? { servesCuisine: place.cuisines } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(place.takeaway === true ? { takeaway: true } : {}),
  };
}

export interface PageHeadInput {
  siteUrl: string;
  lang: SupportedLanguage;
  section: RouteSection | 'notFound';
  id?: string | undefined;
  title: string;
  description: string;
  /** Image absolue ou chemin du site ; image d'accueil par défaut. */
  image?: string | null | undefined;
  noindex?: boolean;
  /** Fil d'Ariane (noms traduits, chemins du site), hors page 404. */
  breadcrumb?: { name: string; path: string }[];
  /** Données structurées supplémentaires (Event, Restaurant…). */
  structuredData?: Record<string, unknown>[];
}

export interface PageHead {
  title: string;
  canonical: string;
  robots: string;
  /** Balises à insérer dans <head>, marquées data-rh pour que react-helmet-async les remplace. */
  tagsHtml: string;
}

/**
 * Balises <head> d'une page : description, robots, canonical, hreflang ×6 +
 * x-default, Open Graph, Twitter et JSON-LD. Toutes les valeurs sont échappées.
 */
export function buildPageHead(input: PageHeadInput): PageHead {
  const siteUrl = input.siteUrl.replace(/\/+$/, '');
  const absolute = (path: string) => new URL(path, `${siteUrl}/`).href;
  const excluded = input.noindex === true || input.section === 'notFound';
  const canonical = absolute(buildLocalizedPath(input.section, input.lang, input.id));
  const image = absolute(input.image || '/images/hero-le-blanc.jpg');
  const robots = excluded ? 'noindex, follow' : 'index, follow';
  const attr = (value: string) => escapeHtml(value);
  const tags: string[] = [
    `<meta data-rh="true" name="description" content="${attr(input.description)}">`,
    `<meta data-rh="true" name="robots" content="${robots}">`,
    `<link data-rh="true" rel="canonical" href="${attr(canonical)}">`,
  ];
  if (!excluded) {
    for (const language of SupportedLanguageSchema.options) {
      tags.push(`<link data-rh="true" rel="alternate" hreflang="${language}" href="${attr(absolute(buildLocalizedPath(input.section, language, input.id)))}">`);
    }
    tags.push(`<link data-rh="true" rel="alternate" hreflang="x-default" href="${attr(absolute(buildLocalizedPath(input.section, 'fr', input.id)))}">`);
  }
  tags.push(
    `<meta data-rh="true" property="og:title" content="${attr(input.title)}">`,
    `<meta data-rh="true" property="og:description" content="${attr(input.description)}">`,
    `<meta data-rh="true" property="og:image" content="${attr(image)}">`,
    '<meta data-rh="true" property="og:type" content="website">',
    `<meta data-rh="true" property="og:locale" content="${OG_LOCALES[input.lang]}">`,
    `<meta data-rh="true" property="og:url" content="${attr(canonical)}">`,
    '<meta data-rh="true" name="twitter:card" content="summary_large_image">',
    `<meta data-rh="true" name="twitter:title" content="${attr(input.title)}">`,
    `<meta data-rh="true" name="twitter:description" content="${attr(input.description)}">`,
    `<meta data-rh="true" name="twitter:image" content="${attr(image)}">`,
  );

  const graph: Record<string, unknown>[] = [{
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: 'Le Blanc & Moi',
    url: siteUrl,
    logo: absolute('/favicon.svg'),
  }];
  if (!excluded) {
    if (input.breadcrumb?.length) {
      graph.push({
        '@type': 'BreadcrumbList',
        itemListElement: input.breadcrumb.map((crumb, index) => ({
          '@type': 'ListItem', position: index + 1, name: crumb.name, item: absolute(crumb.path),
        })),
      });
    }
    graph.push(...(input.structuredData ?? []));
  }
  tags.push(`<script data-rh="true" type="application/ld+json">${serializeJsonLd({ '@context': 'https://schema.org', '@graph': graph })}</script>`);

  return { title: input.title, canonical, robots, tagsHtml: tags.join('') };
}
