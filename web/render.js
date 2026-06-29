'use strict';

const {
  TYPE_COLORS, GROUP_SCRAPER_KEYS, SSW_R, SSW_CIRC,
  GROUP_DEX_KEY, GROUP_LABELS, DLC_GROUPS, DISPLAY_GROUP,
  HOME_SHINY_DEXES, HOME_GAME_SUBGROUPS, HOME_GAME_SUBGROUP_LABELS,
  GAME_COLORS, EXCL_COLOR_DEFAULT, DLC_TABS, GROUP_REGION,
  SHINY_DEX_FORM_EXCLUSIONS, PAIRED_GAME_GROUPS,
} = require('./constants');
const { esc } = require('./utils');

const GAME_LOGOS = {
  Yellow:               'yellow',
  Crystal:              'crystal',
  Ruby:                 'ruby',
  Sapphire:             'sapphire',
  Emerald:              'emerald',
  FireRed:              'firered',
  LeafGreen:            'leafgreen',
  Diamond:              'diamond',
  Pearl:                'pearl',
  Platinum:             'platinum',
  HeartGold:            'heartgold',
  SoulSilver:           'soulsilver',
  Black:                'black',
  White:                'white',
  'Black 2':            'black2',
  'White 2':            'white2',
  X:                    'xy',
  Y:                    'xy',
  'Omega Ruby':         'omegaruby',
  'Alpha Sapphire':     'alphasapphire',
  Sun:                  'sunmoon',
  Moon:                 'sunmoon',
  'Ultra Sun':          'ultrasun',
  'Ultra Moon':         'ultramoon',
  "Let's Go Pikachu":   'letsgopikachu',
  "Let's Go Eevee":     'letsgoeevee',
  Sword:                'sword',
  Shield:               'shield',
  'Brilliant Diamond':  'brilliantdiamond',
  'Shining Pearl':      'shiningpearl',
  'Legends: Arceus':    'legendsarceus',
  Scarlet:              'scarlet',
  Violet:               'violet',
  'Legends: Z-A':       'legendsza',
};

// Maps base game name prefix → DLC name prefix (used to find sibling DLC games)
const SIDE_PREFIX = { Sword: 'SW', Shield: 'SH', Scarlet: 'S', Violet: 'V' };

// Inverts DISPLAY_GROUP: base_group → [dlc_group, ...]  e.g. SV → ['Kita','BB']
const PARENT_DLC_GROUPS = (() => {
  const m = {};
  for (const [dlcGroup, parentGroup] of Object.entries(DISPLAY_GROUP)) {
    (m[parentGroup] = m[parentGroup] ?? []).push(dlcGroup);
  }
  return m;
})();

function getDlcGamesForBase(baseGame, allGames) {
  const side = SIDE_PREFIX[baseGame.name];
  if (!side) return [];
  return (PARENT_DLC_GROUPS[baseGame.game_group] ?? [])
    .map(dg => allGames.find(g => g.game_group === dg && g.name.startsWith(side + ' -')))
    .filter(Boolean);
}

// Right-aligned progress rings for a game button.
// For games with DLC (Sword/Scarlet etc.) shows one ring per dex.
// Returns '' if no dex for this game has any progress.
function gameRingsHtml(baseGame, allGames, caughtByGame, dexTotals, nationalTotal) {
  const dlcGames = getDlcGamesForBase(baseGame, allGames);
  const allDex = [baseGame, ...dlcGames].filter(g => (caughtByGame.get(g.id) ?? 0) > 0);
  if (!allDex.length) return '';
  const rings = allDex.map(g => {
    const dexKey = GROUP_DEX_KEY[g.game_group];
    const total  = dexKey ? (dexTotals.get(dexKey) ?? nationalTotal) : nationalTotal;
    const caught = caughtByGame.get(g.id) ?? 0;
    const pct    = total > 0 ? Math.max(1, Math.round(caught / total * 100)) : 0;
    return ringHtml(pct, caught, total, g.id);
  }).join('');
  return `<span style="margin-left:auto;display:flex;gap:4px;flex-shrink:0">${rings}</span>`;
}

function badge(type) {
  if (!type) return '';
  const bg = TYPE_COLORS[type] ?? '#888';
  return `<span style="display:inline-block;background:${bg};color:#fff;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-right:3px;letter-spacing:.3px">${type}</span>`;
}

