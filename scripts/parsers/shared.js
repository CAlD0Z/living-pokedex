'use strict';

// ── HTTP ──────────────────────────────────────────────────────────────────────

const BULBA_BASE = 'https://bulbapedia.bulbagarden.net';

async function fetchBulbapedia(slug) {
  const url = `${BULBA_BASE}/wiki/${slug}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── HTML utilities ────────────────────────────────────────────────────────────

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Extract the first /wiki/... link from a cell's raw HTML.
// Returns the decoded page title (spaces, not underscores), or null.
function extractWikiLink(cellHtml) {
  // Iterate all /wiki/ hrefs in the cell, skipping File:/Category: namespace links
  // that appear as sprite images in newer Bulbapedia table layouts.
  const re = /href="\/wiki\/([^"?#]+)"/g;
  let m;
  while ((m = re.exec(cellHtml || '')) !== null) {
    const raw = m[1];
    if (/^(File|Category|Template|Help|User):/i.test(decodeURIComponent(raw))) continue;
    try {
      return decodeURIComponent(raw.replace(/_/g, ' '));
    } catch (_) {
      return raw.replace(/_/g, ' ');
    }
  }
  return null;
}

// ── Table expansion ───────────────────────────────────────────────────────────
// Returns a 2D array of { text, html } objects.
// Handles rowspan, colspan, AND nested tables inside cells.

// Extract the <tr> blocks that are DIRECT children of a table (not nested).
// Uses depth counting on <table>/<table> tags to skip nested tables.
function extractDirectRows(tableHtml) {
  const rows = [];
  let depth = 0;
  let rowStart = -1;
  let pos = 0;

  while (pos < tableHtml.length) {
    let nearest = Infinity, nearestType = null;
    const check = (s, t) => { const i = tableHtml.indexOf(s, pos); if (i >= 0 && i < nearest) { nearest = i; nearestType = t; } };
    check('<table', 'topen');
    check('</table>', 'tclose');
    check('<tr',    'ropen');
    check('</tr>',  'rclose');
    if (!nearestType) break;

    if (nearestType === 'topen') {
      depth++;
      pos = nearest + 6;
    } else if (nearestType === 'tclose') {
      depth--;
      if (depth === 0) break; // closed our outer table
      pos = nearest + 8;
    } else if (nearestType === 'ropen' && depth === 1) {
      rowStart = nearest;
      pos = nearest + 3;
    } else if (nearestType === 'rclose' && depth === 1 && rowStart >= 0) {
      rows.push(tableHtml.slice(rowStart, nearest + 5));
      rowStart = -1;
      pos = nearest + 5;
    } else {
      pos = nearest + 1;
    }
  }
  return rows;
}

// Extract <td>/<th> cells from a single <tr> block.
// Tracks nested table depth so cells inside nested tables are skipped.
function extractCellsFromRow(rowHtml) {
  const cells = [];
  let depth = 0;  // nested table depth
  let cellStart = -1;
  let cellTag = null;
  let pos = 0;

  while (pos < rowHtml.length) {
    let nearest = Infinity, nearestType = null;
    const check = (s, t) => { const i = rowHtml.indexOf(s, pos); if (i >= 0 && i < nearest) { nearest = i; nearestType = t; } };
    check('<table',  'topen');
    check('</table>','tclose');
    check('<td',     'td');
    check('</td>',   '/td');
    check('<th',     'th');
    check('</th>',   '/th');
    if (!nearestType) break;

    if (nearestType === 'topen') {
      depth++; pos = nearest + 6;
    } else if (nearestType === 'tclose') {
      depth--; pos = nearest + 8;
    } else if ((nearestType === 'td' || nearestType === 'th') && depth === 0) {
      // Check it's a real tag (next char is >, space, or newline)
      const nc = rowHtml[nearest + nearestType.length + 1];
      if (nc === '>' || nc === ' ' || nc === '\n' || nc === '\t' || nc === '\r') {
        cellStart = nearest;
        cellTag = nearestType;
      }
      pos = nearest + nearestType.length + 1;
    } else if ((nearestType === '/td' || nearestType === '/th') && depth === 0 && cellStart >= 0) {
      if (nearestType === '/' + cellTag) {
        // Found matching close tag — extract cell
        const closeEnd = nearest + nearestType.length + 3; // </td> = 5 chars
        const tagEndIdx = rowHtml.indexOf('>', cellStart + cellTag.length + 1);
        const attrs = rowHtml.slice(cellStart + cellTag.length + 1, tagEndIdx);
        const content = rowHtml.slice(tagEndIdx + 1, nearest);
        const colspan = parseInt(attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1] ?? '1', 10);
        const rowspan = parseInt(attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1] ?? '1', 10);
        cells.push({ html: content, text: stripTags(content), colspan, rowspan });
        cellStart = -1;
        pos = closeEnd;
      } else {
        pos = nearest + 5; // skip mismatched closing tag
      }
    } else {
      pos = nearest + 1;
    }
  }
  return cells;
}

function expandTable(tableHtml) {
  const rawRows = extractDirectRows(tableHtml).map(r => extractCellsFromRow(r));

  const grid = [];
  const occupied = new Map(); // "r,c" -> {text, html}

  for (let r = 0; r < rawRows.length; r++) {
    grid[r] = [];
    let col = 0;

    for (const cell of rawRows[r]) {
      while (occupied.has(`${r},${col}`)) {
        grid[r].push(occupied.get(`${r},${col}`));
        col++;
      }
      const obj = { html: cell.html, text: cell.text };
      for (let dc = 0; dc < cell.colspan; dc++) {
        grid[r].push(obj);
        if (cell.rowspan > 1) {
          for (let dr = 1; dr < cell.rowspan; dr++) {
            occupied.set(`${r + dr},${col + dc}`, obj);
          }
        }
      }
      col += cell.colspan;
    }
    while (occupied.has(`${r},${col}`)) {
      grid[r].push(occupied.get(`${r},${col}`));
      col++;
    }
  }

  return grid;
}

// ── Section / table extraction ────────────────────────────────────────────────

// Returns the HTML between a heading with one of the given ids and the next heading
// of equal or higher level. Works for both <h2> and <h3> headings.
// ids: plain strings matched against id="..." attribute values.
function extractSection(html, ids) {
  for (const id of ids) {
    const idx = html.indexOf(`id="${id}"`);
    if (idx === -1) continue;

    // Detect whether this id lives in an h2 or h3 by whichever opener is closer
    const h2Open = html.lastIndexOf('<h2', idx);
    const h3Open = html.lastIndexOf('<h3', idx);
    const tag = h3Open > h2Open ? 'h3' : 'h2';

    // Find the closing tag of this heading element
    const closeTag = `</${tag}>`;
    const headingClose = html.indexOf(closeTag, idx);
    if (headingClose === -1) continue;
    const sectionStart = headingClose + closeTag.length;

    // Section ends at the next heading of same or higher level
    const nextH2 = html.indexOf('<h2', sectionStart);
    let sectionEnd = nextH2 === -1 ? html.length : nextH2;
    if (tag === 'h3') {
      const nextH3 = html.indexOf('<h3', sectionStart);
      if (nextH3 !== -1 && nextH3 < sectionEnd) sectionEnd = nextH3;
    }

    return html.slice(sectionStart, sectionEnd);
  }
  return null;
}

// Convert an h4/h5 heading text to a floor/area label, or null if it's not a floor heading.
function headingToFloor(heading) {
  if (!heading) return null;
  let h = heading.trim();
  const lower = h.toLowerCase();
  // Skip generation/pokémon/game headings
  if (/^generation\s+/i.test(h))  return null;
  if (lower.startsWith('pokémon')) return null;
  if (lower.startsWith('pokemon')) return null;
  if (lower.startsWith('available')) return null;
  if (lower.startsWith('in the')) return null;
  if (lower.startsWith('in pok'))  return null;
  if (lower === 'interior')        return null;
  if (lower === 'exterior')        return null;
  if (h.length > 60)               return null; // too long to be a floor label
  // Normalize Japanese cave room notation: "1R" → "Room 1", "B1F 2R" → "B1F Room 2"
  h = h.replace(/\b(\d+)R\b/g, 'Room $1');
  return h || null;
}

// Like extractTables but also returns the preceding h4/h5 heading for each table.
// Returns [{heading: 'B1F'|null, html: tableHtml}]
function extractTablesWithContext(html, tableClass = 'wikitable') {
  const results = [];
  let currentHeading = null;
  let pos = 0;

  while (pos < html.length) {
    // Find nearest of: <h4, <h5, <h6, or the next matching <table
    let nearest = Infinity, nearestType = null;
    const check = (s, t) => { const i = html.indexOf(s, pos); if (i >= 0 && i < nearest) { nearest = i; nearestType = t; } };
    check('<h4', 'h4');
    check('<h5', 'h5');
    check('<h6', 'h6');
    check('<table', 'table');
    if (!nearestType) break;

    if (nearestType === 'h4' || nearestType === 'h5' || nearestType === 'h6') {
      const closeTag = `</${nearestType}>`;
      const closeIdx = html.indexOf(closeTag, nearest);
      if (closeIdx >= 0) {
        const raw = html.slice(nearest, closeIdx + closeTag.length).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        currentHeading = headingToFloor(raw);
        pos = closeIdx + closeTag.length;
      } else {
        pos = nearest + 3;
      }
    } else {
      // table
      const tagEnd = html.indexOf('>', nearest);
      if (tagEnd < 0) break;
      const openTag = html.slice(nearest, tagEnd + 1);

      if (!openTag.includes(tableClass)) {
        pos = tagEnd + 1;
        continue;
      }

      // Depth-count to find matching </table>
      let depth = 1, cur = tagEnd + 1;
      while (depth > 0 && cur < html.length) {
        const nextOpen  = html.indexOf('<table', cur);
        const nextClose = html.indexOf('</table>', cur);
        if (nextClose === -1) { cur = html.length; break; }
        if (nextOpen !== -1 && nextOpen < nextClose) { depth++; cur = nextOpen + 6; }
        else { depth--; cur = nextClose + 8; }
      }

      results.push({ heading: currentHeading, html: html.slice(nearest, cur) });
      pos = cur;
      // Keep currentHeading — multiple tables can share the same floor heading
    }
  }

  return results;
}

// Extract all <table class="<tableClass>"...>...</table> blocks from html.
// Handles nested tables correctly by depth-counting <table> tags.
// tableClass defaults to 'wikitable'; pass 'roundy' for Bulbapedia encounter tables.
function extractTables(html, tableClass = 'wikitable') {
  const tables = [];
  let pos = 0;

  while (pos < html.length) {
    const start = html.indexOf('<table', pos);
    if (start === -1) break;

    const tagEnd = html.indexOf('>', start);
    if (tagEnd === -1) break;

    const openTag = html.slice(start, tagEnd + 1);
    if (!openTag.includes(tableClass)) {
      pos = tagEnd + 1;
      continue;
    }

    // Depth-count to find matching </table>
    let depth = 1;
    let cur = tagEnd + 1;
    while (depth > 0 && cur < html.length) {
      const nextOpen  = html.indexOf('<table', cur);
      const nextClose = html.indexOf('</table>', cur);
      if (nextClose === -1) { cur = html.length; break; }
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        cur = nextOpen + 6;
      } else {
        depth--;
        cur = nextClose + 8;
      }
    }

    tables.push(html.slice(start, cur));
    pos = cur;
  }

  return tables;
}

// Extract the HTML between an <h3> heading with one of the given ids and the next
// <h3> or <h2> — useful for isolating a generation's subsection inside the Pokémon section.
function extractSubsection(html, ids) {
  for (const id of ids) {
    const idx = html.indexOf(`id="${id}"`);
    if (idx === -1) continue;

    const h3Close = html.indexOf('</h3>', idx);
    if (h3Close === -1) continue;
    const start = h3Close + 5;

    const nextH3 = html.indexOf('<h3', start);
    const nextH2 = html.indexOf('<h2', start);
    let end = html.length;
    if (nextH3 >= 0 && nextH3 < end) end = nextH3;
    if (nextH2 >= 0 && nextH2 < end) end = nextH2;

    return html.slice(start, end);
  }
  return null;
}

// ── Field parsers ─────────────────────────────────────────────────────────────

function parseLevels(str) {
  str = (str || '').trim();
  // Range: "3-5" or "3–5" (em dash)
  const rangeM = str.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeM) return { min: parseInt(rangeM[1], 10), max: parseInt(rangeM[2], 10) };
  // List: "3, 4, 5" or "3,4,5"
  const nums = str.match(/\d+/g);
  if (nums?.length) {
    const levels = nums.map(Number);
    return { min: Math.min(...levels), max: Math.max(...levels) };
  }
  return { min: null, max: null };
}

function parseRate(str) {
  const m = (str || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

const METHOD_MAP = {
  'grass':       'grass',
  'walking':     'grass',
  'land':        'grass',
  'long grass':  'long-grass',
  'tall grass':  'grass',
  'cave':        'cave',
  'surfing':     'surfing',
  'surf':        'surfing',
  'water':       'surfing',
  'fishing':     'fishing',
  'old rod':     'old-rod',
  'good rod':    'good-rod',
  'super rod':   'super-rod',
  'headbutt':    'headbutt',
  'rock smash':  'rock-smash',
  'sweet scent': 'sweet-scent',
  'honey':       'honey',
  'pokeradar':   'pokeradar',
  'poke radar':  'pokeradar',
  'dark grass':       'dark-grass',
  'shaking':          'shaking-grass',
  'rustling grass':   'rustling-grass',
  'rippling water':   'rippling-water',
  'dark water':       'dark-water',
  'special':     'special',
};

function normalizeMethod(str) {
  const s = (str || '').trim().toLowerCase();
  return METHOD_MAP[s] ?? s.replace(/\s+/g, '-');
}

// ── Pokemon name → pokedex ID ─────────────────────────────────────────────────

// Overrides for cases where Bulbapedia display name != our pokedex.name
const BULBAPEDIA_NAME_OVERRIDES = {
  "Farfetch'd":     "Farfetch'd",
  'Nidoran♀':       'Nidoran♀',
  'Nidoran♂':       'Nidoran♂',
  'Mr. Mime':       'Mr. Mime',
  'Mime Jr.':       'Mime Jr.',
  'Mr. Rime':       'Mr. Rime',
  'Porygon-Z':      'Porygon-Z',
  'Type: Null':     'Type: Null',
  'Jangmo-o':       'Jangmo-o',
  'Hakamo-o':       'Hakamo-o',
  'Kommo-o':        'Kommo-o',
  'Tapu Koko':      'Tapu Koko',
  'Tapu Lele':      'Tapu Lele',
  'Tapu Bulu':      'Tapu Bulu',
  'Tapu Fini':      'Tapu Fini',
  'Ho-Oh':          'Ho-oh',
  'Flabébé':        'Flabébé',
  "Sirfetch'd":     "Sirfetch'd",
  'Wo-Chien':       'Wo-Chien',
  'Chien-Pao':      'Chien-Pao',
  'Ting-Lu':        'Ting-Lu',
  'Chi-Yu':         'Chi-Yu',
};

function cleanBulbaTitle(raw) {
  // Strip disambiguation suffix: " (Pokémon)" or " (Pok%C3%A9mon)"
  return raw
    .replace(/\s*\(Pok[eé%C3A9]+mon\)\s*$/i, '')
    .replace(/\s*\(pok[eé]+mon\)\s*$/i, '')
    .trim();
}

// Extract the alt text from the first meaningful sprite image in a cell.
// Bulbapedia uses form-specific alt text (e.g. "Alolan Rattata", "Paldean Wooper",
// "Tauros (Combat Breed)") which lets us resolve regional/variant forms correctly.
function extractSpriteFormHint(cellHtml) {
  const altRe = /\balt="([^"]*)"/g;
  let m;
  while ((m = altRe.exec(cellHtml || '')) !== null) {
    const alt = m[1].trim();
    if (alt.length < 3) continue;
    // Skip gender symbols, check marks, type-icon alts, and pure-number strings
    if (/^[♂♀✔✘]$/.test(alt)) continue;
    if (/^\d+$/.test(alt)) continue;
    if (/^(fire|water|grass|normal|electric|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy)$/i.test(alt)) continue;
    return alt;
  }
  return null;
}

const REGIONAL_FORM_PREFIXES = ['Alolan', 'Galarian', 'Hisuian', 'Paldean', 'Kantonian'];

// Extract a Pokémon form hint from a table cell's HTML for resolving regional forms.
// Tries sprite alt text first (e.g. alt="Alolan Exeggutor"). If the alt text is just
// the plain species name (no form info), falls back to scanning visible cell text for
// a regional label like "Alolan Form" and constructs e.g. "Alolan Exeggutor".
function extractFormHint(cellHtml, rawWikiTitle) {
  const spriteAlt = extractSpriteFormHint(cellHtml);
  if (spriteAlt && rawWikiTitle) {
    const altCleaned = cleanBulbaTitle(spriteAlt);
    const speciesName = cleanBulbaTitle(BULBAPEDIA_NAME_OVERRIDES[rawWikiTitle] ?? rawWikiTitle);
    if (altCleaned !== speciesName) return spriteAlt; // sprite alt already encodes form info
  } else if (spriteAlt) {
    return spriteAlt;
  }

  // Fallback: look for form hints in the visible cell text
  if (rawWikiTitle) {
    const cellText = stripTags(cellHtml);
    const speciesName = cleanBulbaTitle(BULBAPEDIA_NAME_OVERRIDES[rawWikiTitle] ?? rawWikiTitle);

    // Gender detection for species with dimorphic forms (e.g. Meowstic ♀/♂).
    // Bulbapedia renders these as separate rows with "Female"/"Male" small text or ♀/♂ symbols.
    // nameToId already has "Female {name}" → _1 and "Male {name}" → base form mappings.
    if (/♀|\bFemale\b/i.test(cellText)) return 'Female ' + speciesName;
    if (/♂|\bMale\b/i.test(cellText))   return 'Male '   + speciesName;

    for (const prefix of REGIONAL_FORM_PREFIXES) {
      if (new RegExp('\\b' + prefix + '\\b', 'i').test(cellText)) {
        return prefix + ' ' + speciesName;
      }
    }
  }

  return spriteAlt;
}

function bulbaNameToPokemonId(rawTitle, nameToId, altName = null) {
  // Try the form-specific alt text first (e.g. "Paldean Wooper", "Alolan Rattata")
  if (altName) {
    const altCleaned = cleanBulbaTitle(altName);
    const altResolved = BULBAPEDIA_NAME_OVERRIDES[altCleaned] ?? altCleaned;
    if (nameToId[altResolved] != null) return nameToId[altResolved];
  }
  if (!rawTitle) return null;
  const name = cleanBulbaTitle(rawTitle);
  const resolved = BULBAPEDIA_NAME_OVERRIDES[name] ?? name;
  return nameToId[resolved] ?? null;
}

// ── Game Corner prize parser ──────────────────────────────────────────────────
// Celadon Game Corner (and similar) stores prizes in per-version mini-card tables
// under a "Prize_corner" h3 section. Each version has its own inner table with a
// <th> header naming the game (e.g. "Pokémon Red"). Inside, roundy blacklinks
// mini-cards show Pokemon name, level, and coin cost.
//
// prizeSectionIds: h3 IDs to search for (e.g. ['Prize_corner'])
// genSubsectionIds: h4 IDs for the generation subsection (e.g. ['Generation_I_3'])
// games: the game rows from the DB for this game group
// nameToId: Pokemon name → pokedex id map
//
// Returns encounter records with encounter_method='prize' and conditions={coins:N}

function parseGameCornerPrizes(html, { prizeSectionIds, genSubsectionIds, games, nameToId }) {
  // Find the prize section (h3)
  let prizeSection = null;
  for (const id of prizeSectionIds) {
    const idx = html.indexOf(`id="${id}"`);
    if (idx < 0) continue;
    const h3Close = html.indexOf('</h3>', idx);
    if (h3Close < 0) continue;
    const start = h3Close + 5;
    const nextH2 = html.indexOf('<h2', start);
    const nextH3 = html.indexOf('<h3', start);
    let end = html.length;
    if (nextH2 > 0 && nextH2 < end) end = nextH2;
    if (nextH3 > 0 && nextH3 < end) end = nextH3;
    prizeSection = html.slice(start, end);
    break;
  }
  if (!prizeSection) return [];

  // Narrow to the generation-specific subsection (h4)
  let scope = prizeSection;
  for (const id of genSubsectionIds) {
    const idx = prizeSection.indexOf(`id="${id}"`);
    if (idx < 0) continue;
    const h4Close = prizeSection.indexOf('</h4>', idx);
    if (h4Close < 0) continue;
    const start = h4Close + 5;
    const nextH4 = prizeSection.indexOf('<h4', start);
    const nextH3 = prizeSection.indexOf('<h3', start);
    const nextH2 = prizeSection.indexOf('<h2', start);
    let end = prizeSection.length;
    if (nextH4 > 0 && nextH4 < end) end = nextH4;
    if (nextH3 > 0 && nextH3 < end) end = nextH3;
    if (nextH2 > 0 && nextH2 < end) end = nextH2;
    scope = prizeSection.slice(start, end);
    break;
  }

  // The version-specific tables use inline border-radius styles (no roundy class).
  // Find them by scanning for <th> cells naming a game version, then walking back
  // to find their containing <table>...</table> block.
  const results = [];
  const seen = new Set(); // deduplicate: same pokemon+game may appear in multiple windows

  const thRe = /<th[^>]*>([\s\S]*?)<\/th>/g;
  let thM;
  while ((thM = thRe.exec(scope)) !== null) {
    const headerText = stripTags(thM[1]).toLowerCase();

    // Match to one of our games; skip Japanese-only versions not in our DB
    const matchedGame = games.find(g => headerText.includes(g.name.toLowerCase()));
    if (!matchedGame) continue;

    // Walk backward from the <th> position to find the opening <table> of its container
    const thPos = thM.index;
    let tableStart = -1;
    let depth = 0;
    for (let i = thPos - 1; i >= 0; i--) {
      if (scope.slice(i, i + 8) === '</table>') { depth++; }
      else if (scope.slice(i, i + 6) === '<table') {
        if (depth === 0) { tableStart = i; break; }
        depth--;
      }
    }
    if (tableStart < 0) continue;

    // Walk forward to find the matching </table>
    let tableEnd = -1;
    let tdepth = 0;
    for (let i = tableStart; i < scope.length; i++) {
      if (scope.slice(i, i + 6) === '<table') { tdepth++; }
      else if (scope.slice(i, i + 8) === '</table>') {
        tdepth--;
        if (tdepth === 0) { tableEnd = i + 8; break; }
      }
    }
    if (tableEnd < 0) continue;

    const versionTableHtml = scope.slice(tableStart, tableEnd);

    // Extract all roundy blacklinks mini-cards within this version table
    const cardRe = /class="roundy blacklinks"[\s\S]*?<\/table>/g;
    let cardM;
    while ((cardM = cardRe.exec(versionTableHtml)) !== null) {
      const cardHtml = cardM[0];

      const wikiTitle = extractWikiLink(cardHtml);
      if (!wikiTitle) continue;
      const pokemon_id = bulbaNameToPokemonId(wikiTitle, nameToId);
      if (!pokemon_id) continue;

      // Strip tags before matching level/coins — Bulbapedia wraps "Lv." in <small>
      const cardText = stripTags(cardHtml);

      // Level: "Lv.9" or "Lv. 9"
      const lvM = cardText.match(/Lv\.?\s*(\d+)/i);
      const level = lvM ? parseInt(lvM[1], 10) : null;

      // Coin cost
      const coinM = cardText.match(/(\d[\d,]*)\s+Coins/i);
      const coins = coinM ? parseInt(coinM[1].replace(/,/g, ''), 10) : null;

      const key = `${pokemon_id}|${matchedGame.id}`;
      if (seen.has(key)) continue; // same Pokemon across multiple windows
      seen.add(key);

      results.push({
        pokemon_id,
        game_id:          matchedGame.id,
        encounter_method: 'prize',
        min_level:        level,
        max_level:        level,
        encounter_rate:   null,
        conditions:       coins != null ? { coins } : {},
      });
    }
  }

  return results;
}

// ── Roundy-table parser factory ───────────────────────────────────────────────
// Most Bulbapedia location pages (Gen I through modern) use class="roundy" tables
// with the same visual structure: game-version columns detected by link presence.
// This factory produces a ready-to-use parser given generation-specific config.
//
// config:
//   abbrevToGame   {Object}  e.g. { R: 'Red', B: 'Blue', Y: 'Yellow' }
//   sectionIds     {Array}   heading IDs to search for the "Pokémon" section
//   genSubsectionIds {Array} h3 IDs for the specific generation subsection
//
// Returned function signature: parse(html, locationName, games, nameToId) → [{...}]

function makeRoundyParser(config) {
  const { abbrevToGame, sectionIds, genSubsectionIds, timeLabels } = config;
  // gameColStart: column index where game abbreviations begin (default 1).
  // Set to 2 for Gen VII SM/USUM tables that have an "Allies" column at col 1.
  const gameColStart = config.gameColStart ?? 1;

  // Find the first data row that contains game-abbreviation cells.
  // Skips internal sub-header rows (all-same-text colspan rows).
  function findFirstDataRowIdx(grid) {
    for (let r = 1; r < Math.min(grid.length, 10); r++) {
      const row = grid[r];
      if (!row || row.length < 3) continue;

      // Sub-header row: every unique cell object has the same text
      const uniqueTexts = new Set([...new Set(row.map(c => c))].map(c => (c.text || '').trim()));
      if (uniqueTexts.size === 1) continue;

      // Game-abbreviation cells: 1-4 letters, must start uppercase (R, B, Y, FR, LG, Pt, Sw, Sh …)
      const seen = new Set();
      for (let c = gameColStart; c < row.length; c++) {
        const cell = row[c];
        if (!cell || seen.has(cell)) continue;
        seen.add(cell);
        if (/^[A-Z][a-zA-Z0-9]{0,3}$/.test((cell.text || '').trim())) return r;
        break;
      }
    }
    return -1;
  }

  // Detect game-version column positions from a data row.
  function detectGameCols(dataRow) {
    const seen = new Set();
    const cols = [];
    for (let c = gameColStart; c < dataRow.length; c++) {
      const cell = dataRow[c];
      if (!cell) break;
      if (seen.has(cell)) continue;
      seen.add(cell);
      const text = (cell.text || '').trim();
      if (/^[A-Z][a-zA-Z0-9]{0,3}$/.test(text)) {
        cols.push({ col: c, abbrev: text });
      } else {
        break;
      }
    }
    return cols;
  }

  // Extract meaningful conditions from a sub-header row's text.
  // Returns an object to merge into encounter conditions for the rows that follow.
  function parseSubHeaderContext(text) {
    const t = text.trim();
    const lower = t.toLowerCase();

    // "During a Yanma swarm" / "During Yanma swarm" / "Yanma swarm"
    const swarmM = t.match(/during (?:a |the )?(\w[\w\s'-.]*?) swarm/i)
                ?? t.match(/^(\w[\w\s'-.]+?) swarm$/i);
    if (swarmM) return { swarm: swarmM[1].trim() };

    // "Headbutt tree (X chances of battle)"
    if (lower.includes('high chances'))     return { headbutt_odds: 'high' };
    if (lower.includes('moderate chances')) return { headbutt_odds: 'moderate' };
    if (lower.includes('low chances'))      return { headbutt_odds: 'low' };

    // "Using Poké Radar" (DPPT)
    if (lower.includes('poké radar') || lower.includes('poke radar') || lower.includes('pokéradar'))
      return { pokeradar: true };

    // "GBA cartridge inserted" (DPPT)
    if (lower.includes('gba') && lower.includes('cart')) return { gba_cartridge: true };

    // "Bug-Catching Contest" (HGSS)
    if (lower.includes('bug-catching') || lower.includes('bug catching')) return { bug_catching_contest: true };

    // "DexNav" (ORAS)
    if (lower.includes('dexnav')) return { dexnav: true };

    // "Special Pokémon" (RSE route 119 Feebas, etc.)
    if (lower.includes('special')) return { special: true };

    // Weather conditions (SwSh)
    const WEATHER = ['normal weather','overcast','raining','thunderstorm','snowing','blizzard','intense sun','sandstorm','fog','heavy fog'];
    if (WEATHER.includes(lower)) return { weather: lower.replace(/\s+/g, '_') };

    // Method-separator rows (Surfing, Fishing, Headbutt, Gift Pokémon, etc.) → clear context
    return {};
  }

  // Parse one outer roundy table.
  // floorHeading: the h4/h5 text that preceded this table in the page (e.g. "B1F"), or null.
  function parseRoundyTable(tableHtml, games, nameToId, locationName, floorHeading) {
    const grid = expandTable(tableHtml);
    if (grid.length < 2) return [];

    const headerTexts = grid[0].map(c => (c.text || '').toLowerCase().trim());
    if (!headerTexts.some(h => h.includes('pokémon') || h.includes('pokemon'))) return [];
    if (!headerTexts.some(h => h === 'levels' || h === 'level')) return [];

    const dataRowIdx = findFirstDataRowIdx(grid);
    if (dataRowIdx < 0) {
      console.warn(`no game columns in "${locationName}"`);
      return [];
    }
    const gameCols = detectGameCols(grid[dataRowIdx]);
    if (!gameCols.length) {
      console.warn(`no game columns in "${locationName}"`);
      return [];
    }

    const locationCol = headerTexts.findIndex(h => h === 'location' || h === 'area');
    const levelCol    = headerTexts.findIndex(h => h === 'levels' || h === 'level');
    const rateCol     = headerTexts.findIndex(h => h === 'rate' || h === 'rarity');

    const results = [];
    // Floor/area from the h4/h5 heading that preceded this table in the page
    const floorCtx = floorHeading ? { floor: floorHeading } : {};
    let subHeaderCtx = {}; // conditions from sub-header rows within the table

    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      if (!row || row.length < 3) continue;

      // Sub-header row: all unique cell objects share the same text
      const uniqueTexts = new Set([...new Set(row.map(c => c))].map(c => (c.text || '').trim()));
      if (uniqueTexts.size === 1) {
        subHeaderCtx = parseSubHeaderContext([...uniqueTexts][0]);
        continue;
      }

      const cellHtml0 = row[0]?.html || '';
      const wikiTitle = extractWikiLink(cellHtml0);
      if (!wikiTitle) continue;
      const pokemon_id = bulbaNameToPokemonId(wikiTitle, nameToId, extractFormHint(cellHtml0, wikiTitle));
      if (!pokemon_id) {
        const t = (row[0]?.text || '').trim();
        if (t && t.length > 1 && !/^[\d%]+$/.test(t))
          console.warn(`unknown Pokémon "${wikiTitle}" in "${locationName}"`);
        continue;
      }

      // Active games (cell has an <a> link)
      const activeGameIds = [];
      for (const { col, abbrev } of gameCols) {
        if (row[col]?.html?.includes('<a ')) {
          const gameName = abbrevToGame[abbrev];
          if (!gameName) continue;
          const game = games.find(g => g.name.toLowerCase() === gameName.toLowerCase());
          if (game) activeGameIds.push(game.id);
        }
      }
      if (!activeGameIds.length) continue;

      const method = normalizeMethod((locationCol >= 0 ? row[locationCol]?.text : '') || 'grass');
      const { min: min_level, max: max_level } = parseLevels(levelCol >= 0 ? row[levelCol]?.text : '');

      if (timeLabels?.length && rateCol >= 0) {
        // Time-split rates: each rate column maps to a time period
        for (let ti = 0; ti < timeLabels.length; ti++) {
          const rateText = row[rateCol + ti]?.text || '';
          const rate = parseRate(rateText);
          if (!rate) continue; // 0% — skip this time slot
          const conditions = { ...floorCtx, ...subHeaderCtx, time: timeLabels[ti] };
          for (const game_id of activeGameIds) {
            results.push({ pokemon_id, game_id, encounter_method: method,
                           min_level, max_level, encounter_rate: rate, conditions });
          }
        }
      } else {
        const encounter_rate = parseRate(rateCol >= 0 ? row[rateCol]?.text : '');
        const conditions = { ...floorCtx, ...subHeaderCtx };
        for (const game_id of activeGameIds) {
          results.push({ pokemon_id, game_id, encounter_method: method,
                         min_level, max_level, encounter_rate, conditions });
        }
      }
    }
    return results;
  }

  // The returned parser function
  return function parse(html, locationName, games, nameToId) {
    const section = extractSection(html, sectionIds);
    if (!section) {
      console.warn(`no Pokémon section in "${locationName}"`);
      return [];
    }

    const scope = extractSubsection(section, genSubsectionIds) ?? section;
    const tables = extractTablesWithContext(scope, 'roundy');
    if (!tables.length) {
      console.warn(`no roundy tables in "${locationName}"`);
      return [];
    }

    const results = [];
    for (const { heading, html: tHtml } of tables)
      results.push(...parseRoundyTable(tHtml, games, nameToId, locationName, heading));

    // Deduplicate using full conditions so swarm/regular and morning/day/night are distinct
    const seen = new Set();
    return results.filter(r => {
      const condKey = JSON.stringify(Object.fromEntries(Object.entries(r.conditions || {}).sort()));
      const key = `${r.pokemon_id}|${r.game_id}|${r.encounter_method}|${r.min_level}|${r.max_level}|${condKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
}

// ── Special encounter (PKMNbox) parser ────────────────────────────────────────
// Parses the "Special encounters" h3 section found on some location pages.
// Each h4 under it names the game(s), and PKMNnamebox divs carry the Pokémon + level.
//
// games:     the game rows from the DB for this game group
// nameToId:  Pokémon name → pokedex id map

// DLC game names use a "ABBR - Region" format (e.g. "S - Kitakami", "SW - Isle of Armor").
// Bulbapedia h4 headings in Special Encounters sections use the base game name ("Scarlet",
// "Sword", etc.), not the DLC-qualified name, so we need canonical aliases for matching.
const DLC_GAME_ALIASES = {
  's - kitakami':       'scarlet',
  'v - kitakami':       'violet',
  's - blueberry':      'scarlet',
  'v - blueberry':      'violet',
  'sw - isle of armor': 'sword',
  'sh - isle of armor': 'shield',
  'sw - crown tundra':  'sword',
  'sh - crown tundra':  'shield',
};

function matchGamesFromHeading(headingText, games) {
  const lower = headingText.toLowerCase();
  // "Generation IV" or "Generations IV" → all games in this group
  if (/\bgeneration(?:s)?\s+iv\b/i.test(headingText)) return [...games];
  // Match individual game names, resolving DLC-qualified names to their base game aliases
  return games.filter(g => {
    const gLower = g.name.toLowerCase();
    const canonical = DLC_GAME_ALIASES[gLower] ?? gLower;
    return lower.includes(canonical);
  });
}

function parseSpecialEncounters(html, games, nameToId) {
  const specIdx = html.search(/id="Special_[Ee]ncounters"/);
  if (specIdx < 0) return [];

  // Find the h3 close and grab until next h2/h3
  const h3Close = html.indexOf('</h3>', specIdx);
  if (h3Close < 0) return [];
  const sectionStart = h3Close + 5;
  const nextH2 = html.indexOf('<h2', sectionStart);
  const nextH3 = html.indexOf('<h3', sectionStart);
  let sectionEnd = html.length;
  if (nextH2 > 0 && nextH2 < sectionEnd) sectionEnd = nextH2;
  if (nextH3 > 0 && nextH3 < sectionEnd) sectionEnd = nextH3;

  // Strip inline <style> blocks before parsing
  const section = html.slice(sectionStart, sectionEnd)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');

  const results = [];
  const seen = new Set();

  // Walk h4 sub-sections
  const h4Re = /<h4[^>]*>([\s\S]*?)<\/h4>/g;
  let h4Match;
  while ((h4Match = h4Re.exec(section)) !== null) {
    const h4Text = h4Match[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const matchedGames = matchGamesFromHeading(h4Text, games);
    if (!matchedGames.length) continue;

    // Scope from end of this h4 to start of next h4
    const scopeStart = h4Match.index + h4Match[0].length;
    const tempIdx = section.indexOf('<h4', scopeStart);
    const scope = section.slice(scopeStart, tempIdx > 0 ? tempIdx : section.length);

    // Each PKMNnamebox holds the Pokémon name and level
    const nameboxRe = /class="PKMNnamebox[^"]*">([\s\S]*?)<\/div>/g;
    let nbMatch;
    while ((nbMatch = nameboxRe.exec(scope)) !== null) {
      const inner = nbMatch[1];
      const linkM = inner.match(/href="\/wiki\/([^"?#]+)"/);
      if (!linkM) continue;
      const pokemon_id = bulbaNameToPokemonId(
        decodeURIComponent(linkM[1].replace(/_/g, ' ')),
        nameToId
      );
      if (!pokemon_id) continue;

      const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const lvlM = text.match(/Lv\.\s*(\d+)/i);
      const level = lvlM ? parseInt(lvlM[1], 10) : null;

      for (const game of matchedGames) {
        const key = `${pokemon_id}|${game.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({
          pokemon_id,
          game_id: game.id,
          encounter_method: 'special',
          min_level: level,
          max_level: level,
          encounter_rate: null,
          conditions: {},
        });
      }
    }
  }

  return results;
}

// ── Location category scraping ────────────────────────────────────────────────

// Fetch any full URL from Bulbapedia (used for category pages).
async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function shouldSkip(title) {
  return (
    title.includes('(disambiguation)') ||
    /^(Talk|User|Template|File|Category|Help|Bulbapedia):/.test(title)
  );
}

// Section IDs that indicate a Special Encounters block on a location page.
const SPECIAL_SECTION_IDS = [
  'id="Special_encounters"', 'id="Special_Encounters"',
];

// Scrape all pages from a Bulbapedia category, following pagination.
// Returns [{slug, title}] where slug is the /wiki/ path segment.
async function scrapeCategory(category) {
  const locations = [];
  let url = `${BULBA_BASE}/wiki/Category:${category}`;

  while (url) {
    const html = await fetchPage(url);

    const catStart = html.indexOf('class="mw-category');
    if (catStart >= 0) {
      const catEnd  = html.indexOf('</div>', catStart + 500000);
      const catHtml = html.slice(catStart, catEnd > 0 ? catEnd : html.length);
      const itemRe  = /<li><a href="\/wiki\/([^"?#]+)" title="([^"]+)">/g;
      let m;
      while ((m = itemRe.exec(catHtml)) !== null) {
        const slug  = m[1];
        const title = decodeHtmlEntities(m[2]);
        if (!shouldSkip(title)) locations.push({ slug, title });
      }
    }

    const nextM = html.match(/href="([^"]*[?&]pagefrom=[^"]+)"[^>]*>(?:next \d+|Next \d+)/);
    if (nextM) {
      url = BULBA_BASE + nextM[1].replace(/&amp;/g, '&');
      await sleep(400);
    } else {
      url = null;
    }
  }

  return locations;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  BULBA_BASE,
  fetchBulbapedia,
  fetchPage,
  sleep,
  shouldSkip,
  SPECIAL_SECTION_IDS,
  scrapeCategory,
  stripTags,
  decodeHtmlEntities,
  extractWikiLink,
  extractSpriteFormHint,
  extractFormHint,
  expandTable,
  extractSection,
  extractSubsection,
  extractTables,
  parseLevels,
  parseRate,
  normalizeMethod,
  bulbaNameToPokemonId,
  cleanBulbaTitle,
  makeRoundyParser,
  parseGameCornerPrizes,
  parseSpecialEncounters,
  extractTablesWithContext,
  headingToFloor,
};
