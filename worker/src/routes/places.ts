import {
  SupportedLanguageSchema,
  type PlaceApiListResponse,
} from '@leblanc/shared';
import { z } from 'zod';
import {
  getPlaceByIdFromDb,
  listPlaceCategoriesFromDb,
  listPlacesFromDb,
} from '../db/places.js';
import type { Env } from '../env.js';
import {
  jsonResponse,
  notFoundResponse,
  validationErrorResponse,
} from '../http/responses.js';
import { parsePlaceListQuery } from '../validation/placesQuery.js';

const UuidSchema = z.string().uuid();

export async function handleListPlaces(
  request: Request,
  env: Env | undefined,
  nowIso: string,
  requestId?: string,
): Promise<Response> {
  let query;
  try {
    query = parsePlaceListQuery(new URL(request.url));
  } catch (error) {
    return validationErrorResponse(request, env,
      error instanceof Error ? error.message : 'Paramètres de requête invalides', requestId);
  }
  const result = await listPlacesFromDb(env?.DATABASE_URL ?? '', query, new Date(nowIso));
  const payload: PlaceApiListResponse = { ...result, generatedAt: nowIso };
  return jsonResponse(request, env, payload, {
    cacheProfile: query.isOpenNow === undefined ? 'placesList' : 'placesOpenNow',
  });
}

export async function handleGetPlaceById(
  request: Request,
  env: Env | undefined,
  id: string,
  nowIso: string,
  requestId?: string,
): Promise<Response> {
  if (!UuidSchema.safeParse(id).success) {
    return validationErrorResponse(request, env, 'Identifiant de lieu invalide (format UUID attendu)', requestId);
  }
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== 'lang') || params.getAll('lang').length > 1) {
    return validationErrorResponse(request, env, 'Paramètres de requête invalides', requestId);
  }
  const lang = SupportedLanguageSchema.safeParse(params.get('lang') ?? 'fr');
  if (!lang.success) {
    return validationErrorResponse(request, env, 'Paramètre "lang" invalide', requestId);
  }
  const place = await getPlaceByIdFromDb(env?.DATABASE_URL ?? '', id, lang.data, new Date(nowIso));
  if (!place) return notFoundResponse(request, env, 'Lieu introuvable', requestId);
  return jsonResponse(request, env, place, { cacheProfile: 'placeDetail' });
}

export async function handlePlaceCategories(
  request: Request,
  env: Env | undefined,
): Promise<Response> {
  if (new URL(request.url).search) {
    return validationErrorResponse(request, env, 'Cette route ne prend pas de paramètres');
  }
  const categories = await listPlaceCategoriesFromDb(env?.DATABASE_URL ?? '');
  return jsonResponse(request, env, categories, { cacheProfile: 'placeCategories' });
}
