'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const {
  pool,
  fetchGames, fetchCaughtSet, fetchExclusiveMap, augmentWithForms,
  fetchCaughtSetForGroup, fetchExclusiveMapForGroup,
} = require('../db');
const {
  TYPE_COLORS, DLC_DEX_CONFIG, GROUP_DEX_KEY, GROUP_REGION, GROUP_LABELS,
  REGION_PARENT_GROUP, REGION_VALID_DLCS, PAIRED_GAME_GROUPS,
} = require('../constants');
const { normalizeMegaDex } = require('../utils');
const {
  homeSubTabsFor, expandShinyForms, dexTabBar,
} = require('../render');
const { getCatchNextForGame } = require('./suggestions');
const {
  loadScraperState,
  handleScraperEvents,
} = require('../scraper');

// ── Bounded FIFO cache for PokéAPI proxied data ───────────────────────────────
function boundedMap(maxSize) {
  const m = new Map();
  return {
    has: k => m.has(k),
    get: k => m.get(k),
    set(k, v) {
      if (m.size >= maxSize && !m.has(k)) m.delete(m.keys().next().value);
      m.set(k, v);
    },
  };
}
const pokemonAbilityCache = boundedMap(1500);
const abilityInfoCache    = boundedMap(500);

const router = express.Router();

// ── Scraper SSE stream ────────────────────────────────────────────────────────
router.get('/api/scraper-events', handleScraperEvents);

