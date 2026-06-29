'use strict';

const {
  extractSection,
  extractTablesWithContext,
  expandTable,
  bulbaNameToPokemonId,
  extractWikiLink,
  extractFormHint,
  parseLevels,
} = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

// Sub-header rows within a roundy table indicate the encounter method for rows below.
const SECTION_METHODS = {
  'mass outbreak':          'mass-outbreak',
  'mass outbreaks':         'mass-outbreak',
  'fixed encounter':        'fixed',
  'fixed encounters':       'fixed',
  'special pokémon':        'special',
  'special pokemon':        'special',
  'in hyperspace':          'hyperspace',
  'hyperspace':             'hyperspace',
  'mega dimension':         'hyperspace',
};

const TIME_LABELS = {
  'morning': 'morning', 'day': 'day', 'evening': 'evening', 'night': 'night',
};
const WEATHER_LABELS = {
  'clear': 'clear', 'harsh sunlight': 'harsh_sunlight', 'cloudy': 'cloudy',
  'rain': 'rain', 'raining': 'rain', 'thunderstorm': 'thunderstorm', 'fog': 'fog',
  'snow': 'snow', 'snowing': 'snow', 'blizzard': 'blizzard', 'sandstorm': 'sandstorm',
};

// Detect column layout from the table header rows.
// Row 0: Pokémon(rs2) | Levels(rs2) | [Time of day(cs4)] | [Weather(csN)]
// Row 1: Morning | Day | Evening | Night | Clear | ...
function detectLZACols(grid) {
  if (grid.length < 2) return null;
  const h0 = grid[0], h1 = grid[1];

  let levelCol = -1;
  const seenH0 = new Set();
  for (let c = 0; c < h0.length; c++) {
    const cell = h0[c];
    if (!cell || seenH0.has(cell)) continue;
    seenH0.add(cell);
    const t = (cell.text || '').toLowerCase().trim();
    if (t === 'levels' || t === 'level') levelCol = c;
  }
  if (levelCol < 0) return null;

  const timeCols = [], weatherCols = [];
  const seenH1 = new Set();
  for (let c = 0; c < h1.length; c++) {
    const cell = h1[c];
    if (!cell || cell === h0[c] || seenH1.has(cell)) continue;
    seenH1.add(cell);
    const titleM = (cell.html || '').match(/\btitle="([^"]+)"/);
    const t = ((cell.text || '').trim() || (titleM?.[1] ?? '')).toLowerCase();
    if (TIME_LABELS[t])         timeCols.push({ col: c, name: TIME_LABELS[t] });
    else if (WEATHER_LABELS[t]) weatherCols.push({ col: c, name: WEATHER_LABELS[t] });
  }

  return { levelCol, timeCols, weatherCols };
}

function parseLZATable(tableHtml, game, nameToId) {
  const grid = expandTable(tableHtml);
  if (grid.length < 3) return [];

  const h0texts = grid[0].map(c => (c?.text || '').toLowerCase().trim());
  if (!h0texts.some(h => h.includes('pokémon') || h.includes('pokemon'))) return [];

  const cols = detectLZACols(grid);
  if (!cols) return [];

  const results = [];
  let currentMethod = 'wild';

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length <= cols.levelCol) continue;

    // Section sub-header: single unique cell spanning all columns
    const uniqueCells = [...new Set(row.filter(Boolean))];
    if (uniqueCells.length === 1) {
      const t = (uniqueCells[0].text || '').toLowerCase().trim();
      currentMethod = SECTION_METHODS[t] ?? (t ? currentMethod : 'wild');
      continue;
    }

    const cellHtml0 = row[0]?.html || '';
    const wikiLink0 = extractWikiLink(cellHtml0);
    const pokemonId = bulbaNameToPokemonId(wikiLink0, nameToId, extractFormHint(cellHtml0, wikiLink0));
    if (!pokemonId) continue;

    const levelText = (row[cols.levelCol]?.text || '').trim();
    if (!levelText) continue;

    // Active times: ✔ cells; if all share one object reference → any time
    const firstTimeCell = cols.timeCols.length ? row[cols.timeCols[0].col] : null;
    const allDay = !cols.timeCols.length ||
      cols.timeCols.every(({ col }) => row[col] === firstTimeCell);
    const activeTimes = allDay
      ? [null]
      : cols.timeCols.filter(({ col }) => (row[col]?.text || '').trim() === '✔').map(({ name }) => name);
    if (!activeTimes.length) activeTimes.push(null);

    // Active weather: ✔ cells; if all share one object reference → any weather
    const firstWeatherCell = cols.weatherCols.length ? row[cols.weatherCols[0].col] : null;
    const anyWeather = !cols.weatherCols.length ||
      cols.weatherCols.every(({ col }) => row[col] === firstWeatherCell);
    const activeWeathers = anyWeather
      ? [null]
      : cols.weatherCols.filter(({ col }) => (row[col]?.text || '').trim() === '✔').map(({ name }) => name);
    if (!activeWeathers.length) activeWeathers.push(null);

    const { min, max } = parseLevels(levelText);
    for (const time of activeTimes) {
      for (const weather of activeWeathers) {
        const cond = {};
        if (time)    cond.time    = time;
        if (weather) cond.weather = weather;
        results.push({
          pokemon_id: pokemonId, game_id: game.id,
          encounter_method: currentMethod,
          min_level: min, max_level: max, encounter_rate: null,
          conditions: cond,
        });
      }
    }
  }

  return results;
}

// Starters given at the beginning of Legends: Z-A (Lumiose City).
// Update the location name once Bulbapedia confirms the exact starting-area slug.
const GIFTS = [
  { location: 'Lumiose City', pokemon_id: '152', games: 'all', method: 'gift' }, // Chikorita
  { location: 'Lumiose City', pokemon_id: '498', games: 'all', method: 'gift' }, // Tepig
  { location: 'Lumiose City', pokemon_id: '158', games: 'all', method: 'gift' }, // Totodile
];

function buildGiftEncounters(locationName, games) {
  const results = [];
  for (const gift of GIFTS.filter(g => g.location === locationName)) {
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

module.exports = function parseLZA(html, locationName, games, nameToId) {
  const game = games.find(g => g.name === 'Legends: Z-A');
  if (!game) return buildGiftEncounters(locationName, games);

  const section = extractSection(html, SECTION_IDS);
  if (!section) return buildGiftEncounters(locationName, games);

  const tables = extractTablesWithContext(section, 'roundy');
  const raw = [];
  for (const { html: tHtml } of tables) {
    raw.push(...parseLZATable(tHtml, game, nameToId));
  }

  // Deduplicate on full condition key
  const seen = new Set();
  const results = raw.filter(r => {
    const cKey = JSON.stringify(Object.fromEntries(Object.entries(r.conditions || {}).sort()));
    const key = `${r.pokemon_id}|${r.game_id}|${r.encounter_method}|${r.min_level}|${r.max_level}|${cKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
