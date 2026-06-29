'use strict';

const express = require('express');
const { pool, fetchGames, fetchCaughtByGame, getDexTotals } = require('../db');
const { GROUP_DEX_KEY, HOME_SHINY_DEXES, GAME_COLORS, GROUP_REGION } = require('../constants');

// ── Location caches (cleared by clearSuggestionCaches after a scraper run) ───
// Entries older than CACHE_TTL are evicted on next access to guard against
// stale data when the DB is modified outside the scraper.
const CACHE_TTL    = 60 * 60 * 1000; // 1 hour
const _locCache    = new Map(); // key: `${pokemonId}|${gameGroup}`, value: { result, ts }
const _anyLocCache = new Map(); // key: pokemonId,                   value: { result, ts }

function clearSuggestionCaches() {
  _locCache.clear();
  _anyLocCache.clear();
}

function localDateStr(timezone) {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: timezone }); }
  catch { return new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' }); }
}

async function locationsFor(pokemonId, gameGroup) {
  const key   = `${pokemonId}|${gameGroup}`;
  const entry = _locCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.result;
  const { rows } = await pool.query(`
    SELECT DISTINCT gl.name AS location_name, MIN(gl.sort_order) AS sort_order
    FROM encounters e
    JOIN game_locations gl ON gl.id = e.location_id
    WHERE e.pokemon_id = $1 AND gl.game_group = $2
    GROUP BY gl.name
    ORDER BY MIN(gl.sort_order), gl.name
  `, [pokemonId, gameGroup]);
  const result = rows.map(r => r.location_name);
  _locCache.set(key, { result, ts: Date.now() });
  return result;
}

async function anyLocationsFor(pokemonId) {
  const entry = _anyLocCache.get(pokemonId);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.result;
  const { rows } = await pool.query(`
    SELECT DISTINCT gl.name AS location_name, MIN(gl.sort_order) AS sort_order
    FROM encounters e
    JOIN game_locations gl ON gl.id = e.location_id
    WHERE e.pokemon_id = $1
    GROUP BY gl.name
    ORDER BY MIN(gl.sort_order), gl.name
    LIMIT 5
  `, [pokemonId]);
  const result = rows.map(r => r.location_name);
  _anyLocCache.set(pokemonId, { result, ts: Date.now() });
  return result;
}

async function saveSuggestionPatch(playerId, patch) {
  await pool.query(
    `UPDATE players SET settings = settings || $1::jsonb WHERE id = $2`,
    [JSON.stringify(patch), playerId]
  );
}

// Builds { id, name, game_group, caught, dexTotal, color, dexUrl } for each game.
function buildGamesWithProgress(games, caughtByGame, dexTotals, nationalTotal, lastCaughtByGame = new Map()) {
  return games.map(g => {
    const dexKey   = GROUP_DEX_KEY[g.game_group];
    const dexTotal = dexKey ? (dexTotals.get(dexKey) ?? nationalTotal) : nationalTotal;
    return {
      id:           g.id,
      name:         g.name,
      game_group:   g.game_group,
      generation:   g.generation,
      color:        GAME_COLORS[g.name] ?? '#6b7a99',
      caught:       caughtByGame.get(g.id) ?? 0,
      lastCaughtAt: lastCaughtByGame.get(g.id) ?? null,
      dexTotal,
      dexUrl:       (GROUP_REGION[g.game_group] ?? '/dex') + '?game_id=' + g.id,
    };
  });
}

