-- Lieux permanents : aucune modification des tables d'événements.
CREATE TABLE places (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('restaurant', 'bar', 'cafe', 'fast_food', 'food_truck', 'other_food')),
  subtypes TEXT[] NOT NULL DEFAULT '{}',
  title_i18n JSONB NOT NULL CHECK (jsonb_typeof(title_i18n) = 'object'),
  description_i18n JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(description_i18n) = 'object'),
  source_language TEXT NOT NULL,
  venue_name TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  image_url TEXT,
  public_url TEXT,
  cuisines TEXT[] NOT NULL DEFAULT '{}',
  price_range_min NUMERIC(10, 2) CHECK (price_range_min >= 0),
  price_range_max NUMERIC(10, 2) CHECK (price_range_max >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  -- Conserve les libellés, politiques et prestations de chaque tarif séparément.
  price_details JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(price_details) = 'array'),
  takeaway BOOLEAN,
  -- « provided » indique des règles valides, pas une couverture exhaustive.
  opening_hours_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (opening_hours_status IN ('unknown', 'partial', 'provided')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'closed')),
  normalized_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (price_range_min IS NULL OR price_range_max IS NULL OR price_range_min <= price_range_max)
);

CREATE TRIGGER trg_places_updated_at BEFORE UPDATE ON places
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE place_opening_hours (
  id UUID PRIMARY KEY,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  valid_from DATE,
  valid_through DATE,
  -- ISO : lundi = 1, dimanche = 7. Un jour absent n'est jamais inventé.
  day_of_week INT[] NOT NULL CHECK (
    cardinality(day_of_week) BETWEEN 1 AND 7
    AND day_of_week <@ ARRAY[1,2,3,4,5,6,7]
    AND array_position(day_of_week, NULL) IS NULL
  ),
  opens TIME NOT NULL CHECK (opens < TIME '24:00:00'),
  closes TIME NOT NULL CHECK (closes < TIME '24:00:00'),
  -- DATAtourisme Week0 = dernière semaine ; NULL = toutes les semaines.
  week_of_month INT CHECK (week_of_month BETWEEN 0 AND 5),
  CHECK (valid_from IS NULL OR valid_through IS NULL OR valid_from <= valid_through)
  -- Pas de contrainte closes > opens : les créneaux peuvent franchir minuit.
  -- opens = closes est conservé sans inférer « fermé » ou « ouvert 24 h ».
);

CREATE TABLE place_source_records (
  id UUID PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  place_id UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  source_url TEXT,
  source_updated_at TIMESTAMPTZ,
  raw_excerpt JSONB,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX idx_places_location ON places USING GIST (location);
CREATE INDEX idx_places_type ON places (type);
CREATE INDEX idx_places_status ON places (status);
CREATE INDEX idx_place_opening_hours_place_id ON place_opening_hours (place_id);
CREATE INDEX idx_place_source_records_place_id ON place_source_records (place_id);
