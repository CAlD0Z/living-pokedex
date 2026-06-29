// Shared panel state — declared here (first panel file loaded) so all other
// panel-*.js files and batch.js / client.js can read and write these variables.
let selectedCard         = null;
let panelEncData         = null;
let panelSpriteMode      = 'normal';
let panelGameGroup       = null;
let panelAbortController = null;
let panelDebounceTimer   = null;
const evoCache           = new Map();
const encCache           = new Map();
const statCache          = new Map();

// ── Evolution chain rendering ─────────────────────────────────────────────────

function condTagsList(method, conditions) {
  const get = t => conditions.find(c => c.startsWith(t + ':'))?.split(':').slice(1).join(':');
  const tags = [];
  const S = (text, bg) => `<span style="display:inline-block;background:${bg};color:#fff;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap">${text}</span>`;
  const lvl = get('min_level');
  if (lvl) tags.push(S('Lv ' + lvl, '#4a90e2'));
  else if (method === 'level_up') tags.push(S('Level up', '#4a90e2'));
  const item = get('use_item');
  if (item) tags.push(S(item, '#e67e22'));
  const held = get('held_item');
  if (held) tags.push(S('Hold ' + held, '#8e44ad'));
  if (method === 'trade') tags.push(S('Trade', '#27ae60'));
  if (method === 'friendship' || get('friendship')) tags.push(S('Friendship', '#c0396b'));
  const tod = get('time_of_day');
  if (tod === 'day')   tags.push(S('Day', '#f39c12'));
  if (tod === 'night') tags.push(S('Night', '#34495e'));
  const gen = get('gender');
  if (gen === 'male')   tags.push(S('♂ Male', '#2980b9'));
  if (gen === 'female') tags.push(S('♀ Female', '#e91e8c'));
  const stat = get('stat_comparison');
  if (stat) tags.push(S(stat.replace('atk>def','Atk>Def').replace('def>atk','Def>Atk').replace('atk=def','Atk=Def'), '#c0392b'));
  const mv = get('move_known');
  if (mv) tags.push(S(mv, '#16a085'));
  const loc = get('location');
  if (loc) tags.push(S(loc.replace(' area',''), '#7f8c8d'));
  const reg = get('regional_context');
  if (reg) tags.push(S(reg.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()), '#6c3483'));
  if (method === 'other' && !tags.length) tags.push(S('Special', '#555'));
  return tags;
}

function condTags(method, conditions) {
  return condTagsList(method, conditions).join(' ');
}