function progressHtml(playerId, gameId, caughtCount, total) {
  if (!playerId || !gameId) return '';
  const pct = total > 0 ? Math.round(caughtCount / total * 100) : 0;
  return `<div id="hdr-progress" style="display:flex;align-items:center;gap:8px">
  <div style="width:100px;height:6px;background:#182035;border-radius:3px;overflow:hidden">
    <div id="progress-fill" style="width:${pct}%;height:100%;background:linear-gradient(90deg,#4a7fff,#a370f7);border-radius:3px;box-shadow:0 0 6px rgba(74,127,255,.5)"></div>
  </div>
  <span style="font-size:13px;color:#6b7a99;white-space:nowrap"><strong id="progress-caught" style="color:#7ab4ff">${caughtCount}</strong><span style="color:#364560">/${total}</span></span>
</div>`;
}

function ringColor(pct) {
  if (pct <= 0)   return null;
  if (pct >= 100) return '#ffd700';
  if (pct >= 75)  return '#f5b830';
  if (pct >= 50)  return '#f07828';
  if (pct >= 25)  return '#60a0f0';
  return '#4a7fff';
}

function ringHtml(pct, caught = 0, total = 0, gameId = null) {
  const r = 7, circ = 2 * Math.PI * r;
  const filled = Math.min(100, Math.max(0, pct));
  const offset = circ * (1 - filled / 100);
  const color  = ringColor(pct);
  const isComplete = pct >= 100;
  const tip      = total > 0 ? `<title>${caught}/${total}</title>` : '';
  const glowPx   = isComplete ? '4px' : '2px';
  const svgStyle = `flex-shrink:0${color ? `;filter:drop-shadow(0 0 ${glowPx} ${color})` : ''}`;
  const dataAttrs = gameId != null ? ` data-game-id="${gameId}" data-caught="${caught}" data-total="${total}"` : '';
  return `<svg width="18" height="18" viewBox="0 0 18 18" style="${svgStyle}"${dataAttrs} aria-hidden="true">${tip}` +
    `<circle cx="9" cy="9" r="${r}" fill="none" stroke="#1e2f4a" stroke-width="2.5"/>` +
    (color ? `<circle cx="9" cy="9" r="${r}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" stroke-linecap="round" transform="rotate(-90 9 9)"/>` : '') +
    (isComplete ? `<text x="9" y="12.5" text-anchor="middle" font-size="7.5" font-weight="800" fill="#ffd700">✓</text>` : '') +
    `</svg>`;
}

// ── Sidebar scraper wheels ────────────────────────────────────────────────────

