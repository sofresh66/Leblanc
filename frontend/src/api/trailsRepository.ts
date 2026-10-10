import {
  DEFAULT_TRAIL_MODES,
  TRAIL_MODES,
  TrailGeoResponseSchema,
  TrailListResponseSchema,
  type SupportedLanguage,
  type TrailGeoResponse,
  type TrailListResponse,
  type TrailMode,
} from '@leblanc/shared';
import { getJson, invalidResponseError } from './apiPlacesRepository';

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
