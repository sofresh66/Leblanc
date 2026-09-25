import type { Env } from '../env.js';
import { CACHE_PROFILES, type CacheProfileKey } from './cache.js';
import { getCorsHeaders } from './cors.js';

export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    requestId?: string | undefined;
  };
}

/**
 * Construit une réponse JSON standardisée avec CORS et Cache-Control.
 */
export function jsonResponse<T>(
  request: Request,
  env: Env | undefined,
  data: T,
  options: {
    status?: number | undefined;
    cacheProfile?: CacheProfileKey | undefined;
    headers?: Record<string, string> | undefined;
  } = {}
): Response {
  const { status = 200, cacheProfile = 'noStore', headers = {} } = options;
  const corsHeaders = getCorsHeaders(request, env);

  const responseHeaders = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': CACHE_PROFILES[cacheProfile],
    ...corsHeaders,
    ...headers,
  });

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Construit une réponse d'erreur standardisée.
 */
export function errorResponse(
  request: Request,
  env: Env | undefined,
  options: {
    status: number;
    code: string;
    message: string;
    requestId?: string | undefined;
    headers?: Record<string, string> | undefined;
  }
): Response {
  const { status, code, message, requestId, headers } = options;
  const payload: ErrorPayload = {
    error: {
      code,
      message,
      ...(requestId ? { requestId } : {}),
    },
  };

  return jsonResponse(request, env, payload, {
    status,
    cacheProfile: 'noStore',
    headers,
  });
}

export function validationErrorResponse(
  request: Request,
  env: Env | undefined,
  message: string,
  requestId?: string | undefined
): Response {
  return errorResponse(request, env, {
    status: 400,
    code: 'VALIDATION_ERROR',
    message,
    requestId,
  });
}

export function notFoundResponse(
  request: Request,
  env: Env | undefined,
  message = 'Ressource introuvable',
  requestId?: string | undefined
): Response {
  return errorResponse(request, env, {
    status: 404,
    code: 'NOT_FOUND',
    message,
    requestId,
  });
}

export function methodNotAllowedResponse(
  request: Request,
  env: Env | undefined,
  allowedMethods = ['GET', 'OPTIONS'],
  requestId?: string | undefined
): Response {
  return errorResponse(request, env, {
    status: 405,
    code: 'METHOD_NOT_ALLOWED',
    message: `Méthode non autorisée. Méthodes acceptées : ${allowedMethods.join(', ')}`,
    requestId,
    headers: {
      Allow: allowedMethods.join(', '),
    },
  });
}

export function internalErrorResponse(
  request: Request,
  env: Env | undefined,
  message = 'Une erreur interne est survenue',
  requestId?: string | undefined
): Response {
  return errorResponse(request, env, {
    status: 500,
    code: 'INTERNAL_ERROR',
    message,
    requestId,
  });
}

export function serviceUnavailableResponse(
  request: Request,
  env: Env | undefined,
  message = 'Le service de base de données est temporairement indisponible',
  requestId?: string | undefined
): Response {
  return errorResponse(request, env, {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message,
    requestId,
  });
}
