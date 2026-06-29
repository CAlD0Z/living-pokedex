// Auth configuration.
//
// Environment variables provide the *defaults*; an admin can override the
// sign-in toggles and OIDC settings at runtime from the Admin panel, which are
// persisted in the `app_settings` table and re-applied on boot. The exported
// `config` object is a singleton mutated in place, so every module that did
// `require('./config')` sees runtime changes without a restart.
//
//   AUTH_ENABLED         master switch. false → no login wall; every request runs
//                        as the default account (single-user / home-lab mode).
//                        Env-only (not editable from the panel by design).
//   AUTH_LOCAL_ENABLED   default for the username/password form. Editable in Admin.
//   AUTH_OIDC_ENABLED    default for "Sign in with Authentik" (OIDC). Editable in Admin.
//   SESSION_SECRET       cookie signing secret. Set this in production.
//   SESSION_TTL_DAYS     how long a login lasts (default 30).
//   ADMIN_USERNAME /     bootstrap admin created when the users table is empty
//   ADMIN_PASSWORD       (default admin / admin — change it after first login).
//   OIDC_*               default OIDC connection settings. Editable in Admin.

function bool(v, dflt) {
  if (v === undefined || v === '') return dflt;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

const config = {
  enabled:        bool(process.env.AUTH_ENABLED, true),
  localEnabled:   bool(process.env.AUTH_LOCAL_ENABLED, true),
  oidcEnabled:    bool(process.env.AUTH_OIDC_ENABLED, false),
  sessionSecret:  process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS) || 30,
  sessionSecure:  bool(process.env.SESSION_SECURE, false),
  adminUsername:  process.env.ADMIN_USERNAME || 'admin',
  adminPassword:  process.env.ADMIN_PASSWORD || 'admin',

  // OIDC / Authentik — defaults from env, overridable at runtime.
  oidc: {
    issuer:       process.env.OIDC_ISSUER || '',        // e.g. https://authentik.example.com/application/o/pokedex/
    clientId:     process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri:  process.env.OIDC_REDIRECT_URI || '',  // e.g. https://pokedex.example.com/auth/oidc/callback
    label:        process.env.OIDC_LABEL || 'Authentik',
  },
};

// True when OIDC has the minimum settings needed to attempt a sign-in.
config.oidcConfigured = function () {
  const o = this.oidc;
  return Boolean(o.issuer && o.clientId && o.redirectUri);
};

// True when at least one working way to sign in remains — used to prevent an
// admin from locking everyone out by turning off both methods.
config.canSignIn = function () {
  return this.localEnabled || (this.oidcEnabled && this.oidcConfigured());
};

const OIDC_KEYS = ['issuer', 'clientId', 'clientSecret', 'redirectUri', 'label'];

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      JSONB       NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

// Overlay any persisted auth settings onto the live config. Called once at boot.
config.load = async function (pool) {
  await ensureTable(pool);
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key='auth'`);
  const v = rows[0]?.value;
  if (v && typeof v === 'object') {
    if (typeof v.localEnabled === 'boolean') config.localEnabled = v.localEnabled;
    if (typeof v.oidcEnabled  === 'boolean') config.oidcEnabled  = v.oidcEnabled;
    if (v.oidc && typeof v.oidc === 'object') {
      for (const k of OIDC_KEYS) if (typeof v.oidc[k] === 'string') config.oidc[k] = v.oidc[k];
    }
  }
  return config;
};

// Apply a patch to the live config, persist it, and invalidate the OIDC client
// cache so new issuer/credentials take effect on the next sign-in.
config.save = async function (pool, patch = {}) {
  if ('localEnabled' in patch) config.localEnabled = !!patch.localEnabled;
  if ('oidcEnabled'  in patch) config.oidcEnabled  = !!patch.oidcEnabled;
  if (patch.oidc && typeof patch.oidc === 'object') {
    for (const k of OIDC_KEYS) if (k in patch.oidc) config.oidc[k] = String(patch.oidc[k] ?? '');
  }
  const blob = {
    localEnabled: config.localEnabled,
    oidcEnabled:  config.oidcEnabled,
    oidc:         { ...config.oidc },
  };
  await ensureTable(pool);
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('auth', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`,
    [JSON.stringify(blob)]
  );
  try { require('./oidc').resetClient(); } catch { /* oidc not loaded yet */ }
  return config;
};

module.exports = config;
