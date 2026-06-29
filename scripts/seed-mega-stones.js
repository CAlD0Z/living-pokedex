'use strict';

// Scrapes each mega stone's Bulbapedia "Acquisition" table and inserts encounters
// for the corresponding mega-evolved Pokémon in the appropriate game_locations.
//
// Usage:
//   node scripts/seed-mega-stones.js [--dry-run] [--stone <slug>]
//
// Examples:
//   node scripts/seed-mega-stones.js --dry-run
//   node scripts/seed-mega-stones.js --stone Gengarite
//   node scripts/seed-mega-stones.js

const { Pool } = require('pg');
const {
  fetchBulbapedia, sleep, decodeHtmlEntities,
  extractSection, expandTable, stripTags,
} = require('./parsers/shared');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Mega stone list ────────────────────────────────────────────────────────────
// slug: Bulbapedia page title (used in /wiki/<slug>)
// pokemon_id: mega form's id in the pokedex table
// name: display name for the stone (used in conditions)

const MEGA_STONES = [
  { slug: 'Venusaurite',      pokemon_id: '3_1',   name: 'Venusaurite'      },
  { slug: 'Charizardite_X',   pokemon_id: '6_1',   name: 'Charizardite X'   },
  { slug: 'Charizardite_Y',   pokemon_id: '6_2',   name: 'Charizardite Y'   },
  { slug: 'Blastoisinite',    pokemon_id: '9_1',   name: 'Blastoisinite'    },
  { slug: 'Beedrillite',      pokemon_id: '15_1',  name: 'Beedrillite'      },
  { slug: 'Pidgeotite',       pokemon_id: '18_1',  name: 'Pidgeotite'       },
  { slug: 'Alakazite',        pokemon_id: '65_1',  name: 'Alakazite'        },
  { slug: 'Slowbronite',      pokemon_id: '80_1',  name: 'Slowbronite'      },
  { slug: 'Gengarite',        pokemon_id: '94_1',  name: 'Gengarite'        },
  { slug: 'Kangaskhanite',    pokemon_id: '115_1', name: 'Kangaskhanite'    },
  { slug: 'Pinsirite',        pokemon_id: '127_1', name: 'Pinsirite'        },
  { slug: 'Gyaradosite',      pokemon_id: '130_1', name: 'Gyaradosite'      },
  { slug: 'Aerodactylite',    pokemon_id: '142_1', name: 'Aerodactylite'    },
  { slug: 'Mewtwonite_X',     pokemon_id: '150_1', name: 'Mewtwonite X'     },
  { slug: 'Mewtwonite_Y',     pokemon_id: '150_2', name: 'Mewtwonite Y'     },
  { slug: 'Ampharosite',      pokemon_id: '181_1', name: 'Ampharosite'      },
  { slug: 'Steelixite',       pokemon_id: '208_1', name: 'Steelixite'       },
  { slug: 'Scizorite',        pokemon_id: '212_1', name: 'Scizorite'        },
  { slug: 'Heracronite',      pokemon_id: '214_1', name: 'Heracronite'      },
  { slug: 'Houndoominite',    pokemon_id: '229_1', name: 'Houndoominite'    },
  { slug: 'Tyranitarite',     pokemon_id: '248_1', name: 'Tyranitarite'     },
  { slug: 'Sceptilite',       pokemon_id: '254_1', name: 'Sceptilite'       },
  { slug: 'Blazikenite',      pokemon_id: '257_1', name: 'Blazikenite'      },
  { slug: 'Swampertite',      pokemon_id: '260_1', name: 'Swampertite'      },
  { slug: 'Gardevoirite',     pokemon_id: '282_1', name: 'Gardevoirite'     },
  { slug: 'Sablenite',        pokemon_id: '302_1', name: 'Sablenite'        },
  { slug: 'Mawilite',         pokemon_id: '303_1', name: 'Mawilite'         },
  { slug: 'Aggronite',        pokemon_id: '306_1', name: 'Aggronite'        },
  { slug: 'Medichamite',      pokemon_id: '308_1', name: 'Medichamite'      },
  { slug: 'Manectite',        pokemon_id: '310_1', name: 'Manectite'        },
  { slug: 'Sharpedonite',     pokemon_id: '319_1', name: 'Sharpedonite'     },
  { slug: 'Cameruptite',      pokemon_id: '323_1', name: 'Cameruptite'      },
  { slug: 'Altarianite',      pokemon_id: '334_1', name: 'Altarianite'      },
  { slug: 'Banettite',        pokemon_id: '354_1', name: 'Banettite'        },
  { slug: 'Absolite',         pokemon_id: '359_1', name: 'Absolite'         },
  { slug: 'Glalitite',        pokemon_id: '362_1', name: 'Glalitite'        },
  { slug: 'Salamencite',      pokemon_id: '373_1', name: 'Salamencite'      },
  { slug: 'Metagrossite',     pokemon_id: '376_1', name: 'Metagrossite'     },
  { slug: 'Latiasite',        pokemon_id: '380_1', name: 'Latiasite'        },
  { slug: 'Latiosite',        pokemon_id: '381_1', name: 'Latiosite'        },
  { slug: 'Lopunnite',        pokemon_id: '428_1', name: 'Lopunnite'        },
  { slug: 'Garchompite',      pokemon_id: '445_1', name: 'Garchompite'      },
  { slug: 'Lucarionite',      pokemon_id: '448_1', name: 'Lucarionite'      },
  { slug: 'Abomasite',        pokemon_id: '460_1', name: 'Abomasite'        },
  { slug: 'Galladite',        pokemon_id: '475_1', name: 'Galladite'        },
  { slug: 'Audinite',         pokemon_id: '531_1', name: 'Audinite'         },
  { slug: 'Diancite',         pokemon_id: '719_1', name: 'Diancite'         },
];

