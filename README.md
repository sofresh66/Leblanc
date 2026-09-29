# Le Blanc & Moi — Application Événements (Lot 1 — Socle)

Application web répertoriant les événements dans un rayon de 20 km autour du Blanc (36300, France).

## Architecture du Monorepo

Le projet est structuré sous forme de monorepo npm workspaces :

- `frontend/` : Application Single Page React + Vite + TypeScript + Tailwind CSS
- `worker/` : API backend Cloudflare Worker (runtime Edge serverless)
- `shared/` : Bibliothèque partagée de code, types et schémas communs
- `scripts/` : Scripts utilitaires (ingestion, maintenance)

## Prérequis

- **Node.js** : `>=24 <25` (testé sur Node v24.21.0)
- **npm** : `>=11` (testé sur npm 11.19.0)
- **Git**

## Installation

Pour installer l'ensemble des dépendances avec versions exactes :

```bash
npm install
```

## Commandes de Développement

> **Note importante** : `npm run dev` démarre uniquement le serveur de développement Vite du frontend. Le Worker API doit être lancé indépendamment.

- **Frontend (Vite)** :
  ```bash
  npm run dev
  ```
  Accessible sur `http://localhost:5173` (proxy `/api` vers `http://localhost:8787`).

- **Backend (Cloudflare Worker)** :
  ```bash
  npm run dev --workspace=@leblanc/worker
  ```
  Accessible sur `http://localhost:8787`.

- **Dépendance partagée (Shared)** :
  ```bash
  npm run dev:deps
  ```
  Construit le workspace `@leblanc/shared` dans `shared/dist/`.

## Commandes de Contrôle et Build

- **Vérification TypeScript** :
  ```bash
  npm run typecheck
  ```
  Régénère les types du worker, valide la solution TypeScript racine via `tsc --build` et vérifie le frontend sans émission.

- **Vérification ESLint** :
  ```bash
  npm run lint
  ```

- **Formatage du code (Prettier)** :
  ```bash
  npm run format
  ```

- **Build de production** :
  ```bash
  npm run build
  ```
  Construit d'abord `@leblanc/shared`, puis `@leblanc/frontend` dans `frontend/dist/`.

- **Tests unitaires** :
  ```bash
  npm run test
  ```

## Ingestion DATAtourisme (Lot 6)

Configurer `DATABASE_URL_DIRECT` et `DATATOURISME_API_KEY` dans le `.env` racine, puis lancer depuis la racine :

```bash
npm run db:ingest:datatourisme -- --limit=20
```

`--limit=20` borne les objets traités à 20 pour la phase de validation. Une relance avec le même argument met à jour les mêmes événements, sans doublon. Sans `--limit`, le script parcourt les pages du rayon de 20 km ; cette phase complète attend une validation séparée. Le client demande les six langues dans un seul appel, espace les pages de 300 ms et respecte le quota DATAtourisme. Les dates sans `startTime` prennent `00:00:00` à Paris ; une `endDate` sans `endTime` prend `23:59:59`. Une occurrence sans heures est comptée dans le journal comme journée entière. Les lignes refusées sont comptabilisées dans `ingestion_runs`.

Les 25 mocks restent visibles pendant la validation. **Après validation visuelle seulement**, les masquer sans suppression avec `npm run db:mocks -- --hide`. Pour les rétablir : `npm run db:mocks -- --unhide`. Ces commandes ne touchent qu'aux événements liés exclusivement à la source `mock`.

Le lancement est manuel pour le Lot 6. La planification (cron) sera décidée au Lot 9, lors du déploiement.

## Ingestion OpenAgenda (Lot 7 — essai limité)

Configurer `DATABASE_URL_DIRECT` et `OPENAGENDA_API_KEY` dans le `.env` racine, puis lancer :

```bash
npm run db:ingest:openagenda
```

