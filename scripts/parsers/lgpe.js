'use strict';

const { makeRoundyParser } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

// LGPE data lives in the Generation VII subsection of Kanto location pages.
const GEN_IDS = [
  'Generation_VII', 'Generation_VII_2', 'Generation_VII_3',
  'Let%27s_Go,_Pikachu!_and_Let%27s_Go,_Eevee!',
  "Let's_Go,_Pikachu!_and_Let's_Go,_Eevee!",
  'Gen._VII', 'Gen_VII',
];

const base = makeRoundyParser({
  abbrevToGame: { P: "Let's Go Pikachu", E: "Let's Go Eevee" },
  sectionIds: SECTION_IDS,
  genSubsectionIds: GEN_IDS,
});

const GIFTS = [
  // Partner Pokémon — given by Prof. Oak in Pallet Town
  { location: 'Pallet Town', pokemon_id: '25',  games: ["Let's Go Pikachu"], method: 'gift' }, // Pikachu
  { location: 'Pallet Town', pokemon_id: '133', games: ["Let's Go Eevee"],   method: 'gift' }, // Eevee

  // Kanto starters — given by various NPCs
  { location: 'Cerulean City',  pokemon_id: '1', games: 'all', method: 'gift' }, // Bulbasaur
  { location: 'Vermilion City', pokemon_id: '7', games: 'all', method: 'gift' }, // Squirtle

  // Fossils — revived at Cinnabar Lab
  { location: 'Cinnabar Island', pokemon_id: '138', games: 'all', method: 'fossil', conditions: { fossil: 'Helix Fossil' } }, // Omanyte
  { location: 'Cinnabar Island', pokemon_id: '140', games: 'all', method: 'fossil', conditions: { fossil: 'Dome Fossil'  } }, // Kabuto
  { location: 'Cinnabar Island', pokemon_id: '142', games: 'all', method: 'fossil', conditions: { fossil: 'Old Amber'    } }, // Aerodactyl
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

module.exports = function parseLGPE(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);
  results.push(...buildGiftEncounters(locationName, games));
  return results;
};