// ── Game group mapping ─────────────────────────────────────────────────────────

// Decoded wiki slug → game_group
const WIKI_TO_GROUP = {
  'Pokémon X and Y':                                        'XY',
  'Pokémon Omega Ruby and Alpha Sapphire':                  'ORAS',
  'Pokémon Sun and Moon':                                   'SM',
  'Pokémon Ultra Sun and Ultra Moon':                       'USUM',
  "Pokémon: Let's Go, Pikachu! and Let's Go, Eevee!":      'LGPE',
  'Pokémon Legends: Z-A':                                   'LZA',
  // Champions and other non-mainline games intentionally omitted
};

// Per-group mapping: span text abbreviation → game_id (from games table)
const GROUP_ABBREV_TO_GAME_ID = {
  XY:   { X: 21, Y: 22 },
  ORAS: { OR: 23, AS: 24 },
  SM:   { S: 25, M: 26 },
  USUM: { US: 27, UM: 28 },
  LGPE: { P: 29, E: 30 },
  LZA:  { ZA: 48 },
};

// ── HTML parser ────────────────────────────────────────────────────────────────

// Find the Acquisition section and return only the content up to the
// Distribution h4 (or the next h2/h3 if Distribution isn't present).
function extractAcquisitionSection(html) {
  const ids = ['Acquisition', 'In_the_core_series_games'];
  for (const id of ids) {
    const idx = html.indexOf(`id="${id}"`);
    if (idx < 0) continue;
    const h3Open = html.lastIndexOf('<h3', idx);
    const h2Open = html.lastIndexOf('<h2', idx);
    const tag = h3Open > h2Open ? 'h3' : 'h2';
    const closeTag = `</${tag}>`;
    const headingClose = html.indexOf(closeTag, idx);
    if (headingClose < 0) continue;
    const start = headingClose + closeTag.length;
    // Stop at Distribution h4 if present, otherwise at next h2/h3
    const distIdx = html.indexOf('id="Distribution"', start);
    const nextH2  = html.indexOf('<h2', start);
    const nextH3  = html.indexOf('<h3', start);
    let end = html.length;
    if (distIdx > 0 && distIdx < end) {
      const h4Before = html.lastIndexOf('<h4', distIdx);
      if (h4Before > 0 && h4Before < end) end = h4Before;
    }
    if (nextH2 > 0 && nextH2 < end) end = nextH2;
    if (nextH3 > 0 && nextH3 < end) end = nextH3;
    return html.slice(start, end);
  }
  return null;
}