Le script lit uniquement les agendas activés dans `source_agendas`. Pour cet essai, le ministère de la Culture (UID `86244142`) et les Journées européennes du patrimoine 2026 en Centre-Val de Loire (UID `54621`) ont été activés temporairement ; ils sont maintenant désactivés. Trois autres agendas thématiques sont également enregistrés mais désactivés. Il n'y a pas de découverte automatique. L'API v2 est appelée avec la clé dans l'en-tête `key`, avec une pause de 250 ms entre les appels, des reprises sur 429/5xx et un plafond de 100 requêtes par exécution. L'import récupère les événements dont un horaire commence depuis le 1er janvier 2026, puis applique le rayon exact de 20 km dans PostGIS. `--limit=N` permet un essai encore plus petit par agenda.

**Bilan du 25 septembre 2026 :** 35 fiches et 80 occurrences OpenAgenda importées, mais aucune occurrence future ni dans les 90 prochains jours. Les 35 fiches sont dans le rayon de 20 km. Les deux agendas recouvrent 22 événements de même UID ; ils sont importés une seule fois. Aucun doublon probable avec DATAtourisme n'a été détecté par la règle stricte titre normalisé, distance ≤ 200 m et début à ±2 h. Les 189 fiches DATAtourisme sont restées intactes.

**Décision du 26 septembre 2026 :** les deux agendas confirmés sont désactivés et les 35 fiches OpenAgenda sont masquées, sans suppression. La commande réversible agit sur les événements liés exclusivement à OpenAgenda et sur ces deux agendas ; elle ne modifie pas DATAtourisme ni les trois autres agendas désactivés :

```bash
npm run db:openagenda -- --hide
npm run db:openagenda -- --unhide
```

`--unhide` réactive les deux agendas et republie les fiches masquées. Une ingestion ultérieure sur un agenda actif republie également ses fiches ; garder les agendas désactivés tant que la source doit rester hors de l'affichage.

Le rendement actuel d'OpenAgenda est faible pour Le Blanc : les agendas confirmés sont thématiques et saisonniers, sans offre à venir au moment de l'essai. Conserver le connecteur pour une réévaluation ultérieure est possible, mais une activation permanente n'apporte actuellement rien aux visiteurs. Les tarifs en texte libre sont incertains : conformément à la règle de ce lot, l'absence de prix explicite donne `is_free=true` et `price_min=null`.

## SEO

Les six pages utilisent `PageSeo` et un `HelmetProvider` commun (`react-helmet-async` **2.0.5**, nouvelle dépendance de production du lot 8.2). Les titres et descriptions génériques viennent des six fichiers `seo.json`. Une fiche utilise le titre, un extrait de description et l'image de l'événement ; l'image d'accueil sert de repli.

Chaque page dispose d'une canonical absolue sans paramètres de filtres, de métadonnées Open Graph (`website`, locale, URL, titre, description, image), et d'une carte Twitter `summary_large_image`. Les pages indexables référencent les six versions localisées et un `x-default` vers la version française de la même page. Les pages introuvables sont `noindex` et n'émettent pas d'alternates fictifs.

Le JSON-LD contient `Organization` (logo : favicon existante), `BreadcrumbList` sur les pages indexables et `Event` sur les fiches chargées. Les champs absents sont omis, notamment l'organisateur que l'API ne fournit pas. Les descriptions sont sérialisées sans permettre la fermeture de la balise JSON-LD par du contenu externe.

`VITE_SITE_URL` définit l'origine publique, avec **https://leblanc-et-moi.pages.dev** par défaut. Employer une origine HTTPS sans chemin ni paramètres. `DocumentLang` conserve la langue du document ; le titre est désormais géré par Helmet.

## Limitations SEO

La V1 reste une **SPA rendue côté client**, sans SSR ni pré-rendu. Les métadonnées spécifiques aux pages et le JSON-LD apparaissent après exécution JavaScript ; ils ne sont pas présents dans le HTML initial obtenu par `curl`. Google peut rendre le JavaScript, mais l'indexation et les résultats enrichis ne sont pas garantis. Facebook, LinkedIn et Twitter ne récupèrent pas ces métadonnées dynamiques : leurs aperçus restent dégradés ou génériques. Le HTML initial conserve uniquement le titre générique et la favicon.

