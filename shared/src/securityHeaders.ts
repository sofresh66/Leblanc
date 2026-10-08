// En-têtes de sécurité des pages HTML. Cloudflare Pages n'applique pas le
// fichier _headers aux réponses d'une Function : le middleware les pose
// lui-même, et frontend/public/_headers reprend les mêmes valeurs pour les
// fichiers statiques servis sans Function (vérifié par un test).

export const API_ORIGIN = 'https://leblanc-api.elharchdenis.workers.dev';
export const CSP_REPORT_PATH = '/api/v1/csp-report';

/**
 * CSP en mode rapport : rien n'est bloqué, les violations sont envoyées à
 * l'API. Hôtes constatés : tuiles OSM (tile.openstreetmap.org, sans
 * sous-domaine), images DATAtourisme (*.media.tourinsoft.eu), Cloudflare Web
 * Analytics (script static.cloudflareinsights.com, envoi cloudflareinsights.com).
 */
export function contentSecurityPolicy(apiOrigin: string = API_ORIGIN): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    // Leaflet et react-helmet-async posent des styles en ligne.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://tile.openstreetmap.org https://*.media.tourinsoft.eu",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin} https://cloudflareinsights.com`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${apiOrigin}${CSP_REPORT_PATH}`,
  ].join('; ');
}

export function securityHeaders(apiOrigin: string = API_ORIGIN): Record<string, string> {
  return {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
    'Content-Security-Policy-Report-Only': contentSecurityPolicy(apiOrigin),
  };
}
