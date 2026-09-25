/**
 * Directives de cache HTTP pour les différents endpoints de l'API.
 */
export const CACHE_PROFILES = {
  /** Liste des événements (courte durée, rafraîchissement régulier) */
  eventsList: 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',

  /** Détail d'un événement */
  eventDetail: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',

  /** Référentiel des catégories (très stable) */
  categories: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',

  /** Villes actives (mise à jour modérée) */
  cities: 'public, max-age=300, s-maxage=600, stale-while-revalidate=1200',

  /** Erreurs ou endpoints dynamiques / health */
  noStore: 'no-store, no-cache, must-revalidate',
} as const;

export type CacheProfileKey = keyof typeof CACHE_PROFILES;
