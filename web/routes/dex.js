'use strict';

const express = require('express');
const {
  pool,
  fetchGames, fetchCaughtSet, fetchCaughtByGame, fetchLastCaughtByGame, getDexTotals,
  augmentWithForms, fetchExclusiveMap, fetchExclusiveMapForGroup,
  fetchCaughtSetForGroup, fetchBonusEncounters, fetchEncounterSet,
} = require('../db');
const {
  esc, sidebar, homeTabBar, renderGrid, page,
  homeSubTabsFor, expandShinyForms, dexTabBar,
} = require('../render');
const {
  REGIONS, DLC_REGIONS, DLC_DEX_CONFIG, GAME_COLORS, GROUP_REGION,
  HOME_SHINY_DEXES, GROUP_DEX_KEY, DLC_GROUPS, DISPLAY_GROUP,
  REGION_PARENT_GROUP, REGION_VALID_DLCS, PAIRED_GAME_GROUPS, GROUP_LABELS,
  HOME_SUBGROUP_GAME_GROUP,
} = require('../constants');
const { normalizeMegaDex } = require('../utils');
const { getCatchNextForGame } = require('./suggestions');

async function fetchRecentlyCaught(limit = 20) {
  const { rows } = await pool.query(`
    WITH individual AS (
      SELECT cs.caught_at,
             p.id AS pokemon_id, p.name, p.form_name,
             p.icon_url, p.type1, p.pokedex_number,
             pl.id AS player_id, pl.username, pl.display_name,
             g.id AS game_id, g.name AS game_name,
             ROW_NUMBER() OVER (ORDER BY cs.caught_at DESC) AS rn
      FROM caught_status cs
      JOIN pokedex p  ON p.id  = cs.pokemon_id
      JOIN players pl ON pl.id = cs.player_id
      JOIN games g    ON g.id  = cs.game_id
      WHERE p.id NOT LIKE '%\\_%'
        AND g.name != 'Shiny Dex'
    )
    SELECT MAX(caught_at) AS caught_at,
           pokemon_id, name, form_name, icon_url, type1, pokedex_number, username, display_name,
           array_agg(game_name ORDER BY caught_at DESC) AS game_names,
           (array_agg(game_id ORDER BY caught_at DESC))[1] AS game_id
    FROM individual
    WHERE rn <= $1
    GROUP BY pokemon_id, name, form_name, icon_url, type1, pokedex_number, player_id, username, display_name
    ORDER BY MAX(caught_at) DESC
  `, [limit]);
  return rows;
}

