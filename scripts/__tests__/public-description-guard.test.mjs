import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { assertPublicDescriptionClean, findInternalNoteMarkers } from '../lib/public-description-guard.mjs';
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

  it('bloque l’écriture DATAtourisme et OSM avant toute requête SQL', async () => {
    const client = { query: vi.fn() };
    const item = { externalId: 'ext-1', place: { description_i18n: { fr: 'Horaires à vérifier.' } } };
    await expect(upsertPlace(client, item)).rejects.toThrow(/datatourisme_places:ext-1/);
    await expect(upsertOsmPlace(client, item)).rejects.toThrow(/openstreetmap:ext-1/);
    expect(client.query).not.toHaveBeenCalled();
  });
});
