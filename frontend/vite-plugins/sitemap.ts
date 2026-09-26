import type { Plugin } from 'vite';
import { EventListResponseSchema } from '@leblanc/shared';
import { SUPPORTED_LANGUAGES } from '../src/i18n/languages';
import { buildLocalizedPath, type RouteSection } from '../src/routes/routeMapping';

export const SITEMAP_WARNING =
  'Sitemap généré sans les fiches événements (API indisponible). Rebuild recommandé.';
const MAIN_SECTIONS: RouteSection[] = ['home', 'list', 'map', 'about'];
const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );

export async function generateSitemap(
  siteUrl: string,
  apiUrl: string,
  fetcher: typeof fetch = fetch,
) {
  const site = siteUrl.replace(/\/+$/, '');
  const urls = SUPPORTED_LANGUAGES.flatMap((lang) =>
    MAIN_SECTIONS.map((section) => `${site}${buildLocalizedPath(section, lang)}`),
  );
  const ids = new Set<string>();
  let partial = false;
  try {
    const base = new URL(apiUrl || '/api', `${site}/`).href.replace(/\/+$/, '');
    const cursors = new Set<string>();
    const signal = AbortSignal.timeout(30_000);
    let cursor: string | null = null;
    do {
      const endpoint = new URL(`${base}/v1/events`);
      endpoint.searchParams.set('lang', 'fr');
      endpoint.searchParams.set('limit', '50');
      // V1 : conserver la fenêtre de l'API, de maintenant à J+90.
      if (cursor) endpoint.searchParams.set('cursor', cursor);
      const response = await fetcher(endpoint, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API HTTP ${response.status}`);
      const page = EventListResponseSchema.parse(await response.json());
      page.items.forEach((event) => ids.add(event.id));
      cursor = page.nextCursor;
      if (cursor) {
        if (cursors.has(cursor) || cursors.size >= 1000) throw new Error('Pagination invalide');
        cursors.add(cursor);
      }
    } while (cursor);
  } catch {
    partial = true;
    ids.clear(); // Une panne en cours de pagination revient aussi aux 24 pages principales.
  }
  for (const id of [...ids].sort()) {
    for (const lang of SUPPORTED_LANGUAGES)
      urls.push(`${site}${buildLocalizedPath('events', lang, id)}`);
  }
  return {
    partial,
    count: urls.length,
    xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}\n</urlset>\n`,
    robots: `User-agent: *\nAllow: /\nDisallow: /admin\n${SUPPORTED_LANGUAGES.map((lang) => `Disallow: /${lang}/admin`).join('\n')}\n\nSitemap: ${site}/sitemap.xml\n`,
  };
}

export function sitemapPlugin(siteUrl: string, apiUrl: string): Plugin {
  return {
    name: 'leblanc-sitemap',
    apply: 'build',
    async generateBundle() {
      const result = await generateSitemap(siteUrl, apiUrl);
      if (result.partial) this.warn(SITEMAP_WARNING);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: result.xml });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: result.robots });
    },
  };
}
