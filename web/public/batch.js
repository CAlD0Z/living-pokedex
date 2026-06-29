// Batch catch / release, drag-to-select, undo toast, progress bar, card rendering.

let lastBatchAction = null;
let undoTimeout     = null;
let dragging        = false;
let dragTarget      = false;
let dragChanged     = null;
let dragGameId      = null;

// ── Card DOM state ────────────────────────────────────────────────────────────
function setCardCaught(card, caught) {
  card.dataset.caught = caught ? 'true' : 'false';
  card.classList.toggle('caught', caught);
  const t = card.querySelector('.catch-toggle');
  if (t) {
    t.classList.toggle('caught', caught);
    t.textContent = caught ? '✓' : '';
    t.setAttribute('aria-pressed', caught ? 'true' : 'false');
  }
  // Refresh stats panel and evolve button if this card is currently selected
  if (card === selectedCard) {
    statCache.delete(card.dataset.pokemonId);
    loadStats(card.dataset.pokemonId, null);
    if (typeof refreshEvolveBtn === 'function') refreshEvolveBtn();
  }
  // Re-roll the catch-next suggestion when the suggested pokemon is caught
  if (caught && window.__LD.CATCH_NEXT && card.dataset.pokemonId === window.__LD.CATCH_NEXT.id) {
    if (typeof rerollCatchNextForGame === 'function') rerollCatchNextForGame(card.dataset.pokemonId);
  }
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function updateProgressBar() {
  const scope  = document.body.classList.contains('split-active') ? '.split-pane[data-pane="a"] ' : '';
  const all    = document.querySelectorAll(scope + '.poke-card:not([data-is-form="true"]):not([data-bonus="true"])');
  const caught = [...all].filter(c => c.dataset.caught === 'true').length;
  const pct    = all.length > 0 ? Math.round(caught / all.length * 100) : 0;
  const fill   = document.getElementById('progress-fill');
  const cnt    = document.getElementById('progress-caught');
  if (fill) fill.style.width = pct + '%';
  if (cnt)  cnt.textContent  = caught;
  if (all.length > 0 && caught === all.length) {
    if (!window.__ld_done) { window.__ld_done = true; fireConfetti(); }
  } else { window.__ld_done = false; }
}

// ── Undo toast ────────────────────────────────────────────────────────────────
function showUndoToast(pids, caught) {
  if (undoTimeout) { clearTimeout(undoTimeout); undoTimeout = null; }
  lastBatchAction = { pids, caught };
  const toast = document.getElementById('undo-toast');
  const msg   = document.getElementById('undo-msg');
  const bar   = document.getElementById('undo-progress');
  if (!toast || !msg || !bar) return;
  msg.textContent = `${pids.length} Pokémon ${caught ? 'caught' : 'released'} — `;
  bar.style.transition = 'none';
  bar.style.width = '100%';
  toast.style.display = 'flex';
  bar.getBoundingClientRect(); // trigger reflow
  bar.style.transition = 'width 5s linear';
  bar.style.width = '0%';
  undoTimeout = setTimeout(() => {
    toast.style.display = 'none';
    lastBatchAction = null;
    undoTimeout = null;
  }, 5000);
}

async function undoLastBatch() {
  if (!lastBatchAction) return;
  const { pids, caught } = lastBatchAction;
  clearTimeout(undoTimeout);
  undoTimeout = null;
  lastBatchAction = null;
  document.getElementById('undo-toast').style.display = 'none';
  await batchCatch(pids, !caught, true);
}

// ── Batch catch / release ─────────────────────────────────────────────────────
async function batchCatch(pids, caught, skipUndo = false, gameId = null) {
  const { PLAYER_ID, GAME_ID } = window.__LD;
  const gid = gameId || GAME_ID;
  if (!PLAYER_ID || !gid || !pids.length) return;
  const res = await fetch('/api/caught/batch', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ player_id: PLAYER_ID, game_id: gid, pokemon_ids: pids, caught })
  });
  if (!res.ok) { uiAlert('Error updating caught status'); return; }
  const data = await res.json();
  for (const pid of pids) {
    const card = document.querySelector(`.poke-card[data-pokemon-id="${pid}"]`);
    if (card) setCardCaught(card, caught);
  }
  updateProgressBar();
  applyFilters();
  if (!skipUndo) showUndoToast(pids, caught);
  if (data.gameCaught != null && data.gameTotal != null && typeof updateSidebarRing === 'function') {
    updateSidebarRing(gid, data.gameCaught, data.gameTotal);
  }
}

