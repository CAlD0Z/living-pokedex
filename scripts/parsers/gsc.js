'use strict';

const { makeRoundyParser, parseGameCornerPrizes } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const base = makeRoundyParser({
  abbrevToGame: {
    G: 'Gold', S: 'Silver', C: 'Crystal',
    GS: 'Gold', // some pages use GS meaning both — handled via game link detection
  },
  sectionIds: SECTION_IDS,
  genSubsectionIds: ['Generation_II', 'Generation_2', 'Gen._II', 'Gen_II'],
  timeLabels: ['morning', 'day', 'night'],
});

module.exports = function parseGSC(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);

  // Goldenrod Game Corner prizes
  if (locationName.toLowerCase().includes('game corner')) {
    const prizes = parseGameCornerPrizes(html, {
      prizeSectionIds:  ['Prize_corner', 'Service_desk'],
      genSubsectionIds: ['Generation_II_3', 'Generation_II_2', 'Generation_II'],
      games,
      nameToId,
    });
    results.push(...prizes);
  }

  return results;
};
