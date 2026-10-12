import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAllowedOrigins } from '../../worker/src/http/cors.ts';

// La production utilise ALLOWED_ORIGINS de wrangler.jsonc, pas la liste par défaut du code :
// les deux doivent rester identiques.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('origines CORS du Worker', () => {
  it('wrangler.jsonc et .dev.vars.example reprennent la liste par défaut', () => {
    const wrangler = read('../../worker/wrangler.jsonc').match(/"ALLOWED_ORIGINS":\s*"([^"]*)"/)?.[1];
    const devVars = read('../../worker/.dev.vars.example').match(/^ALLOWED_ORIGINS=(.*)$/m)?.[1]?.trim();
    expect(wrangler?.split(',')).toEqual(getAllowedOrigins(undefined));
    expect(devVars?.split(',')).toEqual(getAllowedOrigins(undefined));
  });

  it('autorise le domaine officiel et conserve pages.dev', () => {
    expect(getAllowedOrigins(undefined)).toEqual(expect.arrayContaining([
      'https://leblanc-et-moi.fr',
      'https://www.leblanc-et-moi.fr',
      'https://leblanc-et-moi.pages.dev',
    ]));
  });
});
