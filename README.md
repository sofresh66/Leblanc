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

En cas de panne réseau, réponse invalide, erreur HTTP, pagination incohérente ou dépassement du délai global de 30 secondes, le build **réussit avec les 24 pages principales uniquement**, même si quelques pages d'événements ont déjà été lues. Il affiche :

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
