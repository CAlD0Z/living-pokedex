// Grid filters: search, location, sort, hide-caught.

let hideCaught    = false;
let locationFilter = null;
let currentSort   = 'regional';
let originalCardOrder = null;

const locationPokemonCache = new Map();
let allLocationPokemon = null; // Map: loc name → Set of pokemon_ids

// ── Sort ──────────────────────────────────────────────────────────────────────
function initSort() {
  const grid = document.querySelector('.poke-grid');
  if (grid) originalCardOrder = [...grid.querySelectorAll('.poke-card')];
}

function applySort(val) {
  currentSort = val;
  try { localStorage.setItem('ld_sort', val); } catch (e) {}
  const grid = document.querySelector('.poke-grid');
  if (!grid) return;
  if (val === 'regional' && originalCardOrder) {
    for (const card of originalCardOrder) grid.appendChild(card);
  } else {
    const cards = [...grid.querySelectorAll('.poke-card')];
    cards.sort((a, b) => parseInt(a.dataset.dexNum) - parseInt(b.dataset.dexNum));
    for (const card of cards) grid.appendChild(card);
  }
  for (const card of grid.querySelectorAll('.poke-card')) {
    const numEl = card.querySelector('.poke-num');
    if (!numEl) continue;
    const displayNum = val === 'national'
      ? String(parseInt(card.dataset.dexNum) || 0).padStart(3, '0')
      : card.dataset.number;
    numEl.textContent = '#' + displayNum;
  }
  applyFilters();
}

// ── Filter badge on the mobile Filters toggle button ─────────────────────────
function updateFilterBadge() {
  var searchActive = (document.getElementById('search-input')?.value ?? '').trim() !== '';
  var filterActive = hideCaught || searchActive;
  var filterBtn = document.getElementById('filter-toggle');
  if (filterBtn) {
    filterBtn.style.borderColor = filterActive ? '#1a3898' : '';
    filterBtn.style.background  = filterActive ? 'linear-gradient(135deg,#0e2260,#0a1848)' : '';
    filterBtn.style.color       = filterActive ? '#7ab4ff' : '';
  }
  var locBtn = document.getElementById('location-toggle');
  if (locBtn) {
    locBtn.style.borderColor = locationFilter !== null ? '#1a3898' : '';
    locBtn.style.background  = locationFilter !== null ? 'linear-gradient(135deg,#0e2260,#0a1848)' : '';
    locBtn.style.color       = locationFilter !== null ? '#7ab4ff' : '';
  }
}

// ── Hide caught toggle ────────────────────────────────────────────────────────
function toggleHideCaught() {
  hideCaught = !hideCaught;
  try { localStorage.setItem('ld_hideCaught', hideCaught ? '1' : ''); } catch (e) {}
  const btn = document.getElementById('hide-caught-btn');
  if (hideCaught) {
    btn.style.background = 'linear-gradient(135deg,#0e2260,#0a1848)';
    btn.style.color = '#7ab4ff';
    btn.style.borderColor = '#1a3898';
    btn.textContent = 'Show Caught';
  } else {
    btn.style.background = '#0c1526';
    btn.style.color = '#6b7a99';
    btn.style.borderColor = '#182035';
    btn.textContent = 'Hide Caught';
  }
  applyFilters();
  updateLocationCounts();
  populateLocationSelect();
  updateFilterBadge();
}

// ── Location filter ───────────────────────────────────────────────────────────
async function fetchLocationPokemon(name) {
  if (!locationPokemonCache.has(name)) {
    const res  = await fetch('/api/location-pokemon?name=' + encodeURIComponent(name));
    const data = await res.json();
    locationPokemonCache.set(name, new Set(data.pokemon_ids));
  }
  return locationPokemonCache.get(name);
}

function onLocationSelect(val) {
  if (val) filterByLocation(val);
  else clearLocationFilter();
}

async function filterByLocation(name) {
  const sel = document.getElementById('location-select');
  if (sel && sel.value !== name) sel.value = name;
  locationFilter = await fetchLocationPokemon(name);
  document.getElementById('location-clear-btn')?.style.setProperty('display', 'inline-block');
  applyFilters();
  updateLocationCounts();
  refreshEncounterPanel();
  updateFilterBadge();
}

