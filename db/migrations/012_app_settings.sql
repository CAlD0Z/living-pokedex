-- 012: runtime-editable application settings (key/value JSONB).
-- Currently holds the `auth` blob — local sign-in toggle + OIDC connection
-- settings — so an admin can manage them from the Admin panel instead of
-- editing environment variables and restarting. Environment variables still
-- provide the initial defaults (see web/auth/config.js).
--
-- The app also creates this table on boot (CREATE TABLE IF NOT EXISTS in
-- config.load), so running this migration is optional but keeps the schema
-- documented alongside the others. Idempotent and additive.

CREATE TABLE IF NOT EXISTS app_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB       NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
