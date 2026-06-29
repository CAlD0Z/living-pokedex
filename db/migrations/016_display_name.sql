-- Add display_name column to players.
-- Defaults to empty string; backfilled from username for existing rows.
ALTER TABLE players ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
UPDATE players SET display_name = username WHERE display_name = '';
