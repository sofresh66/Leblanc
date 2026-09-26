import { useTranslation } from 'react-i18next';

export function LegalNotice() {
  const { t } = useTranslation('pages');

  return (
    <dl className="space-y-5 text-base leading-relaxed text-gray-700">
      <div>
        <dt className="font-semibold text-brenne-950">{t('legal.publisher')}</dt>
        <dd>Denis El Harch — {t('legal.personalProject')}</dd>
      </div>
      <div>
        <dt className="font-semibold text-brenne-950">{t('legal.contact')}</dt>
        <dd><a className="inline-flex min-h-11 items-center break-all text-creuse-800 underline underline-offset-4 hover:text-creuse-900" href="mailto:elharchdenis@gmail.com">elharchdenis@gmail.com</a></dd>
      </div>
      <div>
        <dt className="font-semibold text-brenne-950">{t('legal.director')}</dt>
        <dd>Denis El Harch</dd>
      </div>
      <div>
        <dt className="font-semibold text-brenne-950">{t('legal.host')}</dt>
        <dd>Cloudflare, Inc.<br />101 Townsend St, San Francisco, CA 94107, USA</dd>
      </div>
      <div>
        <dt className="font-semibold text-brenne-950">{t('legal.database')}</dt>
        <dd>Neon — {t('legal.databaseLocation')}</dd>
      </div>
    </dl>
  );
}
