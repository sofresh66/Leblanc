import {
  PlaceApiListParamsSchema,
  type PlaceApi,
  type PlaceApiListResponse,
  type PlaceCategoriesResponse,
} from '@leblanc/shared';
import type { z } from 'zod';

/** Le Worker accepte ce sous-ensemble du schéma V2, sans city ni takeaway. */
export const PlaceHttpListParamsSchema = PlaceApiListParamsSchema.pick({
  lang: true,
  types: true,
  cuisines: true,
  isOpenNow: true,
  maxDistance: true,
  cursor: true,
  limit: true,
}).strict();

/** Paramètres publics du GET /v1/places, avant application des valeurs par défaut. */
export type PlaceListParamsInput = z.input<typeof PlaceHttpListParamsSchema>;
export type PlaceListParams = z.output<typeof PlaceHttpListParamsSchema>;

/** Contrat HTTP des lieux : chaque lieu contient le statut isOpenNow calculé par le Worker. */
export interface PlacesRepository {
  listPlaces(params: PlaceListParamsInput): Promise<PlaceApiListResponse>;
  getPlaceById(id: string, lang: string): Promise<PlaceApi | null>;
  listCategories(): Promise<PlaceCategoriesResponse>;
}

/**
 * La position des filtres répétés n'influe pas sur le résultat. On trie et déduplique
 * pour que deux appels équivalents partagent la même clé TanStack Query.
 */
export function normalizePlaceListParams(params: PlaceListParamsInput) {
  const parsed = PlaceHttpListParamsSchema.parse(params);
  return {
    lang: parsed.lang,
    limit: parsed.limit,
    ...(parsed.types?.length ? { types: [...new Set(parsed.types)].sort() } : {}),
    ...(parsed.cuisines?.length ? { cuisines: [...new Set(parsed.cuisines)].sort() } : {}),
    ...(parsed.isOpenNow !== undefined ? { isOpenNow: parsed.isOpenNow } : {}),
    ...(parsed.maxDistance !== undefined ? { maxDistance: parsed.maxDistance } : {}),
    ...(parsed.cursor ? { cursor: parsed.cursor } : {}),
  };
}
