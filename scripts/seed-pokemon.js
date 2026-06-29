// Seed/refresh the national `pokedex` table from pokemondb.net/pokedex/all.
// Idempotent UPSERT keyed on id — never truncates, so it preserves columns
// populated by other scripts (generation, icon_url, base stats, form_tag, …)
// and respects the many foreign keys that reference pokedex(id).
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fetchPage() {
  const res = await fetch('https://pokemondb.net/pokedex/all', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseRows(html) {
  const rows = [];
  // Form counter per dex number
  const formCount = {};

  // Match each <tr> block inside <tbody>
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) throw new Error('Could not find table body');

  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let trMatch;

  while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
    const row = trMatch[1];

    // Dex number
    const numMatch = row.match(/infocard-cell-data">(\d+)<\/span>/);
    if (!numMatch) continue;
    const dexNum = parseInt(numMatch[1], 10);

    // Base name (always present in ent-name)
    const nameMatch = row.match(/class="ent-name"[^>]*>([^<]+)<\/a>/);
    if (!nameMatch) continue;
    const baseName = nameMatch[1].trim();

    // Form name (only present for alternate forms)
    const formMatch = row.match(/<small class="text-muted">([^<]+)<\/small>/);
    const formName = formMatch ? formMatch[1].trim() : null;

    // Types
    const typeRegex = /class="type-icon type-([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const types = [];
    let typeMatch;
    while ((typeMatch = typeRegex.exec(row)) !== null) {
      types.push(typeMatch[2].trim());
    }
    const type1 = types[0] || null;
    const type2 = types[1] || null;
    if (!type1) continue;

    // Assign ID
    let id;
    if (!formName) {
      // Base form — always use plain dex number
      id = String(dexNum);
      formCount[dexNum] = 0;
    } else {
      // Alternate form
      formCount[dexNum] = (formCount[dexNum] || 0) + 1;
      id = `${dexNum}_${formCount[dexNum]}`;
    }

    rows.push({ id, pokedex_number: dexNum, name: baseName, form_name: formName, type1, type2 });
  }

  return rows;
}

async function seed() {
  console.log('Fetching pokemondb.net/pokedex/all ...');
  const html = await fetchPage();

  console.log('Parsing rows ...');
  const rows = parseRows(html);
  console.log(`Found ${rows.length} entries`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const r of rows) {
      await client.query(
        `INSERT INTO pokedex (id, pokedex_number, name, form_name, type1, type2)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           pokedex_number = EXCLUDED.pokedex_number,
           name           = EXCLUDED.name,
           form_name      = EXCLUDED.form_name,
           type1          = EXCLUDED.type1,
           type2          = EXCLUDED.type2`,
        [r.id, r.pokedex_number, r.name, r.form_name, r.type1, r.type2]
      );
    }

    await client.query('COMMIT');
    console.log(`Upserted ${rows.length} rows into pokedex successfully`);

    // Quick sanity check
    const { rows: sample } = await client.query(
      `SELECT id, pokedex_number, name, form_name, type1, type2
       FROM pokedex WHERE pokedex_number = 6 ORDER BY id`
    );
    console.log('\nSanity check — Pokémon #6:');
    sample.forEach(r => console.log(` ${r.id.padEnd(6)} ${r.name} ${r.form_name || ''} [${[r.type1, r.type2].filter(Boolean).join('/')}]`));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
