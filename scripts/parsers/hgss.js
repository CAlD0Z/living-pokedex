'use strict';

const {
  makeRoundyParser,
  parseSpecialEncounters,
  parseGameCornerPrizes,
} = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const base = makeRoundyParser({
  abbrevToGame: {
    HG: 'HeartGold',
    SS: 'SoulSilver',
  },
  sectionIds: SECTION_IDS,
  genSubsectionIds: [
    'Generation_IV', 'Generation_4', 'Gen._IV', 'Gen_IV',
    'HeartGold_and_SoulSilver', 'Pok%C3%A9mon_HeartGold_and_SoulSilver',
  ],
  timeLabels: ['morning', 'day', 'night'],
});

// ── Hardcoded gift / unique encounters ────────────────────────────────────────
// Pokémon obtained through fixed in-game mechanics not in standard roundy tables.

const GIFTS = [
  // Starters — chosen at Professor Elm's Laboratory in New Bark Town
  { location: 'New Bark Town', pokemon_id: '152', games: 'all', method: 'gift' }, // Chikorita
  { location: 'New Bark Town', pokemon_id: '155', games: 'all', method: 'gift' }, // Cyndaquil
  { location: 'New Bark Town', pokemon_id: '158', games: 'all', method: 'gift' }, // Totodile

  // Togepi egg — given by Mr. Pokemon (whose house is on Johto Route 30)
  { location: 'Johto Route 30', pokemon_id: '175', games: 'all', method: 'gift' }, // Togepi

  // Eevee — given by Bill in Goldenrod City
  { location: 'Goldenrod City', pokemon_id: '133', games: 'all', method: 'gift' }, // Eevee

  // Tyrogue — given by the Karate King in Mt. Mortar
  { location: 'Mt. Mortar', pokemon_id: '236', games: 'all', method: 'gift' }, // Tyrogue

  // Red Gyarados — forced encounter at Level 30 in Lake of Rage
  { location: 'Lake of Rage', pokemon_id: '129', games: 'all', method: 'unique' }, // Gyarados (Red)

  // Fossils revived at the Pewter Museum of Science (Kanto post-game)
  { location: 'Pewter Museum of Science', pokemon_id: '138', games: 'all', method: 'fossil', conditions: { fossil: 'Helix Fossil' } },  // Omanyte
  { location: 'Pewter Museum of Science', pokemon_id: '140', games: 'all', method: 'fossil', conditions: { fossil: 'Dome Fossil' } },   // Kabuto
  { location: 'Pewter Museum of Science', pokemon_id: '142', games: 'all', method: 'fossil', conditions: { fossil: 'Old Amber' } },     // Aerodactyl
];

function buildGiftEncounters(locationName, games) {
  const matches = GIFTS.filter(g => g.location === locationName);
  if (!matches.length) return [];

  const results = [];
  for (const gift of matches) {
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

// ── Exported parser ───────────────────────────────────────────────────────────

module.exports = function parseHGSS(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);

  // PKMNbox special encounters (Lugia, Ho-Oh, Suicune, legendary birds, etc.)
  results.push(...parseSpecialEncounters(html, games, nameToId));

  // Hardcoded gift / unique encounters
  results.push(...buildGiftEncounters(locationName, games));

  // Goldenrod Game Corner prizes
  if (locationName.toLowerCase().includes('game corner')) {
    const prizes = parseGameCornerPrizes(html, {
      prizeSectionIds:  ['Prize_corner', 'Service_desk'],
      genSubsectionIds: ['Generation_IV_3', 'Generation_IV_2', 'Generation_IV'],
      games,
      nameToId,
    });
    results.push(...prizes);
  }

  return results;
};
