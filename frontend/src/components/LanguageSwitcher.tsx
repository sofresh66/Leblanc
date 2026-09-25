import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import type { SupportedLanguage } from '../i18n/languages';

export function LanguageSwitcher() {
  const { t } = useTranslation('nav');
  const { currentLanguage, setLanguage, availableLanguages } = useLanguage();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value as SupportedLanguage);
  };

  return (
    <div className="relative inline-flex items-center text-brenne-900">
      <label htmlFor="language-select" className="sr-only">
        {t('language')}
      </label>
      <svg className="pointer-events-none absolute left-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth="1.7" />
        <path d="M3 12h18M12 3c2.3 2.4 3.5 5.4 3.5 9s-1.2 6.6-3.5 9C9.7 18.6 8.5 15.6 8.5 12S9.7 5.4 12 3Z" strokeWidth="1.7" />
      </svg>
      <select
        id="language-select"
        data-testid="language-switcher"
        aria-label={t('language')}
        value={currentLanguage}
        onChange={handleChange}
        className="appearance-none bg-white/70 border border-brenne-200 text-brenne-900 text-sm font-semibold rounded-full block py-2 pl-9 pr-8 cursor-pointer hover:border-brenne-500 transition-colors"
      >
        {availableLanguages.map((code) => (
          <option key={code} value={code}>
            {code.toUpperCase()}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-brenne-700">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
