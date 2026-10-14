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

## Étape 2 — front (publiée le 12/10/2026)

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

### Publication (12/10/2026, 20:26–20:38 UTC)

- Contrôles préalables : aucun run en cours ni en file ; Pages en production
  `26041166-c5c1-42a0-8d4e-d80f3b5acadc` (source `c231a3b`) ; `VITE_SITE_URL` =
  `https://leblanc-et-moi.pages.dev` ; `origin/main` = `c231a3b`, `main` locale 4 commits devant,
  0 derrière.
- 20:26:55–20:27:00 UTC : `gh variable set VITE_SITE_URL` → `https://leblanc-et-moi.fr` (exit 0),
  `git push origin main` `c231a3b..7d36800` (exit 0), tags `domaine-fr-1-worker` et
  `domaine-fr-2-front` poussés (exit 0).
- Run `workflow_dispatch` [38304336567](https://github.com/sofresh66/Leblanc/actions/runs/38304336567) :
  **succès** en 10 min 04 s, toutes les étapes vertes (parcours compris). Build validé :
  2 298 URL (858 fiches événements, 390 lieux, 1 002 parcours).
- Pages production : **`dd2ed07d-26d5-46fc-b6ec-f9f6cf3a10f4`**, source `7d36800`.
- Vérifications sur https://leblanc-et-moi.fr :
  - `check-seo.sh https://leblanc-et-moi.fr https://leblanc-et-moi.fr` : tous les contrôles
    passés (exit 0) ;
  - sitemap : 18 384 adresses, toutes sur `https://leblanc-et-moi.fr` ; robots.txt :
    `Sitemap: https://leblanc-et-moi.fr/sitemap.xml` ;
  - accueil, liste, carte (FR/EN), Se balader, fiches événement (FR/IT), parcours et lieu :
    200, canonical `.fr`, 7 hreflang, `index, follow` ; `/fr/page-inconnue` : 404
    `noindex, follow` (sa canonical vers `/fr` existait déjà avant, seul l'hôte change) ;
  - GPX : 200 `application/gpx+xml` ; lien GPX et tracé présents sur la fiche ;
  - navigateur : API chargée depuis `.fr` (`/events`, `/events/geo`, `/routes/:id`,
    `/nearby` en 200), carte avec 23 marqueurs et ses tuiles, aucune erreur de console ;
    Web Analytics : `cloudflareinsights.com/cdn-cgi/rum` → **204** ;
  - `leblanc-et-moi.pages.dev` et `www` : toujours 200 (redirections : étape 4), canonical `.fr`.
- Cible de retour arrière : Pages `26041166-c5c1-42a0-8d4e-d80f3b5acadc`, puis
  `VITE_SITE_URL` remise à `https://leblanc-et-moi.pages.dev`.

### Retours arrière

1. Pages : tableau de bord → leblanc-et-moi → Deployments → déploiement noté avant publication
   (`26041166`, ou `ed9ba912`) → Rollback.
2. Dans la foulée : `gh variable set VITE_SITE_URL --repo sofresh66/Leblanc --body 'https://leblanc-et-moi.pages.dev'`.
   Le run nocturne suivant échoue alors à la vérification de configuration, sans écriture, et
   ne republie pas le `.fr` par-dessus le rollback.
3. Ensuite : `git revert ca799cf`, push et relance du workflow pour retrouver des runs verts.

### Premier run planifié en `.fr` (13/10/2026)

Run [38362601269](https://github.com/sofresh66/Leblanc/actions/runs/38362601269) (`schedule`,
source `7d36800`) : démarré à 07:25:56 UTC, **succès** en 11 min 56 s, avec
`VITE_SITE_URL = https://leblanc-et-moi.fr`. Pages production : `c88fe7a5-4e8f-4b15-be08-ded052dc4fd3`.

## Favicon LB (publié le 13/10/2026)

- Design validé par Denis : disque `#2D5016`, lettres « LB » `#F4EFE0`. Source
  `design/favicon-source.svg` (aucune police, aucun texte, script, image ou référence externe ;
  viewBox 64×64). Lisible à 16 px (empattements fondus), net à 32 px. Variante avec 5 % de marge
  en plus étudiée puis écartée (moins lisible à 16 px) ; l'icône iPhone n'est pas rognée.
- Fichiers de `frontend/public/` : `favicon.svg`, `favicon.ico` (16/32/48), `favicon-48.png`,
  `apple-touch-icon.png` (180×180, opaque, fond vert plein), `icon-192.png`, `icon-512.png`.
  Regénération : `node scripts/generate-favicons.mjs` (Chromium via Playwright, sortie
  identique octet pour octet).
- Déclaration unique dans `frontend/index.html` (6 balises), conservée par le middleware ;
  fichiers exclus du middleware dans `_routes.json` (13 règles sur 100). Pas de manifest.
- Commits : `24a22ba` (icônes, tag `favicon-lb-1`), `797f6bb` (source et script),
  `7f051a3` (fusion de `favicon-lb` dans `main`, sans réécriture), avec la doc `129bbb6`.
- Preview `67fdc127` (alias `favicon-preview`) validée par Denis.
- Publication : push `7d36800..7f051a3` et tag `favicon-lb-1` ; run `workflow_dispatch`
  [38450730205](https://github.com/sofresh66/Leblanc/actions/runs/38450730205) : **succès**
  (fin 19:08:45 UTC) ; Pages production **`a5448caf-3d09-4eb4-a3c5-30e1741b0272`** (source `7f051a3`).
- Vérifications sur https://leblanc-et-moi.fr : les 6 fichiers en 200, identiques au dépôt
  (`image/svg+xml`, `image/vnd.microsoft.icon`, `image/png`) ; les 6 balises une seule fois sur
  `/fr`, `/fr/page-inconnue` (404) et `/fr/se-balader` ;
  `check-seo.sh https://leblanc-et-moi.fr https://leblanc-et-moi.fr` : exit 0 ; navigateur :
  console sans erreur, API 200, `cdn-cgi/rum` 204.
- Retour arrière : Pages → `c88fe7a5-4e8f-4b15-be08-ded052dc4fd3`, puis `git revert -m 1 7f051a3`.

## Accueil diversifié (publié le 13/10/2026)

- Cause : les marchés sont ingérés comme une occurrence unique du 01/01 au 31/12 ; toujours
  « en cours », ils étaient ex æquo en tête de l'API (clé `GREATEST(début, maintenant)`, départage
  par UUID) et occupaient le Top et les Derniers ajouts tous les jours.
- Correctif front seul (`frontend/src/utils/homeSelection.ts`, `HomePage.tsx`) ; Worker, base,
  ingestion, liste, carte et SEO inchangés :
  - Top du moment : 3 cartes parmi 40 événements, ponctuels des 14 prochains jours en priorité,
    1 carte par catégorie et par titre normalisé, 1 événement au long cours (plus de 14 jours),
    ordre stable sur la journée (graine : date UTC + langue) ;
  - marchés : rotation entre tous les marchés de la zone (`NEARBY_MARKET_METERS` = 20 km) et
    **un seul marché sur toute la page** (Derniers ajouts et Ce week-end n'en ajoutent pas) ;
  - Ce week-end : appel `from`/`to` sur le week-end à venir ou en cours, évite les cartes du Top ;
  - Derniers ajouts : ordre de l'API, sans répéter le Top ;
  - plafonds relâchés en dernier recours, dédoublonnage des titres jamais relâché ; squelettes
    de chargement (CLS ≈ 0) ; 2 appels API sur l'accueil au lieu d'un.
- Tests : 684 unitaires, e2e 58/58 (le test « Ce week-end » de `lot3` ne dépend plus des données).
  Simulation 14→23/10 : 4 marchés différents dans le Top en fr, 5 en en, 1 seul par page.
- Commits `dd91997`, `7a77875`, `84bb25e` (tags `accueil-diversifie-1` à `-3`), fusion `e58c0e9`
  (avec la doc `1e5f9d5`). Preview `fc2e1c7b` (alias `home-preview`) validée par Denis.
- Publication : push `7f051a3..e58c0e9` et des 3 tags ; run `workflow_dispatch`
  [38466757896](https://github.com/sofresh66/Leblanc/actions/runs/38466757896) : **succès**
  (fin 21:07:51 UTC ; `gh run watch` interrompu deux fois par des erreurs 502/504 de l'API
  GitHub, suivi repris sans relancer le run) ; Pages production
  **`9ce78655-4450-40b0-b0bf-4f78a0501a0f`** (source `e58c0e9`).
- Vérifications sur https://leblanc-et-moi.fr :
  - accueil fr et en : 1 seul marché sur la page, les 3 sections remplies (3 cartes chacune),
    aucun doublon, 2 appels API (200), console sans erreur, `cdn-cgi/rum` 204, CLS 0,0003 ;
  - `check-seo.sh https://leblanc-et-moi.fr https://leblanc-et-moi.fr` : exit 0 ;
  - `/fr/liste`, `/fr/carte`, `/en/map` et une fiche d'événement : 200 ; la liste garde l'ordre
    de l'API ; les 6 icônes en 200 avec le bon type.
- Retour arrière : Pages → `a5448caf-3d09-4eb4-a3c5-30e1741b0272`, puis `git revert -m 1 e58c0e9`.

## CSP en mode bloquant (15/10/2026)

- Contrôle préalable : aucun run en cours ; run planifié du 14/10
  [38519090335](https://github.com/sofresh66/Leblanc/actions/runs/38519090335) vert, source
  `e58c0e9` ; Pages production **`1ba2ed90-84af-4e5b-866b-d509d081f6d7`** (publiée par ce run ;
  `9ce78655` de la consigne était périmé), retenue comme cible de retour arrière.
- Lot : `f87068b` (bascule `Content-Security-Policy`, rebase sans conflit de `39dd114` sur
  `e58c0e9`) et `404e50f` (`z.config({ jitless: true })` dans `frontend/src/zodConfig.ts`, importé
  en premier par `main.tsx` : Zod 4.5.1 lit le réglage à la construction des schémas ; sans JIT il
  ne sonde plus `new Function("")`, que la CSP bloquait sur chaque page ; validation inchangée,
  test `zodConfig.test.ts`). Directives et hôtes inchangés ; ni Worker, ni base, ni redirection.
- Contrôles : lint, typecheck, 685 tests unitaires (exit 0) ; e2e 58/58 (premier passage :
  `lot3` « 4. Filtrage sur ListPage » instable sous charge, vert 3/3 seul puis 58/58 au second
  passage) ; build et `verify-production-build.mjs` OK ; aucun `package.json`/lock modifié.
- Preview `9e95236a` (alias `csp-preview`) : `Content-Security-Policy` sans Report-Only sur les 7
  pages, aucune violation (dont `eval`), carte, photos, tracé, GPX et icônes OK ; seule erreur :
  CORS Analytics propre à l'hôte de preview.
- Publication : fusion `5b4da51` (avec la doc `019f0bd`), push `e58c0e9..5b4da51` et du tag
  `csp-enforce-1` ; run `workflow_dispatch`
  [38648197004](https://github.com/sofresh66/Leblanc/actions/runs/38648197004) : **succès**
  (fin 22:42:44 UTC) ; Pages production **`5d78b464-9508-43fc-bd5b-706acdfe5576`** (source `5b4da51`).
- Vérifications sur https://leblanc-et-moi.fr : `Content-Security-Policy` présent et Report-Only
  absent sur accueil, carte, fiche événement, fiche lieu, Se balader avec tracé, liste et 404 ;
  aucune violation CSP en navigateur ; 16 tuiles et 23 marqueurs sur la carte, tracé et GPX
  (200 `application/gpx+xml`) ; photos Tourinsoft chargées ; `cdn-cgi/rum` 204 ;
  `check-seo.sh https://leblanc-et-moi.fr https://leblanc-et-moi.fr` exit 0 ; sitemap, robots.txt
  et les 6 icônes en 200.
- Retour arrière : Pages → `1ba2ed90-84af-4e5b-866b-d509d081f6d7`, puis `git revert -m 1 5b4da51`.
- Rapports CSP : toujours dans les journaux du Worker (`csp_violation`), à relire dans
  Workers › leblanc-api › Observability.

## Reste à faire

- `SITE_URL` et `API_URL` du projet Pages : vides (vérifié par Denis le 12/10/2026).
- CSP en mode bloquant : publiée le 15/10/2026 (voir plus haut) ; relire les rapports `csp_violation`.
- Étape 3 (à partir du 16/10) : vérifications sur `.fr`, CORS en navigateur, Web Analytics.
- Étape 4 (après l'étape 3) : redirections 301 (Redirect Rule de zone `www` créée par Denis,
  middleware en filet de sécurité, `/robots.txt` et `/sitemap.xml` retirés des exclusions de
  `_routes.json`).
- Search Console : propriété de domaine `leblanc-et-moi.fr`, soumission du sitemap `.fr`.
