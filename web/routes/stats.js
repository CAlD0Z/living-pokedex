'use strict';

const express = require('express');
const { pool, fetchGames, fetchCaughtByGame, getDexTotals } = require('../db');
const { buildGamesWithProgress } = require('./suggestions');
const { shell } = require('../auth/views');
const { esc } = require('../utils');

const router = express.Router();

// rows: [{label, cnt}] for the main player (blue area)
// compLines: [{rows: [{label,cnt}], color, name}] for comparison players
function buildChart(rows, compLines = []) {
  const hasData = rows.some(r => r.cnt > 0) || compLines.some(cl => cl.rows.some(r => r.cnt > 0));
  if (!hasData) {
    return `<div style="text-align:center;padding:40px 16px;color:#364560;font-size:13px">No catches in this period.</div>`;
  }

  const W = 780, H = 160;
  const pad = { t: 22, r: 16, b: 32, l: 44 };
  const pw = W - pad.l - pad.r;
  const ph = H - pad.t - pad.b;

  const allCnts = [...rows.map(r => r.cnt), ...compLines.flatMap(cl => cl.rows.map(r => r.cnt))];
  const maxVal = Math.max(...allCnts, 1);
  const xOf = i => (pad.l + (rows.length <= 1 ? pw / 2 : i / (rows.length - 1) * pw)).toFixed(1);
  const yOf = v => (pad.t + ph * (1 - v / maxVal)).toFixed(1);

  const pts = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(r.cnt)}`).join(' ');
  const bottom = (pad.t + ph).toFixed(1);
  const areaPath = rows.length === 1
    ? `M${pad.l},${bottom} L${pad.l + pw},${bottom} L${pad.l + pw},${yOf(rows[0].cnt)} L${pad.l},${yOf(rows[0].cnt)} Z`
    : `M${xOf(0)},${bottom} ${pts.replace(/^M/, 'L')} L${xOf(rows.length - 1)},${bottom} Z`;

  const nLabels = Math.min(7, rows.length);
  const labelIndices = rows.length <= 1 ? [0]
    : Array.from({ length: nLabels }, (_, k) => Math.round(k * (rows.length - 1) / (nLabels - 1)));
  const xLabelsSvg = [...new Set(labelIndices)].map(i =>
    `<text x="${xOf(i)}" y="${pad.t + ph + 14}" text-anchor="middle" font-size="9" fill="#364560">${rows[i].label}</text>`
  ).join('');

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const gridLines = yTicks.map(pct =>
    `<line x1="${pad.l}" y1="${yOf(maxVal * pct)}" x2="${pad.l + pw}" y2="${yOf(maxVal * pct)}" stroke="#182035" stroke-width="1"/>`
  ).join('');
  const yLabelsSvg = yTicks.map(pct => {
    const y = (Number(yOf(maxVal * pct)) + 3.5).toFixed(1);
    return `<text x="${pad.l - 5}" y="${y}" text-anchor="end" font-size="9" fill="#364560">${Math.round(maxVal * pct)}</text>`;
  }).join('');

  // Comparison lines drawn before the main area so blue sits on top
  const compLinesSvg = compLines.map(cl => {
    if (!cl.rows.length) return '';
    const cpts = cl.rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xOf(i)},${yOf(r.cnt)}`).join(' ');
    return `<path d="${cpts}" fill="none" stroke="${cl.color}" stroke-width="1.4"
      stroke-linejoin="round" stroke-linecap="round" opacity=".75"/>`;
  }).join('');

  // Legend in top-left: blue dot = you, then comparison players
  const legendItems = [
    `<circle cx="${pad.l}" cy="${pad.t - 8}" r="3" fill="#7ab4ff"/>
     <text x="${pad.l + 6}" y="${pad.t - 5}" font-size="8.5" fill="#7ab4ff">you</text>`,
    ...compLines.map((cl, i) => {
      const lx = pad.l + 34 + i * 80;
      return `<line x1="${lx}" y1="${pad.t - 8}" x2="${lx + 12}" y2="${pad.t - 8}" stroke="${cl.color}" stroke-width="1.4"/>
       <text x="${lx + 16}" y="${pad.t - 5}" font-size="8.5" fill="${cl.color}">${cl.name}</text>`;
    }),
  ].join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" aria-label="Catch history">
  <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#4a7fff" stop-opacity=".28"/>
    <stop offset="100%" stop-color="#4a7fff" stop-opacity=".02"/>
  </linearGradient></defs>
  ${gridLines}
  <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ph}" stroke="#1a2a48" stroke-width="1"/>
  <line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="#1a2a48" stroke-width="1"/>
  ${compLinesSvg}
  <path d="${areaPath}" fill="url(#cg)"/>
  <path d="${pts}" fill="none" stroke="#7ab4ff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  ${legendItems}
  ${xLabelsSvg}${yLabelsSvg}
