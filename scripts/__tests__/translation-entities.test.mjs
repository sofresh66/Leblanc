import { describe, expect, it } from 'vitest';
import { parseEntity } from '../lib/translation-entities.mjs';
import { checkRejectionGuard, weeklySummaryMarkdown } from '../lib/translation-guard.mjs';
import { toCsv } from '../lib/translation-report.mjs';

describe('Entités contrôlées par les scripts de traduction', () => {
  it('garde les événements par défaut', () => {
    expect(parseEntity(['node', 'script'])).toMatchObject({ name: 'events', table: 'events', sourceTable: 'source_records',
      foreignKey: 'event_id', fileSuffix: '' });
  });

  it('cible les parcours avec --entity=routes, fichiers distincts', () => {
    expect(parseEntity(['--apply', '--entity=routes'])).toMatchObject({ name: 'routes', table: 'routes',
      sourceTable: 'route_source_records', foreignKey: 'route_id', fileSuffix: '-routes' });
  });

  it('refuse une entité inconnue ou répétée', () => {
    expect(() => parseEntity(['--entity=places'])).toThrow(/events ou routes/);
    expect(() => parseEntity(['--entity=events', '--entity=routes'])).toThrow(/qu’une fois/);
  });

  it('distingue le résumé hebdomadaire des parcours', () => {
    const base = { apply: true, guard: checkRejectionGuard([]), events: 167, flagged: 0, lifted: 0, written: 0, reportFiles: [] };
    expect(weeklySummaryMarkdown(base)).toMatch(/^## Contrôle hebdomadaire des traductions\n/);
    expect(weeklySummaryMarkdown({ ...base, entityLabel: 'parcours' })).toMatch(/^## Contrôle hebdomadaire des traductions \(parcours\)\n/);
  });

  it('nomme la colonne d’identifiant du rapport CSV', () => {
    expect(toCsv([]).split(',')[0]).toBe('eventId');
    expect(toCsv([], { idHeader: 'routeId' }).split(',')[0]).toBe('routeId');
  });
});
