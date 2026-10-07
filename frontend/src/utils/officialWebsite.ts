/**
 * Site officiel affichable : URL http(s) de l'organisateur. L'URI technique
 * data.datatourisme.fr (identifiant de la fiche, pas une page publique) est écartée.
 */
export function officialWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname === 'data.datatourisme.fr' ? null : parsed.toString();
  } catch {
    return null;
  }
}