</svg>`;
}

// Expand sparse daily rows to fill the last n days with 0s
function dayKey(val) {
  // pg returns DATE as a JS Date; handle both Date objects and 'YYYY-MM-DD' strings
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function fillDays(dailyRows, n) {
  const map = new Map(dailyRows.map(r => [dayKey(r.day), Number(r.cnt)]));
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (n - 1 - i)));
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }), cnt: map.get(key) ?? 0 };
  });
}

// Group sparse daily rows into the last 12 calendar months with 0s
function fillMonths(dailyRows) {
  const map = new Map();
  for (const r of dailyRows) {
    const d = new Date(dayKey(r.day) + 'T12:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + Number(r.cnt));
  }
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), cnt: map.get(key) ?? 0 };
  });
}

// Comparison footer: closest player above + your total + closest player below
function buildCmp(ptRows, myId, field, periodLabel) {
  if (ptRows.length < 2) return '';
  const sorted = [...ptRows].sort((a, b) => Number(a[field]) - Number(b[field]));
  const myIdx = sorted.findIndex(r => r.id === myId);
  if (myIdx < 0) return '';
  const mine = Number(sorted[myIdx][field]);
  const above = myIdx < sorted.length - 1 ? sorted[myIdx + 1] : null;
  const below = myIdx > 0 ? sorted[myIdx - 1] : null;

  const aboveHtml = above
    ? `<div style="font-size:12px;color:#e05555;font-weight:600">&#9651; ${Number(above[field]) - mine} to pass
        <span style="color:#c9d1d9">${esc(above.display_name || above.username)}</span>
        <span style="color:#546070;font-weight:400">(${Number(above[field])})</span></div>`
    : `<div style="font-size:12px;color:#f7c948;font-weight:600">&#127942; Top this ${periodLabel}</div>`;

  const belowHtml = below
    ? `<div style="font-size:12px;color:#2ecc71;font-weight:600">&#9661; ${mine - Number(below[field])} ahead of
        <span style="color:#c9d1d9">${esc(below.display_name || below.username)}</span>
        <span style="color:#546070;font-weight:400">(${Number(below[field])})</span></div>`
    : `<div style="font-size:12px;color:#546070">Last place this ${periodLabel}</div>`;

  return `<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;
                      margin-top:14px;padding-top:12px;border-top:1px solid #182035">
    ${aboveHtml}
    <div style="font-size:13px;color:#7ab4ff;font-weight:700;text-align:center">${mine.toLocaleString()} this ${periodLabel}</div>
    ${belowHtml}
  </div>`;
}

function computeBestStreak(dailyRows) {
  let best = 0, cur = 0;
  for (let i = 0; i < dailyRows.length; i++) {
    if (i === 0) {
      cur = 1;
    } else {
      const d1 = new Date(dailyRows[i - 1].day);
      const d2 = new Date(dailyRows[i].day);
      cur = Math.round((d2 - d1) / 86400000) === 1 ? cur + 1 : 1;
    }
    best = Math.max(best, cur);
  }
  return best;
}

function progressBar(caught, total, color) {
  const pct = total > 0 ? Math.min(100, Math.round(caught / total * 100)) : 0;
  return `<div style="display:flex;align-items:center;gap:10px">
    <div style="flex:1;height:6px;background:#182035;border-radius:3px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color || '#4a7fff'};border-radius:3px;transition:width .3s"></div>
    </div>
    <span style="font-size:12px;color:#546070;white-space:nowrap;min-width:70px;text-align:right">${caught} / ${total}</span>
    <span style="font-size:11px;color:#364560;min-width:38px;text-align:right">${pct}%</span>
  </div>`;
}

