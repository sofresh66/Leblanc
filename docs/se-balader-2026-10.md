# Onglet « Se balader » (octobre 2026)

Randonnées, balades à vélo, circuits VTT et itinéraires équestres autour du Blanc et dans le Parc naturel régional de la Brenne. Développé et validé sur la branche Neon `dev` (lots 1 à 7, tags `se-balader-lot-1` à `se-balader-lot-7`). Migration, API et données en production ; preview validée et code poussé. État de la publication du front : voir le [plan de mise en production](#plan-de-mise-en-production) en fin de document.

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

**Tentative du 10 octobre 2026 (16:01 UTC) : retour arrière.**

- Le déploiement a créé la version `3758615a-8bed-4d2b-87b7-6b113c2b3620`. Le script, lancé dans la seconde qui suivait, a échoué sur un seul contrôle : « preview du projet autorisée ».
- Retour arrière immédiat vers `fca49825` (16:03 UTC environ). Vérifié : 100 %, `/routes` en 404, `/events` et `/health` en 200.
- Cause : transition entre versions juste après le déploiement. Le code est en cause ailleurs que prévu, il n'est pas fautif : sur l'URL dédiée à la version, `https://3758615a-leblanc-api.elharchdenis.workers.dev`, sans trafic de production, les 20 contrôles passent.
- La comparaison structurelle avec l'ancien Worker passe aussi : 12 réponses (`/events`, `/events/geo`, une fiche événement, `/categories`, `/places`, une fiche lieu, en `fr` et `en`), aucune clé supprimée ou renommée, types et en-têtes `Cache-Control`, CORS, `Vary` et `Content-Type` identiques. Enregistrements dans `artifacts/worker-snapshots/` (non versionné).
- `scripts/verify-worker-deploy.sh` attend désormais la stabilité de la nouvelle version : 5 réponses consécutives, 90 s au plus. Il affiche aussi le statut et l'en-tête CORS reçus en cas d'échec.

**Nouvelle tentative (à valider).** Redéployer exactement la version vérifiée, sans reconstruire :

```bash
cd worker && npx wrangler versions deploy 3758615a-8bed-4d2b-87b7-6b113c2b3620@100 --message "Se balader : API des parcours et CORS des previews" -y && cd ..
bash scripts/verify-worker-deploy.sh https://leblanc-api.elharchdenis.workers.dev vide
npx wrangler deployments list --name leblanc-api --cwd worker
```

Puis comparer l'enregistrement « avant » avec la production (outil de comparaison de l'étape 3). En cas de contrôle en échec ou de régression : retour arrière vers `fca49825` sans attendre.

**Hypothèse du cache écartée (lecture seule, avant la nouvelle tentative).**
- Le Worker n'utilise aucun cache : ni `caches.default`, ni `cacheTtl` ou `cacheEverything`, ni option `cf`, ni appel `fetch` sortant mis en cache.
- Il est servi uniquement sur `workers.dev`, sans route de zone ni règle de cache.
- Les réponses ne portent ni `cf-cache-status` ni `age`. `Access-Control-Allow-Origin` suit l'origine de chaque requête, y compris pour des demandes successives de la même URL avec des origines différentes, sur l'ancienne comme sur la nouvelle version.

**Fait le 10 octobre 2026 vers 16:20 UTC.**
- `wrangler versions deploy 3758615a-8bed-4d2b-87b7-6b113c2b3620@100` : version **`3758615a` à 100 %**, message « Se balader : API des parcours et CORS des previews ».
- `verify-worker-deploy.sh … vide` : propagation stable dès le 5e essai, **20 contrôles sur 20**.
- Comparaison avec l'enregistrement « avant » (`artifacts/worker-snapshots/after/`) : 12 réponses conformes, aucune clé supprimée ou renommée, types et en-têtes identiques.
- Retour arrière disponible : `npx wrangler rollback fca49825-70c4-4101-a78f-2624345db03f`.

### 4. Ingestion des parcours en production

Seulement une fois l'étape 3 réussie : `/routes` doit répondre 200 en production. La simulation d'abord, puis l'ingestion réelle, chacune protégée par le contrôle d'hôte :

