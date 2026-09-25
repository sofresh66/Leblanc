import { ApiErrorSchema } from '@leblanc/shared';
import { describe, expect, it } from 'vitest';
import {
  errorResponse,
  internalErrorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  notFoundResponse,
  serviceUnavailableResponse,
  validationErrorResponse,
} from '../http/responses.js';

describe('Formatage des réponses HTTP (worker/src/http/responses.ts)', () => {
  const req = new Request('https://api.example.com/api/v1/events');

  it('jsonResponse produit une réponse valide avec Content-Type et Cache-Control', async () => {
    const data = { hello: 'world' };
    const res = jsonResponse(req, undefined, data, {
      status: 200,
      cacheProfile: 'eventsList',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toContain('max-age=30');

    const json = await res.json();
    expect(json).toEqual(data);
  });

  it('errorResponse respecte strictement le schéma ApiErrorSchema', async () => {
    const res = errorResponse(req, undefined, {
      status: 400,
      code: 'TEST_ERROR',
      message: 'Message de test',
      requestId: 'test-req-123',
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('Cache-Control')).toContain('no-store');

    const json = await res.json();
    const parsed = ApiErrorSchema.safeParse(json);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.error.code).toBe('TEST_ERROR');
    expect(parsed.data?.error.requestId).toBe('test-req-123');
  });

  it('methodNotAllowedResponse inclut l’en-tête Allow (405)', () => {
    const res = methodNotAllowedResponse(req, undefined, ['GET', 'OPTIONS']);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, OPTIONS');
  });

  it('fournit les helpers standard pour 400, 404, 500 et 503', async () => {
    const res400 = validationErrorResponse(req, undefined, 'Invalid param');
    expect(res400.status).toBe(400);

    const res404 = notFoundResponse(req, undefined, 'Item not found');
    expect(res404.status).toBe(404);

    const res500 = internalErrorResponse(req, undefined);
    expect(res500.status).toBe(500);

    const res503 = serviceUnavailableResponse(req, undefined);
    expect(res503.status).toBe(503);
  });
});
