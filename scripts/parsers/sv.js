'use strict';

const {
  extractSection,
  extractTablesWithContext,
  expandTable,
  bulbaNameToPokemonId,
  extractWikiLink,
  extractFormHint,
  parseLevels,
  parseRate,
  parseSpecialEncounters,
} = require('./shared');

const SECTION_IDS = [
  'Pok%C3%A9mon', 'Pok.C3.A9mon', 'Pokémon', 'Pokemon',
  'Available_Pok%C3%A9mon', 'Available_Pok.C3.A9mon', 'Available_Pokémon',
];

const TERRAIN_METHOD = {
  land:          'grass',
  water_surface: 'surfing',
  underwater:    'underwater',
  overland:      'grass',
  sky:           'sky',
};

const GIFTS = [
  { location: 'Poco Path', pokemon_id: '906',  games: 'all',        method: 'gift'   }, // Sprigatito
  { location: 'Poco Path', pokemon_id: '909',  games: 'all',        method: 'gift'   }, // Fuecoco
  { location: 'Poco Path', pokemon_id: '912',  games: 'all',        method: 'gift'   }, // Quaxly
  { location: 'Poco Path', pokemon_id: '1007', games: ['Scarlet'],  method: 'unique' }, // Koraidon
  { location: 'Poco Path', pokemon_id: '1008', games: ['Violet'],   method: 'unique' }, // Miraidon
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

// Detect the column layout from the expanded header row.
// The main header (row 0) has visible text for Levels / Group Rate / Group Pokémon.
// The sub-header row (row 1) uses icon images whose labels are in title= attributes,
// not in stripTags() text, so we read those from cell.html.
// Layout is always: Pokémon(1) | S,V(2) | terrain(5) | Levels(1) | time(4) | GroupRate(1) | GroupPokemon(1)
// → terrain cols = [levelCol-5 .. levelCol-1], time cols = [levelCol+1 .. levelCol+4]
function detectColumns(grid) {
  if (grid.length < 2) return null;
  const h0 = grid[0];
  const h1 = grid[1];

  const TERRAIN_LABELS = {
    'land': 'land', 'water surface': 'water_surface',
    'underwater': 'underwater', 'overland': 'overland', 'sky': 'sky',
  };
  const TIME_LABELS = {
    'morning': 'morning', 'day': 'day', 'evening': 'evening', 'night': 'night',
  };

  const result = {
    levelCol: -1, gameColS: 1, gameColV: 2,
    terrainCols: [], timeCols: [],
    groupRateCol: -1, groupPokemonCol: -1,
  };

  // Find Levels, Group Rate, Group Pokémon from main header (visible text)
  const seenH0 = new Set();
  for (let c = 0; c < h0.length; c++) {
    const cell = h0[c];
    if (!cell || seenH0.has(cell)) continue;
    seenH0.add(cell);
    const t = (cell.text || '').toLowerCase().trim();
    if (t === 'levels' || t === 'level')                   result.levelCol = c;
    else if (t === 'group rate')                           result.groupRateCol = c;
    else if (t.startsWith('group') && t.includes('pok'))  result.groupPokemonCol = c;
  }
  if (result.levelCol < 0) return null;

  // Sub-header terrain/time cells use icon images — labels are in title= attributes.
  // Cells shared from h0 via rowspan have the same object reference → skip them.
  const seenH1 = new Set();
  for (let c = 0; c < h1.length; c++) {
    const cell = h1[c];
    if (!cell || cell === h0[c] || seenH1.has(cell)) continue;
    seenH1.add(cell);
    // Get label from visible text first, fall back to title= attribute in the HTML
    const titleM = (cell.html || '').match(/\btitle="([^"]+)"/);
    const t = ((cell.text || '').trim() || (titleM?.[1] ?? '')).toLowerCase();
    if (TERRAIN_LABELS[t]) result.terrainCols.push({ col: c, name: TERRAIN_LABELS[t] });
    else if (TIME_LABELS[t]) result.timeCols.push({ col: c, name: TIME_LABELS[t] });
  }

  return result.terrainCols.length ? result : null;
}