```bash
H=$(DOTENV_CONFIG_PATH=.env.production-backup node -r dotenv/config -e 'process.stdout.write(new URL(process.env.DATABASE_URL_DIRECT).hostname)'); echo "Hôte : $H"; [ "$H" = "ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech" ] && DOTENV_CONFIG_PATH=.env.production-backup node scripts/ingest-routes.mjs --dry-run
H=$(DOTENV_CONFIG_PATH=.env.production-backup node -r dotenv/config -e 'process.stdout.write(new URL(process.env.DATABASE_URL_DIRECT).hostname)'); echo "Hôte : $H"; [ "$H" = "ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech" ] && DOTENV_CONFIG_PATH=.env.production-backup node scripts/ingest-routes.mjs
DOTENV_CONFIG_PATH=.env.production-backup node scripts/revalidate-translations.mjs --entity=routes
```

Les scripts lisent `DATABASE_URL_DIRECT` et `DATATOURISME_API_KEY`, présentes dans `.env.production-backup`. L'ingestion fait aussi une requête Overpass.

Attendu, d'après la répétition du 10 octobre 2026 sur `dev`, à partir de tables vides comme en production (25 s) :
- **simulation** : `fetched` ≈ 614, `accepted` ≈ 167, `created` = `accepted`, `withTrack` ≈ 26, `osm.available: true` ;
- **ingestion** : `status: success`, `created` ≈ 167, `withTrack` ≈ 26 ;
- **traductions** : `rejected: 1` (la balade n°7 en anglais, override) et `rejectedDescriptions: 15` (3 itinérances sans description française × 5 langues) ;
- **revalidation** (lecture seule) : `changed: 0`.

Si Overpass est indisponible (`osm.available: false`), les fiches sont publiées sans tracé. Relancer l'ingestion plus tard suffit à récupérer les tracés.

Vérifications de l'API (lecture seule) :

```bash
bash scripts/verify-worker-deploy.sh https://leblanc-api.elharchdenis.workers.dev données
curl -s 'https://leblanc-api.elharchdenis.workers.dev/api/v1/routes/geo?modes=foot,bike,mtb,horse' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.items.length,"parcours,",j.items.filter(i=>i.hasTrack).length,"tracés")})'
ID=$(curl -s 'https://leblanc-api.elharchdenis.workers.dev/api/v1/routes?with_track=true&limit=1' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).items[0].id))'); curl -s -o /dev/null -w "fiche %{http_code}\n" "https://leblanc-api.elharchdenis.workers.dev/api/v1/routes/$ID?lang=en"; curl -s "https://leblanc-api.elharchdenis.workers.dev/api/v1/routes/$ID/gpx" | grep -c "opendatacommons.org/licenses/odbl"
```

Attendu :
- le script affiche « tous les contrôles sont passés » (liste avec curseur, tracés présents) ;
- ≈ 167 parcours, dont ≈ 26 tracés ;
- la fiche répond 200 et le GPX contient la licence ODbL (`1`).

Retour arrière : vider les deux tables (le schéma de la migration 012 reste en place), en une seule transaction :

```bash
DOTENV_CONFIG_PATH=.env.production-backup node scripts/clear-routes.mjs
DOTENV_CONFIG_PATH=.env.production-backup node scripts/clear-routes.mjs --apply --confirm-host=ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech
```

- La première commande fait un décompte en lecture seule. La seconde n'écrit que si `--confirm-host` correspond exactement à l'hôte visé (testé sur `dev`, où elle refuse un autre hôte).
- Ensuite, `/routes` doit répondre de nouveau avec une liste vide.
- Autres options : retour arrière de l'étape 2, ou restauration depuis `prod-avant-routes-2026-10-10`.

**Fait le 10 octobre 2026 vers 16:23 UTC** (hôte contrôlé avant chaque commande : `ep-jolly-dawn-b2ezqckv…`).
- Simulation : `fetched` 614, `pageErrors` 0, `excluded.motorised` 6, hors périmètre 441, `accepted` 167, `created` 167, `withTrack` 26, OSM disponible (71 relations), 1 rejet de traduction (`override:cross_record_translation`). Identique à la répétition sur `dev`.
- Ingestion : run `1df7d5e4-f5f4-4150-adfd-f8cb655d7c70`, `status: success`, `created` 167, `withTrack` 26, `hidden` 0. Par mode : à pied 93, à cheval 50, vélo 26, VTT 6. Traductions : `rejected` 1, `rejectedDescriptions` 15.
- Revalidation (lecture seule) : 167 parcours, `changed: 0`, `rescoreNeeded: 0`.
- `verify-worker-deploy.sh … données` : 20 contrôles sur 20.
- `/routes/geo` tous modes : 167 parcours, 26 tracés, 81 Ko non compressé ; vue par défaut (sans cheval) : 119. Liste paginée par curseur : 167, sans doublon ni manque.
- Fiche avec tracé (`262dd712…`, « Itinéraire vélo n°8 », fr et en) : 200, `hasTrack` et `gpxAvailable` vrais, relation OSM 11805696, attributions Licence Ouverte 2.0 et ODbL 1.0. GPX : 200, `application/gpx+xml`, 857 points, `<copyright author="OpenStreetMap contributors">` et licence ODbL.
- Fiche sans tracé (`5c18cc4c…`, « Balade à pied n°32 ») : 200, `track` nul, `gpxAvailable` faux, seule attribution Licence Ouverte 2.0 ; GPX en 404.
- `/nearby` sur les deux fiches : 200, 6 événements et 6 lieux.

