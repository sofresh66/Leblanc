import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shareText, smsShareUrl, whatsappShareUrl, type ShareContent } from '../../utils/share';

const optionClass = 'btn-secondary min-h-12 px-5 py-3 text-sm inline-flex items-center gap-2 w-full sm:w-auto justify-center';

/**
 * Partage natif (mobile) quand navigator.share existe ; sinon, un panneau avec
 * WhatsApp, SMS et la copie du lien. Aucun script tiers, aucun suivi.
 */
export const ShareEventButton: React.FC<{ content: ShareContent }> = ({ content }) => {
  const { t } = useTranslation('events');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const nativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);

  const handleShare = async () => {
    if (nativeShare) {
      const data = { title: content.title, text: shareText(content), url: content.url };
      if (!navigator.canShare || navigator.canShare(data)) {
        try {
          await navigator.share(data);
          return;
        } catch (error) {
          // Partage annulé par l'utilisateur : rien d'autre à faire.
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
    }
    setOpen((value) => !value);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Presse-papiers refusé : les liens WhatsApp et SMS restent disponibles.
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleShare()}
        aria-label={t('details.shareLabel', { title: content.title })}
        {...(nativeShare ? {} : { 'aria-expanded': open, 'aria-controls': panelId })}
        className={optionClass}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {t('details.share')}
      </button>

      {open && (
        <div id={panelId} role="group" aria-label={t('details.shareOptions')} className="order-last flex basis-full flex-wrap items-center gap-3">
          <a
            href={whatsappShareUrl(content)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('details.shareWhatsAppLabel')}
            className={optionClass}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {t('details.shareWhatsApp')}
          </a>
          <a href={smsShareUrl(content)} rel="noopener noreferrer" className={optionClass}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {t('details.shareSms')}
          </a>
          {canCopy && (
            <button type="button" onClick={() => void handleCopy()} className={optionClass}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {t('details.copyLink')}
            </button>
          )}
          {copied && (
            <span role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              {t('details.linkCopied')}
            </span>
          )}
        </div>
      )}
    </>
  );
};
