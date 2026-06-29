'use strict';

const { Pool } = require('pg');
const { fetchBulbapedia, sleep, scrapeCategory, SPECIAL_SECTION_IDS } = require('./parsers/shared');
const { GROUP_TO_CATEGORY, DLC_LOCATIONS } = require('./location-data');

// Optional live progress reporting to the web UI.
// Set SCRAPER_REPORT_URL=http://localhost:3000 (and optionally SCRAPER_TOKEN)
// to stream per-location updates to the admin scraper dashboard.
const REPORT_URL = process.env.SCRAPER_REPORT_URL || null;
const REPORT_TOKEN = process.env.SCRAPER_TOKEN || '';

async function reportProgress(gameGroup, data) {
  if (!REPORT_URL) return;
  try {
    await fetch(`${REPORT_URL}/api/scraper/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(REPORT_TOKEN ? { Authorization: `Bearer ${REPORT_TOKEN}` } : {}),
      },
      body: JSON.stringify({ gameGroup, ...data }),
    });
  } catch (_) {} // never let reporting errors abort the scraper
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Register parsers here as new game groups are implemented.
const PARSERS = {
  RBY:  require('./parsers/rby'),
  FRLG: require('./parsers/frlg'),
  GSC:  require('./parsers/gsc'),
  RSE:  require('./parsers/rse'),
  DPPT: require('./parsers/dppt'),
  HGSS: require('./parsers/hgss'),
  BW:   require('./parsers/bw'),
  BW2:  require('./parsers/bw2'),
  XY:   require('./parsers/xy'),
  ORAS: require('./parsers/oras'),
  SM:   require('./parsers/sm'),
  USUM: require('./parsers/usum'),
  LGPE: require('./parsers/lgpe'),
  SwSh: require('./parsers/swsh'),
  IoA:  require('./parsers/ioa'),
  CT:   require('./parsers/ct'),
  BDSP: require('./parsers/bdsp'),
  PLA:  require('./parsers/pla'),
  LZA:  require('./parsers/lza'),
  SV:   require('./parsers/sv'),
  Kita: require('./parsers/kita'),
  BB:   require('./parsers/bb'),
};

function computeSortOrder(name, idx) {
  const m = name.match(/^Route\s+(\d+)/i);
  return m ? parseInt(m[1], 10) : 1000 + idx;
}

// Human-readable label for a Bulbapedia category slug.
// e.g. "Red,_Blue_and_Yellow_locations" → "Red, Blue and Yellow"
//      "Let%27s_Go,_Pikachu!_and_Let%27s_Go,_Eevee!_locations" → "Let's Go, Pikachu! and Let's Go, Eevee!"
//      "Isle_of_Armor" → "Isle of Armor"
function categoryLabel(cat) {
  try { cat = decodeURIComponent(cat); } catch (_) {}
  return cat.replace(/_/g, ' ').replace(/\s*locations\s*$/i, '').trim();
}

async function seedLocationsForGroup(client, gameGroup) {
  const cats = GROUP_TO_CATEGORY[gameGroup];
  const dlc  = DLC_LOCATIONS[gameGroup];

  let locs = [];
  if (dlc) {
    locs = dlc;
    console.log(`hardcoded list — ${locs.length} locations`);
  } else if (cats) {
    for (const cat of cats) {
      const found = await scrapeCategory(cat);
      console.log(`${categoryLabel(cat)} — ${found.length} found`);
      locs.push(...found);
      await sleep(600);
    }
    const seen = new Set();
    locs = locs.filter(({ slug }) => seen.has(slug) ? false : seen.add(slug));
  } else {
    console.warn(`no category or hardcoded list for ${gameGroup} — skipping`);
    return;
  }

  const { rowCount: cleared } = await client.query(
    'DELETE FROM game_locations WHERE game_group = $1', [gameGroup]
  );
  for (let idx = 0; idx < locs.length; idx++) {
    const { slug, title } = locs[idx];
    await client.query(
      `INSERT INTO game_locations (name, game_group, bulbapedia_slug, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [title, gameGroup, slug, computeSortOrder(title, idx)]
    );
  }
  console.log(`${locs.length} seeded${cleared ? ` (replaced ${cleared})` : ''}`);
}

async function buildNameToId(client) {
  const { rows } = await client.query('SELECT id, name, form_name FROM pokedex');
  const map = {};
  for (const r of rows) {
    if (r.form_name === null) {
      // Canonical base form — always wins, overwriting any earlier fallback.
      map[r.name] = r.id;
    } else if (!r.id.includes('_')) {
      // Base form with a labeled form_name (e.g. Terapagos "Normal Form", Deoxys "Normal Forme").
      // Should be preferred over the _1 fallback, but yields to any null-form_name entry.
      const cur = map[r.name];
      if (!cur || cur.includes('_')) map[r.name] = r.id;
    } else if (!map[r.name] && r.id.endsWith('_1')) {
      map[r.name] = r.id;
    }
    // Add form-qualified name keys so regional/variant forms can be resolved from
    // Bulbapedia sprite alt text (e.g. "Paldean Wooper", "Alolan Rattata").
    if (r.form_name) {
      const fn = r.form_name;
      const name = r.name;
      if (fn.toLowerCase().includes(name.toLowerCase())) {
        // form_name already contains the species name → use it directly
        // e.g. "Alolan Rattata", "Galarian Meowth", "Paldean Wooper"
        map[fn] = r.id;
      } else {
        // form_name is a variant descriptor without the species name
        // e.g. "Combat Breed" for Tauros → add "{name} ({form_name})" and "{form_name} {name}"
        map[`${name} (${fn})`] = r.id;
        map[`${fn} ${name}`]   = r.id;
      }
    }
  }
  return map;
}

async function insertEncounters(client, locationId, records) {
  let inserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await client.query(
        `INSERT INTO encounters
           (location_id, pokemon_id, game_id, encounter_method, min_level, max_level, encounter_rate, conditions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (location_id, pokemon_id, game_id, encounter_method, conditions) DO NOTHING`,
        [locationId, r.pokemon_id, r.game_id, r.encounter_method,
         r.min_level, r.max_level, r.encounter_rate, JSON.stringify(r.conditions)]
      );
      inserted++;
    } catch (err) {
      console.warn(`    Insert failed: ${err.message}`);
      skipped++;
    }
  }
  return { inserted, skipped };
}

