'use strict';

const path   = require('path');
const { spawn } = require('child_process');
const { pool, clearStaticCaches } = require('./db');
const { clearSuggestionCaches } = require('./routes/suggestions');
const { SCRAPER_ALL_GROUPS, VALID_SCRAPER_GROUPS } = require('./constants');

const SCRAPER_TOKEN = process.env.SCRAPER_TOKEN || '';
const SCRIPTS_DIR   = path.join(__dirname, 'scripts');

// ── In-memory scraper state ───────────────────────────────────────────────────
// Survives only as long as the process. Non-running states are persisted to _meta.
const scraperProgress  = new Map(); // gameGroup → { total, done, current, status, inserted, updated }
const scraperSseClients = new Set();
const scraperProcs      = new Map(); // key → { proc, aborted } (or { proc, aborted, type } for __all__)
const utilResults       = new Map(); // key → { status: 'done'|'error', code, ts }

// ── SSE broadcast ─────────────────────────────────────────────────────────────

function broadcastScraper(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  if (scraperSseClients.size === 0) {
    console.log(`[sse] broadcast ${payload.type} — no clients connected`);
    return;
  }
  for (const res of scraperSseClients) {
    try { res.write(msg); res.flush?.(); } catch (_) { scraperSseClients.delete(res); }
  }
}

// Keep SSE connections alive through proxies that time out idle connections.
setInterval(() => {
  const ping = ': ping\n\n';
  for (const res of scraperSseClients) {
    try { res.write(ping); res.flush?.(); } catch (_) { scraperSseClients.delete(res); }
  }
}, 25000);

// ── State persistence ─────────────────────────────────────────────────────────

async function saveScraperState() {
  const toSave = {};
  for (const [k, v] of scraperProgress) {
    if (v.status !== 'running') toSave[k] = v;
  }
  await pool.query(
    `INSERT INTO _meta (key, value) VALUES ('scraper_state', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(toSave)]
  );
  clearStaticCaches();
  clearSuggestionCaches();
}

async function loadScraperState() {
  const { rows } = await pool.query(`SELECT value FROM _meta WHERE key = 'scraper_state'`);
  if (!rows.length || !rows[0].value) return;
  for (const [k, v] of Object.entries(JSON.parse(rows[0].value))) {
    scraperProgress.set(k, v);
  }
}

// ── Shared utilities ──────────────────────────────────────────────────────────

const ts = () => new Date().toISOString().slice(11, 19);

function setProgress(grp, fields) {
  const entry = { total: 0, done: 0, current: null, status: 'running', inserted: 0, updated: Date.now(), ...fields };
  scraperProgress.set(grp, entry);
  broadcastScraper({ type: 'progress', gameGroup: grp, ...entry });
}

function buildEnv() {
  const port = process.env.PORT || 3000;
  const env  = { ...process.env, SCRAPER_REPORT_URL: `http://127.0.0.1:${port}` };
  if (SCRAPER_TOKEN) env.SCRAPER_TOKEN = SCRAPER_TOKEN;
  return env;
}

// ── Route handlers ────────────────────────────────────────────────────────────

// POST /api/scraper/progress — called by the scraper CLI (no session).
// Requires a Bearer token when SCRAPER_TOKEN is set, otherwise restricts to loopback.
function handleScraperProgress(req, res) {
  if (SCRAPER_TOKEN) {
    if (req.headers.authorization !== `Bearer ${SCRAPER_TOKEN}`)
      return res.status(403).json({ error: 'Forbidden' });
  } else {
    const addr = req.socket.remoteAddress;
    if (addr !== '127.0.0.1' && addr !== '::1' && addr !== '::ffff:127.0.0.1')
      return res.status(403).json({ error: 'Forbidden' });
  }
  const { gameGroup, total, done, current, status, inserted, errors } = req.body || {};
  if (!gameGroup) return res.status(400).json({ error: 'gameGroup required' });
  const entry = {
    total: total ?? 0, done: done ?? 0, current: current ?? null,
    status: status ?? 'idle', inserted: inserted ?? 0, errors: errors ?? 0, updated: Date.now(),
  };
  scraperProgress.set(gameGroup, entry);
  broadcastScraper({ type: 'progress', gameGroup, ...entry });
  if (entry.status !== 'running') saveScraperState().catch(() => {});
  res.json({ ok: true });
}

// GET /api/scraper-events — SSE stream for all authenticated clients.
function handleScraperEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const init   = Object.fromEntries(scraperProgress);
  const allRef = scraperProcs.get('__all__');
  const util   = {
    static: scraperProcs.has('__static__'),
    staticResult: utilResults.get('__static__') ?? null,
    allRunning: !!allRef,
    sequenceType: allRef?.type ?? null,
  };
  res.write(`data: ${JSON.stringify({ type: 'init', progress: init, util })}\n\n`);
  res.flush?.();
  scraperSseClients.add(res);
  console.log(`[sse] client connected (total: ${scraperSseClients.size})`);
  req.on('close', () => {
    scraperSseClients.delete(res);
    console.log(`[sse] client disconnected (total: ${scraperSseClients.size})`);
  });
}

