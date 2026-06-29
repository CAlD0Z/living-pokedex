'use strict';

const { makeRoundyParser, parseSpecialEncounters } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

// SM tables have an "Allies" column at col 1 (SOS battle partners).
// gameColStart=2 tells the parser to look for game abbreviations from col 2 onwards.
const GEN_IDS = [
  'Pok.C3.A9mon_Sun_and_Moon',
  'Pokémon_Sun_and_Moon',
  'Pok%C3%A9mon_Sun_and_Moon',
  'Sun_and_Moon',
  'Generation_VII',
  'Gen._VII',
];

const base = makeRoundyParser({
  abbrevToGame: { S: 'Sun', M: 'Moon' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
  gameColStart: 2,
});

const GIFTS = [
  // Starters — given at Iki Town
  { location: 'Iki Town', pokemon_id: '722', games: 'all', method: 'gift' }, // Rowlet
  { location: 'Iki Town', pokemon_id: '725', games: 'all', method: 'gift' }, // Litten
  { location: 'Iki Town', pokemon_id: '728', games: 'all', method: 'gift' }, // Popplio

  // Version legendaries — Altar of the Sunne / Moone
  { location: 'Altar of the Sunne',  pokemon_id: '791', games: ['Sun'],  method: 'unique' }, // Solgaleo
  { location: 'Altar of the Moone',  pokemon_id: '792', games: ['Moon'], method: 'unique' }, // Lunala
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

module.exports = function parseSM(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);
  results.push(...parseSpecialEncounters(html, games, nameToId));
  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
