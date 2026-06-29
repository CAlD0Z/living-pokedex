'use strict';

const { makeRoundyParser, parseSpecialEncounters } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

// ORAS tables use OR/AS abbreviations. Old Hoenn location pages that haven't been
// updated with ORAS columns will simply yield 0 encounters (acceptable gap).
const GEN_IDS = [
  'Pok.C3.A9mon_Omega_Ruby_and_Alpha_Sapphire',
  'Pokémon_Omega_Ruby_and_Alpha_Sapphire',
  'Pok%C3%A9mon_Omega_Ruby_and_Alpha_Sapphire',
  'Omega_Ruby_and_Alpha_Sapphire',
];

const base = makeRoundyParser({
  abbrevToGame: { OR: 'Omega Ruby', AS: 'Alpha Sapphire' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
});

const GIFTS = [
  // Starters — given by Prof. Birch on Route 101
  { location: 'Hoenn Route 101', pokemon_id: '252', games: 'all', method: 'gift' }, // Treecko
  { location: 'Hoenn Route 101', pokemon_id: '255', games: 'all', method: 'gift' }, // Torchic
  { location: 'Hoenn Route 101', pokemon_id: '258', games: 'all', method: 'gift' }, // Mudkip

  // Fossils — revived at Devon Corporation, Rustboro City
  { location: 'Rustboro City', pokemon_id: '345', games: 'all', method: 'fossil', conditions: { fossil: 'Root Fossil' } }, // Lileep
  { location: 'Rustboro City', pokemon_id: '347', games: 'all', method: 'fossil', conditions: { fossil: 'Claw Fossil' } }, // Anorith

  // Version legendaries — Cave of Origin
  { location: 'Cave of Origin', pokemon_id: '383', games: ['Omega Ruby'],     method: 'unique' }, // Groudon
  { location: 'Cave of Origin', pokemon_id: '382', games: ['Alpha Sapphire'], method: 'unique' }, // Kyogre
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

module.exports = function parseORAS(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);
  results.push(...parseSpecialEncounters(html, games, nameToId));
  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
