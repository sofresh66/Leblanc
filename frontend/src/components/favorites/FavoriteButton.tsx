import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFavorites } from '../../hooks/useFavorites';

const HEART_PATH = 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z';

export const HeartIcon: React.FC<{ filled: boolean; className?: string }> = ({ filled, className = 'h-5 w-5' }) => (
  <svg className={className} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={HEART_PATH} />
  </svg>
);

interface FavoriteButtonProps {
  eventId: string;
  title: string;
  /** « overlay » : rond de 44 px sur l'image d'une carte ; « action » : bouton de la barre d'actions de la fiche. */
  variant: 'overlay' | 'action';
}

/** Cœur d'un événement : bouton bascule (aria-pressed), jamais placé dans un lien. */
export const FavoriteButton: React.FC<FavoriteButtonProps> = ({ eventId, title, variant }) => {
  const { t } = useTranslation('events');
  const { isFavorite, toggleEvent } = useFavorites();
  const pressed = isFavorite(eventId);
  const label = t(pressed ? 'favorites.remove' : 'favorites.add', { title });

  if (variant === 'overlay') {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        aria-label={label}
        title={label}
        onClick={() => toggleEvent(eventId)}
        className="absolute bottom-3 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brenne-800 shadow-md ring-1 ring-brenne-900/10 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brenne-800"
      >
        <HeartIcon filled={pressed} />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={() => toggleEvent(eventId)}
      className="btn-secondary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center"
    >
      <HeartIcon filled={pressed} className="h-4 w-4 text-brenne-800" />
      {t(pressed ? 'favorites.saved' : 'favorites.addShort')}
    </button>
  );
};
