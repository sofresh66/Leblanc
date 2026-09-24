export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'de', 'it', 'nl'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

export const LANGUAGE_STORAGE_KEY = 'leblanc_i18n_lang';

export interface LanguageMeta {
  code: SupportedLanguage;
  label: string;
  nativeName: string;
  locale: string;
}

export const LANGUAGES_META: Record<SupportedLanguage, LanguageMeta> = {
  fr: { code: 'fr', label: 'Français', nativeName: 'Français', locale: 'fr-FR' },
  en: { code: 'en', label: 'English', nativeName: 'English', locale: 'en-GB' },
  es: { code: 'es', label: 'Español', nativeName: 'Español', locale: 'es-ES' },
  de: { code: 'de', label: 'Deutsch', nativeName: 'Deutsch', locale: 'de-DE' },
  it: { code: 'it', label: 'Italiano', nativeName: 'Italiano', locale: 'it-IT' },
  nl: { code: 'nl', label: 'Nederlands', nativeName: 'Nederlands', locale: 'nl-NL' },
};

export function isSupportedLanguage(lang: unknown): lang is SupportedLanguage {
  return typeof lang === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

export function normalizeLanguage(lang: string | null | undefined): SupportedLanguage | null {
  if (!lang) return null;
  const clean = lang.trim().toLowerCase();
  const base = clean.split(/[-_]/)[0] ?? '';
  if (isSupportedLanguage(base)) {
    return base;
  }
  return null;
}
