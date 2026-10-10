import { useTranslation } from 'react-i18next';
import { LICENCE_OUVERTE_URL, ODBL_LICENSE_URL, OSM_COPYRIGHT_URL } from '@leblanc/shared';
import { useTrailCredits } from '../../hooks/useTrails';
import { DEFAULT_LANGUAGE, isSupportedLanguage } from '../../i18n/languages';

const linkStyle = 'text-creuse-800 underline underline-offset-4 hover:text-creuse-900 break-words';
const PNR_RELATION_URL = 'https://www.openstreetmap.org/relation/4287018';

/** Sources, licences, producteurs et crédits photo des parcours (page Crédits). */
export function WalksCredits() {
  const { t, i18n } = useTranslation('pages');
  const lang = isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const data = useTrailCredits(lang);

  return (
    <section className="space-y-5 rounded-2xl border border-brenne-900/5 bg-white p-6 shadow-md sm:p-8" aria-labelledby="walks-credit-title">
      <h2 id="walks-credit-title" className="font-display text-[28px] leading-tight text-brenne-950 sm:text-[32px]">{t('credits.walks.title')}</h2>
      <p className="leading-relaxed text-gray-700">{t('credits.walks.osm')}</p>
      <ul className="space-y-2 text-gray-700">
        <li><a className={linkStyle} href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">{t('credits.walks.osmLink')} ↗</a></li>
        <li><a className={linkStyle} href={ODBL_LICENSE_URL} target="_blank" rel="noopener noreferrer">Open Database License (ODbL) 1.0 ↗</a></li>
        <li><a className={linkStyle} href={PNR_RELATION_URL} target="_blank" rel="noopener noreferrer">{t('credits.walks.pnrRelation')} ↗</a></li>
      </ul>
      <p className="leading-relaxed text-gray-700">{t('credits.walks.gpx')}</p>
      <p className="leading-relaxed text-gray-700">{t('credits.walks.datatourisme')}</p>
      <a className={linkStyle} href={LICENCE_OUVERTE_URL} target="_blank" rel="noopener noreferrer">{t('credits.walks.datatourismeLink')} ↗</a>

      {data.isLoading && <p role="status" className="text-sm text-gray-700">{t('credits.walks.loading')}</p>}
      {data.isError && <p role="status" className="text-sm text-gray-700">{t('credits.walks.unavailable')}</p>}
      {data.data && (
        <>
          <div>
            <h3 className="mb-2 text-lg font-semibold text-brenne-950">{t('credits.walks.producers')}</h3>
            <ul className="list-inside list-disc space-y-1 text-gray-700">
              {data.data.producers.map((producer) => <li key={producer}>{producer}</li>)}
            </ul>
          </div>
          {data.data.credits.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-brenne-950">{t('credits.walks.photos')}</h3>
              <p className="text-sm leading-relaxed text-gray-700">{t('credits.walks.photosNote')}</p>
              <div className="overflow-x-auto rounded-xl border border-sable-200">
                <table className="w-full table-fixed text-left text-xs sm:text-sm">
                  <caption className="sr-only">{t('credits.walks.photos')}</caption>
                  <thead className="bg-sable-100 text-brenne-950">
                    <tr>
                      <th scope="col" className="w-1/2 p-2 sm:p-3">{t('credits.walks.credit')}</th>
                      <th scope="col" className="p-2 sm:p-3">{t('credits.walks.license')}</th>
                      <th scope="col" className="w-20 p-2 text-right sm:p-3">{t('credits.walks.count')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sable-200">
                    {data.data.credits.map((entry) => (
                      <tr key={`${entry.credit}|${entry.license ?? ''}`}>
                        <td className="break-words p-2 text-gray-800 sm:p-3">{entry.credit}</td>
                        <td className="break-words p-2 text-gray-700 sm:p-3">{entry.license ?? t('credits.walks.notProvided')}</td>
                        <td className="p-2 text-right text-gray-700 sm:p-3">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
