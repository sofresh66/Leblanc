# Déploiement des corrections de l'audit (octobre 2026)

Tout a été validé sur la branche Neon `audit-fixes-2026-10`. **Aucune étape ci-dessous ne s'exécute sur la production sans l'accord explicite du propriétaire.**

## À savoir avant de commencer

- Le workflow `.github/workflows/production.yml` tourne chaque nuit à 3 h (heure de Paris) et à la demande, sur `main` distant. Il applique les migrations, lance les ingestions puis **déploie le front**, mais **ne déploie jamais le Worker**.
- Le nouveau front dépend de `/v1/events/geo`, du format `[{ key, count }]` de `/v1/categories` et du nouveau curseur. Le Worker doit donc être en production **avant** que ces commits arrivent sur `main` distant (sinon la publication de 3 h mettrait en ligne un front incompatible).
- Le `.env` local pointe vers la branche Neon. Pour la production, ouvrir un terminal dédié et charger les URL de production sans les afficher ; les scripts n'écrasent pas une variable déjà exportée :

```bash
set -a; . ./.env.production-backup; set +a
node -e 'console.log(new URL(process.env.DATABASE_URL_DIRECT).hostname)'
```

Vérification : l'hôte affiché est `ep-jolly-dawn-b2ezqckv.c-6.eu-central-1.aws.neon.tech` (production). Fermer ce terminal à la fin.

## 1. Migrations 009, 010, 011

```bash
npm run db:migrate
```

Réussite : la sortie liste `009_text_search_extensions.sql`, `010_event_translation_status.sql` et `011_occurrence_all_day.sql` en `[APPLIQUÉE]` et se termine par « Migrations terminées avec succès ». Contrôle :

```bash
node -e "const pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL_DIRECT});c.connect().then(()=>c.query(\"SELECT version FROM schema_migrations WHERE version >= '009' ORDER BY version\")).then(r=>{console.log(r.rows.map(x=>x.version));return c.end()})"
```

Attendu : les trois fichiers. Ces migrations sont compatibles avec le Worker actuel (colonnes ajoutées, aucune supprimée).

## 2. Déploiement du Worker

```bash
cd worker && npx wrangler deploy && cd ..
```

(`npx wrangler login` au préalable si nécessaire.) Réussite : wrangler affiche l'URL `https://leblanc-api.elharchdenis.workers.dev` et un identifiant de version. Contrôles :

```bash
curl -s https://leblanc-api.elharchdenis.workers.dev/health
curl -s 'https://leblanc-api.elharchdenis.workers.dev/api/v1/categories'
curl -s 'https://leblanc-api.elharchdenis.workers.dev/api/v1/events/geo?lang=fr' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.items.length,"points, tronqué :",j.truncated)})'
curl -s -o /dev/null -w '%{http_code}\n' 'https://leblanc-api.elharchdenis.workers.dev/api/v1/events?isFree=unknown&q=musique'
```

