# Déploiement des corrections de l'audit (octobre 2026)

Tout a été validé sur la branche Neon `audit-fixes-2026-10`. Aucune étape ci-dessous ne s'exécute sur la production sans l'accord explicite du propriétaire.

## Base de production

1. Appliquer les migrations : `npm run db:migrate` (à partir de `009_text_search_extensions.sql`).
2. Après la migration 009, avec accord : exécuter `docs/sql/place-dedupe-decisions-2026-10.sql` (3 fusions, 13 paires `keep_separate`).
3. Après la migration 009, avec accord : relancer l'import manuel avec relance du géocodage, `node scripts/import-restaurants-manuel.mjs --retry-missing`. Faire d'abord un `--dry-run --retry-missing` pour contrôler.

4. Migration `010_event_translation_status.sql` : à appliquer **avant** de déployer le Worker, qui lit la colonne `translation_status`.
5. Après la migration 010, avec accord : `node scripts/revalidate-translations.mjs` (simulation), puis `--apply` pour calculer le statut des traductions déjà en base. Les ingestions suivantes le recalculent automatiquement.

6. Après l'étape 5, avec accord : `node scripts/score-translations.mjs` (rapport), puis `--apply` pour rejeter les fiches dont toutes les descriptions traduites ont un score < 0,50 (`record_mismatch`, 43 fiches sur la branche). Variables locales : `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`. Le rejet est conservé par l'ingestion tant que le contenu source est inchangé (empreinte) ; sinon il est levé et la fiche signalée « à rescorer ».

7. Migration `011_occurrence_all_day.sql` (colonne `all_day` + rattrapage des occurrences DATAtourisme sans heure) : à appliquer **avant** de déployer le Worker, qui la lit.

## Ordre de déploiement du code (lot 5)

- Le contrat HTTP change : curseur de pagination avec date de référence (`a`), `GET /v1/categories` renvoie `[{ key, count }]`, `isFree=unknown` et `q` acceptés. Déployer le Worker, puis le frontend Pages. Les anciens curseurs encore en mémoire dans un navigateur reçoivent `400 CURSOR_EXPIRED` et la liste repart de la première page.
- Diagnostic en lecture seule : `docs/sql/events-visibility-breakdown.sql`.

## Signalement au producteur

- `artifacts/signalement-destination-brenne.csv` (42 fiches) et `artifacts/signalement-berry.csv` (1 fiche), régénérés par `score-translations`. Constat vérifié sur le JSON brut DATAtourisme : un seul bloc de description, `@fr` correct, traductions (description et résumé) d'un autre événement du même cycle.

## Suites possibles

- Planifier `node scripts/score-translations.mjs --apply` chaque semaine dans GitHub Actions (secrets `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_AI_TOKEN`), pour contrôler les nouvelles fiches et rescorer celles dont le contenu a changé.

## Code

- Lots livrés sur `main` en local, non poussés : lot 1 (`746dff5`), lot 4 (`66d9044`), lot 3 (`51b3af7`, `f576880`), lot 2 (`761750d`, `3d23b6f`, `b3fa4c3`, `cafe3e6`), lot 5 (commit des filtres et de l'API).
