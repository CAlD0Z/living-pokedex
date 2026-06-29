'use strict';

const {
  extractSection,
  extractTablesWithContext,
  expandTable,
  bulbaNameToPokemonId,
  extractWikiLink,
  extractFormHint,
  parseLevels,
  parseRate,
  normalizeMethod,
  parseSpecialEncounters,
} = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const WEATHER_LABELS = {
  'clear': 'clear', 'cloudy': 'cloudy',
  'rain': 'rain', 'raining': 'rain',
  'thunderstorm': 'thunderstorm',
  'snow': 'snow', 'snowing': 'snow',
  'blizzard': 'blizzard',
  'harsh sunlight': 'harsh_sunlight', 'intense sun': 'harsh_sunlight',
  'sandstorm': 'sandstorm',
  'fog': 'fog', 'heavy fog': 'heavy_fog',
};

// Detect weather sub-columns from the sub-header row (row 1 of expanded grid).
// Cells shared with row 0 via rowspan are the same object reference — skip them.
// Tries both visible text AND title= attribute (Galar route tables use icon-only cells).
function detectWeatherCols(grid) {
  if (grid.length < 2) return null;
  const h0 = grid[0], h1 = grid[1];
  const weatherCols = [];
  const seen = new Set();
  for (let c = 0; c < h1.length; c++) {
    const cell = h1[c];
    if (!cell || cell === h0[c] || seen.has(cell)) continue;
    seen.add(cell);
    const titleM = (cell.html || '').match(/\btitle="([^"]+)"/);
    const t = ((cell.text || '').trim() || (titleM?.[1] ?? '')).toLowerCase();
    if (WEATHER_LABELS[t]) weatherCols.push({ col: c, name: WEATHER_LABELS[t] });
  }
  return weatherCols.length >= 1 ? weatherCols : null;
}

// Parse one roundy encounter table.
// floorHeading comes from extractTablesWithContext (h4/h5 heading above the table).
function parseSwShTable(tableHtml, swGame, shGame, nameToId, floorHeading) {
  const grid = expandTable(tableHtml);
  if (grid.length < 2) return [];

  const h0texts = grid[0].map(c => (c?.text || '').toLowerCase().trim());
  if (!h0texts.some(h => h.includes('pokémon') || h.includes('pokemon'))) return [];

  const levelCol    = h0texts.findIndex(h => h === 'levels' || h === 'level');
  const locationCol = h0texts.findIndex(h => h === 'location' || h === 'area');
  if (levelCol < 0) return [];

  const weatherCols = detectWeatherCols(grid);
  const floorCtx = floorHeading ? { floor: floorHeading } : {};

  const results = [];

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length <= levelCol) continue;

    // Skip section-header rows (all unique cells collapse to one)
    const uniqueCells = [...new Set(row.filter(Boolean))];
    if (uniqueCells.length === 1) continue;

    const cellHtml0 = row[0]?.html || '';
    const wikiLink0 = extractWikiLink(cellHtml0);
    const pokemonId = bulbaNameToPokemonId(wikiLink0, nameToId, extractFormHint(cellHtml0, wikiLink0));
    if (!pokemonId) continue;

    const activeGames = [];
    if (swGame && row[1]?.html?.includes('<a ')) activeGames.push(swGame);
    if (shGame && row[2]?.html?.includes('<a ')) activeGames.push(shGame);
    if (!activeGames.length) continue;

    const method = normalizeMethod((locationCol >= 0 ? row[locationCol]?.text : '') || 'grass');
    const { min: min_level, max: max_level } = parseLevels(row[levelCol]?.text || '');

    for (const game of activeGames) {
      if (weatherCols) {
        // Check if all weather cols share the same cell object (= same rate for all weather)
        const firstCell = row[weatherCols[0].col];
        const allSame = weatherCols.every(({ col }) => row[col] === firstCell);

        if (allSame) {
          // Same rate in all weather → one record, no weather condition
          const rate = parseRate(firstCell?.text || '');
          if (rate == null && !firstCell?.text?.trim()) continue; // truly empty row
          results.push({
            pokemon_id: pokemonId, game_id: game.id,
            encounter_method: method, min_level, max_level,
            encounter_rate: rate, conditions: { ...floorCtx },
          });
        } else {
          // Different rates per weather → one record per non-empty weather
          for (const { col, name: weather } of weatherCols) {
            const rate = parseRate(row[col]?.text || '');
            if (!rate) continue; // 0 or empty = not in this weather
            results.push({
              pokemon_id: pokemonId, game_id: game.id,
              encounter_method: method, min_level, max_level,
              encounter_rate: rate, conditions: { ...floorCtx, weather },
            });
          }
        }
      } else {
        // No weather sub-columns — simple single-rate table
        const rateCol = h0texts.findIndex(h => h === 'rate' || h === 'rarity');
        const rate = parseRate(rateCol >= 0 ? row[rateCol]?.text : '');
        results.push({
          pokemon_id: pokemonId, game_id: game.id,
          encounter_method: method, min_level, max_level,
          encounter_rate: rate, conditions: { ...floorCtx },
        });
      }
    }
  }

  return results;
}