Les contrôles SEO se font donc dans le DOM du navigateur après chargement des traductions et, pour une fiche, des données API. Les pages 404 applicatives utilisent `noindex` ; le statut HTTP d'une SPA dépend aussi de la configuration de l'hébergeur. L'amélioration des aperçus sociaux et des statuts HTTP relève d'une évolution ultérieure vers un rendu adapté aux robots.

## Sitemap

`npm run build` génère **`frontend/dist/sitemap.xml` et `frontend/dist/robots.txt`**. Le plugin parcourt `/v1/events` par pages de 50, suit les curseurs, déduplique les identifiants et construit les URLs depuis `routeMapping.ts`. Aucun accès direct à PostgreSQL n'est effectué par le build.

**Périmètre V1 validé : seules les fiches exposées par l'API sont incluses.** L'API retient les événements publiés dans le rayon de 20 km ayant une séance programmée entre maintenant et J+90. Le sitemap ne recense donc pas toutes les fiches stockées ou publiées en base, notamment les événements passés et ceux sans séance dans cette fenêtre. Cette limite est volontaire, cohérente avec le contenu actif de l'application, et n'entraîne aucune modification de l'API ou de la logique métier.

Lors du contrôle du 26 septembre 2026 : **134 fiches × 6 langues + 24 pages principales = 828 URLs**. Ce nombre varie avec les dates et les données disponibles ; les 189 fiches DATAtourisme importées ne constituent pas un nombre attendu fixe pour le sitemap.

L'adresse API du build est résolue dans cet ordre : `SITEMAP_API_URL`, `VITE_API_URL`, puis `/api` sur `VITE_SITE_URL`. Les URLs d'API absolues doivent inclure le préfixe `/api`. En production, configurer l'URL publique du Worker si l'API n'est pas servie par Pages sur cette origine.

La page de crédits photographiques ajoute désormais six URLs : `/fr/credits`, `/en/credits`, `/es/creditos`, `/de/bildnachweise`, `/it/crediti` et `/nl/credits`. Accessible depuis À propos et le pied de page, elle reprend les sources et modifications de `frontend/public/images/CREDITS.md`. La politique de confidentialité ajoute également six routes : `/fr/confidentialite`, `/en/privacy`, `/es/privacidad`, `/de/datenschutz`, `/it/privacy` et `/nl/privacy`. Les mentions légales renseignées figurent sur les pages À propos et Crédits. La politique décrit le stockage local de la langue, l’absence de suivi publicitaire, les requêtes techniques aux fournisseurs externes et les contacts volontaires par courriel. Le sitemap comprend donc maintenant **36 pages principales**, en plus des fiches événements.

En cas de panne réseau, réponse invalide, erreur HTTP, pagination incohérente ou dépassement du délai global de 30 secondes, le build **réussit avec les 36 pages principales uniquement**, même si quelques pages d'événements ont déjà été lues. Il affiche :

> Sitemap généré sans les fiches événements (API indisponible). Rebuild recommandé.

Pour régénérer avec le Worker local déjà démarré, depuis PowerShell :

```powershell
$env:SITEMAP_API_URL = 'http://127.0.0.1:8787/api'
npm run build
Remove-Item Env:SITEMAP_API_URL
```

Le sitemap est une photographie des données **au moment du build**. Relancer le build et redéployer pour l'actualiser après une ingestion ou le déplacement de la fenêtre de dates. `robots.txt` autorise l'exploration, exclut `/admin` et les variantes préfixées par langue, et référence le sitemap public ; ce fichier ne constitue pas un contrôle d'accès.

## Performance

L'accueil reste dans le bundle initial. Les cinq autres pages utilisent `React.lazy` avec `Suspense`. Leaflet et son CSS sont chargés uniquement à l'ouverture de la carte. Les images des cartes événement ont déjà `loading="lazy"` ; les images principales restent prioritaires et aucune conversion de format n'est imposée.

React Router **6.30.1** n'expose pas `prefetch="intent"` dans cette configuration. Les liens internes préchargent les modules au survol et au focus ; la liste est également préchargée deux secondes après le montage de l'accueil. La carte est volontairement exclue de ce préchargement pour conserver Leaflet hors des autres pages. Ce préchargement concerne le code, pas les données API.

Mesures du build de production, en kB décimaux (minifié / gzip) :