function sidebarScraperWheels(displayKey) {
  const keys = GROUP_SCRAPER_KEYS[displayKey] ?? [];
  if (!keys.length) return '';
  const wheels = keys.map(k =>
    `<div id="ssw-wrap-${k}" title="Seeding Encounters" style="display:none;align-items:center">` +
    `<svg width="18" height="18" viewBox="0 0 20 20" style="flex-shrink:0">` +
    `<circle cx="10" cy="10" r="${SSW_R}" fill="none" stroke="#1a2a48" stroke-width="3"/>` +
    `<circle id="ssw-${k}" cx="10" cy="10" r="${SSW_R}" fill="none" stroke="#1a2a48"` +
    ` stroke-width="3" stroke-dasharray="${SSW_CIRC}" stroke-dashoffset="${SSW_CIRC}"` +
    ` stroke-linecap="round" transform="rotate(-90 10 10)"` +
    ` style="transition:stroke-dashoffset .5s ease,stroke .3s ease"/>` +
    `</svg>` +
    `</div>`
  ).join('');
  return `<span style="display:flex;align-items:center;gap:4px;margin-left:auto">${wheels}</span>`;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function sidebar(games, gameId, caughtByGame = new Map(), dexTotals = new Map(), nationalTotal = 0, activeGameGroup = null) {
  const groups = [];
  for (const g of games) {
    if (DLC_GROUPS.has(g.game_group)) continue;
    const displayKey = g.game_group.startsWith('HOME_')
      ? 'HOME'
      : (g.game_group === 'PLA' || g.game_group === 'LZA')
      ? 'Legends'
      : (DISPLAY_GROUP[g.game_group] ?? g.game_group);
    let grp = groups.find(x => x.key === displayKey);
    if (!grp) {
      grp = { key: displayKey, label: GROUP_LABELS[displayKey] ?? displayKey, games: [] };
      groups.push(grp);
    }
    grp.games.push(g);
  }

  function renderGroup(grp, i) {
    const isAllGroupActive = activeGameGroup === grp.key;
    const hasActive = grp.games.some(g => g.id == gameId) || isAllGroupActive;
    const domId = `grp-${i}`;

    let prefixBtn       = '';
    let gamesToRender   = grp.games;
    let homeSubGroupsHtml = '';
    if (grp.key === 'HOME') {
      const homeGames   = grp.games.filter(g => g.game_group === 'HOME');
      const subDexGames = grp.games.filter(g => g.game_group !== 'HOME' && HOME_SHINY_DEXES.has(g.game_group));
      gamesToRender = [];
      prefixBtn = homeGames.map(game => {
        const isShiny   = game.name === 'Shiny Dex';
        const isActive  = game.id == gameId;
        const caught    = caughtByGame.get(game.id) ?? 0;
        const pct       = nationalTotal > 0 ? Math.round(caught / nationalTotal * 100) : 0;
        const homeStyle = isActive
          ? (isShiny
              ? 'border-left-color:#ffd700;background:linear-gradient(90deg,rgba(255,215,0,.10),#0d1e3a 80%);'
              : 'border-left-color:#4a7fff;background:linear-gradient(90deg,rgba(74,127,255,.12),#0d1e3a 80%);')
          : 'border-left-color:#243654;';
        const ring = caught > 0 ? `<span style="margin-left:auto;flex-shrink:0">${ringHtml(pct, caught, nationalTotal, game.id)}</span>` : '';
        const label = isShiny ? '✨ Shiny Dex' : game.name;
        return `<button class="game-btn${isActive ? ' active' : ''}" data-game="${game.id}" data-group="HOME" onclick="selectGame(${game.id})" style="${homeStyle}"><span>${label}</span>${ring}</button>`;
      }).join('');
      homeSubGroupsHtml = HOME_GAME_SUBGROUPS.map((sub) => {
        const subGames = subDexGames.filter(g => sub.groups.includes(g.game_group));
        if (!subGames.length) return '';
        const subActive = subGames.some(g => g.id == gameId);
        const firstGame = sub.groups.map(gg => subGames.find(g => g.game_group === gg)).find(Boolean);
        const subGamesWithProgress = subGames.filter(g => (caughtByGame.get(g.id) ?? 0) > 0);
        const subRings = subGamesWithProgress.length
          ? subGamesWithProgress.map(g => {
              const dk = GROUP_DEX_KEY[g.game_group];
              const t  = dk ? (dexTotals.get(dk) ?? nationalTotal) : nationalTotal;
              const c  = caughtByGame.get(g.id) ?? 0;
              const p  = t > 0 ? Math.max(1, Math.round(c / t * 100)) : 0;
              return ringHtml(p, c, t, g.id);
            }).join('')
          : '';
        const ring = subRings
          ? `<span style="margin-left:auto;display:flex;gap:4px;flex-shrink:0">${subRings}</span>`
          : '';
        const inlineStyle = subActive ? 'border-left-color:#4a7fff;background:#0d1e3a;' : '';
        return `<button class="game-btn${subActive ? ' active' : ''}" data-game="${firstGame.id}" data-groups="${esc(sub.groups.join(','))}" onclick="selectGame(${firstGame.id})" style="${inlineStyle}"><span>${esc(sub.label)}</span>${ring}</button>`;
      }).join('');
    }

    // "All versions" button for paired game groups (LGPE, SwSh, BDSP, SV)
    let allVersionsBtn = '';
    if (PAIRED_GAME_GROUPS.has(grp.key)) {
      const allStyle = isAllGroupActive
        ? 'border-left-color:#4a7fff;background:linear-gradient(90deg,rgba(74,127,255,.12),#0d1e3a 80%);'
        : 'border-left-color:#243654;';
      allVersionsBtn = `<button class="game-btn${isAllGroupActive ? ' active' : ''}" data-game-group="${esc(grp.key)}" onclick="selectGameGroup('${esc(grp.key)}')" style="${allStyle}"><span>All versions</span></button>`;
    }

    const buttons = prefixBtn + homeSubGroupsHtml + allVersionsBtn + gamesToRender.map(g => {
      const rings    = gameRingsHtml(g, games, caughtByGame, dexTotals, nationalTotal);
      const isActive = g.id == gameId;
      const vc       = GAME_COLORS[g.name];
      let inlineStyle = '';
      if (vc) {
        inlineStyle = isActive
          ? `border-left-color:${vc};background:linear-gradient(90deg,${vc}1a,#0d1e3a 80%);`
          : `border-left-color:${vc}55;`;
      } else if (isActive) {
        inlineStyle = 'border-left-color:#4a7fff;';
      }
      const logo = GAME_LOGOS[g.name];
      const logoImg = logo
        ? `<img src="/logos/${logo}.png" height="17" style="object-fit:contain;max-width:48px;flex-shrink:0;opacity:.88;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))" alt="">`
        : '';
      return `<button class="game-btn${isActive ? ' active' : ''}" data-game="${g.id}" data-group="${esc(g.game_group)}" onclick="selectGame(${g.id})" style="${inlineStyle}">${logoImg}<span class="${logo ? 'game-btn-sublabel' : ''}">${esc(g.name)}</span>${rings}</button>`;
    }).join('');

    const scraperWheels = sidebarScraperWheels(grp.key);
    return `<div style="margin-bottom:4px">
      <button class="group-header" onclick="toggleGroup('${domId}')">
        <i id="${domId}-arr" class="bi ${hasActive ? 'bi-chevron-down' : 'bi-chevron-right'}"></i>
        ${esc(grp.label)}
        ${scraperWheels}
      </button>
      <div id="${domId}" style="display:${hasActive ? 'block' : 'none'};padding:6px 0 2px">
        ${buttons}
      </div>
    </div>`;
  }

  const homeGroup  = groups.find(g => g.key === 'HOME');
  const gameGroups = groups.filter(g => g.key !== 'HOME');
  const homeHtml   = homeGroup ? renderGroup(homeGroup, 0) : '';
  const gameItems  = gameGroups.map((grp, i) => renderGroup(grp, i + 1)).join('');

  return `<aside id="game-sidebar">
    <div id="sidebar-content-wrap">
      <button id="sidebar-close" onclick="closeSidebar()" aria-label="Close game list">
        <i class="bi bi-x-lg"></i>
      </button>
      <div class="sidebar-content">
        ${homeHtml}
        ${gameItems}
      </div>
    </div>
    <button id="sidebar-toggle-btn" onclick="toggleSidebar()" title="Toggle games panel">
      <i class="bi bi-chevron-left" id="sidebar-toggle-icon"></i>
    </button>
  </aside>`;
}

// ── Tab bars ──────────────────────────────────────────────────────────────────

function homeTabBar(homeGames, currentGameId, playerId) {
  const btns = homeGames.map(g => {
    const active = g.id == currentGameId;
    let href = '/dex?game_id=' + g.id;
    if (playerId) href += '&player_id=' + playerId;
    return `<a href="${href}" class="tab-btn${active ? ' active' : ''}">${esc(g.name)}</a>`;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:#364560;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:2px">Dex:</span>
    ${btns}
  </div>`;
}

function homeSubTabBar(subGroup, allGames, currentGameId, playerId) {
  const tabs = subGroup.groups.flatMap(gg => {
    const path  = GROUP_REGION[gg] ?? '/dex';
    const label = HOME_GAME_SUBGROUP_LABELS[gg] ?? gg;
    return allGames
      .filter(g => g.game_group === gg)
      .map(g => ({ id: g.id, path, label, active: g.id == currentGameId }));
  });
  if (tabs.length <= 1) return '';
  const btns = tabs.map(t => {
    let href = `${t.path}?game_id=${t.id}`;
    if (playerId) href += `&player_id=${playerId}`;
    return `<a href="${href}" class="tab-btn${t.active ? ' active' : ''}">${esc(t.label)}</a>`;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:#364560;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:2px">Dex:</span>
    ${btns}
  </div>`;
}

function dexTabBar(parentGroup, currentDlc, gameId, playerId) {
  const tabs = DLC_TABS[parentGroup];
  if (!tabs) return '';
  const basePath = parentGroup === 'SwSh' ? '/dex/galar'
                 : parentGroup === 'SV'   ? '/dex/paldea'
                 : '/dex/lumiose';
  const btns = tabs.map(t => {
    const active = t.dlc === currentDlc;
    let href = basePath + '?game_id=' + (gameId || '');
    if (t.dlc) href += '&dlc=' + t.dlc;
    if (playerId) href += '&player_id=' + playerId;
    return `<a href="${href}" class="tab-btn${active ? ' active' : ''}">${esc(t.label)}</a>`;
  }).join('');
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
    <span style="font-size:11px;color:#364560;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-right:2px">Dex:</span>
    ${btns}
  </div>`;
}

// ── Card grid ─────────────────────────────────────────────────────────────────

function renderGrid(rows, caughtSet, useShiny = false, exclusiveMap = new Map(), catchNextId = null, encounterSet = null, isGroupMode = false) {
  const cards = rows.map(r => {
    if (r._isDivider) {
      return `<div class="bonus-divider"><span>${esc(r.label)}</span></div>`;
    }
    const num       = String(r.regional_number ?? r.pokedex_number).padStart(3, '0');
    const isCaught  = caughtSet.has(r.pokemon_id);
    const isForm    = r._isForm !== undefined ? r._isForm : r.pokemon_id.includes('_');
    const isBonus   = r._bonus === true;
    const shinyUrl  = (r.icon_url ?? '').replace('/normal/', '/shiny/');
    const displayIcon = useShiny ? shinyUrl : (r.icon_url ?? '');
    const tc   = TYPE_COLORS[r.type1] ?? '#223152';
    const excl = exclusiveMap.get(r.pokemon_id);
    const isCatchNext = catchNextId && r.pokemon_id === catchNextId;

    return `<div class="poke-card${isCaught ? ' caught' : ''}${isCatchNext ? ' catch-next' : ''}"
      data-pokemon-id="${esc(r.pokemon_id)}"
      data-name="${esc(r.name)}"
      data-number="${esc(num)}"
      data-type1="${esc(r.type1 ?? '')}"
      data-type2="${esc(r.type2 ?? '')}"
      data-form-name="${esc(r.form_name ?? '')}"
      data-icon="${esc(r.icon_url ?? '')}"
      data-shiny-icon="${esc(shinyUrl)}"
      data-use-shiny="${useShiny ? 'true' : 'false'}"
      data-gen="${esc(String(r.generation ?? ''))}"
      data-caught="${isCaught ? 'true' : 'false'}"
      data-dex-num="${esc(String(r.pokedex_number))}"
      data-is-form="${isForm ? 'true' : 'false'}"
      data-bonus="${isBonus ? 'true' : 'false'}"
      data-excl-names="${esc(excl ? excl.names.join(' or ') : '')}"
      style="--tc:${tc}${isForm ? ';display:none' : ''}"
      onclick="selectPokemon(this)">
      <button type="button" class="catch-toggle${isCaught ? ' caught' : ''}"
        aria-label="Toggle caught" aria-pressed="${isCaught ? 'true' : 'false'}"
        onclick="event.stopPropagation()">${isCaught ? '✓' : ''}</button>
      ${excl ? `<div class="excl-badge" title="${isGroupMode ? `Version exclusive — only available in ${esc(excl.names.join(' or '))}` : `Can't be caught here — trade from ${esc(excl.names.join(' or '))}`}">${
        (excl.games ?? [{ abbr: excl.tag, name: excl.names?.[0] }])
          .map(g => `<span style="color:${GAME_COLORS[g.name] ?? EXCL_COLOR_DEFAULT}">${esc(g.abbr)}</span>`)
          .join('<span class="excl-sep">/</span>')
      }</div>` : ''}
<img src="${esc(displayIcon)}" width="64" height="64" loading="lazy" style="object-fit:contain;display:block;margin:0 auto;transition:transform .18s cubic-bezier(.2,.8,.3,1)">
      <div class="poke-info"><div class="poke-num">#${num}</div><div class="poke-name">${esc(r.name)}</div></div>
      ${isCatchNext ? '<div class="catch-next-badge">Catch Next</div>' : ''}
    </div>`;
  }).join('');
  return `<div class="poke-grid">${cards}</div>`;
}

// ── Full page shell ───────────────────────────────────────────────────────────

function page(title, tableHtml, count, user, gameId, caughtCount, sidebarHtml, selectedGame = null, dexTabsHtml = '', catchNext = null, allGames = [], allGroupKey = null) {
  const playerId = user?.id ?? null;
  const cs = user?.settings?.card_scale || 'medium';
  const ps = user?.settings?.panel_size || 'medium';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Living Pokédex</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#0a1228">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
  <link rel="stylesheet" href="/app.css">
  <style>:root{--grid-cols:6;--panel-width:${({small:'20vw',medium:'30vw',large:'42vw'}[(user?.settings?.panel_size)] ?? '30vw')}}</style>
</head>
<body>
  <header>
    <a class="brand" href="/"><span class="ball"></span><h1>Living Pokédex</h1></a>
    <a class="nav-link" href="/"><i class="bi bi-house-fill"></i><span class="nav-label">Home</span></a>
    <a class="nav-link active" href="/dex"><i class="bi bi-grid-3x3-gap-fill"></i><span class="nav-label">Pokédex</span></a>
    <a class="nav-link" href="/stats"><i class="bi bi-bar-chart-fill"></i><span class="nav-label">Stats</span></a>
    <a class="nav-link" href="/settings"><i class="bi bi-gear-fill"></i><span class="nav-label">Settings</span></a>
    <div class="hdr-right">
      ${user ? `<span class="user-chip"><i class="bi bi-person-circle"></i><span class="nav-label">${esc(user.display_name || user.username)}</span>${user.is_admin ? '<span class="tag">ADMIN</span>' : ''}</span>` : ''}
      ${user ? `<a class="nav-link" href="/auth/logout" title="Log out"><i class="bi bi-box-arrow-right"></i></a>` : ''}
      ${progressHtml(playerId, gameId, caughtCount, count)}
    </div>
  </header>
  <div class="layout">
    ${sidebarHtml}
    <aside id="detail-panel">
      <button id="panel-toggle-btn" onclick="toggleDetailPanel()" title="Toggle detail panel"><i class="bi bi-chevron-right" id="panel-toggle-icon"></i></button>
      <div id="panel-content">
        <div id="detail-inner">
          <div id="dp-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:20px;text-align:center;gap:14px">
            <!-- filled by client.js using CATCH_NEXT -->
            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true" style="opacity:.18">
              <circle cx="28" cy="28" r="27" fill="none" stroke="#7ab4ff" stroke-width="2"/>
              <path d="M1 28h54" stroke="#7ab4ff" stroke-width="2"/>
              <circle cx="28" cy="28" r="8" fill="none" stroke="#7ab4ff" stroke-width="2"/>
              <circle cx="28" cy="28" r="4" fill="#7ab4ff"/>
              <path d="M1 28A27 27 0 0 1 55 28" fill="rgba(74,127,255,.08)"/>
            </svg>
            <span style="color:#3a506a;font-size:13px;font-weight:500;letter-spacing:.2px">Select a Pokémon to view details</span>
          </div>
        </div>
        <div id="sv-map-section"></div>
        <div id="evo-section"></div>
      </div>
    </aside>
    <main>
      <div style="position:sticky;top:0;z-index:10;background:#08101c;margin:0 -20px;padding:16px 20px 8px;border-bottom:1px solid #182035">
      <div id="dex-tabs-bar">${dexTabsHtml}</div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:0">
        <button id="sidebar-toggle" aria-label="Browse games" aria-expanded="false"><i class="bi bi-layout-sidebar-reverse"></i>Games</button>
        <button id="filter-toggle" class="ctrl-btn" onclick="toggleFilters()" aria-expanded="false" aria-controls="filter-panel"><i class="bi bi-sliders"></i>Filters</button>
        <div id="filter-panel">
          <input id="search-input" type="text" placeholder="Search Pokémon…" oninput="applyFilters()"
            style="padding:5px 10px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#c9d1d9;font-size:13px;outline:none">
          <button id="hide-caught-btn" class="ctrl-btn" onclick="toggleHideCaught()">Hide Caught</button>
        </div>
        <div id="location-toggle-wrap">
          <button id="location-toggle" class="ctrl-btn" onclick="toggleLocationPanel()" aria-expanded="false" aria-controls="location-panel"><i class="bi bi-geo-alt"></i>Locations</button>
          <div id="location-panel">
            <select id="loc-game-filter" onchange="onLocGameFilter(this.value)"
              style="display:none;padding:5px 10px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#c9d1d9;font-size:13px;cursor:pointer;outline:none;width:100%">
              <option value="">All games…</option>
            </select>
            <div class="loc-wrap">
              <select id="location-select" onchange="onLocationSelect(this.value)"
                style="padding:5px 10px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#c9d1d9;font-size:13px;cursor:pointer;outline:none;width:100%">
                <option value="">All locations…</option>
              </select>
              <button id="location-clear-btn" onclick="clearLocationFilter()" title="Clear location filter"
                style="display:none;padding:6px 10px;border-radius:5px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:15px;cursor:pointer;line-height:1;flex-shrink:0">×</button>
            </div>
          </div>
        </div>
        ${playerId && gameId ? '<button id="catch-all-btn" class="ctrl-btn ctrl-primary" onclick="catchAll()">Catch All</button>' : ''}
        ${playerId && gameId ? '<button id="release-all-btn" class="ctrl-btn ctrl-danger" onclick="releaseAll()">Release All</button>' : ''}
        <div id="split-btn-grp" style="display:flex;align-items:center;gap:4px">
          <button id="split-btn" class="ctrl-btn" onclick="toggleSplitMode()"><i class="bi bi-layout-split"></i>Split</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
          <div style="display:flex;align-items:center;gap:2px" title="Entry scale">
            <i class="bi bi-grid-fill" style="font-size:11px;color:#546070;flex-shrink:0"></i>
            <div class="scale-grp">
              <button class="ctrl-btn${cs==='small'?' active':''}" data-scale="small" onclick="setCardScale('small')" title="Compact">S</button>
              <button class="ctrl-btn${cs==='medium'?' active':''}" data-scale="medium" onclick="setCardScale('medium')" title="Medium">M</button>
              <button class="ctrl-btn${cs==='large'?' active':''}" data-scale="large" onclick="setCardScale('large')" title="Large">L</button>
            </div>
          </div>
          <div class="panel-size-btns" title="Panel size">
            <i class="bi bi-layout-sidebar-reverse" style="font-size:11px;color:#546070;flex-shrink:0"></i>
            <div class="scale-grp">
              <button class="ctrl-btn${ps==='small'?' active':''}" data-psize="small" onclick="setPanelSize('small')" title="Narrow">S</button>
              <button class="ctrl-btn${ps==='medium'?' active':''}" data-psize="medium" onclick="setPanelSize('medium')" title="Medium">M</button>
              <button class="ctrl-btn${ps==='large'?' active':''}" data-psize="large" onclick="setPanelSize('large')" title="Wide">L</button>
            </div>
          </div>
          <select id="sort-select" onchange="applySort(this.value)"
            style="padding:4px 8px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#c9d1d9;font-size:12px;cursor:pointer;outline:none">
            <option value="regional">Sort: Regional #</option>
            <option value="national">Sort: National #</option>
          </select>
          <div class="meta" style="margin:0">${count} entries</div>
        </div>
      </div>
      </div>
      ${tableHtml}
      <div id="empty-state" class="poke-empty" style="display:none">No Pokémon match your filters.</div>
    </main>
  </div>
  <div id="undo-toast"><div id="undo-progress"></div><span id="undo-msg"></span><button id="undo-btn" onclick="undoLastBatch()" style="padding:3px 12px;border-radius:5px;border:1px solid #1a3898;background:linear-gradient(135deg,#0e2260,#0a1848);color:#7ab4ff;font-size:12px;cursor:pointer;font-weight:600">Undo</button></div>
  <canvas id="confetti" style="position:fixed;inset:0;pointer-events:none;z-index:10000;display:none"></canvas>
  <div id="modal-root"></div>
  <div id="panel-backdrop"></div>
  <script>
    window.__LD = {
      PLAYER_ID:    ${playerId ? Number(playerId) : 'null'},
      GAME_ID:      ${gameId ? Number(gameId) : 'null'},
      GAME_GROUP:   ${selectedGame ? JSON.stringify(selectedGame.game_group) : (allGroupKey ? JSON.stringify(allGroupKey) : 'null')},
      GAME_NAME:    ${selectedGame ? JSON.stringify(selectedGame.name) : 'null'},
      ALL_GROUP:    ${allGroupKey ? JSON.stringify(allGroupKey) : 'null'},
      SETTINGS:     ${JSON.stringify(user?.settings || {})},
      GAME_COLORS:  ${JSON.stringify(GAME_COLORS)},
      GROUP_REGION: ${JSON.stringify(GROUP_REGION)},
      GROUP_LABELS: ${JSON.stringify(GROUP_LABELS)},
      TYPE_COLORS:  ${JSON.stringify(TYPE_COLORS)},
      CATCH_NEXT:   ${catchNext ? JSON.stringify(catchNext) : 'null'},
      GAMES:        ${JSON.stringify((allGames||[]).map(g => ({id:g.id,name:g.name,game_group:g.game_group})))},
    };
  </script>
  <script src="/panel-evo.js" defer></script>
  <script src="/panel-encounters.js" defer></script>
  <script src="/panel-stats.js" defer></script>
  <script src="/panel.js" defer></script>
  <script src="/filters.js" defer></script>
  <script src="/batch.js" defer></script>
  <script src="/scraper-client.js" defer></script>
  <script src="/client.js" defer></script>
  <script>
  document.addEventListener('DOMContentLoaded', function() {
    var toggleBtn = document.getElementById('sidebar-toggle');
    var backdrop  = document.getElementById('panel-backdrop');
    var panel     = document.getElementById('detail-panel');

    function isMobile() {
      return window.matchMedia && window.matchMedia('(max-width:820px)').matches;
    }
    function updateBackdrop() {
      if (!backdrop) return;
      var panelOpen   = panel && panel.classList.contains('open');
      var sidebarOpen = document.body.classList.contains('sidebar-open');
      backdrop.style.display = (isMobile() && (panelOpen || sidebarOpen)) ? 'block' : 'none';
    }

    window.closeSidebar = function() {
      if (isMobile()) {
        document.body.classList.remove('sidebar-open');
      } else {
        document.body.classList.add('sidebar-closed');
        var icon = document.getElementById('sidebar-toggle-icon');
        if (icon) icon.className = 'bi bi-chevron-right';
      }
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      updateBackdrop();
    };
    window.toggleSidebar = function() {
      if (isMobile()) {
        var open = document.body.classList.toggle('sidebar-open');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(open));
        updateBackdrop();
      } else {
        var closed = document.body.classList.toggle('sidebar-closed');
        var icon = document.getElementById('sidebar-toggle-icon');
        if (icon) icon.className = closed ? 'bi bi-chevron-right' : 'bi bi-chevron-left';
      }
    };

    window.toggleFilters = function() {
      var fp  = document.getElementById('filter-panel');
      var btn = document.getElementById('filter-toggle');
      if (!fp) return;
      var open = fp.classList.toggle('open');
      if (btn) btn.setAttribute('aria-expanded', String(open));
      if (typeof updateFilterBadge === 'function') updateFilterBadge();
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        var icon = toggleBtn.querySelector('i');
        if (isMobile()) {
          var open = document.body.classList.toggle('sidebar-open');
          toggleBtn.setAttribute('aria-expanded', String(open));
          if (icon) icon.className = open ? 'bi bi-x-lg' : 'bi bi-layout-sidebar-reverse';
        } else {
          var closed = document.body.classList.toggle('sidebar-closed');
          toggleBtn.setAttribute('aria-expanded', String(!closed));
          if (icon) icon.className = closed ? 'bi bi-layout-sidebar-reverse' : 'bi bi-x-lg';
        }
        updateBackdrop();
      });
      var _sg = window.selectGame;
      if (_sg) {
        window.selectGame = function(id) {
          if (isMobile()) window.closeSidebar();
          return _sg(id);
        };
      }
    }

    if (backdrop) {
      backdrop.addEventListener('click', function() {
        if (typeof closePanel === 'function') closePanel();
        window.closeSidebar();
      });
    }
    if (panel) {
      new MutationObserver(updateBackdrop).observe(panel, { attributes: true, attributeFilter: ['class'] });
    }

    window.addEventListener('resize', function() {
      if (isMobile()) {
        document.body.classList.remove('sidebar-closed');
      } else if (document.body.classList.contains('sidebar-open')) {
        window.closeSidebar();
      }
    });
  });
  </script>