async function fetchRecommendedCatch(playerId, gamesWithProgress, nationalTotal, excludeId = null) {
  if (!playerId) return null;

  const isHome = gg => gg === 'HOME' || gg.startsWith('HOME_');
  const mainGames = gamesWithProgress.filter(g => !isHome(g.game_group));

  const inProgress = mainGames
    .filter(g => g.caught > 0 && g.caught < g.dexTotal)
    .sort((a, b) => (b.caught / b.dexTotal) - (a.caught / a.dexTotal));

  if (inProgress.length > 0) {
    const g = inProgress[0];
    const dexKey = GROUP_DEX_KEY[g.game_group];
    const { rows } = dexKey
      ? await pool.query(`
          SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
          FROM pokedex p
          JOIN dex_entries de ON de.pokemon_id = p.id AND de.dex_key = $1
          WHERE p.id NOT LIKE '%\\_%'
            AND p.id NOT IN (SELECT pokemon_id FROM caught_status WHERE player_id=$2 AND game_id=$3)
            AND ($4::text IS NULL OR p.id != $4)
          ORDER BY RANDOM() LIMIT 1`, [dexKey, playerId, g.id, excludeId])
      : await pool.query(`
          SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
          FROM pokedex p WHERE p.visible=TRUE AND p.id NOT LIKE '%\\_%'
            AND p.id NOT IN (SELECT pokemon_id FROM caught_status WHERE player_id=$1 AND game_id=$2)
            AND ($3::text IS NULL OR p.id != $3)
          ORDER BY RANDOM() LIMIT 1`, [playerId, g.id, excludeId]);
    if (rows[0]) {
      const locations = await locationsFor(rows[0].id, g.game_group);
      return { pokemon: rows[0], gameName: g.name, gameColor: g.color, gameUrl: g.dexUrl, reason: 'in_progress', locations };
    }
  }

  const homeGames  = gamesWithProgress.filter(g => g.game_group === 'HOME');
  const homeCaught = homeGames.reduce((s, g) => s + g.caught, 0);

  if (homeCaught < nationalTotal) {
    const homeIds = homeGames.map(g => g.id);
    if (homeIds.length) {
      const { rows } = await pool.query(`
        SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
        FROM pokedex p
        WHERE p.visible=TRUE AND p.id NOT LIKE '%\\_%'
          AND NOT EXISTS (
            SELECT 1 FROM caught_status cs
            WHERE cs.player_id=$1 AND cs.pokemon_id=p.id AND cs.game_id=ANY($2::int[])
          )
          AND ($3::text IS NULL OR p.id != $3)
        ORDER BY RANDOM() LIMIT 1`, [playerId, homeIds, excludeId]);
      if (rows[0]) return { pokemon: rows[0], gameName: 'Living Dex', gameColor: '#3dc971', gameUrl: '/dex', reason: 'living_dex', locations: [] };
    }
  }

  const notStarted = mainGames.filter(g => g.caught === 0);
  if (notStarted.length) {
    const g = notStarted[Math.floor(Math.random() * notStarted.length)];
    const dexKey = GROUP_DEX_KEY[g.game_group];
    if (dexKey) {
      const { rows } = await pool.query(`
        SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
        FROM pokedex p
        JOIN dex_entries de ON de.pokemon_id = p.id AND de.dex_key = $1
        WHERE p.id NOT LIKE '%\\_%'
          AND ($2::text IS NULL OR p.id != $2)
        ORDER BY RANDOM() LIMIT 1`, [dexKey, excludeId]);
      if (rows[0]) {
        const locations = await locationsFor(rows[0].id, g.game_group);
        return { pokemon: rows[0], gameName: g.name, gameColor: g.color, gameUrl: g.dexUrl, reason: 'not_started', locations };
      }
    }
  }

  return null;
}

