import {
  ApiErrorSchema,
  PlaceApiListResponseSchema,
  PlaceApiSchema,
  PlaceCategoriesResponseSchema,
  SupportedContentLanguageSchema,
  type PlaceApi,
  type PlaceApiListResponse,
  type PlaceCategoriesResponse,
} from '@leblanc/shared';
import { ApiError, ApiNetworkError } from './apiEventsRepository';
import { PlaceHttpListParamsSchema, type PlaceListParamsInput, type PlacesRepository } from './placesRepository';

const REQUEST_TIMEOUT_MS = 30_000;
const COLD_START_MESSAGE = 'Le service se réveille, veuillez réessayer dans quelques secondes';

function buildUrl(path: string, searchParams: URLSearchParams): string {
  const configured = import.meta.env.VITE_API_URL?.trim() ?? '';
  const baseUrl = configured ? configured.replace(/\/+$/, '') : '/api';
  const query = searchParams.toString();
  return `${baseUrl}${path}${query ? `?${query}` : ''}`;
}

function readJsonBody(body: string): unknown {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed;
  } catch {
    return undefined;
  }
}

function toApiError(response: Response, payload: unknown): ApiError {
  const parsed = ApiErrorSchema.safeParse(payload);
  const code = parsed.success ? parsed.data.error.code : `HTTP_${response.status}`;
  const requestId = parsed.success ? parsed.data.error.requestId : undefined;
  const message = response.status === 503
    ? COLD_START_MESSAGE
    : parsed.success && parsed.data.error.message
      ? parsed.data.error.message
      : `Erreur ${response.status} ${response.statusText}`.trim();
  return new ApiError(response.status, code, message, requestId);
}

function invalidResponseError(path: string, cause: Error): ApiError {
  return new ApiError(502, 'INVALID_RESPONSE', `Réponse invalide de l'API (${path}) : ${cause.message}`);
}

async function getJson(path: string, searchParams = new URLSearchParams()): Promise<unknown> {
  const url = buildUrl(path, searchParams);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    payload = readJsonBody(await response.text());
  } catch (error) {
    throw new ApiNetworkError(url, controller.signal.aborted, error);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) throw toApiError(response, payload);
  return payload;
}

export class ApiPlacesRepository implements PlacesRepository {
  async listPlaces(params: PlaceListParamsInput): Promise<PlaceApiListResponse> {
    const parsed = PlaceHttpListParamsSchema.parse(params);
    const searchParams = new URLSearchParams();
    searchParams.set('lang', parsed.lang);
    searchParams.set('limit', String(parsed.limit));
    for (const type of parsed.types ?? []) searchParams.append('type', type);
    for (const cuisine of parsed.cuisines ?? []) searchParams.append('cuisine', cuisine);
    if (parsed.isOpenNow !== undefined) searchParams.set('isOpenNow', String(parsed.isOpenNow));
    if (parsed.maxDistance !== undefined) searchParams.set('maxDistance', String(parsed.maxDistance));
    if (parsed.q) searchParams.set('q', parsed.q);
    if (parsed.cursor) searchParams.set('cursor', parsed.cursor);

    const payload = await getJson('/v1/places', searchParams);
    const response = PlaceApiListResponseSchema.safeParse(payload);
    if (!response.success) throw invalidResponseError('/v1/places', response.error);
    return response.data;
  }

  async getPlaceById(id: string, lang: string): Promise<PlaceApi | null> {
    const validatedLang = SupportedContentLanguageSchema.parse(lang);
    const path = `/v1/places/${encodeURIComponent(id)}`;
    const searchParams = new URLSearchParams({ lang: validatedLang });
    try {
      const payload = await getJson(path, searchParams);
      const response = PlaceApiSchema.safeParse(payload);
      if (!response.success) throw invalidResponseError(path, response.error);
      return response.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async listCategories(): Promise<PlaceCategoriesResponse> {
    const payload = await getJson('/v1/places/categories');
    const response = PlaceCategoriesResponseSchema.safeParse(payload);
    if (!response.success) throw invalidResponseError('/v1/places/categories', response.error);
    return response.data;
  }
}
