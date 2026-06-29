const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SLUG_OVERRIDES = {
  'nidoran-m':  'Nidoran♂',
  'nidoran-f':  'Nidoran♀',
  'farfetchd':   "Farfetch'd",
  'mr-mime':     'Mr. Mime',
  'mime-jr':     'Mime Jr.',
  'mr-rime':     'Mr. Rime',
  'porygon-z':   'Porygon-Z',
  'type-null':   'Type: Null',
  'jangmo-o':    'Jangmo-o',
  'hakamo-o':    'Hakamo-o',
  'kommo-o':     'Kommo-o',
  'tapu-koko':   'Tapu Koko',
  'tapu-lele':   'Tapu Lele',
  'tapu-bulu':   'Tapu Bulu',
  'tapu-fini':   'Tapu Fini',
  'ho-oh':       'Ho-oh',
  'flabebe':     'Flabébé',
  'sirfetchd':   "Sirfetch'd",
  'wo-chien':    'Wo-Chien',
  'chien-pao':   'Chien-Pao',
  'ting-lu':     'Ting-Lu',
  'chi-yu':      'Chi-Yu',
  'iron-treads': 'Iron Treads',
  'iron-bundle': 'Iron Bundle',
  'iron-hands':  'Iron Hands',
  'iron-jugulis':'Iron Jugulis',
  'iron-moth':   'Iron Moth',
  'iron-thorns': 'Iron Thorns',
  'iron-valiant':'Iron Valiant',
  'iron-leaves': 'Iron Leaves',
  'iron-boulder':'Iron Boulder',
  'iron-crown':  'Iron Crown',
  'great-tusk':  'Great Tusk',
  'scream-tail': 'Scream Tail',
  'brute-bonnet':'Brute Bonnet',
  'flutter-mane':'Flutter Mane',
  'slither-wing':'Slither Wing',
  'sandy-shocks':'Sandy Shocks',
  'roaring-moon':'Roaring Moon',
  'walking-wake':'Walking Wake',
  'gouging-fire':'Gouging Fire',
  'raging-bolt': 'Raging Bolt',
  'ogerpon':     'Ogerpon',
  'terapagos':   'Terapagos',
  'pecharunt':   'Pecharunt',
};

// Per-dex form overrides: pokemondb.net uses base-species slugs even when the
// DLC-native form is a regional variant.  Map (dex_key → slug → pokemon_id).
const FORM_ID_OVERRIDES = {
  kitakami: {
    'sandshrew': '27_1',   // Alolan Sandshrew
    'sandslash': '28_1',   // Alolan Sandslash
    'vulpix':    '37_1',   // Alolan Vulpix
    'ninetales': '38_1',   // Alolan Ninetales
    'growlithe': '58_1',   // Hisuian Growlithe
    'arcanine':  '59_1',   // Hisuian Arcanine
    'wooper':    '194_1',  // Paldean Wooper
    'sneasel':   '215_1',  // Hisuian Sneasel
  },
  blueberry: {
    'sandshrew': '27_1',   // Alolan Sandshrew
    'sandslash': '28_1',   // Alolan Sandslash
    'vulpix':    '37_1',   // Alolan Vulpix
    'ninetales': '38_1',   // Alolan Ninetales
    'dugtrio':   '51_1',   // Alolan Dugtrio
    'diglett':   '50_1',   // Alolan Diglett (only form wild in Terarium; Dugtrio already Alolan)
    'grimer':    '88_1',   // Alolan Grimer
    'muk':       '89_1',   // Alolan Muk
    'geodude':   '74_1',   // Alolan Geodude
    'graveler':  '75_1',   // Alolan Graveler
    'golem':     '76_1',   // Alolan Golem (evolution chain: Geodude/Graveler are Alolan)
    'exeggutor': '103_1',  // Alolan Exeggutor
    'slowpoke':  '79_1',   // Galarian Slowpoke
    'slowbro':   '80_2',   // Galarian Slowbro (evolution chain: only Galarian Slowpoke is wild)
    'slowking':  '199_1',  // Galarian Slowking (same)
    'qwilfish':  '211_1',  // Hisuian Qwilfish (only form wild in Polar Biome)
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

// After dex entries are seeded, auto-correct any base-form entries where a regional
// variant (Alolan/Galarian/Hisuian/Paldean) has more wild encounters in the game group.
// This is a safety net for cases not covered by FORM_ID_OVERRIDES; safe to call when
// encounters haven't been seeded yet (finds nothing and exits cleanly).
async function adjustFormsFromEncounters(client, dexKey, gameGroup) {
  const { rows } = await client.query(`
    WITH enc AS (
      SELECT e.pokemon_id, count(*) AS cnt
      FROM encounters e
      JOIN game_locations gl ON gl.id = e.location_id
      WHERE gl.game_group = $1
      GROUP BY e.pokemon_id
    )
    SELECT DISTINCT ON (de.regional_number)
      de.regional_number,
      de.pokemon_id  AS current_id,
      alt.id         AS preferred_id
    FROM dex_entries de
    JOIN pokedex p   ON p.id = de.pokemon_id
    JOIN pokedex alt ON alt.pokedex_number = p.pokedex_number
                    AND alt.id != de.pokemon_id
                    AND (  alt.form_name ILIKE 'Alolan %'
                        OR alt.form_name ILIKE 'Galarian %'
                        OR alt.form_name ILIKE 'Hisuian %'
                        OR alt.form_name ILIKE 'Paldean %' )
    LEFT JOIN enc cur  ON cur.pokemon_id = de.pokemon_id
    LEFT JOIN enc pref ON pref.pokemon_id = alt.id
    WHERE de.dex_key = $2
      AND COALESCE(pref.cnt, 0) > COALESCE(cur.cnt, 0)
    ORDER BY de.regional_number, COALESCE(pref.cnt, 0) DESC
  `, [gameGroup, dexKey]);

  if (!rows.length) return;
  for (const { regional_number, current_id, preferred_id } of rows) {
    await client.query(
      `UPDATE dex_entries SET pokemon_id = $1 WHERE dex_key = $2 AND regional_number = $3`,
      [preferred_id, dexKey, regional_number]
    );
    console.log(`  [encounter-form] #${regional_number}: ${current_id} → ${preferred_id}`);
  }
  console.log(`  ${rows.length} form(s) adjusted from encounter data`);
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

    const BASE = 'https://pokemondb.net/pokedex/game/scarlet-violet';

    await client.query('BEGIN');
    await seedDex(client, 'kitakami_dex',  `${BASE}/teal-mask`,    nameToId);
    await seedDex(client, 'blueberry_dex', `${BASE}/indigo-disk`,  nameToId);
    await client.query('COMMIT');

    // Auto-correct remaining regional form mismatches based on encounter data.
    // No-ops if encounters haven't been seeded yet.
    await client.query('BEGIN');
    await adjustFormsFromEncounters(client, 'kitakami', 'Kita');
    await adjustFormsFromEncounters(client, 'blueberry', 'BB');
    await client.query('COMMIT');

    console.log('\nScarlet/Violet DLC dexes seeded.');
    for (const t of ['kitakami_dex', 'blueberry_dex']) {
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