// Find the first inner data table (border="1") within the acquisition section.
// The outer wrapper is class="roundy"; the inner table holds the actual rows.
function findInnerTable(sectionHtml) {
  // Search for a table that has border="1"
  const markers = ['<table border="1"', '<table border=1', '<table style="background:#FFF'];
  for (const marker of markers) {
    const start = sectionHtml.indexOf(marker);
    if (start < 0) continue;
    let depth = 1, cur = sectionHtml.indexOf('>', start) + 1;
    while (depth > 0 && cur < sectionHtml.length) {
      const nextOpen  = sectionHtml.indexOf('<table', cur);
      const nextClose = sectionHtml.indexOf('</table>', cur);
      if (nextClose < 0) { cur = sectionHtml.length; break; }
      if (nextOpen >= 0 && nextOpen < nextClose) { depth++; cur = nextOpen + 6; }
      else { depth--; cur = nextClose + 8; }
    }
    return sectionHtml.slice(start, cur);
  }
  return null;
}

// Parse the games column cell: returns an array of game_ids.
// Each <a> link points to a game-group page; each <span> inside it is one game abbreviation.
function parseGamesCell(cellHtml) {
  const gameIds = [];
  const anchorRe = /<a [^>]*href="\/wiki\/([^"?#]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(cellHtml)) !== null) {
    let wikiSlug;
    try { wikiSlug = decodeURIComponent(m[1].replace(/_/g, ' ')); }
    catch (_) { wikiSlug = m[1].replace(/_/g, ' '); }

    const group = WIKI_TO_GROUP[wikiSlug];
    if (!group) continue;

    const abbrevMap = GROUP_ABBREV_TO_GAME_ID[group];
    if (!abbrevMap) continue;

    // Extract each <span> text as a game abbreviation
    const anchorInner = m[2];
    const spanRe = /<span[^>]*>([^<]+)<\/span>/g;
    let s;
    const abbrevs = [];
    while ((s = spanRe.exec(anchorInner)) !== null) {
      abbrevs.push(s[1].trim());
    }

    if (abbrevs.length) {
      for (const abbrev of abbrevs) {
        if (abbrevMap[abbrev] != null) gameIds.push(abbrevMap[abbrev]);
      }
    } else {
      // No spans — include all games in the group
      gameIds.push(...Object.values(abbrevMap));
    }
  }
  return [...new Set(gameIds)];
}

// Non-location page title suffixes/patterns to ignore when scanning cell links.
const NON_LOCATION_PATTERNS = [
  /\(Pok[eé]mon\)$/i,
  /\(Trainer class\)$/i,
  /\(move\)$/i,
  /\(ability\)$/i,
  /\(item\)$/i,
  /\(Champions\)$/i,
  /^Mission\b/i,
  /^(Pok[eé]dex|Battle Point|Held item|Mystery Gift|Battle Pass|Season\b)/i,
  /\bpass reward\b/i,
  /^(Event|Trade|Link Trade|In-game trade|Event Trade)$/i,
  title => title.length > 60,  // too long to be a real location name
];

function isLocationTitle(title) {
  return !NON_LOCATION_PATTERNS.some(re =>
    typeof re === 'function' ? re(title) : re.test(title)
  );
}

