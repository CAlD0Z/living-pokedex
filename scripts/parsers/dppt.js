'use strict';

const {
  makeRoundyParser,
  parseSpecialEncounters,
  extractTables,
  expandTable,
  bulbaNameToPokemonId,
} = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const base = makeRoundyParser({
  abbrevToGame: {
    D:  'Diamond',
    P:  'Pearl',
    Pt: 'Platinum',
  },
  sectionIds: SECTION_IDS,
  genSubsectionIds: ['Generation_IV', 'Generation_4', 'Gen._IV', 'Gen_IV'],
  timeLabels: ['morning', 'day', 'night'],
});

// ── Hardcoded gift / unique encounters ────────────────────────────────────────
// Pokémon obtained through fixed in-game mechanics that don't appear in
// Bulbapedia's standard roundy encounter tables.
//
// pokemon_id:  pokedex id string
// games:       'all' | array of game names that apply
// location:    game_locations.name to associate with
// method:      encounter_method value

const GIFTS = [
  // Starters — chosen at Lake Verity; all three available in every DPPT game
  { location: 'Lake Verity', pokemon_id: '387', games: 'all', method: 'gift' }, // Turtwig
  { location: 'Lake Verity', pokemon_id: '390', games: 'all', method: 'gift' }, // Chimchar
  { location: 'Lake Verity', pokemon_id: '393', games: 'all', method: 'gift' }, // Piplup

  // Fossils — revived at Oreburgh Mining Museum; each requires the named fossil
  { location: 'Oreburgh Mining Museum', pokemon_id: '408', games: 'all', method: 'fossil', conditions: { fossil: 'Skull Fossil' } }, // Cranidos
  { location: 'Oreburgh Mining Museum', pokemon_id: '410', games: 'all', method: 'fossil', conditions: { fossil: 'Armor Fossil' } }, // Shieldon

  // Spiritomb — place 32 NPCs in the Underground then interact with the Hallowed Tower
  { location: 'Hallowed Tower', pokemon_id: '442', games: 'all', method: 'unique' }, // Spiritomb
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

// ── Honey Tree parser ─────────────────────────────────────────────────────────
// The Honey_Tree page lists all Pokémon obtainable via honey trees in Sinnoh.
// Table structure (from expandTable):
//   Row 0 header: ["", D&P, D&P, D&P, Group C, Platinum, Platinum]
//   Row 1 header: ["", Group A, Group A, Group B, Group C, Group A, Group B]
//   Row 2+:       ["Pokémon N (X%)", Diamond, Pearl, D&P, D&P-Munchlax, Pt, Pt]
//
// Cols 1+2 are Diamond/Pearl Group A — same cell object (colspan) when shared,
// different when version-exclusive (Silcoon D / Cascoon P).

function parseHoneyTree(html, games, nameToId) {
  const pokIdx = html.search(/id="Pok.C3.A9mon_groups"|id="Pok%C3%A9mon_groups"/);
  if (pokIdx < 0) return [];

  const section = html.slice(pokIdx, pokIdx + 25000);
  const tables = extractTables(section, 'roundy');
  if (!tables.length) return [];

  const grid = expandTable(tables[0]);
  if (grid.length < 3) return [];

  const diamond  = games.find(g => g.name === 'Diamond');
  const pearl    = games.find(g => g.name === 'Pearl');
  const platinum = games.find(g => g.name === 'Platinum');

  const results = [];
  const seen = new Set();

  function addHoney(pokemon_id, game) {
    if (!game || !pokemon_id) return;
    const key = `${pokemon_id}|${game.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      pokemon_id,
      game_id:          game.id,
      encounter_method: 'honey',
      min_level: null, max_level: null,
      encounter_rate: null,
      conditions: {},
    });
  }

  function pokemonFromCell(cell) {
    if (!cell) return null;
    const linkM = (cell.html || '').match(/href="\/wiki\/([^"?#]+)"/);
    if (!linkM) return null;
    return bulbaNameToPokemonId(
      decodeURIComponent(linkM[1].replace(/_/g, ' ')),
      nameToId
    );
  }

  for (let r = 2; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length < 5) continue;

    // Cols 1 & 2: Group A — Diamond (col1) / Pearl (col2)
    // Same cell object → shared D and P; different → version-exclusive
    if (row[1] === row[2]) {
      const id = pokemonFromCell(row[1]);
      addHoney(id, diamond);
      addHoney(id, pearl);
    } else {
      addHoney(pokemonFromCell(row[1]), diamond);
      addHoney(pokemonFromCell(row[2]), pearl);
    }

    // Col 3: Group B — shared D&P
    const b = pokemonFromCell(row[3]);
    addHoney(b, diamond);
    addHoney(b, pearl);

    // Col 4: Group C (Munchlax trees) — shared D&P only
    const c = pokemonFromCell(row[4]);
    addHoney(c, diamond);
    addHoney(c, pearl);

    // Col 5: Platinum Group A
    addHoney(pokemonFromCell(row[5]), platinum);

    // Col 6: Platinum Group B
    addHoney(pokemonFromCell(row[6]), platinum);
  }

  return results;
}

// ── Exported parser ───────────────────────────────────────────────────────────

module.exports = function parseDPPT(html, locationName, games, nameToId) {
  if (locationName === 'Honey Tree') {
    return parseHoneyTree(html, games, nameToId);
  }

  const results = base(html, locationName, games, nameToId);

  // PKMNbox special encounters (Drifloon at Valley Windworks, Rotom at Old Chateau, etc.)
  results.push(...parseSpecialEncounters(html, games, nameToId));

  // Hardcoded gift / unique encounters for locations that have no parseable table
  results.push(...buildGiftEncounters(locationName, games));

  return results;
};
