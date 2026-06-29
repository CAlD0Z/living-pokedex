// Entry point: game-select AJAX, modal helpers, confetti, preferences, init.
// Detail panel  → panel.js
// Filters/sort  → filters.js
// Batch catch   → batch.js
// Scraper SSE   → scraper-client.js

// ── Catch-next placeholder ────────────────────────────────────────────────────

function buildCatchNextPlaceholderHtml(cn) {
  if (!cn) {
    return '<div id="dp-placeholder" class="cn-empty"><span class="cn-empty-text">Click any Pokémon to view details</span></div>';
  }
  const tc  = (window.__LD.TYPE_COLORS[cn.type1] || '#223152');
  const num = String(cn.pokedex_number).padStart(3, '0');
  const typeBadges = [cn.type1, cn.type2].filter(Boolean).map(t => {
    const bg = window.__LD.TYPE_COLORS[t] || '#888';
    return `<span class="cn-badge" style="background:${bg}">${t}</span>`;
  }).join('');
  return `<div id="dp-placeholder" class="cn-placeholder" onclick="jumpToCatchNext('${esc(cn.id)}')">
    <div class="cn-label" style="color:${tc}">Catch Next</div>
    <div class="cn-orb" style="background:radial-gradient(circle,${tc}22,transparent 68%)">
      <img src="${esc(cn.icon_url || '')}" width="76" height="76" class="cn-icon" style="filter:drop-shadow(0 2px 10px ${tc}70)">
    </div>
    <div class="cn-info">
      <div class="cn-num">#${num}</div>
      <div class="cn-name">${esc(cn.name)}</div>
      ${cn.form_name ? `<div class="cn-form-name">${esc(cn.form_name)}</div>` : ''}
    </div>
    <div class="cn-types">${typeBadges}</div>
    <div class="cn-hint">Click to jump to this Pokémon</div>
  </div>`;
}

function buildDexCompleteHtml() {
  return `<div id="dp-placeholder" class="cn-placeholder" style="gap:10px;cursor:default">
    <div class="dex-complete-icon">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7ab4ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="dex-complete-title">Dex Complete!</div>
    <div class="dex-complete-sub">You've caught every Pokémon available in this game.</div>
  </div>`;
}

