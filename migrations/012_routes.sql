-- Parcours « Se balader » (randonnée, vélo, VTT, équitation) : nouvelles tables
-- uniquement, aucune table existante n'est modifiée.
-- Fiche : DATAtourisme (/v1/tour). Tracé : OpenStreetMap (ODbL), seulement quand
-- la correspondance avec une relation OSM est sûre ; sinon track est NULL et la
-- carte n'affiche que le départ.
CREATE TABLE routes (
  id UUID PRIMARY KEY,
  title_i18n JSONB NOT NULL CHECK (jsonb_typeof(title_i18n) = 'object'),
  description_i18n JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(description_i18n) = 'object'),
  source_language TEXT NOT NULL,
  -- Même forme que events.translation_status (migration 010).
  translation_status JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(translation_status) = 'object'),
  modes TEXT[] NOT NULL CHECK (
    cardinality(modes) >= 1
    AND modes <@ ARRAY['foot', 'bike', 'mtb', 'horse']
    AND array_position(modes, NULL) IS NULL
  ),
  -- NULL : la source ne dit pas si le parcours est une boucle.
  is_loop BOOLEAN,
  distance_m INT CHECK (distance_m > 0),
  duration_min INT CHECK (duration_min > 0),
  -- Itinérances : durée annoncée en jours (DATAtourisme durationDays), sans minutes.
  duration_days NUMERIC(4, 1) CHECK (duration_days > 0 AND duration_days <= 60),
  elevation_gain_m INT CHECK (elevation_gain_m >= 0),
  -- Réservé : aucune source ne fournit de difficulté à ce jour.
  difficulty TEXT,
  start_latitude DOUBLE PRECISION NOT NULL CHECK (start_latitude BETWEEN -90 AND 90),
  start_longitude DOUBLE PRECISION NOT NULL CHECK (start_longitude BETWEEN -180 AND 180),
  start_location GEOGRAPHY(Point, 4326) NOT NULL,
  start_city TEXT,
  start_postal_code TEXT,
  -- Distance du départ au centre du Blanc, calculée à l'ingestion : clé de tri.
  distance_le_blanc_m INT NOT NULL CHECK (distance_le_blanc_m >= 0),
  -- MultiLineString : une relation OSM n'est pas toujours continue.
  track GEOGRAPHY(MultiLineString, 4326),
  -- Version allégée (environ 15 m) servie à la carte.
  track_simplified GEOMETRY(MultiLineString, 4326),
  track_source TEXT CHECK (track_source IN ('osm')),
  track_osm_relation_id BIGINT CHECK (track_osm_relation_id > 0),
  official_url TEXT,
  image_url TEXT,
  image_credit TEXT,
  image_license TEXT,
  producer TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  normalized_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un tracé a toujours sa source et sa version allégée, et inversement.
  CHECK ((track IS NULL) = (track_source IS NULL)),
  CHECK ((track IS NULL) = (track_simplified IS NULL)),
  CHECK ((track_source IS NOT DISTINCT FROM 'osm') = (track_osm_relation_id IS NOT NULL))
);

CREATE TRIGGER trg_routes_updated_at BEFORE UPDATE ON routes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE route_source_records (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('datatourisme', 'osm')),
  external_id TEXT NOT NULL,
  route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  source_url TEXT,
  source_updated_at TIMESTAMPTZ,
  raw_excerpt JSONB,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX idx_routes_start_location ON routes USING GIST (start_location);
CREATE INDEX idx_routes_track ON routes USING GIST (track);
CREATE INDEX idx_routes_status ON routes (status);
CREATE INDEX idx_routes_modes ON routes USING GIN (modes);
-- Ordre de la liste et du curseur : avec tracé d'abord, puis distance au Blanc, puis id.
CREATE INDEX idx_routes_list_order ON routes ((track IS NOT NULL) DESC, distance_le_blanc_m, id)
  WHERE status = 'published';
CREATE INDEX idx_route_source_records_route_id ON route_source_records (route_id);
-- Pas d'index trigramme sur normalized_title : quelques centaines de lignes (voir 009).

-- Retour arrière (manuel) : après avoir redéployé un Worker qui ne lit plus ces tables.
--   DROP TABLE IF EXISTS route_source_records;
--   DROP TABLE IF EXISTS routes;
--   DELETE FROM schema_migrations WHERE version = '012_routes.sql';
