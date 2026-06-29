-- 009: collection-log fields, base stats/bio, and a unified dex_entries table.
-- Fully idempotent and additive — safe to run on the existing populated database.

-- ── caught_status: turn the checkbox into a collection log ───────────────────
ALTER TABLE caught_status ADD COLUMN IF NOT EXISTS caught_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE caught_status ADD COLUMN IF NOT EXISTS is_shiny    BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE caught_status ADD COLUMN IF NOT EXISTS ball        TEXT;
ALTER TABLE caught_status ADD COLUMN IF NOT EXISTS notes       TEXT;
ALTER TABLE caught_status ADD COLUMN IF NOT EXISTS origin_game TEXT;

-- Guarantee the uniqueness the app's ON CONFLICT relies on (no-op if a PK/uniq
-- already covers these columns).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'caught_status' AND c.contype IN ('p','u')
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'caught_status'
      AND indexdef ILIKE '%UNIQUE%'
  ) THEN
    CREATE UNIQUE INDEX caught_status_uniq ON caught_status(player_id, game_id, pokemon_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS caught_status_player_game_idx ON caught_status(player_id, game_id);

-- ── pokedex: base stats + bio (powers the stat-bar section in the detail panel)
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS hp         INT;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS attack     INT;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS defense    INT;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS sp_attack  INT;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS sp_defense INT;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS speed      INT;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS height_m   NUMERIC(5,1);
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS weight_kg  NUMERIC(6,1);
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS abilities  TEXT[];
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS genus      TEXT;

-- ── Unified dex_entries: replaces the 10 region + 4 DLC near-identical tables ─
-- dex_key examples: 'kanto', 'paldea', 'isle_of_armor', 'crown_tundra', …
CREATE TABLE IF NOT EXISTS dex_entries (
    dex_key         TEXT NOT NULL,
    regional_number INT  NOT NULL,
    pokemon_id      TEXT NOT NULL REFERENCES pokedex(id) ON DELETE CASCADE,
    PRIMARY KEY (dex_key, pokemon_id)
);
CREATE INDEX IF NOT EXISTS dex_entries_key_idx ON dex_entries(dex_key, regional_number);

-- Backfill from whatever *_dex tables currently exist (idempotent).
DO $$
DECLARE r RECORD; k TEXT;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE '%\_dex' ESCAPE '\'
  LOOP
    k := left(r.tablename, length(r.tablename) - 4);  -- strip trailing '_dex'
    EXECUTE format(
      'INSERT INTO dex_entries (dex_key, regional_number, pokemon_id)
         SELECT %L, regional_number, pokemon_id FROM %I
       ON CONFLICT (dex_key, pokemon_id)
         DO UPDATE SET regional_number = EXCLUDED.regional_number',
      k, r.tablename);
  END LOOP;
END $$;
