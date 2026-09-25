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
