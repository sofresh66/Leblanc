import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { manualPlaceContent } from '../lib/manual-place-content.mjs';

describe('Descriptions publiques des lieux manuels', () => {
  it('conserve les notes internes seulement dans raw_excerpt', () => {
    const item = { precision: 'Doublon possible ; enseigne à vérifier.' };
    expect(manualPlaceContent(item)).toEqual({ description_i18n: {}, raw_excerpt: item });
  });

  it('garde aussi les informations pratiques en interne en attendant des descriptions rédigées', () => {
    const item = {
      precision: 'À confirmer : horaires contradictoires.',
      descriptionPublique: ' Réservation conseillée. ',
    };
    expect(manualPlaceContent(item)).toEqual({
      description_i18n: {}, raw_excerpt: item,
    });
  });

  it('ne publie pas une description vide', () => {
    expect(manualPlaceContent({ precision: 'Note', descriptionPublique: ' ' }).description_i18n)
      .toEqual({});
  });

  it('ne publie aucune note des 56 lieux et les conserve intégralement', () => {
    const items = JSON.parse(fs.readFileSync(new URL('../../data/restaurants-manuel.json', import.meta.url), 'utf8'));
    const publicDescriptions = items.map(manualPlaceContent).map((item) => item.description_i18n.fr).filter(Boolean);
    expect(items).toHaveLength(56);
    expect(publicDescriptions).toEqual([]);
    for (const item of items) expect(manualPlaceContent(item).raw_excerpt.precision).toBe(item.precision);
  });
});
