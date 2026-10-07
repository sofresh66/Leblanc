import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTranslationStatus } from '@leblanc/shared';
import {
  RECORD_MISMATCH, applyRecordMismatch, carryRecordMismatch, contentFingerprint, indexAllowlist, indexOverrides,
  validateTranslations,
} from '../lib/translation-validator.mjs';
import { reportRows } from '../lib/translation-report.mjs';

const checkedAt = '2026-10-08T00:00:00.000Z';
// Cas réel (Destination Brenne) : français correct, traductions d'une autre conférence.
const haies = {
  externalId: '802aecf3-c36d-3d6f-84c6-8792ccc14383',
  titleI18n: { fr: 'Les haies bocagères habitats et autoroutes du vivant' },
  descriptionI18n: {
    fr: 'Paysage emblématique du Berry, le bocage et son réseau de haies jouent un rôle majeur pour la biodiversité.',
    en: 'Do you know La Vache Qui Rit? Then you know Benjamin Rabier! But do you know the man of the theatre?',
    de: 'Kennen Sie La Vache Qui Rit? Dann kennen Sie Benjamin Rabier! Aber kennen Sie auch den Theatermann?',
  },
};
const base = (event, overrides = new Map()) => validateTranslations(event,
  { source: 'datatourisme', externalId: event.externalId, overrides, checkedAt });
const fingerprint = (event) => contentFingerprint(event.titleI18n, event.descriptionI18n);

describe('Rejet de fiche record_mismatch', () => {
  it('calcule une empreinte stable (ordre des clés, espaces) et sensible au contenu', () => {
    const shuffled = { titleI18n: { ...haies.titleI18n }, descriptionI18n: {
      de: `  ${haies.descriptionI18n.de} `, fr: haies.descriptionI18n.fr, en: haies.descriptionI18n.en } };
    expect(fingerprint(shuffled)).toBe(fingerprint(haies));
    const corrected = { ...haies, descriptionI18n: { ...haies.descriptionI18n, en: 'An emblematic Berry landscape, the bocage…' } };
    expect(fingerprint(corrected)).not.toBe(fingerprint(haies));
  });

  it('rejette toutes les langues quand toutes les descriptions traduites sont sous 0,50', () => {
    const decision = applyRecordMismatch(base(haies), {
      scores: [0.39, 0.4], fingerprint: fingerprint(haies), allowlisted: false, checkedAt,
    });
    expect(decision).toMatchObject({ flagged: true, max: 0.4 });
    for (const lang of ['en', 'de']) {
      expect(decision.status[lang]).toMatchObject({ status: 'rejected', reason: RECORD_MISMATCH, score: 0.4, fingerprint: fingerprint(haies) });
    }
    expect(applyTranslationStatus({ title_i18n: haies.titleI18n, description_i18n: haies.descriptionI18n }, decision.status).description_i18n)
      .toEqual({ fr: haies.descriptionI18n.fr });
  });

  it('épargne une fiche de la liste blanche, une fiche avec une langue au-dessus du seuil ou sans score', () => {
    const options = { fingerprint: 'x', checkedAt };
    expect(applyRecordMismatch(base(haies), { ...options, scores: [0.4, 0.41], allowlisted: true }).flagged).toBe(false);
    expect(applyRecordMismatch(base(haies), { ...options, scores: [0.4, 0.52], allowlisted: false }).flagged).toBe(false);
    expect(applyRecordMismatch(base(haies), { ...options, scores: [null], allowlisted: false }).flagged).toBe(false);
  });

  it('garde le motif d’un override déjà rejeté', () => {
    const overrides = indexOverrides([{ source: 'datatourisme', externalId: haies.externalId, lang: 'en', status: 'rejected', reason: 'manual' }]);
    const decision = applyRecordMismatch(base(haies, overrides), { scores: [0.3, 0.3], fingerprint: 'x', allowlisted: false });
    expect(decision.status.en.reason).toBe('override:manual');
    expect(decision.status.de.reason).toBe(RECORD_MISMATCH);
  });

  it('conserve le rejet à l’ingestion tant que le contenu source est inchangé', () => {
    const previous = applyRecordMismatch(base(haies), { scores: [0.39, 0.4], fingerprint: fingerprint(haies), allowlisted: false }).status;
    const carried = carryRecordMismatch(base(haies), previous, fingerprint(haies));
    expect(carried.rescore).toBe(false);
    expect(carried.status.en).toMatchObject({ status: 'rejected', reason: RECORD_MISMATCH, fingerprint: fingerprint(haies) });
  });

  it('lève le rejet et signale « à rescorer » quand la source corrige ses traductions', () => {
    const previous = applyRecordMismatch(base(haies), { scores: [0.39, 0.4], fingerprint: fingerprint(haies), allowlisted: false }).status;
    const corrected = { ...haies, descriptionI18n: { ...haies.descriptionI18n,
      en: 'An emblematic Berry landscape, the bocage and its hedgerows play a major role for biodiversity.' } };
    const carried = carryRecordMismatch(base(corrected), previous, fingerprint(corrected));
    expect(carried.rescore).toBe(true);
    expect(carried.status.en.status).toBe('ok');
    expect(applyTranslationStatus({ title_i18n: corrected.titleI18n, description_i18n: corrected.descriptionI18n }, carried.status)
      .description_i18n.en).toBe(corrected.descriptionI18n.en);
    expect(reportRows({ eventId: 'e1', externalId: haies.externalId, titleFr: haies.titleI18n.fr }, carried.status, { rescore: true })[0])
      .toMatchObject({ lang: '*', reason: 'rescore_needed' });
  });

  it('ne fait rien sans rejet de fiche précédent', () => {
    expect(carryRecordMismatch(base(haies), {}, fingerprint(haies))).toEqual({ status: base(haies), rescore: false });
    expect(carryRecordMismatch(base(haies), null, fingerprint(haies)).rescore).toBe(false);
  });

  it('valide la liste blanche versionnée', () => {
    const allowlist = indexAllowlist(JSON.parse(fs.readFileSync(new URL('../../data/translation-allowlist.json', import.meta.url), 'utf8')));
    expect(allowlist.has('datatourisme|8b068340-34d8-3031-a2fb-32a939fd37ea')).toBe(true);
    expect(allowlist.has('datatourisme|334a1475-e0ad-33fc-956f-2af5efaa4b94')).toBe(true);
    expect(() => indexAllowlist([{ source: 'datatourisme', externalId: 'x', status: 'rejected' }])).toThrow();
  });
});