function jumpToCatchNext(pokemonId) {
  const card = document.querySelector(`.poke-card[data-pokemon-id="${pokemonId}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  selectPokemon(card);
}

async function rerollCatchNextForGame(excludeId) {
  const gameId = window.__LD.GAME_ID;
  if (!gameId) return;

  // Remove old overlay immediately
  if (excludeId) {
    const oldCard = document.querySelector(`.poke-card[data-pokemon-id="${excludeId}"]`);
    if (oldCard) {
      oldCard.classList.remove('catch-next');
      oldCard.querySelector('.catch-next-badge')?.remove();
    }
  }
  window.__LD.CATCH_NEXT = null;

  // Refresh placeholder to default while we wait
  if (!selectedCard) {
    const di = document.getElementById('detail-inner');
    if (di) di.innerHTML = buildCatchNextPlaceholderHtml(null);
  }

  try {
    const res = await fetch('/api/suggestion/catch-next/reroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, excludeId: excludeId ?? null }),
    });
    const data = await res.json();
    const pokemon = data.pokemon;
    if (!pokemon) {
      if (!selectedCard) {
        const di = document.getElementById('detail-inner');
        const ph = di?.querySelector('#dp-placeholder');
        if (ph) ph.outerHTML = buildDexCompleteHtml();
      }
      return;
    }

    window.__LD.CATCH_NEXT = pokemon;

    // Apply overlay to the new card
    const newCard = document.querySelector(`.poke-card[data-pokemon-id="${pokemon.id}"]`);
    if (newCard) {
      newCard.classList.add('catch-next');
      if (!newCard.querySelector('.catch-next-badge')) {
        const badge = document.createElement('div');
        badge.className = 'catch-next-badge';
        badge.textContent = 'Catch Next';
        newCard.appendChild(badge);
      }
    }

    // Update placeholder with new suggestion
    if (!selectedCard) {
      const di = document.getElementById('detail-inner');
      const ph = di?.querySelector('#dp-placeholder');
      if (ph) ph.outerHTML = buildCatchNextPlaceholderHtml(pokemon);
    }
  } catch (err) {
    console.error('catch-next reroll failed:', err);
  }
}

function applyCatchNextOverlay(catchNextId) {
  for (const card of document.querySelectorAll('.poke-card')) {
    const isCN = catchNextId && card.dataset.pokemonId === catchNextId;
    card.classList.toggle('catch-next', !!isCN);
    const existing = card.querySelector('.catch-next-badge');
    if (isCN && !existing) {
      const badge = document.createElement('div');
      badge.className = 'catch-next-badge';
      badge.textContent = 'Catch Next';
      card.appendChild(badge);
    } else if (!isCN && existing) {
      existing.remove();
    }
  }
}

// ── Game selection (AJAX) ─────────────────────────────────────────────────────
let selectGameTimer = null;

function buildGameGroupUrl(groupKey) {
  const path = (window.__LD.GROUP_REGION?.[groupKey]) || window.location.pathname;
  const u = new URL(path, location.origin);
  u.searchParams.set('game_group', groupKey);
  return u;
}

function selectGameGroup(groupKey) {
  clearTimeout(selectGameTimer);
  selectGameTimer = setTimeout(() => _doSelectGameGroup(groupKey), 150);
}

async function _doSelectGameGroup(groupKey) {
  const targetUrl = buildGameGroupUrl(groupKey);
  const apiUrl    = new URL('/api/dex-grid', location.origin);
  apiUrl.searchParams.set('path', targetUrl.pathname);
  apiUrl.searchParams.set('game_group', groupKey);

  try {
    closePanel();
    const data = await fetch(apiUrl).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

    window.__LD.GAME_ID    = null;
    window.__LD.GAME_GROUP = groupKey;
    window.__LD.GAME_NAME  = data.gameName;
    window.__LD.ALL_GROUP  = groupKey;
    window.__LD.CATCH_NEXT = null;

    await renderCardsDOM(data.cards);
    updateProgressBar();

    if (!selectedCard) {
      const di = document.getElementById('detail-inner');
      if (di) di.innerHTML = buildCatchNextPlaceholderHtml(null);
    }

    const { GROUP_LABELS } = window.__LD;
    for (const b of document.querySelectorAll('.game-btn')) {
      const isAllBtn = b.dataset.gameGroup === groupKey;
      b.classList.toggle('active', isAllBtn);
      if (isAllBtn) {
        b.style.borderLeftColor = '#4a7fff';
        b.style.background = 'linear-gradient(90deg,rgba(74,127,255,.12),#0d1e3a 80%)';
      } else {
        const vc = window.__LD.GAME_COLORS[b.querySelector('span')?.textContent?.trim()];
        b.style.borderLeftColor = vc ? vc + '55' : '#243654';
        b.style.background = '';
      }
    }

    evoCache.clear(); encCache.clear(); statCache.clear();
    locationFilter = null;
    panelEncData   = null;
    panelGameGroup = groupKey;

    document.getElementById('location-clear-btn')?.style.setProperty('display', 'none');
    initLocationPanel(groupKey).catch(() => {});

    const meta = document.querySelector('.meta');
    if (meta) meta.textContent = data.count + ' entries';

    const tabsBar = document.getElementById('dex-tabs-bar');
    if (tabsBar) tabsBar.innerHTML = data.tabsHtml || '';
    updateGridHeight();

    history.pushState({ gameGroupKey: groupKey }, '', targetUrl);
    document.title = (data.gameName || groupKey) + ' Pokédex — Living Pokédex';

    initSort();
    rebuildDividers();
    restorePrefs();
  } catch (_) {
    location.href = targetUrl;
  }
}

function buildGameUrl(val) {
  const { GROUP_REGION } = window.__LD;
  if (!val) {
    const u = new URL(location.href);
    u.searchParams.delete('game_id');
    return u;
  }
  const btn      = document.querySelector('.game-btn[data-game="' + val + '"]');
  const groupKey = btn && (btn.dataset.group || btn.dataset.groups?.split(',')[0]);
  const path = (groupKey && GROUP_REGION[groupKey]) || '/dex';
  const u    = new URL(path, location.origin);
  u.searchParams.set('game_id', val);
  return u;
}

function selectGame(val) {
  clearTimeout(selectGameTimer);
  selectGameTimer = setTimeout(() => _doSelectGame(val), 150);
}

async function _doSelectGame(val) {
  const targetUrl = buildGameUrl(val);
  const apiUrl    = new URL('/api/dex-grid', location.origin);
  apiUrl.searchParams.set('path', targetUrl.pathname);
  if (val) apiUrl.searchParams.set('game_id', val);
  if (targetUrl.searchParams.has('dlc')) apiUrl.searchParams.set('dlc', targetUrl.searchParams.get('dlc'));

  try {
    closePanel();
    const data = await fetch(apiUrl).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });

    // Update bindings before rendering so renderCardsDOM picks up new CATCH_NEXT
    window.__LD.GAME_ID    = data.gameId;
    window.__LD.GAME_GROUP = data.gameGroup;
    window.__LD.GAME_NAME  = data.gameName;
    window.__LD.ALL_GROUP  = null;
    window.__LD.CATCH_NEXT = data.catchNext ?? null;

    // Update pane A header + game ID, rebuild sibling picker
    if (splitMode) {
      const nameEl = document.querySelector('.split-pane[data-pane="a"] .split-game-name');
      if (nameEl) nameEl.textContent = data.gameName || 'All Pokémon';
      const paneA = document.querySelector('.split-pane[data-pane="a"]');
      if (paneA) paneA.dataset.gameId = String(data.gameId || '');
      rebuildSplitBPicker();
    }
    updateSplitBtn();

    await renderCardsDOM(data.cards);
    updateProgressBar();

    // If the cached catch-next is already caught, reroll silently
    const newCN = window.__LD.CATCH_NEXT;
    if (newCN) {
      const cnCard = document.querySelector(`.poke-card[data-pokemon-id="${newCN.id}"]`);
      if (cnCard && cnCard.dataset.caught === 'true') {
        rerollCatchNextForGame(newCN.id);
      } else if (!selectedCard) {
        const detailInner = document.getElementById('detail-inner');
        if (detailInner) detailInner.innerHTML = buildCatchNextPlaceholderHtml(newCN);
      }
    } else if (!selectedCard) {
      const detailInner = document.getElementById('detail-inner');
      if (detailInner) {
        detailInner.innerHTML = (data.gameId && window.__LD.PLAYER_ID)
          ? buildDexCompleteHtml()
          : buildCatchNextPlaceholderHtml(null);
      }
    }

    for (const b of document.querySelectorAll('.game-btn')) {
      const byId    = String(b.dataset.game) === String(val);
      const byGroup = b.dataset.groups ? b.dataset.groups.split(',').includes(data.gameGroup) : false;
      b.classList.toggle('active', byId || byGroup);
      const vc = window.__LD.GAME_COLORS[b.textContent?.trim()];
      if (b.classList.contains('active')) {
        b.style.borderLeftColor = vc || '#4a7fff';
        b.style.background = vc ? `linear-gradient(90deg,${vc}1a,#0d1e3a 80%)` : '#0d1e3a';
      } else {
        b.style.borderLeftColor = vc ? vc + '55' : '#243654';
        b.style.background = '';
      }
    }

    evoCache.clear(); encCache.clear(); statCache.clear();
    locationFilter = null;
    panelEncData   = null;
    // HOME / HOME_X game groups have no wild encounters; remap to the real
    // game group so the encounter panel shows actual wild location data.
    panelGameGroup = HOME_LOCATION_GROUP[data.gameGroup]
      ?? (data.gameGroup === 'HOME' ? null : data.gameGroup);

    // For HOME_X pages, visually activate the paired real game's "All versions"
    // button and expand its sidebar group so the user sees which game's data is used.
    const _realGroup = HOME_LOCATION_GROUP[data.gameGroup];
    if (_realGroup) {
      const _allBtn = document.querySelector(`.game-btn[data-game-group="${_realGroup}"]`);
      if (_allBtn) {
        _allBtn.classList.add('active');
        _allBtn.style.borderLeftColor = '#4a7fff';
        _allBtn.style.background = 'linear-gradient(90deg,rgba(74,127,255,.12),#0d1e3a 80%)';
        const _grpDiv = _allBtn.closest('[id^="grp-"]');
        if (_grpDiv && _grpDiv.style.display === 'none') {
          _grpDiv.style.display = 'block';
          const _arr = document.getElementById(_grpDiv.id + '-arr');
          if (_arr) { _arr.classList.replace('bi-chevron-right', 'bi-chevron-down'); }
        }
      }
    }

    document.getElementById('location-clear-btn')?.style.setProperty('display', 'none');
    initLocationPanel(data.gameGroup).catch(() => {});

    const meta = document.querySelector('.meta');
    if (meta) meta.textContent = data.count + ' entries';

    const tabsBar = document.getElementById('dex-tabs-bar');
    if (tabsBar) tabsBar.innerHTML = data.tabsHtml || '';
    updateGridHeight();

    history.pushState({ gameVal: val }, '', targetUrl);
    document.title = (data.gameName ? data.gameName + ' Pokédex' : 'National Pokédex') + ' — Living Pokédex';

    initSort();
    rebuildDividers();
    restorePrefs();

    if (val && window.__LD.PLAYER_ID) {
      fetch('/api/settings/last-dex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: val, path: targetUrl.pathname }),
      }).catch(() => {});
    }
  } catch (_) {
    location.href = targetUrl;
  }
}