</body>
</html>`;
}

// ── Helpers shared between dex page routes and the dex-grid API ──────────────

function homeSubTabsFor(gameGroup, games, gameId, playerId) {
  if (!gameGroup || !HOME_SHINY_DEXES.has(gameGroup)) return '';
  const sg = HOME_GAME_SUBGROUPS.find(s => s.groups.includes(gameGroup));
  return (sg && sg.groups.length > 1) ? homeSubTabBar(sg, games, gameId, playerId) : '';
}

const SHINY_HIDDEN_FORM_TAGS = new Set(['Mega', 'Forms']);
function expandShinyForms(allRows) {
  for (const r of allRows) {
    if (r._isForm && r.pokemon_id.includes('_')
        && !SHINY_HIDDEN_FORM_TAGS.has(r.form_tag ?? '')
        && !SHINY_DEX_FORM_EXCLUSIONS.has(r.pokemon_id)) {
      r._isForm = false;
    }
  }
  allRows.sort((a, b) => {
    if (a.pokedex_number !== b.pokedex_number) return a.pokedex_number - b.pokedex_number;
    const aIdx = a.pokemon_id.includes('_') ? parseInt(a.pokemon_id.split('_')[1]) + 1 : 0;
    const bIdx = b.pokemon_id.includes('_') ? parseInt(b.pokemon_id.split('_')[1]) + 1 : 0;
    return aIdx - bIdx;
  });
  return allRows;
}

module.exports = {
  esc,
  badge,
  progressHtml,
  ringHtml,
  sidebarScraperWheels,
  sidebar,
  homeTabBar,
  homeSubTabBar,
  homeSubTabsFor,
  expandShinyForms,
  dexTabBar,
  renderGrid,
  page,
};
