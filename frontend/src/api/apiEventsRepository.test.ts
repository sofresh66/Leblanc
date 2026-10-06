import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockEventsRepository } from './eventsRepository';
import { ApiEventsRepository } from './apiEventsRepository';

afterEach(() => vi.unstubAllGlobals());

describe('ApiEventsRepository : traductions indépendantes', () => {
  it('corrige une ancienne réponse Worker pour la liste et la fiche', async () => {
    const mock = new MockEventsRepository();
    const first = (await mock.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const detail = (await mock.getEventById(first.id, 'fr'))!;
    const legacy = {
      ...detail,
      title_i18n: { fr: 'Titre FR' },
      description_i18n: { fr: 'Description FR', en: 'English description' },
      title: 'Titre FR', description: 'Description FR',
      contentLanguage: 'fr', descriptionLanguage: undefined, isFallback: true,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [legacy], nextCursor: null, generatedAt: new Date().toISOString(),
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify(legacy)));
    vi.stubGlobal('fetch', fetchMock);
    const repository = new ApiEventsRepository();
    const list = await repository.listEvents({ lang: 'en' });
    const event = await repository.getEventById(first.id, 'en');
    for (const result of [list.items[0], event]) {
      expect(result).toMatchObject({
        title: 'Titre FR', description: 'English description',
        contentLanguage: 'fr', descriptionLanguage: 'en', isFallback: false,
      });
    }
  });
});
