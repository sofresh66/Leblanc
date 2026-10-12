# Domaine officiel https://leblanc-et-moi.fr — octobre 2026

Chantier : faire de **https://leblanc-et-moi.fr** (sans www) l'adresse canonique du site.
`www` et l'hôte de production `leblanc-et-moi.pages.dev` redirigeront en 301 vers l'apex
(étape 4). Les previews (`<hash>.` et `routes-preview.leblanc-et-moi.pages.dev`) ne sont pas
redirigées. L'API reste sur https://leblanc-api.elharchdenis.workers.dev.

Règles : aucun push, déploiement ni écriture en production sans accord explicite pour l'étape ;
aucun secret affiché ; codes de sortie vérifiés ; **rien le 15/10/2026** (CSP en mode bloquant).

## Étape 0 — état initial (12/10/2026, lecture seule)

- `https://leblanc-et-moi.fr` : 200 (Cloudflare Pages) ; `http://` → 301 vers `https://`.
- `https://www.leblanc-et-moi.fr` : 200 via Cloudflare (DNS public A/AAAA Cloudflare). Un
  résolveur local avait encore en cache une AAAA OVH (page « Site en construction », erreur de
  certificat) : simple propagation.
- `https://leblanc-et-moi.pages.dev` : 200, sans redirection.
- Le site en `.fr` déclarait encore `pages.dev` partout (canonical, hreflang, og:url, sitemap,
  `Sitemap:` de robots.txt) et ne pouvait pas appeler l'API (CORS).
- Variables de dépôt GitHub : `CLOUDFLARE_ACCOUNT_ID`, `SITEMAP_API_URL`, `VITE_API_URL`,
  `VITE_SITE_URL` (= `https://leblanc-et-moi.pages.dev`). Secrets (noms) : `CLOUDFLARE_AI_TOKEN`,
  `CLOUDFLARE_API_TOKEN`, `DATABASE_URL_DIRECT`, `DATATOURISME_API_KEY`.
- Branche `csp-enforce` (`39dd114`, aussi sur `origin`) : aucun nom d'hôte du site en dur.
- Sitemap `.fr` : 2 298 URL ; 318 testées en HEAD (5 à la fois) : les 48 pages de section des
  6 langues et 15 fiches par type et par langue → **toutes en 200**. `/fr/evenements` et
  `/fr/lieux` sans identifiant répondent 404 par conception et ne sont pas dans le sitemap.

## Étape 1 — CORS du Worker (déployée le 12/10/2026)

- Commit `15e4e99`, tag `domaine-fr-1-worker` : `https://leblanc-et-moi.fr` et
  `https://www.leblanc-et-moi.fr` ajoutés (`worker/wrangler.jsonc`, liste par défaut,
  `.dev.vars.example`) ; `pages.dev` et le motif des previews conservés. Test de concordance
  `wrangler.jsonc` ↔ code (`scripts/__tests__/worker-allowed-origins.test.mjs`).
- `verify-worker-deploy.sh` : sonde de propagation sur l'origine `.fr`, contrôles `.fr`/`www`
  (`/events`, `/routes`, prévol) et 4 origines piégées supplémentaires refusées.
- Version **`32ddcda0-0aa9-4f6b-a6c0-287cc29da2e8`** (100 %), 20:05 UTC. Stable au 7ᵉ essai ;
  `verify-worker-deploy.sh … données` : 30/30 ; « before »/« after » : seules les 8 lignes
  `.fr`/`www` changent (CORS ajouté).
- Retour arrière : `cd worker && npx wrangler rollback 3758615a-8bed-4d2b-87b7-6b113c2b3620`.

## Étape 2 — front (préparée en local le 12/10/2026, non publiée)

- Commit `ca799cf`, tag `domaine-fr-2-front` : origine `https://leblanc-et-moi.fr` dans
  `production.yml` (valeur attendue de `VITE_SITE_URL`), les valeurs par défaut (`vite.config.ts`,
  `PageSeo.tsx`, `functions/_middleware.ts`, `audit-seo.mjs`, `verify-production-build.mjs`),
  les tests, `.env.example`, `README.md` et le User-Agent Nominatim. robots.txt, sitemap et
  JSON-LD suivent `VITE_SITE_URL` sans modification de fichier.
- `scripts/check-seo.sh URL [SITE_ATTENDU]` : avec le 2ᵉ argument, vérifie que la canonical,
  les hreflang et og:url (carte, fiches événement, lieu et parcours), toutes les adresses du
  sitemap et la ligne `Sitemap:` de robots.txt pointent vers cette origine. Contrôlé contre la
  production actuelle : passe avec `pages.dev`, 10 échecs avec `.fr` (attendu avant publication).