function printDryRun(locationName, records) {
  if (!records.length) {
    console.log(`(no encounters parsed)`);
    return;
  }
  console.log(`${records.length} records:`);
  for (const r of records) {
    const lvl = r.min_level === r.max_level
      ? `Lv${r.min_level}`
      : `Lv${r.min_level}-${r.max_level}`;
    const rate = r.encounter_rate != null ? `${r.encounter_rate}%` : '?%';
    const cond = Object.keys(r.conditions).length
      ? ' ' + JSON.stringify(r.conditions)
      : '';
    console.log(`  ${r.pokemon_id.padEnd(20)} game:${r.game_id} ${r.encounter_method.padEnd(12)} ${lvl.padEnd(10)} ${rate}${cond}`);
  }
}

// Fetch, parse, and optionally insert+update one location. Throws on any error.
// delay    — pre-fetch sleep ms (retries use a longer backoff)
// dlcDetector(html) — optional; for SwSh returns { group, games, parser } for IoA/CT
//                     locations so they are stored under the right game_group without
//                     needing a separate scraper run.
async function scrapeLocation(client, loc, parser, games, nameToId, dryRun, delay = 500, dlcDetector = null) {
  await sleep(delay);
  const html = await fetchBulbapedia(loc.bulbapedia_slug);

  let activeParser = parser;
  let activeGames  = games;
  if (dlcDetector) {
    const dlc = dlcDetector(html);
    if (dlc) {
      activeParser = dlc.parser;
      activeGames  = dlc.games;
      if (!dryRun) {
        await client.query('UPDATE game_locations SET game_group=$1 WHERE id=$2', [dlc.group, loc.id]);
      }
    }
  }

  const parserWarnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => parserWarnings.push(args.map(String).join(' '));
  let records;
  try { records = activeParser(html, loc.name, activeGames, nameToId); }
  finally { console.warn = origWarn; }

  const hasStatic = SPECIAL_SECTION_IDS.some(id => html.includes(id));
  const relevantWarnings = parserWarnings.filter(w =>
    records.length === 0 || !/^no\b/i.test(w.trim())
  );
  const warnNote = relevantWarnings.length
    ? ' — ' + relevantWarnings[0]
        .replace(/^\s*\[parser\]\s*/i, '')
        .replace(/\s+in\s+"[^"]*"\s*$/i, '')
        .trim()
        .toLowerCase()
      + (relevantWarnings.length > 1 ? ` (+${relevantWarnings.length - 1} more)` : '')
    : '';

  if (!dryRun) {
    const { inserted, skipped } = await insertEncounters(client, loc.id, records);
    await client.query(
      'UPDATE game_locations SET has_wild_data=$1, has_static_data=$2 WHERE id=$3',
      [records.length > 0, hasStatic, loc.id]
    );
    return { inserted, skipped, records, hasStatic, warnNote };
  }
  return { inserted: 0, skipped: 0, records, hasStatic, warnNote };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
  return {
    gameGroup:    get('--game-group'),
    locationName: get('--location'),
    dryRun:       args.includes('--dry-run'),
    skipEmpty:    args.includes('--skip-empty'), // skip locations tagged has_wild_data=FALSE
  };
}

