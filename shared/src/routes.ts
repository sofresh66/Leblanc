import { SupportedLanguageSchema } from './schemas.js';
import type { SupportedLanguage } from './types.js';

// Table des routes localisées, partagée par le frontend (React Router) et le
// middleware Pages Functions (balises <head> et statut HTTP côté serveur).
export type RouteSection = 'home' | 'map' | 'list' | 'events' | 'about' | 'credits' | 'privacy' | 'eat' | 'places';

export const ROUTE_SECTIONS: readonly RouteSection[] = [
  'home',
  'map',
  'list',
  'events',
  'about',
  'credits',
  'privacy',
  'eat',
  'places',
] as const;

export const ROUTE_SEGMENTS: Record<SupportedLanguage, Record<RouteSection, string>> = {
  fr: { places: 'lieux', eat: 'ou-manger', home: '', map: 'carte', list: 'liste', events: 'evenements', about: 'a-propos', credits: 'credits', privacy: 'confidentialite' },
  en: { places: 'places', eat: 'where-to-eat', home: '', map: 'map', list: 'list', events: 'events', about: 'about', credits: 'credits', privacy: 'privacy' },
  es: { places: 'lugares', eat: 'donde-comer', home: '', map: 'mapa', list: 'lista', events: 'eventos', about: 'acerca-de', credits: 'creditos', privacy: 'privacidad' },
  de: { places: 'orte', eat: 'wo-essen', home: '', map: 'karte', list: 'liste', events: 'veranstaltungen', about: 'ueber-uns', credits: 'bildnachweise', privacy: 'datenschutz' },
  it: { places: 'luoghi', eat: 'dove-mangiare', home: '', map: 'mappa', list: 'lista', events: 'eventi', about: 'chi-siamo', credits: 'crediti', privacy: 'privacy' },
  nl: { places: 'plekken', eat: 'waar-eten', home: '', map: 'kaart', list: 'lijst', events: 'evenementen', about: 'over-ons', credits: 'credits', privacy: 'privacy' },
};

export interface ResolvedRoute {
  lang: SupportedLanguage | null;
  section: RouteSection | 'notFound';
  id?: string;
}

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SupportedLanguageSchema.safeParse(value).success;
}

/**
 * Identifie la langue, la section et les paramètres à partir d'un pathname.
 * Exemple: "/fr/evenements/abc" -> { lang: "fr", section: "events", id: "abc" }
 */
export function resolveRoute(pathname: string): ResolvedRoute {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { lang: null, section: 'home' };
  }

  const rawLang = segments[0];
  if (!isSupportedLanguage(rawLang)) {
    return { lang: null, section: 'notFound' };
  }

  const lang: SupportedLanguage = rawLang;
  if (segments.length === 1) {
    return { lang, section: 'home' };
  }

  const sectionSegment = segments[1];
  const langSegments = ROUTE_SEGMENTS[lang];

  if (sectionSegment === langSegments.map) {
    return { lang, section: 'map' };
  }
  if (sectionSegment === langSegments.list) {
    return { lang, section: 'list' };
  }
  if (sectionSegment === langSegments.events) {
    const id = segments[2];
    return id !== undefined
      ? { lang, section: 'events', id }
      : { lang, section: 'events' };
  }
  if (sectionSegment === langSegments.about) {
    return { lang, section: 'about' };
  }

  if (sectionSegment === langSegments.eat && segments.length === 2) {
    return { lang, section: 'eat' };
  }
  if (sectionSegment === langSegments.places && segments.length === 3 && segments[2]) {
    return { lang, section: 'places', id: segments[2] };
  }

  if (sectionSegment === langSegments.privacy && segments.length === 2) {
    return { lang, section: 'privacy' };
  }

  if (sectionSegment === langSegments.credits && segments.length === 2) {
    return { lang, section: 'credits' };
  }

  return { lang, section: 'notFound' };
}

/**
 * Génère le chemin localisé complet pour une section donnée.
 * Exemple: buildLocalizedPath('events', 'en', '123') -> "/en/events/123"
 */
export function buildLocalizedPath(
  section: RouteSection | 'notFound',
  targetLang: SupportedLanguage,
  id?: string,
): string {
  if (section === 'notFound' || section === 'home') {
    return `/${targetLang}`;
  }

  const segment = ROUTE_SEGMENTS[targetLang][section];
  if (section === 'events' || section === 'places') {
    return id ? `/${targetLang}/${segment}/${encodeURIComponent(id)}` : `/${targetLang}/${segment}`;
  }

  return `/${targetLang}/${segment}`;
}
