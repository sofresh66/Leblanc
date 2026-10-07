import { z } from 'zod';
import { SupportedContentLanguageSchema } from './schemas.js';
import type { EventI18nDescription, EventI18nTitle } from './types.js';

// Une entrée illisible est ignorée : la traduction reste servie (absent = ok).
const TranslationStatusEntrySchema = z.object({
  status: z.enum(['ok', 'rejected', 'machine']),
  titleStatus: z.enum(['ok', 'ignored_identical']).optional(),
  descriptionStatus: z.enum(['ok', 'ignored_identical']).optional(),
});

/**
 * Retire les traductions non validées avant la résolution de langue :
 * une langue rejetée perd titre et description, une traduction identique au
 * français est ignorée champ par champ. Le français n'est jamais retiré.
 */
export function applyTranslationStatus(
  content: { title_i18n: EventI18nTitle; description_i18n: EventI18nDescription },
  translationStatus: unknown,
): { title_i18n: EventI18nTitle; description_i18n: EventI18nDescription } {
  const title_i18n: EventI18nTitle = { ...content.title_i18n };
  const description_i18n: EventI18nDescription = { ...content.description_i18n };
  if (!translationStatus || typeof translationStatus !== 'object') return { title_i18n, description_i18n };

  for (const [key, value] of Object.entries(translationStatus)) {
    const language = SupportedContentLanguageSchema.safeParse(key);
    const entry = TranslationStatusEntrySchema.safeParse(value);
    if (!language.success || language.data === 'fr' || !entry.success) continue;
    const lang = language.data;
    if (entry.data.status === 'rejected' || entry.data.titleStatus === 'ignored_identical') delete title_i18n[lang];
    if (entry.data.status === 'rejected' || entry.data.descriptionStatus === 'ignored_identical') {
      delete description_i18n[lang];
    }
  }
  return { title_i18n, description_i18n };
}
