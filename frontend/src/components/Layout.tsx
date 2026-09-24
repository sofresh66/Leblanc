import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useLocalizedPath } from '../hooks/useLocalizedPath';

export function Layout() {
  const { t } = useTranslation(['common', 'nav']);
  const getLocalizedPath = useLocalizedPath();

  const navItems = [
    { to: getLocalizedPath('home'), label: t('nav:home'), end: true },
    { to: getLocalizedPath('map'), label: t('nav:map'), end: false },
    { to: getLocalizedPath('list'), label: t('nav:list'), end: false },
    { to: getLocalizedPath('about'), label: t('nav:about'), end: false },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <NavLink
              to={getLocalizedPath('home')}
              className="text-xl font-bold text-blue-600 hover:text-blue-700 tracking-tight"
            >
              {t('common:app.name')}
            </NavLink>
            <nav className="hidden md:flex space-x-6">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `text-sm font-medium transition-colors ${
                      isActive ? 'text-blue-600 font-semibold' : 'text-gray-600 hover:text-gray-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center text-sm text-gray-500 gap-4">
          <p>
            &copy; {new Date().getFullYear()} {t('common:app.name')} — {t('common:footer.rights')}
          </p>
          <div className="flex space-x-6">
            <span className="hover:text-gray-700">{t('common:footer.sources')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
