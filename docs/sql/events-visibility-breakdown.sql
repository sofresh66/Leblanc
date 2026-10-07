-- Lecture seule : pourquoi un événement en base n'apparaît pas dans /v1/events.
-- Chaque événement reçoit le premier motif d'exclusion rencontré, dans l'ordre
-- des conditions de la liste (worker/src/db/events.ts). Paramètre : maintenant.
-- Usage : psql "$DATABASE_URL_DIRECT" -v now="'2026-10-10T08:00:00Z'" -f docs/sql/events-visibility-breakdown.sql
BEGIN TRANSACTION READ ONLY;

WITH params AS (
  SELECT :now::timestamptz AS now,
    ST_SetSRID(ST_MakePoint(1.0833, 46.6333), 4326)::geography AS centre
),
classified AS (
  SELECT e.id,
    CASE
      WHEN e.status <> 'published' THEN 'statut ' || e.status
      WHEN NOT ST_DWithin(e.location, p.centre, 20000) THEN 'hors rayon 20 km'
      WHEN NOT EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled')
        THEN 'aucune occurrence programmée (toutes annulées)'
      WHEN NOT EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled'
        AND COALESCE(o.ends_at, o.starts_at) >= p.now) THEN 'terminé (toutes les occurrences passées)'
      WHEN NOT EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled'
        AND COALESCE(o.ends_at, o.starts_at) >= p.now AND o.starts_at <= p.now + interval '90 days')
        THEN 'au-delà de 90 jours'
      ELSE 'visible'
    END AS motif,
    -- Ancienne règle (début seulement) : en cours mais masqué avant la correction du lot 5.
    EXISTS (SELECT 1 FROM event_occurrences o WHERE o.event_id = e.id AND o.status = 'scheduled'
      AND o.starts_at < p.now AND COALESCE(o.ends_at, o.starts_at) >= p.now) AS en_cours
  FROM events e CROSS JOIN params p
)
SELECT motif, count(*) AS evenements, count(*) FILTER (WHERE en_cours) AS dont_en_cours
FROM classified
GROUP BY motif
ORDER BY evenements DESC;

ROLLBACK;