### 5. Preview depuis le poste local (vérifiée ensemble, avant tout push)

Depuis la racine du dépôt, copie locale de `main` :

```bash
SITEMAP_API_URL=https://leblanc-api.elharchdenis.workers.dev/api VITE_API_URL=https://leblanc-api.elharchdenis.workers.dev/api VITE_SITE_URL=https://leblanc-et-moi.pages.dev VITE_USE_MOCK=false npm run build
node scripts/verify-production-build.mjs
node scripts/verify-preview-dist.mjs
npm exec --workspace=@leblanc/frontend -- wrangler pages deploy dist --project-name leblanc-et-moi --branch routes-preview --commit-dirty=true
bash scripts/check-seo.sh https://routes-preview.leblanc-et-moi.pages.dev
```

- **API de production au build.** Ce sont les valeurs exactes du workflow (contrôlées par son étape « Vérifier la configuration »). Vite lit `.env` à la racine (`envDir: '..'`), où `VITE_API_URL` est vide, mais les variables passées dans la commande sont prioritaires sur les fichiers `.env`. Le sitemap est généré pendant le build à partir de `SITEMAP_API_URL` : il contient donc les fiches parcours de production.
- **Middleware.** En preview, il lit `API_URL` et `SITE_URL`, à défaut de quoi il prend l'API et le site de production (`frontend/functions/_middleware.ts`). Les balises canonical et hreflang pointent donc vers `leblanc-et-moi.pages.dev`, et la preview ne concurrence pas le site dans l'indexation. Cloudflare ajoute en outre `X-Robots-Tag: noindex` aux déploiements de preview.
- **Déploiement.** `--branch routes-preview` n'est pas la branche de production (`main`) du projet Pages : c'est un déploiement de preview, sans effet sur le site. Le dossier `functions/` est envoyé avec `dist/` parce que `npm exec --workspace` s'exécute depuis `frontend/`. `--commit-dirty=true` évite seulement l'avertissement lié aux fichiers non suivis (`.claude/`, `docs/diagnostic-…`), qui ne sont pas dans le build.
- **URL attendues** : l'alias de branche `https://routes-preview.leblanc-et-moi.pages.dev` et l'URL du déploiement `https://<hash>.leblanc-et-moi.pages.dev` (affichée par wrangler). Le CORS du Worker accepte les deux.
- Réussite :
  - le build est validé, avec des fiches parcours dans le sitemap (167 × 6 langues ≈ 1 000 URL) ;
  - `check-seo.sh` affiche « tous les contrôles sont passés » ;
  - la revue manuelle porte sur la liste, les filtres, la carte, une fiche avec tracé et GPX, une fiche sans tracé, les 6 langues et le mobile.
- Rien n'est poussé à cette étape.
- Retour arrière : supprimer le déploiement de preview (tableau de bord Pages › leblanc-et-moi › Deployments). Il n'a de toute façon aucun effet sur la production.

**Préparation du 10 octobre 2026 : arrêt avant déploiement.**
- Build local avec les variables de production : code de sortie 0 ; `verify-production-build.mjs` : code 0, sitemap de 2 482 153 octets, 2 346 URL (906 fiches événements, 390 fiches lieux, **1 002 fiches parcours**, soit 167 par langue).
- Contrôle de 106 fichiers dans `frontend/dist` : API de production présente dans `assets/index-Chc4TsZU.js` et `_headers` ; aucune URL localhost ou loopback.
- Le contrôle strict de toute occurrence du mot `localhost` sort en code 1 : une occurrence dans une expression régulière de `i18next-browser-languagedetector`, destinée à reconnaître la langue dans un sous-domaine. Ce n'est pas une URL d'API ni une destination de requête.
- Conformément à la consigne du propriétaire en cas d'échec, aucun déploiement de preview effectué, `check-seo.sh` non lancé, aucun commit ni push. Validation du traitement de cette occurrence nécessaire avant reprise.

