-- ============================================================================
-- Migration 004 : Index Spatiaux, B-Tree et Index Partiels
-- ============================================================================

-- Index spatial GiST sur la position géographique des événements (pour ST_DWithin)
CREATE INDEX IF NOT EXISTS idx_events_location ON events USING GIST (location);

-- Index B-Tree sur les critères de filtrage fréquents des événements
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events (category);

-- Index B-Tree sur les occurrences d'événements pour le tri chronologique et la pagination
CREATE INDEX IF NOT EXISTS idx_event_occurrences_starts_at_id ON event_occurrences (starts_at, id);
CREATE INDEX IF NOT EXISTS idx_event_occurrences_event_id_starts_at_id ON event_occurrences (event_id, starts_at, id);

-- Index partiel optimisé pour la recherche des événements programmés uniquement
CREATE INDEX IF NOT EXISTS idx_event_occurrences_scheduled ON event_occurrences (starts_at, id) WHERE status = 'scheduled';

-- Index de jointure rapide entre enregistrements sources et événements
CREATE INDEX IF NOT EXISTS idx_source_records_event_id ON source_records (event_id);

-- Index d'analyse et monitoring sur les exécutions d'ingestion par source et date décroissante
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_started ON ingestion_runs (source, started_at DESC);
