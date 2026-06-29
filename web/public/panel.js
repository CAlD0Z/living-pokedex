// Core detail panel: open/close, sprite toggle, evolve, form switching.
// State is declared in panel-evo.js (loaded first).
// Encounter rendering  → panel-encounters.js
// Stats / abilities    → panel-stats.js
// Evolution chain      → panel-evo.js

const { PLAYER_ID, GAME_COLORS, TYPE_COLORS } = window.__LD;

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Type badge ────────────────────────────────────────────────────────────────
function typeBadge(t) {
  const bg = TYPE_COLORS[t] ?? '#888';
  return `<span style="display:inline-block;background:${bg};color:#fff;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin:2px;letter-spacing:.3px">${t}</span>`;
}

// ── Panel open / close ────────────────────────────────────────────────────────
function selectPokemon(card) {
  if (selectedCard === card) { closePanel(); return; }
  if (selectedCard) selectedCard.classList.remove('selected');
  selectedCard = card;
  card.classList.add('selected');
  panelSpriteMode = card.dataset.useShiny === 'true' ? 'shiny' : 'normal';
  if (panelAbortController) { panelAbortController.abort(); panelAbortController = null; }
  clearTimeout(panelDebounceTimer);
  panelDebounceTimer = setTimeout(() => openPanel(card), 120);
  document.getElementById('detail-panel')?.classList.add('open');
  const pid = card.dataset.pokemonId;
  if (pid) history.replaceState(history.state, '', location.pathname + location.search + '#' + encodeURIComponent(pid));
}

function closePanel() {
  clearTimeout(panelDebounceTimer);
  if (panelAbortController) { panelAbortController.abort(); panelAbortController = null; }
  if (selectedCard) { selectedCard.classList.remove('selected'); selectedCard = null; }
  document.getElementById('detail-panel')?.classList.remove('open');
  if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
  const evoEl = document.getElementById('evo-section');
  if (evoEl) evoEl.style.display = 'none';
  const mapEl = document.getElementById('sv-map-section');
  if (mapEl) mapEl.style.display = 'none';
  const detailInner = document.getElementById('detail-inner');
  if (detailInner && !detailInner.querySelector('#dp-placeholder')) {
    detailInner.innerHTML = typeof buildCatchNextPlaceholderHtml === 'function'
      ? buildCatchNextPlaceholderHtml(window.__LD.CATCH_NEXT)
      : '<div id="dp-placeholder" style="display:flex;align-items:center;justify-content:center;height:100%;color:#4a5568;font-size:13px;padding:20px;text-align:center"><span>Click any Pokémon to view details</span></div>';
  }
}

// ── Sprite toggle ─────────────────────────────────────────────────────────────
function setPanelSprite(mode) {
  panelSpriteMode = mode;
  const img = document.getElementById('panel-sprite');
  if (img && selectedCard) img.src = mode === 'shiny' ? selectedCard.dataset.shinyIcon : selectedCard.dataset.icon;
  const btnN = document.getElementById('sprite-btn-normal');
  const btnS = document.getElementById('sprite-btn-shiny');
  if (btnN) { btnN.style.background = mode === 'normal' ? 'linear-gradient(135deg,#0e2260,#0a1848)' : '#0c1526'; btnN.style.color = mode === 'normal' ? '#7ab4ff' : '#6b7a99'; btnN.style.borderColor = mode === 'normal' ? '#1a3898' : '#182035'; }
  if (btnS) { btnS.style.background = mode === 'shiny'  ? 'linear-gradient(135deg,#2e1a60,#1a0a48)' : '#0c1526'; btnS.style.color = mode === 'shiny'  ? '#d4aaff' : '#6b7a99'; btnS.style.borderColor = mode === 'shiny'  ? '#5a2898' : '#182035'; }
}

