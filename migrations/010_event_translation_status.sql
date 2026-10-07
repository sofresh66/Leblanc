-- Statut de cohérence des traductions DATAtourisme, par langue. La donnée brute
-- (title_i18n, description_i18n) n'est jamais modifiée : l'API ne sert que les
-- traductions validées. Un objet vide ou une langue absente vaut « ok ».
-- Forme : { "de": { "status": "ok|rejected", "titleStatus": "ok|ignored_identical",
--   "descriptionStatus": "ok|ignored_identical", "reason": "...", "checkedAt": "..." } }
-- La valeur de statut « machine » est réservée à une future traduction automatique.
ALTER TABLE events ADD COLUMN IF NOT EXISTS translation_status JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Retour arrière (manuel) : à faire après avoir redéployé un Worker qui ne lit plus la colonne.
--   ALTER TABLE events DROP COLUMN IF EXISTS translation_status;
--   DELETE FROM schema_migrations WHERE version = '010_event_translation_status.sql';
