// OIDC provider (built for Authentik, works with any OpenID Connect IdP).
//
// Settings are managed from the Admin panel (or via OIDC_* env defaults) and
// stored in app_settings; see auth/config.js. The "openid-client" package
// (pinned to v5) must be installed for sign-in to work — it ships in
// package.json. Enabling/disabling and editing the connection happens at
// runtime, so these routes are always mounted and check config live.
//
// First login through the IdP auto-provisions a local account row (auth_provider
// 'oidc'); an admin can then promote it. The very first account is admin regardless
// of provider, matching the local bootstrap rule.
const config = require('./config');

let clientPromise = null;

// Clear the cached client so the next sign-in rebuilds it with current settings.
// Called by config.save() whenever OIDC settings change.
function resetClient() { clientPromise = null; }

function loadOpenid() {
  try { return require('openid-client'); }
  catch {
    throw new Error('The "openid-client" package is not installed. Run `npm install` in web/ (it is listed in package.json), then restart.');
  }
}

async function getClient() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const openid = loadOpenid();
    const { Issuer } = openid;
    const { issuer, clientId, clientSecret, redirectUri } = config.oidc;
    if (!issuer || !clientId || !redirectUri) {
      throw new Error('OIDC is missing required settings (Issuer, Client ID and Redirect URI).');
    }
    const discovered = await Issuer.discover(issuer);
    return new discovered.Client({
      client_id: clientId,
      client_secret: clientSecret || undefined,
      redirect_uris: [redirectUri],
      response_types: ['code'],
      token_endpoint_auth_method: clientSecret ? 'client_secret_basic' : 'none',
    });
  })();
  // Don't cache a rejected promise — let the next attempt retry discovery.
  clientPromise.catch(() => { clientPromise = null; });
  return clientPromise;
}

// Admin "Test connection": force a fresh discovery against the saved settings.
async function testDiscovery() {
  resetClient();
  await getClient();
  return true;
}

// Mounts /auth/oidc/login and /auth/oidc/callback on the given router. Always
// mounted; each handler checks config.oidcEnabled at request time.
// `onUser(req, user)` establishes the session (provided by routes.js).
function mountOidc(router, users, onUser) {
  router.get('/auth/oidc/login', async (req, res) => {
    if (!config.oidcEnabled) return res.status(404).send('OIDC sign-in is not enabled.');
    try {
      const openid = loadOpenid();
      const client = await getClient();
      const state = openid.generators.state();
      const nonce = openid.generators.nonce();
      req.session.oidc = { state, nonce };
      const url = client.authorizationUrl({ scope: 'openid profile email', state, nonce });
      res.redirect(url);
    } catch (err) {
      res.status(500).send(`OIDC login error: ${err.message}`);
    }
  });

  router.get('/auth/oidc/callback', async (req, res) => {
    if (!config.oidcEnabled) return res.status(404).send('OIDC sign-in is not enabled.');
    try {
      const client = await getClient();
      const saved = req.session.oidc || {};
      const params = client.callbackParams(req);
      const tokenSet = await client.callback(config.oidc.redirectUri, params, {
        state: saved.state, nonce: saved.nonce,
      });
      delete req.session.oidc;
      const claims = tokenSet.claims();
      const existing = await users.findByExternal('oidc', claims.sub);
      if (existing) {
        if (existing.disabled) return res.status(403).send('Account disabled.');
        await onUser(req, existing);
        return res.redirect('/');
      }
      // No account yet — send to claim/create flow.
      req.session.pendingOidc = {
        provider: 'oidc',
        externalId: claims.sub,
        username: claims.preferred_username || claims.email || claims.sub,
        email: claims.email || null,
      };
      res.redirect('/auth/oidc/claim');
    } catch (err) {
      res.status(500).send(`OIDC callback error: ${err.message}`);
    }
  });
}

module.exports = { mountOidc, resetClient, testDiscovery };
