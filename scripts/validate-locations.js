'use strict';

const { Pool } = require('pg');
const { fetchBulbapedia, sleep } = require('./parsers/shared');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Game detection patterns ────────────────────────────────────────────────────
// Each entry lists regex patterns that reliably indicate a game group's encounter
// data is present on the page.  Patterns are tested against the lowercased HTML
// of the Pokémon encounter section only.

const GROUP_PATTERNS = {
  RBY:  [/pok[eé]mon red/, /pok[eé]mon blue/, /pok[eé]mon yellow/,
         /title="red"/, /title="blue"/, /title="yellow"/],
  FRLG: [/firered/, /leafgreen/],
  LGPE: [/let.s go/],
  GSC:  [/pok[eé]mon gold/, /pok[eé]mon silver/, /pok[eé]mon crystal/,
         /title="gold"/, /title="silver"/, /title="crystal"/],
  HGSS: [/heartgold/, /soulsilver/],
  RSE:  [/pok[eé]mon ruby/, /pok[eé]mon sapphire/, /pok[eé]mon emerald/,
         /title="ruby"/, /title="sapphire"/, /title="emerald"/],
  ORAS: [/omega ruby/, /alpha sapphire/],
  DPPT: [/pok[eé]mon diamond/, /pok[eé]mon pearl/, /pok[eé]mon platinum/,
         /title="diamond"/, /title="pearl"/, /title="platinum"/],
  BDSP: [/brilliant diamond/, /shining pearl/],
  BW:   [/pok[eé]mon black(?!\s*2)/, /pok[eé]mon white(?!\s*2)/,
         /title="black"(?!\s*2)/, /title="white"(?!\s*2)/],
  BW2:  [/black 2/, /white 2/],
  XY:   [/pok[eé]mon x\b/, /pok[eé]mon y\b/, /title="x"/, /title="y"/],
  SM:   [/pok[eé]mon sun(?! and)/, /pok[eé]mon moon(?!.*ultra)/,
         /title="sun"/, /title="moon"/],
  USUM: [/ultra sun/, /ultra moon/],
  SwSh: [/pok[eé]mon sword/, /pok[eé]mon shield/,
         /title="sword"/, /title="shield"/],
  IoA:  [/isle of armor/, /sw - isle of armor/, /sh - isle of armor/],
  CT:   [/crown tundra/, /sw - crown tundra/, /sh - crown tundra/],
  PLA:  [/legends.*arceus/, /arceus/],
  SV:   [/pok[eé]mon scarlet/, /pok[eé]mon violet/,
         /title="scarlet"/, /title="violet"/],
  Kita: [/kitakami/, /s - kitakami/, /v - kitakami/],
  BB:   [/blueberry/, /terarium/, /s - blueberry/, /v - blueberry/],
};

// Groups that share Bulbapedia pages with their parent — expected to also match parent patterns
const DLC_PARENT = { IoA: 'SwSh', CT: 'SwSh', Kita: 'SV', BB: 'SV' };

// ── HTML utilities ─────────────────────────────────────────────────────────────

function extractPokemonSection(html) {
  const lower = html.toLowerCase();
  // Find the Pokémon section anchor
  const markers = ['id="pok%c3%a9mon"', 'id="pokémon"', 'id="pokemon"',
                   'id="available_pok%c3%a9mon"', 'id="available_pokémon"'];
  let start = -1;
  for (const m of markers) {
    const i = lower.indexOf(m);
    if (i >= 0 && (start < 0 || i < start)) start = i;
  }
  if (start < 0) return null;
  // Grab from the section heading to the next h2 (= next major section)
  const nextH2 = html.indexOf('<h2', start + 20);
  return html.slice(start, nextH2 > 0 ? nextH2 : html.length);
}

function hasEncounterTables(section) {
  return /class="[^"]*roundy/i.test(section);
}

function detectGroupsInSection(sectionLower) {
  const found = [];
  for (const [group, patterns] of Object.entries(GROUP_PATTERNS)) {
    if (patterns.some(p => p.test(sectionLower))) found.push(group);
  }
  return found;
}

