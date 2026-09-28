-- Données OpenStreetMap : horaires bruts et candidats à la déduplication.
-- Migration réexécutable ; aucune table d'événements n'est modifiée.
ALTER TABLE places ADD COLUMN IF NOT EXISTS opening_hours_raw text;

CREATE TABLE IF NOT EXISTS place_dedupe_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  left_place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  right_place_id uuid NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  score numeric(4,3) NOT NULL CHECK (score BETWEEN 0 AND 1),
  level int NOT NULL CHECK (level IN (1, 2, 3)),
  distance_meters numeric NOT NULL CHECK (distance_meters >= 0),
  reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('merge', 'pending', 'keep_separate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_place_id <> right_place_id),
  UNIQUE (left_place_id, right_place_id)
);

COMMENT ON COLUMN place_dedupe_candidates.left_place_id IS
  'Référence vers un lieu DATAtourisme (source officielle)';
COMMENT ON COLUMN place_dedupe_candidates.right_place_id IS
  'Référence vers un lieu OpenStreetMap (source secondaire)';
COMMENT ON COLUMN place_dedupe_candidates.level IS
  'Niveau de déduplication : 1=exact, 2=probable, 3=ambigu';
COMMENT ON COLUMN place_dedupe_candidates.decision IS
  'Décision : merge=masquer OSM, pending=à revoir, keep_separate=garder les deux';

CREATE INDEX IF NOT EXISTS idx_place_dedupe_left ON place_dedupe_candidates(left_place_id);
CREATE INDEX IF NOT EXISTS idx_place_dedupe_right ON place_dedupe_candidates(right_place_id);
CREATE INDEX IF NOT EXISTS idx_place_dedupe_decision
  ON place_dedupe_candidates(decision) WHERE decision = 'pending';
