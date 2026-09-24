import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import type { SupportedLanguage } from '../i18n/languages';

export function LanguageSwitcher() {
  const { t } = useTranslation('nav');
  const { currentLanguage, setLanguage, availableLanguages, languagesMeta } = useLanguage();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value as SupportedLanguage);
  };

  return (
    <div className="relative inline-flex items-center">
      <label htmlFor="language-select" className="sr-only">
        {t('language')}
      </label>
      <select
        id="language-select"
        data-testid="language-switcher"
        aria-label={t('language')}
        value={currentLanguage}
        onChange={handleChange}
        className="appearance-none bg-white border border-gray-300 text-gray-800 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block py-1.5 pl-3 pr-8 shadow-sm cursor-pointer hover:border-gray-400 transition-colors"
      >
        {availableLanguages.map((code) => (
          <option key={code} value={code}>
            {languagesMeta[code].nativeName} ({code.toUpperCase()})
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}