// ── Evolution chain ───────────────────────────────────────────────────────────
router.get('/api/evolution-chain/:pokemonId', async (req, res) => {
  const startId = req.params.pokemonId;
  try {
    const { rows: familyRows } = await pool.query(`
      WITH RECURSIVE
        ancestors AS (
          SELECT $1::text AS id
          UNION
          SELECT e.from_pokemon_id FROM evolutions e JOIN ancestors a ON e.to_pokemon_id = a.id
        ),
        family AS (
          SELECT id FROM ancestors
          UNION
          SELECT e.to_pokemon_id FROM evolutions e JOIN family f ON e.from_pokemon_id = f.id
        )
      SELECT DISTINCT id FROM family
    `, [startId]);

    const familyIds = familyRows.map(r => r.id);

    const [pokRows, evoRows] = await Promise.all([
      pool.query('SELECT id, name, form_name, icon_url, is_baby, breed_item, pokedex_number, type1, type2 FROM pokedex WHERE id = ANY($1)', [familyIds]),
      pool.query(`
        SELECT e.id, e.from_pokemon_id, e.to_pokemon_id, e.method,
               COALESCE(array_agg(ec.condition_type||':'||ec.condition_value ORDER BY ec.id)
                 FILTER (WHERE ec.id IS NOT NULL), ARRAY[]::text[]) AS conditions
        FROM evolutions e
        LEFT JOIN evolution_conditions ec ON ec.evolution_id = e.id
        WHERE e.from_pokemon_id = ANY($1)
        GROUP BY e.id, e.from_pokemon_id, e.to_pokemon_id, e.method
        ORDER BY e.to_pokemon_id
      `, [familyIds]),
    ]);

    const pokMap  = new Map(pokRows.rows.map(p => [p.id, p]));
    const childMap = new Map();
    for (const e of evoRows.rows) {
      if (!childMap.has(e.from_pokemon_id)) childMap.set(e.from_pokemon_id, []);
      childMap.get(e.from_pokemon_id).push(e);
    }

    const toIds  = new Set(evoRows.rows.map(e => e.to_pokemon_id));
    const rootId = familyIds.find(id => !toIds.has(id)) ?? startId;

    function buildTree(id, visited = new Set()) {
      if (visited.has(id)) return null;
      visited.add(id);
      const pokemon = pokMap.get(id);
      if (!pokemon) return null;
      const branches = (childMap.get(id) ?? []).map(e => {
        const target = buildTree(e.to_pokemon_id, new Set(visited));
        return target ? { method: e.method, conditions: e.conditions, target } : null;
      }).filter(Boolean);
      return { pokemon, branches };
    }

    res.json({ currentId: startId, tree: buildTree(rootId) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Pokémon abilities (proxied from PokéAPI) ──────────────────────────────────
router.get('/api/pokemon-abilities/:dexNum', async (req, res) => {
  const dexNum = parseInt(req.params.dexNum);
  if (!dexNum || dexNum < 1) return res.status(400).json({ error: 'invalid dexNum' });
  if (pokemonAbilityCache.has(dexNum)) return res.json(pokemonAbilityCache.get(dexNum));
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/pokemon/${dexNum}`, {
      headers: { 'User-Agent': 'LivingPokedex/1.0' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const abilities = data.abilities
      .map(a => ({ name: a.ability.name, isHidden: a.is_hidden, slot: a.slot }))
      .sort((a, b) => a.slot - b.slot);
    const result = { abilities };
    pokemonAbilityCache.set(dexNum, result);
    res.json(result);
  } catch { res.json({ abilities: [] }); }
});

// ── Ability description (proxied from PokéAPI) ────────────────────────────────
router.get('/api/ability-info', async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'name required' });
  if (abilityInfoCache.has(name)) return res.json(abilityInfoCache.get(name));
  try {
    const r = await fetch(`https://pokeapi.co/api/v2/ability/${encodeURIComponent(name.toLowerCase())}`, {
      headers: { 'User-Agent': 'LivingPokedex/1.0' },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const entry = data.effect_entries?.find(e => e.language.name === 'en');
    const result = {
      short_effect: entry?.short_effect?.replace(/\s+/g, ' ').trim() ?? null,
      effect:       entry?.effect?.replace(/\s+/g, ' ').trim() ?? null,
    };
    abilityInfoCache.set(name, result);
    res.json(result);
  } catch { res.json({ short_effect: null, effect: null }); }
});

// ── Pokémon stats + physical info + caught date ───────────────────────────────
router.get('/api/pokemon/:id', async (req, res) => {
  try {
    const { rows: [row] } = await pool.query(
      `SELECT hp, attack, defense, sp_attack, sp_defense, speed,
              height_m, weight_kg, genus, is_baby, breed_item
       FROM pokedex WHERE id=$1`, [req.params.id]);
    const gameId   = parseInt(req.query.game_id) || null;
    const playerId = req.user?.id || null;
    let caught_at  = null;
    if (playerId && gameId) {
      const { rows: [cs] } = await pool.query(
        'SELECT caught_at FROM caught_status WHERE player_id=$1 AND game_id=$2 AND pokemon_id=$3',
        [playerId, gameId, req.params.id]
      );
      caught_at = cs?.caught_at ?? null;
    }
    res.json({ ...(row || {}), caught_at });
  } catch { res.json({}); }
});

// ── Encounters ────────────────────────────────────────────────────────────────
router.get('/api/encounters/:pokemonId', async (req, res) => {
  try {
    const pokemonId = req.params.pokemonId;

    const [encResult, targetResult, ancestorResult, directEvoResult] = await Promise.all([
      pool.query(`
        SELECT gl.game_group, gl.name AS location_name, gl.sort_order AS loc_sort,
               g.name AS game_name, g.generation,
               e.encounter_method, e.min_level, e.max_level,
               e.encounter_rate, e.conditions
        FROM encounters e
        JOIN game_locations gl ON gl.id = e.location_id
        JOIN games g           ON g.id  = e.game_id
        WHERE e.pokemon_id = $1
        ORDER BY g.generation, gl.game_group, gl.sort_order, g.sort_order, g.name, e.encounter_method
      `, [pokemonId]),
      pool.query('SELECT is_baby, breed_item FROM pokedex WHERE id=$1', [pokemonId]),
      pool.query(`
        WITH RECURSIVE ancestors AS (
          SELECT $1::text AS id
          UNION
          SELECT e.from_pokemon_id FROM evolutions e JOIN ancestors a ON e.to_pokemon_id = a.id
        )
        SELECT id FROM ancestors WHERE id != $1
      `, [pokemonId]),
      pool.query('SELECT to_pokemon_id FROM evolutions WHERE from_pokemon_id=$1', [pokemonId]),
    ]);

    const groupMap = new Map();
    for (const row of encResult.rows) {
      if (!groupMap.has(row.game_group)) groupMap.set(row.game_group, []);
      groupMap.get(row.game_group).push({
        location_name:    row.location_name,
        game_name:        row.game_name,
        encounter_method: row.encounter_method,
        min_level:        row.min_level,
        max_level:        row.max_level,
        encounter_rate:   row.encounter_rate,
        conditions:       row.conditions,
      });
    }
    const groups = [];
    for (const [game_group, encounters] of groupMap) {
      groups.push({ game_group, label: GROUP_LABELS[game_group] ?? game_group, encounters });
    }

    const targetInfo   = targetResult.rows[0] ?? {};
    const ancestorIds  = new Set(ancestorResult.rows.map(r => r.id));
    const directEvoIds = new Set(directEvoResult.rows.map(r => r.to_pokemon_id));
    const relevantIds  = new Set(ancestorIds);
    if (targetInfo.is_baby) directEvoIds.forEach(id => relevantIds.add(id));
    const targetGameNames = new Set(encResult.rows.map(r => r.game_name));

    let family_origins = {};
    if (relevantIds.size > 0) {
      const { rows: famRows } = await pool.query(`
        SELECT e.pokemon_id, g.name AS game_name, p.name AS poke_name, p.icon_url, p.pokedex_number
        FROM encounters e
        JOIN games g ON g.id = e.game_id
        JOIN pokedex p ON p.id = e.pokemon_id
        WHERE e.pokemon_id = ANY($1)
        GROUP BY e.pokemon_id, g.name, p.name, p.icon_url, p.pokedex_number
      `, [[...relevantIds]]);

      const byName = new Map();
      for (const row of famRows) {
        if (targetGameNames.has(row.game_name)) continue;
        if (!byName.has(row.game_name)) byName.set(row.game_name, { ancestors: [], directEvos: [] });
        const bucket = byName.get(row.game_name);
        if (ancestorIds.has(row.pokemon_id)) bucket.ancestors.push(row);
        else if (directEvoIds.has(row.pokemon_id)) bucket.directEvos.push(row);
      }

      for (const [gameName, { ancestors, directEvos }] of byName) {
        if (ancestors.length > 0) {
          ancestors.sort((a, b) => b.pokedex_number - a.pokedex_number);
          const a = ancestors[0];
          family_origins[gameName] = { method: 'evolve', from: { id: a.pokemon_id, name: a.poke_name, icon_url: a.icon_url }, breed_item: null };
        } else if (targetInfo.is_baby && directEvos.length > 0) {
          const d = directEvos[0];
          family_origins[gameName] = { method: 'breed', from: { id: d.pokemon_id, name: d.poke_name, icon_url: d.icon_url }, breed_item: targetInfo.breed_item };
        }
      }
    }

    res.json({ groups, family_origins });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Location queries ──────────────────────────────────────────────────────────
router.get('/api/all-location-pokemon', async (req, res) => {
  const { game_group } = req.query;
  if (!game_group) return res.status(400).json({ error: 'game_group required' });
  try {
    const { rows } = await pool.query(`
      SELECT gl.name AS loc, e.pokemon_id AS pid
      FROM encounters e
      JOIN game_locations gl ON gl.id = e.location_id
      WHERE gl.game_group = $1
      GROUP BY gl.name, e.pokemon_id
      ORDER BY gl.name
    `, [game_group]);
    const locations = {};
    for (const { loc, pid } of rows) {
      if (!locations[loc]) locations[loc] = [];
      locations[loc].push(pid);
    }
    res.json({ locations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/locations', async (req, res) => {
  const { game_group } = req.query;
  try {
    const { rows } = game_group
      ? await pool.query(`SELECT DISTINCT name FROM game_locations WHERE game_group=$1 ORDER BY name`, [game_group])
      : await pool.query(`SELECT DISTINCT name FROM game_locations ORDER BY name`);
    res.json({ locations: rows.map(r => r.name) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/location-pokemon', async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT e.pokemon_id FROM encounters e
       JOIN game_locations gl ON gl.id = e.location_id WHERE gl.name = $1`,
      [name]
    );
    res.json({ pokemon_ids: rows.map(r => r.pokemon_id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dex grid (lightweight JSON for client-side game switching) ────────────────
router.get('/api/dex-grid', async (req, res) => {
  const playerId  = req.user?.id || null;
  const gameId    = parseInt(req.query.game_id) || null;
  const dexPath   = req.query.path || '/dex';
  const dlcParam  = req.query.dlc  || null;
  const gameGroup = (!gameId && req.query.game_group && PAIRED_GAME_GROUPS.has(req.query.game_group))
    ? req.query.game_group : null;

  try {
    const games       = await fetchGames();
    const selectedGame = gameId ? games.find(g => g.id == gameId) ?? null : null;

    let dexKey      = null;
    let effectiveGame = selectedGame;
    if (dexPath !== '/dex') {
      const regionKey  = dexPath.replace(/^\/dex\//, '');
      const parentGroup = REGION_PARENT_GROUP[regionKey] ?? null;
      const validDlcs   = REGION_VALID_DLCS[regionKey] ?? [];
      const dlcConf     = (parentGroup && dlcParam && validDlcs.includes(dlcParam)) ? DLC_DEX_CONFIG[dlcParam] : null;
      dexKey = dlcConf ? dlcConf.table.replace(/_dex$/, '') : regionKey.replace(/-/g, '_');
      if (dlcConf && effectiveGame) effectiveGame = { ...effectiveGame, game_group: dlcConf.game_group };
    }

    // ── "All versions" combined view ─────────────────────────────────────────
    if (gameGroup) {
      const [caughtSet, rowsResult, exclMap] = await Promise.all([
        fetchCaughtSetForGroup(playerId, gameGroup),
        dexKey
          ? pool.query(`
              SELECT d.regional_number, p.id AS pokemon_id, p.pokedex_number,
                     p.name, p.form_name, p.type1, p.type2, p.icon_url, p.generation, p.form_tag
              FROM dex_entries d JOIN pokedex p ON p.id = d.pokemon_id
              WHERE d.dex_key = $1 ORDER BY d.regional_number, p.id`, [dexKey])
          : pool.query(`SELECT id AS pokemon_id, pokedex_number, name, form_name, type1, type2, generation, icon_url, form_tag
              FROM pokedex WHERE visible=TRUE
              ORDER BY pokedex_number, CASE WHEN id LIKE '%\\_%' THEN split_part(id,'_',2)::int ELSE 0 END`),
        fetchExclusiveMapForGroup(gameGroup),
      ]);
      const { allRows } = await augmentWithForms(rowsResult.rows);
      const cards = allRows.map(r => {
        const num   = String(r.regional_number ?? r.pokedex_number).padStart(3, '0');
        const isForm = r._isForm ?? r.pokemon_id.includes('_');
        const icon  = r.icon_url ?? '';
        const excl  = exclMap.get(r.pokemon_id);
        return {
          id:        r.pokemon_id,
          num,
          dexNum:    r.pokedex_number,
          name:      r.name,
          formName:  r.form_name || '',
          type1:     r.type1 || '',
          type2:     r.type2 || '',
          icon,
          useShiny:  false,
          gen:       String(r.generation || ''),
          caught:    caughtSet.has(r.pokemon_id),
          isForm,
          tc:        TYPE_COLORS[r.type1] ?? '#223152',
          exclNames: excl ? excl.names.join(' or ') : '',
          exclGames: excl ? excl.games ?? [] : [],
          exclMode:  excl ? 'group' : '',
        };
      });
      const visibleCount = allRows.filter(r => !(r._isForm ?? r.pokemon_id.includes('_'))).length;
      const regionKey = dexPath.replace(/^\/dex\//, '');
      const parentGroup = REGION_PARENT_GROUP[regionKey] ?? null;
      const tabsHtml = parentGroup ? dexTabBar(parentGroup, dlcParam, null, playerId) : '';
      const groupLabel = GROUP_LABELS[gameGroup] ?? gameGroup;
      return res.json({
        cards,
        count:     visibleCount,
        gameId:    null,
        gameGroup,
        gameName:  groupLabel,
        allGroup:  gameGroup,
        path:      dexPath,
        dlc:       dlcParam,
        tabsHtml,
        catchNextId: null,
        catchNext:   null,
      });
    }

    const [caughtSet, rowsResult, exclMap] = await Promise.all([
      fetchCaughtSet(playerId, gameId),
      dexKey
        ? pool.query(`
            SELECT d.regional_number, p.id AS pokemon_id, p.pokedex_number,
                   p.name, p.form_name, p.type1, p.type2, p.icon_url, p.generation, p.form_tag
            FROM dex_entries d JOIN pokedex p ON p.id = d.pokemon_id
            WHERE d.dex_key = $1 ORDER BY d.regional_number, p.id`, [dexKey])
        : pool.query(`SELECT id AS pokemon_id, pokedex_number, name, form_name, type1, type2, generation, icon_url, form_tag
            FROM pokedex WHERE visible=TRUE
            ORDER BY pokedex_number, CASE WHEN id LIKE '%\\_%' THEN split_part(id,'_',2)::int ELSE 0 END`),
      effectiveGame ? fetchExclusiveMap(effectiveGame) : Promise.resolve(new Map()),
    ]);

    const [augmented, catchNextPokemon] = await Promise.all([
      augmentWithForms(rowsResult.rows),
      (gameId && req.user) ? getCatchNextForGame(req.user, gameId, games) : Promise.resolve(null),
    ]);
    let rows = dexKey === 'mega-evolution' ? normalizeMegaDex(augmented.allRows) : augmented.allRows;

    const useShiny = selectedGame?.name === 'Shiny Dex';
    if (useShiny && !dexKey) rows = expandShinyForms(rows);
    const cards = rows.map(r => {
      const num    = String(r.regional_number ?? r.pokedex_number).padStart(3, '0');
      const isForm = r._isForm ?? r.pokemon_id.includes('_');
      const icon   = useShiny ? (r.icon_url ?? '').replace('/normal/', '/shiny/') : (r.icon_url ?? '');
      const excl   = exclMap.get(r.pokemon_id);
      return {
        id:        r.pokemon_id,
        num,
        dexNum:    r.pokedex_number,
        name:      r.name,
        formName:  r.form_name || '',
        type1:     r.type1 || '',
        type2:     r.type2 || '',
        icon,
        useShiny,
        gen:       String(r.generation || ''),
        caught:    caughtSet.has(r.pokemon_id),
        isForm,
        tc:        TYPE_COLORS[r.type1] ?? '#223152',
        exclNames: excl ? excl.names.join(' or ') : '',
        exclGames: excl ? excl.games ?? [] : [],
        exclMode:  '',
      };
    });

    const visibleCount = rows.filter(r => !(r._isForm ?? r.pokemon_id.includes('_'))).length;

    const effGg = effectiveGame?.game_group ?? null;
    let tabsHtml = homeSubTabsFor(effGg, games, gameId, playerId);
    if (!tabsHtml && dexPath !== '/dex') {
      const regionKey  = dexPath.replace(/^\/dex\//, '');
      const parentGroup = REGION_PARENT_GROUP[regionKey] ?? null;
      if (parentGroup) tabsHtml = dexTabBar(parentGroup, dlcParam, gameId, playerId);
    }

    res.json({
      cards,
      count:     visibleCount,
      gameId,
      gameGroup: effectiveGame?.game_group ?? null,
      gameName:  effectiveGame?.name ?? null,
      allGroup:  null,
      path:      dexPath,
      dlc:       dlcParam,
      tabsHtml,
      catchNextId:  catchNextPokemon?.id ?? null,
      catchNext:    catchNextPokemon ?? null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Static / special encounters table ────────────────────────────────────────
router.get('/api/static-encounters', async (req, res) => {
  const STATIC_METHODS = ['special','unique','gift','egg','fossil','wanderer','mega-stone'];
  try {
    const { rows } = await pool.query(`
      SELECT
        gl.game_group,
        gl.name            AS location,
        e.pokemon_id,
        p.name             AS pokemon_name,
        p.pokedex_number   AS dex_num,
        p.icon_url,
        e.encounter_method,
        e.min_level,
        e.max_level,
        e.conditions,
        array_agg(g.name ORDER BY g.sort_order, g.name) AS games,
        MIN(g.generation)  AS generation,
        MIN(gl.sort_order) AS loc_sort
      FROM encounters e
      JOIN game_locations gl ON gl.id = e.location_id
      JOIN games g           ON g.id  = e.game_id
      JOIN pokedex p         ON p.id  = e.pokemon_id
      WHERE e.encounter_method = ANY($1)
      GROUP BY gl.game_group, gl.name, e.pokemon_id, p.name, p.pokedex_number,
               p.icon_url, e.encounter_method, e.min_level, e.max_level, e.conditions
      ORDER BY MIN(g.generation), gl.game_group, MIN(gl.sort_order), gl.name,
               p.pokedex_number, e.encounter_method
    `, [STATIC_METHODS]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/settings/last-dex', express.json(), async (req, res) => {
  const playerId = req.user?.id;
  if (!playerId) return res.status(401).json({ error: 'Not signed in' });
  const { gameId, path } = req.body ?? {};
  if (!gameId) return res.status(400).json({ error: 'Missing gameId' });
  try {
    const settings = { ...(req.user.settings || {}), lastDex: { gameId: Number(gameId), path: path || '/dex' } };
    await pool.query('UPDATE players SET settings=$1 WHERE id=$2', [JSON.stringify(settings), playerId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bulbapedia location map proxy ─────────────────────────────────────────────
const MAP_CACHE_DIR = path.join(__dirname, '..', 'public', 'maps', 'sv');
const MAP_GROUP_PREFIX = { SV: 'Paldea', Kita: 'Kitakami', BB: 'Unova' };

function locationSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

router.get('/api/location-map', async (req, res) => {
  const { name, group } = req.query;
  const prefix = MAP_GROUP_PREFIX[group];
  if (!name || !prefix) return res.status(400).end();

  const slug     = locationSlug(name);
  const cachePath = path.join(MAP_CACHE_DIR, slug + '.png');
  const publicUrl = `/maps/sv/${slug}.png`;

  if (fs.existsSync(cachePath)) return res.redirect(publicUrl);

  try {
    const bpFile  = `${prefix}_${name.replace(/ /g, '_')}_Map.png`;
    const apiUrl  = `https://bulbapedia.bulbagarden.net/w/api.php?action=query&titles=File:${encodeURIComponent(bpFile)}&prop=imageinfo&iiprop=url&format=json`;
    const headers = { 'User-Agent': 'LivingPokedex/1.0 (personal dex tracker)' };

    const apiData  = await fetch(apiUrl, { headers }).then(r => r.json());
    const imageUrl = Object.values(apiData.query.pages)[0]?.imageinfo?.[0]?.url;
    if (!imageUrl) return res.status(404).end();

    const imgRes = await fetch(imageUrl, { headers });
    if (!imgRes.ok) return res.status(404).end();

    fs.mkdirSync(MAP_CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, Buffer.from(await imgRes.arrayBuffer()));
    res.redirect(publicUrl);
  } catch (err) {
    console.error('[location-map]', err.message);
    res.status(500).end();
  }
});

module.exports = router;
