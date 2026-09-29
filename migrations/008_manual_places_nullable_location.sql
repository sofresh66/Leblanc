-- Une adresse manuelle non géocodée reste traçable sans inventer de position.
ALTER TABLE places ALTER COLUMN latitude DROP NOT NULL;
ALTER TABLE places ALTER COLUMN longitude DROP NOT NULL;
ALTER TABLE places ALTER COLUMN location DROP NOT NULL;
ALTER TABLE places ADD CONSTRAINT places_coordinates_together CHECK (
  (latitude IS NULL AND longitude IS NULL AND location IS NULL)
  OR (latitude IS NOT NULL AND longitude IS NOT NULL AND location IS NOT NULL)
);

-- Une correspondance exacte de nom et commune peut être consignée sans distance.
ALTER TABLE place_dedupe_candidates ALTER COLUMN distance_meters DROP NOT NULL;
