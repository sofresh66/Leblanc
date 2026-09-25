import { CATEGORIES } from '@leblanc/shared';
import { describe, expect, it } from 'vitest';
import { handleRequest } from '../index.js';

describe('Routage et dispatcher global (worker/src/index.ts)', () => {
  it('GET /health retourne 200 avec { status: "ok", build: "dev" } sans appel DB', async () => {
    const req = new Request('https://api.example.com/health');
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', build: 'dev' });
  });

  it('GET /api/v1/categories retourne 200 avec la liste des catégories sans appel DB', async () => {
    const req = new Request('https://api.example.com/api/v1/categories');
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
    const body = await res.json();
    expect(body).toEqual(CATEGORIES);
  });

  it('OPTIONS sur une route connue retourne 204 No Content', async () => {
    const req = new Request('https://api.example.com/api/v1/events', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    const res = await handleRequest(req);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('Méthode non autorisée sur route connue retourne 405 Method Not Allowed avec en-tête Allow', async () => {
    const reqPost = new Request('https://api.example.com/api/v1/events', { method: 'POST' });
    const resPost = await handleRequest(reqPost);
    expect(resPost.status).toBe(405);
    expect(resPost.headers.get('Allow')).toBe('GET, OPTIONS');

    const reqDelete = new Request('https://api.example.com/api/v1/categories', { method: 'DELETE' });
    const resDelete = await handleRequest(reqDelete);
    expect(resDelete.status).toBe(405);
    expect(resDelete.headers.get('Allow')).toBe('GET, OPTIONS');
  });

  it('Route inconnue retourne 404 Not Found', async () => {
    const req = new Request('https://api.example.com/api/v1/unknown');
    const res = await handleRequest(req);

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/v1/events/:id avec un UUID invalide retourne 400 Validation Error sans toucher à la DB', async () => {
    const req = new Request('https://api.example.com/api/v1/events/invalid-uuid-123');
    const res = await handleRequest(req);

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('format UUID attendu');
  });
});