function clearLocationFilter() {
  locationFilter = null;
  const sel = document.getElementById('location-select');
  if (sel) sel.value = '';
  document.getElementById('location-clear-btn')?.style.setProperty('display', 'none');
  applyFilters();
  updateLocationCounts();
  refreshEncounterPanel();
  updateFilterBadge();
}

// Re-render the open detail panel's encounter list — used when the location
// filter changes so the Friend Safari show/hide rule (panel-encounters.js)
// updates live without reselecting the Pokémon.
function refreshEncounterPanel() {
  if (typeof selectedCard !== 'undefined' && selectedCard &&
      typeof panelEncData !== 'undefined' && panelEncData &&
      typeof renderEncounterSection === 'function') {
    renderEncounterSection(panelEncData, selectedCard.dataset.pokemonId);
  }
}

function toggleLocationPanel() {
  const panel = document.getElementById('location-panel');
  const btn   = document.getElementById('location-toggle');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

function closeLocationPanel() {
  const panel = document.getElementById('location-panel');
  const btn   = document.getElementById('location-toggle');
  if (panel) panel.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', function(e) {
  const wrap = document.getElementById('location-toggle-wrap');
  if (wrap && !wrap.contains(e.target)) closeLocationPanel();
});

async function updateLocationCounts() {
  const btns = document.querySelectorAll('#encounter-section button[data-loc]');
  if (!btns.length) return;
  const gridPokemon = new Map();
  for (const card of document.querySelectorAll('.poke-card:not([data-is-form="true"])'))
    gridPokemon.set(card.dataset.pokemonId, card.dataset.caught === 'true');
  const uniqueLocs = [...new Set([...btns].map(b => b.dataset.loc))];
  await Promise.all(uniqueLocs.map(async locName => {
    const ids = await fetchLocationPokemon(locName);
    let count = 0;
    for (const [pid, caught] of gridPokemon) {
      if (!ids.has(pid)) continue;
      if (hideCaught && caught) continue;
      count++;
    }
    for (const btn of btns) {
      if (btn.dataset.loc === locName) {
        const span = btn.querySelector('.loc-count');
        if (span) span.textContent = ' (' + count + ')';
      }
    }
  }));
}

