# Onglet « Se balader » (octobre 2026)

Randonnées, balades à vélo, circuits VTT et itinéraires équestres autour du Blanc et dans le Parc naturel régional de la Brenne. Développé et validé sur la branche Neon `dev` (lots 1 à 7, tags locaux `se-balader-lot-1` à `se-balader-lot-7`). **Rien n'est en production** : voir le [plan de mise en production](#plan-de-mise-en-production) en fin de document.

## Architecture

| Couche | Éléments |
| --- | --- |
| Base (migration `012_routes.sql`) | Table `routes` : textes i18n, `translation_status`, modes, boucle (`NULL` si inconnue), distance, durée en minutes ou en jours, départ, `distance_le_blanc_m` (clé de tri), tracé `GEOGRAPHY(MultiLineString)` et version allégée `GEOMETRY(MultiLineString)` (≈ 15 m), relation OSM, lien officiel, photo, crédit, licence, producteur, statut. Table `route_source_records` (fiche DATAtourisme d'origine). Index de tri `((track IS NOT NULL) DESC, distance_le_blanc_m, id)`. |
| Ingestion (`scripts/ingest-routes.mjs`, `npm run db:ingest:routes`) | DATAtourisme `/v1/tour` dans 55 km, filtré « départ ≤ 20 km du Blanc OU dans le PNR » (`data/pnr-brenne.geojson`) ; normalisation (`scripts/lib/datatourisme-routes-normalizer.mjs`) ; une requête Overpass pour les tracés (`scripts/lib/route-osm-match.mjs`) ; contrôles de traduction communs aux événements ; masquage des fiches absentes depuis 3 jours. Options `--dry-run` et `--limit=N`. |
| API Worker (`worker/src/routes/routes.ts`, `worker/src/db/routes.ts`) | `GET /api/v1/routes` (liste, filtres `modes`, `with_track`, `loop`, `min_km`, `max_km`, `max_duration`, `q`, curseur à trois clés), `/routes/geo` (carte), `/routes/:id` (fiche), `/routes/:id/gpx` (tracé OSM, ODbL), `/routes/:id/nearby` (événements et lieux à 5 km). Contrat partagé : `shared/src/trails.ts`. |
| Front | Liste, filtres et carte : `frontend/src/pages/WalksPage.tsx`, `frontend/src/components/walks/` ; fiche : `frontend/src/pages/WalkPage.tsx`. Leaflet et les pages en chunks chargés à la demande. Textes : namespace `walks` (6 langues). |
| SEO | Middleware Pages (`frontend/functions/lib/page-plan.ts`) : `<head>`, hreflang, JSON-LD `TouristTrip`, préchargement de la photo, vraies 404. Sitemap (`frontend/vite-plugins/sitemap.ts`) avec alternates ; contrôle `scripts/verify-production-build.mjs`. |
| Workflows | `production.yml` : étape « Actualiser les parcours » en `continue-on-error` (avertissement dans le résumé). `translations-weekly.yml` : `score-translations.mjs --entity=routes` après les événements. |

Adresses : `/fr/se-balader`, `/en/trails`, `/es/rutas`, `/de/touren`, `/it/percorsi`, `/nl/routes`, et la fiche au même segment suivi de l'identifiant.

## Sources et licences

| Source | Usage | Licence et attribution |
| --- | --- | --- |
| DATAtourisme (`/v1/tour`) | Fiches : titres, descriptions, distances, durées, liens officiels, photos | Licence Ouverte 2.0, producteur cité sur chaque fiche et sur la page Crédits |
| OpenStreetMap (Overpass) | Tracés des parcours, contour du PNR (relation 4287018) | « © contributeurs OpenStreetMap, ODbL » sur la carte, la fiche (avec la relation), l'API et la page Crédits ; les GPX sont distribués sous ODbL |
| Photos des producteurs | En-têtes et cartes | Crédit et licence affichés tels que fournis ; aucune licence supposée quand elle manque |
| parc-naturel-brenne.fr | — | Aucun contenu repris : liens uniquement (pas de licence affichée) |

Le jeu data.gouv.fr « Sentiers inscrits au PDIPR » concerne le Doubs ; aucun équivalent pour l'Indre.

## Décisions prises

- **Périmètre** : départ à 20 km au plus du Blanc ou dans le PNR (≈ 167 parcours sur `dev`).
- **Tracé seulement si la correspondance est sûre** : nom OSM contenu dans le titre, même famille de mode, départ DATAtourisme à 500 m au plus du tracé. Sinon : départ seul, « Tracé non disponible », lien officiel.
- **Modes** : à pied, vélo et VTT par défaut ; « À cheval » disponible mais décoché. Pas de filtre de difficulté (aucune donnée).
- **Ordre** : parcours avec tracé d'abord, puis distance au Blanc, puis identifiant (curseur à trois clés, expiration 24 h).
- **Boucle** : affichée seulement si la source le dit (`hasTourType`) ou si la relation OSM porte `roundtrip`.
- **Traductions** : mêmes règles que les événements ; un rejet manuel porte sur toute la langue (pas d'override limité au titre).
- **Sitemap** : alternates sur toutes les URL, identiques aux hreflang du middleware (testé) ; plafond de contrôle relevé à 4 000 URL.
- **Cache** : le middleware garde la réponse de l'API une heure (comportement commun aux événements et lieux, conservé).

## Exploitation

### Ingestion de nuit

- Durée mesurée sur `dev` : **≈ 100 s** au total (614 fiches DATAtourisme sur 13 pages, 300 ms entre les pages ; une requête Overpass ≈ 13 s, ≈ 9 Mo). Écriture en base : 11 à 16 s.
- **Charge sur Overpass** : une requête par nuit. En cas d'échec, essai des serveurs de repli dans l'ordre (kumi.systems, overpass-api.de, osm.ch, private.coffee) : au plus deux tentatives par serveur, et seulement sur 429/504 (pause `Retry-After` plafonnée à 20 s, sinon 2 s), donc 8 requêtes au pire. User-Agent : `LeblancEtMoi/1.0 (contact: elharchdenis@gmail.com)` (existant, partagé avec l'import des lieux).
- **Overpass indisponible** : tracés et départs existants conservés, run en succès, avertissement avec le code de chaque serveur dans le résumé du run et dans `ingestion_runs.error_summary`.
- **Panne DATAtourisme** : l'étape échoue sans bloquer la publication (`continue-on-error`) ; les parcours de la veille restent publiés.
- **Masquage après 3 jours** : une fiche absente du flux pendant 3 jours passe en `hidden` (seulement après une collecte complète). Elle redevient `published` si elle réapparaît. Une fiche masquée à la main et toujours présente reste masquée.

### Décisions manuelles OSM

Fichier `data/route-osm-matches.json` (vide à ce jour) :

```json
[{ "externalId": "<uuid DATAtourisme>", "osmRelationId": 18248594, "decision": "force", "note": "départ au bourg" }]
```

`force` impose une relation même hors règle ; `reject` écarte une correspondance. Prise en compte à l'ingestion suivante.

### Traductions

- Overrides : `data/translation-overrides.json` (communs aux événements et parcours), puis `node scripts/revalidate-translations.mjs --entity=routes --apply`.
- Contrôle hebdomadaire : `node scripts/score-translations.mjs --entity=routes [--apply]`, garde-fou propre aux parcours.
- Signalement aux producteurs : `artifacts/signalement-routes-*.csv` (description française absente, traductions d'une autre fiche relevées à la main, crédits photo mal encodés). À ce jour : 5 fiches Destination Brenne, dont la balade n°7 (titre anglais de la n°40) et le crédit « Â©Hellio-Van Ingen ».

### Cache

API : liste 60 s navigateur / 300 s CDN ; carte et fiche comme les autres points d'entrée (voir `worker/src/http/cache.ts`). Middleware : réponses de l'API gardées 1 h (un parcours masqué peut rester visible jusqu'à une heure côté page).

## Performance (lot 7, mesures locales)

| Mesure | Résultat |
| --- | --- |
| Bundle principal | 461,4 Ko → 470,1 Ko (+8,7 Ko, **+2,3 Ko gzip**) ; Leaflet (154 Ko) et les pages de l'onglet restent en chunks à la demande |
| Fiche | `TrailDetailMap` ne charge plus `BaseMap` ni markercluster (−9,5 Ko gzip) |
| `/routes/geo` | 68 Ko bruts, **17 Ko gzip / 13 Ko brotli** (119 parcours) ; 14 Ko brotli avec tous les modes |
| Lighthouse mobile (médiane de 3) | Liste : perf 79, accessibilité 97, bonnes pratiques 96, SEO 100, CLS 0. Fiche : 79 / 97 / 96 / 100, CLS 0 |
| Requêtes SQL (`EXPLAIN ANALYZE`, `dev`) | Liste page 1 : index `idx_routes_list_order`, 0,4 ms ; page suivante : parcours séquentiel + tri top-N, 0,5 ms ; carte : 4,2 ms ; à proximité : événements 9,4 ms (index GiST et statut), lieux 0,4 ms |

Corrigé au lot 7 :
- CLS de 0,33 sur toutes les pages (pied de page déplacé pendant le chargement des pages) : `main` a désormais une hauteur minimale d'un écran ;
- polices principales préchargées ;
- premières images de la liste non différées ;
- photo de la fiche préchargée par le middleware ;
- `fetchpriority` en minuscules (React 18).

Signalé, non corrigé :
- **LCP ≈ 5 s** en 4G simulée sur la liste et la fiche : les photos des producteurs sont des JPEG pleine taille (≈ 200 Ko) servis par Tourinsoft, sans redimensionnement possible. Piste : redimensionnement par Cloudflare (Images ou Image Resizing, options payantes).
- **Cibles tactiles trop petites** dans le pied de page commun (liens Wikimedia, CC BY) et **avertissement CSP** (mode rapport) : existants, identiques sur toutes les pages.
- **Page suivante de la liste en parcours séquentiel** : sans effet à 167 lignes ; à revoir si le volume dépasse quelques milliers.

## Lot 8 (prioritaire)

Publier les relations OSM qui n'ont pas de fiche DATAtourisme : voie verte Étoile Verte du Blanc, V94 (Voie Verte des Vallées), V203 (Touraine-Berry à vélo), GR 48, chemins de Szombathely et Via Sancti Martini, balades du PNR sans fiche (« Rencontre avec les paysages de Brenne », « Terre crue, terre cuite »…). Environ 25 relations dans la zone.

- Contenu : nom, mode (d'après `route`), tracé, longueur calculée, boucle (`roundtrip`), réseau (`network`), attribution « © contributeurs OpenStreetMap, ODbL ». **Aucune description inventée.**
- Base : `route_source_records.source = 'osm'` (déjà prévu par la migration 012).
- À trancher : traitement des grands itinéraires (V94, GR 48 : plusieurs centaines de km, départ conventionnel au point le plus proche du Blanc ?).

## Plan de mise en production

**À ne lancer qu'avec l'accord explicite du propriétaire, étape par étape.**

Chaque commande de production lit `.env.production-backup` **par dotenv**, pour cette seule commande (`DOTENV_CONFIG_PATH=.env.production-backup`). L'URL n'est ni affichée ni exportée dans le shell.

**Ne pas utiliser `set -a; . ./.env.production-backup`.** Les URL Neon ne sont pas entre guillemets et contiennent `&`, que le shell interprète comme un lancement en arrière-plan. La variable resterait vide, et les scripts, via `dotenv/config`, retomberaient sur `.env`, c'est-à-dire la base **dev** (constaté le 10 octobre 2026).

Contrôle de l'hôte avant chaque écriture :

```bash
DOTENV_CONFIG_PATH=.env.production-backup node -r dotenv/config -e 'console.log(new URL(process.env.DATABASE_URL_DIRECT).hostname)'
```

Attendu : `ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech`.

**Ordre retenu.** La preview est déployée depuis le poste local, à partir du build local, **avant** de pousser `main` (étape 5). Après validation : push de `main` et des tags (étape 6), puis `gh workflow run production.yml` dans la même session (étape 7). Raison : dès que `main` est poussé, le run de 3 h publierait le front automatiquement.

**Previews et CORS.** Le Worker accepte en permanence les previews du projet : `https://<un seul sous-domaine>.leblanc-et-moi.pages.dev`, HTTPS uniquement, sans port (`PAGES_PREVIEW_ORIGIN` dans `worker/src/http/cors.ts`, testé). Ce changement part avec le déploiement du Worker de l'étape 3.

État de départ vérifié le 10 octobre 2026 : `origin/main` sur `5febaa6`, aucun tag `se-balader-*` à distance.

### 1. Sauvegarde Neon

Projet `leblanc-et-moi` (`still-feather-70001673`, aws-eu-central-1). Branche parente : `production` (`br-jolly-glitter-b2egbt3q`, branche par défaut). Historique conservé par Neon : 6 heures seulement, d'où cette branche explicite.

```bash
npx neonctl branches create --project-id still-feather-70001673 --parent production --name prod-avant-routes-2026-10-10 --no-compute --no-secrets --output table
npx neonctl branches list --project-id still-feather-70001673 --output table
```

- `--no-secrets` : la sortie n'affiche pas les identifiants de connexion (affichés par défaut).
- `--no-compute` : pas de calcul actif pour une sauvegarde ; on en ajoute un seulement pour la consulter ou la restaurer.
- Vérification : `prod-avant-routes-2026-10-10` apparaît dans la liste ; noter son identifiant (`br-…`).
- **Fait le 10 octobre 2026 à 15:51 UTC** : `br-long-credit-b2uwy63r`, parente `br-jolly-glitter-b2egbt3q` (`production`), état `ready`, point de branche LSN `0/6B97930` (15:51:26 UTC).
- Retour arrière : c'est le point de restauration des étapes suivantes (console Neon › Branches › Restore). Suppression ultérieure : `npx neonctl branches delete <id> --project-id still-feather-70001673`.

### 2. Migration 012

La migration ne part que si l'hôte lu est celui de la production :

```bash
H=$(DOTENV_CONFIG_PATH=.env.production-backup node -r dotenv/config -e 'process.stdout.write(new URL(process.env.DATABASE_URL_DIRECT).hostname)'); echo "Hôte : $H"; [ "$H" = "ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech" ] && DOTENV_CONFIG_PATH=.env.production-backup npm run db:migrate
```

- Réussite : `001` à `011` en `[DÉJÀ APPLIQUÉE]`, `012_routes.sql` en `[APPLIQUÉE]`, « 1 nouvelle(s) migration(s) appliquée(s) ». La migration s'exécute dans une transaction : en cas d'erreur, rien n'est écrit.
- Vérification (lecture seule) :

  ```bash
  DOTENV_CONFIG_PATH=.env.production-backup node scripts/verify-migration-012.mjs
  ```

  Attendu, comme sur `dev` (référence du 10 octobre 2026), à l'exception du nombre de lignes :
  - `Hôte : ep-jolly-dawn-b2ezqckv…` ; migration présente, checksum identique au fichier ;
  - tables `route_source_records, routes` ; `track geography(MultiLineString,4326)`, `track_simplified geometry(MultiLineString,4326)`, `start_location geography(Point,4326)` ;
  - colonnes : routes 32, route_source_records 8 ;
  - 9 index : `idx_routes_list_order`, `idx_routes_modes`, `idx_routes_start_location`, `idx_routes_status`, `idx_routes_track`, `routes_pkey`, `idx_route_source_records_route_id`, `route_source_records_pkey`, `route_source_records_source_external_id_key` ;
  - contraintes : `routes.c=17 routes.n=15 routes.p=1 route_source_records.c=1 route_source_records.f=1 route_source_records.n=5 route_source_records.p=1 route_source_records.u=1` ;
  - clé étrangère `ON DELETE CASCADE` ; déclencheur `trg_routes_updated_at` ;
  - **0 ligne** dans les deux tables.

  Seules deux tables sont créées : le Worker et le front actuels ne sont pas affectés.
- Retour arrière, au choix :
  - SQL en commentaire de la migration, dans une transaction (sans risque tant que le Worker ne lit pas ces tables) : `BEGIN; DROP TABLE IF EXISTS route_source_records; DROP TABLE IF EXISTS routes; DELETE FROM schema_migrations WHERE version = '012_routes.sql'; COMMIT;`, puis `scripts/verify-migration-012.mjs`, qui doit afficher « Migration : ABSENTE » et « Tables : aucune » ;
  - restauration de `production` depuis `prod-avant-routes-2026-10-10` (`br-long-credit-b2uwy63r`) dans la console Neon. Cela perd toute écriture postérieure au 10 octobre 2026 à 15:51 UTC (ingestions de nuit comprises) : à réserver au cas où le SQL ne suffirait pas.

- **Fait le 10 octobre 2026 à 15:56:48 UTC.** `012_routes.sql` est appliquée (1 nouvelle migration, code de sortie 0). `scripts/verify-migration-012.mjs` en production est identique à la référence dev, sauf les lignes (0 et 0). L'API alors en ligne n'est pas affectée : `/health`, `/events` et `/places` répondent 200, `/routes` 404 (route encore inconnue du Worker `fca49825`).

### 3. Déploiement du Worker

Avant (lecture seule, fait le 10 octobre 2026) :
- compte Cloudflare `f3fbcbb1368768039312d4877ac6d48c` ;
- version active `fca49825-70c4-4101-a78f-2624345db03f` (100 %) ;
- secret `DATABASE_URL` présent ;
- `npx wrangler deploy --dry-run` : 186 KiB gzip, variable `ALLOWED_ORIGINS`.

Le déploiement part de la copie locale de `main` : API des parcours et acceptation des previews du projet (CORS).

```bash
cd worker && npx wrangler deploy && cd ..
```

- Réussite : wrangler affiche `https://leblanc-api.elharchdenis.workers.dev` et un nouvel identifiant de version (à noter).
- Vérifications, en lecture seule :

  ```bash
  bash scripts/verify-worker-deploy.sh https://leblanc-api.elharchdenis.workers.dev vide
  npx wrangler deployments list --name leblanc-api
  ```

  Le script vérifie :
  - anciennes routes : `/health`, `/events`, `/events/geo`, `/events/:id`, `/categories`, `/places`, `/places/:id` en 200, avec des données ;
  - parcours : `/routes` en 200 avec une liste vide et sans curseur, `/routes/geo` vide, 404 pour un identifiant inconnu, 400 pour un identifiant ou un mode invalide ;
  - CORS : le site de production est autorisé sur `/events` et `/routes`, ainsi que `https://routes-preview.leblanc-et-moi.pages.dev`. Sont refusés `http://…`, `evil-leblanc-et-moi.pages.dev`, `a.b.leblanc-et-moi.pages.dev` et `…pages.dev.evil.com`. Le prévol OPTIONS répond 204.

  Attendu : « tous les contrôles sont passés » (20 contrôles, validés sur le Worker local).
- Retour arrière : `cd worker && npx wrangler rollback fca49825-70c4-4101-a78f-2624345db03f && cd ..`. Ensuite, `npx wrangler deployments list --name leblanc-api` doit montrer `fca49825` à 100 %, et `/routes` répondre de nouveau 404. Les tables vides de l'étape 2 sont sans effet sur l'ancien Worker.

### 4. Ingestion des parcours en production

```bash
DOTENV_CONFIG_PATH=.env.production-backup node scripts/ingest-routes.mjs --dry-run
DOTENV_CONFIG_PATH=.env.production-backup node scripts/ingest-routes.mjs
DOTENV_CONFIG_PATH=.env.production-backup node scripts/revalidate-translations.mjs --entity=routes
```

Attendu : environ 167 parcours, environ 26 tracés, « finished » en `success`. La revalidation (simulation) doit afficher `changed: 0`.

Vérification de l'API :

```bash
curl -s 'https://leblanc-api.elharchdenis.workers.dev/api/v1/routes?limit=3' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.items.length,j.items[0]?.hasTrack,j.nextCursor!==null)})'
curl -s 'https://leblanc-api.elharchdenis.workers.dev/api/v1/routes/geo?modes=foot,bike,mtb,horse' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.items.length,"parcours",j.items.filter(i=>i.hasTrack).length,"tracés")})'
```

Retour arrière : `UPDATE routes SET status = 'hidden'` (onglet vide, sans incidence ailleurs), ou retour arrière de l'étape 2, ou restauration depuis la sauvegarde.

### 5. Preview depuis le poste local (vérifiée ensemble, avant tout push)

```bash
SITEMAP_API_URL=https://leblanc-api.elharchdenis.workers.dev/api VITE_API_URL=https://leblanc-api.elharchdenis.workers.dev/api VITE_SITE_URL=https://leblanc-et-moi.pages.dev npm run build
node scripts/verify-production-build.mjs
npm exec --workspace=@leblanc/frontend -- wrangler pages deploy dist --project-name leblanc-et-moi --branch routes-preview
bash scripts/check-seo.sh https://routes-preview.leblanc-et-moi.pages.dev
```

- Réussite :
  - le build est validé (environ 2 300 URL, dont environ 1 000 fiches parcours) ;
  - `check-seo.sh` affiche « tous les contrôles sont passés » ;
  - la revue manuelle porte sur la liste, les filtres, la carte, une fiche avec tracé et GPX, une fiche sans tracé, les 6 langues et le mobile.
- Le build part de la copie locale de `main` (10 commits d’avance sur `origin/main`) : rien n’est poussé à cette étape.
- Retour arrière : supprimer le déploiement de preview (tableau de bord Pages).

### 6. Push de `main` et des tags (après validation de la preview)

```bash
git push origin main
git push origin se-balader-lot-1 se-balader-lot-2 se-balader-lot-3 se-balader-lot-4 se-balader-lot-5 se-balader-lot-6 se-balader-lot-7
```

- Vérification : `git ls-remote --tags origin 'se-balader-*'` doit lister 7 tags ; `gh workflow list --all` doit montrer les deux workflows `active`.
- Les workflows poussés appellent `db:ingest:routes` et `--entity=routes` : la migration 012 doit être appliquée avant (étape 2).
- Enchaîner l’étape 7 dans la même session.
- Retour arrière : `git revert` des commits concernés, puis push. Les tags peuvent être supprimés à distance (`git push origin :refs/tags/<tag>`).

### 7. Front en production

```bash
gh workflow run production.yml --repo sofresh66/Leblanc --ref main
gh run watch --repo sofresh66/Leblanc
```

- Réussite : toutes les étapes sont vertes, y compris « Actualiser les parcours ». Le résumé contient la section « Parcours « Se balader » », et `verify-production-build` mentionne des fiches parcours.
- Retour arrière : revenir au déploiement Pages précédent (`dc49c166`, ou le dernier en ligne au moment de la mise en production) depuis le tableau de bord Pages.

### 8. Vérifications après déploiement

```bash
bash scripts/check-seo.sh https://leblanc-et-moi.pages.dev
```

- **Sitemap** : contient `/fr/se-balader` et des fiches, avec les alternates.
- **404** : `/fr/se-balader/pas-un-uuid` et un UUID inconnu.
- **hreflang** : ×6 + x-default sur la liste et une fiche.
- **Carte** : `/fr/se-balader?view=map` affiche les tracés et l'attribution ODbL.
- **GPX** : téléchargement depuis une fiche avec tracé ; le fichier contient la licence ODbL.
- **Pages légales** : Crédits, À propos et Confidentialité dans une autre langue.
- **Le lendemain** : le run de 3 h et son étape « Actualiser les parcours » ; le lundi, le contrôle hebdomadaire des parcours.
