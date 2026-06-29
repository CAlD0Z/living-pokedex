'use strict';

const { makeRoundyParser, parseSpecialEncounters } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const GEN_IDS = [
  'Generation_VI', 'Gen._VI', 'Gen_VI',
  'Pok.C3.A9mon_X_and_Y', 'Pokémon_X_and_Y', 'Pok%C3%A9mon_X_and_Y',
  'X_and_Y',
];

const base = makeRoundyParser({
  abbrevToGame: { X: 'X', Y: 'Y' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
});

const GIFTS = [
  // Starters — given at Aquacorde Town
  { location: 'Aquacorde Town', pokemon_id: '650', games: 'all', method: 'gift' }, // Chespin
  { location: 'Aquacorde Town', pokemon_id: '653', games: 'all', method: 'gift' }, // Fennekin
  { location: 'Aquacorde Town', pokemon_id: '656', games: 'all', method: 'gift' }, // Froakie

  // Kanto starters — given by Prof. Sycamore in Lumiose City
  { location: 'Lumiose City',   pokemon_id: '1',   games: 'all', method: 'gift' }, // Bulbasaur
  { location: 'Lumiose City',   pokemon_id: '4',   games: 'all', method: 'gift' }, // Charmander
  { location: 'Lumiose City',   pokemon_id: '7',   games: 'all', method: 'gift' }, // Squirtle

  // Fossils — revived at Ambrette Town
  { location: 'Ambrette Town', pokemon_id: '696', games: 'all', method: 'fossil', conditions: { fossil: 'Jaw Fossil'  } }, // Tyrunt
  { location: 'Ambrette Town', pokemon_id: '698', games: 'all', method: 'fossil', conditions: { fossil: 'Sail Fossil' } }, // Amaura

  // Version legendaries
  { location: 'Pokémon Village', pokemon_id: '716', games: ['X'], method: 'unique' }, // Xerneas
  { location: 'Pokémon Village', pokemon_id: '717', games: ['Y'], method: 'unique' }, // Yveltal
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

module.exports = function parseXY(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);
  results.push(...parseSpecialEncounters(html, games, nameToId));
  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
