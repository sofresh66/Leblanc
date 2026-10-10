import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(new URL('../../migrations/012_routes.sql', import.meta.url), 'utf8');
const executable = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

describe('Migration 012 (parcours)', () => {
  it('ne modifie ni ne supprime aucune table existante', () => {
    expect(executable).not.toMatch(/\b(ALTER|DROP)\s+TABLE\b/i);
    expect([...executable.matchAll(/CREATE TABLE (\w+)/g)].map((match) => match[1]))
      .toEqual(['routes', 'route_source_records']);
  });

  it('stocke le tracé et sa version allégée en MultiLineString', () => {
    expect(executable).toMatch(/\btrack GEOGRAPHY\(MultiLineString, 4326\)/);
    expect(executable).toMatch(/\btrack_simplified GEOMETRY\(MultiLineString, 4326\)/);
    expect(executable).not.toMatch(/\(LineString,/);
  });

  it('documente le retour arrière', () => {
    expect(sql).toContain('--   DROP TABLE IF EXISTS route_source_records;');
    expect(sql).toContain('--   DROP TABLE IF EXISTS routes;');
    expect(sql).toContain("--   DELETE FROM schema_migrations WHERE version = '012_routes.sql';");
  });

  it('indexe l’ordre de la liste : avec tracé, distance au Blanc, id', () => {
    expect(executable).toMatch(/\(\(track IS NOT NULL\) DESC, distance_le_blanc_m, id\)/);
  });
});
