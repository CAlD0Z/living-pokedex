// User-account data access + local-credential helpers.
// "Users" are rows in the `players` table (kept that name for the caught_status FK).
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const { resetPool } = require('../db');

const BCRYPT_ROUNDS = 10;

// Columns safe to expose on req.user / in views (never the password hash).
const PUBLIC_COLS = `id, username, display_name, email, is_admin, disabled, auth_provider,
                     settings, created_at, last_login_at`;

// When the admin user changes their app password, mirror it to the PostgreSQL
// role so direct DB connections (psql, pgAdmin, etc.) stay in sync.
// Also rewrites ADMIN_PASSWORD in the mounted .env so DATABASE_URL is correct
// after a container restart.
async function syncAdminDbPassword(pool, username, plainPassword) {
  // Opt-out for managed / non-superuser databases (e.g. Kubernetes or a hosted
  // Postgres): the ALTER USER below assumes the app connects as a Postgres
  // superuser, and there's no mounted .env to rewrite. Set SYNC_DB_PASSWORD=false
  // to skip the DB-role + .env sync; the app password change itself still applies.
  if (process.env.SYNC_DB_PASSWORD === 'false') return;

  // ALTER USER does not support parameterised values; use safe SQL quoting.
  const quotedUser = '"' + username.replace(/"/g, '""') + '"';
  const quotedPass = "'" + plainPassword.replace(/'/g, "''") + "'";
  await pool.query(`ALTER USER ${quotedUser} WITH PASSWORD ${quotedPass}`);

  // Update the host .env file (mounted at /app/.env.host) so the password in
  // DATABASE_URL stays correct after the next `docker compose up`.
  try {
    const envPath = process.env.ENV_FILE_PATH || '/app/.env.host';
    const raw  = fs.readFileSync(envPath, 'utf8');
    const line = /["'\s#=\\]/.test(plainPassword)
      ? `ADMIN_PASSWORD="${plainPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : `ADMIN_PASSWORD=${plainPassword}`;
    const out = raw.replace(/^ADMIN_PASSWORD=.*/m, line);
    if (out !== raw) fs.writeFileSync(envPath, out, 'utf8');
  } catch {
    console.warn('[auth] could not update .env.host — update ADMIN_PASSWORD manually before restarting');
  }

  // Swap the live connection pool so all future queries use the new password
  // immediately, without requiring a container restart.
  if (process.env.DATABASE_URL) {
    const dbUrl = new URL(process.env.DATABASE_URL);
    dbUrl.password = plainPassword;
    const newUrl = dbUrl.toString();
    process.env.DATABASE_URL = newUrl;
    resetPool(newUrl);
  }
}

function makeUsers(pool) {
  async function byId(id) {
    const { rows } = await pool.query(`SELECT ${PUBLIC_COLS} FROM players WHERE id=$1`, [id]);
    return rows[0] || null;
  }

  async function byUsername(username) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLS}, password_hash FROM players WHERE lower(username)=lower($1)`,
      [username]
    );
    return rows[0] || null;
  }

  async function list() {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLS},
              (SELECT count(*) FROM caught_status c WHERE c.player_id = players.id) AS caught_count
       FROM players ORDER BY is_admin DESC, lower(username)`
    );
    return rows;
  }

  async function count() {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM players');
    return rows[0].n;
  }

  // Create a local account. Returns the new public user row.
  async function create({ username, password, email = null, isAdmin = false }) {
    const hash = password ? await bcrypt.hash(password, BCRYPT_ROUNDS) : null;
    const { rows } = await pool.query(
      `INSERT INTO players (username, display_name, password_hash, email, is_admin, auth_provider)
       VALUES ($1, $1, $2, $3, $4, 'local')
       RETURNING ${PUBLIC_COLS}`,
      [username, hash, email, isAdmin]
    );
    return rows[0];
  }

  async function setPassword(id, password) {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows: [user] } = await pool.query(
      'UPDATE players SET password_hash=$1 WHERE id=$2 RETURNING username',
      [hash, id]
    );
    if (user?.username === (process.env.ADMIN_USERNAME || 'admin')) {
      await syncAdminDbPassword(pool, user.username, password);
    }
  }

  async function verifyPassword(user, password) {
    if (!user || !user.password_hash) return false;
    return bcrypt.compare(password, user.password_hash);
  }

  async function setFields(id, { email, isAdmin, disabled, displayName }) {
    const sets = [], params = [];
    if (email       !== undefined) sets.push(`email=$${params.push(email)}`);
    if (isAdmin     !== undefined) sets.push(`is_admin=$${params.push(isAdmin)}`);
    if (disabled    !== undefined) sets.push(`disabled=$${params.push(disabled)}`);
    if (displayName !== undefined) sets.push(`display_name=$${params.push(displayName)}`);
    if (!sets.length) return;
    params.push(id);
    await pool.query(`UPDATE players SET ${sets.join(',')} WHERE id=$${params.length}`, params);
  }

  async function updateSettings(id, settings) {
    await pool.query('UPDATE players SET settings=$1 WHERE id=$2', [JSON.stringify(settings), id]);
  }

  async function touchLogin(id) {
    await pool.query('UPDATE players SET last_login_at=now() WHERE id=$1', [id]);
  }

  async function remove(id) {
    await pool.query('DELETE FROM players WHERE id=$1', [id]);
  }

  async function findByExternal(provider, externalId) {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLS} FROM players WHERE auth_provider=$1 AND external_id=$2`,
      [provider, externalId]
    );
    return rows[0] || null;
  }

  // Local accounts available to be claimed by an OIDC user.
  async function listUnclaimed() {
    const { rows } = await pool.query(
      `SELECT ${PUBLIC_COLS},
              (SELECT count(*) FROM caught_status c WHERE c.player_id = players.id) AS caught_count
       FROM players
       WHERE auth_provider = 'local' AND disabled = FALSE
       ORDER BY lower(username)`
    );
    return rows;
  }

  // Link an existing local profile to an OIDC identity. Returns null if the profile
  // was already claimed (race condition) so the caller can show an error.
  async function claimExternal(id, { provider, externalId, email }) {
    const { rows } = await pool.query(
      `UPDATE players SET auth_provider=$1, external_id=$2, email=COALESCE($3, email)
       WHERE id=$4 AND auth_provider = 'local'
       RETURNING ${PUBLIC_COLS}`,
      [provider, externalId, email || null, id]
    );
    return rows[0] || null;
  }

  // Create a brand-new account for an OIDC identity with an explicit display name.
  async function createFromOidc({ provider, externalId, username, displayName, email }) {
    const isFirst = (await count()) === 0;
    for (let i = 0; ; i++) {
      const uname = i === 0 ? username : `${username}-${i}`;
      try {
        const { rows } = await pool.query(
          `INSERT INTO players (username, display_name, email, auth_provider, external_id, is_admin)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${PUBLIC_COLS}`,
          [uname, displayName || uname, email || null, provider, externalId, isFirst]
        );
        return rows[0];
      } catch (err) {
        if (/unique|duplicate/i.test(err.message) && /username/i.test(err.message)) continue;
        if (/unique|duplicate/i.test(err.message)) {
          const { rows: existing } = await pool.query(
            `SELECT ${PUBLIC_COLS} FROM players WHERE auth_provider=$1 AND external_id=$2`,
            [provider, externalId]
          );
          if (existing[0]) return existing[0];
        }
        throw err;
      }
    }
  }

  return {
    byId, byUsername, list, count, create, setPassword, verifyPassword,
    setFields, updateSettings, touchLogin, remove,
    findByExternal, listUnclaimed, claimExternal, createFromOidc,
  };
}

module.exports = { makeUsers };
