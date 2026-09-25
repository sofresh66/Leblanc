import React from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, ApiNetworkError } from '../../api/apiEventsRepository';

export interface ErrorStateProps {
  /** Erreur remontée par TanStack Query (`error`) ou toute autre erreur. */
  error: unknown;
  /** Relance la requête en échec (bouton « Réessayer ») ; masqué si absent. */
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * Affiche une erreur d'appel API de manière homogène.
 *
 * Trois cas sont distingués : panne réseau (ou délai de 30 s dépassé),
 * cold start du service (503) et erreur applicative renvoyée par l'API.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ error, onRetry, className = '' }) => {
  const { t } = useTranslation(['errors', 'common']);
  const title = t('generic', { ns: 'errors' });

  let message: string;
  if (error instanceof ApiNetworkError) {
    message = error.isTimeout ? t('timeout', { ns: 'errors' }) : t('network', { ns: 'errors' });
  } else if (error instanceof ApiError) {
    // 503 : l'instance Neon se réveille, le message technique est remplacé par un message clair.
    message = error.status === 503 ? t('serviceWakingUp', { ns: 'errors' }) : error.message;
  } else if (error instanceof Error && error.message.length > 0) {
    message = error.message;
  } else {
    message = title;
  }

  return (
    <div
      role="alert"
      data-testid="error-state"
      className={`p-8 text-center bg-red-50 border border-red-200 rounded-2xl max-w-xl mx-auto my-8 ${className}`}
    >
      <svg
        className="w-12 h-12 text-red-500 mx-auto mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <h3 className="text-lg font-bold text-red-900 mb-2">{title}</h3>
      {message !== title && <p className="text-sm text-red-700 mb-4">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn-primary inline-flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {t('actions.retry', { ns: 'common' })}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
