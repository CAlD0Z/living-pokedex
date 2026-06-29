'use strict';

const { makeRoundyParser } = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

module.exports = makeRoundyParser({
  abbrevToGame: {
    R: 'Ruby', S: 'Sapphire', E: 'Emerald',
    RS: 'Ruby', // pages that list R and S together via colspan — game link detection handles this
  },
  sectionIds: SECTION_IDS,
  genSubsectionIds: ['Generation_III', 'Generation_3', 'Gen._III', 'Gen_III'],
  // No timeLabels — RSE has no time-of-day encounter splits
});
