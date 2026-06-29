'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// Pull in only the pure functions we can test without a DB or browser.
// render.js is server-side and its exports don't require a running app.
const { esc, raw, html } = require('../utils');

// ── utils: esc ────────────────────────────────────────────────────────────────
test('esc: escapes HTML special chars', () => {
  assert.equal(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(esc("it's a trap"), "it&#39;s a trap");
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

// ── utils: html tagged template ───────────────────────────────────────────────
test('html: auto-escapes interpolated values', () => {
  const name = '<b>Evil</b>';
  const result = html`<div>${name}</div>`;
  assert.equal(result, '<div>&lt;b&gt;Evil&lt;/b&gt;</div>');
});

test('html: raw() bypasses escaping for trusted HTML', () => {
  const trusted = raw('<span class="badge">OK</span>');
  const result  = html`<div>${trusted}</div>`;
  assert.equal(result, '<div><span class="badge">OK</span></div>');
});

test('html: handles null and undefined gracefully', () => {
  assert.equal(html`<p>${null}</p>`, '<p></p>');
  assert.equal(html`<p>${undefined}</p>`, '<p></p>');
});

test('html: handles numbers without escaping', () => {
  const pct = 42;
  assert.equal(html`<div>${pct}%</div>`, '<div>42%</div>');
});

// ── render.js: ringColor ──────────────────────────────────────────────────────
// ringColor is not exported — replicate its logic here to test the contract.
function ringColor(pct) {
  if (pct <= 0)   return null;
  if (pct >= 100) return '#ffd700';
  if (pct >= 75)  return '#f5b830';
  if (pct >= 50)  return '#f07828';
  if (pct >= 25)  return '#60a0f0';
  return '#4a7fff';
}

test('ringColor: returns null for 0%', () => {
  assert.equal(ringColor(0), null);
});
test('ringColor: returns gold for 100%', () => {
  assert.equal(ringColor(100), '#ffd700');
});
test('ringColor: returns correct tier colors', () => {
  assert.equal(ringColor(99),  '#f5b830'); // 75–99
  assert.equal(ringColor(75),  '#f5b830');
  assert.equal(ringColor(74),  '#f07828'); // 50–74
  assert.equal(ringColor(50),  '#f07828');
  assert.equal(ringColor(49),  '#60a0f0'); // 25–49
  assert.equal(ringColor(25),  '#60a0f0');
  assert.equal(ringColor(24),  '#4a7fff'); // 1–24
  assert.equal(ringColor(1),   '#4a7fff');
});

// ── render.js: expandShinyForms sorting ──────────────────────────────────────
const { expandShinyForms } = require('../render');

test('expandShinyForms: sorts by pokedex_number then form index', () => {
  const rows = [
    { pokemon_id: 'bulbasaur_1', pokedex_number: 1, _isForm: true,  form_tag: null },
    { pokemon_id: 'bulbasaur',   pokedex_number: 1, _isForm: false, form_tag: null },
    { pokemon_id: 'ivysaur',     pokedex_number: 2, _isForm: false, form_tag: null },
  ];
  const result = expandShinyForms([...rows]);
  assert.equal(result[0].pokemon_id, 'bulbasaur');
  assert.equal(result[1].pokemon_id, 'bulbasaur_1');
  assert.equal(result[2].pokemon_id, 'ivysaur');
});

test('expandShinyForms: promotes form variants (non-Mega/non-Forms tag) to visible', () => {
  const rows = [
    { pokemon_id: 'raticate_1', pokedex_number: 20, _isForm: true, form_tag: null },
  ];
  const result = expandShinyForms([...rows]);
  assert.equal(result[0]._isForm, false);
});

test('expandShinyForms: keeps Mega forms hidden', () => {
  const rows = [
    { pokemon_id: 'charizard_1', pokedex_number: 6, _isForm: true, form_tag: 'Mega' },
  ];
  const result = expandShinyForms([...rows]);
  assert.equal(result[0]._isForm, true);
});
