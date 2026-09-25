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
