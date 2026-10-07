-- Occurrence « journée entière » : la source ne donne pas d'heure. Le
-- normaliseur la stockait de 00:00 à 23:59:59 (Europe/Paris) sans le dire.
ALTER TABLE event_occurrences ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT false;

-- Rattrapage des occurrences DATAtourisme déjà importées (sans heure de début
-- ni de fin). Les autres sources ne sont pas touchées : un 00:00 peut y être réel.
UPDATE event_occurrences
SET all_day = true
WHERE source_fingerprint LIKE 'datatourisme:%'
  AND (starts_at AT TIME ZONE 'Europe/Paris')::time = '00:00:00'
  AND (ends_at IS NULL OR (ends_at AT TIME ZONE 'Europe/Paris')::time = '23:59:59');

-- Retour arrière (manuel) : après avoir redéployé un Worker qui ne lit plus la colonne.
--   ALTER TABLE event_occurrences DROP COLUMN IF EXISTS all_day;
--   DELETE FROM schema_migrations WHERE version = '011_occurrence_all_day.sql';
