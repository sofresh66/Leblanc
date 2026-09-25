import { describe, expect, it } from 'vitest';
import { normalizeOpenAgendaEvent } from '../lib/openagenda-normalizer.mjs';

const raw = {
  uid: 123456,
  slug: 'visite-du-chateau',
  title: { fr: 'Visite du château', en: 'Castle visit' },
  description: { fr: 'Découvrez le château.' },
  longDescription: { fr: 'Description détaillée.' },
  conditions: { fr: '6€ individuel, gratuit pour les enfants' },
  updatedAt: '2026-09-20T12:00:00Z',
  status: 1,
  location: {
    name: 'Château',
    address: '1 rue du Château',
    city: 'Le Blanc',
    postalCode: '36300',
    latitude: 46.6333,
    longitude: 1.0833,
  },
  timings: [{ begin: '2026-10-01T14:00:00+02:00', end: '2026-10-01T16:00:00+02:00' }],
  image: { base: 'https://img.openagenda.com/main/', filename: 'event.jpg' },
};
const context = { agendaUid: '54621', agendaSlug: 'jep-2026-centre-val-de-loire', priority: 20 };

describe('normalisation OpenAgenda', () => {
  it('conserve les traductions et convertit les horaires avec offset', () => {
    const item = normalizeOpenAgendaEvent(raw, context);
    expect(item.ok).toBe(true);
    expect(item.externalId).toBe('123456');
    expect(item.event.titleI18n.en).toBe('Castle visit');
    expect(item.event.descriptionI18n.fr).toBe('Description détaillée.');
    expect(item.event.normalizedTitle).toBe('visite du chateau');
    expect(item.occurrences[0].startsAt).toBe('2026-10-01T12:00:00.000Z');
    expect(item.occurrences[0].fingerprint).toMatch(/^openagenda:/);
    expect(item.event.imageUrl).toBe('https://img.openagenda.com/main/event.jpg');
    expect(item.sourceUrl).toContain('/jep-2026-centre-val-de-loire/events/');
  });

  it('utilise le tarif explicite et le défaut gratuit si le prix manque', () => {
    expect(normalizeOpenAgendaEvent(raw, context).event).toMatchObject({
      isFree: false,
      priceMin: 6,
    });
    expect(normalizeOpenAgendaEvent({ ...raw, conditions: {} }, context).event).toMatchObject({
      isFree: true,
      priceMin: null,
    });
    expect(
      normalizeOpenAgendaEvent({ ...raw, conditions: { fr: 'Tarif:8 €' } }, context).event,
    ).toMatchObject({ isFree: false, priceMin: 8 });
  });

  it('refuse les dates sans offset et les lieux sans coordonnées', () => {
    expect(
      normalizeOpenAgendaEvent(
        { ...raw, timings: [{ begin: '2026-10-01T14:00:00', end: '2026-10-01T16:00:00' }] },
        context,
      ).ok,
    ).toBe(false);
    expect(normalizeOpenAgendaEvent({ ...raw, location: {} }, context).ok).toBe(false);
    expect(
      normalizeOpenAgendaEvent({ ...raw, location: { latitude: null, longitude: null } }, context)
        .ok,
    ).toBe(false);
  });

  it('préserve le statut annulé et le fallback français', () => {
    const item = normalizeOpenAgendaEvent(
      { ...raw, title: { en: 'Castle visit' }, status: 6 },
      context,
    );
    expect(item.event.titleI18n.fr).toBe('Castle visit');
    expect(item.event.sourceLanguage).toBe('en');
    expect(item.event.status).toBe('cancelled');
  });
});
