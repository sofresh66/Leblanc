import {
  DEFAULT_TRAIL_MODES,
  TRAIL_MODES,
  TrailGeoResponseSchema,
  TrailDetailSchema,
  TrailListResponseSchema,
  TrailNearbyResponseSchema,
  type SupportedLanguage,
  type TrailDetail,
  type TrailNearbyResponse,
  type TrailGeoResponse,
  type TrailListResponse,
  type TrailMode,
} from '@leblanc/shared';
import { ApiError } from './apiEventsRepository';
import { buildUrl, getJson, invalidResponseError } from './apiPlacesRepository';

/** Filtres de « Se balader », dans les unités de l'API (km, minutes). */
export interface TrailFilters {
  lang: SupportedLanguage;
  modes: TrailMode[];
  withTrack?: boolean;
  loop?: boolean;
  minKm?: number;
  maxKm?: number;
  maxDurationMin?: number;
  q?: string;
}

/** Forme canonique (modes triés) : deux filtres équivalents partagent la même clé de cache. */
export function normalizeTrailFilters(filters: TrailFilters): TrailFilters {
  const modes = TRAIL_MODES.filter((mode) => filters.modes.includes(mode));
  return {
    lang: filters.lang,
    modes: modes.length ? modes : [...DEFAULT_TRAIL_MODES],
    ...(filters.withTrack !== undefined ? { withTrack: filters.withTrack } : {}),
    ...(filters.loop !== undefined ? { loop: filters.loop } : {}),
    ...(filters.minKm !== undefined ? { minKm: filters.minKm } : {}),
    ...(filters.maxKm !== undefined ? { maxKm: filters.maxKm } : {}),
    ...(filters.maxDurationMin !== undefined ? { maxDurationMin: filters.maxDurationMin } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  };
}

export function trailFilterSearchParams(filters: TrailFilters): URLSearchParams {
  const normalized = normalizeTrailFilters(filters);
  const params = new URLSearchParams({ lang: normalized.lang, modes: normalized.modes.join(',') });
  if (normalized.withTrack !== undefined) params.set('with_track', String(normalized.withTrack));
  if (normalized.loop !== undefined) params.set('loop', String(normalized.loop));
  if (normalized.minKm !== undefined) params.set('min_km', String(normalized.minKm));
  if (normalized.maxKm !== undefined) params.set('max_km', String(normalized.maxKm));
  if (normalized.maxDurationMin !== undefined) params.set('max_duration', String(normalized.maxDurationMin));
  if (normalized.q) params.set('q', normalized.q);
  return params;
}

/** GET /v1/routes : une page (ordre de l'API, tracés d'abord). */
export async function listTrails(filters: TrailFilters, { limit = 20, cursor }: { limit?: number; cursor?: string } = {}): Promise<TrailListResponse> {
  const params = trailFilterSearchParams(filters);
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  const payload = await getJson('/v1/routes', params);
  const parsed = TrailListResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponseError('/v1/routes', parsed.error);
  return parsed.data;
}

/** GET /v1/routes/geo : départs et tracés allégés pour la carte. */
export async function listTrailGeo(filters: TrailFilters): Promise<TrailGeoResponse> {
  const payload = await getJson('/v1/routes/geo', trailFilterSearchParams(filters));
  const parsed = TrailGeoResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalidResponseError('/v1/routes/geo', parsed.error);
  return parsed.data;
}

/** GET /v1/routes/:id : fiche, ou null si le parcours est inconnu ou masqué (404). */
export async function getTrail(id: string, lang: SupportedLanguage): Promise<TrailDetail | null> {
  const path = `/v1/routes/${encodeURIComponent(id)}`;
  try {
    const payload = await getJson(path, new URLSearchParams({ lang }));
    const parsed = TrailDetailSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponseError(path, parsed.error);
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** GET /v1/routes/:id/nearby : événements à venir et lieux à 5 km du départ. */
export async function getTrailNearby(id: string, lang: SupportedLanguage): Promise<TrailNearbyResponse | null> {
  const path = `/v1/routes/${encodeURIComponent(id)}/nearby`;
  try {
    const payload = await getJson(path, new URLSearchParams({ lang }));
    const parsed = TrailNearbyResponseSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponseError(path, parsed.error);
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Adresse du GPX (téléchargement direct depuis l'API, sous ODbL). */
export function trailGpxUrl(id: string): string {
  return buildUrl(`/v1/routes/${encodeURIComponent(id)}/gpx`);
}
