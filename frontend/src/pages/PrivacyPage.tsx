import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageSeo } from '../components/PageSeo';
import { useLocalizedPath } from '../hooks/useLocalizedPath';

const linkStyle = 'inline-flex min-h-11 items-center text-creuse-800 underline underline-offset-4 hover:text-creuse-900 break-words';
const sectionStyle = 'rounded-2xl border border-brenne-900/5 bg-white p-6 sm:p-8 shadow-md space-y-5';
const titleStyle = 'font-display text-[28px] sm:text-[32px] text-brenne-950 leading-tight';

export function PrivacyPage() {
  const { t } = useTranslation('pages');
  const getLocalizedPath = useLocalizedPath();

  return (
    <article className="space-y-10 sm:space-y-12 py-6 sm:py-8 pb-12">
      <PageSeo section="privacy" />
      <header className="rounded-2xl bg-sable-100 border border-sable-200 p-6 py-12 sm:p-12 lg:p-16 space-y-6">
        <h1 className="section-title text-4xl sm:text-[40px] [overflow-wrap:anywhere] max-w-3xl">{t('privacy.title')}</h1>
        <p className="max-w-3xl text-base sm:text-lg leading-relaxed text-gray-700">{t('privacy.description')}</p>
      </header>

      <section className={sectionStyle} aria-labelledby="privacy-storage-title">
        <h2 id="privacy-storage-title" className={titleStyle}>{t('privacy.storage.title')}</h2>
        <p className="text-gray-700 leading-relaxed">{t('privacy.storage.body')}</p>
        <p className="text-gray-700 leading-relaxed">{t('privacy.storage.delete')}</p>
      </section>

      <section className={sectionStyle} aria-labelledby="privacy-tracking-title">
        <h2 id="privacy-tracking-title" className={titleStyle}>{t('privacy.tracking.title')}</h2>
        <p className="text-gray-700 leading-relaxed">{t('privacy.tracking.body')}</p>
      </section>

      <section className={sectionStyle} aria-labelledby="privacy-services-title">
        <h2 id="privacy-services-title" className={titleStyle}>{t('privacy.services.title')}</h2>
        <p className="text-gray-700 leading-relaxed">{t('privacy.services.body')}</p>
        <p className="text-gray-700 leading-relaxed">{t('privacy.services.walks')}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <a className={linkStyle} href="https://www.cloudflare.com/privacypolicy/">{t('privacy.services.cloudflare')}</a>
          <a className={linkStyle} href="https://osmfoundation.org/wiki/Privacy_Policy">{t('privacy.services.osm')}</a>
        </div>
      </section>

      <section className="rounded-2xl bg-sable-100 border border-sable-200 p-6 sm:p-8 space-y-5" aria-labelledby="privacy-contact-title">
        <h2 id="privacy-contact-title" className={titleStyle}>{t('privacy.contact.title')}</h2>
        <p className="text-gray-700 leading-relaxed">{t('privacy.contact.body')}</p>
        <a className={`${linkStyle} break-all`} href="mailto:elharchdenis@gmail.com">elharchdenis@gmail.com</a>
        <div><Link className={linkStyle} to={`${getLocalizedPath('credits')}#legal-notice`}>{t('privacy.creditsLink')}</Link></div>
      </section>
    </article>
  );
}
