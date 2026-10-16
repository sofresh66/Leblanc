import { buildLocalizedPath, type SupportedLanguage } from '@leblanc/shared';

/**
 * Domaine public du site, écrit en dur : le fichier .ics et le texte de partage
 * quittent le navigateur et doivent pointer vers le domaine définitif, jamais
 * vers une prévisualisation *.pages.dev (VITE_SITE_URL n'est pas lu ici).
 */
export const CANONICAL_SITE_URL = 'https://leblanc-et-moi.fr';

/** Adresse de contact publique, affichée dans les mentions légales et la confidentialité. */
export const CONTACT_EMAIL = 'contact@leblanc-et-moi.fr';

/** Page canonique d'un événement dans la langue donnée. */
export function canonicalEventUrl(id: string, lang: SupportedLanguage): string {
  return `${CANONICAL_SITE_URL}${buildLocalizedPath('events', lang, id)}`;
}
