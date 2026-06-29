const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SLUG_OVERRIDES = {
  'nidoran-m': 'Nidoran♂',
  'nidoran-f': 'Nidoran♀',
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
  'ho-oh':      'Ho-oh',
  'flabebe':    'Flabébé',
  'sirfetchd':  "Sirfetch'd",
};

// Per-dex form overrides: pokemondb.net uses base-species slugs even when the
// DLC-native form is a regional variant.  Map (dex_key → slug → pokemon_id).
const FORM_ID_OVERRIDES = {
  isle_of_armor: {
    'slowpoke':   '79_1',   // Galarian Slowpoke
    'marowak':    '105_1',  // Alolan Marowak
    'exeggutor':  '103_1',  // Alolan Exeggutor
  },
  crown_tundra: {
    'zigzagoon':  '263_1',  // Galarian Zigzagoon
    'linoone':    '264_1',  // Galarian Linoone
    'darumaka':   '554_1',  // Galarian Darumaka
    'darmanitan': '555_2',  // Galarian Standard Mode Darmanitan
    'ponyta':     '77_1',   // Galarian Ponyta
    'rapidash':   '78_1',   // Galarian Rapidash
  },
};

function slugToName(slug) {
  if (SLUG_OVERRIDES[slug]) return SLUG_OVERRIDES[slug];
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseSection(html) {
  const entries = [];
  const cardRegex = /<div class="infocard\s*">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const card = m[1];
    const numMatch  = card.match(/<small>#(\d+)<\/small>/);
    const slugMatch = card.match(/href="\/pokedex\/([^"]+)"/);
    if (!numMatch || !slugMatch) continue;
    entries.push({ regional_number: parseInt(numMatch[1], 10), slug: slugMatch[1] });
  }
  return entries;
}

async function seedDex(client, table, url, nameToId) {
  console.log(`\nSeeding ${table} from ${url}`);
  const html = await fetchPage(url);
  const entries = parseSection(html);
  console.log(`  Parsed ${entries.length} entries`);

  const dexKey = table.replace(/_dex$/, '');
  const formOverrides = FORM_ID_OVERRIDES[dexKey] ?? {};
  await client.query('DELETE FROM dex_entries WHERE dex_key = $1', [dexKey]);

  let inserted = 0, skipped = 0;
  for (const { regional_number, slug } of entries) {
    const name = slugToName(slug);
    const pokemonId = formOverrides[slug] ?? nameToId[name];
    if (!pokemonId) {
      console.warn(`  [${table}] No match for slug "${slug}" → "${name}"`);
      skipped++;
      continue;
    }
    await client.query(
      `INSERT INTO dex_entries (dex_key, regional_number, pokemon_id) VALUES ($1, $2, $3)
       ON CONFLICT (dex_key, pokemon_id) DO UPDATE SET regional_number = EXCLUDED.regional_number`,
      [dexKey, regional_number, pokemonId]
    );
    inserted++;
  }
  console.log(`  Inserted ${inserted}, skipped ${skipped}`);
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id, name, form_name FROM pokedex`);
    const nameToId = {};
    for (const r of rows) {
      if (r.form_name === null) {
        nameToId[r.name] = r.id;
      } else if (!nameToId[r.name] && r.id.endsWith('_1')) {
        nameToId[r.name] = r.id;
      }
    }

    const BASE = 'https://pokemondb.net/pokedex/game/sword-shield';

    await client.query('BEGIN');
    await seedDex(client, 'isle_of_armor_dex', `${BASE}/isle-of-armor`, nameToId);
    await seedDex(client, 'crown_tundra_dex',  `${BASE}/crown-tundra`,  nameToId);
    await client.query('COMMIT');

    console.log('\nSword/Shield DLC dexes seeded.');
    for (const t of ['isle_of_armor_dex', 'crown_tundra_dex']) {
      const { rows: [r] } = await client.query('SELECT COUNT(*) FROM dex_entries WHERE dex_key = $1', [t.replace(/_dex$/, '')]);
      console.log(`  ${t.padEnd(20)} ${r.count} entries`);
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
