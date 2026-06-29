'use strict';

const { makeRoundyParser, parseGameCornerPrizes } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const base = makeRoundyParser({
  abbrevToGame: { FR: 'FireRed', LG: 'LeafGreen' },
  sectionIds: SECTION_IDS,
  genSubsectionIds: [
    'Generation_III', 'Generation_3', 'Gen._III', 'Gen_III',
    'FireRed_and_LeafGreen', 'FireRed.2FLeafGreen',
  ],
});

module.exports = function parseFRLG(html, locationName, games, nameToId) {
  const results = base(html, locationName, games, nameToId);

  if (locationName.toLowerCase().includes('game corner')) {
    const prizes = parseGameCornerPrizes(html, {
      prizeSectionIds:  ['Prize_corner', 'Service_desk'],
      genSubsectionIds: ['Generation_III_3', 'Generation_III_2', 'Generation_III'],
      games,
      nameToId,
    });
    results.push(...prizes);
  }

  return results;
};
