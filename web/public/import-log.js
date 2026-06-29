(function () {
  'use strict';

  var TC = {
    Normal:'#9fa19f', Fire:'#e62829', Water:'#2980ef', Electric:'#fac000',
    Grass:'#3fa129', Ice:'#3fd8ff', Fighting:'#ff8000', Poison:'#9141cb',
    Ground:'#915121', Flying:'#81b9ef', Psychic:'#ef4179', Bug:'#91a119',
    Rock:'#afa981', Ghost:'#704170', Dragon:'#5060e1', Dark:'#624d4e',
    Steel:'#60a1b8', Fairy:'#ef70ef',
  };

  var STATUS = {
    all:   { label: 'All',       color: '#5fd58a', icon: 'list-ul' },
    ok:    { label: 'Imported',  color: '#5fd58a', icon: 'check-circle-fill' },
    shiny: { label: 'Shiny',     color: '#f0c040', icon: 'stars' },
    dup:   { label: 'Duplicate', color: '#8a9ab8', icon: 'arrow-repeat' },
    skip:  { label: 'Unmapped',  color: '#e8c84a', icon: 'exclamation-triangle-fill' },
    err:   { label: 'Error',     color: '#ff9d9d', icon: 'x-circle-fill' },
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function gameLabel(g) {
    if (!g) return '—';
    if (g === 'Shiny Dex') return 'Shiny Dex';
    return g.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function typeBadge(t) {
    if (!t) return '';
    var bg = TC[t] || '#888';
    return '<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:9px;font-weight:700;'
      + 'letter-spacing:.3px;color:#fff;background:' + bg + ';opacity:.9;margin-right:2px">' + esc(t) + '</span>';
  }

  function fmtDate(dt) {
    if (!dt) return '—';
    try { return new Date(dt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return String(dt); }
  }

  function dupSubtype(e) {
    if (e.prevRaw && e.existing) return 'both';
    if (e.prevRaw)   return 'same';
    if (e.existing)  return 'pre';
    return '';
  }

  function dupLabel(e) {
    var t = dupSubtype(e);
    if (t === 'both') return 'Dup (backup + DB)';
    if (t === 'same') return 'Dup (same backup)';
    if (t === 'pre')  return 'Dup (pre-existing)';
    return 'Duplicate';
  }

  function statusBadge(e) {
    var a = typeof e === 'string' ? e : e.a;
    var s = STATUS[a] || { label: a, color: '#888' };
    var label = (a === 'dup' && typeof e !== 'string') ? dupLabel(e) : s.label;
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:12px;'
      + 'font-size:11px;font-weight:700;background:' + s.color + '1a;color:' + s.color
      + ';border:1px solid ' + s.color + '40">'
      + (s.icon ? '<i class="bi bi-' + s.icon + '" style="font-size:9px"></i>' : '')
      + label + '</span>';
  }

  // ── State ────────────────────────────────────────────────────────────────────
  var _d = null;
  var _statusFilter = 'all';
  var _gameFilter = '';
  var _activeIdx = -1;   // index in filteredLog()

  function filteredLog() {
    var log = _d && _d.log || [];
    return log.filter(function (e) {
      if (_statusFilter !== 'all' && e.a !== _statusFilter) return false;
      if (_gameFilter && e.g !== _gameFilter) return false;
      return true;
    });
  }

  // ── Table rendering (batched for large sets) ─────────────────────────────────
  var BATCH = 300;

  function renderTable() {
    var tbody = document.getElementById('irl-tbody');
    if (!tbody) return;
    var rows = filteredLog();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#364560;font-size:13px">'
        + 'No entries match the current filter.</td></tr>';
      updateResultCount(0);
      return;
    }
    updateResultCount(rows.length);
    var html = buildRowsHtml(rows, 0, Math.min(BATCH, rows.length));
    tbody.innerHTML = html;
    if (rows.length > BATCH) appendLoadMore(tbody, rows, BATCH);
  }

  function buildRowsHtml(rows, from, to) {
    var out = '';
    for (var i = from; i < to; i++) {
      var e = rows[i];
      var sc = (STATUS[e.a] || {}).color || '#888';
      var sprite = e.icon
        ? '<img src="' + esc(e.icon) + '" width="36" height="36" loading="lazy"'
          + ' style="object-fit:contain;image-rendering:pixelated;display:block">'
        : '<div style="width:36px;height:36px;border-radius:4px;background:#0c1628"></div>';
      var nameHtml = '<span style="font-weight:600;color:#c9d1d9">' + esc(e.name || ('#' + (e.pokemonId || '?'))) + '</span>';
      if (e.form) nameHtml += ' <span style="font-size:10px;color:#546070">(' + esc(e.form) + ')</span>';
      out += '<tr data-row="' + i + '" onclick="window.__IRL.select(' + i + ')"'
        + ' style="cursor:pointer;border-bottom:1px solid #0e1828;transition:background .1s"'
        + ' onmouseover="if(window.__IRL.activeIdx!=' + i + ')this.style.background=\'#0c1628\'"'
        + ' onmouseout="if(window.__IRL.activeIdx!=' + i + ')this.style.background=\'\'">'
        + '<td style="padding:6px 10px 6px 14px;width:44px">' + sprite + '</td>'
        + '<td style="padding:6px 8px;color:#364560;font-size:11px;white-space:nowrap">' + esc(e.num || '') + '</td>'
        + '<td style="padding:6px 8px">' + nameHtml + '</td>'
        + '<td style="padding:6px 8px;white-space:nowrap">' + typeBadge(e.type1) + typeBadge(e.type2) + '</td>'
        + '<td style="padding:6px 8px;color:#8a9ab8;font-size:12px;white-space:nowrap">' + esc(gameLabel(e.g)) + '</td>'
        + '<td style="padding:6px 8px;white-space:nowrap">' + statusBadge(e) + '</td>'
        + '<td style="padding:6px 8px;color:#546070;font-size:11px;white-space:nowrap">' + esc(fmtDate(e.raw && e.raw.caught_at)) + '</td>'
        + '</tr>';
    }
    return out;
  }

  function appendLoadMore(tbody, rows, loaded) {
    var tr = document.createElement('tr');
    tr.id = 'irl-load-more';
    tr.innerHTML = '<td colspan="7" style="text-align:center;padding:10px">'
      + '<button onclick="window.__IRL.loadMore()" style="background:#0c1628;border:1px solid #1c2942;'
      + 'color:#8a9ab8;border-radius:6px;padding:6px 16px;font-size:12px;cursor:pointer">'
      + 'Show more (' + (rows.length - loaded).toLocaleString() + ' remaining)</button></td>';
    tbody.appendChild(tr);
  }

  // ── Detail panel ─────────────────────────────────────────────────────────────
  function renderDetail(e) {
    var panel = document.getElementById('irl-detail');
    if (!panel) return;
    if (!e) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';

    var sprite = e.icon
      ? '<img src="' + esc(e.icon) + '" width="48" height="48" style="object-fit:contain;image-rendering:pixelated">'
      : '';

    var heading = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
      + sprite
      + '<div style="flex:1">'
      + '<div style="font-size:14px;font-weight:700;color:#c9d1d9">'
      + esc(e.name || ('#' + (e.pokemonId || '?')))
      + (e.form ? ' <span style="font-size:11px;font-weight:400;color:#546070">(' + esc(e.form) + ')</span>' : '')
      + '</div>'
      + '<div style="font-size:11px;color:#546070;margin-top:2px">'
      + typeBadge(e.type1) + typeBadge(e.type2)
      + ' &nbsp;' + esc(gameLabel(e.g)) + ' &nbsp;·&nbsp; ' + statusBadge(e)
      + '</div>'
      + '</div>'
      + '<button onclick="window.__IRL.closeDetail()" title="Close" '
      + 'style="background:none;border:1px solid #1c2942;border-radius:6px;color:#546070;'
      + 'cursor:pointer;padding:3px 9px;font-size:13px;flex-shrink:0">✕</button>'
      + '</div>';

    var body = '';
    if (e.a === 'dup') {
      // Build up to 3 comparison panels depending on what's available
      var panels = [];
      panels.push(jsonPanel('This entry (from backup)', e.raw, '#1c2942'));
      if (e.prevRaw)  panels.push(jsonPanel('Earlier in this backup', e.prevRaw, '#1c3a1c'));
      if (e.existing) panels.push(jsonPanel('Pre-existing in database', e.existing, '#2a1c10'));
      var cols = panels.length === 3 ? '1fr 1fr 1fr' : panels.length === 2 ? '1fr 1fr' : '1fr';
      body = '<div style="display:grid;grid-template-columns:' + cols + ';gap:12px">' + panels.join('') + '</div>';

      // Explanatory note
      var note = '';
      if (e.prevRaw && e.existing)
        note = 'This entry is a duplicate of both an earlier entry in the same backup file, and a record that was already in the database before this import.';
      else if (e.prevRaw)
        note = 'This entry is a duplicate of an earlier entry within the same backup file. The slot was claimed earlier in this import run.';
      else if (e.existing)
        note = 'This entry matched a record that was already in the database before this import started.';
      if (note) body = '<div style="font-size:11px;color:#546070;margin-bottom:10px;line-height:1.6">' + note + '</div>' + body;
    } else {
      body = '<div style="display:grid;grid-template-columns:1fr' + (e.errMsg ? ' 1fr' : '') + ';gap:14px">'
        + jsonPanel('Entry data', e.raw, '#1c2942');
      if (e.errMsg) {
        body += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;'
          + 'color:#5a6b82;font-weight:700;margin-bottom:6px">Error</div>'
          + '<div style="padding:10px;background:rgba(255,80,80,.07);border:1px solid rgba(255,80,80,.2);'
          + 'border-radius:6px;font-size:12px;color:#ff9d9d;line-height:1.6">' + esc(e.errMsg) + '</div></div>';
      }
      body += '</div>';
    }

    panel.innerHTML = heading + body;
  }

  function jsonPanel(title, obj, borderColor) {
    var content = obj ? JSON.stringify(obj, null, 2) : 'No data';
    return '<div>'
      + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#5a6b82;font-weight:700;margin-bottom:6px">'
      + esc(title) + '</div>'
      + '<pre style="margin:0;padding:10px;background:#060c18;border:1px solid ' + (borderColor || '#1c2942') + ';'
      + 'border-radius:7px;font-size:11px;color:#8a9ab8;overflow-x:auto;line-height:1.65;max-height:180px;overflow-y:auto">'
      + esc(content) + '</pre></div>';
  }

  // ── Filter bar helpers ───────────────────────────────────────────────────────
  function countsByStatus() {
    var log = _d && _d.log || [];
    var c = { all: log.length };
    log.forEach(function (e) { c[e.a] = (c[e.a] || 0) + 1; });
    return c;
  }

  function updateResultCount(n) {
    var el = document.getElementById('irl-result-count');
    if (el) el.textContent = n.toLocaleString() + ' entr' + (n === 1 ? 'y' : 'ies');
  }

  function activateTab(s) {
    document.querySelectorAll('[data-irl-tab]').forEach(function (btn) {
      var active = btn.dataset.irlTab === s;
      var sc = (STATUS[btn.dataset.irlTab] || STATUS.ok).color;
      btn.style.background = active ? sc + '1a' : 'transparent';
      btn.style.color = active ? sc : '#5a6b82';
      btn.style.borderColor = active ? sc + '50' : '#1c2942';
    });
  }

  // ── Public API (window.__IRL) ────────────────────────────────────────────────
  window.__IRL = {
    activeIdx: -1,

    setStatus: function (s) {
      _statusFilter = s;
      _activeIdx = -1;
      this.activeIdx = -1;
      activateTab(s);
      renderTable();
      renderDetail(null);
    },

    setGame: function (g) {
      _gameFilter = g;
      _activeIdx = -1;
      this.activeIdx = -1;
      renderTable();
      renderDetail(null);
    },

    select: function (idx) {
      var rows = filteredLog();
      var e = rows[idx];
      if (!e) return;
      _activeIdx = idx;
      this.activeIdx = idx;
      document.querySelectorAll('#irl-tbody tr').forEach(function (tr) { tr.style.background = ''; });
      var sel = document.querySelector('#irl-tbody [data-row="' + idx + '"]');
      if (sel) sel.style.background = '#111d32';
      renderDetail(e);
    },

    loadMore: function () {
      var tbody = document.getElementById('irl-tbody');
      var lm = document.getElementById('irl-load-more');
      if (!tbody || !lm) return;
      var loaded = tbody.querySelectorAll('tr:not(#irl-load-more)').length;
      var rows = filteredLog();
      var next = Math.min(loaded + BATCH, rows.length);
      lm.insertAdjacentHTML('beforebegin', buildRowsHtml(rows, loaded, next));
      if (next >= rows.length) lm.remove();
      else lm.querySelector('button').textContent =
        'Show more (' + (rows.length - next).toLocaleString() + ' remaining)';
    },

    closeDetail: function () {
      _activeIdx = -1;
      this.activeIdx = -1;
      document.querySelectorAll('#irl-tbody tr').forEach(function (tr) { tr.style.background = ''; });
      renderDetail(null);
    },

    close: function () {
      var el = document.getElementById('irl-modal');
      if (el) el.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', _keyHandler);
    },
  };

  var _keyHandler = function (ev) {
    if (ev.key === 'Escape') window.__IRL.close();
  };

  // ── Entry point ──────────────────────────────────────────────────────────────
  window.showImportLog = function (d, skipSave) {
    if (!skipSave) {
      try { localStorage.setItem('lpLastImport', JSON.stringify({ d: d, savedAt: Date.now() })); } catch (e) {}
      if (typeof window.__irlUpdateLastImportBtn === 'function') window.__irlUpdateLastImportBtn();
    }
    _d = d;
    _statusFilter = 'all';
    _gameFilter = '';
    _activeIdx = -1;
    window.__IRL.activeIdx = -1;

    var old = document.getElementById('irl-modal');
    if (old) old.remove();

    var log = d.log || [];
    var counts = countsByStatus();

    // ── Summary pills ─────────────────────────────────────────────────────────
    var summParts = [];
    if (d.imported)     summParts.push('<strong style="color:#5fd58a">' + d.imported.toLocaleString() + '</strong> imported');
    if (d.shinyImported)summParts.push('<strong style="color:#f0c040">' + d.shinyImported.toLocaleString() + '</strong> ✨ shiny');
    if (d.skipped)      summParts.push('<strong style="color:#8a9ab8">' + d.skipped.toLocaleString() + '</strong> skipped');

    // ── Status tab buttons ────────────────────────────────────────────────────
    var tabOrder = ['all', 'ok', 'shiny', 'dup', 'skip', 'err'];
    var tabsHtml = tabOrder.map(function (key) {
      var cnt = counts[key] || 0;
      if (cnt === 0 && key !== 'all') return '';
      var s = STATUS[key] || STATUS.ok;
      var active = key === 'all';
      return '<button data-irl-tab="' + key + '" onclick="window.__IRL.setStatus(\'' + key + '\')"'
        + ' style="padding:4px 13px;border-radius:20px;border:1px solid ' + (active ? s.color + '50' : '#1c2942') + ';'
        + 'background:' + (active ? s.color + '1a' : 'transparent') + ';color:' + (active ? s.color : '#5a6b82') + ';'
        + 'cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;transition:all .15s">'
        + s.label + ' <span style="opacity:.65">' + cnt.toLocaleString() + '</span></button>';
    }).join('');

    // ── Game select ───────────────────────────────────────────────────────────
    var games = log.map(function (e) { return e.g; }).filter(Boolean)
      .filter(function (g, i, a) { return a.indexOf(g) === i; }).sort();
    var gameOptHtml = '<option value="">All games</option>'
      + games.map(function (g) { return '<option value="' + esc(g) + '">' + esc(gameLabel(g)) + '</option>'; }).join('');

    // ── Modal HTML ────────────────────────────────────────────────────────────
    var modal = document.createElement('div');
    modal.id = 'irl-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,14,.9);backdrop-filter:blur(5px);'
      + 'z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px';

    modal.innerHTML =
      '<div style="background:#0a1220;border:1px solid #1c2942;border-radius:14px;width:100%;max-width:1080px;'
      + 'height:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;'
      + 'box-shadow:0 24px 64px rgba(0,0,0,.7)">'

      // Header
      + '<div style="padding:14px 20px;border-bottom:1px solid #1c2942;display:flex;align-items:center;'
      +   'gap:10px;flex-shrink:0;background:#070d18">'
      +   '<i class="bi bi-box-arrow-in-down" style="color:#5fd58a;font-size:15px"></i>'
      +   '<span style="font-size:15px;font-weight:700;color:#c9d1d9">Import Results</span>'
      +   '<span style="font-size:12.5px;color:#546070;margin-left:4px">' + summParts.join(' &nbsp;·&nbsp; ') + '</span>'
      +   '<button onclick="window.__IRL.close()" style="margin-left:auto;background:none;border:1px solid #1c2942;'
      +     'border-radius:7px;color:#546070;cursor:pointer;padding:4px 12px;font-size:12px;font-weight:600'
      +     ';transition:border-color .15s,color .15s" onmouseover="this.style.color=\'#c9d1d9\';this.style.borderColor=\'#3a5070\'" onmouseout="this.style.color=\'#546070\';this.style.borderColor=\'#1c2942\'">✕ Close</button>'
      + '</div>'

      // Filter bar
      + '<div style="padding:9px 20px;border-bottom:1px solid #1c2942;display:flex;align-items:center;'
      +   'gap:8px;flex-wrap:wrap;flex-shrink:0">'
      +   tabsHtml
      +   '<div style="margin-left:auto;display:flex;align-items:center;gap:8px">'
      +     '<select id="irl-game-select" onchange="window.__IRL.setGame(this.value)"'
      +       ' style="background:#060c18;border:1px solid #1c2942;color:#8a9ab8;border-radius:7px;'
      +       'padding:4px 10px;font-size:12px;cursor:pointer;outline:none">'
      +       gameOptHtml
      +     '</select>'
      +     '<span id="irl-result-count" style="font-size:11px;color:#364560;white-space:nowrap">'
      +       log.length.toLocaleString() + ' entries'
      +     '</span>'
      +   '</div>'
      + '</div>'

      // Table
      + '<div style="flex:1;overflow-y:auto;min-height:0">'
      +   '<table style="width:100%;border-collapse:collapse">'
      +     '<thead style="position:sticky;top:0;z-index:1">'
      +       '<tr style="background:#060c18">'
      +         '<th style="' + TH + 'width:44px;padding-left:14px"></th>'
      +         '<th style="' + TH + '">#</th>'
      +         '<th style="' + TH + '">Pokémon</th>'
      +         '<th style="' + TH + '">Type</th>'
      +         '<th style="' + TH + '">Game</th>'
      +         '<th style="' + TH + '">Status</th>'
      +         '<th style="' + TH + '">Caught</th>'
      +       '</tr>'
      +     '</thead>'
      +     '<tbody id="irl-tbody"></tbody>'
      +   '</table>'
      + '</div>'

      // Detail panel
      + '<div id="irl-detail" style="display:none;border-top:1px solid #1c2942;padding:14px 20px;'
      +   'background:#07101e;max-height:300px;overflow-y:auto;flex-shrink:0"></div>'

      + '</div>';

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    modal.addEventListener('click', function (ev) { if (ev.target === modal) window.__IRL.close(); });
    document.addEventListener('keydown', _keyHandler);

    renderTable();
  };

  var TH = 'padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;'
    + 'font-weight:700;text-align:left;border-bottom:2px solid #182035;white-space:nowrap;';

})();
