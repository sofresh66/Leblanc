import { PlaceTypeSchema, type PlaceType } from '@leblanc/shared';

export interface PlaceFilterValues {
  types: PlaceType[];
  cuisines: string[];
  openNow: boolean;
  maxDistanceKm: number;
}

function splitValues(value: string | null): string[] {
  return [...new Set((value ?? '').split(',').map((part) => part.trim()).filter(Boolean))];
}

export function readPlaceFilterParams(params: URLSearchParams): PlaceFilterValues {
  const rawTypes = new Set(splitValues(params.get('type')));
  const rawDistance = Number(params.get('maxDistance'));
  return {
    types: PlaceTypeSchema.options.filter((type) => rawTypes.has(type)),
    cuisines: splitValues(params.get('cuisine')),
    openNow: params.get('openNow') === 'true',
    maxDistanceKm: Number.isFinite(rawDistance) && rawDistance >= 1000 && rawDistance <= 20000
      ? Math.round(rawDistance / 1000)
      : 20,
  };
}

export function writePlaceFilterParams(current: URLSearchParams, values: PlaceFilterValues): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const key of ['type', 'cuisine', 'openNow', 'maxDistance', 'cursor']) next.delete(key);
  if (values.types.length) next.set('type', values.types.join(','));
  if (values.cuisines.length) next.set('cuisine', values.cuisines.join(','));
  if (values.openNow) next.set('openNow', 'true');
  if (values.maxDistanceKm < 20) next.set('maxDistance', String(values.maxDistanceKm * 1000));
  return next;
}
