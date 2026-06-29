-- Migration 013: scraper hint tags on game_locations
--
-- has_wild_data    – set by seed-game-locations.js after fetching each page:
--                   TRUE  = page has a "Pokémon" encounter section
--                   FALSE = page confirmed has no encounter section (skip HTTP fetch next run)
--                   NULL  = not yet scanned
--
-- has_static_data  – set by seed-game-locations.js after fetching each page:
--                   TRUE  = page has a "Special encounters" section
--                   FALSE = page confirmed has no special-encounter section
--                   NULL  = not yet scanned
--
-- seed-encounters.js skips locations where has_wild_data = FALSE.
-- seed-static-encounters.js can focus on has_static_data = TRUE locations
-- (it also accepts hardcoded NEW_LOCATIONS, so it sets the flag itself for those).

ALTER TABLE game_locations
  ADD COLUMN IF NOT EXISTS has_wild_data   BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_static_data BOOLEAN DEFAULT NULL;

CREATE INDEX IF NOT EXISTS gl_wild_idx   ON game_locations(game_group, has_wild_data);
CREATE INDEX IF NOT EXISTS gl_static_idx ON game_locations(game_group, has_static_data);