// Split an extracted section's HTML into h3 sub-sections.
// Returns [{heading: string|null, html: string}] — one entry per h3, plus an
// entry for any content that precedes the first h3 (heading: null).
function splitH3Sections(html) {
  const h3Re = /<h3[^>]*>[\s\S]*?<\/h3>/g;
  const h3s = [];
  let match;
  while ((match = h3Re.exec(html)) !== null) {
    const heading = match[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    h3s.push({ heading, matchStart: match.index, contentStart: match.index + match[0].length });
  }
  if (h3s.length === 0) return [{ heading: null, html }];
  const sections = [];
  if (h3s[0].matchStart > 0) sections.push({ heading: null, html: html.slice(0, h3s[0].matchStart) });
  for (let i = 0; i < h3s.length; i++) {
    const contentEnd = i + 1 < h3s.length ? h3s[i + 1].matchStart : html.length;
    sections.push({ heading: h3s[i].heading, html: html.slice(h3s[i].contentStart, contentEnd) });
  }
  return sections;
}

function parseSVTable(tableHtml, games, nameToId, gameS, gameV, h3Area = null) {
  const grid = expandTable(tableHtml);
  if (grid.length < 3) return [];

  const h0texts = grid[0].map(c => (c?.text || '').toLowerCase().trim());
  if (!h0texts.some(h => h.includes('pokémon') || h.includes('pokemon'))) return [];

  const cols = detectColumns(grid);
  if (!cols) return [];

  const scarlet = games.find(g => g.name === gameS);
  const violet  = games.find(g => g.name === gameV);

  const results = [];
  let currentBiome = null;

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.length <= cols.levelCol) continue;

    // Biome sub-header: entire row is one colspan cell
    const uniqueCells = [...new Set(row.filter(Boolean))];
    if (uniqueCells.length === 1) {
      const t = (uniqueCells[0].text || '').trim();
      if (t && t !== '✔' && t !== '✘') { currentBiome = t; continue; }
    }

    // Skip rows without a Pokémon link (sub-header row, empty rows, etc.)
    const cellHtml0 = row[0]?.html || '';
    const wikiLink0 = extractWikiLink(cellHtml0);
    const formHint0 = extractFormHint(cellHtml0, wikiLink0);
    const pokemonId = bulbaNameToPokemonId(wikiLink0, nameToId, formHint0);
    if (!pokemonId) continue;

    // Gender condition: set when the form hint resolved a dimorphic form (e.g. Meowstic ♀/♂).
    const genderCond = /^Female\s/i.test(formHint0 ?? '') ? 'female'
                     : /^Male\s/i.test(formHint0 ?? '')   ? 'male'
                     : null;

    // Games
    const activeGames = [];
    if (scarlet && row[cols.gameColS]?.html?.includes('<a ')) activeGames.push(scarlet);
    if (violet  && row[cols.gameColV]?.html?.includes('<a ')) activeGames.push(violet);
    if (!activeGames.length) continue;

    const { min: min_level, max: max_level } = parseLevels(row[cols.levelCol]?.text || '');

    // Active terrains (✔ cells)
    const activeTerrains = cols.terrainCols.filter(
      ({ col }) => (row[col]?.text || '').trim() === '✔'
    );
    if (!activeTerrains.length) continue;

    // Time weights: if all 4 time cols share the same cell object the Pokémon is all-day
    const timeFirst = cols.timeCols.length ? row[cols.timeCols[0].col] : null;
    const allDay = !cols.timeCols.length ||
      cols.timeCols.every(({ col }) => row[col] === timeFirst);

    // Group info (strip ✘ / 0 placeholders)
    const grpRateRaw   = cols.groupRateCol    >= 0 ? (row[cols.groupRateCol]?.text    || '').trim() : null;
    const grpPokRaw    = cols.groupPokemonCol >= 0 ? (row[cols.groupPokemonCol]?.text || '').trim() : null;
    const groupRate    = grpRateRaw && grpRateRaw !== '✘' && grpRateRaw !== '0' ? grpRateRaw : null;
    const groupPokemon = grpPokRaw  && grpPokRaw  !== '✘' ? grpPokRaw  : null;

    // Resolve the group Pokémon to a DB id using its wiki link (or plain text as fallback).
    // Apply extractFormHint so "Alolan Form" / "Galarian Form" labels are respected.
    const grpPokHtml  = cols.groupPokemonCol >= 0 ? (row[cols.groupPokemonCol]?.html || '') : '';
    const grpPokLink  = extractWikiLink(grpPokHtml);
    const grpPokId    = groupPokemon
      ? bulbaNameToPokemonId(grpPokLink || groupPokemon, nameToId, extractFormHint(grpPokHtml, grpPokLink))
      : null;

    for (const { name: terrain } of activeTerrains) {
      const method = TERRAIN_METHOD[terrain] ?? 'grass';
      const baseCond = {};
      if (h3Area)       baseCond.area            = h3Area;
      if (currentBiome) baseCond.biome            = currentBiome;
      if (terrain)      baseCond.terrain          = terrain;
      if (genderCond)   baseCond.gender           = genderCond;
      if (groupRate)    baseCond.group_rate        = groupRate;
      if (groupPokemon) baseCond.group_pokemon     = groupPokemon;

      for (const game of activeGames) {
        if (allDay) {
          // Single record; use the shared time-cell value as encounter_rate
          const weight = timeFirst ? (parseInt(timeFirst.text, 10) || null) : null;
          results.push({
            pokemon_id: pokemonId, game_id: game.id,
            encounter_method: method, min_level, max_level,
            encounter_rate: weight,
            conditions: { ...baseCond },
          });
        } else {
          // One record per active time period
          for (const { col, name: time } of cols.timeCols) {
            const weight = parseInt(row[col]?.text || '0', 10) || 0;
            if (weight === 0) continue;
            results.push({
              pokemon_id: pokemonId, game_id: game.id,
              encounter_method: method, min_level, max_level,
              encounter_rate: weight,
              conditions: { ...baseCond, time },
            });
          }
        }

        // Generate a 'group' encounter record for the accompanying Pokémon so it
        // shows up in wild location lookups for this area.
        if (grpPokId) {
          const grpCond = {};
          if (h3Area)       grpCond.area     = h3Area;
          if (currentBiome) grpCond.biome    = currentBiome;
          if (terrain)      grpCond.terrain  = terrain;
          results.push({
            pokemon_id: grpPokId, game_id: game.id,
            encounter_method: 'group',
            min_level: null, max_level: null,
            encounter_rate: parseRate(groupRate),
            conditions: grpCond,
          });
        }
      }
    }
  }

  return results;
}

