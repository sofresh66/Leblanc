// Motifs du signalement aux producteurs qui ne viennent pas des scores
// d'embeddings : traductions d'une autre fiche relevées à la main (overrides)
// et textes mal encodés à la source.

const MANUAL_REASONS = new Set(['cross_record_translation']);

/**
 * Langues rejetées à la main parce que leur traduction vient d'une autre fiche :
 * une seule ligne par fiche, avec les langues concernées et un extrait (titre).
 */
export function manualTranslationIssues({ source, externalId, titleI18n }, overrides) {
  const langs = [...overrides.values()]
    .filter((entry) => entry.source === source && entry.externalId === externalId && MANUAL_REASONS.has(entry.reason))
    .map((entry) => entry.lang)
    .sort();
  if (!langs.length) return [];
  const sample = langs.includes('en') ? 'en' : langs[0];
  return [{
    motif: `traduction d’une autre fiche, relevée à la main (${langs.join(', ')})`,
    extrait: String(titleI18n?.[sample] ?? ''),
  }];
}

// UTF-8 relu comme Latin-1 : « Ã© », « Â© »…, ou caractère de remplacement.
// Construit à partir des codes : aucun caractère invisible dans le source.
const char = (code) => String.fromCharCode(code);
const MOJIBAKE = new RegExp(`${char(0xC3)}[${char(0x80)}-${char(0xBF)}]|${char(0xC2)}[${char(0xA0)}-${char(0xBF)}]|${char(0xFFFD)}`);

export function hasEncodingDefect(text) {
  return typeof text === 'string' && MOJIBAKE.test(text);
}