async function persistCaught(cards, caught, gameId = null) {
  if (!cards.length) return;
  const { PLAYER_ID, GAME_ID } = window.__LD;
  const gid = gameId || GAME_ID;
  try {
    const ids = cards.map(c => c.dataset.pokemonId);
    const res = await fetch('/api/caught/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: PLAYER_ID, game_id: gid, pokemon_ids: ids, caught }),
    });
    if (!res.ok) throw new Error('save failed');
    const data = await res.json();
    if (data.gameCaught != null && data.gameTotal != null && typeof updateSidebarRing === 'function') {
      updateSidebarRing(gid, data.gameCaught, data.gameTotal);
    }
  } catch (err) {
    console.error(err);
    cards.forEach(c => setCardCaught(c, !caught));
    updateProgressBar();
    applyFilters();
    uiAlert('Failed to save catch status. Please try again.');
  }
}

// ── Group / range / all helpers ───────────────────────────────────────────────
async function catchGroup(divider) {
  const { PLAYER_ID } = window.__LD;
  if (!PLAYER_ID) return;
  const paneGameId = divider.closest('.split-pane')?.dataset.gameId || null;
  await batchCatch((divider.dataset.pids || '').split(',').filter(Boolean), true, false, paneGameId);
}

async function releaseGroup(divider) {
  const { PLAYER_ID } = window.__LD;
  if (!PLAYER_ID) return;
  const pids = (divider.dataset.pids || '').split(',').filter(Boolean);
  if (!(await uiConfirm(`Release ${pids.length} Pokémon? They will be unmarked as caught.`))) return;
  const paneGameId = divider.closest('.split-pane')?.dataset.gameId || null;
  await batchCatch(pids, false, false, paneGameId);
}

function getVisiblePidsInRange(from, to) {
  return [...document.querySelectorAll('.poke-card')]
    .filter(c => c.style.display !== 'none')
    .filter(c => { const n = parseInt(c.dataset.number || '0', 10); return n >= from && n <= to; })
    .map(c => c.dataset.pokemonId);
}

async function catchRange(from, to) {
  const { PLAYER_ID, GAME_ID } = window.__LD;
  if (!PLAYER_ID || !GAME_ID) return;
  await batchCatch(getVisiblePidsInRange(from, to), true);
}

async function releaseRange(from, to) {
  const { PLAYER_ID, GAME_ID } = window.__LD;
  if (!PLAYER_ID || !GAME_ID) return;
  const pids = getVisiblePidsInRange(from, to);
  if (!pids.length) return;
  if (!(await uiConfirm(`Release ${pids.length} Pokémon (#${from}–${to})? They will be unmarked as caught.`))) return;
  await batchCatch(pids, false, true);
}

function getAllVisiblePids() {
  return [...document.querySelectorAll('.poke-card')]
    .filter(c => c.style.display !== 'none' && c.dataset.isForm !== 'true')
    .map(c => c.dataset.pokemonId);
}

async function catchAll() {
  const { PLAYER_ID, GAME_ID } = window.__LD;
  if (!PLAYER_ID || !GAME_ID) return;
  await batchCatch(getAllVisiblePids(), true);
}

async function releaseAll() {
  const { PLAYER_ID, GAME_ID } = window.__LD;
  if (!PLAYER_ID || !GAME_ID) return;
  const pids = getAllVisiblePids();
  if (!pids.length) return;
  if (!(await uiConfirm(`Release ${pids.length} Pokémon? They will be unmarked as caught.`))) return;
  await batchCatch(pids, false);
}

// ── Drag-to-select ────────────────────────────────────────────────────────────
function paintCard(card) {
  if (!card || dragChanged.has(card)) return;
  dragChanged.add(card);
  if ((card.dataset.caught === 'true') === dragTarget) return;
  setCardCaught(card, dragTarget);
  updateProgressBar();
}

