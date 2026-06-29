'use strict';
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Baby Pokémon list with optional incense required to breed them (Gen IV–VIII rules).
// Incense-required babies: without the incense the parent breeds its own species instead.
// PokeAPI no longer surfaces this field reliably, so it is hard-coded here.
const BABY_POKEMON = [
  { dexNum: 172, name: 'Pichu',     breedItem: null },
  { dexNum: 173, name: 'Cleffa',    breedItem: null },
  { dexNum: 174, name: 'Igglybuff', breedItem: null },
  { dexNum: 175, name: 'Togepi',    breedItem: null },
  { dexNum: 236, name: 'Tyrogue',   breedItem: null },
  { dexNum: 238, name: 'Smoochum',  breedItem: null },
  { dexNum: 239, name: 'Elekid',    breedItem: null },
  { dexNum: 240, name: 'Magby',     breedItem: null },
  { dexNum: 298, name: 'Azurill',   breedItem: 'Sea Incense' },
  { dexNum: 360, name: 'Wynaut',    breedItem: 'Lax Incense' },
  { dexNum: 406, name: 'Budew',     breedItem: 'Rose Incense' },
  { dexNum: 433, name: 'Chingling', breedItem: 'Pure Incense' },
  { dexNum: 438, name: 'Bonsly',    breedItem: 'Rock Incense' },
  { dexNum: 439, name: 'Mime Jr.',  breedItem: 'Odd Incense' },
  { dexNum: 440, name: 'Happiny',   breedItem: 'Luck Incense' },
  { dexNum: 446, name: 'Munchlax',  breedItem: 'Full Incense' },
  { dexNum: 447, name: 'Riolu',     breedItem: null },
  { dexNum: 458, name: 'Mantyke',   breedItem: 'Wave Incense' },
  { dexNum: 848, name: 'Toxel',     breedItem: null },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('UPDATE pokedex SET is_baby=FALSE, breed_item=NULL');

    for (const { dexNum, name, breedItem } of BABY_POKEMON) {
      const { rowCount } = await client.query(
        'UPDATE pokedex SET is_baby=TRUE, breed_item=$1 WHERE pokedex_number=$2',
        [breedItem, dexNum]
      );
      const suffix = breedItem ? `(hold ${breedItem})` : '(no item needed)';
      console.log(`  #${String(dexNum).padStart(3,'0')} ${name.padEnd(10,' ')} ${suffix}  [${rowCount} rows]`);
    }

    console.log(`\nDone — ${BABY_POKEMON.length} baby Pokémon seeded`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