// POST /admin/scraper/run — spawn a single game group.
function handleScraperRun(req, res) {
  const { gameGroup } = req.body || {};
  if (!gameGroup || !VALID_SCRAPER_GROUPS.has(gameGroup))
    return res.status(400).json({ error: 'Invalid gameGroup' });
  if (scraperProcs.has(gameGroup))
    return res.status(409).json({ error: 'Already running' });

  const env = buildEnv();
  const log = (grp, text, level = 'info') =>
    broadcastScraper({ type: 'log', gameGroup: grp, text, level, ts: ts() });

  const ref = { proc: null, aborted: false };
  scraperProcs.set(gameGroup, ref);

  function runNext(remaining) {
    if (ref.aborted || !remaining.length) { onDone(ref.aborted ? 1 : 0); return; }
    const [grp, ...rest] = remaining;
    setProgress(grp, { status: 'running' });
    const proc = spawn('node', [path.join(SCRIPTS_DIR, 'seed-encounters.js'), '--game-group', grp],
      { env, cwd: __dirname });
    ref.proc = proc;
    proc.stdout.on('data', c => log(grp, c.toString()));
    proc.stderr.on('data', c => log(grp, c.toString(), 'error'));
    proc.on('error', err => {
      log(grp, `[failed to start: ${err.message}]\n`, 'error');
      setProgress(grp, { status: 'error' });
    });
    proc.on('close', code => {
      log(grp, `[exited with code ${code}]\n`, code === 0 ? 'info' : 'error');
      const curP = scraperProgress.get(grp);
      if (curP?.status === 'running') {
        const fin = { ...curP, status: code === 0 ? 'done' : 'error', updated: Date.now() };
        scraperProgress.set(grp, fin);
        broadcastScraper({ type: 'progress', gameGroup: grp, ...fin });
        saveScraperState().catch(() => {});
      }
      if (code !== 0 || ref.aborted) { onDone(code || 1); return; }
      runNext(rest);
    });
  }

  function onDone(exitCode) {
    scraperProcs.delete(gameGroup);
    log(gameGroup, `[sequence complete — exit ${exitCode}]\n`, exitCode === 0 ? 'info' : 'error');
  }

  runNext([gameGroup]);
  res.json({ ok: true });
}

// POST /admin/scraper/stop — stop a running game group (or clear a stale entry).
function handleScraperStop(req, res) {
  const { gameGroup } = req.body || {};
  const key = scraperProcs.has(gameGroup) ? gameGroup : '__all__';
  const ref = scraperProcs.get(key);
  if (!ref) {
    const stale = gameGroup ? scraperProgress.get(gameGroup) : null;
    if (stale?.status === 'running') {
      const cleared = { ...stale, status: 'idle', updated: Date.now() };
      scraperProgress.set(gameGroup, cleared);
      broadcastScraper({ type: 'progress', gameGroup, ...cleared });
      saveScraperState().catch(() => {});
      return res.json({ ok: true });
    }
    return res.status(404).json({ error: 'Not running' });
  }
  ref.aborted = true;
  if (ref.procs) {
    for (const proc of ref.procs.values()) try { proc.kill('SIGTERM'); } catch (_) {}
  } else if (ref.proc) {
    ref.proc.kill('SIGTERM');
  }
  scraperProcs.delete(key);
  const now = ts();
  broadcastScraper({ type: 'log', gameGroup: key === '__all__' ? 'all' : gameGroup, text: `[stopped by admin]\n`, level: 'error', ts: now });
  if (key !== '__all__') {
    const cur = scraperProgress.get(gameGroup);
    if (cur) {
      const stopped = { ...cur, status: 'idle', updated: Date.now() };
      scraperProgress.set(gameGroup, stopped);
      broadcastScraper({ type: 'progress', gameGroup, ...stopped });
    }
  } else {
    for (const [k, v] of scraperProgress) {
      if (v.status === 'running') {
        const stopped = { ...v, status: 'idle', updated: Date.now() };
        scraperProgress.set(k, stopped);
        broadcastScraper({ type: 'progress', gameGroup: k, ...stopped });
      }
    }
  }
  saveScraperState().catch(() => {});
  res.json({ ok: true });
}

