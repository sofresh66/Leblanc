-- Décisions de déduplication des lieux validées par le propriétaire (lot 3, octobre 2026).
-- Cible : branche Neon audit-fixes-2026-10 uniquement. Aucune suppression :
-- les fiches retirées passent en status='hidden' et la décision est consignée.
-- Convention : left_place_id = fiche conservée, right_place_id = fiche masquée
-- (merge) ; pour keep_separate, paire telle que listée par le rapport.
-- Retour arrière : voir le bloc commenté en fin de fichier.

BEGIN;

CREATE TEMP TABLE dedupe_decision (
  left_place_id uuid NOT NULL,
  right_place_id uuid NOT NULL,
  decision text NOT NULL,
  note text NOT NULL
) ON COMMIT DROP;

INSERT INTO dedupe_decision VALUES
  -- Fusions : garder la première fiche, masquer la seconde.
  ('e2b3fa44-8667-479d-a4a6-fce4142cc825', '27e1e4bb-33a9-400c-b3eb-98a46dce9c35', 'merge', 'Auberge de La Gabrière ×2 (DATAtourisme), Lingé'),
  ('ddf4f081-5930-42c1-9883-474983ceeb47', '20a92d77-26dd-4b90-91c0-c3ef7412afdd', 'merge', 'Le Gab : fiche manuelle gardée, fiche DATAtourisme mal positionnée masquée'),
  ('ae6347db-af7c-4e57-93f7-74a72a88154b', '5d4ab5f3-2b1b-4ed8-b648-39dd2cee1a65', 'merge', 'Restaurant La Pierre Levée gardé, Manoir de Pierre Levée masqué'),
  -- Paires distinctes : ne plus les proposer.
  ('e2b3fa44-8667-479d-a4a6-fce4142cc825', 'ddf4f081-5930-42c1-9883-474983ceeb47', 'keep_separate', 'Auberge de La Gabrière / Le Gab'),
  ('8a26fc6e-fa6b-41e9-820d-0a655286bce6', 'd234512a-b186-45d6-83e1-0b6a34a61bfb', 'keep_separate', 'L''Ascenseur / Café de l''Abbaye'),
  ('0ddc5637-a0f0-415c-8810-e54833ae6343', '943c2097-8835-4ded-8070-ceb1de5b394b', 'keep_separate', 'Le Cardinal / Chez Raph'),
  ('34ce3c5f-1af9-40ac-9f6f-0ed29d106df0', '9285273e-83b4-4227-af8a-3825f1173178', 'keep_separate', 'Pizza Bella / La Chaumière'),
  ('38bc5da7-62cd-4549-874d-d3e9e4721379', 'e8ae55a0-080c-4e63-9559-04daedf24e96', 'keep_separate', 'Au Délice / Boulangerie Leroux'),
  ('bb96e4e3-4928-4cfc-ba9b-d0075051e6ec', 'd234512a-b186-45d6-83e1-0b6a34a61bfb', 'keep_separate', 'Le Cérasus / Café de l''Abbaye'),
  ('8a26fc6e-fa6b-41e9-820d-0a655286bce6', 'bb96e4e3-4928-4cfc-ba9b-d0075051e6ec', 'keep_separate', 'L''Ascenseur / Le Cérasus'),
  ('38bc5da7-62cd-4549-874d-d3e9e4721379', 'd051ca7a-fdf4-424e-a533-720413206b9f', 'keep_separate', 'Au Délice / Le Prety'),
  ('5de85100-00b8-45d6-aad8-a26dc832e7ab', 'bf626005-e0ab-41c4-8947-6ae0a3a7c14d', 'keep_separate', 'Le Saint-Savin / Fa Si La Manger'),
  ('befb4c3d-7e55-4485-a8b8-51f095899527', 'e68e2467-16a2-4d40-9729-ece8c5a8943e', 'keep_separate', 'Café du Théâtre / Café du Centre'),
  ('41a0277a-b080-4e54-b314-1c0acd3c7f62', '927d7dd1-5757-4cde-b6d9-f0f92e0f55c8', 'keep_separate', 'Perle d''Asie / Viet Thaï'),
  ('927d7dd1-5757-4cde-b6d9-f0f92e0f55c8', 'd051ca7a-fdf4-424e-a533-720413206b9f', 'keep_separate', 'Viet Thaï / Le Prety'),
  ('41a0277a-b080-4e54-b314-1c0acd3c7f62', 'd051ca7a-fdf4-424e-a533-720413206b9f', 'keep_separate', 'Perle d''Asie / Le Prety');

-- Garde : tous les identifiants existent, et chaque fiche à masquer est publiée.
DO $$
DECLARE missing int; not_published int;
BEGIN
  SELECT count(*) INTO missing FROM (
    SELECT left_place_id AS id FROM dedupe_decision UNION SELECT right_place_id FROM dedupe_decision
  ) ids WHERE NOT EXISTS (SELECT 1 FROM places p WHERE p.id = ids.id);
  SELECT count(*) INTO not_published FROM dedupe_decision d JOIN places p ON p.id = d.right_place_id
    WHERE d.decision = 'merge' AND p.status <> 'published';
  IF missing > 0 OR not_published > 0 THEN
    RAISE EXCEPTION 'Décisions incohérentes : % identifiant(s) absent(s), % fiche(s) à masquer non publiée(s)',
      missing, not_published;
  END IF;
END $$;

-- 1. Masquer les fiches fusionnées (3 lignes attendues).
UPDATE places p SET status = 'hidden'
FROM dedupe_decision d
WHERE d.decision = 'merge' AND p.id = d.right_place_id AND p.status = 'published';

-- 2. Consigner les 16 décisions ; une décision existante est remplacée.
INSERT INTO place_dedupe_candidates
  (left_place_id, right_place_id, score, level, distance_meters, reason, decision)
SELECT d.left_place_id, d.right_place_id,
  round(similarity(unaccent(lower(l.title_i18n->>'fr')), unaccent(lower(r.title_i18n->>'fr')))::numeric, 3),
  2,
  round(ST_Distance(l.location, r.location)::numeric, 1),
  jsonb_build_object('review', 'audit-2026-10', 'decidedBy', 'owner', 'note', d.note),
  d.decision
FROM dedupe_decision d
JOIN places l ON l.id = d.left_place_id
JOIN places r ON r.id = d.right_place_id
ON CONFLICT (left_place_id, right_place_id) DO UPDATE SET
  score = EXCLUDED.score, level = EXCLUDED.level, distance_meters = EXCLUDED.distance_meters,
  reason = EXCLUDED.reason, decision = EXCLUDED.decision;

-- Contrôle avant validation.
SELECT d.decision, count(*) AS pairs,
  count(*) FILTER (WHERE r.status = 'hidden') AS right_hidden
FROM dedupe_decision d JOIN places r ON r.id = d.right_place_id
GROUP BY d.decision ORDER BY d.decision;

COMMIT;

-- Retour arrière (même branche) :
-- BEGIN;
-- UPDATE places SET status = 'published' WHERE id IN (
--   '27e1e4bb-33a9-400c-b3eb-98a46dce9c35', '20a92d77-26dd-4b90-91c0-c3ef7412afdd',
--   '5d4ab5f3-2b1b-4ed8-b648-39dd2cee1a65');
-- DELETE FROM place_dedupe_candidates WHERE reason->>'review' = 'audit-2026-10';
-- COMMIT;
