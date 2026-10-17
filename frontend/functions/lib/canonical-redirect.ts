import { securityHeaders } from '@leblanc/shared';

/** Domaine canonique : cible fixe, jamais tirée d'un en-tête fourni par le client. */
export const CANONICAL_ORIGIN = 'https://leblanc-et-moi.fr';

// Égalité stricte sur le nom d'hôte : les aperçus <hash>.leblanc-et-moi.pages.dev,
// les alias *-preview et tout hôte voisin (evil-leblanc-et-moi.pages.dev) restent servis.
const REDIRECTED_HOSTS = new Set(['www.leblanc-et-moi.fr', 'leblanc-et-moi.pages.dev']);

/**
 * Redirection vers le domaine canonique, chemin et query tels que reçus :
 * 301 pour GET et HEAD, 308 sinon (la méthode est conservée). null : rien à faire.
 */
export function canonicalRedirect(request: Request, apiOrigin: string): Response | null {
  const url = new URL(request.url);
  if (!REDIRECTED_HOSTS.has(url.hostname.toLowerCase())) return null;

  // Découpe de l'URL brute plutôt que pathname + search : aucune renormalisation.
  const pathStart = request.url.indexOf('/', request.url.indexOf('//') + 2);
  const location = CANONICAL_ORIGIN + (pathStart === -1 ? '/' : request.url.slice(pathStart));
  const status = request.method === 'GET' || request.method === 'HEAD' ? 301 : 308;

  const headers = new Headers(securityHeaders(apiOrigin));
  headers.set('Location', location);
  headers.set('Cache-Control', 'public, max-age=3600');
  return new Response(null, { status, headers });
}
