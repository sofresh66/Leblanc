-- true = gratuit confirmé ; false = payant ; null = tarif non précisé.
-- Les valeurs existantes seront corrigées par la prochaine ingestion DATAtourisme.
ALTER TABLE events ALTER COLUMN is_free DROP NOT NULL;
COMMENT ON COLUMN events.is_free IS
  'true: gratuit confirmé; false: payant; null: tarif non précisé';