// ── Main panel render ─────────────────────────────────────────────────────────
async function openPanel(card) {
  if (panelAbortController) panelAbortController.abort();
  panelAbortController = new AbortController();
  const signal = panelAbortController.signal;

  const d = card.dataset;
  const panelIcon = panelSpriteMode === 'shiny' ? d.shinyIcon : d.icon;
  panelEncData   = null;
  const mapEl = document.getElementById('sv-map-section');
  if (mapEl) mapEl.style.display = 'none';
  const types      = (d.type1 ? typeBadge(d.type1) : '') + (d.type2 ? typeBadge(d.type2) : '');
  const natPadded  = String(d.dexNum).padStart(3, '0');
  const dexDisplay = d.number !== natPadded
    ? 'Regional #' + d.number + ' · National #' + natPadded
    : '#' + d.number;

  const allForms = [...document.querySelectorAll(`.poke-card[data-dex-num="${d.dexNum}"]`)];
  let formsHtml = '';
  if (allForms.length > 1) {
    const btns = allForms.map(fc => {
      const label  = fc.dataset.formName || 'Base';
      const active = fc === card;
      return `<button onclick="switchForm('${fc.dataset.pokemonId}')"
        style="padding:3px 8px;border-radius:4px;border:1px solid ${active?'#4a7fff':'#1c2333'};background:${active?'#1a3a8f':'#131929'};color:${active?'#a8c4ff':'#6b7a99'};font-size:10px;cursor:pointer;font-weight:${active?'600':'400'};white-space:nowrap">${label}</button>`;
    }).join('');
    formsHtml = `<div style="width:100%;margin-bottom:4px">
      <div style="font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;margin-bottom:4px;text-align:center">Forms</div>
      <div style="display:flex;flex-wrap:wrap;gap:3px;justify-content:center">${btns}</div>
    </div>`;
  }

  const sprBtnBase = 'padding:3px 10px;border-radius:5px;border:1px solid;font-size:11px;cursor:pointer;font-weight:600;transition:background .12s,color .12s';
  const sprNActive = panelSpriteMode === 'normal';

  const exclNames   = d.exclNames || '';
  const exclColored = exclNames
    .split(' or ')
    .map(n => `<span style="color:${GAME_COLORS[n.trim()] || '#fac000'};font-weight:700">${n.trim()}</span>`)
    .join(' or ');
  const exclNotice = exclNames
    ? `<div class="dp-excl"><span class="ico">⮂</span><span>Can't be caught${window.__LD.GAME_NAME ? ' in ' + window.__LD.GAME_NAME : ' here'} — trade from ${exclColored}</span></div>`
    : '';

  const showEvolveBtn = !!(PLAYER_ID && window.__LD.GAME_ID && d.caught === 'true');
  const evolveBtnHtml = showEvolveBtn
    ? `<button id="evolve-btn" onclick="evolveCurrentPokemon()"
         style="position:absolute;top:8px;right:44px;padding:3px 9px;height:26px;border-radius:5px;border:1px solid #1a4030;background:linear-gradient(135deg,#0a2518,#071a10);color:#2ecc71;font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;transition:background .12s,border-color .12s"
         onmouseover="this.style.background='linear-gradient(135deg,#0e2e1e,#0a1f14)';this.style.borderColor='#27ae60'"
         onmouseout="this.style.background='linear-gradient(135deg,#0a2518,#071a10)';this.style.borderColor='#1a4030'">
         <i class="bi bi-arrow-up-right-circle" style="font-size:12px"></i>Evolve
       </button>`
    : '';
  const hdrRightPad = showEvolveBtn ? '120px' : '40px';

  document.getElementById('detail-inner').innerHTML = `
    <div class="dp-header">
      ${evolveBtnHtml}
      <button class="dp-close" onclick="closePanel()">×</button>
      <div id="dp-content" style="display:flex;gap:12px;padding:14px ${hdrRightPad} 14px 14px;align-items:flex-start">
        <div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;text-align:center;min-width:96px">
          ${formsHtml}
          <a href="https://bulbapedia.bulbagarden.net/wiki/${encodeURIComponent(d.name.replace(/ /g,'_'))}_(Pok%C3%A9mon)"
             target="_blank" rel="noopener noreferrer"
             style="display:inline-flex;align-items:center;gap:4px;margin-bottom:6px;font-size:10px;color:#6b9fff;text-decoration:none;opacity:.8"
             onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.8'">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Bulbapedia
          </a>
          <img id="panel-sprite" src="${panelIcon}" width="88" height="88" style="object-fit:contain;display:block;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5))${formsHtml ? ';margin-top:6px' : ''}">
          <div style="display:flex;gap:3px;margin-top:6px">
            <button id="sprite-btn-normal" onclick="setPanelSprite('normal')"
              style="${sprBtnBase};background:${sprNActive?'linear-gradient(135deg,#0e2260,#0a1848)':'#0c1526'};color:${sprNActive?'#7ab4ff':'#6b7a99'};border-color:${sprNActive?'#1a3898':'#182035'}">Normal</button>
            <button id="sprite-btn-shiny" onclick="setPanelSprite('shiny')"
              style="${sprBtnBase};background:${!sprNActive?'linear-gradient(135deg,#2e1a60,#1a0a48)':'#0c1526'};color:${!sprNActive?'#d4aaff':'#6b7a99'};border-color:${!sprNActive?'#5a2898':'#182035'}">✦ Shiny</button>
          </div>
          <div class="dp-dex-num" style="margin-top:8px">${dexDisplay}</div>
          <div class="dp-poke-name" style="font-size:18px">${d.name}</div>
          ${d.formName ? `<div class="dp-form-label">${d.formName}</div>` : ''}
          <div class="dp-types" style="margin-top:8px">${types}</div>
        </div>
        <div style="flex:1;min-width:0;text-align:left">
          <div style="display:flex;gap:4px;margin-bottom:10px">
            <button id="stat-gen-sv" onclick="setStatGen('sv')"
              style="padding:2px 10px;border-radius:5px;border:1px solid ${statGenMode==='sv'?'#1a3898':'#182035'};background:${statGenMode==='sv'?'linear-gradient(135deg,#0e2260,#0a1848)':'#0c1526'};color:${statGenMode==='sv'?'#7ab4ff':'#6b7a99'};font-size:10px;font-weight:600;cursor:pointer">SV</button>
            <button id="stat-gen-champions" onclick="setStatGen('champions')"
              style="padding:2px 10px;border-radius:5px;border:1px solid ${statGenMode==='champions'?'#5a2898':'#182035'};background:${statGenMode==='champions'?'linear-gradient(135deg,#2e1a60,#1a0a48)':'#0c1526'};color:${statGenMode==='champions'?'#d4aaff':'#6b7a99'};font-size:10px;font-weight:600;cursor:pointer">Champions</button>
          </div>
          <div id="panel-stats-right"><div style="font-size:11px;color:#546070">Loading stats…</div></div>
          <div id="panel-abilities-right"></div>
        </div>
      </div>
    </div>
    ${exclNotice}
    <div class="dp-section">
      <div id="panel-game-selector"></div>
    </div>
    <div id="encounter-section" class="dp-section">
      <div class="dp-section-title">Wild Locations</div>
      <div style="font-size:12px;color:#ccc">Loading…</div>
    </div>`;

  const evoEl = document.getElementById('evo-section');
  if (evoEl) {
    evoEl.style.display = 'block';
    evoEl.innerHTML = '<div class="dp-section-title">Evolution Chain</div><div style="font-size:12px;color:#546070;padding:4px 0">Loading…</div>';
  }

  const pokemonId = d.pokemonId;
  const rAF = () => new Promise(r => requestAnimationFrame(r));

  loadStats(pokemonId, signal);
  loadAbilities(pokemonId, d.dexNum, signal);

  // Evolution chain
  try {
    let evoData = evoCache.get(pokemonId);
    if (!evoData) {
      const res = await fetch('/api/evolution-chain/' + encodeURIComponent(pokemonId), { signal });
      evoData = await res.json();
      evoCache.set(pokemonId, evoData);
    }
    await rAF();
    if (!selectedCard || selectedCard.dataset.pokemonId !== pokemonId) return;
    const el = document.getElementById('evo-section');
    if (!el) return;
    const title = '<div class="dp-section-title" style="margin-bottom:7px">Evolution Chain</div>';
    let evoHtml;
    if (!evoData.tree || (evoData.tree.branches.length === 0 && evoData.tree.pokemon.id === pokemonId)) {
      evoHtml = title + '<div style="font-size:11px;color:#364560">Does not evolve</div>';
    } else {
      evoHtml = title + '<div style="overflow-x:auto"><div class="evo-chain-wrap" style="display:inline-block;min-width:100%;text-align:center">' + renderChainNode(evoData.tree, pokemonId) + '</div></div>';
    }
    const treeRoot = evoData.tree?.pokemon;
    if (treeRoot?.is_baby && treeRoot.id === pokemonId && evoData.tree.branches.length > 0) {
      const parents = [...new Set(evoData.tree.branches.map(b => b.target.pokemon.name))];
      const parentStr = parents.length === 1 ? parents[0] : parents.slice(0,-1).join(', ') + ' or ' + parents[parents.length-1];
      const itemNote = treeRoot.breed_item
        ? ` while holding <strong style="color:#e2a060">${treeRoot.breed_item}</strong>`
        : '';
      evoHtml += `<div style="margin-top:8px;padding:5px 9px;background:#091a10;border:1px solid #1a3320;border-radius:6px;font-size:10px;color:#7ab890;display:flex;align-items:center;gap:6px">
        <i class="bi bi-egg-fill" style="font-size:12px;flex-shrink:0;color:#5da06a"></i>
        <span>Breed <strong style="color:#90d4a8">${parentStr}</strong>${itemNote} to get this Pokémon</span>
      </div>`;
    }
    el.innerHTML = evoHtml;
  } catch (e) {
    if (e.name === 'AbortError') return;
    const el = document.getElementById('evo-section');
    if (el && selectedCard?.dataset.pokemonId === pokemonId)
      el.innerHTML = '<div class="dp-section-title">Evolution Chain</div><div style="font-size:12px;color:#e55;padding:4px 0">Could not load</div>';
  }

  // Encounters
  try {
    let encData = encCache.get(pokemonId);
    if (!encData) {
      const res = await fetch('/api/encounters/' + encodeURIComponent(pokemonId), { signal });
      encData = await res.json();
      encCache.set(pokemonId, encData);
    }
    await rAF();
    if (!selectedCard || selectedCard.dataset.pokemonId !== pokemonId) return;
    panelEncData = encData;
    renderPanelGameSelector(encData);
    renderEncounterSection(encData, pokemonId);
  } catch (e) {
    if (e.name === 'AbortError') return;
    const el = document.getElementById('encounter-section');
    if (el && selectedCard?.dataset.pokemonId === pokemonId)
      el.innerHTML = '<div style="font-size:11px;color:#e55;padding:4px 0">Could not load locations</div>';
  }
}

