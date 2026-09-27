import {
  PlaceApiListParamsSchema,
  type PlaceApiListParams,
} from '@leblanc/shared';
import { z } from 'zod';

const PlaceCursorSchema = z.strictObject({
  d: z.number().finite().nonnegative(),
  i: z.string().uuid(),
});

export type PlaceCursor = z.infer<typeof PlaceCursorSchema>;
export type ParsedPlaceListQuery = PlaceApiListParams & {
  decodedCursor?: PlaceCursor;
};

export function encodePlaceCursor(cursor: PlaceCursor): string {
  return btoa(JSON.stringify(PlaceCursorSchema.parse(cursor)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodePlaceCursor(value: string): PlaceCursor {
  if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Curseur de lieu invalide');
  }
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const parsed: unknown = JSON.parse(atob(padded));
    const cursor = PlaceCursorSchema.parse(parsed);
    if (encodePlaceCursor(cursor) !== value) throw new Error('Curseur non canonique');
    return cursor;
  } catch {
    throw new Error('Curseur de lieu invalide');
  }
}

function single(params: URLSearchParams, key: string): string | undefined {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error(`Paramètre "${key}" répété`);
  return values[0];
}

function multi(params: URLSearchParams, key: string): string[] | undefined {
  const values = params.getAll(key);
  if (!values.length) return undefined;
  const items = values.flatMap((value) => value.split(',').map((item) => item.trim()));
  if (items.some((item) => !item)) throw new Error(`Paramètre "${key}" invalide`);
  return [...new Set(items)];
}

function numberParam(params: URLSearchParams, key: string): number | undefined {
  const value = single(params, key);
  if (value === undefined) return undefined;
  if (!/^(?:\d+)(?:\.\d+)?$/.test(value)) throw new Error(`Paramètre "${key}" invalide`);
  return Number(value);
}

export function parsePlaceListQuery(url: URL): ParsedPlaceListQuery {
  const params = url.searchParams;
  const allowed = new Set(['lang', 'type', 'cuisine', 'isOpenNow', 'maxDistance', 'cursor', 'limit']);
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new Error(`Paramètre "${key}" inconnu`);
  }

  const rawIsOpenNow = single(params, 'isOpenNow');
  if (rawIsOpenNow !== undefined && rawIsOpenNow !== 'true' && rawIsOpenNow !== 'false') {
    throw new Error('Paramètre "isOpenNow" invalide : true ou false attendu');
  }
  const cursor = single(params, 'cursor');
  const decodedCursor = cursor === undefined ? undefined : decodePlaceCursor(cursor);
  const parsed = PlaceApiListParamsSchema.parse({
    lang: single(params, 'lang') ?? 'fr',
    types: multi(params, 'type'),
    cuisines: multi(params, 'cuisine'),
    isOpenNow: rawIsOpenNow === undefined ? undefined : rawIsOpenNow === 'true',
    maxDistance: numberParam(params, 'maxDistance') ?? 20000,
    cursor,
    limit: numberParam(params, 'limit') ?? 20,
  });
  return { ...parsed, ...(decodedCursor ? { decodedCursor } : {}) };
}