function _esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function chainNode(pokemon, isCurrent) {
  const border  = isCurrent ? '2px solid #4a7fff' : '1px solid #1e2e4a';
  const bg      = isCurrent ? '#0f1f4a' : '#0d1626';
  const nameCol = isCurrent ? '#a8c4ff' : '#6b7a99';
  const fw      = isCurrent ? '700' : '400';
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;flex-shrink:0" onclick="switchForm('${_esc(pokemon.id)}')">
    <div style="border-radius:10px;border:${border};background:${bg};padding:5px">
      <img src="${_esc(pokemon.icon_url||'')}" width="52" height="52" style="object-fit:contain;display:block">
    </div>
    <div style="font-size:11px;font-weight:${fw};color:${nameCol};text-align:center;margin-top:5px;max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(pokemon.name)}</div>
    ${pokemon.form_name ? `<div style="font-size:9px;color:#364560;text-align:center;max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(pokemon.form_name)}</div>` : ''}
  </div>`;
}

function compactChainNode(pokemon, isCurrent) {
  const border  = isCurrent ? '2px solid #4a7fff' : '1px solid #1e2e4a';
  const bg      = isCurrent ? '#0f1f4a' : '#0d1626';
  const nameCol = isCurrent ? '#a8c4ff' : '#6b7a99';
  const fw      = isCurrent ? '700' : '400';
  return `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;flex-shrink:0" onclick="switchForm('${_esc(pokemon.id)}')">
    <div style="border-radius:8px;border:${border};background:${bg};padding:3px">
      <img src="${_esc(pokemon.icon_url||'')}" width="40" height="40" style="object-fit:contain;display:block">
    </div>
    <div style="font-size:10px;font-weight:${fw};color:${nameCol};text-align:center;margin-top:3px;max-width:54px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(pokemon.name)}</div>
  </div>`;
}

function renderChainNode(node, currentId) {
  const isCurrent = node.pokemon.id === currentId;
  if (node.branches.length === 0) return chainNode(node.pokemon, isCurrent);
  if (node.branches.length === 1) {
    const b = node.branches[0];
    const tl = condTagsList(b.method, b.conditions);
    const mid = Math.ceil(tl.length / 2);
    const above = tl.slice(0, mid).join(' ');
    const below = tl.slice(mid).join(' ');
    const arrowCol = `<div style="align-self:stretch;display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:120px">
      <div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-content:flex-end;padding-bottom:2px">${above}</div>
      <div style="display:flex;align-items:center;width:100%">
        <div style="flex:1;height:1px;background:#3a5878"></div>
        <span style="color:#3a5878;font-size:12px;line-height:1">▶</span>
      </div>
      <div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-content:flex-start;padding-top:2px">${below}</div>
    </div>`;
    return `<div style="display:inline-flex;align-items:center;flex-shrink:0">
      ${chainNode(node.pokemon, isCurrent)}
      ${arrowCol}
      ${renderChainNode(b.target, currentId)}
    </div>`;
  }

  const cNode = (treeNode) =>
    treeNode.branches.length === 0
      ? compactChainNode(treeNode.pokemon, treeNode.pokemon.id === currentId)
      : renderChainNode(treeNode, currentId);

  const lcell = (br, col, row) => {
    const tl = condTagsList(br.method, br.conditions);
    const mid = Math.ceil(tl.length / 2);
    const above = tl.slice(0, mid).join(' ');
    const below = tl.slice(mid).join(' ');
    return `<div style="grid-column:${col};grid-row:${row};display:flex;align-items:center;padding:4px 0">
      ${cNode(br.target)}
      <div style="align-self:stretch;display:flex;flex-direction:column;align-items:center;min-width:60px">
        <div style="flex:1;display:flex;flex-wrap:wrap;gap:2px;justify-content:center;align-content:flex-end;padding-bottom:2px">${above}</div>
        <div style="display:flex;align-items:center;width:100%">
          <span style="color:#3a5878;font-size:10px;line-height:1;flex-shrink:0">◀</span>
          <div style="flex:1;height:1px;background:#3a5878"></div>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;gap:2px;justify-content:center;align-content:flex-start;padding-top:2px">${below}</div>
      </div>
    </div>`;
  };
  const rcell = (br, col, row) => {
    const tl = condTagsList(br.method, br.conditions);
    const mid = Math.ceil(tl.length / 2);
    const above = tl.slice(0, mid).join(' ');
    const below = tl.slice(mid).join(' ');
    return `<div style="grid-column:${col};grid-row:${row};display:flex;align-items:center;padding:4px 0">
      <div style="align-self:stretch;display:flex;flex-direction:column;align-items:center;min-width:60px">
        <div style="flex:1;display:flex;flex-wrap:wrap;gap:2px;justify-content:center;align-content:flex-end;padding-bottom:2px">${above}</div>
        <div style="display:flex;align-items:center;width:100%">
          <div style="flex:1;height:1px;background:#3a5878"></div>
          <span style="color:#3a5878;font-size:10px;line-height:1;flex-shrink:0">▶</span>
        </div>
        <div style="flex:1;display:flex;flex-wrap:wrap;gap:2px;justify-content:center;align-content:flex-start;padding-top:2px">${below}</div>
      </div>
      ${cNode(br.target)}
    </div>`;
  };
  const baseCell = (gridCol, rows) => `
    <div style="grid-column:${gridCol};grid-row:1/span ${rows};display:flex;align-items:center;justify-content:center">
      ${chainNode(node.pokemon, isCurrent)}
    </div>`;
  const mkGrid = (cols, rows, inner) =>
    `<div style="display:inline-grid;grid-template-columns:${cols};grid-template-rows:repeat(${rows},auto);row-gap:8px">${inner}</div>`;

  if (node.branches.length >= 5) {
    const n  = node.branches.length;
    const lf = Math.floor(n / 4);
    const ln = Math.floor(n / 2) - lf;
    const rn = ln;
    const rf = n - lf - ln - rn;
    const rows = Math.max(lf, ln, rn, rf);
    const b    = node.branches;
    return mkGrid('auto auto auto auto auto', rows, [
      ...b.slice(0, lf)          .map((br, i) => lcell(br, 1, i + 1)),
      ...b.slice(lf, lf + ln)    .map((br, i) => lcell(br, 2, i + 1)),
      baseCell(3, rows),
      ...b.slice(lf+ln, lf+ln+rn).map((br, i) => rcell(br, 4, i + 1)),
      ...b.slice(lf+ln+rn)       .map((br, i) => rcell(br, 5, i + 1)),
    ].join(''));
  }

  if (node.branches.length === 4) {
    const [a, b2, c, d] = node.branches;
    return mkGrid('auto auto auto', 2, [
      lcell(a, 1, 1), lcell(b2, 1, 2),
      baseCell(2, 2),
      rcell(c, 3, 1), rcell(d, 3, 2),
    ].join(''));
  }

  const rows = node.branches.map(b => {
    const tl = condTagsList(b.method, b.conditions);
    const mid = Math.ceil(tl.length / 2);
    const above = tl.slice(0, mid).join(' ');
    const below = tl.slice(mid).join(' ');
    const arrowCol = `<div style="align-self:stretch;display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:120px">
      <div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-content:flex-end;padding-bottom:2px">${above}</div>
      <div style="display:flex;align-items:center;width:100%">
        <div style="flex:1;height:1px;background:#3a5878"></div>
        <span style="color:#3a5878;font-size:12px;line-height:1">▶</span>
      </div>
      <div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-content:flex-start;padding-top:2px">${below}</div>
    </div>`;
    return `<div style="display:flex;align-items:center;flex-shrink:0">
      ${arrowCol}
      ${renderChainNode(b.target, currentId)}
    </div>`;
  }).join('');
  return `<div style="display:inline-flex;align-items:center;flex-shrink:0">
    ${chainNode(node.pokemon, isCurrent)}
    <div style="display:flex;flex-direction:column;gap:8px">${rows}</div>
  </div>`;
}