function findEvoTreePokemon(pokemonId) {
  for (const data of evoCache.values()) {
    if (!data.tree) continue;
    const node = findEvoNode(data.tree, pokemonId);
    if (node) return node.pokemon;
  }
  return null;
}

function switchForm(pokemonId) {
  const card = document.querySelector(`.poke-card[data-pokemon-id="${pokemonId}"]`);
  if (card) {
    if (selectedCard) selectedCard.classList.remove('selected');
    selectedCard = card;
    card.classList.add('selected');
    clearTimeout(panelDebounceTimer);
    if (panelAbortController) { panelAbortController.abort(); panelAbortController = null; }
    panelDebounceTimer = setTimeout(() => openPanel(card), 120);
    return;
  }

  // Pokémon not in current dex — open panel from cached evo tree data
  const pokemon = findEvoTreePokemon(pokemonId);
  if (!pokemon) return;

  const pseudo = document.createElement('div');
  pseudo.className = 'poke-card';
  const numPadded = String(pokemon.pokedex_number || '').padStart(3, '0');
  Object.assign(pseudo.dataset, {
    pokemonId:  pokemon.id,
    icon:       pokemon.icon_url || '',
    shinyIcon:  (pokemon.icon_url || '').replace('/normal/', '/shiny/'),
    name:       pokemon.name,
    formName:   pokemon.form_name || '',
    dexNum:     String(pokemon.pokedex_number || ''),
    number:     numPadded,
    type1:      pokemon.type1 || '',
    type2:      pokemon.type2 || '',
    caught:     'false',
    exclNames:  '',
    useShiny:   'false',
  });

  if (selectedCard) selectedCard.classList.remove('selected');
  selectedCard = pseudo;
  clearTimeout(panelDebounceTimer);
  if (panelAbortController) { panelAbortController.abort(); panelAbortController = null; }
  panelDebounceTimer = setTimeout(() => openPanel(pseudo), 120);
}

