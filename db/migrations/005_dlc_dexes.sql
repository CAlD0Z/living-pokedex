-- DLC dex tables and game entries for Sword/Shield and Scarlet/Violet expansions

-- Add sort_order so DLC games can be interleaved between their base games
ALTER TABLE games ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Set sort_order for Sword/Shield base games to allow DLC interleaving
UPDATE games SET sort_order = 100 WHERE name = 'Sword';
UPDATE games SET sort_order = 400 WHERE name = 'Shield';

-- Set sort_order for Scarlet/Violet base games to allow DLC interleaving
UPDATE games SET sort_order = 100 WHERE name = 'Scarlet';
UPDATE games SET sort_order = 400 WHERE name = 'Violet';

-- DLC dex tables (same schema as regional dex tables)
CREATE TABLE IF NOT EXISTS isle_of_armor_dex (
    regional_number INT  NOT NULL,
    pokemon_id      TEXT NOT NULL REFERENCES pokedex(id)
);

CREATE TABLE IF NOT EXISTS crown_tundra_dex (
    regional_number INT  NOT NULL,
    pokemon_id      TEXT NOT NULL REFERENCES pokedex(id)
);

CREATE TABLE IF NOT EXISTS kitakami_dex (
    regional_number INT  NOT NULL,
    pokemon_id      TEXT NOT NULL REFERENCES pokedex(id)
);

CREATE TABLE IF NOT EXISTS blueberry_dex (
    regional_number INT  NOT NULL,
    pokemon_id      TEXT NOT NULL REFERENCES pokedex(id)
);

-- DLC game entries (IoA and CT nested under SwSh display group; Kita and BB under SV)
INSERT INTO games (name, game_group, generation, sort_order) VALUES
    ('SW - Isle of Armor',    'IoA',  8, 200),
    ('SW - Crown Tundra',     'CT',   8, 300),
    ('SH - Isle of Armor',    'IoA',  8, 500),
    ('SH - Crown Tundra',     'CT',   8, 600),
    ('S - Kitakami',          'Kita', 9, 200),
    ('S - Blueberry',         'BB',   9, 300),
    ('V - Kitakami',          'Kita', 9, 500),
    ('V - Blueberry',         'BB',   9, 600)
ON CONFLICT (name) DO NOTHING;

UPDATE _meta SET value = '5' WHERE key = 'schema_version';
