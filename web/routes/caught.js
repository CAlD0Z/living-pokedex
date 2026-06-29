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

module.exports = { router, runImportCaught };
