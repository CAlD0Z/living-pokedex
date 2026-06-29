'use strict';

const { makeRoundyParser } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const GEN_IDS = [
  'Pok.C3.A9mon_Black_and_White',
  'Pokémon_Black_and_White',
  'Pok%C3%A9mon_Black_and_White',
  'Pokemon_Black_and_White',
  'Generation_V',
  'Gen._V',
  'Gen_V',
];

// BW tables have 4 rate columns for Spring/Summer/Autumn/Winter.
// makeRoundyParser's timeLabels maps these to conditions.time; we rename to conditions.season.
const base = makeRoundyParser({
  abbrevToGame: {
    B: 'Black',
    W: 'White',
  },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
  timeLabels: ['spring', 'summer', 'autumn', 'winter'],
});

// For encounters present in all 4 seasons with the same rate, strip the season condition
// (they're available year-round). Seasonal exclusives keep their condition.
function collapseSeasonal(results) {
  const ALL_SEASONS = ['spring', 'summer', 'autumn', 'winter'];

  const seasonal    = results.filter(r => r.conditions?.season != null);
  const nonseasonal = results.filter(r => r.conditions?.season == null);

  const groups = new Map();
  for (const r of seasonal) {
    const c = { ...r.conditions };
    delete c.season;
    const key = [
      r.pokemon_id, r.game_id, r.encounter_method,
      r.min_level, r.max_level, r.encounter_rate,
      JSON.stringify(Object.fromEntries(Object.entries(c).sort())),
    ].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const out = [];
  for (const records of groups.values()) {
    const seasons = new Set(records.map(r => r.conditions.season));
    if (ALL_SEASONS.every(s => seasons.has(s))) {
      // Year-round — drop season condition, one record
      const enc = { ...records[0], conditions: { ...records[0].conditions } };
      delete enc.conditions.season;
      out.push(enc);
    } else {
      out.push(...records);
    }
  }

  return [...nonseasonal, ...out];
}

// ── Hardcoded gift / unique encounters ────────────────────────────────────────

const GIFTS = [
  // Starters — given by Professor Juniper in Nuvema Town
  { location: 'Nuvema Town', pokemon_id: '495', games: 'all', method: 'gift' }, // Snivy
  { location: 'Nuvema Town', pokemon_id: '498', games: 'all', method: 'gift' }, // Tepig
  { location: 'Nuvema Town', pokemon_id: '501', games: 'all', method: 'gift' }, // Oshawott

  // Fossils — revived at Nacrene Museum
  { location: 'Nacrene City', pokemon_id: '564', games: 'all', method: 'fossil', conditions: { fossil: 'Cover Fossil' } }, // Tirtouga
  { location: 'Nacrene City', pokemon_id: '566', games: 'all', method: 'fossil', conditions: { fossil: 'Plume Fossil' } }, // Archen

  // Version legendaries — caught at N's Castle
  { location: "N's Castle", pokemon_id: '643', games: ['Black'], method: 'unique' }, // Reshiram (Black)
  { location: "N's Castle", pokemon_id: '644', games: ['White'], method: 'unique' }, // Zekrom (White)
];

function buildGiftEncounters(locationName, games) {
  const matches = GIFTS.filter(g => g.location === locationName);
  if (!matches.length) return [];

  const results = [];
  for (const gift of matches) {
    const gameList = gift.games === 'all'
      ? games
      : games.filter(g => gift.games.includes(g.name));
    for (const game of gameList) {
      results.push({
        pokemon_id:       gift.pokemon_id,
        game_id:          game.id,
        encounter_method: gift.method,
        min_level:        null,
        max_level:        null,
        encounter_rate:   null,
        conditions:       gift.conditions || {},
      });
    }
  }
  return results;
}

// ── Exported parser ───────────────────────────────────────────────────────────

module.exports = function parseBW(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);

  // Rename time → season (makeRoundyParser uses 'time' for the timeLabels key)
  for (const r of results) {
    if (r.conditions?.time) {
      r.conditions.season = r.conditions.time;
      delete r.conditions.time;
    }
  }

  // Hardcoded gifts
  results.push(...buildGiftEncounters(locationName, games));

  return collapseSeasonal(results);
};
