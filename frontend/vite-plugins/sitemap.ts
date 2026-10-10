import type { Plugin } from 'vite';
import {
  EventListResponseSchema,
  PlaceApiListResponseSchema,
  TRAIL_MODES,
  TrailSummarySchema,
} from '@leblanc/shared';
import { z } from 'zod';
import { SUPPORTED_LANGUAGES } from '../src/i18n/languages';
import { buildLocalizedPath, type RouteSection } from '../src/routes/routeMapping';

export const SITEMAP_WARNING =
  'Sitemap partiel : fiches événements, lieux ou parcours indisponibles via l’API. Rebuild recommandé.';
const MAIN_SECTIONS: RouteSection[] = ['home', 'list', 'map', 'about', 'credits', 'privacy', 'eat', 'walks'];
// Limites du protocole sitemap : 50 000 URL et 50 Mo non compressés par fichier.
export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;
// Liste des parcours : chaque élément est validé seul, un parcours invalide est écarté.
const TrailPageSchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
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
  buildDate: Date = new Date(),
) {
  const site = siteUrl.replace(/\/+$/, '');
  // lastmod : date du build pour les pages fixes, mise à jour du contenu pour les fiches.
  const day = (iso: string) => iso.slice(0, 10);
  // Une page = une section (et un identifiant), déclinée dans les six langues.
  const pages: { section: RouteSection; id?: string; lastmod: string }[] = MAIN_SECTIONS.map((section) => ({
    section, lastmod: day(buildDate.toISOString()),
  }));
  const eventIds = new Map<string, string>();
  const placeIds = new Map<string, string>();
  const walkIds = new Map<string, string>();
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
      page.items.forEach((event) => eventIds.set(event.id, day(event.updatedAt ?? buildDate.toISOString())));
      cursor = page.nextCursor;
      if (cursor) {
        if (cursors.has(cursor) || cursors.size >= 1000) throw new Error('Pagination invalide');
        cursors.add(cursor);
      }
    } while (cursor);
  } catch {
    partial = true;
    eventIds.clear();
  }
  try {
    const base = new URL(apiUrl || '/api', `${site}/`).href.replace(/\/+$/, '');
    const cursors = new Set<string>();
    const signal = AbortSignal.timeout(30_000);
    let cursor: string | null = null;
    do {
      const endpoint = new URL(`${base}/v1/places`);
      endpoint.searchParams.set('lang', 'fr');
      endpoint.searchParams.set('limit', '50');
      if (cursor) endpoint.searchParams.set('cursor', cursor);
      const response = await fetcher(endpoint, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API HTTP ${response.status}`);
      const page = PlaceApiListResponseSchema.parse(await response.json());
      page.items.filter((place) => place.status === 'published')
        .forEach((place) => placeIds.set(place.id, day(place.updatedAt ?? buildDate.toISOString())));
      cursor = page.nextCursor;
      if (cursor) {
        if (cursors.has(cursor) || cursors.size >= 1000) throw new Error('Pagination invalide');
        cursors.add(cursor);
      }
    } while (cursor);
  } catch {
    partial = true;
    placeIds.clear();
  }
  try {
    // Parcours publiés seulement (l'API ne sert jamais un parcours masqué), tous modes.
    const base = new URL(apiUrl || '/api', `${site}/`).href.replace(/\/+$/, '');
    const cursors = new Set<string>();
    const signal = AbortSignal.timeout(30_000);
    let cursor: string | null = null;
    do {
      const endpoint = new URL(`${base}/v1/routes`);
      endpoint.searchParams.set('lang', 'fr');
      endpoint.searchParams.set('limit', '50');
      endpoint.searchParams.set('modes', TRAIL_MODES.join(','));
      if (cursor) endpoint.searchParams.set('cursor', cursor);
      const response = await fetcher(endpoint, { signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`API HTTP ${response.status}`);
      const page = TrailPageSchema.parse(await response.json());
      for (const item of page.items) {
        const trail = TrailSummarySchema.safeParse(item);
        if (trail.success && UUID.test(trail.data.id)) walkIds.set(trail.data.id, day(trail.data.updatedAt));
      }
      cursor = page.nextCursor;
      if (cursor) {
        if (cursors.has(cursor) || cursors.size >= 1000) throw new Error('Pagination invalide');
        cursors.add(cursor);
      }
    } while (cursor);
  } catch {
    partial = true;
    walkIds.clear();
  }
  for (const [section, ids] of [['events', eventIds], ['places', placeIds], ['walks', walkIds]] as const) {
    for (const [id, lastmod] of [...ids].sort(([a], [b]) => a.localeCompare(b))) pages.push({ section, id, lastmod });
  }
  // Chaque URL porte ses alternates : les six langues et x-default (français).
  const urls = pages.flatMap((page) => {
    const alternates = [
      ...SUPPORTED_LANGUAGES.map((lang) => ({ hreflang: lang, href: `${site}${buildLocalizedPath(page.section, lang, page.id)}` })),
      { hreflang: 'x-default', href: `${site}${buildLocalizedPath(page.section, 'fr', page.id)}` },
    ];
    return SUPPORTED_LANGUAGES.map((lang) => ({
      loc: `${site}${buildLocalizedPath(page.section, lang, page.id)}`, lastmod: page.lastmod, alternates,
    }));
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.map((url) =>
    `  <url><loc>${escapeXml(url.loc)}</loc><lastmod>${url.lastmod}</lastmod>${url.alternates.map((alternate) =>
      `<xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${escapeXml(alternate.href)}"/>`).join('')}</url>`).join('\n')}\n</urlset>\n`;
  const bytes = new TextEncoder().encode(xml).length;
  return {
    partial,
    count: urls.length,
    walkCount: walkIds.size,
    bytes,
    // Signal précoce : au-delà de 80 % des limites du protocole, passer à un index de sitemaps.
    nearLimits: urls.length > SITEMAP_MAX_URLS * 0.8 || bytes > SITEMAP_MAX_BYTES * 0.8,
    xml,
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
      if (result.nearLimits) this.warn(`Sitemap proche des limites du protocole (${result.count} URL, ${result.bytes} octets) : prévoir un index de sitemaps.`);
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: result.xml });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: result.robots });
    },
  };
}