window.addEventListener('popstate', e => {
  if (e.state?.gameGroupKey !== undefined) {
    _doSelectGameGroup(e.state.gameGroupKey);
  } else {
    const val = e.state?.gameVal ?? null;
    if (val !== undefined) _doSelectGame(val);
    else location.reload();
  }
});

// ── Sidebar group toggle ──────────────────────────────────────────────────────
function toggleGroup(id) {
  const el  = document.getElementById(id);
  const arr = document.getElementById(id + '-arr');
  const open = el.style.display !== 'none';
  if (!open) {
    // Close all other groups before opening this one
    let i = 0;
    while (true) {
      const other = document.getElementById('grp-' + i);
      if (!other) break;
      if ('grp-' + i !== id) {
        other.style.display = 'none';
        const otherArr = document.getElementById('grp-' + i + '-arr');
        if (otherArr) otherArr.className = 'bi bi-chevron-right';
      }
      i++;
    }
  }
  el.style.display = open ? 'none' : 'block';
  arr.className = open ? 'bi bi-chevron-right' : 'bi bi-chevron-down';
}

// ── Confetti ──────────────────────────────────────────────────────────────────
function fireConfetti() {
  const cv = document.getElementById('confetti');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight; cv.style.display = 'block';
  const colors = ['#4a7fff','#a370f7','#2ecc71','#ffcc00','#e62829','#3fd8ff'];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.3,
    r: 3 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0],
    vx: -2 + Math.random() * 4, vy: 2 + Math.random() * 4, a: Math.random() * Math.PI,
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.a += 0.1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r/2, -p.r/2, p.r, p.r * 0.6); ctx.restore();
    }
    if (t - t0 < 3500) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = 'none'; }
  })(t0);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function uiModal(html) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal-box">${html}</div></div>`;
    const box = root.querySelector('.modal-box');
    box._close = v => { root.innerHTML = ''; resolve(v); };
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) box._close(null);
    });
    const inp = box.querySelector('input'); if (inp) inp.focus();
  });
}
function uiAlert(msg) {
  return uiModal(`<div style="font-size:14px;margin-bottom:16px;color:#c9d1d9">${msg}</div>
    <div style="text-align:right"><button class="modal-btn modal-primary" onclick="this.closest('.modal-box')._close(true)">OK</button></div>`);
}
function uiConfirm(msg) {
  return uiModal(`<div style="font-size:14px;margin-bottom:16px;color:#c9d1d9">${msg}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="modal-btn" onclick="this.closest('.modal-box')._close(false)">Cancel</button>
      <button class="modal-btn modal-primary" onclick="this.closest('.modal-box')._close(true)">Confirm</button>
    </div>`);
}
function uiPrompt(title, label) {
  return uiModal(`<div style="font-size:14px;font-weight:600;margin-bottom:10px;color:#e6edf3">${title}</div>
    <input type="text" placeholder="${label||''}" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid #1a3898;background:#0c1526;color:#c9d1d9;font-size:14px;margin-bottom:14px;outline:none"
      onkeydown="if(event.key==='Enter')this.closest('.modal-box')._close(this.value.trim());if(event.key==='Escape')this.closest('.modal-box')._close(null)">
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="modal-btn" onclick="this.closest('.modal-box')._close(null)">Cancel</button>
      <button class="modal-btn modal-primary" onclick="this.closest('.modal-box')._close(this.closest('.modal-box').querySelector('input').value.trim())">Create</button>
    </div>`);
}

