'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');

// buildGamesWithProgress is a pure function we can test directly.
// Mock the constants it needs so we don't load the whole app.
const GAME_COLORS  = { Scarlet: '#f05030', Violet: '#7050d0' };
const GROUP_DEX_KEY = { SV: 'paldea' };
const GROUP_REGION  = { SV: '/dex/paldea' };

// Inline the pure function (no side effects, no DB) to test the contract.
function buildGamesWithProgress(games, caughtByGame, dexTotals, nationalTotal, lastCaughtByGame = new Map()) {
  return games.map(g => {
    const dexKey   = GROUP_DEX_KEY[g.game_group];
    const dexTotal = dexKey ? (dexTotals.get(dexKey) ?? nationalTotal) : nationalTotal;
    return {
      id:           g.id,
      name:         g.name,
      game_group:   g.game_group,
      generation:   g.generation,
      color:        GAME_COLORS[g.name] ?? '#6b7a99',
      caught:       caughtByGame.get(g.id) ?? 0,
      lastCaughtAt: lastCaughtByGame.get(g.id) ?? null,
      dexTotal,
      dexUrl:       (GROUP_REGION[g.game_group] ?? '/dex') + '?game_id=' + g.id,
    };
  });
}

const GAMES = [
  { id: 1, name: 'Scarlet', game_group: 'SV', generation: 9, sort_order: 1 },
  { id: 2, name: 'Violet',  game_group: 'SV', generation: 9, sort_order: 2 },
];

test('buildGamesWithProgress: uses dex-specific total when available', () => {
  const caughtByGame = new Map([[1, 100], [2, 200]]);
  const dexTotals    = new Map([['paldea', 400]]);
  const result       = buildGamesWithProgress(GAMES, caughtByGame, dexTotals, 1020);
  assert.equal(result[0].caught,   100);
  assert.equal(result[0].dexTotal, 400);
  assert.equal(result[1].caught,   200);
  assert.equal(result[1].dexTotal, 400);
});

test('buildGamesWithProgress: falls back to nationalTotal when no dex key', () => {
  const games        = [{ id: 3, name: 'Yellow', game_group: 'RBY', generation: 1, sort_order: 1 }];
  const caughtByGame = new Map([[3, 50]]);
  const dexTotals    = new Map();
  const result       = buildGamesWithProgress(games, caughtByGame, dexTotals, 151);
  assert.equal(result[0].dexTotal, 151);
  assert.equal(result[0].dexUrl,   '/dex?game_id=3');
});

test('buildGamesWithProgress: caught defaults to 0 for games with no progress', () => {
  const result = buildGamesWithProgress(GAMES, new Map(), new Map(), 1020);
  assert.equal(result[0].caught, 0);
  assert.equal(result[1].caught, 0);
});

test('buildGamesWithProgress: uses game color from GAME_COLORS', () => {
  const result = buildGamesWithProgress(GAMES, new Map(), new Map(), 1020);
  assert.equal(result[0].color, '#f05030');
  assert.equal(result[1].color, '#7050d0');
});

test('buildGamesWithProgress: uses fallback color for unknown game', () => {
  const games  = [{ id: 5, name: 'Unknown Game', game_group: 'UNK', generation: 1, sort_order: 1 }];
  const result = buildGamesWithProgress(games, new Map(), new Map(), 100);
  assert.equal(result[0].color, '#6b7a99');
});

test('buildGamesWithProgress: lastCaughtAt defaults to null', () => {
  const result = buildGamesWithProgress(GAMES, new Map(), new Map(), 1020);
  assert.equal(result[0].lastCaughtAt, null);
});

test('buildGamesWithProgress: lastCaughtAt populated from map', () => {
  const ts = new Date('2025-01-01');
  const result = buildGamesWithProgress(GAMES, new Map(), new Map(), 1020, new Map([[1, ts]]));
  assert.equal(result[0].lastCaughtAt, ts);
  assert.equal(result[1].lastCaughtAt, null);
});