// ── Argument parsing ───────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--game-group');
  const outI = args.indexOf('--out');
  return {
    gameGroup: i >= 0 ? args[i + 1] : null,
    outFile:   outI >= 0 ? args[outI + 1] : '/scripts/location-audit.json',
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const { gameGroup, outFile } = parseArgs();

  const client = await pool.connect();
  let locations;
  try {
    const { rows } = await client.query(
      gameGroup
        ? `SELECT gl.id, gl.name, gl.game_group, gl.bulbapedia_slug,
                  COUNT(e.id)::int AS enc_count
           FROM game_locations gl
           LEFT JOIN encounters e ON e.location_id = gl.id
           WHERE gl.game_group = $1
           GROUP BY gl.id ORDER BY gl.sort_order, gl.name`
        : `SELECT gl.id, gl.name, gl.game_group, gl.bulbapedia_slug,
                  COUNT(e.id)::int AS enc_count
           FROM game_locations gl
           LEFT JOIN encounters e ON e.location_id = gl.id
           GROUP BY gl.id ORDER BY gl.game_group, gl.sort_order, gl.name`,
      gameGroup ? [gameGroup] : []
    );
    locations = rows;
  } finally {
    client.release();
  }

  console.log(`Scanning ${locations.length} locations${gameGroup ? ` (${gameGroup})` : ' (all groups)'}…`);
  console.log(`Output → ${outFile}\n`);

  const results = [];
  let ok = 0, noSection = 0, noTables = 0, mismatch = 0, errors = 0;

  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const progress = `[${String(i + 1).padStart(4)}/${locations.length}]`;
    process.stdout.write(`${progress} ${loc.game_group.padEnd(5)} ${loc.name.padEnd(40)} `);

    let status, detectedGroups = [], note = '';

    try {
      await sleep(400);
      const html = await fetchBulbapedia(loc.bulbapedia_slug);
      const section = extractPokemonSection(html);

      if (!section) {
        status = 'NO_POKEMON_SECTION';
        noSection++;
      } else if (!hasEncounterTables(section)) {
        status = 'NO_ENCOUNTER_TABLES';
        noTables++;
      } else {
        const lower = section.toLowerCase();
        detectedGroups = detectGroupsInSection(lower);

        const expected = loc.game_group;
        const parent   = DLC_PARENT[expected];

        const matchesDirect = detectedGroups.includes(expected);
        const matchesParent = parent ? detectedGroups.includes(parent) : false;

        if (matchesDirect || matchesParent) {
          status = 'OK';
          ok++;
        } else if (detectedGroups.length === 0) {
          // Has roundy tables but no known game patterns found — parser may use different signals
          status = 'TABLES_UNDETECTED';
          note = 'roundy tables present but no game patterns matched';
          noTables++;
        } else {
          // Tables found, but they belong to a different generation/group
          status = 'WRONG_GENERATION';
          note = `expected ${expected}, found: ${detectedGroups.join(', ')}`;
          mismatch++;
        }
      }
    } catch (err) {
      status = 'ERROR';
      note = err.message.slice(0, 80);
      errors++;
    }

    const icon = status === 'OK' ? '✓' :
                 status === 'NO_POKEMON_SECTION' ? '–' :
                 status === 'NO_ENCOUNTER_TABLES' ? '○' :
                 status === 'WRONG_GENERATION' ? '✗' : '?';

    console.log(`${icon} ${status}${note ? '  ← ' + note : ''}`);

    results.push({
      game_group:      loc.game_group,
      location:        loc.name,
      slug:            loc.bulbapedia_slug,
      db_encounters:   loc.enc_count,
      status,
      detected_groups: detectedGroups,
      note,
    });
  }

  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log(`\n── Summary ──────────────────────────────────────`);
  console.log(`  OK (expected games found)  : ${ok}`);
  console.log(`  No Pokémon section         : ${noSection}`);
  console.log(`  No encounter tables        : ${noTables}`);
  console.log(`  WRONG GENERATION           : ${mismatch}`);
  console.log(`  Errors                     : ${errors}`);
  console.log(`  Total                      : ${locations.length}`);
  console.log(`\nFull results → ${outFile}`);

  // Print the actionable ones
  const problems = results.filter(r => r.status === 'WRONG_GENERATION');
  if (problems.length) {
    console.log(`\n── Wrong generation locations ────────────────────`);
    for (const p of problems) {
      console.log(`  [${p.game_group}] ${p.location}`);
      console.log(`       ${p.note}`);
    }
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
