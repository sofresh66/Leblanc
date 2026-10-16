import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from './canonicalUrl';

describe('adresse de contact', () => {
  it('est l’adresse publique du domaine', () => {
    expect(CONTACT_EMAIL).toBe('contact@leblanc-et-moi.fr');
  });
});
