import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  assertPublicDescriptionClean, findInternalNoteMarkers, warnOnInternalNoteMarkers,
} from '../lib/public-description-guard.mjs';
import { manualPlaceContent } from '../lib/manual-place-content.mjs';
import { upsertPlace } from '../lib/places-store.mjs';
import { upsertOsmPlace } from '../lib/osm-places-store.mjs';

const seed = JSON.parse(fs.readFileSync(new URL('../../data/restaurants-manuel.json', import.meta.url), 'utf8'));

describe('Garde des descriptions publiques', () => {
  it.each([
    ['Adresse et horaires À CONFIRMER.', 'a confirmer'],
    ['Le site présente deux horaires contradictoires ; Verifier.', 'verifier'],
    ['Doublon possible avec La Dublancoise.', 'doublon'],
    ['Absent de la liste Destination Brenne d’août 2026.', 'absent de la liste'],
  ])('détecte « %s » sans tenir compte de la casse ni des accents', (text, marker) => {
    expect(findInternalNoteMarkers({ fr: 'Cuisine locale', de: text })).toEqual([{ lang: 'de', marker }]);
    expect(() => assertPublicDescriptionClean({ de: text }, 'test:1')).toThrow(/test:1/);
  });

  it('accepte une vraie description et une description vide', () => {
    expect(() => assertPublicDescriptionClean({ fr: 'Cuisine traditionnelle et terrasse au bord de la Creuse.' }, 'ok')).not.toThrow();
    expect(() => assertPublicDescriptionClean({}, 'vide')).not.toThrow();
    expect(() => assertPublicDescriptionClean(undefined, 'absent')).not.toThrow();
  });

  it('ne recopie pas le texte de la note dans le message d’erreur', () => {
    expect(() => assertPublicDescriptionClean({ fr: 'Doublon possible avec un concurrent secret.' }, 'x'))
      .toThrow(expect.objectContaining({ message: expect.not.stringContaining('concurrent secret') }));
  });

  it('fait échouer un seed piégé qui publierait les notes de précision', () => {
    const noted = seed.filter((item) => findInternalNoteMarkers({ fr: item.precision }).length > 0);
    expect(noted.length).toBeGreaterThan(0);
    for (const item of noted) {
      expect(() => assertPublicDescriptionClean({ fr: item.precision }, item.externalId)).toThrow();
    }
  });

  it('laisse passer le seed réel tel qu’il est publié', () => {
    for (const item of seed) expect(() => manualPlaceContent(item)).not.toThrow();
  });

  it('importe normalement une description DATAtourisme ou OSM avec un mot-clé et le journalise', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const description = 'Pensez à vérifier les horaires avant de venir.';
    const item = {
      externalId: 'ext-1', sourceUrl: null, sourceUpdatedAt: null, rawExcerpt: {}, openingHours: [],
      place: { title_i18n: { fr: 'La Table' }, description_i18n: { fr: description }, subtypes: [], cuisines: [],
        priceDetails: [] },
    };
    await expect(upsertPlace(client, item)).resolves.toBeDefined();
    await expect(upsertOsmPlace(client, item)).resolves.toMatchObject({ action: 'created' });
    const inserts = client.query.mock.calls.filter(([sql]) => /INSERT INTO places/.test(sql));
    expect(inserts).toHaveLength(2);
    for (const [, params] of inserts) expect(params).toContain(JSON.stringify({ fr: description }));
    const logs = warn.mock.calls.map(([line]) => JSON.parse(line));
    expect(logs).toEqual([
      { step: 'description_marker', context: 'datatourisme_places:ext-1', lang: 'fr', marker: 'verifier' },
      { step: 'description_marker', context: 'openstreetmap:ext-1', lang: 'fr', marker: 'verifier' },
    ]);
    expect(JSON.stringify(logs)).not.toContain('Pensez');
    warn.mockRestore();
  });

  it('ne journalise rien pour une description propre', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(warnOnInternalNoteMarkers({ fr: 'Cuisine locale' }, 'x')).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
