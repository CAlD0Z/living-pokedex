// Auth wiring: session middleware, user attachment, guards, admin bootstrap.
//
// Setup is synchronous so the session + user-attachment middleware and the public
// login routes register *before* the app's protected routes, then:
//   const auth = setupAuth(app, pool);
//   app.use(auth.requireAuth);            // protect everything below
//   ...routes...
//   await auth.bootstrap();               // ensure an admin exists, then listen
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const config = require('./config');
const { makeUsers } = require('./users');
const { mountAuthRoutes } = require('./routes');

function setupAuth(app, pool) {
  const users = makeUsers(pool);

  // 1) Sessions (Postgres-backed so logins survive restarts and can be revoked).
  app.set('trust proxy', 1);
  app.use(session({
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
    name: 'ld.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.sessionSecure, // enable via SESSION_SECURE=true behind an HTTPS proxy
      maxAge: config.sessionTtlDays * 24 * 60 * 60 * 1000,
    },
  }));

  // 2) Attach req.user from the session (or the default account when auth is off).
  let defaultUserId = null;
  app.use(async (req, res, next) => {
    try {
      if (!config.enabled) {
        // No login wall: run everyone as the first/default account.
        if (defaultUserId == null) {
          const { rows } = await pool.query('SELECT id FROM players ORDER BY id LIMIT 1');
          defaultUserId = rows[0]?.id ?? null;
        }
        req.user = defaultUserId ? await users.byId(defaultUserId) : null;
        return next();
      }
      const uid = req.session?.userId;
      if (uid) {
        const u = await users.byId(uid);
        if (u && !u.disabled) req.user = u;
        else if (req.session) return req.session.destroy(() => next());
      }
      next();
    } catch (err) { next(err); }
  });

  // 3) Public login/logout/settings/admin routes (must precede requireAuth).
  mountAuthRoutes(app, users, pool);

  // 4) Guards.
  function requireAuth(req, res, next) {
    if (!config.enabled || req.user) return next();
    if (req.method === 'GET' && req.accepts('html')) {
      return res.redirect('/auth/login?next=' + encodeURIComponent(req.originalUrl));
    }
    return res.status(401).json({ error: 'Authentication required' });
  }
  function requireAdmin(req, res, next) {
    if (req.user?.is_admin) return next();
    if (req.accepts('html')) return res.status(403).send('Forbidden — admins only.');
    return res.status(403).json({ error: 'Admins only' });
  }

  // 5) One-time bootstrap: load persisted auth settings, then create the admin
  //    (admin/admin) if no accounts exist.
  async function bootstrap() {
    await config.load(pool);
    if (await users.count() === 0) {
      const u = await users.create({
        username: config.adminUsername,
        password: config.adminPassword,
        isAdmin: true,
      });
      console.log(`[auth] bootstrapped admin account "${u.username}" — change its password after first login.`);
    }
  }

  return { users, requireAuth, requireAdmin, bootstrap, config };
}

module.exports = { setupAuth };
