# Déploiement des corrections de l'audit (octobre 2026)

Tout a été validé sur la branche Neon `audit-fixes-2026-10`. Aucune étape ci-dessous ne s'exécute sur la production sans l'accord explicite du propriétaire.

## Base de production

1. Appliquer les migrations : `npm run db:migrate` (à partir de `009_text_search_extensions.sql`).
2. Après la migration 009, avec accord : exécuter `docs/sql/place-dedupe-decisions-2026-10.sql` (3 fusions, 13 paires `keep_separate`).
3. Après la migration 009, avec accord : relancer l'import manuel avec relance du géocodage, `node scripts/import-restaurants-manuel.mjs --retry-missing`. Faire d'abord un `--dry-run --retry-missing` pour contrôler.

4. Migration `010_event_translation_status.sql` : à appliquer **avant** de déployer le Worker, qui lit la colonne `translation_status`.
5. Après la migration 010, avec accord : `node scripts/revalidate-translations.mjs` (simulation), puis `--apply` pour calculer le statut des traductions déjà en base. Les ingestions suivantes le recalculent automatiquement.

## Rapport d'embeddings (facultatif, avant d'activer un rejet sémantique)

- Ajouter `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_AI_TOKEN` (permission Workers AI) au `.env` local, puis lancer `node scripts/score-translations.mjs`. Lecture seule ; résultats dans `artifacts/translation-scores.csv`.

## Code

- Lots livrés sur `main` en local, non poussés : `746dff5` (lot 1), `66d9044` (lot 4), `51b3af7` et `f576880` (lot 3).
