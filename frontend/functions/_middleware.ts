import { securityHeaders, type SupportedLanguage } from '@leblanc/shared';
import { planPage, type PlanDeps } from './lib/page-plan';

// Middleware Cloudflare Pages : pour chaque page HTML (les fichiers statiques
// sont exclus par _routes.json), pose le bon statut HTTP (vraies 404), les
// balises <head> de la page et les en-têtes de sécurité. Panne de l'API :
// HTML générique en 200, sans désindexer la fiche.

interface Env {
  ASSETS: Fetcher;
  /** URL de l'API avec /api (ex. https://leblanc-api.elharchdenis.workers.dev/api). */
  API_URL?: string;
  SITE_URL?: string;
}

const DEFAULT_API_URL = 'https://leblanc-api.elharchdenis.workers.dev/api';
const DEFAULT_SITE_URL = 'https://leblanc-et-moi.pages.dev';
const API_CACHE_SECONDS = { found: 3600, missing: 300 };

// Traductions mises en cache par isolate : elles ne changent qu'au déploiement.
const localeCache = new Map<string, Promise<Record<string, unknown> | null>>();

function loadLocale(env: Env, origin: string, lang: SupportedLanguage, namespace: string) {
  const key = `${lang}/${namespace}`;
  let pending = localeCache.get(key);
  if (!pending) {
    pending = env.ASSETS.fetch(new Request(`${origin}/locales/${key}.json`))
      .then(async (response) => (response.ok ? await response.json() as Record<string, unknown> : null))
      .catch(() => null);
    localeCache.set(key, pending);
  }
  return pending;
}

async function fetchApi(apiUrl: string, path: string, waitUntil: (promise: Promise<unknown>) => void) {
  const url = `${apiUrl.replace(/\/+$/, '')}${path}`;
  const cache = caches.default;
  const cacheKey = new Request(url);
  const cached = await cache.match(cacheKey);
  const response = cached ?? await fetch(url, { headers: { Accept: 'application/json' } });
  if (!cached && (response.status === 200 || response.status === 404)) {
    const ttl = response.status === 200 ? API_CACHE_SECONDS.found : API_CACHE_SECONDS.missing;
    const copy = new Response(response.clone().body, response);
    copy.headers.set('Cache-Control', `public, max-age=${ttl}`);
    waitUntil(cache.put(cacheKey, copy));
  }
  return { status: response.status, body: response.status === 200 ? await response.json() : null };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const response = await context.next();
  const isPage = (request.method === 'GET' || request.method === 'HEAD')
    && (response.headers.get('Content-Type') ?? '').includes('text/html');
  if (!isPage) return response;

  const url = new URL(request.url);
  const apiUrl = env.API_URL || DEFAULT_API_URL;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders(new URL(apiUrl).origin))) headers.set(name, value);

  const deps: PlanDeps = {
    siteUrl: env.SITE_URL || DEFAULT_SITE_URL,
    loadLocale: (lang, namespace) => loadLocale(env, url.origin, lang, namespace),
    fetchApi: (path) => fetchApi(apiUrl, path, (promise) => context.waitUntil(promise)),
  };
  let plan = null;
  try {
    plan = await planPage(url.pathname, deps);
  } catch (error) {
    // Panne réseau vers l'API ou réponse inattendue : HTML générique.
    console.warn(JSON.stringify({ step: 'seo_middleware_failed', path: url.pathname, message: String(error) }));
  }
  if (!plan) return new Response(response.body, { status: response.status, headers });

  if (plan.status === 404) headers.set('Cache-Control', 'no-store');
  const head = plan.head;
  return new HTMLRewriter()
    .on('html', { element(element) { element.setAttribute('lang', plan.lang); } })
    .on('title', { element(element) { element.setInnerContent(head.title); } })
    .on('head', { element(element) { element.append(head.tagsHtml, { html: true }); } })
    .transform(new Response(response.body, { status: plan.status, headers }));
};