**Reprise autorisée le 10 octobre 2026.**
- Le propriétaire accepte l'occurrence technique de `localhost`. Comparaison en lecture seule avec `96ef52a9` : la même expression régulière est déjà présente dans le bundle en ligne `assets/index-DXSxAJTk.js` ; rien de nouveau sur ce point.
- Le contrôle reproductible `scripts/verify-preview-dist.mjs` cherche les URL HTTP(S), ainsi que les URL relatives au protocole, vers `localhost`, `127.0.0.1`, `0.0.0.0` et `[::1]`. Il exige aussi l'API de production dans un bundle JS et des fiches parcours dans le sitemap. Le mot seul ne provoque plus d'échec.
- Réutilisation du `dist` déjà construit : seuls la documentation et le script de contrôle ont changé, sans rebuild du front.

**Preview publiée et validée par le propriétaire le 10 octobre 2026.**
- `verify-preview-dist.mjs` : code 0, 106 fichiers contrôlés, API de production présente, aucune URL locale ; sitemap de 2 346 URL dont 1 002 fiches parcours. ESLint du nouveau script et `git diff --check` : code 0.
- `npm exec --workspace=@leblanc/frontend -- wrangler pages deploy dist --project-name leblanc-et-moi --branch routes-preview --commit-dirty=true` : code 0 ; bundle Functions envoyé ; aucun rebuild du front.
- Alias : https://routes-preview.leblanc-et-moi.pages.dev ; URL propre au déploiement : https://6e05a724.leblanc-et-moi.pages.dev.
- `bash scripts/check-seo.sh https://routes-preview.leblanc-et-moi.pages.dev` : code 0, « tous les contrôles sont passés » (sitemap, hreflang, canonical, JSON-LD, 404, sécurité et cache des assets).
- Les deux URL servent `/fr/se-balader` en HTTP 200 avec `X-Robots-Tag: noindex`.
- Pages à examiner sur l'alias, sur ordinateur et mobile :
  - liste et filtres : `/fr/se-balader` ; carte et attribution ODbL : `/fr/se-balader?view=map` ;
  - fiche avec tracé et téléchargement GPX : `/fr/se-balader/262dd712-7e99-4065-bbce-2d5a41ec41d9` (Itinéraire vélo n°8) ;
  - fiche sans tracé : `/fr/se-balader/5c18cc4c-3dcc-4ccc-ae46-9d195d524c59` (Balade à pied n°32) ;
  - six langues : `/fr/se-balader`, `/en/trails`, `/es/rutas`, `/de/touren`, `/it/percorsi`, `/nl/routes` ; changer aussi la langue depuis une fiche ;
  - pages légales : `/fr/credits`, `/fr/a-propos`, `/en/privacy` ;
  - pages existantes : `/fr`, `/fr/liste`, `/fr/carte`, `/fr/lieux/008706e1-dbe5-4ad8-8b44-c219300861d7`.
- Arrêt après l'étape 5 : aucun commit, aucun push, aucune étape 6 ou 7 lancée. Le propriétaire valide lui-même la preview avant toute suite.
- Validation reçue : étapes 6 et 7 autorisées dans la même session, puis vérifications de l'étape 8 si le workflow réussit. Le commit préparatoire porte uniquement sur ce document ; `scripts/verify-preview-dist.mjs` reste un contrôle local non suivi, comme `.claude/` et `docs/diagnostic-indexation-2026-10-02.md`.

### 6. Push de `main` et des tags (après validation de la preview)

```bash
git push origin main
git push origin se-balader-lot-1 se-balader-lot-2 se-balader-lot-3 se-balader-lot-4 se-balader-lot-5 se-balader-lot-6 se-balader-lot-7
```

- Vérification : `git ls-remote --tags origin 'se-balader-*'` doit lister 7 tags ; `gh workflow list --all` doit montrer les deux workflows `active`.
- Les workflows poussés appellent `db:ingest:routes` et `--entity=routes` : la migration 012 doit être appliquée avant (étape 2).
- Enchaîner l’étape 7 dans la même session.
- Retour arrière : `git revert` des commits concernés, puis push. Les tags peuvent être supprimés à distance (`git push origin :refs/tags/<tag>`).

