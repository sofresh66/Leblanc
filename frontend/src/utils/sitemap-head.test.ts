import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SupportedLanguage } from '@leblanc/shared';
import { planPage, type PlanDeps } from '../../functions/lib/page-plan';
import { generateSitemap } from '../../vite-plugins/sitemap';
import { MockEventsRepository } from '../api/eventsRepository';
import { placeFixture } from '../components/places/__tests__/fixture';

// Le sitemap (build) et le middleware Pages (<head>) doivent annoncer les mêmes alternates.
const LOCALES = join(__dirname, '../../public/locales');
const locale = (lang: SupportedLanguage, namespace: string) =>
  JSON.parse(readFileSync(join(LOCALES, lang, `${namespace}.json`), 'utf8')) as Record<string, unknown>;
function deps(api: (path: string) => { status: number; body: unknown }): PlanDeps {
  return {
    siteUrl: 'https://leblanc-et-moi.pages.dev',
    loadLocale: (lang, namespace) => Promise.resolve(locale(lang, namespace)),
    fetchApi: (path: string) => Promise.resolve(api(path)),
  };
}

describe('cohérence sitemap ↔ <head> du middleware', () => {
  it('les alternates du sitemap sont exactement les hreflang servis (événement, lieu, parcours, liste)', async () => {
    const repository = new MockEventsRepository();
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const event = (await repository.getEventById(first.id, 'fr'))!;
    const trailId = 'c1000000-0000-4000-8000-000000000001';
    const trail = {
      id: trailId, title: 'Rive gauche, rive droite', contentLanguage: 'fr', modes: ['foot'], isLoop: true,
      distanceM: 11500, durationMin: 180, durationDays: null, start: { lat: 46.63, lng: 1.17 }, startCity: 'Fontgombault',
      distanceFromLeBlancM: 8758, hasTrack: false, imageUrl: null, imageCredit: null, imageLicense: null,
      officialUrl: null, producer: 'Destination Brenne', updatedAt: '2026-01-04T00:00:00.000Z',
      description: 'Une boucle.', descriptionLanguage: 'fr', isFallback: false, startPostalCode: '36220',
      track: null, osmRelationId: null, gpxAvailable: false,
      attributions: [{ source: 'datatourisme', text: 'DATAtourisme', license: 'Licence Ouverte 2.0',
        licenseUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/', url: 'https://www.datatourisme.fr/', producer: null, osmRelationId: null }],
    };
    const site = 'https://leblanc-et-moi.pages.dev';
    const now = new Date().toISOString();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [event], nextCursor: null, generatedAt: now }))
      .mockResolvedValueOnce(Response.json({ items: [placeFixture], nextCursor: null, generatedAt: now }))
      .mockResolvedValueOnce(Response.json({ items: [trail], nextCursor: null, attributions: [], generatedAt: now }));
    const sitemap = await generateSitemap(site, '/api', fetcher);
    expect(sitemap.partial).toBe(false);

    const alternatesOf = (loc: string) => {
      const entry = sitemap.xml.split('\n').find((line) => line.includes(`<loc>${loc}</loc>`)) ?? '';
      return [...entry.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map(([, lang, href]) => `${lang} ${href}`).sort();
    };
    const headOf = async (path: string) => {
      const body = path.includes('/evenements/') || path.includes('/veranstaltungen/') ? event
        : path.includes('/lieux/') || path.includes('/luoghi/') ? placeFixture : trail;
      const plan = await planPage(path, deps(() => ({ status: 200, body })));
      expect(plan?.status, path).toBe(200);
      return [...(plan?.head.tagsHtml ?? '').matchAll(/rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
        .map(([, lang, href]) => `${lang} ${href}`).sort();
    };
    for (const path of [`/fr/evenements/${event.id}`, `/de/veranstaltungen/${event.id}`, `/fr/lieux/${placeFixture.id}`,
      `/it/luoghi/${placeFixture.id}`, `/fr/se-balader/${trailId}`, `/nl/routes/${trailId}`, '/es/rutas', '/fr/se-balader']) {
      const fromSitemap = alternatesOf(`${site}${path}`);
      expect(fromSitemap, path).toHaveLength(7);
      expect(fromSitemap, path).toEqual(await headOf(path));
    }
  });
});
