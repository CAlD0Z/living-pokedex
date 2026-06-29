-- Fix regional form mismatches in DLC dex entries.
-- The seed scripts resolve Pokémon names to base-form IDs, so species whose
-- DLC-native form is a Galarian/Alolan/Hisuian/Paldean variant were inserted
-- with the wrong pokemon_id.  This migration corrects those entries.

-- ── Isle of Armor ─────────────────────────────────────────────────────────────
-- Only Galarian Slowpoke (#79_1) appears wild in IoA; base form does not.
UPDATE dex_entries SET pokemon_id = '79_1'  WHERE dex_key = 'isle_of_armor' AND pokemon_id = '79';
-- Only Alolan Marowak (#105_1) appears wild in IoA; base form does not.
UPDATE dex_entries SET pokemon_id = '105_1' WHERE dex_key = 'isle_of_armor' AND pokemon_id = '105';
-- Only Alolan Exeggutor (#103_1) appears wild in IoA; base form does not.
UPDATE dex_entries SET pokemon_id = '103_1' WHERE dex_key = 'isle_of_armor' AND pokemon_id = '103';

-- ── Crown Tundra ──────────────────────────────────────────────────────────────
-- Crown Tundra is in Galar; the Galar-native forms should be listed.
UPDATE dex_entries SET pokemon_id = '263_1' WHERE dex_key = 'crown_tundra' AND pokemon_id = '263';
UPDATE dex_entries SET pokemon_id = '264_1' WHERE dex_key = 'crown_tundra' AND pokemon_id = '264';
-- Galarian Darumaka (#554_1) appears wild in CT; base form does not.
UPDATE dex_entries SET pokemon_id = '554_1' WHERE dex_key = 'crown_tundra' AND pokemon_id = '554';
-- Darmanitan Zen Mode is base-game; CT slot should be Galarian Standard Mode.
UPDATE dex_entries SET pokemon_id = '555_2' WHERE dex_key = 'crown_tundra' AND pokemon_id = '555_1';
-- Galarian Ponyta (#77_1) appears wild in CT; base form does not.
UPDATE dex_entries SET pokemon_id = '77_1'  WHERE dex_key = 'crown_tundra' AND pokemon_id = '77';
-- Galarian Rapidash is the evolution of Galarian Ponyta.
UPDATE dex_entries SET pokemon_id = '78_1'  WHERE dex_key = 'crown_tundra' AND pokemon_id = '78';

-- ── Blueberry (Indigo Disk) ───────────────────────────────────────────────────
-- All of these species only appear as their regional variant in the BB dex.
UPDATE dex_entries SET pokemon_id = '51_1'  WHERE dex_key = 'blueberry' AND pokemon_id = '51';
UPDATE dex_entries SET pokemon_id = '88_1'  WHERE dex_key = 'blueberry' AND pokemon_id = '88';
UPDATE dex_entries SET pokemon_id = '89_1'  WHERE dex_key = 'blueberry' AND pokemon_id = '89';
UPDATE dex_entries SET pokemon_id = '79_1'  WHERE dex_key = 'blueberry' AND pokemon_id = '79';
UPDATE dex_entries SET pokemon_id = '74_1'  WHERE dex_key = 'blueberry' AND pokemon_id = '74';
UPDATE dex_entries SET pokemon_id = '75_1'  WHERE dex_key = 'blueberry' AND pokemon_id = '75';
