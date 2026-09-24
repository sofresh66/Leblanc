import { describe, it, expect } from 'vitest';
import {
  parseMigrationVersion,
  sortMigrations,
  computeChecksum,
} from '../lib/migrations-helpers.mjs';

describe('Migrations Helpers (Lot 4)', () => {
  describe('parseMigrationVersion', () => {
    it('extrait correctement le numéro de version entier', () => {
      expect(parseMigrationVersion('001_extensions.sql')).toBe(1);
      expect(parseMigrationVersion('002_core_events.sql')).toBe(2);
      expect(parseMigrationVersion('015_future_migration.sql')).toBe(15);
      expect(parseMigrationVersion('100_big_migration.sql')).toBe(100);
    });

    it('rejette les fichiers ne respectant pas la convention <numero>_<nom>.sql', () => {
      expect(() => parseMigrationVersion('invalid.sql')).toThrow(
        /Format de fichier de migration invalide/,
      );
      expect(() => parseMigrationVersion('test_001.sql')).toThrow(
        /Format de fichier de migration invalide/,
      );
      expect(() => parseMigrationVersion('001extensions.sql')).toThrow(
        /Format de fichier de migration invalide/,
      );
    });
  });

  describe('sortMigrations', () => {
    it('trie les fichiers par numéro de version croissant', () => {
      const unsorted = [
        '004_indexes.sql',
        '001_extensions.sql',
        '010_tenth.sql',
        '002_core_events.sql',
        '003_ingestion_tables.sql',
      ];
      const sorted = sortMigrations(unsorted);
      expect(sorted).toEqual([
        '001_extensions.sql',
        '002_core_events.sql',
        '003_ingestion_tables.sql',
        '004_indexes.sql',
        '010_tenth.sql',
      ]);
    });

    it('rejette les versions de migration dupliquées', () => {
      const duplicates = ['001_extensions.sql', '001_other.sql', '002_core.sql'];
      expect(() => sortMigrations(duplicates)).toThrow(
        /Version de migration dupliquée détectée/,
      );
    });

    it('rejette si un fichier de la liste est invalide', () => {
      const invalid = ['001_extensions.sql', 'readme.txt'];
      expect(() => sortMigrations(invalid)).toThrow(
        /Format de fichier de migration invalide/,
      );
    });
  });

  describe('computeChecksum', () => {
    it('produit un hash strictement identique entre fins de ligne LF et CRLF', () => {
      const lfContent = 'CREATE TABLE test (\n  id UUID PRIMARY KEY\n);\n';
      const crlfContent = 'CREATE TABLE test (\r\n  id UUID PRIMARY KEY\r\n);\r\n';
      const crContent = 'CREATE TABLE test (\r  id UUID PRIMARY KEY\r);\r';

      const hashLf = computeChecksum(lfContent);
      const hashCrlf = computeChecksum(crlfContent);
      const hashCr = computeChecksum(crContent);

      expect(hashLf).toBe(hashCrlf);
      expect(hashLf).toBe(hashCr);
      expect(typeof hashLf).toBe('string');
      expect(hashLf).toHaveLength(64);
    });

    it('produit des hashs différents pour des contenus différents', () => {
      const sql1 = 'CREATE TABLE a (id INT);';
      const sql2 = 'CREATE TABLE b (id INT);';

      expect(computeChecksum(sql1)).not.toBe(computeChecksum(sql2));
    });
  });
});
