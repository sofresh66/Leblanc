import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../validation/cursor.js';

describe('Curseur de pagination (worker/src/validation/cursor.ts)', () => {
  const sampleDate = '2026-07-15T18:00:00.000Z';
  const sampleId = 'e1000000-0000-4000-8000-000000000001';
  const asOf = '2026-07-15T10:00:00.000Z';

  it('préserve les microsecondes PostgreSQL', () => {
    const date = '2026-10-03T08:30:00.123456Z';
    expect(decodeCursor(encodeCursor(date, sampleId, asOf)).d).toBe(date);
  });

  it('rejette un UUID invalide et une date non ISO avant tout SQL', () => {
    expect(() => decodeCursor(encodeCursor(sampleDate, 'not-a-uuid', asOf))).toThrow();
    expect(() => decodeCursor(encodeCursor('03/12/2026', sampleId, asOf))).toThrow();
  });

  it('encode et décode en aller-retour sans altération (roundtrip)', () => {
    const encoded = encodeCursor(sampleDate, sampleId, asOf);
    expect(typeof encoded).toBe('string');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    const decoded = decodeCursor(encoded);
    expect(decoded.d).toBe(sampleDate);
    expect(decoded.i).toBe(sampleId);
    expect(decoded.a).toBe(asOf);
  });

  it('accepte un ancien curseur sans date de référence (émis par l’ancien Worker)', () => {
    const legacy = Buffer.from(JSON.stringify({ d: sampleDate, i: sampleId })).toString('base64url');
    expect(decodeCursor(legacy)).toEqual({ d: sampleDate, i: sampleId });
  });

  it('supporte également le décodage du base64 standard avec padding', () => {
    const rawJson = JSON.stringify({ d: sampleDate, i: sampleId, a: asOf });
    const standardBase64 = Buffer.from(rawJson).toString('base64');

    const decoded = decodeCursor(standardBase64);
    expect(decoded.d).toBe(sampleDate);
    expect(decoded.i).toBe(sampleId);
  });

  it('lève une erreur descriptive sur une chaîne non base64', () => {
    expect(() => decodeCursor('!!!invalid-base64@@@')).toThrowError(/encodage base64 incorrect|JSON malformé|Curseur invalide/);
  });

  it('lève une erreur descriptive sur un JSON invalide dans le curseur', () => {
    const invalidJsonBase64 = Buffer.from('{ invalid json string').toString('base64url');
    expect(() => decodeCursor(invalidJsonBase64)).toThrowError(/JSON malformé/);
  });

  it('lève une erreur descriptive lorsque le schéma interne du curseur est incomplet ou invalide', () => {
    // Manque 'i'
    const missingId = Buffer.from(JSON.stringify({ d: sampleDate })).toString('base64url');
    expect(() => decodeCursor(missingId)).toThrowError(/Curseur invalide/);

    // Date 'd' invalide
    const badDate = Buffer.from(JSON.stringify({ d: 'not-a-date', i: sampleId })).toString('base64url');
    expect(() => decodeCursor(badDate)).toThrowError(/Invalid ISO date string/);
  });
});
