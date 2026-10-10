import type { Env } from '../env.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://leblanc-et-moi.pages.dev',
];

/**
 * Previews Cloudflare Pages du projet (déploiement de branche ou de commit) :
 * https://<un seul sous-domaine>.leblanc-et-moi.pages.dev, en HTTPS, sans port.
 * Le sous-domaine suit les règles d'un libellé DNS (minuscules, chiffres, tirets
 * internes, 63 caractères au plus). Aucun autre joker n'est accepté.
 */
export const PAGES_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.leblanc-et-moi\.pages\.dev$/;

export function isAllowedOrigin(origin: string, env?: Env): boolean {
  return getAllowedOrigins(env).includes(origin) || PAGES_PREVIEW_ORIGIN.test(origin);
}

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

  if (!isAllowedOrigin(origin, env)) {
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
