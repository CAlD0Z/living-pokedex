-- Rename Shield DLC game entries to use consistent 'SH -' prefix (matching 'SW -' for Sword)
UPDATE games SET name = 'SH - Isle of Armor' WHERE name = 'Shield - Isle of Armor';
UPDATE games SET name = 'SH - Crown Tundra'  WHERE name = 'Shield - Crown Tundra';

-- Remove incorrectly seeded IoA/CT locations (all 106 Galar locations were assigned to each
-- DLC game group; they must be re-seeded from the DLC-specific Bulbapedia categories).
DELETE FROM encounters
  WHERE location_id IN (SELECT id FROM game_locations WHERE game_group IN ('IoA', 'CT'));
DELETE FROM game_locations WHERE game_group IN ('IoA', 'CT');

UPDATE _meta SET value = '8' WHERE key = 'schema_version';