**Fait le 10 octobre 2026, après validation de la preview.**
- Commit local de la doc seule : `1ef7f625fd3e93bd69e152233e84b17b6d163c1b`. Avant les pushes : fichiers suivis propres, aucun `*.production-backup` suivi, `origin/main` toujours sur `5febaa6` après fetch.
- `git push origin main` : code 0, `5febaa6..1ef7f62` ; `git push origin 'refs/tags/se-balader-*'` : code 0, sept tags créés. Vérification distante : `main` sur `1ef7f62` et les sept tags présents ; les deux workflows sont actifs.
- `.claude/`, `docs/diagnostic-indexation-2026-10-02.md` et le contrôle local `scripts/verify-preview-dist.mjs` restent non suivis.

### 7. Front en production

```bash
gh workflow run production.yml --repo sofresh66/Leblanc --ref main
gh run watch --repo sofresh66/Leblanc
```

- Réussite : toutes les étapes sont vertes, y compris « Actualiser les parcours ». Le résumé contient la section « Parcours « Se balader » », et `verify-production-build` mentionne des fiches parcours.
- Retour arrière : revenir au déploiement Pages **`96ef52a9-e658-4825-8b8a-08ddf0a43137`** depuis le tableau de bord Pages. Référence actualisée le 10 octobre 2026 : déploiement de la nuit, issu de `5febaa6`, avec les mêmes fichiers JS/CSS que `dc49c166`. Vérifier de nouveau le déploiement en ligne au moment de la mise en production.

**Tentative du 10 octobre 2026 à 18:47 (heure de Paris) : échec avant publication.**
- `gh workflow run production.yml --ref main` : code 0 ; run [38069088767](https://github.com/sofresh66/Leblanc/actions/runs/38069088767), commit `1ef7f62`. Suivi jusqu'au résultat : échec, code de sortie 1, étape « Exécuter tous les tests ».
- Résultat : 644 tests passent, 1 échoue ; 71 fichiers passent, 1 échoue. `frontend/src/pages/WalkPage.test.tsx:73` attend `/api/v1/routes/c1000000-0000-4000-8000-000000000001/gpx`, mais reçoit `https://leblanc-api.elharchdenis.workers.dev/api/v1/routes/c1000000-0000-4000-8000-000000000001/gpx` : le test suppose une base relative, alors que le workflow fournit `VITE_API_URL` de production.
- Migrations, ingestions, build et publication Pages non exécutés. Lecture de la liste Pages après échec : production toujours sur `96ef52a9` (source `5febaa6`), preview `6e05a724` conservée. Worker vérifié : `3758615a` à 100 %.
- Arrêt demandé par le propriétaire à la fin de cette tentative : aucune correction ou relance, aucun retour arrière nécessaire. Compte rendu repris dans la documentation lors du correctif suivant.

**Correctif de test autorisé et vérifié le 10 octobre 2026.**
- Seul `frontend/src/pages/WalkPage.test.tsx` change : l'assertion du lien GPX vérifie la fin `/api/v1/routes/<id>/gpx`, indépendamment de l'origine définie par `VITE_API_URL`. Aucun code de l'application modifié.
- Recherche des autres tests sensibles à `VITE_API_URL` ou `VITE_SITE_URL` : aucune autre correction nécessaire après exécution de toute la suite.
- Avec les variables du workflow (`VITE_API_URL=https://leblanc-api.elharchdenis.workers.dev/api`, `VITE_SITE_URL=https://leblanc-et-moi.pages.dev`, `VITE_USE_MOCK=false`) : **645 tests, 72 fichiers, tous passent**, code 0.
- Sans les trois variables de processus : **645 tests, 72 fichiers, tous passent**, code 0. Les valeurs des fichiers `.env` n'ont pas été modifiées.
- `npm run lint` et `npm run typecheck` : code 0 chacun. Le premier lancement des tests avait échoué avant leur exécution sur une restriction de lecture d'esbuild ; la relance avec les droits nécessaires a réussi.
- Autorisation du propriétaire : commit du test seul, commit de documentation séparé, puis push et relance de `production.yml` sans nouvel accord si le diff ne contient que tests et doc.

### 8. Vérifications après déploiement

**Non exécutée après cette tentative : l'étape 7 n'a publié aucun nouveau front.**

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
