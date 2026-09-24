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
