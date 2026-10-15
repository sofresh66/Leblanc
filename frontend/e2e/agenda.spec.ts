import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Event } from '@leblanc/shared';
import { discoverEvents } from './fixtures';

const DAY_MS = 24 * 3600 * 1000;
let events: Event[];

test.beforeAll(async ({ request }) => {
  events = await discoverEvents(request);
});

test('La fiche événement télécharge un .ics qui pointe vers leblanc-et-moi.fr', async ({ page }) => {
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

  const downloadPromise = page.waitForEvent('download');
  await button.click();
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
