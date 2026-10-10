// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HelmetProvider } from 'react-helmet-async';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createInstance, type Resource } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import { AboutPage } from './AboutPage';
import { CreditsPage } from './CreditsPage';
import { PrivacyPage } from './PrivacyPage';

const LOCALES_DIR = join(__dirname, '../../public/locales');
const NAMESPACES = readdirSync(join(LOCALES_DIR, 'fr')).map((file) => file.replace(/\.json$/, ''));

function readNamespace(lang: string, namespace: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, lang, `${namespace}.json`), 'utf8')) as Record<string, unknown>;
}

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

const resources: Resource = Object.fromEntries(SUPPORTED_LANGUAGES.map((lang) => [
  lang, Object.fromEntries(NAMESPACES.map((namespace) => [namespace, readNamespace(lang, namespace)])),
]));

afterEach(cleanup);

describe('pages légales', () => {
  it.each(SUPPORTED_LANGUAGES)('ne mentionnent ni OpenAgenda ni des événements fictifs (%s)', async (lang) => {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ lng: lang, fallbackLng: false, resources, ns: NAMESPACES,
      defaultNS: 'common', interpolation: { escapeValue: false } });
    for (const Page of [AboutPage, PrivacyPage, CreditsPage]) {
      // La page Crédits interroge l'API des parcours : requêtes sans réseau, jamais exécutées ici.
      const queryClient = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
      const { container, unmount } = render(<HelmetProvider><QueryClientProvider client={queryClient}><I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[`/${lang}`]}><Page /></MemoryRouter>
      </I18nextProvider></QueryClientProvider></HelmetProvider>);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/openagenda/i);
      expect(text).not.toMatch(/fictif|fictional|ficticio|fiktiv|fittizi|fictieve/i);
      expect(text).not.toMatch(/\b(?:about|pages)\.[a-z]+/);
      expect(container.innerHTML).not.toContain('openagenda.com');
      unmount();
    }
  });

  it.each(SUPPORTED_LANGUAGES)('déclarent Cloudflare Web Analytics et la mise à jour nocturne (%s)', (lang) => {
    const pages = readNamespace(lang, 'pages') as { privacy: { tracking: { body: string } }; about: { updates: string } };
    expect(pages.privacy.tracking.body).toContain('Cloudflare Web Analytics');
    expect(pages.about.updates).not.toMatch(/prévue|planned|prevista|geplant|previst|gepland/i);
  });

  it.each(SUPPORTED_LANGUAGES)('n’annoncent plus « bientôt » dans la meta description de /ou-manger (%s)', (lang) => {
    const seo = readNamespace(lang, 'seo') as { eat: { description: string } };
    expect(seo.eat.description).not.toMatch(/bientôt|coming soon|próximamente|demnächst|presto|binnenkort/i);
  });
});

describe('parité des locales', () => {
  it.each(SUPPORTED_LANGUAGES.filter((lang) => lang !== 'fr'))('%s a exactement les clés du français', (lang) => {
    expect(readdirSync(join(LOCALES_DIR, lang)).sort()).toEqual(readdirSync(join(LOCALES_DIR, 'fr')).sort());
    for (const namespace of NAMESPACES) {
      expect(flattenKeys(readNamespace(lang, namespace)).sort(), `${lang}/${namespace}.json`)
        .toEqual(flattenKeys(readNamespace('fr', namespace)).sort());
    }
  });
});
