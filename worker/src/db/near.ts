import { TRAIL_NEARBY_RADIUS_M } from '@leblanc/shared';

/** Rayon maximal d'une recherche « autour d'un point » (bloc « À proximité » des parcours). */
export const NEAR_MAX_RADIUS_M = TRAIL_NEARBY_RADIUS_M;

export interface NearPoint {
  lng: number;
  lat: number;
  radiusM: number;
}

/**
 * Garde-fou des recherches autour d'un point. Ce filtre n'est exposé par aucun
 * paramètre d'URL (le point vient du départ d'un parcours en base) ; il est tout
 * de même borné pour qu'un futur appelant ne puisse pas élargir la recherche.
 */
export function assertNearPoint(near: NearPoint): NearPoint {
  const valid = Number.isFinite(near.lat) && near.lat >= -90 && near.lat <= 90
    && Number.isFinite(near.lng) && near.lng >= -180 && near.lng <= 180
    && Number.isFinite(near.radiusM) && near.radiusM > 0 && near.radiusM <= NEAR_MAX_RADIUS_M;
  if (!valid) throw new Error('Recherche autour d’un point invalide (coordonnées ou rayon hors bornes)');
  return near;
}
