import { describe, expect, it } from 'vitest';
import {
  parseEventListQuery,
  toParisMidnightNextDay,
  toParisStartOfDay,
} from '../validation/query.js';

describe('Validation des paramètres de requête (worker/src/validation/query.ts)', () => {
  it.each(['maxDistance', 'distance'])('refuse %s inférieur à un mètre', (parameter) => {
    expect(() => parseEventListQuery(new URL(`https://example.test/?${parameter}=0.5`))).toThrow();
    expect(parseEventListQuery(new URL(`https://example.test/?${parameter}=1`)).maxDistance).toBe(1);
  });

  it.each([
    ['2026-03-29', '2026-03-28', '2026-03-28T23:00:00.000Z'],
    ['2026-10-25', '2026-10-24', '2026-10-24T22:00:00.000Z'],
  ])('calcule le minuit parisien du %s avant le changement d’heure', (from, to, expected) => {
    expect(toParisStartOfDay(from)).toBe(expected);
    expect(toParisMidnightNextDay(to)).toBe(expected);
  });

  it.each(['2026-02-31', '2026-13-01', '0000-01-01', '03/12/2026'])('rejette la date invalide %s', (date) => {
    for (const parameter of ['from', 'to']) {
      expect(() => parseEventListQuery(new URL(`https://example.test/?${parameter}=${date}`))).toThrow();
    }
  });

  it('distingue une fin de journée exclusive d’un instant ISO inclusif', () => {
    expect(parseEventListQuery(new URL('https://example.test/?to=2026-10-24')).toExclusive).toBe(true);
    expect(parseEventListQuery(new URL('https://example.test/?to=2026-10-24T22:00:00Z')).toExclusive).toBe(false);
  });

  it('rejette un intervalle inversé et un curseur vide', () => {
    expect(() => parseEventListQuery(new URL('https://example.test/?from=2026-10-26&to=2026-10-24'))).toThrow();
    expect(() => parseEventListQuery(new URL('https://example.test/?cursor='))).toThrow();
  });

  it('applique les valeurs par défaut (lang=fr, limit=20)', () => {
    const url = new URL('https://api.example.com/api/v1/events');
    const query = parseEventListQuery(url);

    expect(query.lang).toBe('fr');
    expect(query.limit).toBe(20);
    expect(query.categories).toBeUndefined();
    expect(query.city).toBeUndefined();
    expect(query.isFree).toBeUndefined();
    expect(query.from).toBeUndefined();
    expect(query.to).toBeUndefined();
    expect(query.maxDistance).toBeUndefined();
    expect(query.cursor).toBeUndefined();
  });

  it('valide le paramètre "lang" et rejette les langues non supportées', () => {
    const urlValid = new URL('https://api.example.com/api/v1/events?lang=de');
    expect(parseEventListQuery(urlValid).lang).toBe('de');

    const urlInvalid = new URL('https://api.example.com/api/v1/events?lang=ru');
    expect(() => parseEventListQuery(urlInvalid)).toThrowError(/lang/);
  });

  it('valide rigoureusement "isFree" (CB4a : strict "true" ou "false")', () => {
    const urlTrue = new URL('https://api.example.com/api/v1/events?isFree=true');
    expect(parseEventListQuery(urlTrue).isFree).toBe(true);

    const urlFalse = new URL('https://api.example.com/api/v1/events?isFree=false');
    expect(parseEventListQuery(urlFalse).isFree).toBe(false);

    const urlInvalid1 = new URL('https://api.example.com/api/v1/events?isFree=1');
    expect(() => parseEventListQuery(urlInvalid1)).toThrowError(/isFree/);

    const urlInvalid2 = new URL('https://api.example.com/api/v1/events?isFree=yes');
    expect(() => parseEventListQuery(urlInvalid2)).toThrowError(/isFree/);
  });

  it('valide maxDistance et distance (CB4b : 1 à 20000 m)', () => {
    const urlMaxDist = new URL('https://api.example.com/api/v1/events?maxDistance=15000');
    expect(parseEventListQuery(urlMaxDist).maxDistance).toBe(15000);

    const urlAlias = new URL('https://api.example.com/api/v1/events?distance=5000');
    expect(parseEventListQuery(urlAlias).maxDistance).toBe(5000);

    const urlTooFar = new URL('https://api.example.com/api/v1/events?maxDistance=25000');
    expect(() => parseEventListQuery(urlTooFar)).toThrowError(/maxDistance doit être entre 1 et 20000 mètres/);

    const urlZero = new URL('https://api.example.com/api/v1/events?maxDistance=0');
    expect(() => parseEventListQuery(urlZero)).toThrowError(/maxDistance doit être entre 1 et 20000 mètres/);

    const urlNegative = new URL('https://api.example.com/api/v1/events?maxDistance=-500');
    expect(() => parseEventListQuery(urlNegative)).toThrowError(/maxDistance doit être entre 1 et 20000 mètres/);
  });

  it('valide les catégories uniques, répétées et séparées par des virgules (CB4d)', () => {
    const urlRepeated = new URL('https://api.example.com/api/v1/events?category=sport&category=fete');
    expect(parseEventListQuery(urlRepeated).categories).toEqual(['sport', 'fete']);

    const urlComma = new URL('https://api.example.com/api/v1/events?category=sport,culture');
    expect(parseEventListQuery(urlComma).categories).toEqual(['sport', 'culture']);

    const urlInvalid = new URL('https://api.example.com/api/v1/events?category=inconnue');
    expect(() => parseEventListQuery(urlInvalid)).toThrowError(/Catégorie invalide/);
  });

  it('convertit une date "to" YYYY-MM-DD en minuit le lendemain heure de Paris (CB4c)', () => {
    // Été : UTC+2 -> minuit le 16 juin Paris = 22:00:00Z le 15 juin
    const summerTo = toParisMidnightNextDay('2026-06-15');
    expect(summerTo).toBe('2026-06-15T22:00:00.000Z');

    // Hiver : UTC+1 -> minuit le 16 janvier Paris = 23:00:00Z le 15 janvier
    const winterTo = toParisMidnightNextDay('2026-01-15');
    expect(winterTo).toBe('2026-01-15T23:00:00.000Z');

    // Via query
    const urlToDate = new URL('https://api.example.com/api/v1/events?to=2026-06-15');
    expect(parseEventListQuery(urlToDate).to).toBe('2026-06-15T22:00:00.000Z');

    // Via query ISO direct
    const urlToIso = new URL('https://api.example.com/api/v1/events?to=2026-06-15T18:00:00.000Z');
    expect(parseEventListQuery(urlToIso).to).toBe('2026-06-15T18:00:00.000Z');
  });

  it('convertit une date "from" YYYY-MM-DD en début de journée heure de Paris', () => {
    // Été : UTC+2 -> 00:00:00 le 15 juin Paris = 22:00:00Z le 14 juin
    const summerFrom = toParisStartOfDay('2026-06-15');
    expect(summerFrom).toBe('2026-06-14T22:00:00.000Z');

    // Hiver : UTC+1 -> 00:00:00 le 15 janvier Paris = 23:00:00Z le 14 janvier
    const winterFrom = toParisStartOfDay('2026-01-15');
    expect(winterFrom).toBe('2026-01-14T23:00:00.000Z');
  });

  it('valide le paramètre "limit" (1 à 50)', () => {
    const urlValid = new URL('https://api.example.com/api/v1/events?limit=42');
    expect(parseEventListQuery(urlValid).limit).toBe(42);

    const urlMin = new URL('https://api.example.com/api/v1/events?limit=1');
    expect(parseEventListQuery(urlMin).limit).toBe(1);

    const urlMax = new URL('https://api.example.com/api/v1/events?limit=50');
    expect(parseEventListQuery(urlMax).limit).toBe(50);

    const urlZero = new URL('https://api.example.com/api/v1/events?limit=0');
    expect(() => parseEventListQuery(urlZero)).toThrowError(/limit/);

    const urlTooBig = new URL('https://api.example.com/api/v1/events?limit=51');
    expect(() => parseEventListQuery(urlTooBig)).toThrowError(/limit/);

    const urlNotInt = new URL('https://api.example.com/api/v1/events?limit=3.5');
    expect(() => parseEventListQuery(urlNotInt)).toThrowError(/limit/);
  });
});
