const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Regional form → game groups that support those evolutions
const REGIONAL_GAME_GROUPS = {
  alola:  ['SM', 'USUM'],
  galar:  ['SwSh'],
  hisui:  ['PLA'],
  paldea: ['SV'],
};

// Evolutions pokemondb.net omits or the parser misses. Applied after the scrape.
const MANUAL_EVOLUTIONS = [
  { from: '1011', to: '1019', method: 'item', conditions: [{ type: 'use_item', value: 'Syrupy Apple' }] }, // Dipplin → Hydrapple
];

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .trim();
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LivingPokedex/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── HTML traversal helpers ────────────────────────────────────────────────────

// Return index just past the closing </tag> matching the opening tag at `start`
function findClose(html, start, tag) {
  const openRe = new RegExp(`^<${tag}[\\s>/]`);
  const closeStr = `</${tag}>`;
  let depth = 0, i = start;
  while (i < html.length) {
    if (html[i] !== '<') { i++; continue; }
    const sub = html.slice(i);
    if (openRe.test(sub)) { depth++; i += tag.length + 1; }
    else if (sub.startsWith(closeStr)) {
      if (--depth === 0) return i + closeStr.length;
      i += closeStr.length;
    } else { i++; }
  }
  return html.length;
}

// Content between the opening tag's '>' and the matching close tag
function innerOf(html, tag) {
  const gt = html.indexOf('>');
  const closeStr = `</${tag}>`;
  const close = html.lastIndexOf(closeStr);
  if (gt === -1 || close === -1) return '';
  return html.slice(gt + 1, close);
}

// ── Infocard parsing ──────────────────────────────────────────────────────────

