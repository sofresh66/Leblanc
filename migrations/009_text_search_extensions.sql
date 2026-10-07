-- Comparaison de noms sans accents ni casse : rapport de doublons des lieux et
-- future recherche texte. Utilisées dans les requêtes uniquement : aucun index,
-- la volumétrie (quelques centaines de lignes) ne le justifie pas et unaccent()
-- n'est pas IMMUTABLE.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Retour arrière (manuel, après vérification qu'aucune requête ne les utilise) :
--   DROP EXTENSION IF EXISTS unaccent;
--   DROP EXTENSION IF EXISTS pg_trgm;
--   DELETE FROM schema_migrations WHERE version = '009_text_search_extensions.sql';
