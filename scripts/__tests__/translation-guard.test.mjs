import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_NEW_REJECTIONS, checkRejectionGuard, newRejections, parseMaxNewRejections, weeklySummaryMarkdown,
} from '../lib/translation-guard.mjs';

const decision = (index, { flagged = true, hadMismatch = false, max = 0.31 } = {}) => ({
  event: { external_id: `id-${index}`, title_i18n: { fr: `Fiche ${index}` } }, flagged, hadMismatch, max,
});
const many = (count, options) => Array.from({ length: count }, (_, index) => decision(index, options));

describe('Garde-fou des nouvelles fiches rejetées', () => {
  it('ne compte que les fiches qui passent nouvellement en rejet', () => {
    const decisions = [decision(1), decision(2, { hadMismatch: true }), decision(3, { flagged: false, hadMismatch: true }),
      decision(4, { flagged: false })];
    expect(newRejections(decisions).map(({ event }) => event.external_id)).toEqual(['id-1']);
  });

  it('autorise l’écriture jusqu’à 10 nouvelles fiches incluses', () => {
    const guard = checkRejectionGuard(many(10));
    expect(guard).toMatchObject({ blocked: false, maxNewRejections: DEFAULT_MAX_NEW_REJECTIONS });
    expect(guard.newRejections).toHaveLength(10);
  });

  it('bloque l’écriture à partir de 11 nouvelles fiches', () => {
    expect(checkRejectionGuard(many(11)).blocked).toBe(true);
  });

  it('ignore les fiches déjà rejetées, même nombreuses (pas de dérive)', () => {
    expect(checkRejectionGuard([...many(40, { hadMismatch: true }), ...many(3)]).blocked).toBe(false);
  });

  it('lit le maximum en argument et refuse une valeur invalide', () => {
    expect(parseMaxNewRejections(['node', 'x'])).toBe(10);
    expect(parseMaxNewRejections(['--max-new-rejections=25'])).toBe(25);
    expect(parseMaxNewRejections(['--max-new-rejections=0'])).toBe(0);
    expect(() => parseMaxNewRejections(['--max-new-rejections=-1'])).toThrow();
    expect(() => parseMaxNewRejections(['--max-new-rejections=abc'])).toThrow();
    expect(checkRejectionGuard(many(1), 0).blocked).toBe(true);
  });

  it('publie la liste des nouvelles fiches et l’alerte dans le résumé', () => {
    const guard = checkRejectionGuard(many(11));
    const markdown = weeklySummaryMarkdown({ apply: true, guard, events: 200, flagged: 52, lifted: 0, written: 0,
      reportFiles: [{ producer: 'Destination Brenne', fiches: 44 }] });
    expect(markdown).toContain('Garde-fou déclenché : 11 nouvelles fiches');
    expect(markdown).toContain('Rien n\'a été écrit');
    expect(markdown).toContain('| Fiche 10 | id-10 | 0.310 |');
    expect(markdown).toContain('Destination Brenne : 44 fiche(s)');
  });

  it('n’affiche pas d’alerte quand le garde-fou laisse passer', () => {
    const markdown = weeklySummaryMarkdown({ apply: true, guard: checkRejectionGuard(many(2)), events: 200, flagged: 47,
      lifted: 1, written: 3, reportFiles: [] });
    expect(markdown).not.toContain('Garde-fou déclenché');
    expect(markdown).toContain('| Fiches écrites | 3 |');
  });
});
