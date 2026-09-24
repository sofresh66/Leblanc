-- ============================================================================
-- Migration 001 : Extensions PostgreSQL
-- ============================================================================

-- pgcrypto fournit gen_random_uuid() et des fonctions cryptographiques
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- postgis fournit les types géographiques (geography) et fonctions spatiales (ST_DWithin, ST_MakePoint)
CREATE EXTENSION IF NOT EXISTS "postgis";
