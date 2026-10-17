import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routes = JSON.parse(readFileSync(new URL('../../public/_routes.json', import.meta.url), 'utf8')) as {
  include: string[];
  exclude: string[];
};

// Même règle que Cloudflare Pages : « * » couvre n'importe quelle suite de caractères.
const matches = (pattern: string, path: string) =>
  new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(path);

describe('_routes.json', () => {
  it('fait passer robots.txt et sitemap.xml par le middleware (redirection vers le domaine canonique)', () => {
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      expect(routes.include.some((pattern) => matches(pattern, path)), path).toBe(true);
      expect(routes.exclude.filter((pattern) => matches(pattern, path)), path).toEqual([]);
    }
  });
});
