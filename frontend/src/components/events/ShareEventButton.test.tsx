// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareEventButton } from './ShareEventButton';
import { shareMessage, shareText, smsShareUrl, whatsappShareUrl, type ShareContent } from '../../utils/share';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { title?: string }) => (options?.title ? `${key} ${options.title}` : key) }),
}));

const content: ShareContent = {
  title: 'Rock & Blues #2 à l’Église',
  date: 'samedi 24 octobre 2026 • 20:30',
  place: 'Salle des fêtes, Le Blanc',
  url: 'https://leblanc-et-moi.fr/fr/evenements/c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
};
const expectedMessage = 'Rock & Blues #2 à l’Église\nsamedi 24 octobre 2026 • 20:30\nSalle des fêtes, Le Blanc\n'
  + 'https://leblanc-et-moi.fr/fr/evenements/c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a03';

function setNavigator(property: 'share' | 'canShare' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, property, { value, configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  for (const property of ['share', 'canShare', 'clipboard'] as const) {
    Reflect.deleteProperty(navigator, property);
  }
  vi.unstubAllEnvs();
});

describe('Texte de partage', () => {
  it('assemble titre, date, lieu puis l’URL canonique', () => {
    expect(shareMessage(content)).toBe(expectedMessage);
    expect(shareText(content)).not.toContain('https://');
    expect(shareMessage({ ...content, place: null })).toBe(
      'Rock & Blues #2 à l’Église\nsamedi 24 octobre 2026 • 20:30\nhttps://leblanc-et-moi.fr/fr/evenements/c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
    );
  });

  it('encode le texte dans les liens WhatsApp et SMS', () => {
    const encoded = encodeURIComponent(expectedMessage);
    expect(whatsappShareUrl(content)).toBe(`https://wa.me/?text=${encoded}`);
    expect(smsShareUrl(content)).toBe(`sms:?&body=${encoded}`);
    // &, #, retours à la ligne et accents ne cassent pas l'URL.
    expect(encoded).toContain('Rock%20%26%20Blues%20%232%20%C3%A0');
    expect(encoded).toContain('%0A');
    expect(encoded).not.toMatch(/[&#\n ]/);
  });
});

describe('ShareEventButton sans navigator.share (ordinateur)', () => {
  it('déplie WhatsApp, SMS et la copie du lien, avec les bons attributs', () => {
    render(<ShareEventButton content={content} />);
    const button = screen.getByRole('button', { name: `details.shareLabel ${content.title}` });
    expect(button.textContent).toContain('details.share');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('group')).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('group', { name: 'details.shareOptions' });
    expect(button.getAttribute('aria-controls')).toBe(panel.id);

    const whatsapp = screen.getByRole('link', { name: 'details.shareWhatsAppLabel' });
    expect(whatsapp.getAttribute('href')).toBe(`https://wa.me/?text=${encodeURIComponent(expectedMessage)}`);
    expect(whatsapp.getAttribute('target')).toBe('_blank');
    expect(whatsapp.getAttribute('rel')).toBe('noopener noreferrer');
    const sms = screen.getByRole('link', { name: 'details.shareSms' });
    expect(sms.getAttribute('href')).toBe(`sms:?&body=${encodeURIComponent(expectedMessage)}`);
    expect(sms.getAttribute('rel')).toBe('noopener noreferrer');
    // jsdom n'a pas de presse-papiers : pas de bouton de copie inutilisable.
    expect(screen.queryByRole('button', { name: 'details.copyLink' })).toBeNull();

    fireEvent.click(button);
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('copie l’URL canonique et l’annonce', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigator('clipboard', { writeText });
    render(<ShareEventButton content={content} />);
    fireEvent.click(screen.getByRole('button', { name: /details.shareLabel/ }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'details.copyLink' })); });
    expect(writeText).toHaveBeenCalledWith(content.url);
    expect(screen.getByRole('status').textContent).toBe('details.linkCopied');
  });
});

describe('ShareEventButton avec navigator.share (mobile)', () => {
  it('ouvre le partage natif avec titre, texte et URL, sans panneau', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigator('share', share);
    render(<ShareEventButton content={content} />);
    const button = screen.getByRole('button', { name: /details.shareLabel/ });
    expect(button.hasAttribute('aria-expanded')).toBe(false);
    await act(async () => { fireEvent.click(button); });
    expect(share).toHaveBeenCalledWith({ title: content.title, text: shareText(content), url: content.url });
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('ne fait rien quand l’utilisateur annule, se replie sur le panneau en cas d’échec', async () => {
    const share = vi.fn().mockRejectedValueOnce(new DOMException('annulé', 'AbortError'))
      .mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
    setNavigator('share', share);
    render(<ShareEventButton content={content} />);
    const button = screen.getByRole('button', { name: /details.shareLabel/ });
    await act(async () => { fireEvent.click(button); });
    expect(screen.queryByRole('group')).toBeNull();
    await act(async () => { fireEvent.click(button); });
    expect(screen.getByRole('group', { name: 'details.shareOptions' })).toBeTruthy();
  });

  it('se replie sur le panneau quand canShare refuse les données', async () => {
    const share = vi.fn();
    setNavigator('share', share);
    setNavigator('canShare', () => false);
    render(<ShareEventButton content={content} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /details.shareLabel/ })); });
    expect(share).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'details.shareWhatsAppLabel' })).toBeTruthy();
  });
});