// Extract { slug, name, dexNum, formLabel } from a div.infocard element
function extractPokemon(cardHtml) {
  // slug from the first /pokedex/ href
  const slugMatch = cardHtml.match(/href="\/pokedex\/([^"#]+)"/);
  if (!slugMatch) return null;
  const slug = slugMatch[1].trim();

  // ent-name link gives the canonical base name
  const nameMatch = cardHtml.match(/class="ent-name"[^>]*>([^<]+)<\/a>/);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();

  // Dex number from <small>#XXXX</small>
  const numMatch = cardHtml.match(/<small>#0*(\d+)<\/small>/);
  const dexNum = numMatch ? parseInt(numMatch[1], 10) : null;

  // Form label: the <small>TEXT</small> that appears after the ent-name link
  // and is plain text (not a dex number, not type links)
  // e.g., <small>Alolan Rattata</small> or <small>Galarian Slowpoke</small>
  let formLabel = null;
  const afterName = cardHtml.slice(cardHtml.indexOf(nameMatch[0]) + nameMatch[0].length);
  const formSmall = afterName.match(/<small>([^<]+)<\/small>/);
  if (formSmall) {
    const txt = formSmall[1].trim();
    // Skip if it looks like a number (#0001) or is empty
    if (txt && !/^#?\d+$/.test(txt)) formLabel = txt;
  }

  return { slug, name, dexNum, formLabel };
}

// Extract condition text from a span.infocard-arrow element
function extractConditionText(arrowHtml) {
  // Condition is inside <small>(…)</small>
  const smallMatch = arrowHtml.match(/<small>([\s\S]*?)<\/small>/);
  return smallMatch ? stripTags(smallMatch[1]) : stripTags(arrowHtml);
}

// ── Page structure parsing ────────────────────────────────────────────────────

function parseEvolutionPage(html) {
  const pairs = [];
  let pos = 0;

  while (true) {
    const blockStart = html.indexOf('<div class="infocard-filter-block">', pos);
    if (blockStart === -1) break;
    const blockEnd = findClose(html, blockStart, 'div');
    processFilterBlock(html.slice(blockStart, blockEnd), pairs);
    pos = blockEnd;
  }

  return pairs;
}

function processFilterBlock(blockHtml, pairs) {
  // Find top-level infocard-list-evo rows (direct children)
  const inner = innerOf(blockHtml, 'div');
  let pos = 0;

  while (true) {
    const rowStart = inner.indexOf('<div class="infocard-list-evo">', pos);
    if (rowStart === -1) break;
    const rowEnd = findClose(inner, rowStart, 'div');
    processRow(inner.slice(rowStart, rowEnd), pairs);
    pos = rowEnd;
  }
}

function processRow(rowHtml, pairs) {
  const inner = innerOf(rowHtml, 'div');

  if (inner.includes('infocard-evo-split')) {
    processSplitRow(inner, pairs);
  } else {
    processLinearRow(inner, pairs);
  }
}

// Linear: [pokemon] [arrow] [pokemon] [arrow] [pokemon] ...
function processLinearRow(inner, pairs) {
  const tokens = [];
  let pos = 0;

  while (pos < inner.length) {
    const lt = inner.indexOf('<', pos);
    if (lt === -1) break;
    const sub = inner.slice(lt);

    // Pokemon infocard: <div class="infocard "> or <div class="infocard">
    if (/^<div\s[^>]*class="infocard[\s"]/.test(sub)) {
      const end = findClose(inner, lt, 'div');
      const poke = extractPokemon(inner.slice(lt, end));
      if (poke) tokens.push({ type: 'pokemon', data: poke });
      pos = end;
      continue;
    }

    // Arrow span: <span class="infocard infocard-arrow">
    if (/^<span[^>]*class="[^"]*infocard-arrow/.test(sub)) {
      const end = findClose(inner, lt, 'span');
      const text = extractConditionText(inner.slice(lt, end));
      tokens.push({ type: 'arrow', text });
      pos = end;
      continue;
    }

    // Skip anything else
    const gt = inner.indexOf('>', lt);
    pos = gt === -1 ? inner.length : gt + 1;
  }

  // Build pairs: arrow[j] links pokemon[j-1] → pokemon[j+1], stopping at nearest arrow
  for (let j = 0; j < tokens.length; j++) {
    if (tokens[j].type !== 'arrow') continue;

    let from = null;
    for (let k = j - 1; k >= 0; k--) {
      if (tokens[k].type === 'pokemon') { from = tokens[k].data; break; }
      if (tokens[k].type === 'arrow')   break;
    }
    const next = tokens[j + 1];
    if (from && next?.type === 'pokemon') {
      pairs.push({ from, to: next.data, conditionText: tokens[j].text });
    }
  }
}

// Split (branching): [linear part…] [span.infocard-evo-split containing branches]
// e.g. Pichu [arrow] Pikachu [split: Raichu branch | Alolan Raichu branch]
function processSplitRow(inner, pairs) {
  const splitStart = inner.indexOf('<span class="infocard-evo-split">');
  if (splitStart === -1) return;

  const beforeSplit = inner.slice(0, splitStart);

  // 1. Process any linear part before the split (e.g. Pichu → Pikachu)
  processLinearRow(beforeSplit, pairs);

  // 2. The "from" for split branches = last pokemon appearing before the split
  let lastPokemon = null;
  let pos = 0;
  while (pos < beforeSplit.length) {
    const lt = beforeSplit.indexOf('<', pos);
    if (lt === -1) break;
    const sub = beforeSplit.slice(lt);
    if (/^<div\s[^>]*class="infocard[\s"]/.test(sub)) {
      const end = findClose(beforeSplit, lt, 'div');
      const poke = extractPokemon(beforeSplit.slice(lt, end));
      if (poke) lastPokemon = poke;
      pos = end;
    } else {
      const gt = beforeSplit.indexOf('>', lt);
      pos = gt === -1 ? beforeSplit.length : gt + 1;
    }
  }
  if (!lastPokemon) return;

  // 3. Each branch in the split: find its arrow condition + target pokemon
  const splitEnd = findClose(inner, splitStart, 'span');
  const splitHtml = inner.slice(splitStart, splitEnd);
  let branchPos = 0;

  while (true) {
    const bStart = splitHtml.indexOf('<div class="infocard-list-evo">', branchPos);
    if (bStart === -1) break;
    const bEnd = findClose(splitHtml, bStart, 'div');
    const branchHtml = splitHtml.slice(bStart, bEnd);

    // Arrow condition
    let condText = '';
    let bpos = 0;
    while (bpos < branchHtml.length) {
      const lt = branchHtml.indexOf('<', bpos);
      if (lt === -1) break;
      const sub = branchHtml.slice(lt);
      if (/^<span[^>]*class="[^"]*infocard-arrow/.test(sub)) {
        const end = findClose(branchHtml, lt, 'span');
        condText = extractConditionText(branchHtml.slice(lt, end));
        break;
      }
      const gt = branchHtml.indexOf('>', lt);
      bpos = gt === -1 ? branchHtml.length : gt + 1;
    }

    // Target pokemon
    let toPoke = null;
    bpos = 0;
    while (bpos < branchHtml.length) {
      const lt = branchHtml.indexOf('<', bpos);
      if (lt === -1) break;
      const sub = branchHtml.slice(lt);
      if (/^<div\s[^>]*class="infocard[\s"]/.test(sub)) {
        const end = findClose(branchHtml, lt, 'div');
        toPoke = extractPokemon(branchHtml.slice(lt, end));
        break;
      }
      const gt = branchHtml.indexOf('>', lt);
      bpos = gt === -1 ? branchHtml.length : gt + 1;
    }

    if (toPoke) pairs.push({ from: lastPokemon, to: toPoke, conditionText: condText });
    branchPos = bEnd;
  }
}

