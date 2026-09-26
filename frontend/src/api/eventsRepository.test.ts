import { describe, it, expect } from 'vitest';
import { MockEventsRepository } from './eventsRepository';

describe('MockEventsRepository', () => {
  const repository = new MockEventsRepository();

  it('exclut les tarifs inconnus des filtres gratuit et payant', async () => {
    const first = (await repository.listEvents({ lang: 'fr', limit: 1 })).items[0]!;
    const prices = new MockEventsRepository([
      { ...first, id: 'e1000000-0000-4000-8000-000000000001', isFree: true },
      { ...first, id: 'e1000000-0000-4000-8000-000000000002', isFree: false },
      { ...first, id: 'e1000000-0000-4000-8000-000000000003', isFree: null },
    ]);
    expect((await prices.listEvents({ lang: 'fr' })).items).toHaveLength(3);
    for (const isFree of [true, false]) {
      const result = await prices.listEvents({ lang: 'fr', isFree });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.isFree).toBe(isFree);
    }
  });

  it('gère une page pleine avec 20 items et nextCursor non null (NB2)', async () => {
    const response = await repository.listEvents({
      lang: 'fr',
      limit: 20,
    });

    expect(response.items).toHaveLength(20);
    expect(response.nextCursor).not.toBeNull();
    expect(typeof response.nextCursor).toBe('string');
    // Le mock a 25 événements bruts, dont 1 au-delà de 20 km (Mézières-en-Brenne à 20.4 km)
    // Avec le rayon par défaut de 20 km, le total d'événements dans le périmètre est 24
    expect(response.total).toBe(24);
  });

  it('gère la dernière page avec moins de 20 items et nextCursor null (NB2)', async () => {
    // 1ère page de 20
    const firstPage = await repository.listEvents({
      lang: 'fr',
      limit: 20,
    });
    expect(firstPage.nextCursor).not.toBeNull();

    // 2ème page via curseur (24 total - 20 = 4 sur la dernière page)
    const secondPage = await repository.listEvents({
      lang: 'fr',
      limit: 20,
      cursor: firstPage.nextCursor!,
    });

    expect(secondPage.items).toHaveLength(4);
    expect(secondPage.nextCursor).toBeNull();

    // Vérifier l'absence de doublons entre les deux pages
    const firstIds = new Set(firstPage.items.map((e) => e.id));
    for (const item of secondPage.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
  });

  it('gère le cas aucun résultat avec 0 items et nextCursor null (NB2)', async () => {
    const response = await repository.listEvents({
      lang: 'fr',
      // Recherche avec dates futures très lointaines
      from: '2099-01-01T00:00:00+01:00',
    });

    expect(response.items).toHaveLength(0);
    expect(response.nextCursor).toBeNull();
    expect(response.total).toBe(0);
  });

  it('gère les filtres combinés (catégorie + gratuité + distance) (NB2)', async () => {
    const response = await repository.listEvents({
      lang: 'fr',
      categories: ['culture'],
      isFree: true,
      maxDistance: 10000, // 10 km max
    });

    expect(response.items.length).toBeGreaterThan(0);
    for (const item of response.items) {
      expect(item.category).toBe('culture');
      expect(item.isFree).toBe(true);
      expect(item.distance).toBeLessThanOrEqual(10000);
    }
  });

  it('applique le rayon de 20 km par défaut et exclut les événements hors périmètre (Correction 1)', async () => {
    // Requête sans filtre de distance explicite
    const response = await repository.listEvents({
      lang: 'fr',
      limit: 50,
    });

    expect(response.total).toBe(24);
    // L'événement 17 (Mézières-en-Brenne à 20.41 km) doit être exclu
    const hasEventOutsideRadius = response.items.some(
      (e) => e.id === 'e1000000-0000-4000-8000-000000000017',
    );
    expect(hasEventOutsideRadius).toBe(false);

    // Tous les événements retournés doivent respecter distance <= 20 000 m
    for (const item of response.items) {
      expect(item.distance).toBeLessThanOrEqual(20000);
    }
  });

  it('interprète le filtre "to" au format YYYY-MM-DD en fin de journée (Correction 2)', async () => {
    // L'événement 1 a lieu le 2026-10-03 à 08:30:00+02:00
    // Un filtre "to: 2026-10-03" doit inclure cette journée jusqu'à 23:59:59.999
    const responseIncluded = await repository.listEvents({
      lang: 'fr',
      to: '2026-10-03',
    });
    const foundEvent1 = responseIncluded.items.some(
      (e) => e.id === 'e1000000-0000-4000-8000-000000000001',
    );
    expect(foundEvent1).toBe(true);

    // Alors qu'un filtre "to: 2026-10-02" doit l'exclure
    const responseExcluded = await repository.listEvents({
      lang: 'fr',
      to: '2026-10-02',
    });
    const notFoundEvent1 = responseExcluded.items.some(
      (e) => e.id === 'e1000000-0000-4000-8000-000000000001',
    );
    expect(notFoundEvent1).toBe(false);
  });

  it('lève une exception explicite pour un curseur invalide ou malformé (Correction 3b)', async () => {
    // Base64 malformée
    await expect(
      repository.listEvents({
        lang: 'fr',
        cursor: 'invalid-base64!',
      }),
    ).rejects.toThrow(/Invalid cursor/);

    // JSON valide mais structure non conforme au schéma { d, i }
    const badJsonCursor = Buffer.from(JSON.stringify({ notAValidCursor: true })).toString('base64');
    await expect(
      repository.listEvents({
        lang: 'fr',
        cursor: badJsonCursor,
      }),
    ).rejects.toThrow(/Invalid cursor/);
  });

  it('expose les méthodes de listage listCategories et listCities (Correction 3a)', async () => {
    const categories = await repository.listCategories();
    expect(categories).toContain('culture');
    expect(categories).toContain('sport');
    expect(categories.length).toBeGreaterThan(0);

    const cities = await repository.listCities();
    expect(cities).toContain('Le Blanc');
    expect(cities).toContain('Rosnay');
    // Vérifier l'ordre alphabétique
    const sorted = [...cities].sort();
    expect(cities).toEqual(sorted);
  });

  it('garantit un tri stable et déterministe (startDate croissante puis id)', async () => {
    const response = await repository.listEvents({
      lang: 'fr',
      limit: 25,
    });

    for (let i = 0; i < response.items.length - 1; i++) {
      const current = response.items[i]!;
      const next = response.items[i + 1]!;

      const currentTime = new Date(current.startDate).getTime();
      const nextTime = new Date(next.startDate).getTime();

      if (currentTime === nextTime) {
        expect(current.id.localeCompare(next.id)).toBeLessThan(0);
      } else {
        expect(currentTime).toBeLessThan(nextTime);
      }
    }
  });

  it('getEventById résout correctement le contenu multilingue et calcule la distance', async () => {
    // Événement multi-langue présent dans le mock (2ème événement par ex.)
    const eventEn = await repository.getEventById('e1000000-0000-4000-8000-000000000002', 'en');
    expect(eventEn).not.toBeNull();
    expect(eventEn?.contentLanguage).toBe('en');
    expect(eventEn?.isFallback).toBe(false);
    expect(eventEn?.distance).toBeDefined();

    // Repli sur le français pour une langue absente (événement 4 qui a fr/en/de, pas nl)
    const eventEs = await repository.getEventById(
      'e1000000-0000-4000-8000-000000000004',
      'nl',
    );
    expect(eventEs).not.toBeNull();
    expect(eventEs?.contentLanguage).toBe('fr');
    expect(eventEs?.isFallback).toBe(true);
  });

  it('getEventById retourne null pour un ID inexistant', async () => {
    const result = await repository.getEventById('00000000-0000-0000-0000-000000000000', 'fr');
    expect(result).toBeNull();
  });
});
