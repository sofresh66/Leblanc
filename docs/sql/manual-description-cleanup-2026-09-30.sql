-- Préparé le 30 septembre 2026. EXÉCUTER UNIQUEMENT APRÈS VALIDATION UTILISATEUR.
-- Les notes existent déjà dans raw_excerpt.precision et y restent conservées.
-- Aucune migration automatique : seulement les 26 fiches manuelles publiées relues.
BEGIN;
CREATE TEMP TABLE approved_manual_descriptions (id uuid PRIMARY KEY, before_description jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO approved_manual_descriptions (id, before_description) VALUES
  ('bbfbd5cc-7e1f-4b74-bb7b-4f01e048c3a8'::uuid, '{"fr":"Adresse et horaires à confirmer."}'::jsonb),
  ('a3370487-6439-44d9-8a8d-430fd75e12af'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('36df4ff9-5eb5-4351-b1d0-3e5af576472b'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('0196d6d7-37ad-46bf-9bd2-c282a29c776a'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('559c4bbf-ec29-477d-9cdf-0bd85741da02'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('59950f0b-b365-477e-b1a6-6a98fc8edd0c'::uuid, '{"fr":"Heures précises non publiées."}'::jsonb),
  ('301b84ce-0593-4ba1-b189-751b6e37dc86'::uuid, '{"fr":"Absent de la liste Destination Brenne d’août 2026 : activité à confirmer."}'::jsonb),
  ('89d4d332-8834-4d73-a123-168bd3605373'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('e8ae55a0-080c-4e63-9559-04daedf24e96'::uuid, '{"fr":"Sandwichs annoncés dans un annuaire ; disponibilité à vérifier."}'::jsonb),
  ('e68e2467-16a2-4d40-9729-ece8c5a8943e'::uuid, '{"fr":"Horaires de l’établissement, service repas à confirmer; sources en ligne divergentes."}'::jsonb),
  ('befb4c3d-7e55-4485-a8b8-51f095899527'::uuid, '{"fr":"Le site présente deux horaires contradictoires pour lundi, samedi et dimanche ; vérifier."}'::jsonb),
  ('5bcef5c6-6abc-4038-8b8f-550fc9d5aba5'::uuid, '{"fr":"Doublon possible avec La Dublancoise à proximité ; vérifier enseigne et offre salée."}'::jsonb),
  ('9285273e-83b4-4227-af8a-3825f1173178'::uuid, '{"fr":"Horaires du bar ; service des plats à vérifier."}'::jsonb),
  ('8c23d8a2-f844-4703-9f6a-b9025fbba7ea'::uuid, '{"fr":"Adresse et horaires d’annuaire ; offre salée à confirmer."}'::jsonb),
  ('42b232a5-0eef-48c2-a734-54fd79b4fe34'::uuid, '{"fr":"Horaires d’annuaire ; vérifier le service repas."}'::jsonb),
  ('d051ca7a-fdf4-424e-a533-720413206b9f'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('5e4e05de-60e7-44a6-b44a-dc1d90bc9dfd'::uuid, '{"fr":"Horaires d’annuaire à confirmer."}'::jsonb),
  ('41a0277a-b080-4e54-b314-1c0acd3c7f62'::uuid, '{"fr":"Fiche absente de la liste Destination Brenne d’août 2026 : activité et horaires à confirmer."}'::jsonb),
  ('8c010c37-4a0a-472e-a995-0b55ebdac588'::uuid, '{"fr":"Horaires d’annuaire à confirmer auprès de l’établissement."}'::jsonb),
  ('927d7dd1-5757-4cde-b6d9-f0f92e0f55c8'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('ddf4f081-5930-42c1-9883-474983ceeb47'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('688c1442-1f85-4758-af46-b06914103fc9'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('447178ee-e8ea-40da-943f-acf884f40748'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('57019398-d3c1-4093-9369-4902e48b404f'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('ae9d59df-7f5d-406f-85cf-3f056cbd8b23'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb),
  ('196b8717-9975-4880-9121-1b5fe480c23f'::uuid, '{"fr":"Adresse recensée par Destination Brenne (août 2026) ; horaires précis non confirmés."}'::jsonb);
DO $$
DECLARE updated_count integer;
BEGIN
  UPDATE places p SET description_i18n = '{}'::jsonb
  FROM approved_manual_descriptions approved
  WHERE p.id = approved.id AND p.status = 'published'
    AND p.description_i18n = approved.before_description
    AND EXISTS (SELECT 1 FROM place_source_records sr WHERE sr.place_id=p.id
      AND sr.source='manuel' AND sr.raw_excerpt->>'precision'=approved.before_description->>'fr')
    AND NOT EXISTS (SELECT 1 FROM place_source_records sr WHERE sr.place_id=p.id AND sr.source<>'manuel');
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> 26 THEN
    RAISE EXCEPTION 'Périmètre modifié : % fiches sur 26 ; transaction annulée', updated_count;
  END IF;
END $$;
COMMIT;
