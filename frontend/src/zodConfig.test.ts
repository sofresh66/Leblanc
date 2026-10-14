import { describe, expect, it, vi } from 'vitest';

describe('Zod sans JIT (CSP sans unsafe-eval)', () => {
  it('ne sonde pas new Function et valide toujours les réponses de l’API', async () => {
    const FunctionSpy = vi.spyOn(globalThis, 'Function');
    await import('./zodConfig');
    const { z } = await import('zod');
    const { EventGeoResponseSchema } = await import('@leblanc/shared');
    expect(z.config().jitless).toBe(true);

    const point = {
      id: '5b74b71f-9edc-4959-a081-6cd17bdc3dc1', lat: 46.63, lng: 1.06, category: 'fete',
      title: 'Marché', city: 'Le Blanc', startDate: '2026-10-15T08:00:00+02:00', endDate: null, allDay: false,
    };
    const ok = EventGeoResponseSchema.safeParse({ items: [point], truncated: false, generatedAt: 'x' });
    expect(ok.success).toBe(true);
    expect(ok.data?.items[0]?.timezone).toBe('Europe/Paris');

    const bad = EventGeoResponseSchema.safeParse({ items: [{ ...point, lat: 120 }], truncated: false, generatedAt: 'x' });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.path).toEqual(['items', 0, 'lat']);
    expect(FunctionSpy).not.toHaveBeenCalled();
  });
});
