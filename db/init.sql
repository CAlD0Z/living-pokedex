-- Living Pokédex — core schema
-- Runs once on a fresh Postgres volume (mounted into docker-entrypoint-initdb.d).
-- All statements are idempotent so this file is safe to re-apply to an existing DB.
-- Feature tables (evolutions, locations, DLC dexes, …) live in db/migrations/.

CREATE TABLE IF NOT EXISTS _meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT INTO _meta (key, value) VALUES ('schema_version', '11') ON CONFLICT DO NOTHING;

-- ── National dex: one row per species AND per alternate form ──────────────────
-- id is TEXT: base species use the plain dex number ('6'); forms use 'dex_n' ('6_1').
CREATE TABLE IF NOT EXISTS pokedex (
    id              TEXT PRIMARY KEY,
    pokedex_number  INT  NOT NULL,
    name            TEXT NOT NULL,
    form_name       TEXT,
    type1           TEXT,
    type2           TEXT,
    generation      INT,
    icon_url        TEXT,
    form_tag        TEXT,                         -- Mega / Alolan / Galarian / …
    visible         BOOLEAN NOT NULL DEFAULT TRUE -- hide niche forms from the grid
);
CREATE INDEX IF NOT EXISTS pokedex_number_idx ON pokedex(pokedex_number);

-- ── Games / versions (Red, Blue, …, plus HOME national & shiny pseudo-games) ──
CREATE TABLE IF NOT EXISTS games (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    game_group  TEXT,            -- RBY, GSC, …, HOME
    generation  INT,
    region      TEXT,
    sort_order  INT NOT NULL DEFAULT 0
);

-- ── User accounts (each tracks their own collection) ─────────────────────────
-- Historically "players"; the table keeps that name so caught_status's FK is
-- unchanged. Sign-in replaces the old player picker. See db/migrations/011_auth.sql.
CREATE TABLE IF NOT EXISTS players (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT,                                  -- bcrypt; NULL for OIDC accounts
    email         TEXT,
    is_admin      BOOLEAN     NOT NULL DEFAULT FALSE,
    disabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    auth_provider TEXT        NOT NULL DEFAULT 'local',  -- 'local' | 'oidc'
    external_id   TEXT,                                  -- OIDC subject when auth_provider='oidc'
    settings      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS players_provider_external_idx
    ON players(auth_provider, external_id) WHERE external_id IS NOT NULL;

-- ── Session store (connect-pg-simple) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR     NOT NULL COLLATE "default",
    sess   JSON        NOT NULL,
    expire TIMESTAMPTZ NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);

-- ── Caught log: which player has caught which Pokémon in which game ───────────
-- The composite PK is what makes the app's `INSERT … ON CONFLICT DO NOTHING` work.
CREATE TABLE IF NOT EXISTS caught_status (
    player_id    INT  NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    game_id      INT  NOT NULL REFERENCES games(id)   ON DELETE CASCADE,
    pokemon_id   TEXT NOT NULL REFERENCES pokedex(id) ON DELETE CASCADE,
    caught_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_shiny     BOOLEAN NOT NULL DEFAULT FALSE,
    ball         TEXT,
    notes        TEXT,
    origin_game  TEXT,
    PRIMARY KEY (player_id, game_id, pokemon_id)
);
CREATE INDEX IF NOT EXISTS caught_status_player_game_idx ON caught_status(player_id, game_id);

-- ── Unified regional/DLC dex membership ──────────────────────────────────────
-- One table for every dex; dex_key is e.g. 'kanto' … 'paldea', 'isle_of_armor',
-- 'crown_tundra', 'kitakami', 'blueberry'. (Replaces the old per-region tables.)
CREATE TABLE IF NOT EXISTS dex_entries (
    dex_key         TEXT NOT NULL,
    regional_number INT  NOT NULL,
    pokemon_id      TEXT NOT NULL REFERENCES pokedex(id) ON DELETE CASCADE,
    PRIMARY KEY (dex_key, pokemon_id)
);
CREATE INDEX IF NOT EXISTS dex_entries_key_idx ON dex_entries(dex_key, regional_number);