// ── Scale / Panel size ────────────────────────────────────────────────────────
const CARD_SCALES  = { small:'small', medium:'medium', large:'large' };
const PANEL_WIDTHS = { small:'20vw', medium:'30vw', large:'42vw' };
const GRID_COLS       = { small:8, medium:6, large:4 };
const GRID_ROWS       = { small:7, medium:9.5, large:5 };
const GRID_COLS_SPLIT = { small:5, medium:6,   large:3 };
const GRID_ROWS_SPLIT = { small:6, medium:9.5, large:4 };

function applyCardScale(v) {
  for (const btn of document.querySelectorAll('[data-scale]'))
    btn.classList.toggle('active', btn.dataset.scale === v);
  const inSplit = document.body.classList.contains('split-active');
  document.documentElement.style.setProperty('--grid-cols', (inSplit ? GRID_COLS_SPLIT[v] : GRID_COLS[v]) ?? (inSplit ? 4 : 6));
  document.documentElement.style.setProperty('--grid-rows', (inSplit ? GRID_ROWS_SPLIT[v] : GRID_ROWS[v]) ?? (inSplit ? 5 : 6));
  updateGridHeight();
}

function reapplyCardScale() {
  const active = document.querySelector('[data-scale].active');
  const v = active?.dataset.scale ?? (localStorage.getItem('ld_card_scale') || 'medium');
  applyCardScale(v);
}

function updateGridHeight() {
  const main = document.querySelector('main');
  if (!main) return;
  const stickyCtrl = main.querySelector(':scope > div:first-child');
  const ctrlH = stickyCtrl ? stickyCtrl.offsetHeight : 0;
  let avail = main.clientHeight - ctrlH;
  if (document.body.classList.contains('split-active')) {
    const splitHdr = document.querySelector('.split-hdr');
    avail -= splitHdr ? splitHdr.offsetHeight : 44;
  }
  if (avail > 0) {
    document.documentElement.style.setProperty('--grid-available', avail + 'px');
    const inSplit = document.body.classList.contains('split-active');
    const scale = document.querySelector('[data-scale].active')?.dataset.scale
                  || localStorage.getItem('ld_card_scale') || 'medium';
    const rows = inSplit ? (GRID_ROWS_SPLIT[scale] ?? 5) : (GRID_ROWS[scale] ?? 6);
    const cardH = Math.min(Math.max((avail - (rows - 1) * 6) / rows, 110), 130);
    document.documentElement.style.setProperty('--card-h', cardH + 'px');
  }
}
function applyPanelSize(v) {
  document.documentElement.style.setProperty('--panel-width', PANEL_WIDTHS[v] ?? '30vw');
  for (const btn of document.querySelectorAll('[data-psize]'))
    btn.classList.toggle('active', btn.dataset.psize === v);
}
function setCardScale(v) {
  try { localStorage.setItem('ld_card_scale', v); } catch(_) {}
  applyCardScale(v);
}
function setPanelSize(v) {
  try { localStorage.setItem('ld_panel_size', v); } catch(_) {}
  applyPanelSize(v);
}
function toggleDetailPanel() {
  const panel = document.getElementById('detail-panel');
  const icon  = document.getElementById('panel-toggle-icon');
  const collapsed = panel.classList.toggle('panel-collapsed');
  if (icon) icon.className = collapsed ? 'bi bi-chevron-left' : 'bi bi-chevron-right';
  try { localStorage.setItem('ld_panel_collapsed', collapsed ? '1' : ''); } catch(_) {}
  requestAnimationFrame(updateGridHeight);
  panel.addEventListener('transitionend', updateGridHeight, { once: true });
}