// Spawns all game groups in parallel (used by run-all / run-incomplete).
// allRef.procs maps grp → proc for the kill-all stop path.
function runGroupSequence(type, groups, res) {
  const env  = buildEnv();
  const slog = (grp, text, level = 'info') =>
    broadcastScraper({ type: 'log', gameGroup: grp, text, level, ts: ts() });

  const allRef = { procs: new Map(), aborted: false, type };
  scraperProcs.set('__all__', allRef);

  let pending = groups.length;
  function onGroupDone() {
    if (allRef.aborted) return; // stop handler already cleaned up __all__
    pending--;
    if (pending === 0) {
      scraperProcs.delete('__all__');
      const label = type === 'all' ? 'Run All' : 'Run Incomplete';
      slog('all', `[${label} complete — run Seed Static Encounters when ready]\n`, 'info');
      broadcastScraper({ type: 'sequence-done' });
    }
  }

  for (const grp of groups) {
    setProgress(grp, { status: 'running' });
    const proc = spawn('node', [path.join(SCRIPTS_DIR, 'seed-encounters.js'), '--game-group', grp],
      { env, cwd: __dirname });
    allRef.procs.set(grp, proc);
    proc.stdout.on('data', c => slog(grp, c.toString()));
    proc.stderr.on('data', c => slog(grp, c.toString(), 'error'));
    // 'error' fires for spawn failures; 'close' always fires after. Guard against double-count.
    let counted = false;
    const countDone = () => { if (!counted) { counted = true; onGroupDone(); } };
    proc.on('error', err => {
      slog(grp, `[failed: ${err.message}]\n`, 'error');
      allRef.procs.delete(grp);
      if (!allRef.aborted) setProgress(grp, { status: 'error' });
    });
    proc.on('close', code => {
      slog(grp, `[exited ${code}]\n`, code === 0 ? 'info' : 'error');
      allRef.procs.delete(grp);
      if (!allRef.aborted) {
        const curP = scraperProgress.get(grp);
        if (curP?.status === 'running' || curP?.status === 'idle') {
          const fin = { ...curP, status: code === 0 ? 'done' : 'error', updated: Date.now() };
          scraperProgress.set(grp, fin);
          broadcastScraper({ type: 'progress', gameGroup: grp, ...fin });
          saveScraperState().catch(() => {});
        }
      }
      countDone();
    });
  }

  res.json({ ok: true });
}

// POST /admin/scraper/run-all
function handleRunAll(req, res) {
  if (scraperProcs.has('__all__')) return res.status(409).json({ error: 'Run All already in progress' });
  const groups = SCRAPER_ALL_GROUPS.filter(g => !scraperProcs.has(g));
  runGroupSequence('all', groups, res);
}

// POST /admin/scraper/run-incomplete
function handleRunIncomplete(req, res) {
  if (scraperProcs.has('__all__')) return res.status(409).json({ error: 'Run All already in progress' });
  const groups = SCRAPER_ALL_GROUPS.filter(g => !scraperProcs.has(g) && scraperProgress.get(g)?.status !== 'done');
  if (!groups.length) return res.status(409).json({ error: 'All scrapers are already done' });
  runGroupSequence('incomplete', groups, res);
}

