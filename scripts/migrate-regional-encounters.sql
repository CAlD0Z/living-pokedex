-- Migrate encounters from base form IDs to regional form IDs.
-- In games where only the regional form appears in the wild, encounters were
-- incorrectly seeded under the base form pokemon_id. This migration moves them
-- to the correct regional form IDs.
--
-- Mapping:
--   Alolan forms  → SM, USUM
--   Galarian forms → SwSh
--   Hisuian forms  → PLA
--   Paldean forms  → SV, BB

BEGIN;

-- Alolan forms (SM / USUM)
UPDATE encounters e
SET pokemon_id = pf.id
FROM games g, pokedex pb, pokedex pf
WHERE e.game_id = g.id
  AND e.pokemon_id = pb.id
  AND pb.form_name IS NULL
  AND g.game_group IN ('SM', 'USUM')
  AND pf.name = pb.name
  AND pf.form_name ILIKE 'Alolan%';

-- Galarian forms (SwSh)
UPDATE encounters e
SET pokemon_id = pf.id
FROM games g, pokedex pb, pokedex pf
WHERE e.game_id = g.id
  AND e.pokemon_id = pb.id
  AND pb.form_name IS NULL
  AND g.game_group = 'SwSh'
  AND pf.name = pb.name
  AND pf.form_name ILIKE 'Galarian%';

-- Hisuian forms (PLA)
UPDATE encounters e
SET pokemon_id = pf.id
FROM games g, pokedex pb, pokedex pf
WHERE e.game_id = g.id
  AND e.pokemon_id = pb.id
  AND pb.form_name IS NULL
  AND g.game_group = 'PLA'
  AND pf.name = pb.name
  AND pf.form_name ILIKE 'Hisuian%';

-- Paldean forms (SV / BB)
UPDATE encounters e
SET pokemon_id = pf.id
FROM games g, pokedex pb, pokedex pf
WHERE e.game_id = g.id
  AND e.pokemon_id = pb.id
  AND pb.form_name IS NULL
  AND g.game_group IN ('SV', 'BB')
  AND pf.name = pb.name
  AND pf.form_name ILIKE 'Paldean%';

COMMIT;