| JavaScript | Avant 8.2 | Après 8.2 |
| --- | ---: | ---: |
| Initial, accueil compris | 647,59 / 198,80 | ≈ 444,03 / 139,58 |
| Carte + Leaflet, différé | inclus dans l'initial | 160,91 / 47,74 |
| Filtres partagés liste/carte, différés | inclus dans l'initial | 36,97 / 13,15 |
| Fiche événement, différée | inclus dans l'initial | 15,35 / 4,57 |
| Liste, différée | inclus dans l'initial | 4,91 / 1,85 |
| À propos, différée | inclus dans l'initial | 3,15 / 0,86 |
| 404, différée | inclus dans l'initial | 1,08 / 0,55 |

Le JS initial baisse d'environ **31 %** et son gzip de **30 %**. La cible de 400 kB / 120 kB gzip reste dépassée. Zod, React Router, React DOM, i18next et TanStack Query constituent les principaux modules restants. La liste préchargée ajoute environ 41,88 kB / 15,00 kB gzip après le chargement initial. Le découpage réduit le coût de la première page ; il ne réduit pas nécessairement le total de tous les chunks.

`rollup-plugin-visualizer` **6.0.5** est une nouvelle dépendance de développement, compatible avec Vite 5 et les options TypeScript strictes du dépôt. Chaque build produit `artifacts/bundle-report.html` (hors répertoire déployé) et `frontend/dist/.vite/manifest.json`. Le visualizer permet d'examiner la contribution des modules ; les tailles minifiées/gzip finales sont celles des fichiers de build. Pour la V2, étudier des imports de validation plus ciblés et la part de code nécessaire à l'accueil, avec vérification du comportement et des traductions avant tout changement de dépendance.

Contrôle navigateur reproductible, avec le Worker local sur 8787 et `npm run preview --workspace=@leblanc/frontend -- --host 127.0.0.1 --port 4173` dans un autre terminal :

```bash
node scripts/audit-seo.mjs
```

Ce script utilise Chromium via Playwright, lit les données réelles et contrôle 36 pages localisées, les balises après navigation, les erreurs applicatives, l'isolation de la carte et la navigation à 320 px. Il écrit ses captures et mesures dans `artifacts/lot8-2/`. La navigation ne déborde plus dans les six langues ; un débordement distinct de 1 px subsiste sur une carte de catégorie de l'accueil allemand à 320 px, conservé pour respecter les styles validés hors navigation.

## Production — ingestion quotidienne (Lot 9)

- Site : https://leblanc-et-moi.pages.dev
- API : https://leblanc-api.elharchdenis.workers.dev (santé : `/health`, données : `/api/v1/…`).
- Dépôt : https://github.com/sofresh66/Leblanc ; branche de production : `main`.
- Workflow : [production.yml](.github/workflows/production.yml).

Actions utilisées : `actions/checkout@v5` et `actions/setup-node@v5`, dont le runtime interne est Node.js 24. `setup-node` installe également Node.js 24 pour les commandes du projet et gère le cache npm ; aucune action `cache` ou `upload-artifact` séparée n’est utilisée. Le runner reste `ubuntu-latest`.

Le workflow exécute, dans cet ordre : checkout, Node.js 24, contrôle de configuration, `npm ci`, `npm test`, `npm run db:migrate`, ingestion DATAtourisme complète, build frontend, vérification du build, publication Pages. Les secrets sont transmis uniquement aux étapes de contrôle, de migration, d’ingestion ou de publication qui en ont besoin ; le build ne reçoit aucun secret de base de données ou d’API DATAtourisme.

Déclenchements : `workflow_dispatch` et `0 3 * * *` avec `timezone: Europe/Paris`, donc 3 h locales toute l’année. Le workflow doit être présent sur `main`. Aucune ingestion n’est déclenchée par un push. Le job est limité au dépôt `sofresh66/Leblanc` et à `main`, avec `contents: read`, `persist-credentials: false`, runner Linux standard et timeout global de 15 minutes.

