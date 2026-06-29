'use strict';

const { makeRoundyParser, parseSpecialEncounters } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const GEN_IDS = [
  'Generation_VIII', 'Generation_8', 'Gen._VIII',
  'Pok%C3%A9mon_Brilliant_Diamond_and_Shining_Pearl',
  'Pok.C3.A9mon_Brilliant_Diamond_and_Shining_Pearl',
  'Pokémon_Brilliant_Diamond_and_Shining_Pearl',
  'Brilliant_Diamond_and_Shining_Pearl',
];

const base = makeRoundyParser({
  abbrevToGame: { BD: 'Brilliant Diamond', SP: 'Shining Pearl' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
  timeLabels: ['morning', 'day', 'night'],
});

const GIFTS = [
  // Starters — chosen at Lake Verity
  { location: 'Lake Verity', pokemon_id: '387', games: 'all', method: 'gift' }, // Turtwig
  { location: 'Lake Verity', pokemon_id: '390', games: 'all', method: 'gift' }, // Chimchar
  { location: 'Lake Verity', pokemon_id: '393', games: 'all', method: 'gift' }, // Piplup

  // Fossils — revived at Oreburgh Mining Museum
  { location: 'Oreburgh Mining Museum', pokemon_id: '408', games: 'all', method: 'fossil', conditions: { fossil: 'Skull Fossil' } }, // Cranidos
  { location: 'Oreburgh Mining Museum', pokemon_id: '410', games: 'all', method: 'fossil', conditions: { fossil: 'Armor Fossil' } }, // Shieldon

  // Spiritomb — place 32 Mysterious Fragments in the Grand Underground then interact with Hallowed Tower
  { location: 'Hallowed Tower', pokemon_id: '442', games: 'all', method: 'unique' },
];

function buildGiftEncounters(locationName, games) {
  const results = [];
  for (const gift of GIFTS.filter(g => g.location === locationName)) {
    const gameList = gift.games === 'all' ? games : games.filter(g => gift.games.includes(g.name));
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

module.exports = function parseBDSP(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);
  results.push(...parseSpecialEncounters(html, games, nameToId));
  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