function onCatchPointerDown(e) {
  const toggle = e.target.closest && e.target.closest('.catch-toggle');
  if (!toggle) return;
  e.preventDefault();
  e.stopPropagation();
  const card = toggle.closest('.poke-card');
  if (!card) return;
  const pane = card.closest('.split-pane');
  const gid  = (pane?.dataset.gameId) || window.__LD.GAME_ID;
  const { PLAYER_ID } = window.__LD;
  if (!PLAYER_ID || !gid) { uiAlert('Select a game first to track catches.'); return; }
  dragGameId  = gid;
  dragging    = true;
  dragTarget  = card.dataset.caught !== 'true';
  dragChanged = new Set();
  document.body.classList.add('dragging');
  if (e.pointerId != null && toggle.releasePointerCapture) {
    try { toggle.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  paintCard(card);
}

function onDragMove(e) {
  if (!dragging) return;
  const el   = document.elementFromPoint(e.clientX, e.clientY);
  const card = el && el.closest ? el.closest('.poke-card') : null;
  if (card) paintCard(card);
}

function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  document.body.classList.remove('dragging');
  const changed = Array.from(dragChanged).filter(c => (c.dataset.caught === 'true') === dragTarget);
  const gid = dragGameId;
  dragChanged = null;
  dragGameId  = null;
  applyFilters();
  persistCaught(changed, dragTarget, gid);
  if (changed.length) showUndoToast(changed.map(c => c.dataset.pokemonId), dragTarget);
}

document.addEventListener('pointerdown', onCatchPointerDown);
window.addEventListener('pointermove', onDragMove);
window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', onDragEnd);

// ── DOM-API card rendering (used by AJAX game switch) ─────────────────────────
// Returns a Promise so callers can await full render before querying the DOM.
// Clears the grid synchronously then yields one frame so the browser can paint
// the cleared state before the new cards are inserted, giving a crisp transition.
async function renderCardsDOM(cards) {
  const grid = document.querySelector('.poke-grid');
  if (!grid) return;
  grid.replaceChildren(); // paint empty grid before building new cards
  await new Promise(r => requestAnimationFrame(r));
  const { GAME_COLORS, CATCH_NEXT } = window.__LD;
  const catchNextId = CATCH_NEXT?.id ?? null;
  const EXCL_DEFAULT = '#e0b020';
  const frag = document.createDocumentFragment();
  for (const c of cards) {
    const isCN = catchNextId && c.id === catchNextId;
    const div = document.createElement('div');
    div.className = 'poke-card' + (c.caught ? ' caught' : '') + (isCN ? ' catch-next' : '');
    div.dataset.pokemonId = c.id;
    div.dataset.name      = c.name;
    div.dataset.number    = c.num;
    div.dataset.dexNum    = String(c.dexNum);
    div.dataset.type1     = c.type1;
    div.dataset.type2     = c.type2;
    div.dataset.formName  = c.formName;
    div.dataset.icon      = c.icon;
    div.dataset.shinyIcon = c.icon.replace('/normal/', '/shiny/');
    div.dataset.useShiny  = c.useShiny ? 'true' : 'false';
    div.dataset.gen       = c.gen;
    div.dataset.caught    = c.caught ? 'true' : 'false';
    div.dataset.isForm    = c.isForm ? 'true' : 'false';
    div.dataset.exclNames = c.exclNames;
    div.style.setProperty('--tc', c.tc);
    if (c.isForm) div.style.display = 'none';
    div.onclick = function() { selectPokemon(this); };

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'catch-toggle' + (c.caught ? ' caught' : '');
    btn.setAttribute('aria-label', 'Toggle caught');
    btn.setAttribute('aria-pressed', c.caught ? 'true' : 'false');
    btn.textContent = c.caught ? '✓' : '';
    btn.setAttribute('touch-action', 'none');
    btn.onclick = e => e.stopPropagation();
    div.appendChild(btn);

    if (c.exclNames && c.exclGames?.length) {
      const badge = document.createElement('div');
      badge.className = 'excl-badge';
      badge.title = c.exclMode === 'group'
        ? 'Version exclusive — only available in ' + c.exclNames
        : "Can't be caught here — trade from " + c.exclNames;
      badge.innerHTML = c.exclGames.map((g, i) =>
        `<span style="color:${GAME_COLORS[g.name] ?? EXCL_DEFAULT}">${g.abbr}</span>` +
        (i < c.exclGames.length - 1 ? '<span class="excl-sep">/</span>' : '')
      ).join('');
      div.appendChild(badge);
    }

    const img = document.createElement('img');
    img.src    = c.icon;
    img.width  = 56; img.height = 56;
    img.loading = 'lazy';
    img.style.cssText = 'object-fit:contain;display:block;margin:0 auto';
    div.appendChild(img);

    const num = document.createElement('div');
    num.className   = 'poke-num';
    num.textContent = '#' + c.num;
    div.appendChild(num);

    const name = document.createElement('div');
    name.className   = 'poke-name';
    name.textContent = c.name;
    div.appendChild(name);

    if (isCN) {
      const badge = document.createElement('div');
      badge.className = 'catch-next-badge';
      badge.textContent = 'Catch Next';
      div.appendChild(badge);
    }

    frag.appendChild(div);
  }
  grid.replaceChildren(frag);
}
