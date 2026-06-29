// Login / logout / settings / admin route handlers. Mounted by setupAuth.
const express = require('express');
const config = require('./config');
const { mountOidc, testDiscovery } = require('./oidc');
const { loginPage, settingsPage, claimPage } = require('./views');
const { runImportCaught } = require('../routes/caught');
const { getToken, csrfMiddleware } = require('./csrf');

// ── Login rate limiting (per IP, resets on success) ───────────────────────────
const _loginAttempts = new Map(); // IP → { count, resetAt }
const RATE_MAX    = 10;
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes

function _rlCheck(ip) {
  const e = _loginAttempts.get(ip);
  return !e || Date.now() > e.resetAt || e.count < RATE_MAX;
}
function _rlFail(ip) {
  const now = Date.now();
  const e   = _loginAttempts.get(ip);
  if (!e || now > e.resetAt) _loginAttempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
  else e.count++;
}
function _rlClear(ip) { _loginAttempts.delete(ip); }

function mountAuthRoutes(app, users, pool) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(csrfMiddleware);

  // Establish a logged-in session for `user`.
  async function login(req, user) {
    await new Promise((resolve, reject) =>
      req.session.regenerate(err => err ? reject(err) : resolve()));
    req.session.userId = user.id;
    await users.touchLogin(user.id);
  }

  // ── login ──────────────────────────────────────────────────────────────────
  router.get('/auth/login', (req, res) => {
    if (req.user) return res.redirect('/');
    if (!config.enabled) return res.redirect('/');
    if (!config.localEnabled && config.oidcEnabled) return res.redirect('/auth/oidc/login');
    res.send(loginPage({
      localEnabled: config.localEnabled,
      oidcEnabled: config.oidcEnabled,
      oidcLabel: config.oidc.label,
      csrfToken: getToken(req),
    }));
  });

  router.post('/auth/login', async (req, res) => {
    if (!config.localEnabled) return res.status(404).send('Local sign-in is disabled.');
    const ip = req.ip;
    if (!_rlCheck(ip)) {
      return res.status(429).send(loginPage({
        localEnabled: config.localEnabled, oidcEnabled: config.oidcEnabled,
        oidcLabel: config.oidc.label, csrfToken: getToken(req),
        error: 'Too many failed sign-in attempts. Please try again in 15 minutes.',
      }));
    }
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    const render = (error) => res.status(401).send(loginPage({
      localEnabled: config.localEnabled, oidcEnabled: config.oidcEnabled,
      oidcLabel: config.oidc.label, error, username, csrfToken: getToken(req),
    }));
    try {
      const user = await users.byUsername(username);
      if (!user || user.auth_provider !== 'local' || !(await users.verifyPassword(user, password))) {
        _rlFail(ip);
        return render('Incorrect username or password.');
      }
      if (user.disabled) { _rlFail(ip); return render('This account is disabled.'); }
      _rlClear(ip);
      await login(req, user);
      const raw  = req.query.next;
      const next = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
      res.redirect(next);
    } catch (err) { render('Sign-in failed: ' + err.message); }
  });

  router.get('/auth/logout', (req, res) => {
    req.session.destroy(() => { res.clearCookie('ld.sid'); res.redirect('/auth/login'); });
  });
  router.post('/auth/logout', (req, res) => {
    req.session.destroy(() => { res.clearCookie('ld.sid'); res.redirect('/auth/login'); });
  });

  // OIDC (Authentik) — always mounted; handlers check config.oidcEnabled live so
  // it can be turned on/off from the Admin panel without a restart.
  mountOidc(router, users, login);

  // ── OIDC claim / create profile ─────────────────────────────────────────────
  // After a successful OIDC callback with no existing account, the user is sent
  // here to either claim an unclaimed local profile or create a new one.

  router.get('/auth/oidc/claim', async (req, res) => {
    if (req.user) return res.redirect('/');
    const pending = req.session.pendingOidc;
    if (!pending) return res.redirect('/auth/login');
    try {
      const unclaimed = await users.listUnclaimed();
      res.send(claimPage(unclaimed, pending, null, getToken(req)));
    } catch (err) {
      res.status(500).send('Error loading claim page: ' + err.message);
    }
  });

  router.post('/auth/oidc/claim', async (req, res) => {
    if (req.user) return res.redirect('/');
    const pending = req.session.pendingOidc;
    if (!pending) return res.redirect('/auth/login');
    const playerId = Number(req.body.player_id);
    if (!playerId) return res.redirect('/auth/oidc/claim');
    try {
      const user = await users.claimExternal(playerId, pending);
      if (!user) {
        const unclaimed = await users.listUnclaimed();
        return res.send(claimPage(unclaimed, pending, 'That profile was already claimed — please choose another or create a new one.', getToken(req)));
      }
      await login(req, user);
      res.redirect('/');
    } catch (err) {
      res.status(500).send('Error claiming profile: ' + err.message);
    }
  });

  router.post('/auth/oidc/create', async (req, res) => {
    if (req.user) return res.redirect('/');
    const pending = req.session.pendingOidc;
    if (!pending) return res.redirect('/auth/login');
    const displayName = (req.body.display_name || '').trim() || pending.username;
    try {
      const user = await users.createFromOidc({ ...pending, displayName });
      await login(req, user);
      res.redirect('/');
    } catch (err) {
      res.status(500).send('Error creating profile: ' + err.message);
    }
  });

  // ── settings (per-user) ─────────────────────────────────────────────────────
  function needUser(req, res) {
    if (req.user) return true;
    res.redirect('/auth/login'); return false;
  }

  const oidcLibInstalled = () => {
    try { require.resolve('openid-client'); return true; } catch { return false; }
  };
  const suggestedRedirect = (req) => `${req.protocol}://${req.get('host')}/auth/oidc/callback`;

  async function fetchDbStats() {
    try {
      const { rows } = await pool.query(`
        SELECT
          (SELECT count(*)::int FROM pokedex WHERE visible = true) AS pokemon_count,
          (SELECT count(*)::int FROM encounters)                    AS encounter_count,
          (SELECT count(*)::int FROM caught_status)                 AS caught_count,
          (SELECT value FROM _meta WHERE key = 'schema_version' LIMIT 1) AS schema_version
      `);
      return rows[0] || null;
    } catch { return null; }
  }

  async function renderAdminSettings(req, res, extra = {}) {
    const [userList, dbStats] = await Promise.all([users.list(), fetchDbStats()]);
    res.send(settingsPage(req.user, {
      tab: 'admin',
      adminSubtab: extra.adminSubtab || req.query.adminSubtab || 'accounts',
      adminList: userList,
      adminAuth: config,
      adminOidcLib: oidcLibInstalled(),
      adminSuggestedRedirect: suggestedRedirect(req),
      dbStats,
      csrfToken: getToken(req),
      ...extra,
    }));
  }

  router.get('/settings', async (req, res) => {
    if (!needUser(req, res)) return;
    const tab = req.query.tab || 'account';
    if (tab === 'admin' && req.user.is_admin) {
      await renderAdminSettings(req, res, {
        adminNotice: req.query.notice || null,
        adminError: req.query.error || null,
      });
    } else {
      res.send(settingsPage(req.user, {
        saved: req.query.saved === '1',
        subtab: req.query.subtab || 'profile',
        csrfToken: getToken(req),
      }));
    }
  });

  router.post('/settings/profile', async (req, res) => {
    if (!needUser(req, res)) return;
    const displayName = (req.body.display_name || '').trim();
    await users.setFields(req.user.id, {
      email: (req.body.email || '').trim() || null,
      displayName: displayName || req.user.username,
    });
    res.redirect('/settings?subtab=profile&saved=1');
  });

  router.post('/settings/preferences', async (req, res) => {
    if (!needUser(req, res)) return;
    const settings = { ...(req.user.settings || {}) };
    settings.default_sort = req.body.default_sort === 'national' ? 'national' : 'regional';
    settings.hide_caught  = req.body.hide_caught === 'true';
    const SCALES = ['small', 'medium', 'large'];
    settings.card_scale = SCALES.includes(req.body.card_scale) ? req.body.card_scale : 'medium';
    settings.panel_size = SCALES.includes(req.body.panel_size) ? req.body.panel_size : 'medium';
    const tz = (req.body.timezone || '').trim();
    if (tz) {
      try { Intl.DateTimeFormat(undefined, { timeZone: tz }); settings.timezone = tz; }
      catch { /* ignore invalid timezone */ }
    }
    await users.updateSettings(req.user.id, settings);
    res.redirect('/settings?subtab=preferences&saved=1');
  });

  router.post('/settings/password', async (req, res) => {
    if (!needUser(req, res)) return;
    if (req.user.auth_provider !== 'local')
      return res.status(400).send(settingsPage(req.user, { subtab: 'profile', error: 'SSO accounts manage passwords in the identity provider.', csrfToken: getToken(req) }));
    const { current, next, confirm } = req.body;
    const full = await users.byUsername(req.user.username);
    const fail = (m) => res.status(400).send(settingsPage(req.user, { subtab: 'profile', error: m, csrfToken: getToken(req) }));
    if (!(await users.verifyPassword(full, current || ''))) return fail('Current password is incorrect.');
    if (!next || next.length < 4) return fail('New password must be at least 4 characters.');
    if (next !== confirm) return fail('New passwords do not match.');
    await users.setPassword(req.user.id, next);
    res.redirect('/settings?subtab=profile&saved=1');
  });

  // ── admin ───────────────────────────────────────────────────────────────────
  function needAdmin(req, res) {
    if (req.user?.is_admin) return true;
    res.status(403).send('Forbidden — admins only.'); return false;
  }
  const reAdmin = (res, extra = '', subtab = 'accounts') => {
    const qs = extra.startsWith('?') ? extra.slice(1) : extra;
    res.redirect('/settings?tab=admin&adminSubtab=' + subtab + (qs ? '&' + qs : ''));
  };

  router.get('/admin', (req, res) => {
    if (!needAdmin(req, res)) return;
    res.redirect('/settings?tab=admin&adminSubtab=accounts');
  });

  router.post('/admin/users', async (req, res) => {
    if (!needAdmin(req, res)) return;
    const username = (req.body.username || '').trim();
    const password = req.body.password || '';
    if (!username || !password)
      return renderAdminSettings(req, res, { adminError: 'Username and password are required.', adminSubtab: 'accounts' });
    try {
      await users.create({
        username, password,
        email: (req.body.email || '').trim() || null,
        isAdmin: req.body.is_admin === 'true',
      });
      reAdmin(res, '?notice=' + encodeURIComponent(`Created account "${username}".`), 'accounts');
    } catch (err) {
      const msg = /unique|duplicate/i.test(err.message) ? 'That username is already taken.' : err.message;
      renderAdminSettings(req, res, { adminError: msg, adminSubtab: 'accounts' });
    }
  });

  // Guard: never let an admin lock themselves out via their own row.
  function notSelf(req, res) {
    if (Number(req.params.id) === req.user.id) { reAdmin(res, '?error=' + encodeURIComponent("You can't do that to your own account."), 'accounts'); return false; }
    return true;
  }

  router.post('/admin/users/:id/toggle-admin', async (req, res) => {
    if (!needAdmin(req, res) || !notSelf(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    if (u) await users.setFields(u.id, { isAdmin: !u.is_admin });
    reAdmin(res, '', 'accounts');
  });

  router.post('/admin/users/:id/toggle-disabled', async (req, res) => {
    if (!needAdmin(req, res) || !notSelf(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    if (u) await users.setFields(u.id, { disabled: !u.disabled });
    reAdmin(res, '', 'accounts');
  });

  router.post('/admin/users/:id/reset-password', async (req, res) => {
    if (!needAdmin(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    const pw = req.body.password || '';
    if (!u || u.auth_provider !== 'local') return reAdmin(res, '?error=' + encodeURIComponent('Cannot set a password on that account.'), 'accounts');
    if (pw.length < 4) return reAdmin(res, '?error=' + encodeURIComponent('Password must be at least 4 characters.'), 'accounts');
    await users.setPassword(u.id, pw);
    reAdmin(res, '?notice=' + encodeURIComponent(`Reset password for "${u.username}".`), 'accounts');
  });

  router.post('/admin/users/:id/delete', async (req, res) => {
    if (!needAdmin(req, res) || !notSelf(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    if (u) await users.remove(u.id);
    reAdmin(res, '?notice=' + encodeURIComponent('Account deleted.'), 'accounts');
  });

  router.post('/admin/users/:id/clear-caught', async (req, res) => {
    if (!needAdmin(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    if (!u) return reAdmin(res, '?error=' + encodeURIComponent('User not found.'), 'accounts');
    await pool.query('DELETE FROM caught_status WHERE player_id=$1', [u.id]);
    reAdmin(res, '?notice=' + encodeURIComponent(`Cleared all caught data for "${u.username}".`), 'accounts');
  });

  router.get('/admin/users/:id/export-caught', async (req, res) => {
    if (!needAdmin(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found.' });
    try {
      const { rows } = await pool.query(`
        SELECT cs.pokemon_id, p.name, p.form_name, p.pokedex_number,
               g.name AS game_name, g.game_group,
               cs.caught_at, cs.is_shiny, cs.ball, cs.notes, cs.origin_game
        FROM caught_status cs
        JOIN pokedex p ON p.id = cs.pokemon_id
        JOIN games g   ON g.id = cs.game_id
        WHERE cs.player_id = $1
        ORDER BY cs.game_id, p.pokedex_number, cs.pokemon_id
      `, [u.id]);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="living-pokedex-${u.username}-export.json"`);
      res.json({ exported_at: new Date().toISOString(), player: u.username, count: rows.length, caught: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/admin/users/:id/import-caught', express.json({ limit: '20mb' }), async (req, res) => {
    if (!needAdmin(req, res)) return;
    const u = await users.byId(Number(req.params.id));
    if (!u) return res.status(404).json({ error: 'User not found.' });
    const result = await runImportCaught(u.id, req.body);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // ── admin: authentication settings ───────────────────────────────────────────
  // Toggle local username/password sign-in.
  router.post('/admin/auth/local', async (req, res) => {
    if (!needAdmin(req, res)) return;
    const enable = req.body.local_enabled === 'true';
    if (!enable && !(config.oidcEnabled && config.oidcConfigured()))
      return reAdmin(res, '?error=' + encodeURIComponent('Enable and configure OIDC before turning off local sign-in — otherwise no one could log in.'), 'authentication');
    await config.save(pool, { localEnabled: enable });
    reAdmin(res, '?notice=' + encodeURIComponent(`Local sign-in ${enable ? 'enabled' : 'disabled'}.`), 'authentication');
  });

  // Save OIDC connection settings and toggle it on/off.
  router.post('/admin/auth/oidc', async (req, res) => {
    if (!needAdmin(req, res)) return;
    const b = req.body;
    const enable = b.oidc_enabled === 'true';
    const oidc = {
      issuer:      (b.issuer || '').trim(),
      clientId:    (b.client_id || '').trim(),
      redirectUri: (b.redirect_uri || '').trim(),
      label:       (b.label || '').trim() || 'Authentik',
    };
    // A blank client-secret field leaves the stored secret unchanged.
    if ((b.client_secret || '').length) oidc.clientSecret = b.client_secret;

    const configured = oidc.issuer && oidc.clientId && oidc.redirectUri;
    if (enable && !configured)
      return reAdmin(res, '?error=' + encodeURIComponent('Issuer, Client ID and Redirect URI are all required to enable OIDC.'), 'authentication');
    if (!enable && !config.localEnabled)
      return reAdmin(res, '?error=' + encodeURIComponent('Re-enable local sign-in before turning off OIDC — otherwise no one could log in.'), 'authentication');

    await config.save(pool, { oidcEnabled: enable, oidc });
    reAdmin(res, '?notice=' + encodeURIComponent(`OIDC settings saved${enable ? ' and enabled' : ''}.`), 'authentication');
  });

  // Verify the saved OIDC settings by running provider discovery.
  router.post('/admin/auth/oidc/test', async (req, res) => {
    if (!needAdmin(req, res)) return;
    if (!config.oidcConfigured())
      return reAdmin(res, '?error=' + encodeURIComponent('Save Issuer, Client ID and Redirect URI before testing.'), 'authentication');
    try {
      await testDiscovery();
      reAdmin(res, '?notice=' + encodeURIComponent('OIDC test succeeded — the provider is reachable and discovery worked.'), 'authentication');
    } catch (err) {
      reAdmin(res, '?error=' + encodeURIComponent('OIDC test failed: ' + err.message), 'authentication');
    }
  });

  app.use(router);
}

module.exports = { mountAuthRoutes };
