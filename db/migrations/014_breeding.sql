-- Breeding info: mark baby pokemon and their required held item
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS is_baby   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pokedex ADD COLUMN IF NOT EXISTS breed_item TEXT;

UPDATE _meta SET value = '14' WHERE key = 'schema_version';
