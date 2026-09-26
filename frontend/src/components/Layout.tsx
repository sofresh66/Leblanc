import { Suspense, useEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLocalizedPath } from '../hooks/useLocalizedPath';
import { prefetchPage } from '../routes/pageImports';

function prefetchLink(event: FocusEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>) {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a');
  if (link instanceof HTMLAnchorElement && link.origin === window.location.origin) prefetchPage(link.pathname);
}

export function Layout() {
  const { t } = useTranslation(['common', 'nav']);
  const getLocalizedPath = useLocalizedPath();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const firstMobileLink = useRef<HTMLAnchorElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  const navItems = [
    { to: getLocalizedPath('home'), label: t('nav:home'), end: true },
    { to: getLocalizedPath('map'), label: t('nav:map'), end: false },
    { to: getLocalizedPath('list'), label: t('nav:list'), end: false },
    { to: getLocalizedPath('about'), label: t('nav:about'), end: false },
  ];

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    firstMobileLink.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const main = document.querySelector('main');
    const footer = document.querySelector('footer');
    main?.setAttribute('inert', '');
    footer?.setAttribute('inert', '');
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      main?.removeAttribute('inert');
      footer?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen flex flex-col bg-sable-50 text-gray-900" onMouseOver={prefetchLink} onFocus={prefetchLink}>
      <header className="sticky top-0 z-50 border-b border-brenne-900/10 bg-white/90 backdrop-blur-xl shadow-[0_4px_20px_rgba(27,50,13,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-[72px] flex items-center justify-between gap-4 max-[360px]:gap-1">
          <NavLink
            to={getLocalizedPath('home')}
            aria-label={t('common:app.name')}
            onClick={() => setMenuOpen(false)}
            className="shrink-0 font-display text-[22px] sm:text-2xl font-bold tracking-tight text-brenne-950 hover:text-brenne-800 transition-colors"
          >
            Le Blanc <span className="text-brenne-700">&amp;</span> Moi
          </NavLink>

          <nav aria-label={t('nav:menu')} className="hidden md:flex items-center gap-8 lg:gap-10">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative py-2 text-sm font-semibold transition-colors after:absolute after:bottom-0 after:left-0 after:h-0.5 after:bg-brenne-700 after:transition-transform after:duration-200 after:origin-left ${
                    isActive
                      ? 'text-brenne-900 after:w-full after:scale-x-100'
                      : 'text-gray-600 hover:text-brenne-900 after:w-full after:scale-x-0 hover:after:scale-x-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 max-[360px]:gap-1">
            <LanguageSwitcher />
            <button
              ref={menuButton}
              type="button"
              className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-brenne-200 text-brenne-900 hover:bg-brenne-50 transition-colors"
              aria-label={menuOpen ? t('common:actions.close') : t('nav:menu')}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" d="M5 5l14 14M19 5L5 19" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="mobile-navigation"
            aria-label={t('nav:menu')}
            className="md:hidden fixed inset-x-0 top-16 bottom-0 min-h-[calc(100dvh-4rem)] overflow-y-auto bg-sable-50 px-6 pt-12 pb-20 shadow-xl"
          >
            <div className="mx-auto max-w-lg space-y-2">
              {navItems.map((item, index) => (
                <NavLink
                  key={item.to}
                  ref={index === 0 ? firstMobileLink : undefined}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center justify-between border-b border-brenne-900/10 py-5 font-display text-3xl font-bold ${
                      isActive ? 'text-brenne-800' : 'text-brenne-950 hover:text-brenne-700'
                    }`
                  }
                >
                  {item.label}
                  <span aria-hidden="true" className="font-sans text-xl font-normal">↗</span>
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Suspense fallback={<div role="status" className="py-12 text-center">{t('common:actions.loading')}</div>}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="bg-white border-t border-brenne-900/10 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-600 gap-4">
          <p>&copy; {new Date().getFullYear()} {t('common:app.name')} — {t('common:footer.rights')}</p>
          <div className="flex flex-col items-center gap-1 text-center sm:items-end sm:text-right">
            <span>{t('common:footer.sources')}</span>
            <Link to={getLocalizedPath('privacy')} className="inline-flex min-h-11 items-center text-creuse-800 underline underline-offset-4 hover:text-creuse-900">{t('nav:privacy')}</Link>
            <Link to={getLocalizedPath('credits')} className="inline-flex min-h-11 items-center text-creuse-800 underline underline-offset-4 hover:text-creuse-900">{t('nav:credits')}</Link>
            <span className="text-xs text-gray-500">
              <a
                href="https://commons.wikimedia.org/wiki/File:Le_Blanc_(Indre)._(35763042230).jpg"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-creuse-800 hover:underline"
              >
                {t('common:footer.heroPhotoCredit', { author: 'Daniel Jolivet', license: 'CC BY 2.0' })}
              </a>{' '}
              <a
                href="https://creativecommons.org/licenses/by/2.0/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="CC BY 2.0"
                className="hover:text-creuse-800 hover:underline"
              >
                ↗
              </a>
            </span>
            <p className="mt-2 text-xs leading-relaxed text-gray-600">
              {t('common:footer.madeBy', { author: 'Denis El Harch' })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
