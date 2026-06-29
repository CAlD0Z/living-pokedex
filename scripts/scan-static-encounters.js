'use strict';

/**
 * scan-static-encounters.js
 *
 * Fetches every game_location page from Bulbapedia, checks for a
 * "Special encounters" section, parses the Pokémon found there, and
 * reports anything that has no encounter record in the DB.
 *
 * Run:
 *   DATABASE_URL=... node scripts/scan-static-encounters.js [--game-group SV] [--delay 600]
 *
 * Output:
 *   • Console log per location — how many special encounters found vs covered
 *   • A JSON report written to scripts/static-scan-report.json
 *
 * The report lists, per location, every Pokémon that appears in the
 * Bulbapedia Special Encounters section but is absent from the DB
 * encounters table. Zero-gap locations are omitted from the report.
 */

const { Pool } = require('pg');
const { fetchBulbapedia, sleep, parseSpecialEncounters } = require('./parsers/shared');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fs   = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const get  = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  return {
    gameGroup: get('--game-group') || null,
    delay:     parseInt(get('--delay') || '600', 10),
  };
}

async function buildNameToId(client) {
  const { rows } = await client.query('SELECT id, name, form_name FROM pokedex');
  const map = {};
  for (const r of rows) {
    if (r.form_name === null) {
      map[r.name] = r.id;
    } else if (!r.id.includes('_')) {
      const cur = map[r.name];
      if (!cur || cur.includes('_')) map[r.name] = r.id;
    } else if (!map[r.name] && r.id.endsWith('_1')) {
      map[r.name] = r.id;
    }
    if (r.form_name) {
      const fn = r.form_name, name = r.name;
      if (fn.toLowerCase().includes(name.toLowerCase())) {
        map[fn] = r.id;
      } else {
        map[`${name} (${fn})`] = r.id;
        map[`${fn} ${name}`]   = r.id;
      }
    }
  }
  return map;
}

async function main() {
  const { gameGroup, delay } = parseArgs();

  const client = await pool.connect();
  try {
    // Build Pokémon name→id map
    const nameToId = await buildNameToId(client);

    // Load all games keyed by group
    const { rows: allGames } = await client.query(
      'SELECT id, name, game_group FROM games ORDER BY sort_order, id'
    );
    const gamesByGroup = new Map();
    for (const g of allGames) {
      if (!gamesByGroup.has(g.game_group)) gamesByGroup.set(g.game_group, []);
      gamesByGroup.get(g.game_group).push(g);
    }

    // Load all existing encounters keyed by location_id
    const { rows: encRows } = await client.query(
      `SELECT location_id, pokemon_id, game_id FROM encounters`
    );
    const encSet = new Set(encRows.map(r => `${r.location_id}|${r.pokemon_id}|${r.game_id}`));

    // Load locations (optionally filtered by game group)
    const locQuery = gameGroup
      ? 'SELECT id, name, game_group, bulbapedia_slug FROM game_locations WHERE game_group=$1 ORDER BY sort_order, name'
      : 'SELECT id, name, game_group, bulbapedia_slug FROM game_locations ORDER BY game_group, sort_order, name';
    const { rows: locations } = await client.query(locQuery, gameGroup ? [gameGroup] : []);

    console.log(`Scanning ${locations.length} locations${gameGroup ? ` (${gameGroup})` : ' (all groups)'}…`);
    console.log(`Delay between requests: ${delay}ms\n`);

    const report   = [];   // locations with gaps
    const flagged  = [];   // (loc, pokemon_id, game_name, level) tuples for summary
    let scanned = 0, hasSection = 0, hasGaps = 0, errors = 0;

    for (const loc of locations) {
      scanned++;
      if (!loc.bulbapedia_slug) {
        process.stdout.write(`[${scanned}/${locations.length}] ${loc.game_group}/${loc.name} — no slug, skipping\n`);
        continue;
      }

      await sleep(delay);

      let html;
      try {
        html = await fetchBulbapedia(loc.bulbapedia_slug);
      } catch (err) {
        process.stdout.write(`[${scanned}/${locations.length}] ${loc.game_group}/${loc.name} — FETCH ERROR: ${err.message}\n`);
        errors++;
        continue;
      }

      const hasSpecial = /id="Special_[Ee]ncounters"/.test(html);
      if (!hasSpecial) {
        process.stdout.write(`[${scanned}/${locations.length}] ${loc.game_group}/${loc.name} — no special section\n`);
        continue;
      }

      hasSection++;

      const games   = gamesByGroup.get(loc.game_group) || [];
      const records = parseSpecialEncounters(html, games, nameToId);

      if (!records.length) {
        process.stdout.write(`[${scanned}/${locations.length}] ${loc.game_group}/${loc.name} — special section found but 0 records parsed\n`);
        continue;
      }

      // Find gaps: in Bulbapedia special section but not in DB
      const gaps = records.filter(r =>
        !encSet.has(`${loc.id}|${r.pokemon_id}|${r.game_id}`)
      );

      const gameNameById = new Map(allGames.map(g => [g.id, g.name]));

      if (gaps.length) {
        hasGaps++;
        const gapList = gaps.map(r => ({
          pokemon_id: r.pokemon_id,
          game:       gameNameById.get(r.game_id) ?? r.game_id,
          level:      r.min_level,
        }));
        report.push({
          game_group: loc.game_group,
          location:   loc.name,
          slug:       loc.bulbapedia_slug,
          total_special: records.length,
          gaps:       gapList,
        });
        flagged.push(...gaps.map(r => ({
          game_group: loc.game_group, location: loc.name,
          pokemon_id: r.pokemon_id,
          game:       gameNameById.get(r.game_id) ?? r.game_id,
          level:      r.min_level,
        })));
        process.stdout.write(
          `[${scanned}/${locations.length}] ${loc.game_group}/${loc.name} — ${records.length} special, ${gaps.length} MISSING: ${[...new Set(gaps.map(g => g.pokemon_id))].join(', ')}\n`
        );
      } else {
        process.stdout.write(
          `[${scanned}/${locations.length}] ${loc.game_group}/${loc.name} — ${records.length} special, all covered\n`
        );
      }
    }

    // Write report
    const outPath = path.join(__dirname, 'static-scan-report.json');
    fs.writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), summary: { scanned, hasSection, hasGaps, errors }, report }, null, 2));

    console.log(`\n─── Summary ───────────────────────────────────────`);
    console.log(`Scanned:            ${scanned}`);
    console.log(`Had special section:${hasSection}`);
    console.log(`Locations with gaps:${hasGaps}`);
    console.log(`Fetch errors:       ${errors}`);
    console.log(`\nReport written to: ${outPath}`);

    if (flagged.length) {
      console.log(`\n─── Missing encounters (${flagged.length} total) ───`);
      for (const f of flagged) {
        console.log(`  ${f.game_group}  ${f.location.padEnd(35)}  ${f.pokemon_id.padEnd(8)}  ${f.game}  Lv${f.level ?? '?'}`);
      }
    } else {
      console.log('\nNo gaps found — all special encounters are covered!');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
