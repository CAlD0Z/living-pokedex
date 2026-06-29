'use strict';

const { Pool } = require('pg');
const { GAME_ABBR } = require('./constants');

let _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });

// Proxy so modules that destructure `const { pool } = require('./db')` always
// route through the live pool even after resetPool() swaps it out.
const pool = new Proxy(Object.create(null), {
  get(_, prop) {
    const val = _pool[prop];
    return typeof val === 'function' ? val.bind(_pool) : val;
  },
});

// Replace the underlying pool with a fresh one using a new connection string.
// Existing connections in the old pool finish their in-flight queries, then drain.
function resetPool(connectionString) {
  const old = _pool;
  _pool = new Pool({ connectionString, max: 20 });
  clearStaticCaches();
  old.end().catch(err => console.warn('[db] error draining old pool:', err.message));
}

// ── Static caches — cleared when the scraper writes new data ─────────────────
let _dexTotals     = null;
let _nationalTotal = 0;
let _games         = null;
const _exclusiveMapCache = new Map(); // key: "game_group:effGameId"
const _encounterSetCache = new Map(); // key: game_group

function clearStaticCaches() {
  _dexTotals     = null;
  _nationalTotal = 0;
  _games         = null;
  _exclusiveMapCache.clear();
  _encounterSetCache.clear();
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

async function getDexTotals() {
  if (_dexTotals !== null) return { dexTotals: _dexTotals, nationalTotal: _nationalTotal };
  const [totRows, natRow] = await Promise.all([
    pool.query('SELECT dex_key, COUNT(DISTINCT regional_number) AS total FROM dex_entries GROUP BY dex_key'),
    pool.query("SELECT COUNT(*) AS total FROM pokedex WHERE id NOT LIKE '%\\_%' AND visible=TRUE"),
  ]);
  _dexTotals     = new Map(totRows.rows.map(r => [r.dex_key, parseInt(r.total)]));
  _nationalTotal = parseInt(natRow.rows[0]?.total ?? 0);
  return { dexTotals: _dexTotals, nationalTotal: _nationalTotal };
}

async function fetchGames() {
  if (_games) return _games;
  const { rows } = await pool.query('SELECT * FROM games ORDER BY generation NULLS FIRST, sort_order, id');
  _games = rows;
  return rows;
}

async function fetchCaughtByGame(playerId) {
  if (!playerId) return new Map();
  const { rows } = await pool.query(
    'SELECT game_id, COUNT(*) AS caught FROM caught_status WHERE player_id=$1 GROUP BY game_id',
    [playerId]
  );
  return new Map(rows.map(r => [parseInt(r.game_id), parseInt(r.caught)]));
}

async function fetchLastCaughtByGame(playerId) {
  if (!playerId) return new Map();
  const { rows } = await pool.query(
    'SELECT game_id, MAX(caught_at) AS last_caught_at FROM caught_status WHERE player_id=$1 GROUP BY game_id',
    [playerId]
  );
  return new Map(rows.map(r => [parseInt(r.game_id), r.last_caught_at ?? null]));
}

async function fetchCaughtSet(playerId, gameId) {
  if (!playerId || !gameId) return new Set();
  const { rows } = await pool.query(
    'SELECT pokemon_id FROM caught_status WHERE player_id=$1 AND game_id=$2',
    [playerId, gameId]
  );
  return new Set(rows.map(r => r.pokemon_id));
}

// Resolve the game id in groupGames that matches the selected game.
// For DLC dexes the selected game is the base (Sword/Scarlet) while the DLC
// group uses version-prefixed pseudo-games (SW -/SH -, S -/V -).
function effectiveGameId(selectedGame, groupGames) {
  if (groupGames.some(g => g.id === selectedGame.id)) return selectedGame.id;
  const SIDE = { Sword: 'SW', Shield: 'SH', Scarlet: 'S', Violet: 'V' };
  const side = SIDE[selectedGame.name];
  if (side) {
    const m = groupGames.find(g => g.name.startsWith(side + ' -'));
    if (m) return m.id;
  }
  return null;
}

// Build pokemon_id → { tag, names, games } for Pokémon only available in a
// sibling version (version exclusives). Returns an empty map when not applicable.
async function fetchExclusiveMap(selectedGame) {
  const group = selectedGame?.game_group;
  if (!group || group === 'HOME') return new Map();
  const games = await fetchGames();
  const groupGames = games.filter(g => g.game_group === group);
  if (groupGames.length < 2) return new Map();
  const effId = effectiveGameId(selectedGame, groupGames);
  if (!effId) return new Map();

  const cacheKey = `${group}:${effId}`;
  if (_exclusiveMapCache.has(cacheKey)) return _exclusiveMapCache.get(cacheKey);

  const { rows } = await pool.query(`
    SELECT e.pokemon_id, array_agg(DISTINCT e.game_id) AS gids
    FROM encounters e
    JOIN games g ON g.id = e.game_id
    WHERE g.game_group = $1
    GROUP BY e.pokemon_id
  `, [group]);

  const byId = new Map(groupGames.map(g => [g.id, g]));
  const abbr = g => GAME_ABBR[g.name] ?? g.name[0].toUpperCase();
  const map  = new Map();
  const hasEncounterInGroup = new Set(rows.map(r => r.pokemon_id));
  for (const r of rows) {
    const gids = r.gids.map(Number);
    if (gids.includes(effId)) continue;
    const sibs = gids
      .map(id => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (!sibs.length) continue;
    map.set(r.pokemon_id, {
      tag:   sibs.map(abbr).join('/'),
      names: sibs.map(g => g.name),
      games: sibs.map(g => ({ abbr: abbr(g), name: g.name })),
    });
  }

  // Propagate exclusivity forward through evolution chains: a Pokémon with no
  // encounters anywhere in this game group inherits the exclusive status of its
  // pre-evolution so it gets the same badge (e.g. Ambipom inherits Aipom's V badge).
  let frontier = [...map.keys()];
  while (frontier.length > 0) {
    const { rows: evoRows } = await pool.query(
      'SELECT from_pokemon_id, to_pokemon_id FROM evolutions WHERE from_pokemon_id = ANY($1)',
      [frontier]
    );
    const next = [];
    for (const { from_pokemon_id, to_pokemon_id } of evoRows) {
      if (map.has(to_pokemon_id) || hasEncounterInGroup.has(to_pokemon_id)) continue;
      map.set(to_pokemon_id, map.get(from_pokemon_id));
      next.push(to_pokemon_id);
    }
    frontier = next;
  }

  _exclusiveMapCache.set(cacheKey, map);
  return map;
}

// Shared helper for regional / DLC dex page routes.
// Mutates baseRows in place to set _isForm, then fetches additional form rows
// (alt forms whose national number appears in the dex but aren't in dex_entries).
async function augmentWithForms(baseRows) {
  const seenSlots = new Set();
  for (const r of baseRows) {
    const slot = r.regional_number ?? r.pokedex_number;
    r._isForm = seenSlots.has(slot);
    seenSlots.add(slot);
  }

  const dexNums = [...new Set(baseRows.map(r => r.pokedex_number))];
  const { rows: formRows } = dexNums.length
    ? await pool.query(
        `SELECT p.id AS pokemon_id, p.pokedex_number, p.name, p.form_name,
                p.type1, p.type2, p.icon_url, p.form_tag
         FROM pokedex p
         WHERE p.pokedex_number = ANY($1) AND p.id LIKE '%\\_%'`,
        [dexNums]
      )
    : { rows: [] };

  const dexIds  = new Set(baseRows.map(r => r.pokemon_id));
  const allRows = [
    ...baseRows,
    ...formRows.filter(r => !dexIds.has(r.pokemon_id)).map(r => ({ ...r, _isForm: true })),
  ];
  const visibleTotal = baseRows.filter(r => !r._isForm).length;

  return { allRows, visibleTotal };
}

// Fetch Pokémon with encounters in gameGroup that are not in the regional dex.
// Uses pokedex_number exclusion so alternate forms of dex species are also skipped.
async function fetchBonusEncounters(gameGroup, dexKey) {
  const { rows } = await pool.query(`
    SELECT DISTINCT p.id AS pokemon_id, p.pokedex_number, p.name, p.form_name,
                    p.type1, p.type2, p.icon_url, p.generation
    FROM encounters e
    JOIN game_locations gl ON gl.id = e.location_id
    JOIN pokedex p ON p.id = e.pokemon_id
    LEFT JOIN (
      SELECT p2.pokedex_number
      FROM dex_entries de
      JOIN pokedex p2 ON p2.id = de.pokemon_id
      WHERE de.dex_key = $2
    ) dex_nums ON dex_nums.pokedex_number = p.pokedex_number
    WHERE gl.game_group = $1
      AND p.visible = TRUE
      AND dex_nums.pokedex_number IS NULL
    ORDER BY p.pokedex_number, p.id
  `, [gameGroup, dexKey]);
  return rows.map(r => ({ ...r, _isForm: r.pokemon_id.includes('_'), _bonus: true }));
}

// Returns a Set of pokemon IDs with at least one encounter in the given game
// group, or null when not applicable (HOME dex, no game selected).
// Cached until clearStaticCaches() is called (e.g. after a scraper run).
async function fetchEncounterSet(gameGroup, parentGameGroup = null) {
  if (!gameGroup || gameGroup === 'HOME' || gameGroup.startsWith('HOME_')) return null;
  const groups   = (parentGameGroup && parentGameGroup !== gameGroup) ? [gameGroup, parentGameGroup] : [gameGroup];
  const cacheKey = groups.join('+');
  if (_encounterSetCache.has(cacheKey)) return _encounterSetCache.get(cacheKey);
  const { rows } = await pool.query(
    `SELECT DISTINCT e.pokemon_id
     FROM encounters e
     JOIN game_locations gl ON gl.id = e.location_id
     WHERE gl.game_group = ANY($1)`,
    [groups]
  );
  const s = new Set(rows.map(r => r.pokemon_id));
  _encounterSetCache.set(cacheKey, s);
  return s;
}

async function fetchLeaderboard() {
  const { rows } = await pool.query(`
    SELECT p.id, p.username, p.display_name,
           COUNT(cs.pokemon_id) FILTER (
             WHERE g.game_group = 'HOME' AND g.name != 'Shiny Dex'
           )::int AS home_caught,
           COUNT(cs.pokemon_id) FILTER (
             WHERE g.game_group = 'HOME' AND g.name = 'Shiny Dex'
           )::int AS shiny_caught,
           COUNT(cs.pokemon_id) FILTER (
             WHERE g.game_group NOT LIKE 'HOME%'
           )::int AS game_caught
    FROM players p
    LEFT JOIN caught_status cs ON cs.player_id = p.id
    LEFT JOIN games g ON g.id = cs.game_id
    WHERE NOT p.disabled
    GROUP BY p.id, p.username, p.display_name
  `);
  return rows;
}

// Combined caught set across every game in a group (for the "All versions" view).
async function fetchCaughtSetForGroup(playerId, gameGroup) {
  if (!playerId) return new Set();
  const games   = await fetchGames();
  const gameIds = games.filter(g => g.game_group === gameGroup).map(g => g.id);
  if (!gameIds.length) return new Set();
  const { rows } = await pool.query(
    `SELECT DISTINCT pokemon_id FROM caught_status WHERE player_id = $1 AND game_id = ANY($2)`,
    [playerId, gameIds]
  );
  return new Set(rows.map(r => r.pokemon_id));
}

// Exclusive map for the "All versions" combined view: marks each Pokémon that is
// NOT available in every game of the group with the game(s) it IS in.
async function fetchExclusiveMapForGroup(gameGroup) {
  const games      = await fetchGames();
  const groupGames = games.filter(g => g.game_group === gameGroup);
  if (groupGames.length < 2) return new Map();

  const cacheKey = `all:${gameGroup}`;
  if (_exclusiveMapCache.has(cacheKey)) return _exclusiveMapCache.get(cacheKey);

  const allIds = new Set(groupGames.map(g => g.id));
  const { rows } = await pool.query(`
    SELECT e.pokemon_id, array_agg(DISTINCT e.game_id) AS gids
    FROM encounters e
    JOIN games g ON g.id = e.game_id
    WHERE g.game_group = $1
    GROUP BY e.pokemon_id
  `, [gameGroup]);

  const byId  = new Map(groupGames.map(g => [g.id, g]));
  const abbr  = g => GAME_ABBR[g.name] ?? g.name[0].toUpperCase();
  const map   = new Map();
  const hasEncounterInGroup = new Set(rows.map(r => r.pokemon_id));

  for (const r of rows) {
    const gids = r.gids.map(Number).filter(id => allIds.has(id));
    if (gids.length >= allIds.size) continue; // in every version — no badge
    const sibs = gids
      .map(id => byId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (!sibs.length) continue;
    map.set(r.pokemon_id, {
      tag:   sibs.map(abbr).join('/'),
      names: sibs.map(g => g.name),
      games: sibs.map(g => ({ abbr: abbr(g), name: g.name })),
    });
  }

  // Propagate through evolution chains (same logic as fetchExclusiveMap).
  let frontier = [...map.keys()];
  while (frontier.length > 0) {
    const { rows: evoRows } = await pool.query(
      'SELECT from_pokemon_id, to_pokemon_id FROM evolutions WHERE from_pokemon_id = ANY($1)',
      [frontier]
    );
    const next = [];
    for (const { from_pokemon_id, to_pokemon_id } of evoRows) {
      if (map.has(to_pokemon_id) || hasEncounterInGroup.has(to_pokemon_id)) continue;
      map.set(to_pokemon_id, map.get(from_pokemon_id));
      next.push(to_pokemon_id);
    }
    frontier = next;
  }

  _exclusiveMapCache.set(cacheKey, map);
  return map;
}

module.exports = {
  pool,
  resetPool,
  clearStaticCaches,
  getDexTotals,
  fetchGames,
  fetchCaughtByGame,
  fetchLastCaughtByGame,
  fetchCaughtSet,
  fetchCaughtSetForGroup,
  effectiveGameId,
  fetchExclusiveMap,
  fetchExclusiveMapForGroup,
  augmentWithForms,
  fetchBonusEncounters,
  fetchEncounterSet,
  fetchLeaderboard,
};