// ── Evolve ────────────────────────────────────────────────────────────────────
function refreshEvolveBtn() {
  if (!selectedCard) return;
  const { PLAYER_ID, GAME_ID } = window.__LD;
  const isCaught = selectedCard.dataset.caught === 'true';
  const show = !!(PLAYER_ID && GAME_ID && isCaught);
  const header = document.querySelector('#detail-inner .dp-header');
  if (!header) return;
  const existing = document.getElementById('evolve-btn');
  const contentDiv = document.getElementById('dp-content');
  if (show && !existing) {
    header.insertAdjacentHTML('afterbegin',
      `<button id="evolve-btn" onclick="evolveCurrentPokemon()"
         style="position:absolute;top:8px;right:44px;padding:3px 9px;height:26px;border-radius:5px;border:1px solid #1a4030;background:linear-gradient(135deg,#0a2518,#071a10);color:#2ecc71;font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px;transition:background .12s,border-color .12s"
         onmouseover="this.style.background='linear-gradient(135deg,#0e2e1e,#0a1f14)';this.style.borderColor='#27ae60'"
         onmouseout="this.style.background='linear-gradient(135deg,#0a2518,#071a10)';this.style.borderColor='#1a4030'">
         <i class="bi bi-arrow-up-right-circle" style="font-size:12px"></i>Evolve
       </button>`
    );
    if (contentDiv) contentDiv.style.paddingRight = '120px';
  } else if (!show && existing) {
    existing.remove();
    if (contentDiv) contentDiv.style.paddingRight = '40px';
  }
}

