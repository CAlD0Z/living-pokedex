// Import living-pokedex-backup.json into caught_status.
// Run inside the web container:
//   node /app/scripts/import-backup.js [--player-id=N] [--dry-run]
//
// Defaults to the first admin account if --player-id is not given.

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const BACKUP_PATH = path.join(__dirname, 'living-pokedex-backup.json');

const SHINY_DEX_GAME_ID = 39;

// Tab "Pokémon HOME / …" entries
const HOME_MAP = {
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

// Tab "Games / …" (or no tab) entries
const GAME_MAP = {
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

function resolveGameId(entry) {
  const isHome = typeof entry.tab === 'string'
    ? entry.tab.startsWith('Pokémon HOME')
    : entry.game_id === 'home' || entry.game_id.startsWith('home-');
  return (isHome ? HOME_MAP : GAME_MAP)[entry.game_id] ?? undefined;
}

// form_name slug → pokedex.id TEXT
const FORM_MAP = {
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
};

function resolvePokedexId(entry) {
  const slug = entry.form_name;
  if (!slug) return String(entry.pokemon_id);
  const id = FORM_MAP[slug];
  if (!id) throw new Error(`Unknown form: pokemon_id=${entry.pokemon_id} form_name=${slug}`);
  return id;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const playerArg = args.find(a => a.startsWith('--player-id='));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let playerId;
  if (playerArg) {
    playerId = parseInt(playerArg.split('=')[1]);
  } else {
    const { rows } = await pool.query(
      'SELECT id FROM players WHERE is_admin=true ORDER BY id LIMIT 1'
    );
    if (!rows.length) throw new Error('No admin player found. Pass --player-id=N.');
    playerId = rows[0].id;
  }
  console.log(`Importing for player_id=${playerId}${dryRun ? ' (DRY RUN)' : ''}`);

  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
  console.log(`Backup entries: ${backup.length}`);

  let inserted = 0, shinyInserted = 0, skipped = 0, errors = 0;

  for (const entry of backup) {
    const isShiny = !!entry.shiny;
    const gameId = isShiny ? SHINY_DEX_GAME_ID : resolveGameId(entry);
    if (gameId === undefined) {
      console.error(`  SKIP unknown game_id: ${entry.game_id}`);
      skipped++;
      continue;
    }

    let pokemonId;
    try {
      pokemonId = resolvePokedexId(entry);
    } catch (e) {
      console.error(`  ERROR ${e.message}`);
      errors++;
      continue;
    }

    if (dryRun) {
      isShiny ? shinyInserted++ : inserted++;
      continue;
    }

    try {
      await pool.query(
        `INSERT INTO caught_status (player_id, game_id, pokemon_id, caught_at, is_shiny, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [playerId, gameId, pokemonId, entry.caught_at, isShiny, entry.notes ?? null]
      );
      isShiny ? shinyInserted++ : inserted++;
    } catch (e) {
      console.error(`  DB ERROR pokemon=${pokemonId} game=${gameId}: ${e.message}`);
      errors++;
    }
  }

  console.log(`Done: inserted=${inserted} shiny=${shinyInserted} skipped=${skipped} errors=${errors}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
