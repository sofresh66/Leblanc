import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SEARCH_DEBOUNCE_MS = 300;

export interface SearchFieldProps {
  label: string;
  placeholder: string;
  clearLabel: string;
  /** Paramètres d'URL à retirer quand la recherche change (ex. curseur de pagination). */
  resetParams?: string[];
  className?: string;
}

/**
 * Champ de recherche synchronisé avec le paramètre d'URL `q` (après 300 ms sans
 * frappe). Les espaces superflus sont retirés ; un champ vide supprime `q`.
 */
export function SearchField({ label, placeholder, clearLabel, resetParams = [], className = '' }: SearchFieldProps) {
  const id = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlValue = searchParams.get('q') ?? '';
  const [value, setValue] = useState(urlValue);
  const lastWritten = useRef(urlValue);
  const resetKey = resetParams.join(',');

  // Navigation (retour, réinitialisation des filtres) : le champ suit l'URL.
  useEffect(() => {
    if (urlValue !== lastWritten.current) {
      lastWritten.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  useEffect(() => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized === lastWritten.current) return undefined;
    const timer = setTimeout(() => {
      lastWritten.current = normalized;
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (normalized) next.set('q', normalized);
        else next.delete('q');
        for (const param of resetKey ? resetKey.split(',') : []) next.delete(param);
        return next;
      }, { replace: true });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, setSearchParams, resetKey]);

  return (
    <div role="search" className={className}>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">{label}</label>
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
        </svg>
        <input
          id={id}
          type="search"
          value={value}
          maxLength={80}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
          className="w-full min-h-11 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-11 text-sm focus:border-brenne-700"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 min-h-9 min-w-9 rounded-md text-gray-500 hover:text-brenne-900"
            aria-label={clearLabel}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </div>
  );
}