// Parse one method cell (Finite methods or Repeatable methods).
// Returns [{ locationName, locationSlug }] — one entry per distinct location.
// The first valid location link in each <br>-separated chunk is used.
function parseMethodCell(cellHtml) {
  if (!cellHtml || !cellHtml.trim()) return [];

  // Split on <br> tags: each segment can have its own primary location.
  const chunks = cellHtml.split(/<br\s*\/?>/i);

  const results = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const linkRe = /<a [^>]*href="\/wiki\/([^"?#]+)"[^>]*title="([^"]+)"[^>]*>/g;
    let m;
    while ((m = linkRe.exec(chunk)) !== null) {
      let slug, title;
      try {
        slug  = decodeURIComponent(m[1]);
        title = decodeHtmlEntities(m[2]);
      } catch (_) {
        slug  = m[1];
        title = m[2];
      }
      if (!isLocationTitle(title)) continue;
      if (seen.has(slug)) continue;
      seen.add(slug);
      results.push({ locationName: title, locationSlug: slug.replace(/ /g, '_') });
      break; // Only take the first valid location link per chunk
    }
  }

  // Fallback: plain text if no links passed the filter
  if (!results.length) {
    const text = stripTags(cellHtml).trim();
    if (text && text.length > 1 && isLocationTitle(text)) {
      results.push({ locationName: text, locationSlug: null });
    }
  }

  return results;
}

// Parse the acquisition inner table for a given stone.
// Returns [{ gameIds, locationName, locationSlug, finite }]
function parseAcquisitionInnerTable(tableHtml) {
  const grid = expandTable(tableHtml);
  if (grid.length < 2) return [];

  // Find column indices from header row
  const header = grid[0].map(c => c.text.toLowerCase().trim());
  const gamesCol    = header.findIndex(h => h === 'games' || h === 'game');
  const finiteCol   = header.findIndex(h => h.includes('finite'));
  const repeatCol   = header.findIndex(h => h.includes('repeatable'));
  // Some pages use a single "Method" or "Location" column instead of Finite/Repeatable
  const methodCol   = (finiteCol < 0 && repeatCol < 0)
    ? header.findIndex(h => h === 'method' || h === 'location' || h === 'locations')
    : -1;

  if (gamesCol < 0) return [];

  const results = [];

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length < 2) continue;

    const gameIds = parseGamesCell(row[gamesCol]?.html || '');
    if (!gameIds.length) continue;

    const entries = [];
    if (finiteCol >= 0) {
      for (const loc of parseMethodCell(row[finiteCol]?.html || '')) {
        entries.push({ ...loc, finite: true });
      }
    }
    if (repeatCol >= 0) {
      for (const loc of parseMethodCell(row[repeatCol]?.html || '')) {
        entries.push({ ...loc, finite: false });
      }
    }
    if (methodCol >= 0) {
      for (const loc of parseMethodCell(row[methodCol]?.html || '')) {
        entries.push({ ...loc, finite: true });
      }
    }

    for (const entry of entries) {
      results.push({ gameIds, ...entry });
    }
  }

  return results;
}

// ── Database helpers ───────────────────────────────────────────────────────────

// Returns the game_group for a given game_id using preloaded game data.
function groupForGameId(gameId, gamesByGroup) {
  for (const [group, games] of Object.entries(gamesByGroup)) {
    if (games.some(g => g.id === gameId)) return group;
  }
  return null;
}

// Upsert a game_location row and return its id.
async function upsertLocation(client, name, gameGroup, slug) {
  const safeSlug = slug || name.replace(/\s+/g, '_');
  const { rows } = await client.query(
    `INSERT INTO game_locations (name, game_group, bulbapedia_slug, sort_order)
     VALUES ($1, $2, $3, 9000)
     ON CONFLICT (name, game_group) DO UPDATE SET bulbapedia_slug = EXCLUDED.bulbapedia_slug
     RETURNING id`,
    [name, gameGroup, safeSlug]
  );
  return rows[0].id;
}

