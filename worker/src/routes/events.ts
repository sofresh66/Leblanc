import {
  SupportedLanguageSchema,
  type EventListResponse,
} from '@leblanc/shared';
import { z } from 'zod';
import { getEventByIdFromDb, listEventsFromDb } from '../db/events.js';
import type { Env } from '../env.js';
import {
  errorResponse,
  jsonResponse,
  notFoundResponse,
  validationErrorResponse,
} from '../http/responses.js';
import { CursorExpiredError, parseEventListQuery } from '../validation/query.js';

const UuidSchema = z.string().uuid();

export async function handleListEvents(
  request: Request,
  env: Env | undefined,
  nowIso: string,
  requestId?: string
): Promise<Response> {
  const url = new URL(request.url);

  let query;
  try {
    query = parseEventListQuery(url, nowIso);
  } catch (err) {
    if (err instanceof CursorExpiredError) {
      // Code distinct : le frontend repart de la première page.
      return errorResponse(request, env, { status: 400, code: 'CURSOR_EXPIRED', message: err.message, requestId });
    }
    const message = err instanceof Error ? err.message : 'Paramètres de requête invalides';
    return validationErrorResponse(request, env, message, requestId);
  }

  const databaseUrl = env?.DATABASE_URL || '';
  const { items, nextCursor } = await listEventsFromDb(databaseUrl, query, nowIso);

  const responsePayload: EventListResponse = {
    items,
    nextCursor,
    generatedAt: nowIso,
  };

  return jsonResponse(request, env, responsePayload, {
    cacheProfile: 'eventsList',
  });
}

export async function handleGetEventById(
  request: Request,
  env: Env | undefined,
  id: string,
  nowIso: string,
  requestId?: string
): Promise<Response> {
  const uuidValidation = UuidSchema.safeParse(id);
  if (!uuidValidation.success) {
    return validationErrorResponse(
      request,
      env,
      'Identifiant d’événement invalide (format UUID attendu)',
      requestId
    );
  }

  const url = new URL(request.url);
  const rawLang = url.searchParams.get('lang') || 'fr';
  const langValidation = SupportedLanguageSchema.safeParse(rawLang);
  if (!langValidation.success) {
    return validationErrorResponse(
      request,
      env,
      `Paramètre "lang" invalide : "${rawLang}". Langues acceptées : fr, en, de, nl, es, it`,
      requestId
    );
  }

  const databaseUrl = env?.DATABASE_URL || '';
  const event = await getEventByIdFromDb(databaseUrl, id, langValidation.data, nowIso);

  if (!event) {
    return notFoundResponse(request, env, 'Événement introuvable', requestId);
  }

  return jsonResponse(request, env, event, {
    cacheProfile: 'eventDetail',
  });
}
