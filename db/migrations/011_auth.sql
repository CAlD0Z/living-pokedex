-- 011: turn `players` into authenticated user accounts + a session store.
-- Each account owns exactly one collection (caught_status.player_id == the user id),
-- so the old "pick a player" dropdown is replaced by signing in.
-- Idempotent and additive — safe to run on the existing populated database.

-- ── players → user accounts ──────────────────────────────────────────────────
-- username already exists (UNIQUE) and is the login identifier.
ALTER TABLE players ADD COLUMN IF NOT EXISTS password_hash TEXT;            -- bcrypt; NULL for external (OIDC) accounts
ALTER TABLE players ADD COLUMN IF NOT EXISTS email         TEXT;
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_admin      BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS disabled      BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE players ADD COLUMN IF NOT EXISTS auth_provider TEXT        NOT NULL DEFAULT 'local';  -- 'local' | 'oidc'
ALTER TABLE players ADD COLUMN IF NOT EXISTS external_id   TEXT;           -- OIDC subject (sub) when auth_provider='oidc'
ALTER TABLE players ADD COLUMN IF NOT EXISTS settings      JSONB       NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE players ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- One external identity maps to one account.
CREATE UNIQUE INDEX IF NOT EXISTS players_provider_external_idx
  ON players(auth_provider, external_id) WHERE external_id IS NOT NULL;

-- Drop the legacy passwordless seed player (had no caught records).
DELETE FROM players WHERE username = 'Ash' AND password_hash IS NULL;

-- Older databases created caught_status' player FK as NO ACTION, which blocks
-- deleting an account that has caught records. Recreate it ON DELETE CASCADE so
-- the admin "delete account" action also removes that user's collection.
ALTER TABLE caught_status DROP CONSTRAINT IF EXISTS caught_status_player_id_fkey;
ALTER TABLE caught_status
  ADD CONSTRAINT caught_status_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

-- ── session store (connect-pg-simple's expected shape) ───────────────────────
CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR     NOT NULL COLLATE "default",
    sess   JSON        NOT NULL,
    expire TIMESTAMPTZ NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire);

UPDATE _meta SET value = '11' WHERE key = 'schema_version';