La [planification GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) peut être retardée ou omise en période de charge. Sur ce dépôt public, les planifications peuvent être désactivées après 60 jours sans activité du dépôt : vérifier leur activation dans Actions et les réactiver si nécessaire. Les runners standards sont gratuits pour ce dépôt public ; aucune ressource payante n’est ajoutée, les quotas Cloudflare/Neon/DATAtourisme restent applicables.

### Secrets et variables GitHub

Configurer les **Repository secrets** dans [Settings → Secrets and variables → Actions](https://github.com/sofresh66/Leblanc/settings/secrets/actions), et les **Repository variables** dans [l’onglet Variables](https://github.com/sofresh66/Leblanc/settings/variables/actions). Ne pas utiliser des secrets d’environnement GitHub : ce workflow ne référence pas d’`environment`.

| Nom | Type | Valeur / provenance |
| --- | --- | --- |
| `DATABASE_URL_DIRECT` | Secret | Connexion directe Neon, sans `-pooler`, depuis le `.env` local existant ou [Neon Console](https://console.neon.tech) → projet → branche de production → Connect, pooling désactivé. Conserver les paramètres SSL. |
| `DATATOURISME_API_KEY` | Secret | Clé existante `DATATOURISME_API_KEY` du `.env` local, utilisée par l’ingestion validée. |
| `CLOUDFLARE_API_TOKEN` | Secret | Token personnalisé décrit ci-dessous. |
| `CLOUDFLARE_ACCOUNT_ID` | Variable | `f3fbcbb1368768039312d4877ac6d48c` |
| `VITE_API_URL` | Variable | `https://leblanc-api.elharchdenis.workers.dev/api` |
| `VITE_SITE_URL` | Variable | `https://leblanc-et-moi.pages.dev` |
| `SITEMAP_API_URL` | Variable | `https://leblanc-api.elharchdenis.workers.dev/api` |

`VITE_USE_MOCK=false` est fixé dans le workflow. La connexion poolée `DATABASE_URL` reste exclusivement dans les secrets du Worker. Aucun secret OpenAgenda n’est nécessaire.

Créer le token dans [Cloudflare → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) :

1. **Create Token → Custom token → Get started**.
2. Nom : **GitHub Actions Pages deployment**.
3. Permission unique : **Account → Cloudflare Pages → Edit**.
4. Account Resources : **Include → Specific account**, compte `f3fbcbb1368768039312d4877ac6d48c`.
5. Ne pas fixer de filtre IP lié à l’ordinateur local : les runners GitHub utilisent d’autres adresses. Si une expiration est définie, prévoir le renouvellement du secret GitHub avant cette date.
6. **Continue to summary → Create Token**. Copier le token directement dans `CLOUDFLARE_API_TOKEN`, sans le coller dans un fichier versionné, une commande ou un message.

Cette permission permet la publication Pages sur ce compte ; elle n’autorise pas le déploiement du Worker. [Guide Cloudflare](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

Commandes alternatives dans **Git Bash**, avec GitHub CLI installé et connecté (`gh auth login` si nécessaire). Les trois commandes de secrets ouvrent une saisie interactive masquée ; ne pas ajouter leur valeur avec `--body` :

```bash
gh secret set DATABASE_URL_DIRECT --repo sofresh66/Leblanc
gh secret set DATATOURISME_API_KEY --repo sofresh66/Leblanc
gh secret set CLOUDFLARE_API_TOKEN --repo sofresh66/Leblanc

gh variable set CLOUDFLARE_ACCOUNT_ID --repo sofresh66/Leblanc --body 'f3fbcbb1368768039312d4877ac6d48c'
gh variable set VITE_API_URL --repo sofresh66/Leblanc --body 'https://leblanc-api.elharchdenis.workers.dev/api'
gh variable set VITE_SITE_URL --repo sofresh66/Leblanc --body 'https://leblanc-et-moi.pages.dev'
gh variable set SITEMAP_API_URL --repo sofresh66/Leblanc --body 'https://leblanc-api.elharchdenis.workers.dev/api'
```

### Vérifications et première exécution

Depuis la racine, dans Git Bash :

```bash
npm run typecheck
npm run lint
npm test
VITE_API_URL='https://leblanc-api.elharchdenis.workers.dev/api' \
VITE_SITE_URL='https://leblanc-et-moi.pages.dev' \
VITE_USE_MOCK='false' \
SITEMAP_API_URL='https://leblanc-api.elharchdenis.workers.dev/api' \
npm run build
node scripts/verify-production-build.mjs
```

Le [contrôle du build](scripts/verify-production-build.mjs) vérifie les invariants suivants :

- `index.html` existe et n'est pas vide ;
- `sitemap.xml` existe et dépasse **50 000 octets** (kB décimaux, seuil strict) ;
- au moins une URL de fiche événement avec un UUID et un chemin localisé reconnu est présente sur le domaine de production ;
- la page principale `https://leblanc-et-moi.pages.dev/fr` est présente (barre oblique finale acceptée) ;
- le sitemap contient **entre 700 et 1 000 URLs incluses**, comptées à partir des balises `<loc>`.

Il retourne 0 si tout est valide, 1 avec un message français et une annotation GitHub `warning` sinon. Le message de succès indique la taille, le nombre total d'URLs et le nombre de fiches événements observés. Aucun comptage exact d'événements ou d'URLs, aucun titre et aucun identifiant métier précis n'est imposé. Les nombres 189 et 828 cités dans les bilans historiques ne sont pas des assertions de production ; le vérificateur ne consulte pas la base de données.

La fenêtre glissante de 90 jours et l'ingestion quotidienne font varier naturellement le catalogue. La plage 700–1 000 est un garde-fou opérationnel demandé pour sa taille actuelle, pas une preuve d'exhaustivité ni une limite métier : une évolution légitime hors de cette plage nécessitera de revoir `MIN_SITEMAP_URLS` et `MAX_SITEMAP_URLS`. Diagnostiquer la source et le build avant de modifier les seuils. Ces contrôles bloquent notamment un sitemap de repli limité aux pages statiques.

Après revue, l’éditeur effectue lui-même le commit et le push :

```bash
git diff --check
git add .github/workflows/production.yml scripts/verify-production-build.mjs scripts/__tests__/verify-production-build.test.mjs README.md
git diff --cached
git commit -m "ci: automatiser l'ingestion quotidienne et la publication Pages"
git push origin main
```

Configurer les secrets/variables **avant** ce push pour que le prochain créneau planifié soit opérationnel. Puis ouvrir [Actions → Production](https://github.com/sofresh66/Leblanc/actions/workflows/production.yml) → **Run workflow → main → Run workflow**, ou :

```bash
gh workflow run production.yml --ref main --repo sofresh66/Leblanc
gh run list --workflow production.yml --repo sofresh66/Leblanc --limit 5
gh run watch <RUN_ID> --repo sofresh66/Leblanc --exit-status
```

Vérifier le résultat `success` de l’ingestion dans les logs, la taille et le nombre de fiches du sitemap, la réussite de la publication, puis ouvrir le site et `/sitemap.xml`. Lancer une seule fois ; un second lancement annule le premier. Ne pas publier de logs contenant des secrets. Un passage manuel réussi ne prouve pas le premier déclenchement automatique à 3 h, à vérifier ensuite dans Actions.

### Échecs, annulations et retour arrière

Une étape en échec bloque les étapes suivantes : aucune publication si tests, migration, ingestion, build ou vérification échouent. Le déploiement Pages précédent reste servi tant qu’une nouvelle publication n’a pas réussi. Les migrations sont appliquées par le runner existant (verrou consultatif, checksums et transaction par fichier). Aucun déploiement Worker, suppression de production ou restauration automatique n’est lancé.

**Limite liée à Neon :** l’ingestion existante écrit par transactions de lots. Un échec après certains lots peut donc avoir déjà actualisé des données visibles via l’API, même sans nouvelle publication Pages. Il ne s’agit pas d’une transaction globale et le workflow ne promet pas de rollback de la base.

**Annulation demandée :** le groupe `leblanc-production` utilise `cancel-in-progress: true`. Une annulation ou le timeout peut interrompre l’ingestion avant son nettoyage, laisser un état `running` et conserver le bail `sync_state.lease_until` jusqu’à une heure après son dernier renouvellement. Le nouveau run peut échouer sur ce verrou ; attendre son expiration avant de relancer. Ne pas supprimer le verrou sans avoir vérifié qu’aucune ingestion n’est active. Une annulation après réception de la publication par Cloudflare ne garantit pas qu’elle n’a pas été activée : vérifier Deployments avant toute reprise.

Pour revenir à une version frontend précédente :

1. Désactiver le workflow pour éviter qu’un prochain passage remplace le rollback : `gh workflow disable production.yml --repo sofresh66/Leblanc`. Cela n’annule pas un run déjà actif : le vérifier dans Actions et l’annuler si nécessaire (`gh run cancel <RUN_ID> --repo sofresh66/Leblanc`).
2. Dans [Cloudflare Pages → leblanc-et-moi](https://dash.cloudflare.com/f3fbcbb1368768039312d4877ac6d48c/pages/view/leblanc-et-moi), ouvrir **Deployments**, sélectionner un ancien déploiement **Production** réussi et **Rollback to this deployment**.
3. Vérifier le site et le sitemap. Ce rollback restaure les fichiers Pages, **pas les données Neon ni le Worker**. Toute restauration de données nécessite une procédure séparée et une sauvegarde exploitable.
4. Corriger et valider la cause, puis réactiver : `gh workflow enable production.yml --repo sofresh66/Leblanc`.

Pour republier manuellement un build vérifié sans ingestion, depuis Git Bash avec Wrangler connecté :

```bash
node scripts/verify-production-build.mjs && \
CLOUDFLARE_ACCOUNT_ID='f3fbcbb1368768039312d4877ac6d48c' \
npx --no-install wrangler pages deploy frontend/dist --project-name leblanc-et-moi --branch main
```

Ne pas utiliser `--force` : le projet Pages existe déjà. Le [rollback Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/) peut cibler un précédent déploiement de production réussi.

### Tarifs DATAtourisme : trois états

Décision : **option B**, `events.is_free` / `isFree` nullable, sans champ `price_status` redondant.

| Valeur | Signification | Affichage |
| --- | --- | --- |
| `true` | Gratuité confirmée (prix zéro ou politique explicite `Free`) | Badge vert « Gratuit » |
| `false` | Prix positif structuré | Badge orange « Dès X € », ou « Payant » sans montant |
| `null` | Prix non renseigné ou inexploitable | Badge gris « Tarif non précisé » |

`offers` absent, null ou vide ne prouve pas la gratuité. Une offre mal formée produit un tarif inconnu et un warning ne contenant que l'identifiant source et un code. Un prix positif, même réduit ou accompagné d'une gratuité pour certains publics, prime ; le minimum positif est conservé. Aucun prix n'est déduit du texte libre. `priceMin` reste null pour la gratuité et l'inconnu. Les autres sources gardent leur normalisation actuelle.

La migration `005_nullable_event_price.sql` retire seulement `NOT NULL` ; elle ne requalifie aucune ligne historique. La réingestion applique le nouveau classement sans changer les identifiants. L'API préserve null, les filtres Gratuit/Payant utilisent une égalité stricte (les tarifs inconnus restent visibles dans « Tous »). Le badge partagé couvre cartes, fiches et infobulles en six langues. Le JSON-LD omet `offers` et `isAccessibleForFree` pour un tarif inconnu.

**Premier déploiement, ordre convenu avec l'éditeur :**

1. Valider les tests et le build, puis l'éditeur commit et push l'ensemble. Ne pas lancer le workflow à ce stade. Éviter le créneau automatique de 03 h Paris ; si nécessaire désactiver temporairement le workflow pendant cette transition et le réactiver après le déploiement Worker.
2. Depuis la racine du dépôt dans Git Bash, construire le module partagé puis déployer le Worker :

   ```bash
   npm run build --workspace=@leblanc/shared && \
   npx --no-install wrangler deploy --config worker/wrangler.jsonc
   ```

   Le fichier de configuration cible `leblanc-api`, compte `f3fbcbb1368768039312d4877ac6d48c`. Le secret `DATABASE_URL` déjà présent reste utilisé.
3. Vérifier `/health` et les endpoints événements. Avant migration/réingestion, « Nuit de gongs » peut encore avoir `isFree: true` : le déploiement Worker seul ne corrige pas la base.
4. Lancer manuellement Production sur `main` : tests → migrations → ingestion → build → vérification sitemap → publication Pages. Aucun nouveau secret n'est requis.
5. Vérifier la fiche `/fr/evenements/4d6ec782-e715-4742-916e-90bdba57b6ca`, la réponse API avec `isFree: null, priceMin: null`, les filtres et les comptages SQL ci-dessous.

**Limite de cet ordre :** entre la réingestion et la publication Pages, l'ancien frontend peut refuser les réponses contenant null. Cette fenêtre se prolonge si le build ou le déploiement échoue ; les onglets ayant chargé l'ancien JavaScript nécessitent un rechargement. Une transition sans cette fenêtre exige de publier le frontend compatible avant la réingestion. Après migration, ne pas restaurer un ancien frontend ou Worker incompatible avec null ; republier une version corrigée qui conserve ce contrat. Ne pas rétablir `NOT NULL` tant que des lignes ont un tarif inconnu.

Audit du 26 septembre 2026, avant réingestion : 189 événements publiés DATAtourisme (93 marqués gratuits, 96 payants). Lecture de la source à cet instant : 186 événements ; simulation du nouveau normaliseur : 57 gratuits, 96 payants, 33 inconnus. Ce n'est pas un comptage SQL après ingestion : les événements déjà stockés mais absents de la réponse courante ne sont pas supprimés par l'ingestion. Les chiffres finaux doivent être mesurés.

```sql
SELECT is_free, price_min IS NULL AS price_null, COUNT(*)::int
FROM events
WHERE status = 'published' AND id IN (
  SELECT event_id FROM source_records WHERE source = 'datatourisme'
)
GROUP BY is_free, price_null
ORDER BY is_free, price_null;
```
## Lieux OpenStreetMap

Le script `npm run db:ingest:osm-places` collecte les restaurants, bars, cafés et lieux de restauration rapide nommés dans un rayon de 20 km autour du Blanc. Il interroge plusieurs serveurs Overpass en cascade. Une réponse vide ou un échec de tous les serveurs provoque un arrêt avec code 1 avant toute connexion à la base ; aucun snapshot local n'est utilisé en repli.

Appliquer d'abord `npm run db:migrate` pour installer la migration 007. L'ingestion utilise `DATABASE_URL_DIRECT`, met à jour les fiches OSM par `source + external_id` et conserve les horaires `opening_hours` bruts. La déduplication avec DATAtourisme masque les rapprochements fiables (niveaux 1 et 2) et laisse les cas ambigus publiés (niveau 3, décision `pending`). Une relance met à jour les mêmes fiches sans créer de nouveaux doublons.

Les données de lieux OpenStreetMap sont créditées dans [CREDITS.md](CREDITS.md) et sur le site ; elles sont fournies sous licence ODbL.

## Restaurants de la liste manuelle

`data/restaurants-manuel.json` est la source versionnée des 56 restaurants vérifiés. Après `npm run db:migrate`, `npm run db:import:restaurants-manuel` masque les lieux OSM publiés, importe la liste et masque les doublons avec DATAtourisme. Le géocodage Nominatim est séquentiel (au plus une requête par seconde) ; ses résultats sont conservés dans `data/restaurants-manuel-geocodage.json` pour éviter de répéter les appels.

La baisse du sitemap de 1 332 à 1 212 URLs lors du déploiement du 29 septembre 2026 est attendue : 55 fiches OSM masquées retirent 330 URLs (six langues), et 35 fiches manuelles ajoutent 210 URLs. Le solde est donc de −120 URLs. Ces nombres ont été vérifiés en comparant les sitemaps des deux déploiements et les sources des fiches en base.

**Limite V1 :** 5 lieux publiés de la liste manuelle n'ont pas de coordonnées GPS (adresses incomplètes ou géocodage échoué). Ils apparaissent en fin de liste, mais pas sur la carte. Leur fiche affiche « Adresse non localisée sur la carte » et le bouton « Y aller » recherche l'adresse textuelle. Leurs coordonnées restent à compléter manuellement dans une V2.
