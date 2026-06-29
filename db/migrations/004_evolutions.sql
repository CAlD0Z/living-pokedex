-- Evolution chains, conditions, and game availability

CREATE TABLE IF NOT EXISTS evolutions (
    id              SERIAL PRIMARY KEY,
    from_pokemon_id TEXT NOT NULL REFERENCES pokedex(id),
    to_pokemon_id   TEXT NOT NULL REFERENCES pokedex(id),
    method          TEXT NOT NULL,
    notes           TEXT,
    UNIQUE (from_pokemon_id, to_pokemon_id)
);

CREATE TABLE IF NOT EXISTS evolution_conditions (
    id              SERIAL PRIMARY KEY,
    evolution_id    INTEGER NOT NULL REFERENCES evolutions(id) ON DELETE CASCADE,
    condition_type  TEXT NOT NULL,
    condition_value TEXT
);

CREATE TABLE IF NOT EXISTS evolution_game_availability (
    evolution_id    INTEGER NOT NULL REFERENCES evolutions(id) ON DELETE CASCADE,
    game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    PRIMARY KEY (evolution_id, game_id)
);

UPDATE _meta SET value = '4' WHERE key = 'schema_version';
