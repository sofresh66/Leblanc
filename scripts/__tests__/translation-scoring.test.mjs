import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { indexOverrides, validateTranslations } from '../lib/translation-validator.mjs';
import {
  cosine, createWorkersAiEmbedder, scoreDistribution, scoreTranslations,
} from '../lib/translation-scoring.mjs';

const overrides = indexOverrides(JSON.parse(fs.readFileSync(new URL('../../data/translation-overrides.json', import.meta.url), 'utf8')));

// Embeddings simulés : un vecteur par « sujet » ; aucun appel réseau.
const TOPICS = { musique: [1, 0, 0], pfade: [0, 1, 0], terre: [0, 0, 1], balade: [0.7, 0.7, 0] };
function fakeEmbed(texts) {
  return Promise.resolve(texts.map((text) => {
    const lower = text.toLowerCase();
    if (/musique|musical/.test(lower)) return TOPICS.musique;
    if (/pfade|krieg/.test(lower)) return TOPICS.pfade;
    if (/terre|bauern|ausstellung/.test(lower)) return TOPICS.terre;
    return TOPICS.balade;
  }));
}

const event = (id, externalId, titleI18n, descriptionI18n) => ({
  id, externalId, titleI18n, descriptionI18n,
  translationStatus: validateTranslations({ titleI18n, descriptionI18n }, { source: 'datatourisme', externalId, overrides }),
});

describe('Rapport d’embeddings des traductions', () => {
  it('fait figurer « Musique ! » rejeté par override avec des scores faibles', async () => {
    const musique = event('e1', '5cef2412-77ef-3a0b-8d1c-4eb65eeb7b7a',
      { fr: 'Musique ! Une histoire des pratiques musicales amateurs', de: 'Die Pfade des Hundertjährigen Krieges' },
      { fr: 'Exposition sur les pratiques musicales amateurs.', de: 'Ausstellung über die Bauern im Indre.' });
    const balade = event('e2', 'autre', { fr: 'Balade automnale', en: 'Autumn walk' }, { fr: 'Promenade', en: 'Walk' });
    const embed = vi.fn(fakeEmbed);
    const rows = await scoreTranslations([musique, balade], embed);
    expect(rows).toContainEqual(expect.objectContaining({
      eventId: 'e1', lang: 'de', status: 'rejected', reason: 'override:cross_record_translation', titleScore: 0, descriptionScore: 0,
    }));
    expect(rows).toContainEqual(expect.objectContaining({ eventId: 'e2', lang: 'en', status: 'ok', titleScore: 1 }));
    expect(rows.find((row) => row.eventId === 'e1').translatedStart).toBe('Ausstellung über die Bauern im Indre.');
    const { histogram, belowThreshold } = scoreDistribution(rows);
    expect(histogram).toEqual({ '0.0': 1, '0.9': 1 });
    expect(belowThreshold[0.5].map((row) => row.eventId)).toEqual(['e1']);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('calcule le cosinus et gère un vecteur nul', () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });

  it('appelle l’API REST Workers AI bge-m3 et valide la réponse', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { data: [[0.1, 0.2]] } }) });
    const embed = createWorkersAiEmbedder({ accountId: 'acc', apiToken: 'tok', fetchImpl });
    await expect(embed(['bonjour'])).resolves.toEqual([[0.1, 0.2]]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/baai/bge-m3');
    expect(JSON.parse(init.body)).toEqual({ text: ['bonjour'] });
    const bad = createWorkersAiEmbedder({ accountId: 'acc', apiToken: 'tok',
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { data: [] } }) }) });
    await expect(bad(['x'])).rejects.toThrow('WORKERS_AI_BAD_RESPONSE');
    expect(() => createWorkersAiEmbedder({ accountId: '', apiToken: 'tok' })).toThrow(/requis/);
  });
});
