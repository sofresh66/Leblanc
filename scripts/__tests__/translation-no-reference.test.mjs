import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTranslationStatus, resolveEventContent } from '@leblanc/shared';
import { indexAllowlist, indexOverrides, validateTranslations } from '../lib/translation-validator.mjs';
import { reportRows, summarize } from '../lib/translation-report.mjs';

const checkedAt = '2026-10-08T00:00:00.000Z';
const allowlist = indexAllowlist(JSON.parse(fs.readFileSync(new URL('../../data/translation-allowlist.json', import.meta.url), 'utf8')));

// Cas réel : « Moins de voiture, plus d'aventure ! », description française vide,
// traductions d'une autre exposition (baobabs, Pascal Maïtre).
const moinsDeVoiture = {
  externalId: 'ab77bea5-fd24-33ce-a179-1ff53d687b83',
  titleI18n: { fr: 'Moins de voiture, plus d’aventure !', en: 'Less car, more adventure!', de: 'Moins de voiture, plus d’aventure !' },
  descriptionI18n: {
    fr: '',
    en: 'Symbols of strength, baobabs enjoy impressive longevity: the oldest baobab is over 2,000 years old. Photographs by Pascal Maïtre.',
    es: 'Símbolos de fuerza, los baobabs gozan de una longevidad impresionante: el baobab más antiguo tiene más de 2.000 años.',
    de: 'Als Symbole der Stärke erfreuen sich Baobabs einer beeindruckenden Langlebigkeit: Der älteste Baobab ist über 2.000 Jahre alt.',
    it: 'Simboli di forza, i baobab godono di una longevità impressionante: il baobab più antico ha più di 2.000 anni.',
    nl: 'Als symbolen van kracht genieten baobabs van een indrukwekkende levensduur: de oudste baobab is meer dan 2.000 jaar oud.',
  },
};
const validate = (event, options = {}) => validateTranslations(event,
  { source: 'datatourisme', externalId: event.externalId, checkedAt, allowlist, ...options });

describe('Description française absente (no_reference)', () => {
  it('rejette toutes les descriptions traduites ; les titres suivent les règles habituelles', () => {
    const status = validate(moinsDeVoiture);
    for (const lang of ['en', 'es', 'de', 'it', 'nl']) {
      expect(status[lang]).toMatchObject({ status: 'ok', descriptionStatus: 'rejected', reason: 'no_reference' });
    }
    expect(status.en.titleStatus).toBe('ok');
    expect(status.de.titleStatus).toBe('ignored_identical');
  });

  it('ne sert aucune description, quelle que soit la langue demandée', () => {
    const served = applyTranslationStatus(
      { title_i18n: moinsDeVoiture.titleI18n, description_i18n: moinsDeVoiture.descriptionI18n }, validate(moinsDeVoiture));
    expect(served.description_i18n).toEqual({ fr: '' });
    for (const lang of ['fr', 'en', 'es', 'de', 'it', 'nl']) {
      expect(resolveEventContent(served, lang)).toMatchObject({ description: '', isFallback: false });
    }
    // Le titre anglais, lui, reste servi.
    expect(resolveEventContent(served, 'en').title).toBe('Less car, more adventure!');
  });

  it('épargne une fiche de la liste blanche (Marché hebdomadaire)', () => {
    const marche = { ...moinsDeVoiture, externalId: 'a3d459d8-2437-3b91-adb2-065f576fcd5a' };
    const status = validate(marche);
    expect(Object.values(status).every((entry) => entry.descriptionStatus !== 'rejected')).toBe(true);
    const served = applyTranslationStatus({ title_i18n: marche.titleI18n, description_i18n: marche.descriptionI18n }, status);
    expect(resolveEventContent(served, 'en').description).toContain('baobabs');
  });

  it('laisse un override prioritaire (titre et description rejetés)', () => {
    const overrides = indexOverrides([{ source: 'datatourisme', externalId: moinsDeVoiture.externalId, lang: 'en', status: 'rejected', reason: 'manual' }]);
    expect(validate(moinsDeVoiture, { overrides }).en).toMatchObject({ status: 'rejected', reason: 'override:manual' });
  });

  it('n’applique pas la règle quand la description française existe', () => {
    const withFrench = { ...moinsDeVoiture, descriptionI18n: { ...moinsDeVoiture.descriptionI18n, fr: 'Exposition de photographies.' } };
    expect(Object.values(validate(withFrench)).some((entry) => entry.reason === 'no_reference')).toBe(false);
  });

  it('fait apparaître la règle dans le rapport et le résumé', () => {
    const rows = reportRows({ eventId: 'e1', externalId: moinsDeVoiture.externalId, titleFr: moinsDeVoiture.titleI18n.fr }, validate(moinsDeVoiture));
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.reason === 'no_reference' && row.descriptionStatus === 'rejected')).toBe(true);
    expect(summarize(rows)).toMatchObject({ rejected: 0, rejectedDescriptions: 5 });
  });
});
