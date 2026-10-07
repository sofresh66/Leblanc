import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyTranslationStatus, resolveEventContent } from '@leblanc/shared';
import {
  comparableStatus, detectLanguage, indexOverrides, validateTranslations,
} from '../lib/translation-validator.mjs';
import { reportRows, toCsv } from '../lib/translation-report.mjs';

const overrides = indexOverrides(JSON.parse(fs.readFileSync(new URL('../../data/translation-overrides.json', import.meta.url), 'utf8')));
const checkedAt = '2026-10-08T00:00:00.000Z';

const musique = {
  externalId: '5cef2412-77ef-3a0b-8d1c-4eb65eeb7b7a',
  titleI18n: { fr: 'Musique ! Une histoire des pratiques musicales amateurs', de: 'Die Pfade des Hundertjährigen Krieges' },
  descriptionI18n: {
    fr: 'L’exposition retrace l’histoire des pratiques musicales amateurs dans l’Indre, des fanfares aux chorales, avec des instruments et des archives.',
    de: 'Ausstellung "Le retour à la terre. Architektur im Dorf und Modellbauernhöfe im Indre des 19. Jahrhunderts". Die Ausstellung zeigt, wie die Bauern auf dem Land lebten und wie sich die Höfe mit der Zeit verändert haben.',
  },
};
const validate = (event, options = {}) => validateTranslations(event,
  { source: 'datatourisme', externalId: event.externalId, checkedAt, overrides, ...options });

describe('Validation des traductions DATAtourisme', () => {
  it('rejette « Musique ! » en allemand via l’override, sans forcer le détecteur', () => {
    expect(validate(musique).de).toMatchObject({ status: 'rejected', reason: 'override:cross_record_translation' });
    // La description allemande est bien en allemand : la règle (b) seule ne la rejette pas.
    expect(validate(musique, { overrides: new Map() }).de.status).toBe('ok');
    expect(detectLanguage(musique.descriptionI18n.de)).toBe('de');
  });

  it('applique les overrides avant les règles', () => {
    const map = indexOverrides([{ source: 'datatourisme', externalId: 'x', lang: 'en', status: 'rejected', reason: 'manual' }]);
    const event = { titleI18n: { fr: 'Balade', en: 'Walk' }, descriptionI18n: { fr: 'Texte' } };
    expect(validate(event, { externalId: 'x', overrides: map }).en).toMatchObject({ status: 'rejected', reason: 'override:manual' });
    expect(validate(event, { externalId: 'y', overrides: map }).en.status).toBe('ok');
  });

  it('accepte une traduction correcte sans mot commun avec le français', () => {
    const event = {
      titleI18n: { fr: 'Balade automnale', en: 'Autumn walk' },
      descriptionI18n: {
        fr: 'Une promenade guidée dans les bois de la Brenne pour découvrir les champignons et les couleurs de la saison.',
        en: 'A guided walk through the Brenne woods to discover the mushrooms and the colours of the season, with a local naturalist.',
      },
    };
    expect(validate(event).en).toEqual({ status: 'ok', titleStatus: 'ok', descriptionStatus: 'ok', checkedAt });
  });

  it('ignore un titre identique au français et sert la description allemande valide (Intervillages)', () => {
    const event = {
      titleI18n: { fr: 'Intervillages', de: 'Intervillages', en: 'Intervillages' },
      descriptionI18n: {
        fr: 'Rejoignez une équipe ou formez la vôtre pour vous affronter lors de jeux. Ouvert à tous.',
        de: 'Tretet einem Team bei oder bildet selbst eines, um euch bei Spielen mit anderen zu messen. Für alle zugänglich und mit guter Stimmung für die ganze Familie.',
      },
    };
    const status = validate(event);
    expect(status.de).toMatchObject({ status: 'ok', titleStatus: 'ignored_identical', descriptionStatus: 'ok' });
    const served = applyTranslationStatus({ title_i18n: event.titleI18n, description_i18n: event.descriptionI18n }, status);
    expect(served.title_i18n).toEqual({ fr: 'Intervillages' });
    expect(resolveEventContent(served, 'de')).toMatchObject({
      title: 'Intervillages', contentLanguage: 'fr', descriptionLanguage: 'de', isFallback: false,
    });
  });

  it('rejette titre et description quand la description est dans une autre langue (≥ 15 mots)', () => {
    const event = {
      titleI18n: { fr: 'Soirée choucroute', de: 'Sauerkraut-Abend' },
      descriptionI18n: {
        fr: 'Repas',
        de: 'Le comité des fêtes vous invite à sa soirée choucroute annuelle dans la salle des fêtes, avec un orchestre et une tombola pour tous.',
      },
    };
    expect(validate(event).de).toMatchObject({ status: 'rejected', reason: 'language_mismatch', detected: 'fr' });
    const served = applyTranslationStatus({ title_i18n: event.titleI18n, description_i18n: event.descriptionI18n }, validate(event));
    expect(served).toEqual({ title_i18n: { fr: 'Soirée choucroute' }, description_i18n: { fr: 'Repas' } });
  });

  it('ne teste pas la langue d’une description de moins de 15 mots', () => {
    const event = { titleI18n: { fr: 'Concert' }, descriptionI18n: { fr: 'Concert gratuit', de: 'Concert gratuit à la salle des fêtes ce soir' } };
    expect(validate(event).de.status).toBe('ok');
  });

  it('signale chiffres et noms propres sans jamais changer le statut', () => {
    const event = {
      titleI18n: { fr: 'Randonnée Octobre Rose' },
      descriptionI18n: {
        fr: 'Randonnée de 8 et 12 km au départ de Ciron avec Brenne Nature et la Ligue contre le cancer, inscription 10 euros.',
        en: 'A walk of 5 and 15 km starting from the village with the local association against cancer, registration fee of a few euros for everyone.',
      },
    };
    const entry = validate(event).en;
    expect(entry.status).toBe('ok');
    expect(entry.warnings).toEqual(expect.arrayContaining(['numbers_mismatch', 'proper_nouns_missing']));
  });

  it('traite un statut absent, vide ou illisible comme « ok »', () => {
    const content = { title_i18n: { fr: 'Titre', de: 'Titel' }, description_i18n: { fr: 'Texte', de: 'Text' } };
    for (const status of [undefined, null, {}, 'garbage', { de: { status: 'inconnu' } }, { fr: { status: 'rejected' } }]) {
      expect(applyTranslationStatus(content, status)).toEqual(content);
    }
  });

  it('refuse un override mal formé et compare les statuts sans horodatage ni ordre des clés', () => {
    expect(() => indexOverrides([{ source: 'datatourisme', externalId: 'x', lang: 'fr', status: 'rejected' }])).toThrow();
    expect(() => indexOverrides([{ source: 'datatourisme', externalId: 'x', lang: 'de', status: 'ok' }])).toThrow();
    expect(comparableStatus({ de: { checkedAt: 'a', titleStatus: 'ok', status: 'ok' } }))
      .toBe(comparableStatus({ de: { status: 'ok', titleStatus: 'ok', checkedAt: 'b' } }));
  });

  it('produit un rapport CSV des langues rejetées ou ignorées', () => {
    const rows = reportRows({ eventId: 'e1', externalId: musique.externalId, titleFr: musique.titleI18n.fr }, validate(musique));
    expect(rows).toEqual([expect.objectContaining({ lang: 'de', status: 'rejected', reason: 'override:cross_record_translation' })]);
    expect(toCsv(rows).split('\n')[1]).toContain('"Musique ! Une histoire des pratiques musicales amateurs"'.replace(/"/g, ''));
  });
});
