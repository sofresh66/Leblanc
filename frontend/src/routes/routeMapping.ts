import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  normalizeLanguage,
  type SupportedLanguage,
} from '../i18n/languages';

// La table des routes vit dans @leblanc/shared (utilisée aussi par le middleware Pages).
export {
  ROUTE_SECTIONS,
  ROUTE_SEGMENTS,
  buildLocalizedPath,
  resolveRoute,
  type ResolvedRoute,
  type RouteSection,
} from '@leblanc/shared';

/**
 * Détecte la langue préférée de l'utilisateur selon la priorité stricte :
 * 1. Querystring ?lang=xx
 * 2. localStorage
 * 3. navigator.languages
 * 4. navigator.language
 * 5. Fallback 'fr'
 */
export function detectPreferredLanguage(searchParams?: URLSearchParams): SupportedLanguage {
  if (searchParams) {
    const queryLang = normalizeLanguage(searchParams.get('lang'));
    if (queryLang) {
      return queryLang;
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
      if (stored) {
        return stored;
      }
    } catch {
      // Ignore les erreurs d'accès au localStorage (ex: mode privé strict)
    }

    if (Array.isArray(window.navigator?.languages)) {
      for (const candidate of window.navigator.languages) {
        const norm = normalizeLanguage(candidate);
        if (norm) {
          return norm;
        }
      }
    }

    const single = normalizeLanguage(window.navigator?.language);
    if (single) {
      return single;
    }
  }

  return DEFAULT_LANGUAGE;
}
