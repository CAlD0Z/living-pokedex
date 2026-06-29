'use strict';

// Downloads and caches Bulbapedia location map images for all SV/Kitakami/Blueberry locations.
// Run from repo root: node scripts/cache-sv-maps.js
// Skips locations that are already cached. Safe to re-run.

const fs   = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'web', 'public', 'maps', 'sv');
const HEADERS   = { 'User-Agent': 'LivingPokedex/1.0 (personal dex tracker)' };
const DELAY_MS  = 300; // polite delay between Bulbapedia requests

const LOCATIONS = [
  // Paldea
  { name: 'Alfornada Cavern',           group: 'SV'   },
  { name: 'Area Zero',                  group: 'SV'   },
  { name: 'Asado Desert',               group: 'SV'   },
  { name: 'Casseroya Lake',             group: 'SV'   },
  { name: 'Colonnade Hollow',           group: 'SV'   },
  { name: 'Dalizapa Passage',           group: 'SV'   },
  { name: 'East Paldean Sea',           group: 'SV'   },
  { name: 'East Province (Area One)',   group: 'SV'   },
  { name: 'East Province (Area Three)', group: 'SV'   },
  { name: 'East Province (Area Two)',   group: 'SV'   },
  { name: 'Glaseado Mountain',          group: 'SV'   },
  { name: 'Great Crater of Paldea',     group: 'SV'   },
  { name: 'Inlet Grotto',               group: 'SV'   },
  { name: 'North Paldean Sea',          group: 'SV'   },
  { name: 'North Province (Area One)',  group: 'SV'   },
  { name: 'North Province (Area Three)',group: 'SV'   },
  { name: 'North Province (Area Two)',  group: 'SV'   },
  { name: 'Poco Path',                  group: 'SV'   },
  { name: 'Pokémon League (Paldea)',    group: 'SV'   },
  { name: 'Socarrat Trail',             group: 'SV'   },
  { name: 'South Paldean Sea',          group: 'SV'   },
  { name: 'South Province (Area Five)', group: 'SV'   },
  { name: 'South Province (Area Four)', group: 'SV'   },
  { name: 'South Province (Area One)',  group: 'SV'   },
  { name: 'South Province (Area Six)',  group: 'SV'   },
  { name: 'South Province (Area Three)',group: 'SV'   },
  { name: 'South Province (Area Two)',  group: 'SV'   },
  { name: 'Tagtree Thicket',            group: 'SV'   },
  { name: 'West Paldean Sea',           group: 'SV'   },
  { name: 'West Province (Area One)',   group: 'SV'   },
  { name: 'West Province (Area Three)', group: 'SV'   },
  { name: 'West Province (Area Two)',   group: 'SV'   },
  // Kitakami
  { name: 'Apple Hills',                group: 'Kita' },
  { name: 'Chilling Waterhead',         group: 'Kita' },
  { name: 'Fellhorn Gorge',             group: 'Kita' },
  { name: 'Infernal Pass',              group: 'Kita' },
  { name: 'Kitakami',                   group: 'Kita' },
  { name: 'Kitakami Hall',              group: 'Kita' },
  { name: 'Kitakami Road',              group: 'Kita' },
  { name: 'Kitakami Wilds',             group: 'Kita' },
  { name: 'Mossfell Confluence',        group: 'Kita' },
  { name: 'Oni Mountain',               group: 'Kita' },
  { name: "Oni's Maw",                  group: 'Kita' },
  { name: "Paradise Barrens",           group: 'Kita' },
  { name: "Reveler's Road",             group: 'Kita' },
  { name: 'Timeless Woods',             group: 'Kita' },
  { name: 'Wistful Fields',             group: 'Kita' },
  // Blueberry Academy
  { name: 'Blueberry Academy',          group: 'BB'   },
  { name: 'Canyon Biome',               group: 'BB'   },
  { name: 'Chargestone Cavern',         group: 'BB'   },
  { name: 'Coastal Biome',              group: 'BB'   },
  { name: 'Crystal Pool',               group: 'BB'   },
  { name: 'Polar Biome',                group: 'BB'   },
  { name: 'Savanna Biome',              group: 'BB'   },
  { name: 'Torchlit Labyrinth',         group: 'BB'   },
];

const GROUP_PREFIX = { SV: 'Paldea', Kita: 'Kitakami', BB: 'Unova' };

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchImageUrl(name, group) {
  const prefix = GROUP_PREFIX[group];
  const bpFile = `${prefix}_${name.replace(/ /g, '_')}_Map.png`;
  const apiUrl = `https://bulbapedia.bulbagarden.net/w/api.php?action=query&titles=File:${encodeURIComponent(bpFile)}&prop=imageinfo&iiprop=url&format=json`;
  const data = await fetch(apiUrl, { headers: HEADERS }).then(r => r.json());
  return Object.values(data.query.pages)[0]?.imageinfo?.[0]?.url ?? null;
}

async function downloadTo(url, dest) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  let cached = 0, skipped = 0, failed = 0;

  for (const { name, group } of LOCATIONS) {
    const dest = path.join(CACHE_DIR, slug(name) + '.png');
    if (fs.existsSync(dest)) {
      console.log(`  skip  ${name}`);
      skipped++;
      continue;
    }

    process.stdout.write(`  fetch ${name} ... `);
    try {
      const imageUrl = await fetchImageUrl(name, group);
      if (!imageUrl) { console.log('no image found on Bulbapedia'); failed++; continue; }
      const bytes = await downloadTo(imageUrl, dest);
      console.log(`${Math.round(bytes / 1024)} KB`);
      cached++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }

    await delay(DELAY_MS);
  }

  console.log(`\nDone: ${cached} downloaded, ${skipped} already cached, ${failed} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