async function getCatchNextForGame(user, gameId, games, { skipCache = false, excludeId = null, clearOthers = false } = {}) {
  if (!user || !gameId) return null;
  const game = games.find(g => g.id == gameId);
  if (!game) return null;
  const isHome = gg => gg === 'HOME' || gg.startsWith('HOME_');
  if (isHome(game.game_group)) return null;

  const timezone = user.settings?.timezone || 'UTC';
  const todayStr = localDateStr(timezone);
  const cached = user.settings?.allGameSuggestions?.[String(gameId)];
  if (!skipCache && cached && cached.localDate === todayStr && cached.pokemon) return cached.pokemon;

  const dexKey = GROUP_DEX_KEY[game.game_group];
  let pokemon = null;
  if (dexKey) {
    const { rows } = await pool.query(`
      WITH RECURSIVE
      game_catchable AS (
        SELECT DISTINCT e.pokemon_id AS id
        FROM encounters e
        JOIN game_locations gl ON gl.id = e.location_id
        WHERE gl.game_group = $5
      ),
      evo_from_catchable(id) AS (
        SELECT ev.to_pokemon_id
        FROM evolutions ev
        WHERE ev.from_pokemon_id IN (SELECT id FROM game_catchable)
        UNION
        SELECT ev.to_pokemon_id
        FROM evolutions ev
        JOIN evo_from_catchable ec ON ev.from_pokemon_id = ec.id
      ),
      breedable AS (
        SELECT DISTINCT ev.from_pokemon_id AS id
        FROM evolutions ev
        JOIN pokedex p ON p.id = ev.from_pokemon_id AND p.is_baby = TRUE
        WHERE ev.to_pokemon_id IN (SELECT id FROM game_catchable)
           OR ev.to_pokemon_id IN (SELECT id FROM evo_from_catchable)
      )
      SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
      FROM pokedex p
      JOIN dex_entries de ON de.pokemon_id = p.id AND de.dex_key = $1
      WHERE p.id NOT LIKE '%\\_%'
        AND p.id NOT IN (SELECT pokemon_id FROM caught_status WHERE player_id=$2 AND game_id=$3)
        AND ($4::text IS NULL OR p.id != $4)
      ORDER BY
        CASE
          WHEN p.id IN (SELECT id FROM game_catchable)       THEN 1
          WHEN p.id IN (SELECT id FROM evo_from_catchable)
            OR p.id IN (SELECT id FROM breedable)            THEN 2
          ELSE 3
        END,
        RANDOM()
      LIMIT 1`, [dexKey, user.id, gameId, excludeId ?? null, game.game_group]);
    pokemon = rows[0] || null;
  } else {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
      FROM pokedex p WHERE p.visible=TRUE AND p.id NOT LIKE '%\\_%'
        AND p.id NOT IN (SELECT pokemon_id FROM caught_status WHERE player_id=$1 AND game_id=$2)
        AND ($3::text IS NULL OR p.id != $3)
      ORDER BY RANDOM() LIMIT 1`, [user.id, gameId, excludeId ?? null]);
    pokemon = rows[0] || null;
  }

  if (pokemon) {
    const entry = { pokemon, localDate: todayStr };
    const allGameSuggestions = clearOthers
      ? { [String(gameId)]: entry }
      : { ...(user.settings?.allGameSuggestions || {}), [String(gameId)]: entry };
    await saveSuggestionPatch(user.id, { allGameSuggestions });
  }
  return pokemon;
}

async function fetchShinyHunt(playerId, gamesWithProgress, excludeId = null) {
  if (!playerId) return null;

  const shinyGames = gamesWithProgress.filter(g => HOME_SHINY_DEXES.has(g.game_group));
  if (!shinyGames.length) return null;

  const shinyGameIds = shinyGames.map(g => g.id);
  const isHome = gg => gg === 'HOME' || gg.startsWith('HOME_');
  const activeGameGroups = gamesWithProgress
    .filter(g => !isHome(g.game_group) && g.caught > 0)
    .map(g => g.game_group);

  const { rows } = await pool.query(`
    WITH RECURSIVE
    enc_direct(id) AS (SELECT DISTINCT pokemon_id FROM encounters),
    enc_chain(id) AS (
      SELECT id FROM enc_direct
      UNION
      SELECT ev.to_pokemon_id FROM evolutions ev JOIN enc_chain c ON c.id = ev.from_pokemon_id
    ),
    obtainable(id) AS (
      SELECT id FROM enc_chain
      UNION
      SELECT p.id FROM pokedex p
      JOIN evolutions ev ON ev.from_pokemon_id = p.id
      JOIN enc_chain c ON c.id = ev.to_pokemon_id
      WHERE p.is_baby = TRUE
    ),
    active_direct(id) AS (
      SELECT DISTINCT e.pokemon_id
      FROM encounters e
      JOIN game_locations gl ON gl.id = e.location_id
      WHERE gl.game_group = ANY($4::text[])
    ),
    active_chain(id) AS (
      SELECT id FROM active_direct
      UNION
      SELECT ev.to_pokemon_id FROM evolutions ev JOIN active_chain c ON c.id = ev.from_pokemon_id
    ),
    active_obtainable(id) AS (
      SELECT id FROM active_chain
      UNION
      SELECT p.id FROM pokedex p
      JOIN evolutions ev ON ev.from_pokemon_id = p.id
      JOIN active_chain c ON c.id = ev.to_pokemon_id
      WHERE p.is_baby = TRUE
    )
    SELECT p.id, p.name, p.form_name, p.icon_url, p.type1, p.type2, p.pokedex_number
    FROM pokedex p
    WHERE p.visible = TRUE AND p.id NOT LIKE '%\\_%'
      AND p.id IN (SELECT id FROM obtainable)
      AND NOT EXISTS (
        SELECT 1 FROM caught_status cs
        WHERE cs.player_id = $1 AND cs.pokemon_id = p.id AND cs.game_id = ANY($2::int[])
      )
      AND ($3::text IS NULL OR p.id != $3)
    ORDER BY RANDOM() ^ (1.0 / (
      CASE WHEN p.id IN (SELECT id FROM active_direct)     THEN 4.0
           WHEN p.id IN (SELECT id FROM active_obtainable) THEN 2.5
           ELSE                                                  1.0 END
      + CASE WHEN NOT EXISTS (SELECT 1 FROM evolutions ev WHERE ev.from_pokemon_id = p.id)
        THEN 0.5 ELSE 0.0 END
    )) DESC
    LIMIT 1
  `, [playerId, shinyGameIds, excludeId, activeGameGroups]);

  if (!rows[0]) return null;
  const p = rows[0];
  const locs = await anyLocationsFor(p.id);
  return { pokemon: p, shinyIconUrl: (p.icon_url ?? '').replace('/normal/', '/shiny/'), locations: locs };
}

function getInProgressGame(gamesWithProgress) {
  const isHome = gg => gg === 'HOME' || gg.startsWith('HOME_');
  return gamesWithProgress
    .filter(g => !isHome(g.game_group) && g.caught > 0 && g.caught < g.dexTotal)
    .sort((a, b) => (b.caught / b.dexTotal) - (a.caught / a.dexTotal))[0] ?? null;
}

async function getSuggestions(user, gamesWithProgress, nationalTotal) {
  const playerId    = user.id;
  const userSettings = user.settings || {};
  const timezone    = userSettings?.timezone || 'UTC';
  const todayStr    = localDateStr(timezone);

  const saves = {};
  let catchResult = null;
  let shinyResult = userSettings?.shinySuggestion;

  const inProgressGame = getInProgressGame(gamesWithProgress);
  if (inProgressGame) {
    const g       = inProgressGame;
    const pokemon = await getCatchNextForGame(user, g.id, gamesWithProgress);
    if (pokemon) {
      const locations = await locationsFor(pokemon.id, g.game_group);
      catchResult = { pokemon, gameName: g.name, gameColor: g.color, gameUrl: g.dexUrl, reason: 'in_progress', locations };
    }
  }

  if (!catchResult) {
    const cached = userSettings?.catchSuggestion;
    if (cached && cached.localDate === todayStr) {
      catchResult = cached;
    } else {
      catchResult = await fetchRecommendedCatch(playerId, gamesWithProgress, nationalTotal);
      if (catchResult) saves.catchSuggestion = { ...catchResult, localDate: todayStr };
      else catchResult = null;
    }
  }

  if (!shinyResult || shinyResult.localDate !== todayStr) {
    shinyResult = await fetchShinyHunt(playerId, gamesWithProgress);
    if (shinyResult) saves.shinySuggestion = { ...shinyResult, localDate: todayStr };
    else shinyResult = null;
  }

  if (Object.keys(saves).length) await saveSuggestionPatch(playerId, saves);

  return { recommendedCatch: catchResult || null, shinyHunt: shinyResult || null };
}

// ── Routes ────────────────────────────────────────────────────────────────────

const router = express.Router();

router.post('/api/suggestion/timezone', async (req, res) => {
  const { timezone } = req.body ?? {};
  if (!timezone || typeof timezone !== 'string') return res.status(400).json({ error: 'timezone required' });
  try {
    await saveSuggestionPatch(req.user.id, { timezone });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/suggestion/reroll', async (req, res) => {
  const { excludeId } = req.body ?? {};
  try {
    const [games, caughtByGame, { dexTotals, nationalTotal }] = await Promise.all([
      fetchGames(),
      fetchCaughtByGame(req.user.id),
      getDexTotals(),
    ]);
    const gamesWithProgress = buildGamesWithProgress(games, caughtByGame, dexTotals, nationalTotal);
    const result = await fetchRecommendedCatch(req.user.id, gamesWithProgress, nationalTotal, excludeId ?? null);
    if (result) await saveSuggestionPatch(req.user.id, { catchSuggestion: { ...result, localDate: localDateStr(req.user.settings?.timezone || 'UTC') } });
    res.json({ result: result || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/suggestion/catch-next', async (req, res) => {
  const gameId = parseInt(req.query.game_id) || null;
  if (!gameId) return res.status(400).json({ error: 'game_id required' });
  try {
    const games   = await fetchGames();
    const pokemon = await getCatchNextForGame(req.user, gameId, games);
    res.json({ pokemon: pokemon || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/suggestion/catch-next/reroll', async (req, res) => {
  const gameId   = parseInt(req.body?.gameId);
  const excludeId = req.body?.excludeId ?? null;
  if (!gameId) return res.status(400).json({ error: 'gameId required' });
  try {
    const games  = await fetchGames();
    const pokemon = await getCatchNextForGame(req.user, gameId, games, { skipCache: true, excludeId });
    res.json({ pokemon: pokemon || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, getSuggestions, getCatchNextForGame, buildGamesWithProgress, clearSuggestionCaches };