Attendu : `{"status":"ok",…}` ; un tableau `[{"key":"culture","count":…},…]` ; un nombre de points proche de la branche (143 le 8 octobre) ; `200`. Le front actuellement en ligne reste fonctionnel (il n'utilise ni `geo` ni `q`) ; seul le tableau des catégories change de forme, et l'ancien front ne l'affiche pas.

## 3. Scripts de données (production, chacun avec accord)

Dans l'ordre, toujours la simulation d'abord :

1. **Décisions de doublons** (3 fusions, 13 paires `keep_separate`) :

   ```bash
   node -e "const fs=require('fs'),pg=require('pg');const c=new pg.Client({connectionString:process.env.DATABASE_URL_DIRECT});c.connect().then(()=>c.query(fs.readFileSync('docs/sql/place-dedupe-decisions-2026-10.sql','utf8'))).then(r=>{console.log([].concat(r).filter(x=>x.command==='SELECT').map(x=>x.rows));return c.end()})"
   ```

   Réussite : la requête de contrôle affiche `merge` 3 paires / 3 masquées et `keep_separate` 13. Le script s'arrête sans rien écrire si un identifiant manque. Puis `node scripts/report-place-duplicates.mjs` doit afficher « 0 paire(s) candidate(s) ».

2. **Import manuel avec relance du géocodage** :

   ```bash
   node scripts/import-restaurants-manuel.mjs --dry-run --retry-missing
   node scripts/import-restaurants-manuel.mjs --retry-missing
   ```

   Réussite : la simulation trouve Perle d'Asie et Viet Thaï (`"found": 2`) ; l'import se termine par `"step": "finished"` avec `"geocoded": 52`.

3. **Statut des traductions** :

   ```bash
   node scripts/revalidate-translations.mjs
   node scripts/revalidate-translations.mjs --apply
   node scripts/revalidate-translations.mjs
   ```

   Réussite : le `--apply` affiche les rejets `override:cross_record_translation` (10 langues) ; la dernière simulation affiche `"changed": 0`.

4. **Rejet des fiches aux traductions décalées** (variables `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_AI_TOKEN` nécessaires) :

   ```bash
   node scripts/score-translations.mjs
   node scripts/score-translations.mjs --apply
   node scripts/revalidate-translations.mjs
   ```

   Réussite : `"recordMismatch"` autour de 43 et `"written"` égal au nombre de fiches modifiées ; la simulation de contrôle affiche `"changed": 0` et la raison `record_mismatch`. Les CSV de signalement sont régénérés dans `artifacts/`.

## 4. Déploiement du front (en dernier)

Le front embarque désormais un middleware Pages Functions (`frontend/functions/_middleware.ts`) : balises `<head>` par page, vraies 404 et en-têtes de sécurité. Le workflow le publie depuis `frontend/` (`npm exec --workspace=@leblanc/frontend -- wrangler pages deploy dist …`). Variables Pages facultatives : `API_URL` (défaut : `https://leblanc-api.elharchdenis.workers.dev/api`) et `SITE_URL` (défaut : `https://leblanc-et-moi.pages.dev`).

**Avant la production, une preview** (avec accord) :

```bash
SITEMAP_API_URL=https://leblanc-api.elharchdenis.workers.dev/api VITE_API_URL=https://leblanc-api.elharchdenis.workers.dev/api VITE_SITE_URL=https://leblanc-et-moi.pages.dev npm run build
npm exec --workspace=@leblanc/frontend -- wrangler pages deploy dist --project-name leblanc-et-moi --branch audit-preview
bash scripts/check-seo.sh https://audit-preview.leblanc-et-moi.pages.dev
```

Réussite : « tous les contrôles sont passés » (statuts 200/404, balises Open Graph, en-têtes de sécurité, cache immuable des assets).

Pousser `main` puis lancer le workflow (ou attendre 3 h) :

```bash
git push origin main
gh workflow run production.yml --repo sofresh66/Leblanc --ref main
gh run watch --repo sofresh66/Leblanc
```

Réussite : toutes les étapes du workflow sont vertes (tests, migrations déjà appliquées, ingestions, `verify-production-build`, publication Pages). Le résumé de l'étape DATAtourisme affiche la section « Traductions DATAtourisme ». Contrôles sur le site :

- `/fr/carte` : environ 140 points, sans bannière de limite ; `/fr/ou-manger?view=map` : 62 lieux sur la carte et 3 listés sans position ;
- `/fr/liste?q=musique` : « Musique ! » avec « Jusqu'au mar. 10 nov. » ;
- `/de/veranstaltungen/df0d2109-8eba-4b52-a0cf-4704fccd4314` : titre et description en français, mention « Beschreibung auf Französisch verfügbar » ;
- `/fr/a-propos` et `/fr/confidentialite` : plus d'OpenAgenda, Cloudflare Web Analytics déclaré.

Pagination pendant la transition : le Worker accepte encore les curseurs de l'ancien format (sans date de référence), avec `now()` comme référence, donc l'ancien front continue de paginer normalement. Les nouveaux curseurs portent une date de référence ; au-delà de 24 h, le Worker répond `400 CURSOR_EXPIRED` et le nouveau front repart de lui-même de la première page.

Après la mise en production : `bash scripts/check-seo.sh https://leblanc-et-moi.pages.dev`, puis tester un aperçu de partage (outil de débogage de partage de Facebook ou envoi d'un lien dans WhatsApp).

## CSP en mode rapport

- La politique est envoyée en `Content-Security-Policy-Report-Only` : rien n'est bloqué. Les violations arrivent sur `POST /api/v1/csp-report` et se lisent avec `cd worker && npx wrangler tail leblanc-api --search csp_violation`.
- Après une semaine sans violation légitime, passer en mode bloquant : remplacer `Content-Security-Policy-Report-Only` par `Content-Security-Policy` dans `shared/src/securityHeaders.ts`, régénérer `frontend/public/_headers` (un test vérifie qu'ils concordent) et redéployer.

## Diagnostic

- `docs/sql/events-visibility-breakdown.sql` (lecture seule) : ventile les événements en base selon leur motif d'exclusion de la liste.

## Signalement au producteur

- `artifacts/signalement-destination-brenne.csv` (42 fiches) et `artifacts/signalement-berry.csv` (1 fiche), régénérés par `score-translations`. Constat vérifié sur le JSON brut DATAtourisme : un seul bloc de description, `@fr` correct, traductions (description et résumé) d'un autre événement du même cycle.

## Suites possibles

- Planifier `node scripts/score-translations.mjs --apply` chaque semaine dans GitHub Actions (secrets `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_AI_TOKEN`), pour contrôler les nouvelles fiches et rescorer celles dont le contenu a changé.
- Fin de chantier : supprimer la branche Neon de test, avec `npx neonctl branches delete audit-fixes-2026-10 --project-id still-feather-70001673`, puis `npx neonctl auth --logout` si la session n'est plus utile.

## Code

- Commits sur `main` en local, non poussés : lot 1 (`746dff5`), lot 4 (`66d9044`), lot 3 (`51b3af7`, `f576880`), lot 2 (`761750d`, `3d23b6f`, `b3fa4c3`, `cafe3e6`), lot 5 (`3a1c6b0`), lot 6 (`b744d2b`), lot 7 (SEO, 404, en-têtes).
