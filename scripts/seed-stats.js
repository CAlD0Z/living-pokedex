// Enrich `pokedex` with base stats scraped from the single pokemondb /pokedex/all
// table (the same source as seed-pokemon.js). Idempotent: UPDATEs existing rows
// by id, never truncates. Height/weight/abilities/genus are not on this page and
// are left for a future per-Pokémon pass.
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchPage() {
  const res = await fetch('https://pokemondb.net/pokedex/all', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Mirror seed-pokemon.js id assignment so ids line up with the pokedex table.
function parseRows(html) {
  const rows = [];
  const formCount = {};
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbody) throw new Error('Could not find table body');

  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let tr;
  while ((tr = trRegex.exec(tbody[1])) !== null) {
    const row = tr[1];
    const numMatch = row.match(/infocard-cell-data">(\d+)<\/span>/);
    if (!numMatch) continue;
    const dexNum = parseInt(numMatch[1], 10);
    const nameMatch = row.match(/class="ent-name"[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const formName = (row.match(/<small class="text-muted">([^<]+)<\/small>/) || [])[1] || null;

    // The six base stats + total live in <td class="cell-num">N</td> cells, in
    // order: Total, HP, Attack, Defense, Sp.Atk, Sp.Def, Speed.
    const nums = [...row.matchAll(/<td class="cell-num[^"]*">\s*(\d+)\s*<\/td>/g)].map(m => parseInt(m[1], 10));
    if (nums.length < 7) continue;
    const [, hp, attack, defense, sp_attack, sp_defense, speed] = nums;

    let id;
    if (!formName) { id = String(dexNum); formCount[dexNum] = 0; }
    else { formCount[dexNum] = (formCount[dexNum] || 0) + 1; id = `${dexNum}_${formCount[dexNum]}`; }

    rows.push({ id, hp, attack, defense, sp_attack, sp_defense, speed });
  }
  return rows;
}

async function seed() {
  console.log('Fetching pokemondb.net/pokedex/all …');
  const rows = parseRows(await fetchPage());
  console.log(`Parsed stats for ${rows.length} entries`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;
    for (const r of rows) {
      const res = await client.query(
        `UPDATE pokedex
            SET hp=$2, attack=$3, defense=$4, sp_attack=$5, sp_defense=$6, speed=$7
          WHERE id=$1`,
        [r.id, r.hp, r.attack, r.defense, r.sp_attack, r.sp_defense, r.speed]
      );
      updated += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`Updated stats on ${updated} pokedex rows`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
