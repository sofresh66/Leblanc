// Marqueurs typiques des notes de modération (comparés sans casse ni accents).
const INTERNAL_NOTE_MARKERS = ['a confirmer', 'verifier', 'doublon', 'absent de la liste'];

function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Liste les langues dont la description publique ressemble à une note interne. */
export function findInternalNoteMarkers(descriptionI18n) {
  return Object.entries(descriptionI18n ?? {}).flatMap(([lang, text]) => {
    if (typeof text !== 'string') return [];
    const folded = fold(text);
    return INTERNAL_NOTE_MARKERS.filter((marker) => folded.includes(marker)).map((marker) => ({ lang, marker }));
  });
}

/**
 * Sources externes (DATAtourisme, OSM) : un mot-clé peut apparaître dans une vraie
 * description. On importe normalement et on journalise l'identifiant et le marqueur.
 */
export function warnOnInternalNoteMarkers(descriptionI18n, context) {
  const findings = findInternalNoteMarkers(descriptionI18n);
  for (const { lang, marker } of findings) {
    console.warn(JSON.stringify({ step: 'description_marker', context, lang, marker }));
  }
  return findings;
}

/**
 * Import manuel, d'où viennent nos notes : fait échouer l'écriture plutôt que de
 * publier une note interne. Le message cite l'identifiant et le marqueur, jamais
 * le texte complet.
 */
export function assertPublicDescriptionClean(descriptionI18n, context) {
  const findings = findInternalNoteMarkers(descriptionI18n);
  if (findings.length) {
    const detail = findings.map(({ lang, marker }) => `${lang}:« ${marker} »`).join(', ');
    throw new Error(`Description publique refusée (${context}) : note interne probable ${detail}`);
  }
}
