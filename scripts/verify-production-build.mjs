import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// kB décimaux : le seuil demandé est strictement supérieur à 50 000 octets.
export const MIN_SITEMAP_BYTES = 50_000;
export const MIN_SITEMAP_URLS = 800;
// Marge pour les nouvelles fiches : environ 2 300 URL avec les parcours (8 pages,
// ~140 événements, ~65 lieux, ~168 parcours, × 6 langues). Garde-fou contre une
// pagination emballée, très en dessous de la limite du protocole (50 000).
export const MAX_SITEMAP_URLS = 4_000;
const PRODUCTION_ORIGIN = 'https://leblanc-et-moi.pages.dev';
const DEFAULT_DIST = fileURLToPath(new URL('../frontend/dist/', import.meta.url));
const EVENT_PATH =
  /^\/(fr\/evenements|en\/events|es\/eventos|de\/veranstaltungen|it\/eventi|nl\/evenementen)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const WALK_PATH =
  /^\/(fr\/se-balader|en\/trails|es\/rutas|de\/touren|it\/percorsi|nl\/routes)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PLACE_PATH =
  /^\/(fr\/lieux|en\/places|es\/lugares|de\/orte|it\/luoghi|nl\/plekken)\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

async function requireFile(dist, name) {
  try {
    const info = await stat(resolve(dist, name));
    if (!info.isFile()) throw new Error('not-file');
    return info;
  } catch {
    throw new Error(`${name} absent ou illisible : publication annulée.`);
  }
}

export async function verifyProductionBuild(dist = DEFAULT_DIST) {
  const index = await requireFile(dist, 'index.html');
  if (index.size === 0) throw new Error('index.html est vide : publication annulée.');
  const sitemap = await requireFile(dist, 'sitemap.xml');
  if (sitemap.size <= MIN_SITEMAP_BYTES) {
    throw new Error(
      `Sitemap trop petit (${sitemap.size} octets, attendu > ${MIN_SITEMAP_BYTES}) : publication annulée. Vérifiez l’API et relancez le build.`,
    );
  }
  const xml = await readFile(resolve(dist, 'sitemap.xml'), 'utf8');
  // La taille seule ne prouve pas la présence de fiches : contrôler aussi leurs URLs.
  const locations = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)];
  const productionUrls = locations.flatMap(([, location]) => {
    try {
      const url = new URL(location);
      return url.origin === PRODUCTION_ORIGIN ? [url] : [];
    } catch {
      return [];
    }
  });
  const eventUrls = productionUrls.filter((url) => EVENT_PATH.test(url.pathname)).length;
  if (!eventUrls)
    throw new Error(
      'Aucune URL de fiche événement de production dans le sitemap : publication annulée.',
    );
  const placeUrls = productionUrls.filter((url) => PLACE_PATH.test(url.pathname)).length;
  if (!placeUrls)
    throw new Error('Aucune URL de fiche lieu de production dans le sitemap : publication annulée.');
  if (!productionUrls.some((url) => /^\/fr\/?$/.test(url.pathname))) {
    throw new Error(
      'Aucune URL de page principale /fr de production dans le sitemap : publication annulée.',
    );
  }
  // Fiches parcours comptées mais non exigées : une panne de l'ingestion des
  // parcours ne doit jamais bloquer la publication du site.
  const walkUrls = productionUrls.filter((url) => WALK_PATH.test(url.pathname)).length;
  const totalUrls = locations.length;
  if (totalUrls < MIN_SITEMAP_URLS || totalUrls > MAX_SITEMAP_URLS) {
    throw new Error(
      `Nombre d’URLs du sitemap hors plage (${totalUrls}, attendu entre ${MIN_SITEMAP_URLS} et ${MAX_SITEMAP_URLS} inclus) : publication annulée.`,
    );
  }
  return { sitemapBytes: sitemap.size, totalUrls, eventUrls, placeUrls, walkUrls };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await verifyProductionBuild();
    console.log(
      `Build validé : index.html non vide, sitemap de ${result.sitemapBytes} octets, ${result.totalUrls} URLs dont ${result.eventUrls} fiches événements, ${result.placeUrls} fiches lieux, ${result.walkUrls} fiches parcours et une page principale /fr.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de vérification du build.';
    console.error(`AVERTISSEMENT : ${message}`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      const safeMessage = message
        .replaceAll('%', '%25')
        .replaceAll('\r', '%0D')
        .replaceAll('\n', '%0A');
      console.error(`::warning title=Build non publiable::${safeMessage}`);
    }
    process.exitCode = 1;
  }
}
