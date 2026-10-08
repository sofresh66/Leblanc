// @vitest-environment jsdom
import { useRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRouteFocus } from './useRouteFocus';

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  useRouteFocus(mainRef);
  return (
    <>
      <a href="#main">Aller au contenu</a>
      <nav><Link to="/fr/carte">Carte</Link></nav>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <Routes>
          <Route path="/fr" element={<h1>Accueil</h1>} />
          <Route path="/fr/carte" element={<h1>Carte des événements</h1>} />
        </Routes>
      </main>
    </>
  );
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useRouteFocus', () => {
  it('ne déplace pas le focus au premier affichage, puis le pose sur le h1 après une navigation', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    render(<MemoryRouter initialEntries={['/fr']}><Shell /></MemoryRouter>);
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(document.activeElement).toBe(document.body);

    act(() => { screen.getByRole('link', { name: 'Carte' }).click(); });
    act(() => { vi.advanceTimersToNextFrame(); });
    const heading = screen.getByRole('heading', { level: 1, name: 'Carte des événements' });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('le lien d’évitement est le premier élément focalisable et vise <main>', () => {
    render(<MemoryRouter initialEntries={['/fr']}><Shell /></MemoryRouter>);
    const focusable = document.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])');
    expect(focusable[0]?.textContent).toBe('Aller au contenu');
    expect(focusable[0]?.getAttribute('href')).toBe('#main');
    expect(document.getElementById('main')?.tagName).toBe('MAIN');
  });
});
