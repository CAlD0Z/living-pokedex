'use strict';

const { makeRoundyParser, parseGameCornerPrizes } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const base = makeRoundyParser({
  abbrevToGame: { R: 'Red', B: 'Blue', Y: 'Yellow' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: ['Generation_I', 'Generation_1', 'Gen._I', 'Gen_I'],
});

module.exports = function parseRBY(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);

  // Celadon Game Corner prizes are in a separate Prize_corner section
  if (locationName.toLowerCase().includes('game corner')) {
    const prizes = parseGameCornerPrizes(html, {
      prizeSectionIds:  ['Prize_corner', 'Service_desk'],
      genSubsectionIds: ['Generation_I_3', 'Generation_I_2', 'Generation_I'],
      games,
      nameToId,
    });
    results.push(...prizes);
  }

  return results;
};
