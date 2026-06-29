'use strict';

const { makeRoundyParser } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

// BW2 tables don't use a generation subsection — B2/W2 columns exist directly in the
// Pokémon section alongside BW tables. abbrevToGame naturally ignores B/W columns.
const base = makeRoundyParser({
  abbrevToGame: { B2: 'Black 2', W2: 'White 2' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: [],
  timeLabels: ['spring', 'summer', 'autumn', 'winter'],
});

function collapseSeasonal(results) {
  const ALL_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const seasonal    = results.filter(r => r.conditions?.season != null);
  const nonseasonal = results.filter(r => r.conditions?.season == null);
  const groups = new Map();
  for (const r of seasonal) {
    const c = { ...r.conditions };
    delete c.season;
    const key = [r.pokemon_id, r.game_id, r.encounter_method,
      r.min_level, r.max_level, r.encounter_rate,
      JSON.stringify(Object.fromEntries(Object.entries(c).sort()))].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const records of groups.values()) {
    const seasons = new Set(records.map(r => r.conditions.season));
    if (ALL_SEASONS.every(s => seasons.has(s))) {
      const enc = { ...records[0], conditions: { ...records[0].conditions } };
      delete enc.conditions.season;
      out.push(enc);
    } else {
      out.push(...records);
    }
  }
  return [...nonseasonal, ...out];
}

const GIFTS = [
  // Starters — given by Bianca in Aspertia City
  { location: 'Aspertia City', pokemon_id: '495', games: 'all', method: 'gift' }, // Snivy
  { location: 'Aspertia City', pokemon_id: '498', games: 'all', method: 'gift' }, // Tepig
  { location: 'Aspertia City', pokemon_id: '501', games: 'all', method: 'gift' }, // Oshawott

  // Fossils — still revived at Nacrene Museum
  { location: 'Nacrene City', pokemon_id: '564', games: 'all', method: 'fossil', conditions: { fossil: 'Cover Fossil' } },
  { location: 'Nacrene City', pokemon_id: '566', games: 'all', method: 'fossil', conditions: { fossil: 'Plume Fossil' } },

  // Version legendaries — Reshiram (B2) / Zekrom (W2) in Giant Chasm area
  { location: 'Giant Chasm', pokemon_id: '643', games: ['Black 2'], method: 'unique' },
  { location: 'Giant Chasm', pokemon_id: '644', games: ['White 2'], method: 'unique' },
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

// ── Hidden Grotto handler ─────────────────────────────────────────────────────
// The Hidden_Grotto Bulbapedia page is organised with one <h3> per grotto area.
// When locationName ends with " Hidden Grotto" we extract only the matching
// h3 section and wrap it in a fake Pokémon heading so base() can parse it.

function grottoAreaKey(locationName) {
  // "Unova Route 2 Hidden Grotto" → "Route 2"
  // "Floccesy Ranch Hidden Grotto" → "Floccesy Ranch"
  return locationName
    .replace(/ Hidden Grotto$/, '')
    .replace(/^Unova /, '');
}

function extractH3Section(html, headingText) {
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.includes(headingText)) {
      const start = m.index + m[0].length;
      const nextH3 = html.indexOf('<h3', start);
      const nextH2 = html.indexOf('<h2', start);
      let end = html.length;
      if (nextH3 > 0 && nextH3 < end) end = nextH3;
      if (nextH2 > 0 && nextH2 < end) end = nextH2;
      return html.slice(start, end);
    }
  }
  return null;
}

function parseGrottoLocation(html, locationName, games, nameToId) {
  const area = grottoAreaKey(locationName);
  const section = extractH3Section(html, area);
  if (!section) {
    console.warn(`no Hidden Grotto section "${area}" in page`);
    return [];
  }
  // Wrap in a minimal fake Pokemon heading so base() can find the section
  const fakeHtml = `<h2><span class="mw-headline" id="Pokémon">Pokémon</span></h2>${section}`;
  const results = base(fakeHtml, locationName, games, nameToId);
  for (const r of results) {
    if (r.conditions?.time) { r.conditions.season = r.conditions.time; delete r.conditions.time; }
  }
  return collapseSeasonal(results);
}

// ── Exported parser ───────────────────────────────────────────────────────────

module.exports = function parseBW2(html, locationName, games, nameToId) {
  if (locationName.endsWith(' Hidden Grotto')) {
    return parseGrottoLocation(html, locationName, games, nameToId);
  }

  const results = base(html, locationName, games, nameToId);
  for (const r of results) {
    if (r.conditions?.time) { r.conditions.season = r.conditions.time; delete r.conditions.time; }
  }
  results.push(...buildGiftEncounters(locationName, games));
  return collapseSeasonal(results);
};