function rankMedal(rank) {
  if (rank === 1) return '<span style="color:#fac000;font-size:14px">🥇</span>';
  if (rank === 2) return '<span style="color:#adb5bd;font-size:14px">🥈</span>';
  if (rank === 3) return '<span style="color:#cd7f32;font-size:14px">🥉</span>';
  return `<span style="color:#364560;font-size:12px;font-weight:700">#${rank}</span>`;
}

router.get('/stats', async (req, res) => {
  const playerId = req.user.id;
  try {
    const [games, caughtByGame, { dexTotals, nationalTotal }, dailyRes, totalsRes, leaderboardRes, periodRes, allDailyRes, allGameRes] = await Promise.all([
      fetchGames(),
      fetchCaughtByGame(playerId),
      getDexTotals(),
      pool.query(`
        SELECT DATE(caught_at) AS day, COUNT(*) AS cnt
        FROM caught_status WHERE player_id = $1
        GROUP BY DATE(caught_at) ORDER BY day
      `, [playerId]),
      pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT pokemon_id) AS unique_count,
               COUNT(*) FILTER (WHERE is_shiny) AS shiny_count
        FROM caught_status WHERE player_id = $1
      `, [playerId]),
      pool.query(`
        WITH days AS (
          SELECT player_id, DATE(caught_at) AS day, COUNT(*) AS cnt
          FROM caught_status GROUP BY player_id, DATE(caught_at)
        ),
        ranked AS (
          SELECT player_id, day,
            (day - (ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY day) || ' days')::interval)::date AS grp
          FROM days
        ),
        streaks AS (
          SELECT player_id, grp, COUNT(*) AS streak_len FROM ranked GROUP BY player_id, grp
        ),
        best_streak AS (
          SELECT player_id, MAX(streak_len) AS best_streak FROM streaks GROUP BY player_id
        ),
        home_game AS (
          SELECT id FROM games WHERE game_group = 'HOME' AND name NOT ILIKE '%shiny%' ORDER BY id LIMIT 1
        ),
        living AS (
          SELECT cs.player_id, COUNT(*) AS live_caught
          FROM caught_status cs JOIN home_game hg ON cs.game_id = hg.id
          GROUP BY cs.player_id
        )
        SELECT p.id, p.display_name, p.username,
          COALESCE(COUNT(cs.pokemon_id), 0) AS total_marks,
          COALESCE(COUNT(DISTINCT cs.pokemon_id), 0) AS unique_count,
          COALESCE(COUNT(DISTINCT DATE(cs.caught_at)), 0) AS active_days,
          COALESCE(SUM(CASE WHEN cs.is_shiny THEN 1 ELSE 0 END), 0) AS shiny_count,
          COALESCE(l.live_caught, 0) AS live_caught,
          COALESCE(bs.best_streak, 0) AS best_streak
        FROM players p
        LEFT JOIN caught_status cs ON cs.player_id = p.id
        LEFT JOIN living l ON l.player_id = p.id
        LEFT JOIN best_streak bs ON bs.player_id = p.id
        WHERE p.disabled = FALSE
        GROUP BY p.id, p.display_name, p.username, l.live_caught, bs.best_streak
        ORDER BY unique_count DESC, total_marks DESC
      `),
      pool.query(`
        SELECT p.id, p.display_name, p.username,
          COUNT(*) FILTER (WHERE cs.caught_at >= NOW() - INTERVAL '7 days')   AS week_total,
          COUNT(*) FILTER (WHERE cs.caught_at >= NOW() - INTERVAL '30 days')  AS month_total,
          COUNT(*) FILTER (WHERE cs.caught_at >= NOW() - INTERVAL '365 days') AS year_total
        FROM players p
        LEFT JOIN caught_status cs ON cs.player_id = p.id
        WHERE p.disabled = FALSE
        GROUP BY p.id, p.display_name, p.username
      `),
      pool.query(`
        SELECT cs.player_id, DATE(cs.caught_at) AS day, COUNT(*) AS cnt
        FROM caught_status cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.disabled = FALSE AND cs.caught_at >= NOW() - INTERVAL '365 days'
        GROUP BY cs.player_id, DATE(cs.caught_at)
        ORDER BY cs.player_id, day
      `),
      pool.query(`
        SELECT cs.player_id, p.display_name, p.username, cs.game_id, COUNT(*) AS caught
        FROM caught_status cs
        JOIN players p ON p.id = cs.player_id
        WHERE p.disabled = FALSE AND cs.player_id != $1
        GROUP BY cs.player_id, p.display_name, p.username, cs.game_id
      `, [playerId]),
    ]);

    const lbRows    = leaderboardRes.rows;
    const ptRows    = periodRes.rows;
    const dailyRows = dailyRes.rows;

    // Build per-player daily lookup for comparison lines
    const playerDailyMap = new Map();
    for (const r of allDailyRes.rows) {
      if (!playerDailyMap.has(r.player_id)) playerDailyMap.set(r.player_id, []);
      playerDailyMap.get(r.player_id).push(r);
    }

    const totalMarks   = Number(totalsRes.rows[0].total);
    const uniqueCaught = Number(totalsRes.rows[0].unique_count);
    const shinyCount   = Number(totalsRes.rows[0].shiny_count);
    const activeDays   = dailyRows.length;
    const avgPerDay    = activeDays > 0 ? (totalMarks / activeDays).toFixed(1) : '0';
    const bestDayCount = dailyRows.reduce((m, r) => Math.max(m, Number(r.cnt)), 0);
    const bestStreak   = computeBestStreak(dailyRows);

    const gamesWithProgress = buildGamesWithProgress(games, caughtByGame, dexTotals, nationalTotal);
    const livingDexGame = gamesWithProgress.find(g => g.game_group === 'HOME' && !/shiny/i.test(g.name));
    const liveCaught = livingDexGame?.caught ?? 0;
    const livePct    = nationalTotal > 0 ? Math.round(liveCaught / nationalTotal * 100) : 0;

    const activeGames = gamesWithProgress
      .filter(g => g.caught > 0 && g.caught < g.dexTotal && g.game_group !== 'HOME' && !g.game_group.startsWith('HOME_'))
      .sort((a, b) => (b.caught / b.dexTotal) - (a.caught / a.dexTotal));

    // For each game, find the player closest above the current player's caught count
    const byGame = new Map();
    for (const r of allGameRes.rows) {
      const gid = parseInt(r.game_id);
      if (!byGame.has(gid)) byGame.set(gid, []);
      byGame.get(gid).push({ name: r.display_name || r.username, caught: Number(r.caught) });
    }
    const gameCompMap = new Map();
    for (const g of activeGames) {
      const above = (byGame.get(g.id) ?? [])
        .filter(r => r.caught > g.caught)
        .sort((a, b) => a.caught - b.caught)[0] ?? null;
      if (above) gameCompMap.set(g.id, { name: above.name, gap: above.caught - g.caught, caught: above.caught });
    }

    // "Gap to next player above" for each stat chip
    const vsNext = (getVal, unit = '') => {
      if (lbRows.length < 2) return '';
      const sorted = [...lbRows]
        .map(r => ({ id: r.id, val: getVal(r), name: r.display_name || r.username }))
        .sort((a, b) => b.val - a.val);
      const myIdx = sorted.findIndex(r => r.id === playerId);
      if (myIdx < 0) return '';
      if (myIdx === 0) return `<div style="font-size:11px;color:#f7c948;margin-top:4px;font-weight:600">&#127942; Top player</div>`;
      const gap = Math.round(sorted[myIdx - 1].val - sorted[myIdx].val);
      if (gap === 0) return `<div style="font-size:11px;color:#7ab4ff;margin-top:4px;font-weight:600">Tied with ${esc(sorted[myIdx - 1].name)}</div>`;
      return `<div style="font-size:11px;color:#e05555;margin-top:4px;font-weight:600">&#9651; ${gap}${unit} to pass ${esc(sorted[myIdx - 1].name)}</div>`;
    };

    // Find the closest player above and below for a given period total field
    const findNeighbors = (field) => {
      const sorted = [...ptRows].sort((a, b) => Number(a[field]) - Number(b[field]));
      const myIdx  = sorted.findIndex(r => r.id === playerId);
      return {
        above: myIdx < sorted.length - 1 ? sorted[myIdx + 1] : null,
        below: myIdx > 0                 ? sorted[myIdx - 1] : null,
      };
    };

    // Build [{rows, color, name}] comparison lines from neighbors
    const makeCompLines = (neighbors, fillFn) => [
      neighbors.above
        ? { rows: fillFn(playerDailyMap.get(neighbors.above.id) ?? []),
            color: '#f7c948', name: esc(neighbors.above.display_name || neighbors.above.username) }
        : null,
      neighbors.below
        ? { rows: fillFn(playerDailyMap.get(neighbors.below.id) ?? []),
            color: '#e05555', name: esc(neighbors.below.display_name || neighbors.below.username) }
        : null,
    ].filter(Boolean);

    const weekNeighbors  = findNeighbors('week_total');
    const monthNeighbors = findNeighbors('month_total');
    const yearNeighbors  = findNeighbors('year_total');

    // Three chart datasets
    const chartWeek  = buildChart(fillDays(dailyRows, 7),  makeCompLines(weekNeighbors,  r => fillDays(r, 7)));
    const chartMonth = buildChart(fillDays(dailyRows, 30), makeCompLines(monthNeighbors, r => fillDays(r, 30)));
    const chartYear  = buildChart(fillMonths(dailyRows),   makeCompLines(yearNeighbors,  r => fillMonths(r)));

    // Three comparison footers
    const cmpWeek  = buildCmp(ptRows, playerId, 'week_total',  'week');
    const cmpMonth = buildCmp(ptRows, playerId, 'month_total', 'month');
    const cmpYear  = buildCmp(ptRows, playerId, 'year_total',  'year');

    const leaderboardHtml = lbRows.length < 2 ? '' : `<div class="card">
    <div class="card-head">
      <div class="ico"><i class="bi bi-trophy-fill"></i></div>
      <div><h2>Leaderboard</h2><div class="sub">How you compare to other players</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th style="width:40px">Rank</th><th>Player</th>
        <th style="text-align:right">Living Dex</th><th style="text-align:right">Unique</th>
        <th style="text-align:right">Total Marks</th><th style="text-align:right">Shiny</th>
        <th style="text-align:right">Active Days</th><th style="text-align:right">Best Streak</th>
      </tr></thead>
      <tbody>${lbRows.map((r, i) => {
        const isMe = r.id === playerId;
        const pct  = nationalTotal > 0 ? Math.round(Number(r.live_caught) / nationalTotal * 100) : 0;
        const name = r.display_name || r.username;
        return `<tr${isMe ? ' style="background:rgba(74,127,255,.07)"' : ''}>
          <td style="text-align:center">${rankMedal(i + 1)}</td>
          <td><div class="user-cell">
            <div class="avatar">${esc(name.charAt(0).toUpperCase())}</div>
            ${isMe
              ? `<span class="uname">${esc(name)}</span> <span class="pill pill-user" style="font-size:9px">you</span>`
              : `<span style="color:#c9d1d9">${esc(name)}</span>`}
          </div></td>
          <td style="text-align:right;color:${pct >= 100 ? '#2ecc71' : '#c9d1d9'};font-weight:600">${pct}%</td>
          <td style="text-align:right;color:#e6edf3;font-weight:600">${Number(r.unique_count).toLocaleString()}</td>
          <td style="text-align:right;color:#a0aec0">${Number(r.total_marks).toLocaleString()}</td>
          <td style="text-align:right;color:${Number(r.shiny_count) > 0 ? '#f7c948' : '#546070'}">${Number(r.shiny_count).toLocaleString()}</td>
          <td style="text-align:right;color:#a0aec0">${Number(r.active_days).toLocaleString()}</td>
          <td style="text-align:right;color:#a0aec0">${Number(r.best_streak)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;

    const body = `<div class="wrap" style="max-width:960px">
  <div class="page-head">
    <h2>Stats</h2>
    <div class="lead">Progress summary for ${esc(req.user.display_name || req.user.username)}</div>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="n">${livePct}%</div>
      <div class="l">Living Dex</div>
      <div style="font-size:11px;color:#364560;margin-top:4px">${liveCaught.toLocaleString()} / ${nationalTotal.toLocaleString()}</div>
      ${vsNext(r => nationalTotal > 0 ? Number(r.live_caught) / nationalTotal * 100 : 0, '%')}
    </div>
    <div class="stat">
      <div class="n">${uniqueCaught.toLocaleString()}</div>
      <div class="l">Unique Caught</div>
      <div style="font-size:11px;color:#364560;margin-top:4px">${totalMarks.toLocaleString()} total marks</div>
      ${vsNext(r => Number(r.unique_count))}
    </div>
    <div class="stat">
      <div class="n" style="color:#f7c948">${shinyCount.toLocaleString()}</div>
      <div class="l">Shiny Caught</div>
      <div style="font-size:11px;color:#364560;margin-top:4px">${uniqueCaught > 0 ? (shinyCount / uniqueCaught * 100).toFixed(1) : '0'}% of unique</div>
      ${vsNext(r => Number(r.shiny_count))}
    </div>
    <div class="stat">
      <div class="n">${activeDays}</div>
      <div class="l">Active Days</div>
      <div style="font-size:11px;color:#364560;margin-top:4px">${avgPerDay} avg catches/day</div>
      ${vsNext(r => Number(r.active_days))}
    </div>
    <div class="stat">
      <div class="n">${bestStreak}</div>
      <div class="l">Best Streak</div>
      <div style="font-size:11px;color:#364560;margin-top:4px">${bestDayCount} best single day</div>
      ${vsNext(r => Number(r.best_streak))}
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <div class="ico"><i class="bi bi-bar-chart-fill"></i></div>
      <div><h2>Catch History</h2><div class="sub" id="chart-sub">Catches per day, last 7 days</div></div>
      <div style="margin-left:auto;display:flex;gap:5px">
        <button class="tab-btn active" id="pbtn-week"  onclick="switchPeriod('week')" >Week</button>
        <button class="tab-btn"        id="pbtn-month" onclick="switchPeriod('month')">Month</button>
        <button class="tab-btn"        id="pbtn-year"  onclick="switchPeriod('year')" >Year</button>
      </div>
    </div>
    <div id="chart-week" >${chartWeek}${cmpWeek}</div>
    <div id="chart-month" style="display:none">${chartMonth}${cmpMonth}</div>
    <div id="chart-year"  style="display:none">${chartYear}${cmpYear}</div>
  </div>

  ${leaderboardHtml}

  ${activeGames.length ? `<div class="card">
    <div class="card-head">
      <div class="ico"><i class="bi bi-controller"></i></div>
      <div><h2>By Game</h2><div class="sub">${activeGames.length} in progress</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px 24px">
      ${activeGames.map(g => {
        const pct  = Math.round(g.caught / g.dexTotal * 100);
        const comp = gameCompMap.get(g.id);
        const compHtml = comp
          ? `<div style="font-size:10px;color:#e05555;font-weight:600;padding-left:118px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
               &#9651; ${comp.gap} to pass ${esc(comp.name)} <span style="color:#546070;font-weight:400">(${comp.caught})</span>
             </div>`
          : '';
        return `<div>
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="font-size:12px;font-weight:600;color:#c9d1d9;width:110px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(g.name)}">${esc(g.name)}</span>
            <div style="flex:1;height:5px;background:#182035;border-radius:3px;overflow:hidden;min-width:0">
              <div style="width:${pct}%;height:100%;background:${g.color || '#4a7fff'};border-radius:3px"></div>
            </div>
            <span style="font-size:11px;color:#7ab4ff;font-weight:700;min-width:32px;text-align:right">${pct}%</span>
            <span style="font-size:10px;color:#546070;min-width:60px;text-align:right;white-space:nowrap">${g.caught}/${g.dexTotal}</span>
          </div>
          ${compHtml}
        </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <script>
  var PERIOD_SUBS = {
    week:  'Catches per day, last 7 days',
    month: 'Catches per day, last 30 days',
    year:  'Catches per month, last 12 months'
  };
  function switchPeriod(p) {
    ['week','month','year'].forEach(function(x) {
      document.getElementById('chart-' + x).style.display = x === p ? 'block' : 'none';
      var btn = document.getElementById('pbtn-' + x);
      btn.classList.toggle('active', x === p);
    });
    document.getElementById('chart-sub').textContent = PERIOD_SUBS[p];
  }
  </script>
</div>`;

    res.send(shell('Stats', body, { user: req.user, active: 'stats' }));
  } catch (err) { res.status(500).send(esc(err.message)); }
});

module.exports = router;