// Factory: creates an SV-family parser configured for a specific game pair.
// Used by kita.js and bb.js to share the same parsing logic with different game names.
function makeSVParser({ gameS, gameV, gifts = [] }) {
  function buildDLCGifts(locationName, games) {
    const results = [];
    for (const gift of gifts.filter(g => g.location === locationName)) {
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

  return function parse(html, locationName, games, nameToId) {
    const section = extractSection(html, SECTION_IDS);
    if (!section) {
      return [
        ...buildGiftEncounters(locationName, games),
        ...buildDLCGifts(locationName, games),
      ];
    }

    // Split by h3 sub-sections (e.g. "Small Cave", "Depths" in Area Zero) so each
    // sub-area name becomes the initial biome for tables that lack inline biome rows.
    // For sections that DO have inline biome rows (e.g. Upper Field → Prairie/Riverside),
    // the inline rows override the h3 heading immediately.
    const raw = [];
    for (const { heading, html: subHtml } of splitH3Sections(section)) {
      const tables = extractTablesWithContext(subHtml, 'roundy');
      for (const { html: tHtml } of tables) raw.push(...parseSVTable(tHtml, games, nameToId, gameS, gameV, heading));
    }

    const seen = new Set();
    const results = raw.filter(r => {
      const cKey = JSON.stringify(Object.fromEntries(Object.entries(r.conditions || {}).sort()));
      const key = `${r.pokemon_id}|${r.game_id}|${r.encounter_method}|${r.min_level}|${r.max_level}|${r.encounter_rate}|${cKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    results.push(...parseSpecialEncounters(html, games, nameToId));
    results.push(...buildGiftEncounters(locationName, games));
    results.push(...buildDLCGifts(locationName, games));
    return results;
  };
}

// Detect whether a location page belongs to the Kitakami (Teal Mask) or Blueberry
// (Indigo Disk) DLC by reading the location infobox near the top of the page.
// Returns 'Kita', 'BB', or null for base-game Paldea locations.
function detectSVDlc(html) {
  const top = html.slice(0, 5000);
  if (top.includes('Kitakami')) return 'Kita';
  if (top.includes('Unova'))    return 'BB';
  return null;
}

module.exports = makeSVParser({ gameS: 'Scarlet', gameV: 'Violet', gifts: GIFTS });
module.exports.makeSVParser = makeSVParser;
module.exports.detectSVDlc  = detectSVDlc;
