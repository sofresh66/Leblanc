import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../../hooks/useFavorites';
import { useLocalizedPath } from '../../hooks/useLocalizedPath';
import { HeartIcon } from './FavoriteButton';

/**
 * Lien « Mes favoris » avec compteur. En-tête à partir de la largeur tablette
 * (sur mobile, la place manque à côté de la langue et du menu) ; sur mobile,
 * en tête du menu. La largeur du compteur est fixe (3 chiffres, le plafond
 * étant 100) : passer de 0 à 1 puis à 2 chiffres ne décale rien.
 */
export const FavoritesNavLink: React.FC<{ variant?: 'header' | 'menu'; onNavigate?: () => void }> = ({ variant = 'header', onNavigate }) => {
  const { t } = useTranslation('nav');
  const { count } = useFavorites();
  const getLocalizedPath = useLocalizedPath();
  const counter = (
    <span data-testid={variant === 'header' ? 'favorites-count' : 'favorites-count-menu'} className="inline-block w-[3ch] text-center tabular-nums">{count}</span>
  );

  if (variant === 'menu') {
    return (
      <NavLink
        to={getLocalizedPath('favorites')}
        aria-label={t('favoritesCount', { count })}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center justify-between border-b border-brenne-900/10 py-5 font-display text-3xl font-bold ${
            isActive ? 'text-brenne-800' : 'text-brenne-950 hover:text-brenne-700'
          }`
        }
      >
        {t('favorites')}
        <span className="inline-flex items-center gap-1 font-sans text-xl font-semibold text-brenne-800">
          <HeartIcon filled={count > 0} className="h-6 w-6" />
          {counter}
        </span>
      </NavLink>
    );
  }

  return (
    <NavLink
      to={getLocalizedPath('favorites')}
      aria-label={t('favoritesCount', { count })}
      title={t('favorites')}
      className={({ isActive }) =>
        `hidden md:inline-flex h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-semibold transition-colors ${
          isActive ? 'border-brenne-800 bg-brenne-50 text-brenne-900' : 'border-brenne-200 text-brenne-900 hover:bg-brenne-50'
        }`
      }
    >
      <HeartIcon filled={count > 0} className="h-5 w-5 text-brenne-800" />
      {counter}
    </NavLink>
  );
};

/** Message d'échec d'un ajout (plafond atteint ou stockage refusé), hors du flux de la page. */
export const FavoritesNotice: React.FC = () => {
  const { t } = useTranslation('events');
  const { notice, clearNotice } = useFavorites();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      {notice && (
        <div className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg">
          <p>{t(notice === 'limit' ? 'favorites.limit' : 'favorites.error')}</p>
          <button
            type="button"
            onClick={clearNotice}
            aria-label={t('favorites.dismiss')}
            className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-amber-100"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
