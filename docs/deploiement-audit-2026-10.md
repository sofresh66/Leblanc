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

- La politique est envoyée en `Content-Security-Policy-Report-Only` : rien n'est bloqué. Les violations arrivent sur `POST /api/v1/csp-report`, qui écrit une ligne `csp_violation` par violation dans les journaux du Worker.
- **Conservation des rapports (constat du 9 octobre)** : l'observabilité du Worker n'est pas activée (`observability` absent de `worker/wrangler.jsonc`, `null` côté Cloudflare). Les rapports ne sont donc visibles qu'en direct (`cd worker && npx wrangler tail leblanc-api --search csp_violation`) ; ceux reçus depuis le 8 octobre sont perdus. Activer Workers Logs (`"observability": { "enabled": true }`) demande un redéploiement du Worker ; rétention de 3 jours sur l'offre gratuite (7 jours en payant), à relire dans le tableau de bord (Workers › leblanc-api › Observability, filtre `csp_violation`).
- Passage en mode bloquant préparé sur la branche locale `csp-enforce` (commit `39dd114`, non poussé, non déployé) : `Content-Security-Policy` au lieu de `-Report-Only` dans `shared/src/securityHeaders.ts` et `frontend/public/_headers` (un test vérifie qu'ils concordent), `report-uri` conservé, `scripts/check-seo.sh` adapté. Pour l'appliquer : fusionner la branche dans `main`, pousser, lancer le workflow de production, puis `bash scripts/check-seo.sh https://leblanc-et-moi.pages.dev`.
- **Vers le 15 octobre : relire les rapports CSP, puis basculer en bloquant.**

## Diagnostic

- `docs/sql/events-visibility-breakdown.sql` (lecture seule) : ventile les événements en base selon leur motif d'exclusion de la liste.

## Signalement au producteur

- `artifacts/signalement-destination-brenne.csv` (42 fiches) et `artifacts/signalement-berry.csv` (1 fiche), régénérés par `score-translations`. Constat vérifié sur le JSON brut DATAtourisme : un seul bloc de description, `@fr` correct, traductions (description et résumé) d'un autre événement du même cycle.

## Suites possibles

- Contrôle hebdomadaire des traductions : voir la section dédiée ci-dessous.

## Mise en production (8 octobre 2026)

| Élément | En production | Retour arrière |
| --- | --- | --- |
| Base Neon | migrations 009–011 et scripts de données appliqués | branche `prod-avant-audit-2026-10-08` (`br-crimson-water-b254j02n`), créée avant les migrations |
| Worker `leblanc-api` | version `31b80495-1789-4073-8ea7-cd442e0b3687` (règle `no_reference`) | `cd worker && npx wrangler rollback d1b04b10-4c84-4214-af37-8b09958d6306` (puis `e00670e9-e9c2-4674-b59a-0d5cd2a0aad9`, version d'avant l'audit) |
| Pages `leblanc-et-moi` | déploiement `27bb1224` (commit `7bcdf19`, run GitHub 37825962574) | déploiement `e74b1756` (puis `8fd6b244-6713-433c-b644-7a007429b537`, avant l'audit) |

`main` est poussé jusqu'à `7bcdf19`. `scripts/check-seo.sh https://leblanc-et-moi.pages.dev` passe tous ses contrôles ; aucun en-tête `x-robots-tag` en production.

### Correctif du 8 octobre (soir) : description française absente

- Règle `no_reference` : sans description française, les descriptions traduites ne sont pas servies (le titre suit les règles habituelles) ; liste blanche respectée (« Marché hebdomadaire », traduction relue). Fiche concernée : « Moins de voiture, plus d'aventure ! », qui affiche « Description non disponible ».
- Statut appliqué en production par `revalidate-translations --apply` ; l'ingestion de nuit applique la règle (`rejectedDescriptions` dans son résumé).
- Les CSV de signalement ont une colonne `motif` (« traductions d'un autre événement » ou « description française absente ») : 44 fiches Destination Brenne, 1 BERRY.

## Contrôle hebdomadaire des traductions

- Workflow `.github/workflows/translations-weekly.yml` : chaque lundi à 05:00 (heure de Paris) et à la demande (`gh workflow run translations-weekly.yml`, champ facultatif `max_new_rejections`).
- Exécute `node scripts/score-translations.mjs --apply` sur la production : règle de fiche (`record_mismatch`, seuil 0,50), liste blanche, overrides et empreintes, comme en local.
- Même groupe de concurrence que `production.yml` (`leblanc-production`), `cancel-in-progress: false` des deux côtés : un run qui démarre pendant l'autre se met en file et attend. Limite de GitHub : un groupe n'a qu'un seul run en attente ; si un troisième arrive, le run en attente le plus ancien est annulé (cas rare : relancer à la main). L'écriture se fait en une seule transaction, donc jamais à moitié.
- Garde-fou : si plus de 10 fiches passeraient **nouvellement** en rejet, rien n'est écrit, le run échoue et la liste est publiée dans le résumé du run. Après vérification, relancer avec un `max_new_rejections` plus élevé.
- Résumé dans l'onglet du run ; CSV de signalement et scores en artefact (90 jours).
- Secrets : `DATABASE_URL_DIRECT` (existant) et `CLOUDFLARE_AI_TOKEN` (token dédié limité au compte, permissions « Workers AI : Read » et « Workers AI : Edit », exigées par la documentation pour un token personnalisé) ; `CLOUDFLARE_ACCOUNT_ID` est déjà une variable du dépôt.
- Lecture seule du 9 octobre sur la production : 223 fiches, 42 en rejet, dont 2 nouvelles (« Une épopée municipale », « Musique ! Une histoire des pratiques musicales amateurs ») : sous le seuil du garde-fou.

## Workflows programmés désactivés après 60 jours sans commit

Le dépôt est public : GitHub désactive automatiquement les workflows programmés (`schedule`) après 60 jours sans activité sur le dépôt (aucun commit). Cela concerne l'ingestion de nuit (`production.yml`) comme le contrôle hebdomadaire (`translations-weekly.yml`) ; le site reste en ligne mais ses données ne sont plus actualisées.

- **Détecter** : GitHub envoie un courriel d'avertissement au propriétaire avant la désactivation. `gh workflow list --all` affiche alors l'état `disabled_inactivity` au lieu de `active`, et l'onglet Actions montre un bandeau « This scheduled workflow is disabled because there hasn't been activity in this repository for at least 60 days ». Autre signe : `gh run list --event schedule --limit 1` ne montre plus de run récent.
- **Réactiver** : `gh workflow enable production.yml` et `gh workflow enable translations-weekly.yml` (ou le bouton « Enable workflow » dans l'onglet Actions). Un commit sur `main` remet aussi le compteur à zéro, mais ne réactive pas un workflow déjà désactivé.
- **Prévenir** : pousser au moins un commit tous les deux mois (par exemple la relecture des signalements) ou surveiller le courriel d'avertissement.

## Mises à jour du 9 octobre (soir)

| Élément | En production | Retour arrière |
| --- | --- | --- |
| Worker `leblanc-api` | version `fca49825-70c4-4101-a78f-2624345db03f` : Workers Logs activé, `console.log` conservés, sans journal par requête (`invocation_logs: false`) | `cd worker && npx wrangler rollback 1670ef08-6177-4231-b54c-fcf191211e75` (Workers Logs avec journaux par requête), puis `31b80495-1789-4073-8ea7-cd442e0b3687` (sans observabilité) |
| Pages `leblanc-et-moi` | déploiement `dc49c166` (commit `2d4bb0f`, run GitHub 37977752479) : statut des dates sur l'heure de fin, dates passées masquées, 5 dates puis « Voir les N autres dates » | déploiement `4f037222` |
| Base Neon | contrôle hebdomadaire, run 37979260705 : 227 fiches, 41 en rejet, 3 écrites (2 nouveaux rejets), garde-fou non déclenché | relancer `revalidate-translations` ou restaurer depuis `prod-avant-audit-2026-10-08` |

- Branche Neon `audit-fixes-2026-10` renommée `dev` et réinitialisée depuis la production (même hôte `ep-falling-breeze-b23mlam0`, `.env` inchangé).
- Preview `audit-preview` : déploiement `d7830937` supprimé. L'alias `audit-preview.leblanc-et-moi.pages.dev` sert encore l'ancien build (`noindex`) ; à supprimer si besoin depuis le tableau de bord Pages.

## Reste à faire

- Relire les 45 fiches signalées (`artifacts/signalement-*.csv`) et les transmettre à Destination Brenne et BERRY.
- Vers le 15 octobre : relire les rapports CSP, puis basculer en bloquant (branche `csp-enforce`, voir plus haut).
- Avant le 8 novembre (expiration du token actuel) : vérifier que le contrôle hebdomadaire tourne avec le token durable `CLOUDFLARE_AI_TOKEN`.
- **Branche de sauvegarde `prod-avant-audit-2026-10-08` (`br-crimson-water-b254j02n`) : conservée jusqu'au 5 novembre 2026**, puis supprimable avec `npx neonctl branches delete br-crimson-water-b254j02n --project-id still-feather-70001673`.
- Alias `audit-preview.leblanc-et-moi.pages.dev` encore servi (ancien build, `noindex`) : vérifier sa disparition, sinon le retirer depuis le tableau de bord Pages.
- `npx neonctl auth --logout` en fin de chantier.
