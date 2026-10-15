export interface ShareContent {
  title: string;
  /** Date lisible dans la langue courante. */
  date: string;
  /** Lieu et ville, ou null si inconnus. */
  place: string | null;
  /** Page canonique sur le domaine définitif (voir canonicalUrl.ts). */
  url: string;
}

/** Texte court sans l'URL (navigator.share la reçoit à part). */
export function shareText({ title, date, place }: ShareContent): string {
  return [title.replace(/\s+/g, ' ').trim(), date, place].filter(Boolean).join('\n');
}

/** Texte complet pour WhatsApp et SMS : titre, date, lieu puis URL. */
export function shareMessage(content: ShareContent): string {
  return `${shareText(content)}\n${content.url}`;
}

export function whatsappShareUrl(content: ShareContent): string {
  return `https://wa.me/?text=${encodeURIComponent(shareMessage(content))}`;
}

/** `sms:?&body=` : forme acceptée à la fois par iOS et Android. */
export function smsShareUrl(content: ShareContent): string {
  return `sms:?&body=${encodeURIComponent(shareMessage(content))}`;
}