// Insert one encounter row. Returns true if inserted, false if already existed.
async function insertEncounter(client, locationId, pokemonId, gameId, stoneName, finite) {
  const conditions = JSON.stringify({ stone: stoneName, acquisition: finite ? 'finite' : 'repeatable' });
  try {
    await client.query(
      `INSERT INTO encounters
         (location_id, pokemon_id, game_id, encounter_method, min_level, max_level, encounter_rate, conditions)
       VALUES ($1, $2, $3, 'mega-stone', NULL, NULL, NULL, $4)
       ON CONFLICT (location_id, pokemon_id, game_id, encounter_method, conditions) DO NOTHING`,
      [locationId, pokemonId, gameId, conditions]
    );
    return true;
  } catch (err) {
    console.warn(`  insert failed: ${err.message}`);
    return false;
  }
}

// ── Core run function (exported for use by seed-static-encounters.js) ──────────

// run(client, { dryRun, stone }) — uses an existing DB client (no pool lifecycle).
async function run(client, { dryRun = false, stone = null } = {}) {
  const { rows: allGames } = await client.query('SELECT id, name, game_group FROM games');
  const gamesByGroup = {};
  for (const g of allGames) {
    if (!gamesByGroup[g.game_group]) gamesByGroup[g.game_group] = [];
    gamesByGroup[g.game_group].push(g);
  }

  const stones = MEGA_STONES.filter((s, i, arr) => arr.findIndex(x => x.slug === s.slug) === i);
  const targets = stone ? stones.filter(s => s.slug === stone || s.name === stone) : stones;

  if (!targets.length) throw new Error(`No stone found matching: ${stone}`);

  console.log(`Mega stones — ${dryRun ? '[dry run] ' : ''}${targets.length} stone(s)`);

  let totalInserted = 0, totalSkipped = 0;

  for (let i = 0; i < targets.length; i++) {
    const { slug, pokemon_id, name: stoneName } = targets[i];
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${targets.length}] ${stoneName} ... `);

    try {
      await sleep(i === 0 ? 0 : 600);
      const html = await fetchBulbapedia(slug);

      const section = extractAcquisitionSection(html);
      if (!section) { console.log('no Acquisition section'); continue; }

      const innerTable = findInnerTable(section);
      if (!innerTable) { console.log('no data table'); continue; }

      const entries = parseAcquisitionInnerTable(innerTable);
      if (!entries.length) { console.log('no entries parsed'); continue; }

      let stoneInserted = 0, stoneSkipped = 0;

      for (const { gameIds, locationName, locationSlug, finite } of entries) {
        for (const gameId of gameIds) {
          const gameGroup = groupForGameId(gameId, gamesByGroup);
          if (!gameGroup) continue;

          if (dryRun) {
            const gameName = allGames.find(g => g.id === gameId)?.name ?? gameId;
            console.log(`\n    ${gameName.padEnd(16)} ${locationName.padEnd(30)} ${finite ? 'finite' : 'repeatable'}`);
            stoneInserted++;
            continue;
          }

          const locationId = await upsertLocation(client, locationName, gameGroup, locationSlug);
          const inserted = await insertEncounter(client, locationId, pokemon_id, gameId, stoneName, finite);
          if (inserted) stoneInserted++; else stoneSkipped++;
        }
      }

      if (!dryRun) {
        console.log(`${stoneInserted} inserted, ${stoneSkipped} skipped`);
      } else if (!entries.length) {
        console.log('(no entries)');
      } else {
        console.log();
      }

      totalInserted += stoneInserted;
      totalSkipped  += stoneSkipped;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

module.exports = { run };

// ── CLI entry point ────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const get = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const opts = { dryRun: args.includes('--dry-run'), stone: get('--stone') };

  (async () => {
    const client = await pool.connect();
    try {
      const { inserted, skipped } = await run(client, opts);
      console.log(`\ndone — ${inserted} encounters ${opts.dryRun ? 'would be ' : ''}inserted, ${skipped} already existed`);
    } finally {
      client.release();
      await pool.end();
    }
  })().catch(err => { console.error(err); process.exit(1); });
}
