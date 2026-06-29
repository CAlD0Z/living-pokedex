'use strict';

const express = require('express');
const { pool, fetchGames, getDexTotals } = require('../db');
const { GROUP_DEX_KEY } = require('../constants');

// Returns { gameCaught, gameTotal } for the sidebar ring live-update.
// Both are cheap: fetchGames/getDexTotals use static caches; COUNT is an index scan.
async function gameCountsFor(playerId, gameId) {
  const [games, { dexTotals, nationalTotal }, { rows: [{ count }] }] = await Promise.all([
    fetchGames(),
    getDexTotals(),
    pool.query('SELECT COUNT(*) AS count FROM caught_status WHERE player_id=$1 AND game_id=$2', [playerId, gameId]),
  ]);
  const game     = games.find(g => g.id == gameId);
  const dexKey   = game ? GROUP_DEX_KEY[game.game_group] : null;
  const gameTotal = dexKey ? (dexTotals.get(dexKey) ?? nationalTotal) : nationalTotal;
  return { gameCaught: parseInt(count), gameTotal };
}

const router = express.Router();

router.post('/api/caught/batch', async (req, res) => {
  const player_id = req.user?.id;
  const { game_id, pokemon_ids, caught } = req.body ?? {};
  if (!player_id || !game_id || !Array.isArray(pokemon_ids) || !pokemon_ids.length)
    return res.status(400).json({ error: 'Missing fields' });
  if (!Number.isInteger(Number(game_id)) || Number(game_id) <= 0)
    return res.status(400).json({ error: 'Invalid game_id' });
  if (pokemon_ids.length > 500)
    return res.status(400).json({ error: 'Too many pokemon_ids (max 500)' });
  if (!pokemon_ids.every(id => typeof id === 'string' && id.length > 0 && id.length < 20))
    return res.status(400).json({ error: 'Invalid pokemon_id format' });
  try {
    if (caught) {
      await pool.query(
        `INSERT INTO caught_status (player_id, pokemon_id, game_id)
         SELECT $1, unnest($2::text[]), $3 ON CONFLICT DO NOTHING`,
        [player_id, pokemon_ids, game_id]
      );
    } else {
      await pool.query(
        `DELETE FROM caught_status WHERE player_id=$1 AND game_id=$2 AND pokemon_id = ANY($3::text[])`,
        [player_id, game_id, pokemon_ids]
      );
    }
    const counts = await gameCountsFor(player_id, game_id);
    res.json({ ok: true, ...counts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/caught', async (req, res) => {
  const player_id = req.user?.id;
  const { game_id, pokemon_id, caught } = req.body ?? {};
  if (!player_id || !game_id || !pokemon_id) return res.status(400).json({ error: 'Missing fields' });
  if (!Number.isInteger(Number(game_id)) || Number(game_id) <= 0)
    return res.status(400).json({ error: 'Invalid game_id' });
  try {
    if (caught) {
      await pool.query(
        'INSERT INTO caught_status (player_id,pokemon_id,game_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [player_id, pokemon_id, game_id]
      );
    } else {
      await pool.query(
        'DELETE FROM caught_status WHERE player_id=$1 AND pokemon_id=$2 AND game_id=$3',
        [player_id, pokemon_id, game_id]
      );
    }
    const counts = await gameCountsFor(player_id, game_id);
    res.json({ ok: true, ...counts });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/caught/clear', async (req, res) => {
  const playerId = req.user?.id;
  if (!playerId) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { rowCount } = await pool.query('DELETE FROM caught_status WHERE player_id = $1', [playerId]);
    res.json({ ok: true, deleted: rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/export/caught', async (req, res) => {
  const playerId = req.user?.id;
  if (!playerId) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { rows } = await pool.query(`
      SELECT cs.pokemon_id, p.name, p.form_name, p.pokedex_number,
             g.name AS game_name, g.game_group,
             cs.caught_at, cs.is_shiny, cs.ball, cs.notes, cs.origin_game
      FROM caught_status cs
      JOIN pokedex p ON p.id = cs.pokemon_id
      JOIN games g   ON g.id = cs.game_id
      WHERE cs.player_id = $1
      ORDER BY cs.game_id, p.pokedex_number, cs.pokemon_id
    `, [playerId]);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="living-pokedex-${req.user.username}-export.json"`);
    res.json({ exported_at: new Date().toISOString(), player: req.user.username, count: rows.length, caught: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function runImportCaught(playerId, body) {
  if (!body || !Array.isArray(body.caught))
    return { error: 'Invalid format: expected { caught: [...] }' };

  const games = await fetchGames();
  const gameByName = new Map(games.map(g => [g.name, g.id]));

  let imported = 0, skipped = 0;
  const errors = [];
  const validRows = [];

  for (const r of body.caught) {
    const gameId = gameByName.get(r.game_name);
    if (!gameId) { errors.push(`Unknown game: "${r.game_name}"`); skipped++; continue; }
    if (!r.pokemon_id) { skipped++; continue; }
    validRows.push([
      String(r.pokemon_id), gameId,
      r.caught_at || null, !!r.is_shiny, r.ball || null, r.notes || null, r.origin_game || null,
    ]);
  }

  const BATCH = 500;
  for (let i = 0; i < validRows.length; i += BATCH) {
    const chunk = validRows.slice(i, i + BATCH);
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO caught_status (player_id, pokemon_id, game_id, caught_at, is_shiny, ball, notes, origin_game)
         SELECT $1, unnest($2::text[]), unnest($3::int[]), unnest($4::timestamptz[]),
                unnest($5::boolean[]), unnest($6::text[]), unnest($7::text[]), unnest($8::text[])
         ON CONFLICT DO NOTHING`,
        [
          playerId,
          chunk.map(r => r[0]), chunk.map(r => r[1]), chunk.map(r => r[2]),
          chunk.map(r => r[3]), chunk.map(r => r[4]), chunk.map(r => r[5]), chunk.map(r => r[6]),
        ]
      );
      imported += rowCount;
      skipped  += chunk.length - rowCount;
    } catch (e) {
      skipped += chunk.length;
      errors.push(`Batch error (rows ${i + 1}–${i + chunk.length}): ${e.message}`);
    }
  }

  return { imported, skipped, errors: errors.slice(0, 20) };
}

router.post('/api/import/caught', express.json({ limit: '20mb' }), async (req, res) => {
  const playerId = req.user?.id;
  if (!playerId) return res.status(401).json({ error: 'Not signed in' });
  const result = await runImportCaught(playerId, req.body);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Legacy format from the previous Pokédex app (living-pokedex-backup.json).
// Tab "Pokémon HOME / …" entries — HOME regional / national dexes
const LEGACY_HOME_MAP = {
  'home':                        38,
  'home-diamond':                52,
  'home-legends-arceus':         59,
  'home-lets-go-pikachu':        49,
  'home-scarlet':                62,
  'home-scarlet-indigo-disk':    61,
  'home-scarlet-teal-mask':      60,
  'home-sword':                  56,
  'home-shield':                 56,
  'home-sword-crown-tundra':     58,
  'home-shield-crown-tundra':    58,
  'home-sword-isle-of-armor':    57,
  'home-shield-isle-of-armor':   57,
  'home-violet':                 62,
  'home-violet-indigo-disk':     61,
  'home-violet-teal-mask':       60,
  'legends-za-lumiose':          63,  // HOME Lumiose regional dex
  'legends-za-hyperspace':       64,
  'legends-za-mega':             65,
};

// Tab "Games / …" (or no tab) entries — actual in-game catches
const LEGACY_GAME_MAP = {
  'legends-arceus':              35,
  'legends-za':                  48,
  'legends-za-lumiose':          48,  // in-game Lumiose area → Legends: Z-A game
  'legends-za-hyperspace':       64,
  'legends-za-mega':             65,
  'legends-za-mega-dimension':   65,
  'lets-go-eevee':               30,
  'lets-go-pikachu':             29,
  'scarlet':                     36,
  'scarlet-teal-mask':           44,
  'scarlet-indigo-disk':         45,
  'shield':                      32,
  'shield-crown-tundra':         43,
  'shield-isle-of-armor':        42,
  'shield-max-lair':             43,
  'sword':                       31,
  'sword-crown-tundra':          41,
  'sword-isle-of-armor':         40,
  'sword-max-lair':              41,
  'violet':                      37,
  'violet-teal-mask':            46,
  'violet-indigo-disk':          47,
  'y':                           22,
};

function legacyGameId(r) {
  const isHomeById = r.game_id === 'home' || r.game_id.startsWith('home-');
  const isHomeByTab = typeof r.tab === 'string' && r.tab.startsWith('Pokémon HOME');
  const isHome = isHomeByTab || isHomeById;
  return (isHome ? LEGACY_HOME_MAP : LEGACY_GAME_MAP)[r.game_id] ?? null;
}

const LEGACY_FORM_MAP = {
  // Regional forms
  'meowth-galar':               '52_2',
  'ponyta-galar':               '77_1',
  'rapidash-galar':             '78_1',
  'slowpoke-galar':             '79_1',
  'slowbro-galar':              '80_2',
  'farfetchd-galar':            '83_1',
  'weezing-galar':              '110_1',
  'mr-mime-galar':              '122_1',
  'tauros-paldea-combat-breed': '128_1',
  'articuno-galar':             '144_1',
  'zapdos-galar':               '145_1',
  'moltres-galar':              '146_1',
  'wooper-paldea':              '194_1',
  'slowking-galar':             '199_1',
  'corsola-galar':              '222_1',
  'zigzagoon-galar':            '263_1',
  'linoone-galar':              '264_1',
  'darumaka-galar':             '554_1',
  'darmanitan-galar-standard':  '555_2',
  'yamask-galar':               '562_1',
  'stunfisk-galar':             '618_1',
  'keldeo-ordinary':            '647',
  // Mega evolutions
  'venusaur-mega':              '3_1',
  'charizard-mega-x':           '6_1',
  'charizard-mega-y':           '6_2',
  'blastoise-mega':             '9_1',
  'beedrill-mega':              '15_1',
  'pidgeot-mega':               '18_1',
  'raichu-mega-x':              '26_2',
  'raichu-mega-y':              '26_3',
  'clefable-mega':              '36_1',
  'slowbro-mega':               '80_1',
  'gengar-mega':                '94_1',
  'kangaskhan-mega':            '115_1',
  'starmie-mega':               '121_1',
  'pinsir-mega':                '127_1',
  'gyarados-mega':              '130_1',
  'aerodactyl-mega':            '142_1',
  'dragonite-mega':             '149_1',
  'mewtwo-mega-x':              '150_1',
  'mewtwo-mega-y':              '150_2',
  'meganium-mega':              '154_1',
  'feraligatr-mega':            '160_1',
  'ampharos-mega':              '181_1',
  'steelix-mega':               '208_1',
  'scizor-mega':                '212_1',
  'heracross-mega':             '214_1',
  'skarmory-mega':              '227_1',
  'houndoom-mega':              '229_1',
  'tyranitar-mega':             '248_1',
  'sceptile-mega':              '254_1',
  'blaziken-mega':              '257_1',
  'swampert-mega':              '260_1',
  'gardevoir-mega':             '282_1',
  'sableye-mega':               '302_1',
  'mawile-mega':                '303_1',
  'aggron-mega':                '306_1',
  'medicham-mega':              '308_1',
  'manectric-mega':             '310_1',
  'sharpedo-mega':              '319_1',
  'camerupt-mega':              '323_1',
  'altaria-mega':               '334_1',
  'banette-mega':               '354_1',
  'chimecho-mega':              '358_1',
  'absol-mega':                 '359_1',
  'glalie-mega':                '362_1',
  'latias-mega':                '380_1',
  'latios-mega':                '381_1',
  'salamence-mega':             '373_1',
  'metagross-mega':             '376_1',
  'rayquaza-mega':              '384_1',
  'staraptor-mega':             '398_1',
  'lopunny-mega':               '428_1',
  'garchomp-mega':              '445_1',
  'lucario-mega':               '448_1',
  'abomasnow-mega':             '460_1',
  'gallade-mega':               '475_1',
  'froslass-mega':              '478_1',
  'heatran-mega':               '485_1',
  'darkrai-mega':               '491_1',
  'audino-mega':                '531_1',
  'scolipede-mega':             '545_1',
  'scrafty-mega':               '560_1',
  'alakazam-mega':              '65_1',
  'victreebel-mega':            '71_1',
  'emboar-mega':                '500_1',
  'excadrill-mega':             '530_1',
  'eelektross-mega':            '604_1',
  'chandelure-mega':            '609_1',
  'golurk-mega':                '623_1',
  'chesnaught-mega':            '652_1',
  'delphox-mega':               '655_1',
  'greninja-mega':              '658_2',
  'pyroar-mega':                '668_1',
  'floette-mega':               '670_1',
  'meowstic-mega':              '678_2',
  'malamar-mega':               '687_1',
  'barbaracle-mega':            '689_1',
  'dragalge-mega':              '691_1',
  'hawlucha-mega':              '701_1',
  'diancie-mega':               '719_1',
  'zygarde-mega':               '718_3',
  'crabominable-mega':          '740_1',
  'golisopod-mega':             '768_1',
  'drampa-mega':                '780_1',
  'magearna-mega':              '801_1',
  'zeraora-mega':               '807_1',
  'falinks-mega':               '870_1',
  'scovillain-mega':            '952_1',
  'glimmora-mega':              '970_1',
  'tatsugiri-mega':             '978_3',
  'baxcalibur-mega':            '998_1',
};

async function runImportLegacy(playerId, body) {
  if (!Array.isArray(body))
    return { error: 'Invalid format: expected a top-level array' };

  const SHINY_DEX_GAME_ID = 39;
  let imported = 0, shinyImported = 0, skipped = 0;

  // Pre-resolve all (pokemonId, gameIdInt) pairs so we can snapshot the DB once
  const pairs = body.map(r => {
    const isShiny = !!r.shiny;
    return {
      pokemonId: r.form_name ? (LEGACY_FORM_MAP[r.form_name] ?? String(r.pokemon_id)) : String(r.pokemon_id),
      gameIdInt: isShiny ? SHINY_DEX_GAME_ID : legacyGameId(r),
      isShiny,
    };
  });

  // Snapshot: which (pokemon, game) combos already exist before this import?
  const preExistingMap = {};
  const validPairs = pairs.filter(p => p.gameIdInt != null);
  if (validPairs.length) {
    const pids = [...new Set(validPairs.map(p => p.pokemonId))];
    const gids = [...new Set(validPairs.map(p => p.gameIdInt))];
    const { rows } = await pool.query(
      `SELECT pokemon_id, game_id, caught_at, is_shiny, ball, notes
       FROM caught_status WHERE player_id=$1 AND pokemon_id=ANY($2) AND game_id=ANY($3)`,
      [playerId, pids, gids]
    );
    for (const row of rows) preExistingMap[`${row.pokemon_id}:${row.game_id}`] = row;
  }

  const log = [];
  // Tracks the raw data of the first entry inserted for each (pokemonId:gameIdInt) key this run
  const insertedThisRun = new Map();

  for (let i = 0; i < body.length; i++) {
    const r = body[i];
    const { pokemonId, gameIdInt, isShiny } = pairs[i];
    const raw = { ...r, shiny: isShiny };

    if (!isShiny && legacyGameId(r) == null) {
      skipped++;
      log.push({ a: 'skip', pokemonId, g: r.game_id, gameIdInt: null, raw });
      continue;
    }

    const key = `${pokemonId}:${gameIdInt}`;

    try {
      const { rowCount } = await pool.query(
        `INSERT INTO caught_status (player_id, pokemon_id, game_id, caught_at, is_shiny, notes)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [playerId, pokemonId, gameIdInt, r.caught_at || null, isShiny, r.notes || null]
      );
      if (rowCount > 0) {
        isShiny ? shinyImported++ : imported++;
        insertedThisRun.set(key, raw);
        log.push({ a: isShiny ? 'shiny' : 'ok', pokemonId, g: r.game_id, gameIdInt, raw });
      } else {
        skipped++;
        // prevRaw: an earlier entry in this same backup that already claimed this slot
        // existing: a record that was in the DB before this import started
        log.push({
          a: 'dup', pokemonId, g: r.game_id, gameIdInt, raw,
          prevRaw:  insertedThisRun.get(key) || null,
          existing: preExistingMap[key] || null,
        });
      }
    } catch (e) {
      skipped++;
      log.push({ a: 'err', pokemonId, g: r.game_id, gameIdInt, raw, errMsg: e.message });
    }
  }

  // Bulk-enrich log entries with pokedex info (name, sprite, types)
  const allIds = [...new Set(log.map(e => e.pokemonId).filter(Boolean))];
  if (allIds.length) {
    const { rows } = await pool.query(
      `SELECT id, name, form_name AS form, icon_url AS icon, type1, type2, pokedex_number AS num
       FROM pokedex WHERE id = ANY($1)`,
      [allIds]
    );
    const pkMap = Object.fromEntries(rows.map(r => [r.id, r]));
    for (const e of log) {
      const pk = e.pokemonId && pkMap[e.pokemonId];
      if (pk) { e.name = pk.name; e.form = pk.form; e.icon = pk.icon; e.type1 = pk.type1; e.type2 = pk.type2; e.num = pk.num; }
    }
  }

  // Fetch existing caught records for duplicate entries (for comparison display)
  const dups = log.filter(e => e.a === 'dup' && e.gameIdInt);
  if (dups.length) {
    const pids = dups.map(e => e.pokemonId);
    const gids = dups.map(e => e.gameIdInt);
    const { rows } = await pool.query(
      `SELECT pokemon_id, game_id, caught_at, is_shiny, ball, notes
       FROM caught_status
       WHERE player_id = $1 AND pokemon_id = ANY($2) AND game_id = ANY($3)`,
      [playerId, pids, gids]
    );
    const existMap = Object.fromEntries(rows.map(r => [`${r.pokemon_id}:${r.game_id}`, r]));
    for (const e of dups) e.existing = existMap[`${e.pokemonId}:${e.gameIdInt}`] || null;
  }

  return { imported, shinyImported, skipped, log };
}

router.post('/api/import/caught/legacy', express.json({ limit: '20mb' }), async (req, res) => {
  const playerId = req.user?.id;
  if (!playerId) return res.status(401).json({ error: 'Not signed in' });
  const result = await runImportLegacy(playerId, req.body);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

module.exports = { router, runImportCaught, runImportLegacy };
