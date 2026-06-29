'use strict';

// Database bootstrap, run automatically from app.js on every boot (or
// standalone: `node migrate.js`).
//
// Migrations are tracked in a `schema_migrations` table and each runs at most
// once. This matters because some migrations are destructive one-time fixes
// (e.g. 008 deletes mis-seeded encounters); re-running them would corrupt a
// healthy database.
//
// Three situations are handled:
//   • Fresh DB + committed seed → restore the full-dump seed (already a
//     fully-migrated snapshot) and mark every bundled migration as applied.
//   • Fresh DB, no seed → run init.sql + every migration to build the schema
//     from scratch (for the scrape-from-source workflow).
//   • Pre-existing database (yours, deployed before this tool existed) → adopt
//     its current state as the baseline: record the bundled migrations as
//     already applied WITHOUT running them, so historical one-time fixes never
//     fire again. Only migrations added later will run.

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

// db/ lives next to web/ in the repo, and is mounted at /app/db in the container.
function findDbDir() {
  for (const dir of [path.join(__dirname, 'db'), path.join(__dirname, '..', 'db')]) {
    if (fs.existsSync(path.join(dir, 'init.sql'))) return dir;
  }
  return null;
}

async function run(pool) {
  const ownPool = !pool;
  if (ownPool) pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const dbDir = findDbDir();
  if (!dbDir) {
    console.warn('[migrate] db/ directory not found — skipping bootstrap.');
    if (ownPool) await pool.end();
    return;
  }

  // Ordered list of every schema file (init.sql first, then 0NN_*.sql).
  const files = [
    path.join(dbDir, 'init.sql'),
    ...fs.readdirSync(path.join(dbDir, 'migrations'))
        .filter(f => f.endsWith('.sql'))
        .sort()
        .map(f => path.join(dbDir, 'migrations', f)),
  ];
  const seedFile = path.join(dbDir, 'seed.sql');

  // Pin the whole bootstrap to one connection so search_path is predictable:
  // a pg_dump seed sets `search_path = ''`, which would otherwise leak onto a
  // pooled connection and break the unqualified names in the migrations.
  const client = await pool.connect();

  const record = name =>
    client.query('INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [path.basename(name)]);
  const apply = async file => {
    try {
      await client.query(fs.readFileSync(file, 'utf8'));
      await record(file);
      console.log(`[migrate] applied ${path.basename(file)}`);
    } catch (err) {
      console.error(`[migrate] FAILED on ${path.basename(file)}: ${err.message}`);
      throw err;
    }
  };

  try {
    await client.query('SET search_path TO public');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const pokedexExists =
      (await client.query("SELECT to_regclass('public.pokedex') AS t")).rows[0].t !== null;
    const appliedCount =
      (await client.query('SELECT COUNT(*)::int AS n FROM schema_migrations')).rows[0].n;

    if (!pokedexExists && fs.existsSync(seedFile)) {
      // Fresh database + committed seed: restore the fully-migrated snapshot.
      console.log('[migrate] fresh database — restoring db/seed.sql …');
      // pg_dump (16.x) wraps output in \restrict / \unrestrict psql
      // meta-commands; strip them — node-pg speaks SQL, not psql.
      const seedSql = fs.readFileSync(seedFile, 'utf8')
        .replace(/^\\(?:un)?restrict\b.*$/gm, '');
      await client.query(seedSql);
      await client.query('SET search_path TO public');  // the dump reset it to ''
      for (const f of files) await record(f);           // snapshot is already migrated
      const { rows: [{ n }] } = await client.query('SELECT COUNT(*)::int AS n FROM pokedex');
      console.log(`[migrate] seed restored: ${n} Pokémon rows; ${files.length} migrations baselined.`);

    } else if (pokedexExists && appliedCount === 0) {
      // Pre-existing database from before migration tracking existed: adopt it
      // as the baseline. Do NOT re-run the bundled migrations (some are
      // destructive one-time fixes) — just record them as already applied.
      for (const f of files) await record(f);
      console.log(`[migrate] existing database adopted as baseline; ${files.length} migrations marked applied.`);

    } else {
      // Fresh DB without a seed, or an incremental upgrade: run anything not yet
      // recorded, in order.
      if (!pokedexExists && !fs.existsSync(seedFile)) {
        console.warn('[migrate] empty database and db/seed.sql is missing — the app ' +
          'will start with no Pokémon data. See README → "Seeding the database".');
      }
      const done = new Set(
        (await client.query('SELECT filename FROM schema_migrations')).rows.map(r => r.filename));
      let ran = 0;
      for (const f of files) {
        if (!done.has(path.basename(f))) { await apply(f); ran++; }
      }
      if (ran === 0) console.log('[migrate] database is up to date.');
    }
  } finally {
    client.release();
    if (ownPool) await pool.end();
  }
}

module.exports = { run };

// Allow running directly:  node migrate.js
if (require.main === module) {
  run().then(() => process.exit(0)).catch(err => {
    console.error('[migrate] bootstrap failed:', err);
    process.exit(1);
  });
}
