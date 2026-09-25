import {
  ApiErrorSchema,
  EventCategorySchema,
  EventDetailSchema,
  EventListParamsSchema,
  EventListResponseSchema,
  SEARCH_RADIUS_METERS,
  type EventCategory,
  type EventDetail,
  type EventListParams,
  type EventListParamsInput,
  type EventListResponse,
} from '@leblanc/shared';
import { z } from 'zod';
import type { EventsRepository } from './eventsRepository';

/**
 * Délai maximal d'une requête : le premier appel peut réveiller l'instance Neon
 * (cold start) et dépasser largement le temps de réponse habituel.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** Message dédié au cold start Neon (503), à afficher tel quel côté UI. */
const COLD_START_MESSAGE = 'Le service se réveille, veuillez réessayer dans quelques secondes';

/**
 * Erreur levée pour toute réponse HTTP non 2xx de l'API Worker.
 * Le corps d'erreur standardisé est `{ error: { code, message, requestId } }`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Erreur levée quand `fetch` rejette sans réponse HTTP : panne réseau ou délai dépassé.
 * Permet de distinguer une panne réseau d'une erreur applicative (`ApiError`).
 */
export class ApiNetworkError extends Error {
  readonly url: string;
  readonly isTimeout: boolean;

  constructor(url: string, isTimeout: boolean, cause: unknown) {
    super(
      isTimeout
        ? `Délai dépassé (${REQUEST_TIMEOUT_MS / 1000} s) : le service met trop de temps à répondre`
        : 'Impossible de contacter le service : vérifiez votre connexion réseau',
      { cause },
    );
    this.name = 'ApiNetworkError';
    this.url = url;
    this.isTimeout = isTimeout;
  }
}

/**
 * Résout l'URL de base de l'API : `VITE_API_URL` si définie, sinon `/api`
 * (chemin relatif proxifié par Vite en développement, cf. `vite.config.ts`).
 */
function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim() ?? '';
  return configured.length > 0 ? configured.replace(/\/+$/, '') : '/api';
}

/** Construit l'URL finale (absolue en production, relative en développement via le proxy Vite). */
function buildUrl(path: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return `${resolveBaseUrl()}${path}${query.length > 0 ? `?${query}` : ''}`;
}

/** Lit un corps JSON en tolérant un corps vide ou non JSON (retourne `undefined`). */
function readJsonBody(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Convertit une réponse HTTP non 2xx en `ApiError` exploitable par l'UI.
 * Le message du Worker est conservé, sauf pour le 503 (cold start Neon) remplacé
 * par un message explicite.
 */
function toApiError(response: Response, payload: unknown): ApiError {
  const parsed = ApiErrorSchema.safeParse(payload);
  const requestId = parsed.success ? parsed.data.error.requestId : undefined;
  const code = parsed.success ? parsed.data.error.code : `HTTP_${response.status}`;
  const serverMessage = parsed.success ? parsed.data.error.message : '';

  let message: string;
  if (response.status === 503) {
    message = COLD_START_MESSAGE;
  } else if (serverMessage.length > 0) {
    message = serverMessage;
  } else {
    message = `Erreur ${response.status} ${response.statusText}`.trim();
  }

  return new ApiError(response.status, code, message, requestId);
}

/**
 * Convertit un échec de validation du schéma partagé en `ApiError` homogène,
 * afin que l'UI ne gère qu'un seul type d'erreur (C5).
 * Le statut 502 distingue une réponse amont illisible d'une erreur du client.
 */
function invalidResponseError(path: string, cause: Error): ApiError {
  return new ApiError(
    502,
    'INVALID_RESPONSE',
    `Réponse invalide de l'API (${path}) : ${cause.message}`,
  );
}

/**
 * Exécute un GET et retourne le corps JSON brut.
 *
 * Aucune reprise automatique n'est effectuée : les erreurs remontent telles quelles,
 * l'utilisateur relançant l'appel via un bouton « Réessayer ».
 *
 * @throws {ApiNetworkError} Panne réseau ou dépassement du délai de 30 s.
 * @throws {ApiError} Réponse HTTP non 2xx.
 */
async function getJson(path: string, searchParams = new URLSearchParams()): Promise<unknown> {
  const url = buildUrl(path, searchParams);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

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
    // `fetch` ne rejette que sur panne réseau ou annulation — ici uniquement le timeout.
    throw new ApiNetworkError(url, controller.signal.aborted, error);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw toApiError(response, payload);
  }

  return payload;
}