// POST /admin/scraper/run-static — streams output directly in the response so the
// client sees logs and the final status without relying on SSE.
function handleRunStatic(req, res) {
  if (scraperProcs.has('__static__')) return res.status(409).json({ error: 'Already running' });

  res.setHeader('Content-Type', 'application/json');
  // We collect output and return it all at once when the script exits.
  const env  = buildEnv();
  const proc = spawn('node', [path.join(SCRIPTS_DIR, 'seed-static-encounters.js')], { env, cwd: __dirname });
  scraperProcs.set('__static__', { proc, aborted: false });
  broadcastScraper({ type: 'util', key: '__static__', running: true });
  console.log(`[util] starting __static__: ${path.join(SCRIPTS_DIR, 'seed-static-encounters.js')}`);

  const lines = [];
  let responded = false;
  const finish = (code, err) => {
    if (responded) return;
    responded = true;
    console.log(`[util] __static__ exited with code ${code}`);
    scraperProcs.delete('__static__');
    const result = { status: code === 0 ? 'done' : 'error', code, ts: ts() };
    utilResults.set('__static__', result);
    broadcastScraper({ type: 'util', key: '__static__', running: false, ...result });
    res.json(err
      ? { ok: false, error: err.message, lines, exitCode: -1, ts: result.ts }
      : { ok: code === 0, lines, exitCode: code, ts: result.ts }
    );
  };

  proc.stdout.on('data', c => {
    const text = c.toString();
    lines.push({ level: 'info', text });
    broadcastScraper({ type: 'log', gameGroup: 'static', text, level: 'info', ts: ts() });
  });
  proc.stderr.on('data', c => {
    const text = c.toString();
    lines.push({ level: 'error', text });
    broadcastScraper({ type: 'log', gameGroup: 'static', text, level: 'error', ts: ts() });
  });
  proc.on('error', err => { console.error(`[util] __static__ spawn error: ${err.message}`); finish(-1, err); });
  proc.on('close', code => finish(code, null));
}

// Spawn a one-shot utility script (static seeder, location seeder, etc.).
function spawnUtilScript(key, args, logGroup, onDone) {
  if (scraperProcs.has(key)) return false;
  const env  = buildEnv();
  const proc = spawn('node', args, { env, cwd: __dirname });
  scraperProcs.set(key, { proc, aborted: false });
  broadcastScraper({ type: 'util', key, running: true });
  console.log(`[util] starting ${key}: ${args.join(' ')}`);

  proc.stdout.on('data', c => {
    console.log(`[util] ${key} stdout → ${scraperSseClients.size} clients: ${c.toString().slice(0, 60).trim()}`);
    broadcastScraper({ type: 'log', gameGroup: logGroup, text: c.toString(), level: 'info',  ts: ts() });
  });
  proc.stderr.on('data', c => {
    console.log(`[util] ${key} stderr → ${scraperSseClients.size} clients: ${c.toString().slice(0, 60).trim()}`);
    broadcastScraper({ type: 'log', gameGroup: logGroup, text: c.toString(), level: 'error', ts: ts() });
  });

  proc.on('error', err => {
    console.error(`[util] ${key} spawn error: ${err.message}`);
    scraperProcs.delete(key);
    const result = { status: 'error', code: -1, ts: ts() };
    utilResults.set(key, result);
    broadcastScraper({ type: 'util', key, running: false, ...result });
    broadcastScraper({ type: 'log', gameGroup: logGroup, text: `[spawn failed: ${err.message}]\n`, level: 'error', ts: ts() });
    onDone?.(-1);
  });

  proc.on('close', code => {
    console.log(`[util] ${key} exited with code ${code}`);
    scraperProcs.delete(key);
    const result = { status: code === 0 ? 'done' : 'error', code, ts: ts() };
    utilResults.set(key, result);
    broadcastScraper({ type: 'util', key, running: false, ...result });
    broadcastScraper({ type: 'log', gameGroup: logGroup, text: `[exited with code ${code}]\n`, level: code === 0 ? 'info' : 'error', ts: ts() });
    onDone?.(code);
  });
  return true;
}