// ── Preferences ───────────────────────────────────────────────────────────────
function restorePrefs() {
  const { SETTINGS } = window.__LD;
  try {
    const lsHide  = localStorage.getItem('ld_hideCaught');
    const wantHide = lsHide !== null ? !!lsHide : !!(SETTINGS || {}).hide_caught;
    if (wantHide !== hideCaught) toggleHideCaught();

    const s = localStorage.getItem('ld_sort') || (SETTINGS || {}).default_sort;
    if (s && s !== currentSort) {
      const sel = document.getElementById('sort-select');
      if (sel) sel.value = s;
      applySort(s);
    } else {
      applyFilters();
    }

    const cs = localStorage.getItem('ld_card_scale') || (SETTINGS||{}).card_scale || 'medium';
    applyCardScale(cs);
    const ps = localStorage.getItem('ld_panel_size') || (SETTINGS||{}).panel_size || 'medium';
    applyPanelSize(ps);

    if (localStorage.getItem('ld_panel_collapsed') === '1') {
      const panel = document.getElementById('detail-panel');
      const icon  = document.getElementById('panel-toggle-icon');
      panel?.classList.add('panel-collapsed');
      if (icon) icon.className = 'bi bi-chevron-left';
    }

    if (!splitMode && localStorage.getItem('ld_split_active') === '1' && window.__LD.GAME_ID) {
      const savedBGame = localStorage.getItem('ld_split_b_game');
      enterSplitMode(savedBGame || null);
    }
  } catch (e) {}
  updateSplitBtn();
}

// ── Split mode ────────────────────────────────────────────────────────────────
let splitMode = false;

function toggleSplitMode() {
  if (splitMode) exitSplitMode(); else enterSplitMode();
}

function buildSplitBSelect() {
  const { GAME_GROUP, GAME_ID, GAMES } = window.__LD;
  const sel = document.createElement('select');
  sel.id = 'split-b-select';
  sel.style.cssText = 'padding:4px 8px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#c9d1d9;font-size:12px;cursor:pointer;outline:none;min-width:0;flex:1;max-width:200px';
  sel.innerHTML = '<option value="">Choose game…</option>';
  const siblings = (GAMES || []).filter(g => g.game_group === GAME_GROUP && String(g.id) !== String(GAME_ID));
  for (const g of siblings) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    sel.appendChild(opt);
  }
  sel.onchange = () => loadSplitPaneB(sel.value);
  return sel;
}

function rebuildSplitBPicker() {
  const oldSel = document.getElementById('split-b-select');
  if (!oldSel) return;
  const prevValue = oldSel.value;
  const newSel = buildSplitBSelect();
  oldSel.replaceWith(newSel);
  // Restore selection if still a valid sibling, otherwise clear pane B
  if (prevValue && [...newSel.options].find(o => o.value === prevValue)) {
    newSel.value = prevValue;
  } else if (prevValue) {
    loadSplitPaneB('');
  }
}

function updateSplitBtn() {
  const btn = document.getElementById('split-btn');
  if (!btn) return;
  const { GAME_GROUP, GAME_ID, GAMES } = window.__LD;
  if (!GAME_GROUP || !GAME_ID) {
    btn.disabled = true;
    btn.title = 'Select a game to use split mode';
    return;
  }
  const siblings = (GAMES || []).filter(g => g.game_group === GAME_GROUP && String(g.id) !== String(GAME_ID));
  btn.disabled = siblings.length === 0;
  btn.title = siblings.length === 0 ? 'No sibling games to compare' : 'Side by side';
}

function enterSplitMode(initialGameId = null) {
  splitMode = true;
  document.body.classList.add('split-active');
  document.getElementById('split-btn')?.classList.add('active');
  try { localStorage.setItem('ld_split_active', '1'); } catch (_) {}

  const main = document.querySelector('main');
  const grid = main.querySelector('.poke-grid');
  const emptyState = document.getElementById('empty-state');
  if (!grid) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'split-wrapper';

  // Pane A — current game, full functionality
  const paneA = document.createElement('div');
  paneA.className = 'split-pane';
  paneA.dataset.pane = 'a';
  paneA.dataset.gameId = String(window.__LD.GAME_ID || '');
  const hdrA = document.createElement('div');
  hdrA.className = 'split-hdr';
  hdrA.innerHTML = `<span class="split-game-name">${window.__LD.GAME_NAME || 'All Pokémon'}</span><span id="split-a-meta"></span>`;
  paneA.appendChild(hdrA);
  paneA.appendChild(grid);
  if (emptyState) paneA.appendChild(emptyState);
  wrapper.appendChild(paneA);

  // Add game picker inline next to the split button
  const splitBtnGrp = document.getElementById('split-btn-grp');
  if (splitBtnGrp) splitBtnGrp.appendChild(buildSplitBSelect());

  // Pane B — sibling game, full catching
  const paneB = document.createElement('div');
  paneB.className = 'split-pane';
  paneB.dataset.pane = 'b';
  paneB.dataset.gameId = '';
  paneB.id = 'split-pane-b';
  const hdrB = document.createElement('div');
  hdrB.className = 'split-hdr';
  hdrB.innerHTML = `<span class="split-game-name" id="split-b-game-name">—</span><span id="split-b-meta"></span>`;
  paneB.appendChild(hdrB);
  const gridB = document.createElement('div');
  gridB.className = 'poke-grid';
  gridB.id = 'poke-grid-b';
  paneB.appendChild(gridB);
  const emptyB = document.createElement('div');
  emptyB.id = 'empty-state-b';
  emptyB.className = 'poke-empty';
  emptyB.textContent = 'Select a game to compare.';
  paneB.appendChild(emptyB);
  wrapper.appendChild(paneB);

  main.appendChild(wrapper);
  reapplyCardScale();
  applyFilters();
  updateGridHeight();

  // Load saved or first sibling game into pane B
  const { GAME_GROUP, GAME_ID, GAMES } = window.__LD;
  const siblings = (GAMES || []).filter(g => g.game_group === GAME_GROUP && String(g.id) !== String(GAME_ID));
  const targetId = initialGameId && siblings.find(g => String(g.id) === String(initialGameId))
    ? String(initialGameId)
    : siblings.length > 0 ? String(siblings[0].id) : null;
  if (targetId) {
    const sel = document.getElementById('split-b-select');
    if (sel) {
      sel.value = targetId;
      loadSplitPaneB(targetId);
    }
  }
}