- Tests : 661/661 avec et sans les variables du workflow (code 0) ; lint 0 ; typecheck 0.
- e2e : 57/58. Seul échec : `lot3.spec.ts` « HomePage », section « Ce week-end » absente.
  Échec identique sans ce lot : aucun des 15 premiers événements réels ne commence un samedi ou
  un dimanche. Test dépendant des données, sans lien avec le domaine.
- Build avec les variables de production : code 0 ; `verify-production-build` : 2 298 URL ;
  `verify-preview-dist` : 0 URL locale ; aucune occurrence de `pages.dev` dans `dist/`.
- Preview **`b2a4957f`** (alias `routes-preview`) :
  `check-seo.sh https://routes-preview.leblanc-et-moi.pages.dev https://leblanc-et-moi.fr` →
  tous les contrôles passés ; JSON-LD en `.fr` ; `X-Robots-Tag: noindex` ; l'API se charge.
  Le middleware de la preview émet bien `.fr` : l'environnement Preview du projet Pages ne
  force donc pas `SITE_URL` sur `pages.dev`. L'environnement **Production** reste à confirmer.

### Séquence de publication (préparée, non exécutée)

Conditions : accord explicite ; pas le 15/10 ; ni entre 02:30 et 03:30 heure de Paris, **ni tant
que le run planifié du jour n'est pas terminé** (le cron de 03:00 démarre souvent avec plusieurs
heures de retard : 06:52 et 07:01 UTC les 11 et 12/10) ; aucun run `production` ou
`translations-weekly` en cours ou en file ; `SITE_URL` du projet Pages (Production) absent ou
égal à `https://leblanc-et-moi.fr`.

```bash
gh run list --repo sofresh66/Leblanc --workflow production.yml --limit 3
gh run list --repo sofresh66/Leblanc --status in_progress
gh run list --repo sofresh66/Leblanc --status queued
git fetch origin && git rev-list --left-right --count origin/main...main
npm exec --workspace=@leblanc/frontend -- wrangler pages deployment list --project-name leblanc-et-moi --environment production
```

Noter l'identifiant du déploiement Pages de production en tête de liste : c'est la cible du
retour arrière (aujourd'hui `26041166`, il change à chaque run nocturne). Puis, dans la même minute :

```bash
gh variable set VITE_SITE_URL --repo sofresh66/Leblanc --body 'https://leblanc-et-moi.fr'
git push origin main
git push origin domaine-fr-1-worker domaine-fr-2-front
```

Contrôles, puis lancement et suivi :

```bash
gh variable list --repo sofresh66/Leblanc
git ls-remote origin refs/heads/main
gh workflow run production.yml --repo sofresh66/Leblanc --ref main
gh run list --repo sofresh66/Leblanc --workflow production.yml --limit 1
gh run watch <RUN_ID> --repo sofresh66/Leblanc --exit-status
bash scripts/check-seo.sh https://leblanc-et-moi.fr https://leblanc-et-moi.fr
```

**Décalage variable ↔ push (contrôle de la ligne 51).** L'étape « Vérifier la configuration »
est la 3ᵉ du workflow : elle s'exécute avant `npm ci`, les migrations, les ingestions et la
publication. Un décalage entre la variable et le code fait donc échouer le run en quelques
secondes, sans aucune écriture (ni base, ni Pages) ; le site en ligne reste celui de la veille.
Il suffit de remettre les deux en accord et de relancer. Aucun commit d'assouplissement
(accepter les deux valeurs) n'est proposé : il laisserait partir sans alerte un build en
`pages.dev` avec le code `.fr`. Si le push échoue après la modification de la variable :
remettre aussitôt la variable à `https://leblanc-et-moi.pages.dev`.

### Retours arrière

1. Pages : tableau de bord → leblanc-et-moi → Deployments → déploiement noté avant publication
   (`26041166`, ou `ed9ba912`) → Rollback.
2. Dans la foulée : `gh variable set VITE_SITE_URL --repo sofresh66/Leblanc --body 'https://leblanc-et-moi.pages.dev'`.
   Le run nocturne suivant échoue alors à la vérification de configuration, sans écriture, et
   ne republie pas le `.fr` par-dessus le rollback.
3. Ensuite : `git revert ca799cf`, push et relance du workflow pour retrouver des runs verts.

## Reste à faire

- Denis : valeurs de `SITE_URL` et `API_URL` dans Pages → leblanc-et-moi → Settings →
  Variables, **environnement Production** (et Preview).
- Denis : validation visuelle de la preview, puis accord pour la publication.
- Étape 3 (à partir du 16/10) : vérifications sur `.fr`, CORS en navigateur, Web Analytics.
- Étape 4 (après l'étape 3) : redirections 301 (Redirect Rule de zone `www` créée par Denis,
  middleware en filet de sécurité, `/robots.txt` et `/sitemap.xml` retirés des exclusions de
  `_routes.json`).
- Search Console : propriété de domaine `leblanc-et-moi.fr`, soumission du sitemap `.fr`.
