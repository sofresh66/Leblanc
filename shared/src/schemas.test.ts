import { describe, it, expect } from 'vitest';
import {
  RawEventSchema,
  EventSchema,
  calculateHaversineDistance,
  resolveEventContent,
  resolveI18nField,
  LE_BLANC_CENTER,
  type RawEvent,
} from './index';

describe('Shared Schemas & Utils', () => {
  const validRawEvent: RawEvent = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    title_i18n: {
      fr: 'Marché hebdomadaire du Blanc',
      en: 'Weekly Market of Le Blanc',
      de: 'Wöchentlicher Markt in Le Blanc',
    },
    description_i18n: {
      fr: 'Découvrez les producteurs locaux au cœur du Blanc.',
      en: 'Discover local producers in the heart of Le Blanc.',
    },
    category: 'fete',
    startDate: '2026-10-15T08:00:00+02:00',
    endDate: '2026-10-15T13:00:00+02:00',
    timezone: 'Europe/Paris',
    venueName: 'Place du Marché',
    address: 'Place du Marché',
    postalCode: '36300',
    city: 'Le Blanc',
    latitude: 46.6335,
    longitude: 1.0622,
    imageUrl: 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e',
    isFree: true,
    priceMin: null,
    currency: 'EUR',
    publicUrl: 'https://www.leblanc.fr',
    source: 'Ville du Blanc',
  };

  it('valide un RawEvent conforme', () => {
    const parsed = RawEventSchema.safeParse(validRawEvent);
    expect(parsed.success).toBe(true);
  });

  it('rejette un RawEvent avec un id non-UUID ou sans titre français', () => {
    const invalidId = { ...validRawEvent, id: 'invalid-id' };
    expect(RawEventSchema.safeParse(invalidId).success).toBe(false);

    const invalidTitle = { ...validRawEvent, title_i18n: { fr: '' } };
    expect(RawEventSchema.safeParse(invalidTitle).success).toBe(false);
  });

  it('valide un Event résolu avec distance et métadonnées de langue', () => {
    const resolvedEvent = {
      ...validRawEvent,
      title: 'Marché hebdomadaire du Blanc',
      description: 'Découvrez les producteurs locaux au cœur du Blanc.',
      contentLanguage: 'fr' as const,
      isFallback: false,
      distance: 0,
    };

    const parsed = EventSchema.safeParse(resolvedEvent);
    expect(parsed.success).toBe(true);
  });

  describe('calculateHaversineDistance', () => {
    it('calcule une distance nulle pour le même point', () => {
      const dist = calculateHaversineDistance(
        LE_BLANC_CENTER.lat,
        LE_BLANC_CENTER.lng,
        LE_BLANC_CENTER.lat,
        LE_BLANC_CENTER.lng,
      );
      expect(dist).toBe(0);
    });

    it('calcule une distance réaliste pour un point proche (Chauvigny ~35km)', () => {
      // Chauvigny approx lat 46.568, lng 0.648
      const dist = calculateHaversineDistance(46.6335, 1.0622, 46.568, 0.648);
      // La distance est d'environ 32-35 km (32000m - 35000m)
      expect(dist).toBeGreaterThan(30000);
      expect(dist).toBeLessThan(40000);
    });
  });

  describe('resolveI18nField', () => {
    it('renvoie la valeur nettoyée des espaces de bord', () => {
      expect(resolveI18nField({ fr: '  Titre FR \n', de: ' Titel DE  ' }, 'de'))
        .toEqual({ value: 'Titel DE', language: 'de' });
      expect(resolveI18nField({ fr: '  Titre FR ' }, 'it'))
        .toEqual({ value: 'Titre FR', language: 'fr' });
    });

    it('normalise une langue régionale avant le tiret', () => {
      expect(resolveI18nField({ fr: 'Titre FR', de: 'Titel DE' }, 'de-DE'))
        .toEqual({ value: 'Titel DE', language: 'de' });
      expect(resolveI18nField({ fr: 'Titre FR', en: 'Title EN' }, 'EN-gb'))
        .toEqual({ value: 'Title EN', language: 'en' });
      expect(resolveEventContent({ title_i18n: { fr: 'Titre FR', de: 'Titel DE' }, description_i18n: { fr: '' } }, 'de-DE'))
        .toMatchObject({ title: 'Titel DE', contentLanguage: 'de', isFallback: false });
    });

    it('suit l’ordre de repli fourni puis renvoie une chaîne vide en français', () => {
      expect(resolveI18nField({ en: 'Name', de: 'Name DE' }, 'nl', ['fr', 'de', 'en']))
        .toEqual({ value: 'Name DE', language: 'de' });
      expect(resolveI18nField({ fr: ' ' }, 'fr')).toEqual({ value: '', language: 'fr' });
    });
  });

  describe('resolveEventContent (repli en cascade)', () => {
    it.each(['en', 'es', 'de', 'it', 'nl'])('préserve la description %s sans titre traduit, sans signaler de repli', (lang) => {
      expect(resolveEventContent({
        title_i18n: { fr: 'Titre FR' },
        description_i18n: { fr: 'Desc FR', [lang]: 'Translated description' },
      }, lang)).toEqual({
        title: 'Titre FR', description: 'Translated description',
        contentLanguage: 'fr', descriptionLanguage: lang, isFallback: false,
      });
    });

    it('garde le titre anglais et signale le repli de la description', () => {
      expect(resolveEventContent({
        title_i18n: { fr: 'Titre FR', en: 'Title EN' },
        description_i18n: { fr: 'Desc FR' },
      }, 'en')).toEqual({
        title: 'Title EN', description: 'Desc FR',
        contentLanguage: 'en', descriptionLanguage: 'fr', isFallback: true,
      });
    });

    it('se replie entièrement sur le français sans aucune traduction', () => {
      expect(resolveEventContent({
        title_i18n: { fr: 'Titre FR' }, description_i18n: { fr: 'Desc FR' },
      }, 'en')).toEqual({
        title: 'Titre FR', description: 'Desc FR',
        contentLanguage: 'fr', descriptionLanguage: 'fr', isFallback: true,
      });
    });

    it('ignore les traductions vides et résout chaque première langue disponible', () => {
      expect(resolveEventContent({
        title_i18n: { fr: '', en: ' ', nl: 'Titel NL' },
        description_i18n: { fr: '', en: '', de: 'Beschreibung DE' },
      }, 'EN')).toEqual({
        title: 'Titel NL', description: 'Beschreibung DE',
        contentLanguage: 'nl', descriptionLanguage: 'de', isFallback: true,
      });
    });

    it('normalise la langue et retourne une description vide sans en inventer', () => {
      expect(resolveEventContent({
        title_i18n: { fr: 'Titre FR', en: 'Title EN' }, description_i18n: { fr: '' },
      }, 'EN')).toEqual({
        title: 'Title EN', description: '',
        contentLanguage: 'en', descriptionLanguage: 'fr', isFallback: false,
      });
    });

    it('se replie sur le français pour une langue non prise en charge', () => {
      const result = resolveEventContent({
        title_i18n: { fr: 'Titre FR' }, description_i18n: { fr: 'Desc FR' },
      }, 'constructor');
      expect(result.descriptionLanguage).toBe('fr');
      expect(result.title).toBe('Titre FR');
    });

    const multiLang = {
      title_i18n: {
        fr: 'Titre FR',
        en: 'Title EN',
        de: 'Titel DE',
      },
      description_i18n: {
        fr: 'Desc FR',
        en: 'Desc EN',
      },
    };

    it('retourne la langue demandée si disponible', () => {
      const res = resolveEventContent(multiLang, 'en');
      expect(res.title).toBe('Title EN');
      expect(res.description).toBe('Desc EN');
      expect(res.contentLanguage).toBe('en');
      expect(res.isFallback).toBe(false);
    });

    it('se replie sur le français si la langue demandée est absente', () => {
      const res = resolveEventContent(multiLang, 'es');
      expect(res.title).toBe('Titre FR');
      expect(res.description).toBe('Desc FR');
      expect(res.contentLanguage).toBe('fr');
      expect(res.isFallback).toBe(true);
    });

    it('se replie sur la première langue disponible si le français est vide', () => {
      const onlyNl = {
        title_i18n: { fr: '', nl: 'Titel NL' },
        description_i18n: { fr: '', nl: 'Beschrijving NL' },
      };
      const res = resolveEventContent(onlyNl, 'es');
      expect(res.title).toBe('Titel NL');
      expect(res.contentLanguage).toBe('nl');
      expect(res.isFallback).toBe(true);
    });
  });
});
