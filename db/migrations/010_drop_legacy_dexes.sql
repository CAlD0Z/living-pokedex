-- 010: drop the legacy per-region/DLC dex tables.
-- The app now reads the unified `dex_entries` table (created/backfilled in 009),
-- so these are redundant. Idempotent. Data is preserved in dex_entries.
DROP TABLE IF EXISTS
  kanto_dex, johto_dex, hoenn_dex, sinnoh_dex, unova_dex,
  kalos_dex, alola_dex, galar_dex, hisui_dex, paldea_dex,
  isle_of_armor_dex, crown_tundra_dex, kitakami_dex, blueberry_dex;

UPDATE _meta SET value = '10' WHERE key = 'schema_version';
