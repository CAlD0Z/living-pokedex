const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const HOME_BASE = 'https://img.pokemondb.net/sprites/home/normal';

async function fetchPage() {
  const res = await fetch('https://pokemondb.net/pokedex/all', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseRows(html) {
  const rows = [];
  const formCount = {};

  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) throw new Error('No tbody found');

  const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = trRegex.exec(tbodyMatch[1])) !== null) {
    const row = m[1];

    const numMatch  = row.match(/infocard-cell-data">(\d+)<\/span>/);
    const formMatch = row.match(/<small class="text-muted">([^<]+)<\/small>/);
    // Image slug is in the <img src="...scarlet-violet/icon/{slug}.png">
    const imgMatch  = row.match(/scarlet-violet\/icon\/([^"]+)\.png/);

    if (!numMatch || !imgMatch) continue;

    const dexNum  = parseInt(numMatch[1], 10);
    const imgSlug = imgMatch[1];
    const formName = formMatch ? formMatch[1].trim() : null;

    let id;
    if (!formName) {
      id = String(dexNum);
      formCount[dexNum] = 0;
    } else {
      formCount[dexNum] = (formCount[dexNum] || 0) + 1;
      id = `${dexNum}_${formCount[dexNum]}`;
    }

    rows.push({ id, icon_url: `${HOME_BASE}/${imgSlug}.png` });
  }

  return rows;
}

async function main() {
  console.log('Fetching national dex page...');
  const html = await fetchPage();

  console.log('Parsing rows...');
  const rows = parseRows(html);
  console.log(`Found ${rows.length} entries`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { id, icon_url } of rows) {
      const { rowCount } = await client.query(
        'UPDATE pokedex SET icon_url = $1 WHERE id = $2',
        [icon_url, id]
      );
      if (rowCount === 0) {
        console.warn(`  No row matched id="${id}" (icon: ${icon_url})`);
      }
    }

    await client.query('COMMIT');
    console.log('Done.');

    // Sanity check
    const { rows: sample } = await client.query(`
      SELECT id, name, form_name, icon_url FROM pokedex
      WHERE pokedex_number IN (6, 26, 58)
      ORDER BY id
    `);
    console.log('\nSample:');
    for (const r of sample) {
      console.log(`  ${r.id.padEnd(6)} ${r.name} ${r.form_name || ''}`);
      console.log(`         ${r.icon_url}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
