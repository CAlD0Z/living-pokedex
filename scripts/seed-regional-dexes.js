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
  'wo-chien':   'Wo-Chien',
  'chien-pao':  'Chien-Pao',
  'ting-lu':    'Ting-Lu',
  'chi-yu':     'Chi-Yu',
  'iron-treads':'Iron Treads',
  'iron-bundle':'Iron Bundle',
  'iron-hands': 'Iron Hands',
  'iron-jugulis':'Iron Jugulis',
  'iron-moth':  'Iron Moth',
  'iron-thorns':'Iron Thorns',
  'iron-valiant':'Iron Valiant',
  'iron-leaves':'Iron Leaves',
  'iron-boulder':'Iron Boulder',
  'iron-crown': 'Iron Crown',
  'great-tusk': 'Great Tusk',
  'scream-tail':'Scream Tail',
  'brute-bonnet':'Brute Bonnet',
  'flutter-mane':'Flutter Mane',
  'slither-wing':'Slither Wing',
  'sandy-shocks':'Sandy Shocks',
  'roaring-moon':'Roaring Moon',
  'walking-wake':'Walking Wake',
  'gouging-fire':'Gouging Fire',
  'raging-bolt': 'Raging Bolt',
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

// Parse infocards from a single HTML block, returning [{regional_number, slug}]
function parseSection(html, numberOffset = 0) {
  const entries = [];
  const cardRegex = /<div class="infocard\s*">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    const card = m[1];
    const numMatch  = card.match(/<small>#(\d+)<\/small>/);
    const slugMatch = card.match(/href="\/pokedex\/([^"]+)"/);
    if (!numMatch || !slugMatch) continue;
    entries.push({
      regional_number: parseInt(numMatch[1], 10) + numberOffset,
      slug: slugMatch[1],
    });
  }
  return entries;
}

// Split html on <h2> tags, return array of section html strings (excluding before first h2)
function splitSections(html) {
  const parts = html.split(/<h2[^>]*>/);
  return parts.slice(1); // drop content before first h2
}

async function seedDex(client, table, url, nameToId, opts = {}) {
  const { primarySectionId = null } = opts;

  console.log(`\nSeeding ${table} from ${url}`);
  const html = await fetchPage(url);

  let entries;
  const h2Count = (html.match(/<h2/g) || []).length;

  if (h2Count === 0) {
    // No sections — whole page is one dex
    entries = parseSection(html);
  } else {
    const sections = splitSections(html);

    if (primarySectionId) {
      // Use only the section whose h2 id matches primarySectionId
      const fullSections = html.split(/(<h2[^>]*>)/);
      let targetHtml = null;
      for (let i = 1; i < fullSections.length; i += 2) {
        if (fullSections[i].includes(primarySectionId)) {
          targetHtml = fullSections[i + 1] || '';
          break;
        }
      }
      entries = targetHtml ? parseSection(targetHtml) : [];
    } else {
      // Combine all sections sequentially (Kalos-style)
      entries = [];
      let offset = 0;
      for (const section of sections) {
        const sectionEntries = parseSection(section);
        if (sectionEntries.length === 0) continue;
        // Renumber: section's own #1 becomes offset+1
        const adjusted = sectionEntries.map(e => ({
          ...e,
          regional_number: offset + e.regional_number,
        }));
        offset += sectionEntries[sectionEntries.length - 1].regional_number;
        entries.push(...adjusted);
      }
    }
  }

  console.log(`  Parsed ${entries.length} entries`);

  const dexKey = table.replace(/_dex$/, '');
  await client.query('DELETE FROM dex_entries WHERE dex_key = $1', [dexKey]);

  let inserted = 0, skipped = 0;
  for (const { regional_number, slug } of entries) {
    const name = slugToName(slug);
    const pokemonId = nameToId[name];
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
    // Build name→id lookup (prefer base form; fall back to _1 for Pokémon with no base)
    const { rows } = await client.query(`SELECT id, name, form_name FROM pokedex`);
    const nameToId = {};
    for (const r of rows) {
      if (r.form_name === null) {
        nameToId[r.name] = r.id;
      } else if (!nameToId[r.name] && r.id.endsWith('_1')) {
        nameToId[r.name] = r.id;
      }
    }

    const BASE = 'https://pokemondb.net/pokedex/game';

    await client.query('BEGIN');

    await seedDex(client, 'kanto_dex',  `${BASE}/red-blue-yellow`,          nameToId);
    await seedDex(client, 'johto_dex',  `${BASE}/heartgold-soulsilver`,     nameToId);
    await seedDex(client, 'hoenn_dex',  `${BASE}/ruby-sapphire-emerald`,    nameToId);
    await seedDex(client, 'sinnoh_dex', `${BASE}/platinum`,                 nameToId);
    await seedDex(client, 'unova_dex',  `${BASE}/black-white`,              nameToId);
    await seedDex(client, 'kalos_dex',  `${BASE}/x-y`,                     nameToId); // no primary → combines all 3
    await seedDex(client, 'alola_dex',  `${BASE}/sun-moon`,                 nameToId, { primarySectionId: 'dex-alola-dex' });
    await seedDex(client, 'galar_dex',  `${BASE}/sword-shield`,             nameToId);
    await seedDex(client, 'hisui_dex',  `${BASE}/legends-arceus`,           nameToId);
    await seedDex(client, 'paldea_dex', `${BASE}/scarlet-violet`,           nameToId);

    await client.query('COMMIT');
    console.log('\nAll regional dexes seeded.');

    // Summary
    for (const t of ['kanto_dex','johto_dex','hoenn_dex','sinnoh_dex','unova_dex',
                     'kalos_dex','alola_dex','galar_dex','hisui_dex','paldea_dex']) {
      const { rows: [r] } = await client.query('SELECT COUNT(*) FROM dex_entries WHERE dex_key = $1', [t.replace(/_dex$/, '')]);
      console.log(`  ${t.padEnd(12)} ${r.count} entries`);
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
