import {
  datatourismeAttribution,
  osmTrackAttribution,
  type TrailGeoResponse,
  type TrailListResponse,
  type TrailNearbyResponse,
} from '@leblanc/shared';
import { z } from 'zod';
import {
  getTrailByIdFromDb,
  getTrailGpxSourceFromDb,
  getTrailNearbyFromDb,
  listTrailGeoFromDb,
  listTrailsFromDb,
} from '../db/routes.js';
import type { Env } from '../env.js';
import { CACHE_PROFILES } from '../http/cache.js';
import { getCorsHeaders } from '../http/cors.js';
import { buildGpx, gpxFileName } from '../http/gpx.js';
import {
  errorResponse,
  jsonResponse,
  notFoundResponse,
  validationErrorResponse,
} from '../http/responses.js';
import { CursorExpiredError } from '../validation/query.js';
import { parseTrailGeoQuery, parseTrailLang, parseTrailListQuery } from '../validation/routesQuery.js';

const UuidSchema = z.string().uuid();
const INVALID_ID = 'Identifiant de parcours invalide (format UUID attendu)';
const NOT_FOUND = 'Parcours introuvable';

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Paramètres de requête invalides';
}

/** GET /api/v1/routes : liste filtrée, avec tracé d'abord, curseur à trois clés. */
export async function handleListTrails(request: Request, env: Env | undefined, nowIso: string, requestId?: string): Promise<Response> {
  let query;
  try {
    query = parseTrailListQuery(new URL(request.url), nowIso);
  } catch (error) {
    if (error instanceof CursorExpiredError) {
      return errorResponse(request, env, { status: 400, code: 'CURSOR_EXPIRED', message: error.message, requestId });
    }
    return validationErrorResponse(request, env, message(error), requestId);
  }
  const { items, nextCursor } = await listTrailsFromDb(env?.DATABASE_URL ?? '', query);
  // La liste ne sert aucun tracé : seule la source des fiches est citée.
  const producers = [...new Set(items.map((item) => item.producer))];
  const payload: TrailListResponse = {
    items, nextCursor, attributions: producers.map((producer) => datatourismeAttribution(producer)), generatedAt: nowIso,
  };
  return jsonResponse(request, env, payload, { cacheProfile: 'routesList' });
}

/** GET /api/v1/routes/geo : départs et tracés allégés pour la carte. */
export async function handleTrailGeo(request: Request, env: Env | undefined, nowIso: string, requestId?: string): Promise<Response> {
  let filters;
  try {
    filters = parseTrailGeoQuery(new URL(request.url));
  } catch (error) {
    return validationErrorResponse(request, env, message(error), requestId);
  }
  const { items, truncated } = await listTrailGeoFromDb(env?.DATABASE_URL ?? '', filters);
  const relations = [...new Set(items.flatMap((item) => (item.osmRelationId === null ? [] : [item.osmRelationId])))];
  const payload: TrailGeoResponse = {
    items,
    attributions: [datatourismeAttribution(null), ...relations.map((id) => osmTrackAttribution(id))],
    truncated,
    generatedAt: nowIso,
  };
  return jsonResponse(request, env, payload, { cacheProfile: 'routesGeo' });
}

export async function handleGetTrailById(
  request: Request, env: Env | undefined, id: string, requestId?: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(id).success) return validationErrorResponse(request, env, INVALID_ID, requestId);
  let lang;
  try {
    lang = parseTrailLang(new URL(request.url));
  } catch (error) {
    return validationErrorResponse(request, env, message(error), requestId);
  }
  const trail = await getTrailByIdFromDb(env?.DATABASE_URL ?? '', id, lang);
  if (!trail) return notFoundResponse(request, env, NOT_FOUND, requestId);
  return jsonResponse(request, env, trail, { cacheProfile: 'routeDetail' });
}

/** GET /api/v1/routes/:id/gpx : seulement pour un tracé OSM (ODbL). */
export async function handleGetTrailGpx(
  request: Request, env: Env | undefined, id: string, requestId?: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(id).success) return validationErrorResponse(request, env, INVALID_ID, requestId);
  if (new URL(request.url).search) return validationErrorResponse(request, env, 'Cette route ne prend pas de paramètres', requestId);
  const source = await getTrailGpxSourceFromDb(env?.DATABASE_URL ?? '', id);
  if (!source) return notFoundResponse(request, env, 'Tracé GPX indisponible pour ce parcours', requestId);
  return new Response(buildGpx(source), {
    status: 200,
    headers: {
      'Content-Type': 'application/gpx+xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${gpxFileName(source.title)}"`,
      'Cache-Control': CACHE_PROFILES.routeDetail,
      ...getCorsHeaders(request, env),
    },
  });
}

/** GET /api/v1/routes/:id/nearby : événements à venir et lieux à 5 km du départ. */
export async function handleGetTrailNearby(
  request: Request, env: Env | undefined, id: string, nowIso: string, requestId?: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(id).success) return validationErrorResponse(request, env, INVALID_ID, requestId);
  let lang;
  try {
    lang = parseTrailLang(new URL(request.url));
  } catch (error) {
    return validationErrorResponse(request, env, message(error), requestId);
  }
  const nearby = await getTrailNearbyFromDb(env?.DATABASE_URL ?? '', id, lang, nowIso);
  if (!nearby) return notFoundResponse(request, env, NOT_FOUND, requestId);
  const payload: TrailNearbyResponse = { ...nearby, generatedAt: nowIso };
  return jsonResponse(request, env, payload, { cacheProfile: 'routeNearby' });
}