async function fetchRecentlyShinyCaught(limit = 20) {
  const { rows } = await pool.query(`
    SELECT cs.caught_at, p.id AS pokemon_id, p.name, p.form_name,
           p.icon_url, p.type1, p.pokedex_number, pl.username, pl.display_name, g.id AS game_id, g.name AS game_name
    FROM caught_status cs
    JOIN pokedex p  ON p.id  = cs.pokemon_id
    JOIN players pl ON pl.id = cs.player_id
    JOIN games g    ON g.id  = cs.game_id
    WHERE p.id NOT LIKE '%\\_%'
      AND g.name = 'Shiny Dex'
    ORDER BY cs.caught_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

const router = express.Router();

// ── National dex ──────────────────────────────────────────────────────────────
router.get('/dex', async (req, res) => {
  try {
    const playerId  = req.user?.id || null;
    const gameId    = parseInt(req.query.game_id) || null;

    if (!gameId && playerId) {
      const games = await fetchGames();
      const lastDex = req.user?.settings?.lastDex;
      if (lastDex?.gameId) {
        const game = games.find(g => g.id === lastDex.gameId);
        if (game) {
          const path = (lastDex.path || '/dex').replace(/[^a-z0-9/_\-]/gi, '');
          return res.redirect(302, `${path}?game_id=${game.id}`);
        }
      }
      const livingDex = games.find(g => g.game_group === 'HOME' && g.name !== 'Shiny Dex');
      if (livingDex) return res.redirect(302, `/dex?game_id=${livingDex.id}`);
    }
    const [games, caughtSet, { rows: baseRows }, caughtByGame, { dexTotals, nationalTotal }] = await Promise.all([
      fetchGames(),
      fetchCaughtSet(playerId, gameId),
      pool.query(`
        SELECT id AS pokemon_id, pokedex_number, name, form_name, type1, type2, generation, icon_url, form_tag
        FROM pokedex WHERE visible=TRUE
        ORDER BY pokedex_number,
                 CASE WHEN id LIKE '%\\_%' THEN split_part(id,'_',2)::int ELSE 0 END
      `),
      fetchCaughtByGame(playerId),
      getDexTotals(),
    ]);
    const selectedGame = gameId ? games.find(g => g.id == gameId) ?? null : null;
    const useShiny     = selectedGame?.name === 'Shiny Dex';
    const homeGames    = games.filter(g => g.game_group === 'HOME');
    const gg           = selectedGame?.game_group ?? null;
    const tabsHtml     = gg === 'HOME'
      ? homeTabBar(homeGames, gameId, playerId)
      : homeSubTabsFor(gg, games, gameId, playerId);
    let [{ allRows, visibleTotal }, catchNext] = await Promise.all([
      augmentWithForms(baseRows),
      (gameId && req.user && selectedGame) ? getCatchNextForGame(req.user, gameId, games) : Promise.resolve(null),
    ]);
    if (useShiny) {
      allRows = expandShinyForms(allRows);
      visibleTotal = allRows.filter(r => !r._isForm).length;
    }
    const caughtCount = allRows.filter(r => !r._isForm && caughtSet.has(r.pokemon_id)).length;
    const grid = renderGrid(allRows, caughtSet, useShiny, new Map(), catchNext?.id ?? null);
    res.send(page(
      selectedGame ? `${selectedGame.name} Pokédex` : 'National Pokédex',
      grid, visibleTotal, req.user, gameId, caughtCount,
      sidebar(games, gameId, caughtByGame, dexTotals, nationalTotal),
      selectedGame, tabsHtml, catchNext, games
    ));
  } catch (err) { res.status(500).send(esc(err.message)); }
});

// ── Shared regional/DLC dex page renderer ────────────────────────────────────
const DLC_SIDE = { Sword: 'SW', Shield: 'SH', Scarlet: 'S', Violet: 'V' };

async function renderDexPage(req, res, { dexKey, dexLabel, dlcGameGroup, overrideGameGroup, parentGroup, dlcParam }) {
  try {
    const playerId  = req.user?.id || null;
    const gameId    = parseInt(req.query.game_id) || null;
    const gameGroup = (!gameId && req.query.game_group && PAIRED_GAME_GROUPS.has(req.query.game_group))
      ? req.query.game_group : null;

    // Auto-default to "All versions" for paired game group regions when no game is chosen.
    // e.g. /dex/paldea → /dex/paldea?game_group=SV
    if (!gameId && !gameGroup) {
      const defaultGroup = Object.entries(GROUP_REGION).find(([grp, path]) =>
        path === req.path &&
        PAIRED_GAME_GROUPS.has(grp) &&
        !grp.startsWith('HOME_') &&
        !DLC_GROUPS.has(grp)
      )?.[0] ?? null;
      if (defaultGroup) return res.redirect(302, `${req.path}?game_group=${defaultGroup}`);
    }

    const games    = await fetchGames();
    const baseGame = gameId ? games.find(g => g.id == gameId) ?? null : null;

    // ── "All versions" combined view ─────────────────────────────────────────
    if (gameGroup) {
      const [caughtSet, { rows: baseRows }, caughtByGame, { dexTotals, nationalTotal }, exclMap] = await Promise.all([
        fetchCaughtSetForGroup(playerId, gameGroup),
        pool.query(`
          SELECT d.regional_number, p.id AS pokemon_id, p.pokedex_number,
                 p.name, p.form_name, p.type1, p.type2, p.icon_url, p.form_tag
          FROM dex_entries d JOIN pokedex p ON p.id = d.pokemon_id
          WHERE d.dex_key = $1 ORDER BY d.regional_number, d.pokemon_id
        `, [dexKey]),
        fetchCaughtByGame(playerId),
        getDexTotals(),
        fetchExclusiveMapForGroup(gameGroup),
      ]);
      const { allRows, visibleTotal } = await augmentWithForms(baseRows);
      const caughtCount = allRows.filter(r => !r._isForm && caughtSet.has(r.pokemon_id)).length;
      const tabsHtml = parentGroup ? dexTabBar(parentGroup, dlcParam, null, playerId) : '';
      const groupLabel = GROUP_LABELS[gameGroup] ?? gameGroup;
      res.send(page(
        `${groupLabel} Pokédex`,
        renderGrid(allRows, caughtSet, false, exclMap, null, null, true),
        visibleTotal, req.user, null, caughtCount,
        sidebar(games, null, caughtByGame, dexTotals, nationalTotal, gameGroup),
        null, tabsHtml, null, games, gameGroup
      ));
      return;
    }

    let catchGameId = gameId;
    if (dlcGameGroup && baseGame) {
      const side    = DLC_SIDE[baseGame.name];
      const dlcGame = side && games.find(g => g.game_group === dlcGameGroup && g.name.startsWith(side + ' -'));
      if (dlcGame) catchGameId = dlcGame.id;
    }

    const [caughtSet, { rows: baseRows }, caughtByGame, { dexTotals, nationalTotal }] = await Promise.all([
      fetchCaughtSet(playerId, catchGameId),
      pool.query(`
        SELECT d.regional_number, p.id AS pokemon_id, p.pokedex_number,
               p.name, p.form_name, p.type1, p.type2, p.icon_url, p.form_tag
        FROM dex_entries d JOIN pokedex p ON p.id = d.pokemon_id
        WHERE d.dex_key = $1 ORDER BY d.regional_number, d.pokemon_id
      `, [dexKey]),
      fetchCaughtByGame(playerId),
      getDexTotals(),
    ]);

    let selectedGame = baseGame;
    if (overrideGameGroup && selectedGame) selectedGame = { ...selectedGame, game_group: overrideGameGroup };

    const [{ allRows: rawRows, visibleTotal }, exclMap, catchNext, encSet] = await Promise.all([
      augmentWithForms(baseRows),
      selectedGame ? fetchExclusiveMap(selectedGame) : Promise.resolve(new Map()),
      (catchGameId && req.user && selectedGame) ? getCatchNextForGame(req.user, catchGameId, games) : Promise.resolve(null),
      selectedGame ? fetchEncounterSet(selectedGame.game_group, baseGame?.game_group) : Promise.resolve(null),
    ]);
    // For the Mega Evolution dex, promote Mega-form cards to visible and hide
    // the base-form card when a Mega variant exists in the augmented set.
    const allRows = dexKey === 'mega-evolution' ? normalizeMegaDex(rawRows) : rawRows;

    const caughtCount = allRows.filter(r => !r._isForm && caughtSet.has(r.pokemon_id)).length;
    const gg          = selectedGame?.game_group ?? null;
    const tabsHtml    = homeSubTabsFor(gg, games, gameId, playerId)
                        || (parentGroup ? dexTabBar(parentGroup, dlcParam, gameId, playerId) : '');

    let gridRows = allRows;
    if (selectedGame && GROUP_DEX_KEY[selectedGame.game_group] === dexKey) {
      const bonusRows = await fetchBonusEncounters(selectedGame.game_group, dexKey);
      if (bonusRows.length) {
        gridRows = [...allRows, { _isDivider: true, label: `Not in ${dexLabel} Pokédex` }, ...bonusRows];
      }
    }

    // For HOME_X games, highlight the paired real game's "All versions" button in the sidebar
    // so the user can see which game's location/encounter data is being used.
    const homeRealGroup = HOME_SUBGROUP_GAME_GROUP[selectedGame?.game_group] ?? null;
    const sidebarActiveGroup = (homeRealGroup && PAIRED_GAME_GROUPS.has(homeRealGroup)) ? homeRealGroup : null;

    res.send(page(
      selectedGame ? `${selectedGame.name} Pokédex` : `${dexLabel} Pokédex`,
      renderGrid(gridRows, caughtSet, false, exclMap, catchNext?.id ?? null, encSet),
      visibleTotal, req.user, catchGameId, caughtCount,
      sidebar(games, gameId, caughtByGame, dexTotals, nationalTotal, sidebarActiveGroup),
      selectedGame, tabsHtml, catchNext, games
    ));
  } catch (err) { res.status(500).send(esc(err.message)); }
}

// ── Regional dexes ────────────────────────────────────────────────────────────
for (const { key, label } of REGIONS) {
  router.get(`/dex/${key}`, (req, res) => {
    const parentGroup = REGION_PARENT_GROUP[key] ?? null;
    const validDlcs   = REGION_VALID_DLCS[key] ?? [];
    const dlcParam    = (parentGroup && req.query.dlc && validDlcs.includes(req.query.dlc))
                        ? req.query.dlc : null;
    const dlcConf     = dlcParam ? DLC_DEX_CONFIG[dlcParam] : null;
    return renderDexPage(req, res, {
      dexKey:            (dlcConf ? dlcConf.table : `${key}_dex`).replace(/_dex$/, ''),
      dexLabel:          dlcConf ? dlcConf.label : label,
      dlcGameGroup:      dlcConf?.game_group ?? null,
      overrideGameGroup: dlcConf?.game_group ?? null,
      parentGroup,
      dlcParam,
    });
  });
}

// ── Legacy DLC routes (kept for bookmark compatibility) ───────────────────────
for (const { key, table, label, game_group: dlcGameGroup } of DLC_REGIONS) {
  router.get(`/dex/${key}`, (req, res) =>
    renderDexPage(req, res, {
      dexKey:            table.replace(/_dex$/, ''),
      dexLabel:          label,
      dlcGameGroup,
      overrideGameGroup: null,
      parentGroup:       null,
      dlcParam:          null,
    })
  );
}

module.exports = { router, fetchRecentlyCaught, fetchRecentlyShinyCaught };
