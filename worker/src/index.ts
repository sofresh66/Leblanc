import { DatabaseServiceError } from './db/client.js';
import type { Env } from './env.js';
import { handleCorsPreflight } from './http/cors.js';
import {
  internalErrorResponse,
  methodNotAllowedResponse,
  notFoundResponse,
  serviceUnavailableResponse,
} from './http/responses.js';
import { handleCategories } from './routes/categories.js';
import { handleCities } from './routes/cities.js';
import { handleGetEventById, handleListEvents } from './routes/events.js';
import { handleHealth } from './routes/health.js';
import { handleGetPlaceById, handleListPlaces, handlePlaceCategories } from './routes/places.js';

/**
 * Routeur principal du Cloudflare Worker pour l'API Le Blanc & Moi.
 */
export async function handleRequest(request: Request, env?: Env): Promise<Response> {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  let response: Response | undefined;

  try {
    // Déterminer la route avant de valider la méthode, y compris pour OPTIONS.
    const isHealth = pathname === '/health';
    const isCategories = pathname === '/api/v1/categories';
    const isCities = pathname === '/api/v1/cities';
    const isEventsList = pathname === '/api/v1/events';
    const isEventDetail = pathname.startsWith('/api/v1/events/') && pathname.split('/').length === 5;
    const isPlacesList = pathname === '/api/v1/places';
    const isPlaceCategories = pathname === '/api/v1/places/categories';
    const isPlaceDetail = pathname.startsWith('/api/v1/places/') && pathname.split('/').length === 5 && !isPlaceCategories;

    const isKnownRoute = isHealth || isCategories || isCities || isEventsList || isEventDetail ||
      isPlacesList || isPlaceCategories || isPlaceDetail;

    if (!isKnownRoute) {
      response = notFoundResponse(request, env, 'Route introuvable', requestId);
      return response;
    }

    if (method === 'OPTIONS') {
      response = handleCorsPreflight(request, env);
      return response;
    }

    if (method !== 'GET') {
      response = methodNotAllowedResponse(request, env, ['GET', 'OPTIONS'], requestId);
      return response;
    }

    // Horodatage figé pour l'ensemble du traitement de la requête (CB5)
    const nowIso = new Date().toISOString();

    // 3. Routage vers les contrôleurs
    if (isHealth) {
      response = handleHealth(request, env);
    } else if (isCategories) {
      response = await handleCategories(request, env, nowIso);
    } else if (isCities) {
      response = await handleCities(request, env, nowIso);
    } else if (isEventsList) {
      response = await handleListEvents(request, env, nowIso, requestId);
    } else if (isEventDetail) {
      const id = pathname.slice('/api/v1/events/'.length);
      response = await handleGetEventById(request, env, id, nowIso, requestId);
    } else if (isPlacesList) {
      response = await handleListPlaces(request, env, nowIso, requestId);
    } else if (isPlaceCategories) {
      response = await handlePlaceCategories(request, env);
    } else if (isPlaceDetail) {
      const id = pathname.slice('/api/v1/places/'.length);
      response = await handleGetPlaceById(request, env, id, nowIso, requestId);
    } else {
      response = notFoundResponse(request, env, 'Route introuvable', requestId);
    }
  } catch (err: unknown) {
    if (err instanceof DatabaseServiceError) {
      response = serviceUnavailableResponse(request, env, err.message, requestId);
    } else {
      response = internalErrorResponse(request, env, 'Une erreur interne est survenue', requestId);
    }
  } finally {
    const durationMs = Math.round(performance.now() - start);
    console.log(
      JSON.stringify({
        requestId,
        method,
        path: url.pathname,
        status: response?.status ?? 500,
        durationMs,
      })
    );
  }

  return (
    response ??
    internalErrorResponse(request, env, 'Une erreur interne est survenue', requestId)
  );
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