function exitSplitMode() {
  splitMode = false;
  document.body.classList.remove('split-active');
  document.getElementById('split-btn')?.classList.remove('active');
  try { localStorage.removeItem('ld_split_active'); localStorage.removeItem('ld_split_b_game'); } catch (_) {}

  const main = document.querySelector('main');
  const wrapper = document.getElementById('split-wrapper');
  if (!wrapper) return;
  const paneA = wrapper.querySelector('.split-pane[data-pane="a"]');
  if (paneA) {
    const grid = paneA.querySelector('.poke-grid');
    const emptyState = paneA.querySelector('#empty-state');
    if (grid) main.appendChild(grid);
    if (emptyState) main.appendChild(emptyState);
  }
  wrapper.remove();
  document.getElementById('split-b-select')?.remove();
  reapplyCardScale();
  applyFilters();
  updateGridHeight();
}

async function loadSplitPaneB(gameIdStr) {
  const paneB = document.getElementById('split-pane-b');
  const gridB = document.getElementById('poke-grid-b');
  const emptyB = document.getElementById('empty-state-b');
  if (!gridB) return;
  try {
    if (gameIdStr) localStorage.setItem('ld_split_b_game', gameIdStr);
    else localStorage.removeItem('ld_split_b_game');
  } catch (_) {}
  if (!gameIdStr) {
    if (paneB) paneB.dataset.gameId = '';
    gridB.replaceChildren();
    if (emptyB) { emptyB.textContent = 'Select a game to compare.'; emptyB.style.display = 'block'; }
    const mb = document.getElementById('split-b-meta');
    if (mb) mb.textContent = '';
    return;
  }
  if (emptyB) emptyB.style.display = 'none';
  gridB.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'poke-empty';
  loading.textContent = 'Loading…';
  gridB.appendChild(loading);

  try {
    const _path = window.location.pathname;
    const _dlc  = new URLSearchParams(window.location.search).get('dlc');
    let _apiUrl = `/api/dex-grid?game_id=${gameIdStr}&path=${encodeURIComponent(_path)}`;
    if (_dlc) _apiUrl += `&dlc=${encodeURIComponent(_dlc)}`;
    const data = await fetch(_apiUrl).then(r => r.json());
    gridB.replaceChildren();

    // Store game ID on the pane so catch toggles know which game to use
    if (paneB) paneB.dataset.gameId = gameIdStr;

    // Update pane B header name
    const btn = document.querySelector(`.game-btn[data-game="${gameIdStr}"]`);
    const gameName = btn?.querySelector('span')?.textContent.trim() || data.gameName || gameIdStr;
    const nameEl = document.getElementById('split-b-game-name');
    if (nameEl) nameEl.textContent = gameName;

    const { PLAYER_ID } = window.__LD;
    const frag = document.createDocumentFragment();
    let visibleCount = 0;
    for (const c of data.cards) {
      if (c.isForm) continue;
      const div = document.createElement('div');
      div.className = 'poke-card' + (c.caught ? ' caught' : '');
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
      div.dataset.isForm    = 'false';
      div.dataset.bonus     = 'false';
      div.dataset.exclNames = c.exclNames || '';
      div.style.setProperty('--tc', c.tc);
      div.onclick = function() { selectPokemon(this); };
      if (PLAYER_ID) {
        const btn2 = document.createElement('button');
        btn2.type = 'button';
        btn2.className = 'catch-toggle' + (c.caught ? ' caught' : '');
        btn2.setAttribute('aria-label', 'Toggle caught');
        btn2.setAttribute('aria-pressed', c.caught ? 'true' : 'false');
        btn2.setAttribute('touch-action', 'none');
        btn2.textContent = c.caught ? '✓' : '';
        btn2.onclick = e => e.stopPropagation();
        div.appendChild(btn2);
      }
      if (c.exclNames && c.exclGames?.length) {
        const badge = document.createElement('div');
        badge.className = 'excl-badge';
        badge.title = "Can't be caught here — trade from " + c.exclNames;
        badge.innerHTML = c.exclGames.map((g, i) =>
          `<span style="color:${(window.__LD.GAME_COLORS[g.name] ?? '#e0b020')}">${g.abbr}</span>` +
          (i < c.exclGames.length - 1 ? '<span class="excl-sep">/</span>' : '')
        ).join('');
        div.appendChild(badge);
      }
      const img = document.createElement('img');
      img.src = c.icon; img.width = 56; img.height = 56;
      img.loading = 'lazy';
      img.style.cssText = 'object-fit:contain;display:block;margin:0 auto';
      div.appendChild(img);
      const numEl = document.createElement('div');
      numEl.className = 'poke-num';
      numEl.textContent = '#' + c.num;
      div.appendChild(numEl);
      const nameEl2 = document.createElement('div');
      nameEl2.className = 'poke-name';
      nameEl2.textContent = c.name;
      div.appendChild(nameEl2);
      frag.appendChild(div);
      visibleCount++;
    }
    gridB.appendChild(frag);

    const mb = document.getElementById('split-b-meta');
    if (mb) mb.textContent = visibleCount + ' entries';
    if (emptyB) emptyB.style.display = visibleCount ? 'none' : 'block';
    applyFilters();
    updateGridHeight();
  } catch (err) {
    gridB.replaceChildren();
    if (emptyB) { emptyB.textContent = 'Failed to load.'; emptyB.style.display = 'block'; }
  }
}

