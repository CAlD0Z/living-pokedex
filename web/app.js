'use strict';

const express     = require('express');
const path        = require('path');
const compression = require('compression');

const { pool, fetchGames, fetchCaughtByGame, fetchLastCaughtByGame, getDexTotals, fetchLeaderboard } = require('./db');
const migrate = require('./migrate');
const { esc } = require('./utils');
const { REGIONS } = require('./constants');
const { loadScraperState, handleScraperProgress } = require('./scraper');
const { setupAuth } = require('./auth');
const { landingPage, dashboardPage, staticEncountersPage } = require('./auth/views');
const { getSuggestions, buildGamesWithProgress } = require('./routes/suggestions');
const {
  router: dexRouter,
  fetchRecentlyCaught, fetchRecentlyShinyCaught,
} = require('./routes/dex');

const app = express();

// Compress all responses except SSE streams (compression buffers small writes, breaking live updates)
app.use(compression({
  filter: (req, res) => {
    if (req.path.startsWith('/api/scraper-events')) return false;
    return compression.filter(req, res);
  },
}));

app.use(express.json({ limit: '20mb' }));

// ── Health check (public — Docker healthcheck + Kubernetes liveness/readiness) ──
// Placed before the request logger so probes don't spam the logs.
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Static files: long cache for immutable assets (images), revalidation for JS/CSS.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (/\.(png|jpg|jpeg|gif|webp|ico|svg|webmanifest)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else if (/\.(js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── Request timing + pool diagnostics ────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/scraper-events')) return next();
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    const p  = pool;
    console.log(`[${res.statusCode}] ${req.method} ${req.path} — ${ms}ms | pool total=${p.totalCount} idle=${p.idleCount} waiting=${p.waitingCount}`);
  });
  next();
});

// ── Public routes (no auth required) ─────────────────────────────────────────
app.post('/api/scraper/progress', handleScraperProgress);

app.get('/api/glance/recent', async (req, res) => {
  const apiKey = process.env.GLANCE_API_KEY;
  if (apiKey) {
    const provided = req.query.key || (req.headers.authorization || '').replace(/^Bearer\s+/, '');
    if (provided !== apiKey) return res.status(401).json({ error: 'Unauthorized' });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
  try {
    const [recentlyCaught, recentlyShinyCaught] = await Promise.all([
      fetchRecentlyCaught(limit),
      fetchRecentlyShinyCaught(limit),
    ]);
    const shinies = recentlyShinyCaught.map(p => ({
      ...p,
      shiny_icon_url: (p.icon_url ?? '').replace('/normal/', '/shiny/'),
    }));
    res.json({ recently_caught: recentlyCaught, recently_caught_shinies: shinies });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Auth setup ────────────────────────────────────────────────────────────────
const auth = setupAuth(app, pool);

// ── Homepage (public — shows landing page for guests, dashboard for players) ──
app.get('/', async (req, res) => {
  if (!req.user) {
    const { localEnabled, oidcEnabled, oidc } = auth.config;
    return res.send(landingPage({ localEnabled, oidcEnabled, oidcLabel: oidc?.label }));
  }
  try {
    const [games, caughtByGame, lastCaughtByGame, { dexTotals, nationalTotal }] = await Promise.all([
      fetchGames(),
      fetchCaughtByGame(req.user.id),
      fetchLastCaughtByGame(req.user.id),
      getDexTotals(),
    ]);
    const gamesWithProgress = buildGamesWithProgress(games, caughtByGame, dexTotals, nationalTotal, lastCaughtByGame);
    const regions = REGIONS.map(r => ({ label: r.label, url: '/dex/' + r.key, key: r.key }));
    const [{ recommendedCatch, shinyHunt }, recentlyCaught, recentlyShinyCaught, leaderboard] = await Promise.all([
      getSuggestions(req.user, gamesWithProgress, nationalTotal),
      fetchRecentlyCaught(20),
      fetchRecentlyShinyCaught(20),
      fetchLeaderboard(),
    ]);
    res.send(dashboardPage(req.user, gamesWithProgress, nationalTotal, regions, dexTotals, recommendedCatch, shinyHunt, recentlyCaught, recentlyShinyCaught, leaderboard));
  } catch (err) { res.status(500).send(esc(err.message)); }
});

// ── Auth gate — everything below requires a logged-in session ─────────────────
app.use(auth.requireAuth);

// Admin-only viewer. The nav tab was removed; it is reached via the toggle
// overlay on the Scrapers admin panel, which frames it with ?embed=1.
app.get('/static-encounters', (req, res) => {
  if (!req.user?.is_admin) return res.status(403).send('Forbidden');
  res.send(staticEncountersPage(req.user, { embed: req.query.embed === '1' }));
});

app.use(require('./routes/suggestions').router);
app.use(dexRouter);
app.use(require('./routes/caught').router);
app.use(require('./routes/api'));
app.use(require('./routes/stats'));
app.use(require('./routes/admin')(auth));

// ── Startup ───────────────────────────────────────────────────────────────────
process.on('uncaughtException',  err => console.error('[uncaughtException]',  err));
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err));

const PORT = process.env.PORT || 3000;
migrate.run(pool)
  .then(() => auth.bootstrap())
  .then(() => loadScraperState())
  .then(() => app.listen(PORT, () => console.log(`Listening on :${PORT}`)))
  .catch(err => { console.error('Startup failed:', err); process.exit(1); });