/**
 * Sérialise les paramètres de liste dans la forme attendue par GET /api/v1/events.
 * Les catégories sont répétées (`?category=culture&category=sport`) et les distances
 * sont exprimées en mètres, plafonnées à 20 000 m (rayon maximal accepté par l'API).
 */
function serializeEventListParams(params: EventListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  searchParams.set('lang', params.lang);
  searchParams.set('limit', String(params.limit));

  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.city) searchParams.set('city', params.city);
  if (params.isFree !== undefined) searchParams.set('isFree', String(params.isFree));
  if (params.cursor) searchParams.set('cursor', params.cursor);
  if (params.maxDistance !== undefined) {
    searchParams.set('maxDistance', String(Math.min(params.maxDistance, SEARCH_RADIUS_METERS)));
  }
  if (params.distance !== undefined) {
    searchParams.set('distance', String(Math.min(params.distance, SEARCH_RADIUS_METERS)));
  }
  for (const category of params.categories ?? []) {
    searchParams.append('category', category);
  }

  return searchParams;
}

/**
 * Repository HTTP réel : appelle l'API du Cloudflare Worker (Neon PostgreSQL).
 * Implémente le contrat `EventsRepository`, identique à `MockEventsRepository` ;
 * la bascule entre les deux implémentations se fait dans `./index.ts`.
 */
export class ApiEventsRepository implements EventsRepository {
  /**
   * GET /api/v1/events : liste paginée et filtrée des événements.
   *
   * @throws {ApiNetworkError} Panne réseau ou délai de 30 s dépassé (cold start Neon).
   * @throws {ApiError} Réponse HTTP non 2xx (400 paramètres, 500, 503 cold start…) ou
   * réponse 2xx dont le corps ne respecte pas le schéma partagé (502 `INVALID_RESPONSE`).
   */
  async listEvents(params: EventListParamsInput): Promise<EventListResponse> {
    // Même validation que le mock : `limit` par défaut (20) et distances bornées à 20 000 m.
    const parsed = EventListParamsSchema.parse(params);
    const payload = await getJson('/v1/events', serializeEventListParams(parsed));

    const response = EventListResponseSchema.safeParse(payload);
    if (!response.success) {
      throw invalidResponseError('/v1/events', response.error);
    }

    return response.data;
  }

  /**
   * GET /api/v1/events/{id} : détail d'un événement et de ses occurrences.
   * Un 404 (inconnu, non publié ou hors rayon) retourne `null` au lieu de lever une erreur.
   *
   * @throws {ApiNetworkError} Panne réseau ou délai de 30 s dépassé (cold start Neon).
   * @throws {ApiError} Réponse HTTP autre que 2xx ou 404, ou corps ne respectant pas
   * le schéma partagé (502 `INVALID_RESPONSE`).
   */
  async getEventById(id: string, lang: string): Promise<EventDetail | null> {
    const searchParams = new URLSearchParams();
    searchParams.set('lang', lang);

    try {
      const payload = await getJson(`/v1/events/${encodeURIComponent(id)}`, searchParams);
      const parsed = EventDetailSchema.safeParse(payload);
      if (!parsed.success) {
        throw invalidResponseError(`/v1/events/${id}`, parsed.error);
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** GET /api/v1/categories : liste des catégories autorisées. */
  async listCategories(): Promise<EventCategory[]> {
    const payload = await getJson('/v1/categories');
    const parsed = z.array(EventCategorySchema).safeParse(payload);
    if (!parsed.success) {
      throw invalidResponseError('/v1/categories', parsed.error);
    }

    return parsed.data;
  }

  /** GET /api/v1/cities : villes couvertes par l'API. */
  async listCities(): Promise<string[]> {
    const payload = await getJson('/v1/cities');
    const parsed = z.array(z.string()).safeParse(payload);
    if (!parsed.success) {
      throw invalidResponseError('/v1/cities', parsed.error);
    }

    return parsed.data;
  }
}
