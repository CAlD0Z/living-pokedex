'use strict';

const { makeRoundyParser, parseSpecialEncounters } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const GEN_IDS = [
  'Pok.C3.A9mon_Ultra_Sun_and_Ultra_Moon',
  'Pokémon_Ultra_Sun_and_Ultra_Moon',
  'Pok%C3%A9mon_Ultra_Sun_and_Ultra_Moon',
  'Ultra_Sun_and_Ultra_Moon',
];

const base = makeRoundyParser({
  abbrevToGame: { US: 'Ultra Sun', UM: 'Ultra Moon' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
  gameColStart: 2,
});

const GIFTS = [
  // Starters — given at Iki Town (same as SM)
  { location: 'Iki Town', pokemon_id: '722', games: 'all', method: 'gift' },
  { location: 'Iki Town', pokemon_id: '725', games: 'all', method: 'gift' },
  { location: 'Iki Town', pokemon_id: '728', games: 'all', method: 'gift' },

  // Version legendaries
  { location: 'Altar of the Sunne',  pokemon_id: '791', games: ['Ultra Sun'],  method: 'unique' },
  { location: 'Altar of the Moone',  pokemon_id: '792', games: ['Ultra Moon'], method: 'unique' },

  // Poipole — gift from Ultra Recon Squad
  { location: 'Ultra Megalopolis', pokemon_id: '803', games: 'all', method: 'gift' },
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

module.exports = function parseUSUM(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);
  results.push(...parseSpecialEncounters(html, games, nameToId));
  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
