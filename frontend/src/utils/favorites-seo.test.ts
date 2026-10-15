import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { buildLocalizedPath, resolveRoute, type SupportedLanguage } from '@leblanc/shared';
import { planPage, type PlanDeps } from '../../functions/lib/page-plan';
import { generateSitemap } from '../../vite-plugins/sitemap';

const LOCALES = join(__dirname, '../../public/locales');
const locale = (lang: SupportedLanguage, namespace: string) =>
  JSON.parse(readFileSync(join(LOCALES, lang, `${namespace}.json`), 'utf8')) as Record<string, unknown>;
const deps = (): PlanDeps => ({
  siteUrl: 'https://leblanc-et-moi.fr',
  loadLocale: (lang, namespace) => Promise.resolve(locale(lang, namespace)),
  fetchApi: vi.fn(() => Promise.reject(new Error('aucun appel API attendu'))),
});

const PATHS: Record<SupportedLanguage, string> = {
  fr: '/fr/favoris', en: '/en/favorites', es: '/es/favoritos', de: '/de/favoriten', it: '/it/preferiti', nl: '/nl/favorieten',
};

describe('page « Mes favoris » : routage et SEO', () => {
  it('a un chemin localisé dans les 6 langues', () => {
    for (const [lang, path] of Object.entries(PATHS) as [SupportedLanguage, string][]) {
      expect(buildLocalizedPath('favorites', lang)).toBe(path);
      expect(resolveRoute(path)).toEqual({ lang, section: 'favorites' });
    }
    expect(resolveRoute('/fr/favoris/extra').section).toBe('notFound');
  });

  it('est servie en 200, noindex, sans canonical, og:url, hreflang ni fil d’Ariane', async () => {
    for (const [lang, path] of Object.entries(PATHS) as [SupportedLanguage, string][]) {
      const plan = await planPage(path, deps());
      expect(plan?.status, path).toBe(200);
      expect(plan?.head.title).toBe((locale(lang, 'seo').favorites as { title: string }).title);
      const html = plan?.head.tagsHtml ?? '';
      expect(html).toContain('name="robots" content="noindex, follow"');
      expect(html).not.toContain('rel="canonical"');
      expect(html).not.toContain('og:url');
      expect(html).not.toContain('hreflang');
      expect(html).not.toContain('BreadcrumbList');
    }
  });

  it('ne retire la canonical d’aucune autre page', async () => {
    for (const path of ['/fr', '/fr/liste', '/en/map', '/fr/confidentialite', '/fr/page-inconnue']) {
      const html = (await planPage(path, deps()))?.head.tagsHtml ?? '';
      expect(html, path).toContain('rel="canonical"');
      expect(html, path).toContain('og:url');
    }
  });

  it('reste absente du sitemap', async () => {
    const now = new Date().toISOString();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, generatedAt: now }))
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, generatedAt: now }))
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, attributions: [], generatedAt: now }));
    const { xml } = await generateSitemap('https://leblanc-et-moi.fr', '/api', fetcher);
    for (const path of Object.values(PATHS)) expect(xml).not.toContain(path);
    expect(xml).toContain('/fr/confidentialite');
  });
});
