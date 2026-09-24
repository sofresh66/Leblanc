-- ============================================================================
-- Migration 002 : Tables Cœur (schema_migrations, events, event_occurrences)
-- ============================================================================

-- Table de suivi des migrations versionnées
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fonction de mise à jour automatique de la colonne updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table principale des événements
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('culture', 'sport', 'fete', 'association', 'autre')),
  title_i18n JSONB NOT NULL CHECK (jsonb_typeof(title_i18n) = 'object'),
  description_i18n JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(description_i18n) = 'object'),
  source_language TEXT NOT NULL,
  venue_name TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  public_url TEXT,
  image_url TEXT,
  is_free BOOLEAN NOT NULL,
  price_min NUMERIC(10, 2) CHECK (price_min IS NULL OR price_min >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'cancelled', 'hidden')),
  normalized_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger de mise à jour automatique de updated_at sur events
DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Table des occurrences temporelles d'événements
CREATE TABLE IF NOT EXISTS event_occurrences (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  source_fingerprint TEXT NOT NULL,
  CONSTRAINT uq_event_occurrence_fingerprint UNIQUE (event_id, source_fingerprint),
  CONSTRAINT chk_event_occurrence_dates CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
