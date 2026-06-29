'use strict';
const crypto = require('crypto');

function getToken(req) {
  if (!req.session) return '';
  if (!req.session.csrfToken)
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

// Skips JSON bodies (CORS preflight already blocks cross-origin JSON POSTs).
// Checks _csrf field (forms) or X-CSRF-Token header (AJAX with custom header).
function csrfMiddleware(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const ct = req.get('Content-Type') || '';
  if (ct.includes('application/json')) return next();
  const token    = req.session?.csrfToken;
  const provided = (req.body && req.body._csrf) || req.get('X-CSRF-Token');
  if (!token || !provided || token !== provided)
    return res.status(403).send('CSRF token mismatch — please reload the page and try again.');
  next();
}

module.exports = { getToken, csrfMiddleware };
