const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Slugs that don't map cleanly to the name in the pokedex table
const SLUG_OVERRIDES = {
  'nidoran-m':  'Nidoran♂',
  'nidoran-f':  'Nidoran♀',
  'farfetchd':  "Farfetch'd",
  'mr-mime':    'Mr. Mime',
  'mime-jr':    'Mime Jr.',
  'mr-rime':    'Mr. Rime',
  'porygon-z':  'Porygon-Z',
  'type-null':  'Type: Null',
  'jangmo-o':   'Jangmo-o',
  'hakamo-o':   'Hakamo-o',
  'kommo-o':    'Kommo-o',
  'tapu-koko':  'Tapu Koko',
  'tapu-lele':  'Tapu Lele',
  'tapu-bulu':  'Tapu Bulu',
  'tapu-fini':  'Tapu Fini',
  'ho-oh':      'Ho-Oh',
  'flabebe':    'Flabébé',
};

function slugToName(slug) {
  if (SLUG_OVERRIDES[slug]) return SLUG_OVERRIDES[slug];
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseRegionalDex(html) {
  const entries = [];
  // Each card: <small>#001</small> ... href="/pokedex/treecko"
  const cardRegex = /<div class="infocard\s*">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const card = m[1];
    const numMatch  = card.match(/<small>#(\d+)<\/small>/);
    const slugMatch = card.match(/href="\/pokedex\/([^"]+)"/);
    if (!numMatch || !slugMatch) continue;
    entries.push({
      regional_number: parseInt(numMatch[1], 10),
      slug: slugMatch[1],
    });
  }
  return entries;
}

async function seed() {
  const client = await pool.connect();
  try {
    // Build name→id lookup: prefer base form (form_name IS NULL), fall back to _1 form
    const { rows: dexRows } = await client.query(`SELECT id, name, form_name FROM pokedex`);
    const nameToId = {};
    for (const r of dexRows) {
      if (r.form_name === null) {
        nameToId[r.name] = r.id;
      } else if (!nameToId[r.name] && r.id.endsWith('_1')) {
        // Only Pokémon with no base form (e.g. Deoxys) reach this branch
        nameToId[r.name] = r.id;
      }
    }

    await client.query('BEGIN');

    // Upsert the game record
    const gameRes = await client.query(
      `INSERT INTO games (name, generation, region)
       VALUES ('Emerald', 3, 'Hoenn')
       ON CONFLICT (name) DO UPDATE SET generation = EXCLUDED.generation, region = EXCLUDED.region
       RETURNING id`
    );
    const gameId = gameRes.rows[0].id;
    console.log(`Game id: ${gameId}`);

    // Clear any existing regional dex for this game
    await client.query(`DELETE FROM regional_dex WHERE game_id = $1`, [gameId]);

    // Fetch and parse
    console.log('Fetching Hoenn regional dex...');
    const html = await fetchPage('https://pokemondb.net/pokedex/ruby-sapphire-emerald');
    const entries = parseRegionalDex(html);
    console.log(`Parsed ${entries.length} entries`);

    let inserted = 0, skipped = 0;
    for (const { regional_number, slug } of entries) {
      const name = slugToName(slug);
      const pokemonId = nameToId[name];
      if (!pokemonId) {
        console.warn(`  Could not match slug "${slug}" (resolved to "${name}")`);
        skipped++;
        continue;
      }
      await client.query(
        `INSERT INTO regional_dex (game_id, regional_number, pokemon_id)
         VALUES ($1, $2, $3)`,
        [gameId, regional_number, pokemonId]
      );
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`Inserted ${inserted}, skipped ${skipped}`);

    // Sanity check
    const { rows: sample } = await client.query(`
      SELECT rd.regional_number, p.pokedex_number, p.name, p.type1, p.type2
      FROM regional_dex rd
      JOIN pokedex p ON p.id = rd.pokemon_id
      WHERE rd.game_id = $1
      ORDER BY rd.regional_number
      LIMIT 10
    `, [gameId]);

    console.log('\nFirst 10 entries in Emerald regional dex:');
    for (const r of sample) {
      const types = [r.type1, r.type2].filter(Boolean).join('/');
      console.log(`  #${String(r.regional_number).padStart(3,'0')} (Nat #${r.pokedex_number}) ${r.name} [${types}]`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
