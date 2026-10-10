import { describe, expect, it } from 'vitest';
import { hasEncodingDefect, manualTranslationIssues } from '../lib/producer-report.mjs';
import { indexOverrides } from '../lib/translation-validator.mjs';

describe('Signalement aux producteurs : motifs relevés à la main', () => {
  const overrides = indexOverrides([
    { source: 'datatourisme', externalId: 'n7', lang: 'en', status: 'rejected', reason: 'cross_record_translation', note: 'titre de la n°40' },
    { source: 'datatourisme', externalId: 'autre', lang: 'de', status: 'rejected', reason: 'cross_record_translation' },
    { source: 'datatourisme', externalId: 'n7', lang: 'de', status: 'rejected', reason: 'machine_quality' },
    { source: 'datatourisme', externalId: 'musique', lang: 'nl', status: 'rejected', reason: 'cross_record_translation' },
    { source: 'datatourisme', externalId: 'musique', lang: 'de', status: 'rejected', reason: 'cross_record_translation' },
  ]);

  it('reprend les traductions d’une autre fiche, avec le texte fautif', () => {
    expect(manualTranslationIssues({ source: 'datatourisme', externalId: 'n7',
      titleI18n: { fr: 'Balade à pied n°7 - Étangs, forêts et buttons', en: 'Walk n ° 40 - History of Brenne' } }, overrides))
      .toEqual([{ motif: 'traduction d’une autre fiche, relevée à la main (en)', extrait: 'Walk n ° 40 - History of Brenne' }]);
    expect(manualTranslationIssues({ source: 'datatourisme', externalId: 'sans-override', titleI18n: {} }, overrides)).toEqual([]);
    // Une ligne par fiche, langues regroupées.
    expect(manualTranslationIssues({ source: 'datatourisme', externalId: 'musique', titleI18n: { de: 'Andere Ausstellung' } }, overrides))
      .toEqual([{ motif: 'traduction d’une autre fiche, relevée à la main (de, nl)', extrait: 'Andere Ausstellung' }]);
  });

  it('détecte un texte mal encodé sans signaler les caractères accentués normaux', () => {
    expect(hasEncodingDefect('Â©Hellio-Van Ingen')).toBe(true);
    expect(hasEncodingDefect('Ã©tangs de Brenne')).toBe(true);
    expect(hasEncodingDefect('© Hellio et Van Ingen')).toBe(false);
    expect(hasEncodingDefect('Élise Énique – Châteauroux')).toBe(false);
    expect(hasEncodingDefect(null)).toBe(false);
  });
});
