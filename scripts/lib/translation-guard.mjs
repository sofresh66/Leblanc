// Garde-fou du contrôle hebdomadaire des traductions : au-delà d'un nombre de
// NOUVELLES fiches rejetées (record_mismatch), le run n'écrit rien et échoue.
// Protège contre une dérive du modèle d'embeddings ou du seuil.

export const DEFAULT_MAX_NEW_REJECTIONS = 10;

/** Lit --max-new-rejections=N (entier ≥ 0), sinon la valeur par défaut. */
export function parseMaxNewRejections(argv) {
  const arg = argv.find((value) => value.startsWith('--max-new-rejections='));
  if (!arg) return DEFAULT_MAX_NEW_REJECTIONS;
  const value = Number(arg.slice('--max-new-rejections='.length));
  if (!Number.isInteger(value) || value < 0) throw new Error(`--max-new-rejections invalide : ${arg}`);
  return value;
}

/** Fiches qui passeraient en rejet alors qu'elles ne l'étaient pas (hors fiches déjà rejetées). */
export function newRejections(decisions) {
  return decisions.filter((decision) => decision.flagged && !decision.hadMismatch);
}

/** Décision d'écriture : bloquée si les nouvelles fiches rejetées dépassent le maximum. */
export function checkRejectionGuard(decisions, maxNewRejections = DEFAULT_MAX_NEW_REJECTIONS) {
  const fresh = newRejections(decisions);
  return { newRejections: fresh, blocked: fresh.length > maxNewRejections, maxNewRejections };
}

const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** Résumé Markdown pour $GITHUB_STEP_SUMMARY. */
export function weeklySummaryMarkdown({ apply, guard, events, flagged, lifted, written, reportFiles }) {
  const lines = ['## Contrôle hebdomadaire des traductions', ''];
  if (guard.blocked) {
    lines.push(`**Garde-fou déclenché : ${guard.newRejections.length} nouvelles fiches passeraient en rejet `
      + `(maximum ${guard.maxNewRejections}). Rien n'a été écrit.** Vérifier le modèle ou le seuil avant de relancer.`, '');
  }
  lines.push(
    '| Mesure | Valeur |', '|---|---|',
    `| Mode | ${apply ? 'écriture (--apply)' : 'lecture seule'} |`,
    `| Fiches contrôlées | ${events} |`,
    `| Fiches en rejet (record_mismatch) | ${flagged} |`,
    `| Nouvelles fiches en rejet | ${guard.newRejections.length} (maximum ${guard.maxNewRejections}) |`,
    `| Rejets levés | ${lifted} |`,
    `| Fiches écrites | ${written} |`,
    '',
  );
  if (guard.newRejections.length) {
    lines.push('### Nouvelles fiches en rejet', '', '| Titre | Identifiant DATAtourisme | Score max |', '|---|---|---|');
    for (const { event, max } of guard.newRejections) {
      lines.push(`| ${cell(event.title_i18n?.fr)} | ${cell(event.external_id)} | ${max === null ? '' : max.toFixed(3)} |`);
    }
    lines.push('');
  }
  if (reportFiles.length) {
    lines.push('### Signalement aux producteurs (artefact du run)', '');
    for (const { producer, fiches } of reportFiles) lines.push(`- ${cell(producer)} : ${fiches} fiche(s)`);
    lines.push('');
  }
  return lines.join('\n');
}
