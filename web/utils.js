'use strict';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Marks a string as already-escaped HTML so html`` won't double-escape it.
class SafeString {
  constructor(s) { this.s = String(s); }
  toString() { return this.s; }
}

// Wraps a trusted HTML fragment so it passes through html`` unescaped.
function raw(s) { return new SafeString(s); }

// Tagged template literal that auto-escapes interpolated values.
// Use raw() to embed trusted HTML fragments: html`<div>${raw(someHtml)}</div>`
function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    out += (v instanceof SafeString ? v.s : esc(String(v ?? '')));
    out += strings[i + 1];
  }
  return out;
}

// Promotes Mega forms to visible and hides the base form when a Mega variant
// exists — shared between the server-rendered dex page and the dex-grid API.
function normalizeMegaDex(rows) {
  const numsWithMega = new Set(rows.filter(r => r.form_tag === 'Mega').map(r => r.pokedex_number));
  return rows.map(r => {
    if (r.form_tag === 'Mega') return { ...r, _isForm: false };
    if (!r.pokemon_id.includes('_') && numsWithMega.has(r.pokedex_number)) return { ...r, _isForm: true };
    return r;
  });
}

module.exports = { esc, raw, html, normalizeMegaDex };
