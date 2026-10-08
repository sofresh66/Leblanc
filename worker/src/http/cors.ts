import type { Env } from '../env.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://leblanc-et-moi.pages.dev',
];

/**
 * Récupère la liste des origines autorisées depuis les variables d'environnement.
 */
export function getAllowedOrigins(env?: Env): string[] {
  if (!env?.ALLOWED_ORIGINS) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * Calcule les en-têtes CORS pour une requête donnée.
 */
export function getCorsHeaders(request: Request, env?: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return { Vary: 'Origin' };
  }

  const allowedOrigins = getAllowedOrigins(env);
  if (!allowedOrigins.includes(origin)) {
    return { Vary: 'Origin' };
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
  };
}

/**
 * Gère une requête préliminaire CORS (OPTIONS).
 */
export function handleCorsPreflight(request: Request, env?: Env): Response {
  const corsHeaders = getCorsHeaders(request, env);

  // Si l'origine n'est pas autorisée, on renvoie tout de même 204 sans autorisations CORS
  const headers: Record<string, string> = {
    ...corsHeaders,
    // POST : uniquement pour /api/v1/csp-report (rapports envoyés par le navigateur).
    'Access-Control-Allow-Methods': new URL(request.url).pathname.replace(/\/+$/, '') === '/api/v1/csp-report'
      ? 'POST, OPTIONS'
      : 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
  };

  return new Response(null, {
    status: 204,
    headers,
  });
}
