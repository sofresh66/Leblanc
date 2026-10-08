import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/** Nombre d'images (~1 s) pendant lesquelles on attend le h1 d'une page chargée à la demande. */
const MAX_FRAMES = 60;

/**
 * Après chaque navigation (pas au premier affichage), place le focus sur le
 * h1 de la page, ou sur <main> à défaut : les lecteurs d'écran annoncent ainsi
 * la nouvelle page, comme lors d'un chargement classique.
 */
export function useRouteFocus(mainRef: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return undefined;
    }
    let frame = 0;
    let handle = 0;
    const focusHeading = () => {
      const main = mainRef.current;
      if (!main) return;
      const heading = main.querySelector('h1');
      if (!heading && frame++ < MAX_FRAMES) {
        handle = requestAnimationFrame(focusHeading);
        return;
      }
      const target: HTMLElement = heading ?? main;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };
    handle = requestAnimationFrame(focusHeading);
    return () => cancelAnimationFrame(handle);
  }, [pathname, mainRef]);
}