// Maps HOME sub-dex game groups to the real game group whose encounter data
// should be used for the Locations panel (HOME_X games have no encounters).
const HOME_LOCATION_GROUP = {
  HOME_KANTO:   'LGPE',
  HOME_JOHTO:   'HGSS',
  HOME_HOENN:   'ORAS',
  HOME_SINNOH:  'BDSP',
  HOME_UNOVA:   'BW2',
  HOME_KALOS:   'XY',
  HOME_ALOLA:   'USUM',
  HOME_GALAR:   'SwSh',
  HOME_IOA:     'IoA',
  HOME_CT:      'CT',
  HOME_HISUI:   'PLA',
  HOME_PALDEA:  'SV',
  HOME_KITA:    'Kita',
  HOME_BB:      'BB',
  HOME_LUMIOSE: 'LZA',
  HOME_HYPER:   'LZA',
  HOME_MEGA:    'LZA',
};

// ── Location panel init ───────────────────────────────────────────────────────
// Loads locations for the given game group. If the game group has no encounter
// data (e.g. HOME), falls back to showing all locations with a game filter.
async function initLocationPanel(gameGroup) {
  // For HOME sub-dex groups, use the corresponding real game's encounter data.
  gameGroup = HOME_LOCATION_GROUP[gameGroup] || gameGroup;
  allLocationPokemon = null;
  const locSel    = document.getElementById('location-select');
  const gameFilter = document.getElementById('loc-game-filter');
  if (locSel) while (locSel.options.length > 1) locSel.remove(1);
  if (gameFilter) gameFilter.value = '';

  let hasLocations = false;
  if (gameGroup) {
    try {
      const res  = await fetch('/api/all-location-pokemon?game_group=' + encodeURIComponent(gameGroup));
      const data = await res.json();
      allLocationPokemon = new Map(Object.entries(data.locations).map(([k, v]) => [k, new Set(v)]));
      for (const [loc, pids] of allLocationPokemon) locationPokemonCache.set(loc, pids);
      hasLocations = allLocationPokemon.size > 0;
      if (hasLocations) populateLocationSelect();
    } catch (_) {}
  }

  if (!hasLocations) {
    // No game, or game group has no encounter data (HOME, etc.) — show game filter
    if (gameFilter) {
      gameFilter.style.display = '';
      if (gameFilter.options.length <= 1) {
        const seen = new Set();
        for (const g of window.__LD.GAMES || []) {
          if (!seen.has(g.game_group)) {
            seen.add(g.game_group);
            const opt = document.createElement('option');
            opt.value = g.game_group; opt.textContent = g.name;
            gameFilter.appendChild(opt);
          }
        }
      }
    }
    try {
      const res  = await fetch('/api/locations');
      const data = await res.json();
      if (locSel && data.locations) {
        while (locSel.options.length > 1) locSel.remove(1);
        for (const loc of data.locations) {
          const opt = document.createElement('option');
          opt.value = loc; opt.textContent = loc;
          locSel.appendChild(opt);
        }
      }
    } catch (_) {}
  } else if (gameFilter) {
    gameFilter.style.display = 'none';
  }
}

// ── Location + encounter panel bootstrap ─────────────────────────────────────
// For HOME/HOME_X games, remap panelGameGroup so encounter section shows real data.
(function initPanelGameGroup() {
  const gg = window.__LD.GAME_GROUP;
  if (!gg || gg === 'HOME') return;
  panelGameGroup = HOME_LOCATION_GROUP[gg] ?? gg;
})();

(async () => {
  try { await initLocationPanel(window.__LD.GAME_GROUP); } catch (_) {}
})();

async function onLocGameFilter(val) {
  if (typeof clearLocationFilter === 'function') clearLocationFilter();
  const sel = document.getElementById('location-select');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  try {
    const url = val ? '/api/locations?game_group=' + encodeURIComponent(val) : '/api/locations';
    const res = await fetch(url);
    const data = await res.json();
    if (data.locations) {
      for (const loc of data.locations) {
        const opt = document.createElement('option');
        opt.value = loc; opt.textContent = loc;
        sel.appendChild(opt);
      }
    }
  } catch (_) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────
initSort();
rebuildDividers();
restorePrefs();
updateGridHeight();
window.addEventListener('resize', updateGridHeight);

if (window.__LD.GAME_ID && window.__LD.PLAYER_ID) {
  fetch('/api/settings/last-dex', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId: window.__LD.GAME_ID, path: location.pathname }),
  }).catch(() => {});
}

