import {
  DEFAULT_TRAIL_MODES,
  SupportedLanguageSchema,
  TRAIL_LIST_MAX_LIMIT,
  TrailModeSchema,
  type SupportedLanguage,
  type TrailMode,
} from '@leblanc/shared';
import { z } from 'zod';
import { CURSOR_MAX_AGE_MS, CursorExpiredError, parseSearchQuery } from './query.js';

const CURSOR_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Curseur des parcours : les trois clés de tri (t : avec tracé, d : distance au
 * Blanc en mètres, i : id) et la date de la première page (a), qui fixe la même
 * expiration de 24 h que les événements.
 */
const TrailCursorSchema = z.strictObject({
  t: z.union([z.literal(0), z.literal(1)]),
  d: z.number().int().nonnegative(),
  i: z.string().uuid(),
  a: z.string().datetime({ offset: true }),
});

export type TrailCursor = z.infer<typeof TrailCursorSchema>;

export interface TrailFilters {
  lang: SupportedLanguage;
  modes: TrailMode[];
  withTrack?: boolean;
  loop?: boolean;
  minDistanceM?: number;
  maxDistanceM?: number;
  maxDurationMin?: number;
  q?: string;
}

export interface ParsedTrailListQuery extends TrailFilters {
  limit: number;
  decodedCursor?: TrailCursor;
  /** Date de référence de la pagination (première page). */
  asOf: string;
}

export function encodeTrailCursor(cursor: TrailCursor): string {
  return btoa(JSON.stringify(TrailCursorSchema.parse(cursor)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeTrailCursor(value: string): TrailCursor {
  if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Curseur de parcours invalide');
  }
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const cursor = TrailCursorSchema.parse(JSON.parse(atob(padded)) as unknown);
    if (encodeTrailCursor(cursor) !== value) throw new Error('Curseur non canonique');
    return cursor;
  } catch {
    throw new Error('Curseur de parcours invalide');
  }
}

function single(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error(`Paramètre "${key}" répété`);
  return values[0];
}

function booleanParam(params: URLSearchParams, key: string): boolean | undefined {
  const value = single(params, key);
  if (value === undefined) return undefined;
  if (value !== 'true' && value !== 'false') throw new Error(`Paramètre "${key}" invalide : true ou false attendu`);
  return value === 'true';
}

function boundedNumber(params: URLSearchParams, key: string, min: number, max: number, integer = false): number | undefined {
  const value = single(params, key);
  if (value === undefined) return undefined;
  const number = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new Error(`Paramètre "${key}" invalide : ${integer ? 'entier ' : ''}entre ${min} et ${max} attendu`);
  }
  return number;
}

function parseModes(params: URLSearchParams): TrailMode[] {
  const values = params.getAll('modes');
  if (!values.length) return [...DEFAULT_TRAIL_MODES];
  const items = values.flatMap((value) => value.split(',').map((item) => item.trim()));
  const modes = items.map((item) => {
    const mode = TrailModeSchema.safeParse(item);
    if (!mode.success) throw new Error(`Paramètre "modes" invalide : ${TrailModeSchema.options.join(', ')} attendus`);
    return mode.data;
  });
  return [...new Set(modes)];
}

function checkKeys(params: URLSearchParams, allowed: readonly string[]): void {
  for (const key of params.keys()) {
    if (!allowed.includes(key)) throw new Error(`Paramètre "${key}" inconnu`);
  }
}

function parseFilters(params: URLSearchParams): TrailFilters {
  const lang = SupportedLanguageSchema.safeParse(single(params, 'lang') ?? 'fr');
  if (!lang.success) throw new Error('Paramètre "lang" invalide');
  const minKm = boundedNumber(params, 'min_km', 0, 1000);
  const maxKm = boundedNumber(params, 'max_km', 0, 1000);
  if (minKm !== undefined && maxKm !== undefined && minKm > maxKm) throw new Error('"min_km" doit être inférieur ou égal à "max_km"');
  const withTrack = booleanParam(params, 'with_track');
  const loop = booleanParam(params, 'loop');
  const maxDurationMin = boundedNumber(params, 'max_duration', 1, 60 * 24 * 60, true);
  const q = parseSearchQuery(single(params, 'q') ?? null);
  return {
    lang: lang.data,
    modes: parseModes(params),
    ...(withTrack === undefined ? {} : { withTrack }),
    ...(loop === undefined ? {} : { loop }),
    ...(minKm === undefined ? {} : { minDistanceM: Math.round(minKm * 1000) }),
    ...(maxKm === undefined ? {} : { maxDistanceM: Math.round(maxKm * 1000) }),
    ...(maxDurationMin === undefined ? {} : { maxDurationMin }),
    ...(q ? { q } : {}),
  };
}

const FILTER_KEYS = ['lang', 'modes', 'with_track', 'loop', 'min_km', 'max_km', 'max_duration', 'q'] as const;

/** GET /api/v1/routes : filtres, limite plafonnée à 50, curseur à trois clés. */
export function parseTrailListQuery(url: URL, nowIso: string): ParsedTrailListQuery {
  const params = url.searchParams;
  checkKeys(params, [...FILTER_KEYS, 'limit', 'cursor']);
  const filters = parseFilters(params);
  const limit = boundedNumber(params, 'limit', 1, TRAIL_LIST_MAX_LIMIT, true) ?? 20;
  const rawCursor = single(params, 'cursor');
  if (rawCursor === undefined) return { ...filters, limit, asOf: nowIso };
  const decodedCursor = decodeTrailCursor(rawCursor);
  const age = Date.parse(nowIso) - Date.parse(decodedCursor.a);
  if (age > CURSOR_MAX_AGE_MS || age < -CURSOR_CLOCK_SKEW_MS) {
    throw new CursorExpiredError('Curseur expiré : reprenez depuis la première page');
  }
  return { ...filters, limit, decodedCursor, asOf: decodedCursor.a };
}

/** GET /api/v1/routes/geo : mêmes filtres, sans pagination. */
export function parseTrailGeoQuery(url: URL): TrailFilters {
  checkKeys(url.searchParams, FILTER_KEYS);
  return parseFilters(url.searchParams);
}

/** Fiche, GPX, à proximité : seul « lang » est admis. */
export function parseTrailLang(url: URL): SupportedLanguage {
  checkKeys(url.searchParams, ['lang']);
  const lang = SupportedLanguageSchema.safeParse(single(url.searchParams, 'lang') ?? 'fr');
  if (!lang.success) throw new Error('Paramètre "lang" invalide');
  return lang.data;
}