// Factory: creates a SwSh-family parser configured for a specific game pair.
// Used by ioa.js and ct.js to share the same parsing logic with different game names.
function makeSwShParser({ gameSw, gameSh, gifts = [] }) {
  function buildGiftEncounters(locationName, games) {
    const results = [];
    for (const gift of gifts.filter(g => g.location === locationName)) {
      const gameList = gift.games === 'all' ? games : games.filter(g => gift.games.includes(g.name));
      for (const game of gameList) {
        results.push({
          pokemon_id: gift.pokemon_id, game_id: game.id,
          encounter_method: gift.method,
          min_level: null, max_level: null, encounter_rate: null,
          conditions: gift.conditions || {},
        });
      }
    }
    return results;
  }

  return function parse(html, locationName, games, nameToId) {
    const swGame = games.find(g => g.name === gameSw);
    const shGame = games.find(g => g.name === gameSh);

    const section = extractSection(html, SECTION_IDS);
    if (!section) return buildGiftEncounters(locationName, games);

    const tables = extractTablesWithContext(section, 'roundy');
    const raw = [];
    for (const { heading, html: tHtml } of tables) {
      raw.push(...parseSwShTable(tHtml, swGame, shGame, nameToId, heading));
    }

    // Deduplicate
    const seen = new Set();
    const results = raw.filter(r => {
      const cKey = JSON.stringify(Object.fromEntries(Object.entries(r.conditions || {}).sort()));
      const key = `${r.pokemon_id}|${r.game_id}|${r.encounter_method}|${r.min_level}|${r.max_level}|${r.encounter_rate}|${cKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    results.push(...parseSpecialEncounters(html, games, nameToId));
    results.push(...buildGiftEncounters(locationName, games));
    return results;
  };
}

const GIFTS = [
  { location: 'Postwick', pokemon_id: '810', games: 'all', method: 'gift' }, // Grookey
  { location: 'Postwick', pokemon_id: '813', games: 'all', method: 'gift' }, // Scorbunny
  { location: 'Postwick', pokemon_id: '816', games: 'all', method: 'gift' }, // Sobble
  { location: 'Slumbering Weald', pokemon_id: '888', games: ['Sword'],  method: 'unique' }, // Zacian
  { location: 'Slumbering Weald', pokemon_id: '889', games: ['Shield'], method: 'unique' }, // Zamazenta
];

// Detect whether a location page belongs to an Isle of Armor or Crown Tundra DLC
// by reading the location infobox near the top of the page (well before the encounter
// tables). Returns 'IoA', 'CT', or null for base-game Galar locations.
function detectSwShDlc(html) {
  const top = html.slice(0, 5000);
  if (top.includes('Isle of Armor')) return 'IoA';
  if (top.includes('Crown Tundra'))  return 'CT';
  return null;
}

module.exports = makeSwShParser({ gameSw: 'Sword', gameSh: 'Shield', gifts: GIFTS });
module.exports.makeSwShParser  = makeSwShParser;
module.exports.detectSwShDlc   = detectSwShDlc;