// ── Condition parsing ─────────────────────────────────────────────────────────

function parseCondition(raw) {
  // pokemondb wraps condition text in (…); strip outer parens and decode
  const text = raw.replace(/\(([^)]*)\)/g, '$1 ').replace(/\s+/g, ' ').trim();
  const conditions = [];
  let method = 'other';

  const levelMatch = text.match(/level\s+(\d+)/i);
  if (levelMatch) {
    method = 'level_up';
    conditions.push({ type: 'min_level', value: levelMatch[1] });
  }

  if (/\btrade\b/i.test(text)) {
    if (method === 'other') method = 'trade';
    const held = text.match(/holding\s+(.+?)(?:,|\s*$)/i);
    if (held) conditions.push({ type: 'held_item', value: held[1].trim() });
  }

  if (/use\s+.+\bstone\b/i.test(text)) {
    method = 'stone';
    const m = text.match(/use\s+(.+?)(?:,|\s*$)/i);
    if (m) conditions.push({ type: 'use_item', value: m[1].trim() });
  } else if (/\buse\s+/i.test(text) && method === 'other') {
    method = 'item';
    const m = text.match(/use\s+(.+?)(?:,|\s*$)/i);
    if (m) conditions.push({ type: 'use_item', value: m[1].trim() });
  }

  if (/high\s+friendship|max\s+friendship/i.test(text)) {
    if (method === 'other') method = 'friendship';
    conditions.push({ type: 'friendship', value: 'high' });
  }

  if (/\blevel\s+up\b/i.test(text) && method === 'other') method = 'level_up';

  // Stat comparisons (Tyrogue-style): Attack > Defense etc.
  if (/attack\s*>\s*defense/i.test(text))         conditions.push({ type: 'stat_comparison', value: 'atk>def' });
  if (/attack\s*<\s*defense|defense\s*>\s*attack/i.test(text)) conditions.push({ type: 'stat_comparison', value: 'def>atk' });
  if (/attack\s*=\s*defense/i.test(text))         conditions.push({ type: 'stat_comparison', value: 'atk=def' });

  // Time of day
  if (/\bdaytime\b|\bduring\s+(?:the\s+)?day\b/i.test(text))     conditions.push({ type: 'time_of_day', value: 'day' });
  if (/\bnighttime\b|\bduring\s+(?:the\s+)?night\b/i.test(text)) conditions.push({ type: 'time_of_day', value: 'night' });

  // Gender
  if (/\bmale\b/i.test(text) && !/female/i.test(text)) conditions.push({ type: 'gender', value: 'male' });
  if (/\bfemale\b/i.test(text))                        conditions.push({ type: 'gender', value: 'female' });

  // Move known
  const moveMatch = text.match(/knowing\s+(.+?)(?:,|\s*$)/i);
  if (moveMatch) { conditions.push({ type: 'move_known', value: moveMatch[1].trim() }); if (method === 'other') method = 'move'; }

  // Move use count
  const moveCountMatch = text.match(/(\d+)\+?\s*times/i);
  if (moveCountMatch) conditions.push({ type: 'move_use_count', value: moveCountMatch[1] });

  // Location
  if (/magnetic\s+field/i.test(text)) { conditions.push({ type: 'location', value: 'Magnetic Field area' }); if (method === 'other') method = 'location'; }
  if (/mossy\s+rock/i.test(text))     { conditions.push({ type: 'location', value: 'Mossy Rock area' });    if (method === 'other') method = 'location'; }
  if (/icy\s+rock/i.test(text))       { conditions.push({ type: 'location', value: 'Icy Rock area' });      if (method === 'other') method = 'location'; }

  // Regional context
  if (/in\s+alola/i.test(text))      conditions.push({ type: 'regional_context', value: 'in_alola' });
  if (/outside\s+alola/i.test(text)) conditions.push({ type: 'regional_context', value: 'outside_alola' });
  if (/in\s+galar/i.test(text))      conditions.push({ type: 'regional_context', value: 'in_galar' });
  if (/outside\s+galar/i.test(text)) conditions.push({ type: 'regional_context', value: 'outside_galar' });
  if (/in\s+hisui/i.test(text))      conditions.push({ type: 'regional_context', value: 'in_hisui' });

  // Weather
  if (/\brain\b/i.test(text)) conditions.push({ type: 'weather', value: 'rain' });

  // Affection
  if (/affection|\d+\s*hearts/i.test(text)) conditions.push({ type: 'affection', value: 'high' });

  return { method, conditions };
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function seed() {
  console.log('Fetching pokemondb.net/evolution ...');
  const html = await fetchPage('https://pokemondb.net/evolution');

  console.log('Parsing evolution pairs ...');
  const rawPairs = parseEvolutionPage(html);
  console.log(`Found ${rawPairs.length} raw pairs`);

  const client = await pool.connect();
  try {
    const { rows: dexRows } = await client.query(
      'SELECT id, pokedex_number, name, form_name FROM pokedex ORDER BY id'
    );

    // name → [{id, form_name}]
    const nameEntries = {};
    for (const r of dexRows) {
      if (!nameEntries[r.name]) nameEntries[r.name] = [];
      nameEntries[r.name].push(r);
    }

    // Resolve a parsed pokemon to a pokedex.id using name + optional form label
    function resolvePokemon(p) {
      const candidates = nameEntries[p.name] || [];
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0].id;

      // formLabel like "Alolan Rattata" → match form_name containing "alola"
      if (p.formLabel) {
        const fl = p.formLabel.toLowerCase();
        for (const [region] of Object.entries(REGIONAL_GAME_GROUPS)) {
          if (fl.includes(region)) {
            const c = candidates.find(c => c.form_name?.toLowerCase().includes(region));
            if (c) return c.id;
          }
        }
      }

      // Prefer base form (form_name IS NULL)
      return (candidates.find(c => c.form_name === null) ?? candidates[0]).id;
    }

    // game group → game IDs
    const { rows: gameRows } = await client.query('SELECT id, game_group FROM games');
    const groupToIds = {};
    for (const g of gameRows) {
      if (!groupToIds[g.game_group]) groupToIds[g.game_group] = [];
      groupToIds[g.game_group].push(g.id);
    }

    // pokedex id → form_name (for game availability)
    const idToFormName = Object.fromEntries(dexRows.map(r => [r.id, r.form_name ?? '']));

    function gameIdsFor(toPokemonId) {
      const fn = idToFormName[toPokemonId].toLowerCase();
      for (const [region, groups] of Object.entries(REGIONAL_GAME_GROUPS)) {
        if (fn.includes(region)) {
          return groups.flatMap(g => groupToIds[g] ?? []);
        }
      }
      return [];
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM evolution_game_availability');
    await client.query('DELETE FROM evolution_conditions');
    await client.query('DELETE FROM evolutions');

    let inserted = 0, skipped = 0;
    const seen = new Set();

    for (const pair of rawPairs) {
      const fromId = resolvePokemon(pair.from);
      const toId   = resolvePokemon(pair.to);

      if (!fromId || !toId) {
        console.warn(`  Skipping unresolved: "${pair.from.name}"${pair.from.formLabel ? ` (${pair.from.formLabel})` : ''} → "${pair.to.name}"${pair.to.formLabel ? ` (${pair.to.formLabel})` : ''}`);
        skipped++;
        continue;
      }

      if (fromId === toId) continue; // degenerate (shouldn't happen)

      const key = `${fromId}→${toId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { method, conditions } = parseCondition(pair.conditionText);

      const { rows: [evo] } = await client.query(
        `INSERT INTO evolutions (from_pokemon_id, to_pokemon_id, method)
         VALUES ($1, $2, $3)
         ON CONFLICT (from_pokemon_id, to_pokemon_id)
           DO UPDATE SET method = EXCLUDED.method
         RETURNING id`,
        [fromId, toId, method]
      );
      const evoId = evo.id;

      await client.query('DELETE FROM evolution_conditions WHERE evolution_id = $1', [evoId]);
      for (const c of conditions) {
        await client.query(
          'INSERT INTO evolution_conditions (evolution_id, condition_type, condition_value) VALUES ($1, $2, $3)',
          [evoId, c.type, c.value]
        );
      }

      const gameIds = gameIdsFor(toId);
      await client.query('DELETE FROM evolution_game_availability WHERE evolution_id = $1', [evoId]);
      for (const gameId of gameIds) {
        await client.query(
          'INSERT INTO evolution_game_availability (evolution_id, game_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [evoId, gameId]
        );
      }

      inserted++;
    }

    for (const m of MANUAL_EVOLUTIONS) {
      const { rows: [evo] } = await client.query(
        `INSERT INTO evolutions (from_pokemon_id, to_pokemon_id, method)
         VALUES ($1, $2, $3)
         ON CONFLICT (from_pokemon_id, to_pokemon_id) DO UPDATE SET method = EXCLUDED.method
         RETURNING id`,
        [m.from, m.to, m.method]
      );
      await client.query('DELETE FROM evolution_conditions WHERE evolution_id = $1', [evo.id]);
      for (const c of m.conditions) {
        await client.query(
          'INSERT INTO evolution_conditions (evolution_id, condition_type, condition_value) VALUES ($1, $2, $3)',
          [evo.id, c.type, c.value]
        );
      }
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`\nInserted ${inserted} evolutions (${MANUAL_EVOLUTIONS.length} manual), skipped ${skipped}`);

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM evolutions');
    console.log(`Total evolutions: ${count}`);

    // Sanity check: Eevee evolutions
    const { rows: eevee } = await client.query(`
      SELECT e.method,
             p2.name AS to_name, p2.form_name,
             COALESCE(
               array_agg(ec.condition_type || '=' || ec.condition_value ORDER BY ec.id)
                 FILTER (WHERE ec.id IS NOT NULL),
               ARRAY[]::text[]
             ) AS conds
      FROM evolutions e
      JOIN pokedex p1 ON p1.id = e.from_pokemon_id
      JOIN pokedex p2 ON p2.id = e.to_pokemon_id
      LEFT JOIN evolution_conditions ec ON ec.evolution_id = e.id
      WHERE p1.name = 'Eevee' AND p1.form_name IS NULL
      GROUP BY e.id, e.method, p2.name, p2.form_name
      ORDER BY p2.name
    `);
    console.log('\nEevee evolutions:');
    for (const r of eevee) {
      const conds = r.conds.length ? ` [${r.conds.join(', ')}]` : '';
      console.log(`  → ${r.to_name}${r.form_name ? ` (${r.form_name})` : ''} via ${r.method}${conds}`);
    }

    // Sanity check: Alolan Rattata
    const { rows: rattata } = await client.query(`
      SELECT p1.id AS from_id, p1.form_name AS from_form,
             e.method, p2.id AS to_id, p2.name AS to_name, p2.form_name AS to_form
      FROM evolutions e
      JOIN pokedex p1 ON p1.id = e.from_pokemon_id
      JOIN pokedex p2 ON p2.id = e.to_pokemon_id
      WHERE p1.name = 'Rattata'
      ORDER BY p1.id
    `);
    console.log('\nRattata evolutions (form-aware):');
    for (const r of rattata) {
      console.log(`  ${r.from_id}${r.from_form ? ` (${r.from_form})` : ''} → ${r.to_id} ${r.to_name}${r.to_form ? ` (${r.to_form})` : ''} via ${r.method}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
