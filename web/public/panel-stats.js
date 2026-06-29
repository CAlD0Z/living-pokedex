// Base stats, abilities, and stat generation toggle for the detail panel.

let statGenMode        = 'sv';
const abilityListCache = new Map();
const abilityDescCache = new Map();
let abilityTooltipEl   = null;

// ── Base stats + physical info + caught date ──────────────────────────────────
async function loadStats(pokemonId, signal) {
  try {
    let d = statCache.get(pokemonId);
    if (!d) {
      const url = '/api/pokemon/' + encodeURIComponent(pokemonId) + (window.__LD.GAME_ID ? '?game_id=' + window.__LD.GAME_ID : '');
      const res = await fetch(url, signal ? { signal } : {});
      d = await res.json();
      statCache.set(pokemonId, d);
    }
    await new Promise(r => requestAnimationFrame(r));
    if (!selectedCard || selectedCard.dataset.pokemonId !== pokemonId) return;
    const sec = document.getElementById('panel-stats-right');
    if (!sec) return;
    if (!d || d.hp == null) { sec.innerHTML = '<div style="font-size:11px;color:#546070">No stat data</div>'; return; }

    const STATS = [['HP','hp'],['Atk','attack'],['Def','defense'],['SpA','sp_attack'],['SpD','sp_defense'],['Spe','speed']];
    const bar = ([lbl, k]) => {
      const v = d[k] ?? 0;
      const p = Math.min(100, Math.round(v / 200 * 100));
      const col = v >= 120 ? '#2ecc71' : v >= 90 ? '#4a7fff' : v >= 60 ? '#f0a020' : '#e0566b';
      return `<div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
        <span style="min-width:28px;font-size:9px;color:#6b7a99;font-weight:700;text-transform:uppercase;letter-spacing:.2px">${lbl}</span>
        <span style="min-width:22px;font-size:10px;color:#c9d1d9;text-align:right;font-weight:600">${v}</span>
        <div style="flex:1;height:4px;background:#0a1322;border-radius:2px;overflow:hidden">
          <div style="width:${p}%;height:100%;background:${col};border-radius:2px"></div>
        </div>
      </div>`;
    };
    const total = STATS.reduce((s, [, k]) => s + (d[k] || 0), 0);

    const phys = [];
    if (d.genus) phys.push(d.genus);
    if (d.height_m != null) phys.push(d.height_m + 'm');
    if (d.weight_kg != null) phys.push(d.weight_kg + 'kg');
    const physLine = phys.length
      ? `<div style="font-size:10px;color:#546070;margin-bottom:8px">${phys.join(' · ')}</div>`
      : '';

    const caughtLine = d.caught_at
      ? `<div style="font-size:10px;color:#546070;margin-top:5px">Caught <span style="color:#2ecc71;font-weight:600">${new Date(d.caught_at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span></div>`
      : '';

    sec.innerHTML =
      physLine +
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#364560;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:6px">Base Stats<span style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></span></div>' +
      STATS.map(bar).join('') +
      `<div style="text-align:right;font-size:9px;color:#546070;margin-top:3px">BST <strong style="color:#7ab4ff">${total}</strong></div>` +
      caughtLine;
  } catch (e) {
    if (e.name !== 'AbortError') {
      const sec = document.getElementById('panel-stats-right');
      if (sec && selectedCard?.dataset.pokemonId === pokemonId) sec.innerHTML = '';
    }
  }
}

// ── Stat generation toggle (SV ↔ Champions) ───────────────────────────────────
function setStatGen(mode) {
  statGenMode = mode;
  const svBtn = document.getElementById('stat-gen-sv');
  const chBtn = document.getElementById('stat-gen-champions');
  if (svBtn) {
    svBtn.style.background   = mode === 'sv' ? 'linear-gradient(135deg,#0e2260,#0a1848)' : '#0c1526';
    svBtn.style.color        = mode === 'sv' ? '#7ab4ff' : '#6b7a99';
    svBtn.style.borderColor  = mode === 'sv' ? '#1a3898'  : '#182035';
  }
  if (chBtn) {
    chBtn.style.background   = mode === 'champions' ? 'linear-gradient(135deg,#2e1a60,#1a0a48)' : '#0c1526';
    chBtn.style.color        = mode === 'champions' ? '#d4aaff' : '#6b7a99';
    chBtn.style.borderColor  = mode === 'champions' ? '#5a2898'  : '#182035';
  }
}

