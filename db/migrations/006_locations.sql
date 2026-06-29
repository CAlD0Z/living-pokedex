-- Location reference: one row per named area per game group
CREATE TABLE IF NOT EXISTS game_locations (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    game_group      TEXT NOT NULL,
    bulbapedia_slug TEXT NOT NULL,
    sort_order      INT  NOT NULL DEFAULT 0,
    UNIQUE (name, game_group)
);

-- Encounter fact table: one row per pokemon/location/game/method/conditions combo
CREATE TABLE IF NOT EXISTS encounters (
    id               SERIAL PRIMARY KEY,
    location_id      INTEGER  NOT NULL REFERENCES game_locations(id) ON DELETE CASCADE,
    pokemon_id       TEXT     NOT NULL REFERENCES pokedex(id),
    game_id          INTEGER  NOT NULL REFERENCES games(id),
    encounter_method TEXT     NOT NULL,
    min_level        SMALLINT,
    max_level        SMALLINT,
    encounter_rate   SMALLINT,
    conditions       JSONB    NOT NULL DEFAULT '{}',
    UNIQUE (location_id, pokemon_id, game_id, encounter_method, conditions)
);

CREATE INDEX IF NOT EXISTS enc_pokemon_idx  ON encounters(pokemon_id);
CREATE INDEX IF NOT EXISTS enc_location_idx ON encounters(location_id);
CREATE INDEX IF NOT EXISTS enc_game_idx     ON encounters(game_id);

UPDATE _meta SET value = '6' WHERE key = 'schema_version';
