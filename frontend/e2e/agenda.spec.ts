import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Event } from '@leblanc/shared';
import { discoverEvents } from './fixtures';

const DAY_MS = 24 * 3600 * 1000;
let events: Event[];

test.beforeAll(async ({ request }) => {
  events = await discoverEvents(request);
});

test('Le menu calendrier propose Google Agenda et un .ics qui pointent vers leblanc-et-moi.fr', async ({ page }) => {
  // Les dates de la liste sont celles de la prochaine séance : on prend une séance courte à venir.
  const event = events.find((candidate) => {
    const start = Date.parse(candidate.startDate);
    const end = Date.parse(candidate.endDate ?? candidate.startDate);
    return start > Date.now() && end - start < 7 * DAY_MS;
  });
  test.skip(!event, 'Aucun événement court à venir dans les données');

  await page.goto(`/fr/evenements/${event!.id}`);
  const button = page.getByRole('button', { name: /^Ajouter à mon calendrier/ });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Le bouton ouvre un menu (clavier compris) et ne télécharge rien à lui seul.
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(downloads).toBe(0);

  const google = page.getByRole('link', { name: /^Google Agenda/ });
  await expect(google).toHaveAttribute('target', '_blank');
  await expect(google).toHaveAttribute('rel', 'noopener noreferrer');
  const googleHref = new URL((await google.getAttribute('href'))!);
  expect(googleHref.origin + googleHref.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(googleHref.searchParams.get('action')).toBe('TEMPLATE');
  expect(googleHref.searchParams.get('text')).toBe(event!.title.replace(/\s+/g, ' ').trim());
  expect(googleHref.searchParams.get('dates')).toMatch(/^(\d{8}T\d{6}Z\/\d{8}T\d{6}Z|\d{8}\/\d{8})$/);
  expect(googleHref.searchParams.get('details')!.endsWith(`https://leblanc-et-moi.fr/fr/evenements/${event!.id}`)).toBe(true);
  expect(googleHref.href).not.toContain('pages.dev');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Fichier .ics (Apple, Outlook)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^[a-z0-9-]+\.ics$/);

  const content = await readFile((await download.path())!, 'utf8');
  expect(content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  const unfolded = content.replace(/\r\n /g, '');
  expect(unfolded).toContain(`URL:https://leblanc-et-moi.fr/fr/evenements/${event!.id}\r\n`);
  expect(unfolded).toContain(`UID:${event!.id}-`);
  expect(content).not.toContain('pages.dev');

  // Sans navigator.share (Chromium de bureau), Partager déplie WhatsApp et SMS.
  await page.getByRole('button', { name: /^Partager/ }).click();
  const whatsapp = page.getByRole('link', { name: /WhatsApp/ });
  await expect(whatsapp).toHaveAttribute('href', new RegExp(`^https://wa\\.me/\\?text=.*${encodeURIComponent(`https://leblanc-et-moi.fr/fr/evenements/${event!.id}`)}$`));
  await expect(page.getByRole('link', { name: /SMS/ })).toHaveAttribute('href', /^sms:\?&body=/);
});