function findEvoNode(node, targetId) {
  if (!node) return null;
  if (node.pokemon.id === targetId) return node;
  for (const b of node.branches) {
    const found = findEvoNode(b.target, targetId);
    if (found) return found;
  }
  return null;
}

async function uiEvoSelect(evos) {
  const cards = evos.map(p =>
    `<button class="modal-btn" style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:10px 14px;min-width:80px"
       onclick="this.closest('.modal-box')._close('${esc(p.id)}')">
       <img src="${esc(p.icon_url || '')}" width="52" height="52" style="object-fit:contain">
       <span style="font-size:12px;font-weight:600;color:#c9d1d9">${esc(p.name)}</span>
       ${p.form_name ? `<span style="font-size:10px;color:#6b7a99">${esc(p.form_name)}</span>` : ''}
     </button>`
  ).join('');
  const chosenId = await uiModal(
    `<div style="font-size:14px;font-weight:600;margin-bottom:14px;color:#e6edf3">Evolve into…</div>
     <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:16px">${cards}</div>
     <div style="text-align:right">
       <button class="modal-btn" onclick="this.closest('.modal-box')._close(null)">Cancel</button>
     </div>`
  );
  if (!chosenId) return null;
  return evos.find(p => p.id === chosenId) ?? null;
}

async function evolveCurrentPokemon() {
  const { PLAYER_ID, GAME_ID } = window.__LD;
  if (!PLAYER_ID || !GAME_ID) { await uiAlert('Select a game first.'); return; }
  if (!selectedCard) return;
  if (selectedCard.dataset.caught !== 'true') { await uiAlert('This Pokémon is not caught yet.'); return; }

  const pokemonId = selectedCard.dataset.pokemonId;

  let evoData = evoCache.get(pokemonId);
  if (!evoData) {
    try {
      const res = await fetch('/api/evolution-chain/' + encodeURIComponent(pokemonId));
      evoData = await res.json();
      evoCache.set(pokemonId, evoData);
    } catch { await uiAlert('Could not load evolution data.'); return; }
  }

  const node = findEvoNode(evoData.tree, pokemonId);
  if (!node || !node.branches.length) {
    await uiAlert('This Pokémon has no further evolutions.');
    return;
  }

  const evos = node.branches
    .map(b => b.target.pokemon)
    .filter(p => document.querySelector(`.poke-card[data-pokemon-id="${p.id}"]`));

  if (!evos.length) {
    await uiAlert('This Pokémon\'s evolutions are not in the current dex.');
    return;
  }

  let target;
  if (evos.length === 1) {
    target = evos[0];
  } else {
    target = await uiEvoSelect(evos);
    if (!target) return;
  }

  const [r1, r2] = await Promise.all([
    fetch('/api/caught/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: PLAYER_ID, game_id: GAME_ID, pokemon_ids: [pokemonId], caught: false }),
    }),
    fetch('/api/caught/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: PLAYER_ID, game_id: GAME_ID, pokemon_ids: [target.id], caught: true }),
    }),
  ]);
  if (!r1.ok || !r2.ok) { await uiAlert('Error updating caught status.'); return; }

  const fromCard = document.querySelector(`.poke-card[data-pokemon-id="${pokemonId}"]`);
  const toCard   = document.querySelector(`.poke-card[data-pokemon-id="${target.id}"]`);
  if (fromCard) setCardCaught(fromCard, false);
  if (toCard) setCardCaught(toCard, true);
  updateProgressBar();
  applyFilters();

  if (toCard) {
    toCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    selectPokemon(toCard);
  } else {
    closePanel();
  }
}