function populateLocationSelect() {
  const sel = document.getElementById('location-select');
  if (!sel || !allLocationPokemon) return;
  const current = sel.value;
  const gridMap = new Map();
  for (const card of document.querySelectorAll('.poke-card:not([data-is-form="true"])'))
    gridMap.set(card.dataset.pokemonId, card.dataset.caught === 'true');
  while (sel.options.length > 1) sel.remove(1);
  for (const [loc, pids] of allLocationPokemon) {
    let count = 0;
    for (const [pid, caught] of gridMap) {
      if (!pids.has(pid)) continue;
      if (hideCaught && caught) continue;
      count++;
    }
    if (count === 0) continue;
    const opt = document.createElement('option');
    opt.value = loc;
    opt.textContent = loc + ' (' + count + ')';
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

// ── Core filter + dividers ────────────────────────────────────────────────────
function applyFilters() {
  const query = (document.getElementById('search-input')?.value ?? '').trim().toLowerCase();
  const isSplit = document.body.classList.contains('split-active');

  // Build cross-pane caught sets for split comparison
  let aCaughtIds = null, bCaughtIds = null;
  if (isSplit && document.getElementById('poke-grid-b')?.querySelector('.poke-card')) {
    aCaughtIds = new Set();
    bCaughtIds = new Set();
    for (const c of document.querySelectorAll('.poke-card')) {
      if (c.dataset.caught !== 'true') continue;
      const p = c.closest('.split-pane')?.dataset.pane;
      if (p === 'a') aCaughtIds.add(c.dataset.pokemonId);
      else if (p === 'b') bCaughtIds.add(c.dataset.pokemonId);
    }
  }

  let visible = 0;
  for (const card of document.querySelectorAll('.poke-card')) {
    const isForm = card.dataset.isForm === 'true';
    const caught = card.dataset.caught === 'true';
    const searchStr = (card.dataset.name + ' ' + (card.dataset.formName||'') + ' ' + card.dataset.number + ' ' + card.dataset.dexNum).toLowerCase();
    const pid = card.dataset.pokemonId;

    card.classList.remove('caught-exclusive', 'sibling-caught');

    let show = true;
    if (aCaughtIds && bCaughtIds) {
      const pane = card.closest('.split-pane')?.dataset.pane;
      const inA = aCaughtIds.has(pid);
      const inB = bCaughtIds.has(pid);
      if (hideCaught && inA && inB) show = false;
      if (pane === 'a') {
        if (inA && !inB) card.classList.add('caught-exclusive');
        else if (!inA && inB) card.classList.add('sibling-caught');
      } else if (pane === 'b') {
        if (inB && !inA) card.classList.add('caught-exclusive');
        else if (!inB && inA) card.classList.add('sibling-caught');
      }
    } else if (hideCaught && caught) {
      show = false;
    }
    if (show && query && !searchStr.includes(query)) show = false;
    if (show && query && card.dataset.bonus === 'true') show = false;
    if (show && locationFilter !== null && !locationFilter.has(pid)) show = false;
    if (show && isForm && locationFilter === null && !(window.__LD?.SETTINGS?.show_forms)) show = false;
    card.style.display = show ? '' : 'none';
    if (show && !isForm && card.dataset.bonus !== 'true') visible++;
  }
  const meta = document.querySelector('.meta');
  if (meta) meta.textContent = visible + ' entries';
  const es = document.getElementById('empty-state');
  if (es) es.style.display = visible ? 'none' : 'block';
  rebuildDividers();
  updateFilterBadge();
  // Update per-pane counts in split mode
  if (document.body.classList.contains('split-active')) {
    let aVis = 0;
    for (const c of document.querySelectorAll('.split-pane[data-pane="a"] .poke-card'))
      if (c.style.display !== 'none' && c.dataset.isForm !== 'true' && c.dataset.bonus !== 'true') aVis++;
    let bVis = 0;
    for (const c of document.querySelectorAll('.split-pane[data-pane="b"] .poke-card'))
      if (c.style.display !== 'none' && c.dataset.isForm !== 'true' && c.dataset.bonus !== 'true') bVis++;
    const ma = document.getElementById('split-a-meta');
    const mb = document.getElementById('split-b-meta');
    if (ma) ma.textContent = aVis + ' entries';
    const gridB = document.getElementById('poke-grid-b');
    if (mb && gridB?.children.length) mb.textContent = bVis + ' entries';
    const esB = document.getElementById('empty-state-b');
    if (esB && gridB?.children.length) esB.style.display = bVis ? 'none' : 'block';
    // Pane A empty state is based only on pane A cards, not the combined count
    if (es) es.style.display = aVis ? 'none' : 'block';
  }
}

function rebuildDividers() {
  const grid = document.querySelector('.poke-grid');
  if (!grid) return;
  const { PLAYER_ID: pid, GAME_ID: gid } = window.__LD;
  _buildDividersForGrid(grid, !!(pid && gid));
  const gridB = document.getElementById('poke-grid-b');
  const paneB = document.querySelector('.split-pane[data-pane="b"]');
  if (gridB) _buildDividersForGrid(gridB, !!(pid && paneB?.dataset.gameId));
}

function _buildDividersForGrid(grid, canMark) {
  for (const d of grid.querySelectorAll('.group-divider')) d.remove();
  const cards = [...grid.querySelectorAll('.poke-card:not([data-bonus="true"])')].filter(c => c.style.display !== 'none');
  for (let i = 0; i < cards.length; i += 30) {
    const start = i + 1;
    const end   = Math.min(i + 30, cards.length);
    const pids  = cards.slice(i, i + 30).map(c => c.dataset.pokemonId).join(',');
    const div   = document.createElement('div');
    div.className    = 'group-divider';
    div.dataset.pids = pids;
    div.innerHTML = `
      <div style="flex:1;height:1px;background:linear-gradient(270deg,#182035,transparent)"></div>
      <span style="font-size:11px;font-weight:700;color:#4a5568;white-space:nowrap">${start}–${end}</span>
      ${canMark ? `
      <button class="grp-div-btn grp-div-catch" onclick="catchGroup(this.closest('.group-divider'))">Catch ${end-start+1}</button>
      <button class="grp-div-btn grp-div-rel" onclick="releaseGroup(this.closest('.group-divider'))">Release ${end-start+1}</button>
      ` : ''}
      <div style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></div>`;
    grid.insertBefore(div, cards[i]);
  }
}