// Populate catch-next placeholder on initial page load
(function() {
  const cn = window.__LD.CATCH_NEXT;
  const detailInner = document.getElementById('detail-inner');
  const placeholder = detailInner?.querySelector('#dp-placeholder');
  if (cn) {
    // If stale cache: catch-next is already caught — reroll silently
    const cnCard = document.querySelector(`.poke-card[data-pokemon-id="${cn.id}"]`);
    if (cnCard && cnCard.dataset.caught === 'true') {
      rerollCatchNextForGame(cn.id);
    } else if (placeholder) {
      placeholder.outerHTML = buildCatchNextPlaceholderHtml(cn);
    }
  } else if (window.__LD.GAME_ID && window.__LD.PLAYER_ID && placeholder) {
    placeholder.outerHTML = buildDexCompleteHtml();
  }
})();

requestAnimationFrame(() => {
  const panel = document.getElementById('detail-panel');
  if (panel) panel.style.transition = 'width .2s ease, min-width .2s ease, transform .25s ease';
});

// ── Sidebar ring live update ──────────────────────────────────────────────────
// Called after each batch catch/release with the server-returned caught count.
// Updates the progress ring SVG for the game in the sidebar without a page reload.
// Skips silently on first catch (ring SVG doesn't exist yet; appears on next nav).
function updateSidebarRing(gameId, newCaught, total) {
  const svg = document.querySelector(`svg[data-game-id="${gameId}"]`);
  if (!svg) return;
  const R = 7, CIRC = 2 * Math.PI * R;
  svg.dataset.caught = newCaught;
  const pct       = total > 0 ? Math.max(0, Math.round(newCaught / total * 100)) : 0;
  const filled    = Math.min(100, Math.max(0, pct));
  const offset    = CIRC * (1 - filled / 100);
  const isComplete = pct >= 100;
  const color     = pct <= 0 ? null
                  : isComplete      ? '#ffd700'
                  : pct >= 75       ? '#f5b830'
                  : pct >= 50       ? '#f07828'
                  : pct >= 25       ? '#60a0f0'
                  :                   '#4a7fff';

  const titleEl = svg.querySelector('title');
  if (titleEl) titleEl.textContent = `${newCaught}/${total}`;

  const circles = svg.querySelectorAll('circle');
  let prog = circles[1];
  if (color) {
    if (!prog) {
      prog = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      prog.setAttribute('cx', '9'); prog.setAttribute('cy', '9');
      prog.setAttribute('r', String(R)); prog.setAttribute('fill', 'none');
      prog.setAttribute('stroke-width', '2.5'); prog.setAttribute('stroke-linecap', 'round');
      prog.setAttribute('stroke-dasharray', CIRC.toFixed(2));
      prog.setAttribute('transform', 'rotate(-90 9 9)');
      circles[0].after(prog);
    }
    prog.setAttribute('stroke', color);
    prog.setAttribute('stroke-dashoffset', offset.toFixed(2));
  } else if (prog) {
    prog.remove();
  }

  let checkText = svg.querySelector('text');
  if (isComplete) {
    if (!checkText) {
      checkText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      checkText.setAttribute('x', '9'); checkText.setAttribute('y', '12.5');
      checkText.setAttribute('text-anchor', 'middle'); checkText.setAttribute('font-size', '7.5');
      checkText.setAttribute('font-weight', '800'); checkText.setAttribute('fill', '#ffd700');
      checkText.textContent = '✓';
      svg.appendChild(checkText);
    }
  } else if (checkText) {
    checkText.remove();
  }

  svg.style.filter = color ? `drop-shadow(0 0 ${isComplete ? 4 : 2}px ${color})` : '';
}

// ── Keyboard navigation ───────────────────────────────────────────────────────

document.addEventListener('keydown', function(e) {
  if (e.target.matches('input,textarea,select')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const visibleCards = [...document.querySelectorAll('.poke-card')]
    .filter(c => c.style.display !== 'none' && c.dataset.isForm !== 'true');
  if (!visibleCards.length) return;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown': {
      e.preventDefault();
      const idx  = selectedCard ? visibleCards.indexOf(selectedCard) : -1;
      const next = visibleCards[Math.min(idx + 1, visibleCards.length - 1)];
      if (next && next !== selectedCard) { selectPokemon(next); next.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      break;
    }
    case 'ArrowLeft':
    case 'ArrowUp': {
      e.preventDefault();
      const idx  = selectedCard ? visibleCards.indexOf(selectedCard) : visibleCards.length;
      const prev = visibleCards[Math.max(idx - 1, 0)];
      if (prev && prev !== selectedCard) { selectPokemon(prev); prev.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      break;
    }
    case 'c':
    case 'C': {
      if (!selectedCard || !window.__LD.GAME_ID || !window.__LD.PLAYER_ID) break;
      const caught = selectedCard.dataset.caught !== 'true';
      setCardCaught(selectedCard, caught);
      updateProgressBar();
      applyFilters();
      persistCaught([selectedCard], caught);
      break;
    }
    case 'Escape': {
      closePanel();
      break;
    }
  }
});

// ── Auto-open from URL hash ───────────────────────────────────────────────────

(function() {
  const hash = location.hash.slice(1);
  if (!hash) return;
  const pid  = decodeURIComponent(hash);
  const card = [...document.querySelectorAll('.poke-card')].find(c => c.dataset.pokemonId === pid);
  if (card) { selectPokemon(card); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
})();
