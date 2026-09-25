import { afterEach, describe, expect, it, vi } from 'vitest';

describe('eventsRepository (point de bascule)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('utilise le mock local quand VITE_USE_MOCK vaut "true"', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    vi.resetModules();

    const { eventsRepository } = await import('./index');
    const { MockEventsRepository } = await import('./eventsRepository');

    expect(eventsRepository).toBeInstanceOf(MockEventsRepository);
  });

  it('utilise l’API Worker réelle dans tous les autres cas', async () => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
    vi.resetModules();

    const { eventsRepository } = await import('./index');
    const { ApiEventsRepository } = await import('./apiEventsRepository');

    expect(eventsRepository).toBeInstanceOf(ApiEventsRepository);
  });
});