// ── Ability tooltip ───────────────────────────────────────────────────────────
function getOrCreateTooltip() {
  if (!abilityTooltipEl) {
    abilityTooltipEl = document.createElement('div');
    abilityTooltipEl.id = 'ability-tooltip';
    abilityTooltipEl.style.cssText = 'position:fixed;z-index:20000;background:#0c1a30;border:1px solid #1a3898;border-radius:8px;padding:8px 12px;max-width:280px;font-size:12px;color:#c9d1d9;line-height:1.5;box-shadow:0 4px 20px rgba(0,0,0,.6);display:none;pointer-events:none';
    document.body.appendChild(abilityTooltipEl);
  }
  return abilityTooltipEl;
}

function positionTooltip(tip, event) {
  const margin = 10;
  const tw = tip.offsetWidth  || 220;
  const th = tip.offsetHeight || 60;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = event.clientX + margin;
  let top  = event.clientY + margin;
  if (left + tw > vw - margin) left = event.clientX - tw - margin;
  if (top  + th > vh - margin) top  = event.clientY - th - margin;
  if (left < margin) left = margin;
  if (top  < margin) top  = margin;
  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
}

async function onAbilityEnter(el, event) {
  const name = el.dataset.ability;
  if (!name) return;
  const tip = getOrCreateTooltip();
  tip.textContent = 'Loading…';
  tip.style.display = 'block';
  positionTooltip(tip, event);
  try {
    let desc = abilityDescCache.get(name);
    if (desc === undefined) {
      const res  = await fetch('/api/ability-info?name=' + encodeURIComponent(name));
      const data = await res.json();
      desc = data.short_effect || data.effect || 'No description available.';
      abilityDescCache.set(name, desc);
    }
    if (tip.style.display !== 'none') tip.textContent = desc;
  } catch {
    if (tip.style.display !== 'none') tip.textContent = 'Description unavailable.';
  }
}

function moveAbilityTooltip(event) {
  if (abilityTooltipEl && abilityTooltipEl.style.display !== 'none') positionTooltip(abilityTooltipEl, event);
}

function hideAbilityTooltip() {
  if (abilityTooltipEl) abilityTooltipEl.style.display = 'none';
}

// ── Ability list ──────────────────────────────────────────────────────────────
async function loadAbilities(pokemonId, dexNum, signal) {
  try {
    let data = abilityListCache.get(pokemonId);
    if (!data) {
      const res = await fetch('/api/pokemon-abilities/' + encodeURIComponent(dexNum), signal ? { signal } : {});
      data = await res.json();
      abilityListCache.set(pokemonId, data);
    }
    await new Promise(r => requestAnimationFrame(r));
    if (!selectedCard || selectedCard.dataset.pokemonId !== pokemonId) return;
    const el = document.getElementById('panel-abilities-right');
    if (!el) return;

    const abilities = data.abilities ?? [];
    if (!abilities.length) { el.innerHTML = ''; return; }

    const fmtName = n => n.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const chip = a => `<span class="ability-chip"
      data-ability="${a.name.replace(/"/g,'&quot;')}"
      style="border:1px solid ${a.isHidden ? '#5a2898' : '#1a3898'};background:${a.isHidden ? 'rgba(90,40,152,.22)' : 'rgba(10,24,72,.55)'};color:${a.isHidden ? '#d4aaff' : '#7ab4ff'}"
      onmouseenter="onAbilityEnter(this,event)"
      onmouseleave="hideAbilityTooltip()"
      onmousemove="moveAbilityTooltip(event)">${a.isHidden ? '<span style="opacity:.7;margin-right:2px">✦</span>' : ''}${fmtName(a.name)}</span>`;

    const regular = abilities.filter(a => !a.isHidden);
    const hidden  = abilities.find(a => a.isHidden);

    el.innerHTML = `<div style="margin-top:10px">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.6px;color:#364560;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:6px">
        Abilities<span style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${regular.map(chip).join('')}
        ${hidden ? chip(hidden) : ''}
      </div>
    </div>`;
  } catch (e) {
    if (e.name !== 'AbortError') {
      const el = document.getElementById('panel-abilities-right');
      if (el && selectedCard?.dataset.pokemonId === pokemonId) el.innerHTML = '';
    }
  }
}