// POST /admin/scraper/force-reset — kills all tracked processes, clears stale state, and truncates the encounters table.
async function handleScraperForceReset(req, res) {
  for (const [key, ref] of scraperProcs) {
    ref.aborted = true;
    if (ref.procs) {
      for (const proc of ref.procs.values()) try { proc.kill('SIGTERM'); } catch (_) {}
    } else {
      try { if (ref.proc) ref.proc.kill('SIGTERM'); } catch (_) {}
    }
    scraperProcs.delete(key);
  }
  for (const [k, v] of scraperProgress) {
    const cleared = { ...v, status: 'idle', updated: Date.now() };
    scraperProgress.set(k, cleared);
    broadcastScraper({ type: 'progress', gameGroup: k, ...cleared });
  }
  broadcastScraper({ type: 'sequence-done' });
  try {
    await pool.query('TRUNCATE TABLE encounters');
  } catch (e) {
    console.error('[force-reset] failed to truncate encounters:', e.message);
    return res.status(500).json({ error: 'Truncate failed: ' + e.message });
  }
  saveScraperState().catch(() => {});
  res.json({ ok: true });
}

function getScraperProgress() { return scraperProgress; }

// GET /admin/scraper/static-encounters-table
// Returns the full resolved ENCOUNTERS array with pokémon names and game lists.
async function handleStaticEncountersTable(req, res) {
  try {
    const { ENCOUNTERS } = require('./scripts/seed-static-encounters.js');

    const [pokeRows, gameRows] = await Promise.all([
      pool.query('SELECT id, name FROM pokedex'),
      pool.query('SELECT id, name, game_group FROM games'),
    ]);

    const nameById = new Map(pokeRows.rows.map(r => [r.id, r.name]));
    const gameByName  = new Map(gameRows.rows.map(r => [r.name, r]));
    const gameByGroup = new Map();
    for (const r of gameRows.rows) {
      if (!gameByGroup.has(r.game_group)) gameByGroup.set(r.game_group, []);
      gameByGroup.get(r.game_group).push(r);
    }

    const rows = ENCOUNTERS.filter(e => !e.skip && e.pokemon).map(e => {
      const games = e.games === 'all'
        ? (gameByGroup.get(e.group) ?? []).map(g => g.name)
        : (Array.isArray(e.games) ? e.games : [e.games]).filter(n => gameByName.has(n));
      const level = e.level == null ? null
        : Array.isArray(e.level) ? `${e.level[0]}–${e.level[1]}`
        : String(e.level);
      return {
        group:       e.group,
        pokemon_id:  e.pokemon,
        pokemon_name: nameById.get(e.pokemon) ?? e.pokemon,
        location:    e.location,
        method:      e.method,
        level,
        games,
        conditions:  e.conditions ?? {},
      };
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /admin/scraper/locations-table
// Returns all game_locations with wild/special data flags and encounter Pokémon.
async function handleLocationsTable(req, res) {
  try {
    const [locRows, encRows] = await Promise.all([
      pool.query(`
        SELECT id, name, game_group, has_wild_data, has_static_data
        FROM game_locations
        ORDER BY game_group, sort_order, name
      `),
      pool.query(`
        SELECT DISTINCT e.location_id, p.id AS pokemon_id, p.name AS pokemon_name,
          p.pokedex_number AS num, p.type1, p.type2, p.icon_url
        FROM encounters e
        JOIN pokedex p ON p.id = e.pokemon_id
        ORDER BY e.location_id, p.pokedex_number
      `),
    ]);

    const pokemonByLoc = new Map();
    for (const r of encRows.rows) {
      let list = pokemonByLoc.get(r.location_id);
      if (!list) { list = []; pokemonByLoc.set(r.location_id, list); }
      list.push({ id: r.pokemon_id, name: r.pokemon_name, num: r.num, type1: r.type1, type2: r.type2, icon_url: r.icon_url });
    }

    const rows = locRows.rows.map(loc => {
      const pokemon = pokemonByLoc.get(loc.id) ?? [];
      return {
        id:              loc.id,
        name:            loc.name,
        game_group:      loc.game_group,
        has_wild_data:   loc.has_wild_data,
        has_static_data: loc.has_static_data,
        enc_count:       pokemon.length,
        pokemon,
      };
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  loadScraperState,
  getScraperProgress,
  handleScraperProgress,
  handleScraperEvents,
  handleScraperRun,
  handleScraperStop,
  handleRunAll,
  handleRunIncomplete,
  handleRunStatic,
  handleScraperForceReset,
  handleStaticEncountersTable,
  handleLocationsTable,
  spawnUtilScript,
};
