import { DEFAULT_TRAIL_MODES, TRAIL_MODES, type SupportedLanguage, type TrailMode } from '@leblanc/shared';
import type { TrailFilters } from '../../api/trailsRepository';

export const DISTANCE_RANGES = ['0-5', '5-10', '10-20', '20+'] as const;
export type DistanceRange = (typeof DISTANCE_RANGES)[number];
/** Durée maximale en minutes : 1 h, 2 h, 4 h, une journée. */
export const DURATION_LIMITS = [60, 120, 240, 1440] as const;
export type DurationLimit = (typeof DURATION_LIMITS)[number];

export interface WalkFilterValues {
  modes: TrailMode[];
  withTrack: boolean;
  loop: boolean;
  distance: DistanceRange | null;
  duration: DurationLimit | null;
}

export const DEFAULT_WALK_FILTERS: WalkFilterValues = {
  modes: [...DEFAULT_TRAIL_MODES], withTrack: false, loop: false, distance: null, duration: null,
};

const FILTER_KEYS = ['modes', 'withTrack', 'loop', 'distance', 'duration'];

function sameModes(a: readonly TrailMode[], b: readonly TrailMode[]): boolean {
  return a.length === b.length && a.every((mode) => b.includes(mode));
}

/** Lecture tolérante de l'URL : une valeur inconnue revient au défaut. */
export function readWalkFilterParams(params: URLSearchParams): WalkFilterValues {
  const rawModes = new Set((params.get('modes') ?? '').split(',').map((part) => part.trim()));
  const modes = TRAIL_MODES.filter((mode) => rawModes.has(mode));
  const distance = DISTANCE_RANGES.find((range) => range === params.get('distance')) ?? null;
  const duration = DURATION_LIMITS.find((limit) => String(limit) === params.get('duration')) ?? null;
  return {
    modes: modes.length ? modes : [...DEFAULT_TRAIL_MODES],
    withTrack: params.get('withTrack') === 'true',
    loop: params.get('loop') === 'true',
    distance,
    duration,
  };
}

/** Écrit seulement ce qui diffère du défaut ; conserve les autres paramètres (q, view). */
export function writeWalkFilterParams(current: URLSearchParams, values: WalkFilterValues): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of FILTER_KEYS) next.delete(key);
  const modes = TRAIL_MODES.filter((mode) => values.modes.includes(mode));
  if (modes.length && !sameModes(modes, DEFAULT_TRAIL_MODES)) next.set('modes', modes.join(','));
  if (values.withTrack) next.set('withTrack', 'true');
  if (values.loop) next.set('loop', 'true');
  if (values.distance) next.set('distance', values.distance);
  if (values.duration) next.set('duration', String(values.duration));
  return next;
}

export function countActiveWalkFilters(values: WalkFilterValues): number {
  return Number(!sameModes(values.modes, DEFAULT_TRAIL_MODES)) + Number(values.withTrack) + Number(values.loop)
    + Number(values.distance !== null) + Number(values.duration !== null);
}

/** Filtres de l'API (km, minutes) à partir des valeurs de l'URL et de la recherche. */
export function toTrailFilters(values: WalkFilterValues, lang: SupportedLanguage, q?: string): TrailFilters {
  const [min, max] = values.distance === '20+' ? [20, undefined]
    : values.distance ? values.distance.split('-').map(Number) : [undefined, undefined];
  return {
    lang,
    modes: values.modes,
    ...(values.withTrack ? { withTrack: true } : {}),
    ...(values.loop ? { loop: true } : {}),
    ...(min !== undefined && min > 0 ? { minKm: min } : {}),
    ...(max !== undefined ? { maxKm: max } : {}),
    ...(values.duration ? { maxDurationMin: values.duration } : {}),
    ...(q ? { q } : {}),
  };
}