async function main() {
  const { gameGroup, locationName, dryRun, skipEmpty } = parseArgs();

  if (!gameGroup) {
    console.error('Usage: node seed-encounters.js --game-group <GROUP> [--location "Name"] [--dry-run] [--skip-empty]');
    console.error('  --skip-empty  Skip locations tagged has_wild_data=FALSE from a prior run (faster re-runs)');
    console.error('  Available:', Object.keys(PARSERS).join(', '));
    process.exit(1);
  }

  const parser = PARSERS[gameGroup];
  if (!parser) {
    console.error(`No parser implemented for game group: ${gameGroup}`);
    console.error('Available:', Object.keys(PARSERS).join(', '));
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Load games first — needed for the encounter scraper regardless of mode.
    const { rows: games } = await client.query(
      'SELECT id, name, game_group FROM games WHERE game_group = $1 ORDER BY sort_order, id', [gameGroup]);

    if (!games.length) {
      console.error(`No games found for game_group=${gameGroup}. Run migrations and seed games first.`);
      process.exit(1);
    }

    // SwSh and SV fold their DLC locations into the same Bulbapedia category as
    // the base-game locations. Pre-load each DLC game set and build a detector so
    // the main loop can read each location's infobox and store it under the right
    // game_group with the right game IDs, without separate DLC scraper runs.
    const DLC_GROUP_CONFIG = {
      SwSh: { dlcGroups: ['IoA', 'CT'],  detect: h => PARSERS.SwSh.detectSwShDlc(h) },
      SV:   { dlcGroups: ['Kita', 'BB'], detect: h => PARSERS.SV.detectSVDlc(h)     },
    };
    const dlcConfig  = DLC_GROUP_CONFIG[gameGroup] || null;
    let dlcDetector  = null;
    let dlcGameIds   = [];
    if (dlcConfig) {
      const results = await Promise.all(
        dlcConfig.dlcGroups.map(g =>
          client.query('SELECT id, name, game_group FROM games WHERE game_group=$1 ORDER BY sort_order, id', [g])
        )
      );
      const ctxMap = {};
      for (let i = 0; i < dlcConfig.dlcGroups.length; i++) {
        const g = dlcConfig.dlcGroups[i];
        ctxMap[g] = { group: g, games: results[i].rows, parser: PARSERS[g] };
        dlcGameIds.push(...results[i].rows.map(r => r.id));
      }
      dlcDetector = html => ctxMap[dlcConfig.detect(html)] || null;
    }

    // Full run: clear and re-seed locations from Bulbapedia before scraping encounters.
    // --skip-empty and --location reuse existing rows so their has_wild_data tags persist.
    const isFullRun = !dryRun && !locationName && !skipEmpty;
    if (isFullRun) {
      console.log(`Locations — ${gameGroup}`);
      await seedLocationsForGroup(client, gameGroup);
      if (dlcConfig) {
        // DLC locations will be re-detected and re-classified by the loop below.
        await client.query("DELETE FROM game_locations WHERE game_group = ANY($1)", [dlcConfig.dlcGroups]);
      }
    }

    const locationQuery = locationName
      ? 'SELECT id, name, bulbapedia_slug FROM game_locations WHERE game_group=$1 AND name=$2'
      : skipEmpty
        ? `SELECT id, name, bulbapedia_slug FROM game_locations
           WHERE game_group=$1 AND has_wild_data IS NOT FALSE
           ORDER BY sort_order, name`
        : `SELECT id, name, bulbapedia_slug FROM game_locations
           WHERE game_group=$1 ORDER BY sort_order, name`;
    const locationParams = locationName ? [gameGroup, locationName] : [gameGroup];
    const { rows: locations } = await client.query(locationQuery, locationParams);

    const nameToId = await buildNameToId(client);

    if (!locations.length) {
      console.error(`No locations found for ${gameGroup}${locationName ? ` named "${locationName}"` : ''}.`);
      process.exit(1);
    }

    console.log(`Encounters — ${dryRun ? '[dry run] ' : ''}${gameGroup}`);
    console.log(`games      ${games.map(g => g.name).join(', ')}`);

    let encCleared = 0;
    if (!dryRun && !locationName) {
      const gameIds = [...games.map(g => g.id), ...dlcGameIds];
      const { rowCount } = await client.query(
        'DELETE FROM encounters WHERE game_id = ANY($1)', [gameIds]
      );
      encCleared = rowCount;
    }
    console.log(`locations  ${locations.length}${encCleared ? `  (cleared ${encCleared} prior encounters)` : ''}`);

    await client.query('BEGIN');

    let totalInserted = 0, totalSkipped = 0;
    const failedLocs = [];
    const pad = String(locations.length).length;

    await reportProgress(gameGroup, { status: 'running', total: locations.length, done: 0, current: null, inserted: 0 });

    for (let li = 0; li < locations.length; li++) {
      const loc = locations[li];
      const progress = `[${String(li + 1).padStart(pad)}/${locations.length}]`;
      await reportProgress(gameGroup, { status: 'running', total: locations.length, done: li, current: loc.name, inserted: totalInserted });
      try {
        const { inserted, skipped, records, hasStatic, warnNote } = await scrapeLocation(client, loc, parser, games, nameToId, dryRun, 500, dlcDetector);
        totalInserted += inserted;
        totalSkipped  += skipped;
        if (dryRun) {
          console.log(`${progress} ${loc.name} — ${records.length} encounters${hasStatic ? ' [static]' : ''}${warnNote}`);
          printDryRun(loc.name, records);
        } else {
          const tags = [hasStatic ? '[static]' : '', skipped ? `${skipped} skipped` : ''].filter(Boolean).join('  ');
          console.log(`${progress} ${loc.name} — ${inserted} encounters${tags ? '  ' + tags : ''}${warnNote}`);
        }
      } catch (err) {
        console.error(`${progress} ${loc.name} — ERROR: ${err.message}`);
        failedLocs.push(loc);
      }
    }

    if (!dryRun) {
      await client.query('COMMIT');

      // Retry failed locations up to 3 times with a longer backoff between requests.
      if (failedLocs.length > 0) {
        const MAX_RETRIES = 3;
        for (let attempt = 1; attempt <= MAX_RETRIES && failedLocs.length > 0; attempt++) {
          const toRetry = [...failedLocs];
          failedLocs.length = 0;
          console.log(`\nRetrying ${toRetry.length} location(s) — attempt ${attempt}/${MAX_RETRIES}`);
          await reportProgress(gameGroup, {
            status: 'running', total: locations.length, done: locations.length,
            current: `Retrying — attempt ${attempt}/${MAX_RETRIES}`, inserted: totalInserted,
          });
          for (const loc of toRetry) {
            try {
              const { inserted, skipped, records, hasStatic, warnNote } = await scrapeLocation(client, loc, parser, games, nameToId, false, 2000, dlcDetector);
              totalInserted += inserted;
              totalSkipped  += skipped;
              const tags = [hasStatic ? '[static]' : '', skipped ? `${skipped} skipped` : ''].filter(Boolean).join('  ');
              console.log(`  ↺ ${loc.name} — ${inserted} encounters${tags ? '  ' + tags : ''}${warnNote}`);
            } catch (err) {
              console.error(`  ↺ ${loc.name} — ERROR: ${err.message}`);
              failedLocs.push(loc);
            }
          }
        }
      }

      const totalErrors = failedLocs.length;
      console.log(`done — ${totalInserted} encounters inserted, ${totalSkipped} skipped, ${totalErrors} errors`);
      await reportProgress(gameGroup, { status: 'done', total: locations.length, done: locations.length, current: null, inserted: totalInserted, errors: totalErrors });
    } else {
      await client.query('ROLLBACK');
      console.log(`dry run complete — no changes written`);
      await reportProgress(gameGroup, { status: 'idle', total: 0, done: 0, current: null, inserted: 0 });
    }
  } catch (err) {
    await reportProgress(gameGroup, { status: 'error', total: 0, done: 0, current: null, inserted: 0 });
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
