-- ============================================================================
-- Migration 003 : Tables d'Ingestion, Synchronisation et Déduplication
-- ============================================================================

-- Politique de suppression :
-- Les ON DELETE CASCADE sur events → event_occurrences et 
-- events → source_records sont prévus pour les suppressions VOLONTAIRES 
-- (nettoyage administratif, RGPD).
-- Dans les flux d'ingestion ordinaires (Lots 6-7), NE PAS supprimer 
-- physiquement un événement. Utiliser status = 'hidden' ou 'cancelled' 
-- pour préserver l'historique, les références et permettre la déduplication.

-- Table de liaison entre les événements et leurs sources d'origine
CREATE TABLE IF NOT EXISTS source_records (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  source_url TEXT,
  source_updated_at TIMESTAMPTZ,
  raw_excerpt JSONB,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_source_external_id UNIQUE (source, external_id)
);

-- Table de configuration des agendas sources
CREATE TABLE IF NOT EXISTS source_agendas (
  agenda_uid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table d'état de synchronisation par source
CREATE TABLE IF NOT EXISTS sync_state (
  source TEXT PRIMARY KEY,
  cursor TEXT,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  lease_until TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  last_error_code TEXT
);

-- Table d'historique des exécutions d'ingestion
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  merged_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

-- Table des paires d'événements candidates à la déduplication
CREATE TABLE IF NOT EXISTS dedupe_candidates (
  id UUID PRIMARY KEY,
  left_event_id UUID NOT NULL REFERENCES events(id),
  right_event_id UUID NOT NULL REFERENCES events(id),
  score NUMERIC(4, 3) NOT NULL CHECK (score BETWEEN 0 AND 1),
  reason JSONB,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'merge', 'keep_separate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_dedupe_order CHECK (left_event_id < right_event_id),
  CONSTRAINT uq_dedupe_pair UNIQUE (left_event_id, right_event_id)
);
