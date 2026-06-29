// Server-rendered pages for login / settings / admin. Plain template strings to
// match app.js (no view engine). Shares the app's dark palette.

const { esc } = require('../utils');
const { GROUP_LABELS, DLC_GROUPS, DISPLAY_GROUP, GROUP_DEX_KEY, TYPE_COLORS } = require('../constants');
const { getScraperProgress } = require('../scraper');

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)   return 'Just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  return fmtDate(ts);
}

const COMMON_TIMEZONES = [
  ['UTC',                    'UTC'],
  ['America/New_York',       'Eastern (ET)'],
  ['America/Chicago',        'Central (CT)'],
  ['America/Denver',         'Mountain (MT)'],
  ['America/Los_Angeles',    'Pacific (PT)'],
  ['America/Anchorage',      'Alaska (AKT)'],
  ['Pacific/Honolulu',       'Hawaii (HT)'],
  ['America/Toronto',        'Toronto'],
  ['America/Vancouver',      'Vancouver'],
  ['America/Sao_Paulo',      'São Paulo'],
  ['America/Argentina/Buenos_Aires', 'Buenos Aires'],
  ['Europe/London',          'London (GMT/BST)'],
  ['Europe/Paris',           'Paris (CET)'],
  ['Europe/Berlin',          'Berlin'],
  ['Europe/Madrid',          'Madrid'],
  ['Europe/Rome',            'Rome'],
  ['Europe/Amsterdam',       'Amsterdam'],
  ['Europe/Stockholm',       'Stockholm'],
  ['Europe/Warsaw',          'Warsaw'],
  ['Europe/Athens',          'Athens'],
  ['Europe/Moscow',          'Moscow'],
  ['Asia/Jerusalem',         'Jerusalem'],
  ['Asia/Dubai',             'Dubai'],
  ['Asia/Kolkata',           'India (IST)'],
  ['Asia/Bangkok',           'Bangkok'],
  ['Asia/Singapore',         'Singapore'],
  ['Asia/Hong_Kong',         'Hong Kong'],
  ['Asia/Shanghai',          'Shanghai'],
  ['Asia/Taipei',            'Taipei'],
  ['Asia/Seoul',             'Seoul'],
  ['Asia/Tokyo',             'Tokyo'],
  ['Australia/Perth',        'Perth (AWST)'],
  ['Australia/Sydney',       'Sydney (AEST)'],
  ['Pacific/Auckland',       'Auckland (NZST)'],
  ['Africa/Cairo',           'Cairo'],
  ['Africa/Johannesburg',    'Johannesburg'],
  ['Africa/Lagos',           'Lagos'],
];

const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:#1e2e4a;border-radius:4px}
  ::-webkit-scrollbar-thumb:hover{background:#2a3e60}
  body{font-family:'Inter',system-ui,sans-serif;background:#08101c;color:#c9d1d9;min-height:100vh;
       background-image:radial-gradient(900px 500px at 12% -10%,rgba(74,127,255,.07),transparent 60%),radial-gradient(800px 480px at 100% 0%,rgba(163,112,247,.06),transparent 55%)}
  a{color:#7ab4ff;text-decoration:none}
  a:hover{text-decoration:none}
  select,button,input{color-scheme:dark}

  /* ── top bar ─────────────────────────────────────────── */
  .topbar{display:flex;align-items:center;gap:8px;padding:11px 22px;background:linear-gradient(135deg,#050c1c,#0a1228);
          border-bottom:1px solid #182035;position:sticky;top:0;z-index:50;backdrop-filter:blur(6px);flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:9px;margin-right:6px}
  /* Brand mark = the URL-bar favicon artwork (/favicon.svg) so header + tab icon match. */
  .brand .mark{width:22px;height:22px;flex-shrink:0;background:url(/favicon.svg) center/contain no-repeat;
               filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
  .brand h1{font-size:16px;font-weight:800;letter-spacing:-.3px;background:linear-gradient(90deg,#6eb5ff,#b197fc);
            -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;white-space:nowrap}
  .topbar .spacer{margin-left:auto}
  .nav-link{display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:7px;font-size:13px;font-weight:600;
            color:#7a8ea8;border:1px solid transparent;transition:background .12s,color .12s,border-color .12s}
  .nav-link:hover{background:#0c1526;color:#c9d1d9}
  .nav-link.active{background:linear-gradient(135deg,#0e2260,#0a1848);color:#7ab4ff;border-color:#1a3898}
  .nav-link .bi{font-size:14px;opacity:.85}
  .user-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;font-size:13px;font-weight:600;
             color:#7ab4ff;border:1px solid #1a3898;background:linear-gradient(135deg,#0e2260,#0a1848)}
  .user-chip .bi{font-size:14px}
  .user-chip .tag{font-size:10px;font-weight:700;color:#b197fc}

  /* ── layout ──────────────────────────────────────────── */
  .wrap{max-width:1360px;margin:0 auto;padding:30px 32px 60px}
  .page-head{margin-bottom:22px}
  .page-head h2{font-size:23px;font-weight:800;color:#e6edf3;letter-spacing:-.4px}
  .page-head .lead{font-size:13px;color:#546070;margin-top:4px}

  .card{background:linear-gradient(160deg,#0d1628,#0a1120);border:1px solid #182035;border-radius:14px;padding:22px 22px 24px;
        margin-bottom:18px;box-shadow:0 1px 0 rgba(255,255,255,.02) inset,0 10px 30px -18px rgba(0,0,0,.7)}
  .card-head{display:flex;align-items:center;gap:11px;margin-bottom:18px;flex-wrap:wrap}
  .card-head .ico{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;
                  background:linear-gradient(135deg,#0e2260,#0a1848);border:1px solid #1a3898;color:#7ab4ff;font-size:16px}
  .card-head h2{font-size:15px;font-weight:700;color:#e6edf3}
  .card-head .sub{font-size:12px;color:#546070;margin-top:1px}

  label{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;color:#5a6b82;font-weight:700;margin:14px 0 6px}
  label:first-child{margin-top:0}
  input[type=text],input[type=password],input[type=email],select{width:100%;padding:10px 12px;border-radius:8px;
    border:1px solid #1c2942;background:#070d18;color:#e6edf3;font-size:14px;outline:none;transition:border-color .15s,box-shadow .15s}
  input::placeholder{color:#3a4a63}
  input:focus,select:focus{border-color:#2a4bd0;box-shadow:0 0 0 3px rgba(74,127,255,.14)}
  .row{display:flex;gap:14px;flex-wrap:wrap}
  .row>*{flex:1;min-width:150px}
  .field-hint{font-size:11px;color:#46566f;margin-top:6px}

  .form-actions{margin-top:20px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}

  /* ── buttons ─────────────────────────────────────────── */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 18px;border-radius:8px;
       border:1px solid #1a3898;background:linear-gradient(135deg,#143087,#0d1e5c);color:#bcd4ff;font-size:13px;font-weight:600;
       cursor:pointer;text-align:center;transition:filter .12s,transform .05s,box-shadow .15s;box-shadow:0 6px 18px -10px rgba(74,127,255,.8)}
  .btn:hover{text-decoration:none;filter:brightness(1.12)}
  .btn:active{transform:translateY(1px)}
  .btn .bi{font-size:14px}
  .btn-danger{border-color:#7a2626;background:linear-gradient(135deg,#5a1414,#360b0b);color:#ffb0b0;box-shadow:0 6px 18px -10px rgba(255,80,80,.7)}
  .btn-ghost{border-color:#22314e;background:#0c1526;color:#9fb0c8;box-shadow:none}
  .btn-ghost:hover{background:#101c33;color:#dbe6f5}
  .btn-sm{padding:6px 12px;font-size:12px;border-radius:7px}

  /* ── messages ────────────────────────────────────────── */
  .msg{display:flex;align-items:center;gap:9px;padding:11px 14px;border-radius:9px;font-size:13px;margin-bottom:18px;font-weight:500}
  .msg .bi{font-size:16px;flex-shrink:0}
  .msg-err{background:rgba(255,80,80,.09);border:1px solid #5a2020;color:#ff9d9d}
  .msg-ok{background:rgba(46,204,113,.09);border:1px solid #145e30;color:#5fd58a}

  /* ── segmented toggle (posts a plain value, route-compatible) ─ */
  .seg{display:inline-flex;background:#070d18;border:1px solid #1c2942;border-radius:9px;padding:3px;gap:3px;width:100%}
  .seg label{display:flex;flex:1;margin:0;cursor:pointer}
  .seg input{position:absolute;opacity:0;pointer-events:none;width:0;height:0}
  .seg span{flex:1;text-align:center;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:600;color:#6b7a99;
            text-transform:none;letter-spacing:0;transition:background .12s,color .12s;white-space:nowrap}
  .seg label:has(input:checked) span{background:linear-gradient(135deg,#0e2260,#0a1848);color:#7ab4ff;box-shadow:inset 0 0 0 1px #1a3898}
  .seg label:hover span{color:#c9d1d9}

  /* ── tables ──────────────────────────────────────────── */
  .table-wrap{border:1px solid #182035;border-radius:10px;overflow:hidden}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:10px 12px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#46566f;
     background:#060c18;border-bottom:1px solid #182035;font-weight:700}
  td{padding:11px 12px;border-bottom:1px solid #0e1828;color:#a0aec0;vertical-align:middle}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover td{background:rgba(12,21,38,.55)}
  .uname{color:#e6edf3;font-weight:600}
  .avatar{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
          background:linear-gradient(135deg,#163083,#0c1d57);color:#9dc2ff;font-size:13px;font-weight:700;border:1px solid #1a3898}
  .user-cell{display:flex;align-items:center;gap:11px}
  .pill{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.2px}
  .pill-admin{background:rgba(163,112,247,.16);color:#c4a5ff;border:1px solid rgba(163,112,247,.3)}
  .pill-off{background:rgba(255,80,80,.12);color:#ff9d9d;border:1px solid rgba(255,80,80,.25)}
  .pill-oidc{background:rgba(122,180,255,.12);color:#9dc2ff;border:1px solid rgba(122,180,255,.25)}
  .pill-user{background:rgba(120,140,170,.1);color:#8aa0bd;border:1px solid rgba(120,140,170,.2)}
  .actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
  .actions form{margin:0}
  .muted{color:#546070;font-size:12px}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em;background:#070d18;border:1px solid #1c2942;border-radius:5px;padding:1px 6px;color:#9dc2ff;word-break:break-all}
  .pill .bi{font-size:10px}

  /* ── stat chips (admin summary) ─────────────────────── */
  .stats{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
  .stat{flex:1;min-width:120px;background:linear-gradient(160deg,#0d1628,#0a1120);border:1px solid #182035;border-radius:12px;padding:14px 16px}
  .stat .n{font-size:24px;font-weight:800;color:#e6edf3;line-height:1;letter-spacing:-.5px}
  .stat .l{font-size:11px;color:#546070;font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:.4px}
  .stat .n .bi{font-size:18px;margin-right:5px;opacity:.7}

  /* ── login ───────────────────────────────────────────── */
  .login-shell{min-height:calc(100vh - 0px);display:flex;align-items:center;justify-content:center;padding:24px}
  .login-card{width:min(400px,94vw)}
  .login-logo{text-align:center;margin-bottom:22px}
  @keyframes pokeball-pulse{
    0%,100%{box-shadow:0 0 0 2px #2a3e60,0 6px 24px -6px rgba(74,127,255,.55)}
    50%{box-shadow:0 0 0 3px #3a5282,0 8px 32px -4px rgba(74,127,255,.85)}
  }
  .login-logo .mark{width:60px;height:60px;border-radius:50%;display:inline-block;
                    background:url(/favicon.svg) center/contain no-repeat;
                    animation:pokeball-pulse 3s ease-in-out infinite}
  .login-logo h1{font-size:21px;font-weight:800;margin-top:12px;letter-spacing:-.4px;
                 background:linear-gradient(90deg,#6eb5ff,#b197fc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
  .login-logo p{font-size:12.5px;color:#546070;margin-top:5px}
  .or{display:flex;align-items:center;gap:10px;color:#36465f;font-size:11px;margin:18px 0;text-transform:uppercase;letter-spacing:1px}
  .or::before,.or::after{content:'';flex:1;height:1px;background:#182035}

  /* ── two-column page layout ──────────────────────────── */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 20px;align-items:start}
  @media(max-width:860px){.two-col{grid-template-columns:1fr}}

  /* ── scraper two-column layout ───────────────────────── */
  .scraper-two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
  @media(max-width:860px){.scraper-two-col{grid-template-columns:1fr}}

  /* ── table overflow on small screens ─────────────────── */
  @media(max-width:860px){.table-wrap{overflow-x:auto}}

  /* ── mobile topbar ───────────────────────────────────── */
  @media(max-width:600px){
    .topbar{padding:8px 14px;gap:4px}
    .nav-label{display:none}
    .nav-link{padding:6px 8px}
    .user-chip{padding:5px 8px}
    .user-chip .tag{display:none}
    .brand h1{font-size:14px}
    .wrap{padding:20px 14px 40px}
    .stabs,.sub-stabs{flex-wrap:wrap}
    .scraper-card-btns{width:100%;margin-left:0!important;flex-wrap:wrap;justify-content:flex-end}
    .col-src,.col-login{display:none}
    .actions{justify-content:flex-start}
  }

  /* ── settings tab bar ────────────────────────────────── */
  .stabs{display:flex;gap:4px;margin-bottom:22px;padding-bottom:12px;border-bottom:1px solid #182035}
  .stab{display:inline-flex;align-items:center;gap:7px;padding:8px 15px;font-size:13px;font-weight:600;color:#546070;border-radius:8px;text-decoration:none;transition:background .12s,color .12s,border-color .12s;border:1px solid transparent}
  .stab:hover{color:#c9d1d9;text-decoration:none;background:#0a1628}
  .stab.active{background:linear-gradient(135deg,#0e2260,#0a1848);color:#7ab4ff;border-color:#1a3898}
  /* ── account sub-tab bar ─────────────────────────────── */
  .sub-stabs{display:flex;gap:3px;margin-bottom:20px}
  .sub-stab{display:inline-flex;align-items:center;gap:5px;padding:5px 13px;font-size:12px;font-weight:600;color:#546070;border-radius:6px;text-decoration:none;transition:background .12s,color .12s,border-color .12s;border:1px solid transparent}
  .sub-stab:hover{color:#c9d1d9;text-decoration:none;background:#0a1628}
  .sub-stab.active{background:#0c1a30;color:#7ab4ff;border-color:#1a3070}
  @keyframes spin{to{transform:rotate(360deg)}}
`;

function navLink(href, label, icon, active) {
  return `<a class="nav-link${active ? ' active' : ''}" href="${href}"><i class="bi ${icon}"></i><span class="nav-label">${label}</span></a>`;
}

function shell(title, bodyHtml, { user = null, showNav = true, bare = false, active = '', csrfToken = '' } = {}) {
  const nav = showNav && user ? `
    ${navLink('/', 'Home', 'bi-house-fill', active === 'home')}
    ${navLink('/dex', 'Pokédex', 'bi-grid-3x3-gap-fill', active === 'dex')}
    ${navLink('/stats', 'Stats', 'bi-bar-chart-fill', active === 'stats')}
    ${navLink('/settings', 'Settings', 'bi-gear-fill', active === 'settings')}
    <span class="spacer"></span>
    <span class="user-chip"><i class="bi bi-person-circle"></i><span class="nav-label">${esc(user.display_name || user.username)}</span>${user.is_admin ? '<span class="tag">ADMIN</span>' : ''}</span>
    <a class="nav-link" href="/auth/logout" title="Log out"><i class="bi bi-box-arrow-right"></i></a>`
    : '<span class="spacer"></span>';
  const topbar = bare ? '' : `<div class="topbar">
    <a class="brand" href="/"><span class="mark"></span><h1>Living Pokédex</h1></a>
    ${nav}
  </div>`;
  const csrfScript = csrfToken ? `<script>(function(){var t=document.querySelector('meta[name="csrf-token"]').content;document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('form').forEach(function(f){if(f.method.toUpperCase()==='POST'&&!f.querySelector('[name="_csrf"]')){var h=document.createElement('input');h.type='hidden';h.name='_csrf';h.value=t;f.prepend(h);}});});})();</script>` : '';
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="csrf-token" content="${esc(csrfToken)}">
<title>${esc(title)} — Living Pokédex</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0a1228">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>${BASE_CSS}</style>
${csrfScript}
</head><body>
${topbar}
${bodyHtml}
</body></html>`;
}

function loginPage({ localEnabled, oidcEnabled, oidcLabel = 'Authentik', error = null, username = '', csrfToken = '' } = {}) {
  const local = localEnabled ? `
    <form method="post" action="/auth/login">
      <label>Username</label>
      <input type="text" name="username" autofocus autocomplete="username" placeholder="trainer" value="${esc(username)}">
      <label>Password</label>
      <input type="password" name="password" autocomplete="current-password" placeholder="••••••••">
      <div style="margin-top:20px"><button class="btn" type="submit" style="width:100%"><i class="bi bi-box-arrow-in-right"></i>Sign in</button></div>
    </form>` : '<p class="muted" style="text-align:center">Password sign-in is disabled.</p>';
  const oidc = oidcEnabled ? `
    ${localEnabled ? '<div class="or">or</div>' : ''}
    <a class="btn btn-ghost" href="/auth/oidc/login" style="width:100%"><i class="bi bi-shield-check"></i>Sign in with ${esc(oidcLabel)}</a>` : '';
  const body = `
    <div class="login-shell">
      <div class="login-card">
        <div class="login-logo">
          <span class="mark"></span>
          <h1>Living Pokédex</h1>
          <p>Sign in to track your collection.</p>
        </div>
        <div class="card">
          ${error ? `<div class="msg msg-err"><i class="bi bi-exclamation-triangle-fill"></i>${esc(error)}</div>` : ''}
          ${local}${oidc}
        </div>
      </div>
    </div>`;
  return shell('Sign in', body, { showNav: false, bare: true, csrfToken });
}

function claimPage(unclaimed, pending, error = null, csrfToken = '') {
  const errorHtml = error
    ? `<div class="msg msg-err"><i class="bi bi-exclamation-triangle-fill"></i>${esc(error)}</div>`
    : '';

  const profileCards = unclaimed.map(p => {
    const caught = Number(p.caught_count || 0);
    const initial = ((p.display_name || p.username)[0] || '?').toUpperCase();
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#070d18;border:1px solid #1c2942;border-radius:8px">
      <div class="avatar" style="width:40px;height:40px;font-size:15px;flex-shrink:0">${esc(initial)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:#e6edf3">${esc(p.display_name || p.username)}</div>
        <div style="font-size:11px;color:#546070;margin-top:1px">${caught.toLocaleString()} Pokémon caught</div>
      </div>
      <form method="post" action="/auth/oidc/claim" style="margin:0;flex-shrink:0">
        <input type="hidden" name="player_id" value="${esc(String(p.id))}">
        <button class="btn btn-sm" type="submit"><i class="bi bi-link-45deg"></i>Claim</button>
      </form>
    </div>`;
  }).join('');

  const claimSection = unclaimed.length ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head">
        <div class="ico"><i class="bi bi-person-check-fill"></i></div>
        <div>
          <h2>Claim an existing profile</h2>
          <div class="sub">Link your account to an existing collection.</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">${profileCards}</div>
    </div>
    <div class="or">or start fresh</div>` : '';

  const body = `
    <div class="login-shell">
      <div class="login-card" style="width:min(460px,94vw)">
        <div class="login-logo">
          <span class="mark"></span>
          <h1>Living Pokédex</h1>
          <p>Welcome, ${esc(pending.username)}! Set up your profile.</p>
        </div>
        ${errorHtml}
        ${claimSection}
        <div class="card">
          <div class="card-head">
            <div class="ico"><i class="bi bi-person-plus-fill"></i></div>
            <div>
              <h2>Create a new profile</h2>
              <div class="sub">Start a fresh collection.</div>
            </div>
          </div>
          <form method="post" action="/auth/oidc/create">
            <label>Display name</label>
            <input type="text" name="display_name" placeholder="${esc(pending.username)}" value="${esc(pending.username)}" autofocus>
            <div class="field-hint">Shown in the nav bar. You can change it later in Settings.</div>
            <div class="form-actions">
              <button class="btn" type="submit" style="width:100%"><i class="bi bi-plus-lg"></i>Create profile</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  return shell('Set up your profile', body, { showNav: false, bare: true, csrfToken });
}

function settingsPage(user, opts = {}) {
  const {
    tab = 'account',
    subtab = 'profile',
    saved = false,
    error = null,
    adminList = null,
    adminAuth = {},
    adminOidcLib = true,
    adminSuggestedRedirect = '',
    adminNotice = null,
    adminError = null,
    dbStats = null,
  } = opts;

  const s = user.settings || {};
  const chk = (cur, val) => cur === val ? ' checked' : '';
  const isAdmin = user.is_admin;
  const activeTab = (isAdmin && tab === 'admin') ? 'admin' : 'account';
  const activeSub = ['profile', 'data', 'preferences'].includes(subtab) ? subtab : 'profile';

  const tabBar = isAdmin ? `
    <div class="stabs">
      <a class="stab${activeTab === 'account' ? ' active' : ''}" href="/settings"><i class="bi bi-person-fill"></i>Account</a>
      <a class="stab${activeTab === 'admin' ? ' active' : ''}" href="/settings?tab=admin"><i class="bi bi-shield-lock-fill"></i>Admin</a>
    </div>` : '';

  const tzOpts = COMMON_TIMEZONES.map(([val, label]) =>
    `<option value="${esc(val)}"${(s.timezone || 'UTC') === val ? ' selected' : ''}>${esc(label)} — ${esc(val)}</option>`
  ).join('');

  const subTabBar = `
    <div class="sub-stabs">
      <a class="sub-stab${activeSub === 'profile' ? ' active' : ''}" href="/settings?subtab=profile"><i class="bi bi-person-fill"></i>Profile</a>
      <a class="sub-stab${activeSub === 'data' ? ' active' : ''}" href="/settings?subtab=data"><i class="bi bi-database-fill"></i>Data</a>
      <a class="sub-stab${activeSub === 'preferences' ? ' active' : ''}" href="/settings?subtab=preferences"><i class="bi bi-sliders"></i>Preferences</a>
    </div>`;

  const profileSubTab = `
    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-person-fill"></i></div>
        <div>
          <h2>Profile</h2>
          <div class="sub">Signed in as <strong style="color:#c9d1d9">${esc(user.username)}</strong>${user.is_admin ? ' <span class="pill pill-admin">admin</span>' : ''}${user.auth_provider === 'oidc' ? ' <span class="pill pill-oidc">SSO</span>' : ''}</div>
        </div>
      </div>
      <form method="post" action="/settings/profile">
        <label>Display name</label>
        <input type="text" name="display_name" placeholder="${esc(user.username)}" value="${esc(user.display_name || user.username)}">
        <div class="field-hint">Shown in the nav bar and on the dashboard. Defaults to your username.</div>
        <label>Email <span style="text-transform:none;color:#3a4a63;font-weight:500">(optional)</span></label>
        <input type="email" name="email" placeholder="you@example.com" value="${esc(user.email || '')}">
        <div class="field-hint">Used only for account recovery. Never shared.</div>
        <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check-lg"></i>Save profile</button></div>
      </form>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid #182035;display:flex;gap:24px;flex-wrap:wrap">
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:#364560;font-weight:700">Member since</div>
          <div style="font-size:13px;font-weight:600;color:#c9d1d9;margin-top:4px">${fmtDate(user.created_at)}</div>
        </div>
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:#364560;font-weight:700">Last login</div>
          <div style="font-size:13px;font-weight:600;color:#c9d1d9;margin-top:4px">${fmtRelative(user.last_login_at)}</div>
        </div>
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:#364560;font-weight:700">Auth method</div>
          <div style="font-size:13px;font-weight:600;color:#c9d1d9;margin-top:4px">${user.auth_provider === 'oidc' ? 'SSO / OIDC' : 'Local password'}</div>
        </div>
      </div>
    </div>

    ${user.auth_provider === 'local' ? `
    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-key-fill"></i></div>
        <div>
          <h2>Change password</h2>
          <div class="sub">Choose something only you know.</div>
        </div>
      </div>
      <form method="post" action="/settings/password">
        <label>Current password</label>
        <input type="password" name="current" autocomplete="current-password" placeholder="••••••••">
        <div class="row" style="margin-top:4px">
          <div><label>New password</label><input type="password" name="next" autocomplete="new-password" placeholder="At least 4 characters"></div>
          <div><label>Confirm new password</label><input type="password" name="confirm" autocomplete="new-password" placeholder="Repeat new password"></div>
        </div>
        <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-shield-lock"></i>Change password</button></div>
      </form>
    </div>` : `
    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-shield-check"></i></div>
        <div>
          <h2>Password</h2>
          <div class="sub">This account signs in via SSO; manage its password in your identity provider.</div>
        </div>
      </div>
    </div>`}`;

  const dataSubTab = `
    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-database-fill"></i></div>
        <div>
          <h2>Data</h2>
          <div class="sub">Export or import your caught collection.</div>
        </div>
      </div>

      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#5a6b82;font-weight:700;margin-bottom:8px">Export</div>
      <p style="font-size:12.5px;color:#546070;line-height:1.6;margin-bottom:10px">Download all caught records across every game as JSON.</p>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="/api/export/caught" download="living-pokedex-export.json"><i class="bi bi-file-earmark-arrow-down"></i>Download export</a>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('import-file-native').click()"><i class="bi bi-file-earmark-arrow-up"></i>Import</button>
        <input type="file" id="import-file-native" accept=".json" style="display:none" onchange="runImport('native')">
      </div>

      <div id="import-msg" style="display:none;margin-top:10px"></div>
      <script src="/import-log.js"></script>

      <div id="last-import-row" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid #182035">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:12px;font-weight:600;color:#c9d1d9;margin-bottom:2px">Last import</div>
            <div id="last-import-meta" style="font-size:11px;color:#546070"></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="viewLastImport()"><i class="bi bi-clock-history"></i>View results</button>
        </div>
      </div>
    </div>

    <div class="card" style="border-color:#3a1a1a">
      <div class="card-head">
        <div class="ico" style="background:rgba(220,50,50,.12);color:#e05555"><i class="bi bi-trash3-fill"></i></div>
        <div>
          <h2 style="color:#e05555">Danger zone</h2>
          <div class="sub">Irreversible actions — proceed with caution.</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:13px;font-weight:600;color:#c9d1d9;margin-bottom:3px">Clear all caught data</div>
          <div style="font-size:12px;color:#546070">Permanently deletes every caught record across all games. This cannot be undone.</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="confirmClear()" style="flex-shrink:0"><i class="bi bi-trash3"></i>Clear data</button>
      </div>
    </div>

    <div id="clear-modal" style="display:none;position:fixed;inset:0;background:rgba(2,6,14,.7);backdrop-filter:blur(2px);z-index:10001;align-items:center;justify-content:center">
      <div style="background:#0c1526;border:1px solid #5a2020;border-radius:12px;padding:24px;width:min(380px,90vw);box-shadow:0 12px 40px rgba(0,0,0,.7)">
        <div style="font-size:16px;font-weight:700;color:#e05555;margin-bottom:8px"><i class="bi bi-exclamation-triangle-fill"></i> Clear all caught data?</div>
        <p style="font-size:13px;color:#8a9ab8;line-height:1.6;margin-bottom:16px">This will permanently delete every caught record across all games. You can export a backup first using the button above.</p>
        <p style="font-size:13px;color:#c9d1d9;margin-bottom:8px">Type <strong style="color:#e05555">clear</strong> to confirm:</p>
        <input id="clear-confirm-input" type="text" placeholder="clear" autocomplete="off"
          style="width:100%;padding:8px 12px;border-radius:7px;border:1px solid #3a2020;background:#080e1c;color:#c9d1d9;font-size:13px;outline:none;margin-bottom:16px">
        <div id="clear-error" style="display:none;font-size:12px;color:#ff9d9d;margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="closeClear()">Cancel</button>
          <button class="btn btn-danger btn-sm" onclick="executeClear()" id="clear-confirm-btn"><i class="bi bi-trash3"></i>Clear everything</button>
        </div>
      </div>
    </div>

    <script>
    (function(){
      function fmtAgo(ts) {
        var diff = Date.now() - ts;
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        var hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        var days = Math.floor(hrs / 24);
        return days + 'd ago';
      }
      window.__irlUpdateLastImportBtn = function() {
        try {
          var stored = localStorage.getItem('lpLastImport');
          if (!stored) return;
          var obj = JSON.parse(stored);
          var d = obj.d;
          var row = document.getElementById('last-import-row');
          var meta = document.getElementById('last-import-meta');
          if (!row || !meta) return;
          var parts = [];
          if (d.imported)      parts.push(d.imported.toLocaleString() + ' imported');
          if (d.shinyImported) parts.push(d.shinyImported.toLocaleString() + ' shiny');
          if (d.skipped)       parts.push(d.skipped.toLocaleString() + ' skipped');
          meta.textContent = (parts.join(' · ') || 'No results') + ' · ' + fmtAgo(obj.savedAt);
          row.style.display = 'block';
        } catch (e) {}
      };
      window.viewLastImport = function() {
        try {
          var stored = localStorage.getItem('lpLastImport');
          if (!stored) return;
          var obj = JSON.parse(stored);
          window.showImportLog(obj.d, true);
        } catch (e) {}
      };
      document.addEventListener('DOMContentLoaded', window.__irlUpdateLastImportBtn);
    })();
    (function(){
      function showMsg(html, ok) {
        var el = document.getElementById('import-msg');
        el.style.cssText = 'display:flex;align-items:center;gap:9px;padding:11px 14px;border-radius:9px;font-size:13px;font-weight:500;margin-bottom:12px;'
          + (ok ? 'border:1px solid #145e30;background:rgba(46,204,113,.09);color:#5fd58a'
                : 'border:1px solid #5a2020;background:rgba(255,80,80,.09);color:#ff9d9d');
        el.innerHTML = html;
      }
      window.runImport = function(fmt) {
        var fileEl = document.getElementById('import-file-' + fmt);
        var file = fileEl && fileEl.files[0];
        if (!file) { showMsg('<i class="bi bi-exclamation-triangle-fill"></i> Please choose a file first.', false); return; }
        var reader = new FileReader();
        reader.onload = function(ev) {
          var parsed;
          try { parsed = JSON.parse(ev.target.result); }
          catch(ex) { showMsg('<i class="bi bi-exclamation-triangle-fill"></i> File is not valid JSON: ' + ex.message, false); return; }
          var url = '/api/import/caught';
          showMsg('<i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite;display:inline-block"></i> Importing…', true);
          fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(parsed) })
            .then(function(r){ return r.json(); })
            .then(function(d) {
              if (d.error) { showMsg('<i class="bi bi-exclamation-triangle-fill"></i> ' + d.error, false); return; }
              document.getElementById('import-msg').style.display = 'none';
              window.showImportLog(d);
            })
            .catch(function(ex){ showMsg('<i class="bi bi-exclamation-triangle-fill"></i> ' + ex.message, false); });
        };
        reader.readAsText(file);
      };
      window.confirmClear = function() {
        var modal = document.getElementById('clear-modal');
        modal.style.display = 'flex';
        document.getElementById('clear-confirm-input').value = '';
        document.getElementById('clear-error').style.display = 'none';
        setTimeout(function(){ document.getElementById('clear-confirm-input').focus(); }, 50);
      };
      window.closeClear = function() {
        document.getElementById('clear-modal').style.display = 'none';
      };
      window.executeClear = function() {
        var val = (document.getElementById('clear-confirm-input').value || '').trim().toLowerCase();
        var errEl = document.getElementById('clear-error');
        if (val !== 'clear') {
          errEl.style.display = 'block';
          errEl.textContent = 'Type "clear" exactly to confirm.';
          return;
        }
        var btn = document.getElementById('clear-confirm-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite;display:inline-block"></i> Clearing…';
        fetch('/api/caught/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r){ return r.json(); })
          .then(function(d) {
            if (d.error) {
              errEl.style.display = 'block';
              errEl.textContent = d.error;
              btn.disabled = false;
              btn.innerHTML = '<i class="bi bi-trash3"></i> Clear everything';
              return;
            }
            window.location.href = '/settings?subtab=data&saved=1';
          })
          .catch(function(ex){
            errEl.style.display = 'block';
            errEl.textContent = ex.message;
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-trash3"></i> Clear everything';
          });
      };
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') window.closeClear();
      });
    })();
    </script>`;

  const preferencesSubTab = `
    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-sliders"></i></div>
        <div>
          <h2>Preferences</h2>
          <div class="sub">Defaults applied each time you open a dex.</div>
        </div>
      </div>
      <form method="post" action="/settings/preferences">
        <div class="row">
          <div>
            <label>Default sort</label>
            <div class="seg">
              <label><input type="radio" name="default_sort" value="regional"${chk(s.default_sort, 'regional') || (s.default_sort !== 'national' ? ' checked' : '')}><span>Regional&nbsp;#</span></label>
              <label><input type="radio" name="default_sort" value="national"${chk(s.default_sort, 'national')}><span>National&nbsp;#</span></label>
            </div>
          </div>
          <div>
            <label>Hide caught by default</label>
            <div class="seg">
              <label><input type="radio" name="hide_caught" value="false"${s.hide_caught ? '' : ' checked'}><span>Show all</span></label>
              <label><input type="radio" name="hide_caught" value="true"${s.hide_caught ? ' checked' : ''}><span>Hide caught</span></label>
            </div>
          </div>
        </div>
        <div class="row" style="margin-top:4px">
          <div>
            <label>Entry scale</label>
            <div class="seg">
              <label><input type="radio" name="card_scale" value="small"${chk(s.card_scale,'small')}><span>Small</span></label>
              <label><input type="radio" name="card_scale" value="medium"${chk(s.card_scale,'medium')||(s.card_scale!=='small'&&s.card_scale!=='large'?' checked':'')}><span>Medium</span></label>
              <label><input type="radio" name="card_scale" value="large"${chk(s.card_scale,'large')}><span>Large</span></label>
            </div>
          </div>
          <div>
            <label>Details panel size</label>
            <div class="seg">
              <label><input type="radio" name="panel_size" value="small"${chk(s.panel_size,'small')}><span>Small</span></label>
              <label><input type="radio" name="panel_size" value="medium"${chk(s.panel_size,'medium')||(s.panel_size!=='small'&&s.panel_size!=='large'?' checked':'')}><span>Medium</span></label>
              <label><input type="radio" name="panel_size" value="large"${chk(s.panel_size,'large')}><span>Large</span></label>
            </div>
          </div>
        </div>
        <div class="row" style="margin-top:4px">
          <div>
            <label>Timezone <span style="text-transform:none;color:#3a4a63;font-weight:500">(suggestions)</span></label>
            <select name="timezone">${tzOpts}</select>
            <div class="field-hint">Used to reset your daily Pokémon suggestions at midnight.</div>
          </div>
        </div>
        <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check-lg"></i>Save preferences</button></div>
      </form>
    </div>`;

  const subTabContent = activeSub === 'data' ? dataSubTab
    : activeSub === 'preferences' ? preferencesSubTab
    : profileSubTab;

  const tabContent = activeTab === 'admin'
    ? adminTabHtml(adminList || [], user, {
        error: adminError, notice: adminNotice, auth: adminAuth,
        oidcLib: adminOidcLib, suggestedRedirect: adminSuggestedRedirect,
        dbStats, adminSubtab: opts.adminSubtab || 'accounts',
      })
    : `
    ${saved ? '<div class="msg msg-ok"><i class="bi bi-check-circle-fill"></i>Your changes have been saved.</div>' : ''}
    ${error ? `<div class="msg msg-err"><i class="bi bi-exclamation-triangle-fill"></i>${esc(error)}</div>` : ''}
    ${subTabBar}
    ${subTabContent}`;

  const body = `
  <div class="wrap">
    <div class="page-head">
      <h2>Settings</h2>
      <div class="lead">Manage your profile and application settings.</div>
    </div>
    ${tabBar}
    ${tabContent}
  </div>`;
  return shell('Settings', body, { user, active: 'settings', csrfToken: opts.csrfToken || '' });
}

// ── Scraper control panel (admin page) ───────────────────────────────────────
// Progress wheels live in the dex sidebar (client.js + app.js sidebarScraperWheels).
// This section gives admins per-group run/stop controls and a live activity log.

// Must stay in sync with SCRAPER_ALL_GROUPS in app.js (DLC groups omitted — they chain automatically).
const SCRAPER_ALL_GROUPS = [
  'RBY','FRLG','LGPE',
  'GSC','HGSS',
  'RSE','ORAS',
  'DPPT','BDSP',
  'BW','BW2',
  'XY',
  'SM','USUM',
  'SwSh',        // also runs IoA + CT
  'PLA',
  'SV',          // also runs Kita + BB
  'LZA',
];

const SCRAPER_LABELS = {
  RBY:  'Red / Blue / Yellow',
  FRLG: 'FireRed / LeafGreen',
  LGPE: "Let's Go Pikachu / Eevee",
  GSC:  'Gold / Silver / Crystal',
  HGSS: 'HeartGold / SoulSilver',
  RSE:  'Ruby / Sapphire / Emerald',
  ORAS: 'Omega Ruby / Alpha Sapphire',
  DPPT: 'Diamond / Pearl / Platinum',
  BDSP: 'Brilliant Diamond / Shining Pearl',
  BW:   'Black / White',
  BW2:  'Black 2 / White 2',
  XY:   'X / Y',
  SM:   'Sun / Moon',
  USUM: 'Ultra Sun / Ultra Moon',
  SwSh: 'Sword / Shield',
  PLA:  'Legends: Arceus',
  SV:   'Scarlet / Violet',
  LZA:  'Legends: Z-A',
};

// Small sub-label shown under the card name for games that auto-include DLC.
const SCRAPER_DLC_NOTE = {
  SwSh: '+ Isle of Armor & Crown Tundra',
  SV:   '+ Kitakami & Blueberry',
};

// Utility script labels shown in the "Supporting scripts" section.
const UTIL_SCRIPTS = [
  {
    key:   'static',
    label: 'Static Encounters',
    sub:   'Seeds gifts, legendaries, fossils &amp; roaming Pokémon. Run after encounter scrapers to restore data they clear.',
    color: '#a370f7',
    border:'#6a3aac',
    bg:    'linear-gradient(135deg,#1e0e40,#140a30)',
  },
];

function scraperCardInitialText(s) {
  if (!s) return { text: 'Idle', color: '#546070' };
  if (s.status === 'running') return { text: s.total > 0 ? `Scanning ${Math.round(s.done / s.total * 100)}%` : 'Scanning…', color: '#4a7fff' };
  if (s.status === 'done')    return { text: 'Done ✓' + (s.inserted > 0 ? ` · ${s.inserted.toLocaleString()} enc.` : ''), color: '#fac000' };
  if (s.status === 'error')   return { text: 'Error ✗', color: '#f05060' };
  return { text: 'Idle', color: '#546070' };
}

// Shared attribution shown on every scraper-related screen, so it is always
// clear that the encounter data is scraped from and references Bulbapedia
// (its content is licensed CC BY-NC-SA 2.5).
function bulbapediaCredit(style = '') {
  return `<div class="bulba-credit" style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid #1c2e1c;background:linear-gradient(135deg,#0c160c,#070e08);font-size:11px;color:#7fa07f;line-height:1.45;${style}">
    <i class="bi bi-info-circle-fill" style="color:#5cba5c;font-size:13px;flex-shrink:0"></i>
    <span>Encounter data is sourced from and references <a href="https://bulbapedia.bulbagarden.net/" target="_blank" rel="noopener" style="color:#8fd08f;font-weight:700;text-decoration:none">Bulbapedia</a>, the community-driven Pokémon encyclopedia (content under <a href="https://creativecommons.org/licenses/by-nc-sa/2.5/" target="_blank" rel="noopener" style="color:#8fd08f;text-decoration:none">CC BY-NC-SA 2.5</a>).</span>
  </div>`;
}

function scraperSectionHtml() {
  const progress = getScraperProgress();
  // Compact encounter scraper cards — name, optional DLC note, status, button
  const encCards = SCRAPER_ALL_GROUPS.map(k => {
    const label   = SCRAPER_LABELS[k] ?? k;
    const dlcNote = SCRAPER_DLC_NOTE[k]
      ? `<div style="font-size:8px;color:#3a5888;line-height:1.2">${SCRAPER_DLC_NOTE[k]}</div>`
      : '';
    const p       = progress.get(k);
    const init    = scraperCardInitialText(p);
    const isRun   = p?.status === 'running';
    const btnBg   = isRun ? 'linear-gradient(135deg,#2d0e0e,#1a0808)' : 'linear-gradient(135deg,#0e2260,#0a1848)';
    const btnBdr  = isRun ? '#6b2020' : '#1a3898';
    const btnClr  = isRun ? '#ff9090' : '#7ab4ff';
    const btnTxt  = isRun ? '■ Stop' : '▶ Run';
    return `<div id="scrcard-${k}" style="background:#070e1a;border:1px solid #182035;border-radius:8px;padding:8px 10px;display:flex;flex-direction:column;align-items:center;text-align:center;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:100%;min-height:0">
        <div style="font-size:11px;font-weight:700;color:#c9d1d9;line-height:1.3">${label}</div>
        ${dlcNote}
        <div id="scrst-${k}" style="font-size:9px;color:${init.color};margin-top:3px">${init.text}</div>
      </div>
      <button id="scrbtn-${k}" onclick="scraperAct('${k}')"
        style="margin-top:6px;padding:3px 8px;border-radius:5px;border:1px solid ${btnBdr};background:${btnBg};color:${btnClr};font-size:10px;cursor:pointer;font-weight:600;width:100%;transition:background .15s,border-color .15s,color .15s;flex-shrink:0">
        ${btnTxt}
      </button>
    </div>`;
  }).join('');

  // Utility script rows
  const utilRows = UTIL_SCRIPTS.map(u => {
    const viewBtn = u.key === 'static'
      ? `<button onclick="toggleStaticEncounters(true)"
           style="padding:3px 10px;border-radius:5px;border:1px solid #2a4a2a;background:linear-gradient(135deg,#0e2010,#081408);color:#7adf7a;font-size:10px;cursor:pointer;font-weight:600;white-space:nowrap;flex-shrink:0;transition:background .15s,color .15s,border-color .15s">
           📋 View Static Encounters
         </button>`
      : '';
    const btn = `<button id="scrbtn-${u.key}" onclick="runUtil('${u.key}')"
           style="padding:3px 10px;border-radius:5px;border:1px solid ${u.border};background:${u.bg};color:${u.color};font-size:10px;cursor:pointer;font-weight:600;white-space:nowrap;flex-shrink:0;transition:background .15s,color .15s,border-color .15s">
           ▶ Run
         </button>`;
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid #0e1828">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;color:#c9d1d9">${u.label}</div>
        <div style="font-size:10px;color:#546070;margin-top:2px;line-height:1.4">${u.sub}</div>
        <div id="utilst-${u.key}" style="font-size:10px;margin-top:3px"></div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">${viewBtn}${btn}</div>
    </div>`;
  }).join('');

  return `
  <div class="page-head" style="margin-top:30px;margin-bottom:14px">
    <h2 style="font-size:18px"><i class="bi bi-cpu-fill" style="font-size:15px;margin-right:7px;opacity:.8"></i>Encounter Scraper</h2>
    <div class="lead">Scans <a href="https://bulbapedia.bulbagarden.net/" target="_blank" rel="noopener" style="color:#8fd08f;font-weight:600;text-decoration:none">Bulbapedia</a> for wild encounter data. Each scraper automatically re-seeds its own locations. Run <strong>Seed Static Encounters</strong> afterwards to restore gifts, legendaries &amp; roaming Pokémon.</div>
  </div>
  ${bulbapediaCredit('margin-bottom:14px')}
  <div class="scraper-two-col">
    <div id="scraper-cards-panel" class="card" style="margin-bottom:0">
      <div class="card-head">
        <div class="ico"><i class="bi bi-play-circle-fill"></i></div>
        <div><h2>Run / stop scrapers</h2><div class="sub">Click to start; click again to stop.</div></div>
        <div class="scraper-card-btns" style="display:flex;gap:6px;margin-left:auto;flex-shrink:0">
          <a href="/admin/locations"
            style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;border:1px solid #1a3070;background:linear-gradient(135deg,#0a1848,#071030);color:#7ab4ff;font-size:12px;font-weight:600;white-space:nowrap;text-decoration:none;transition:opacity .15s"
            title="Browse all scraper locations and encounters">
            📍 Locations
          </a>
          <button onclick="forceReset()"
            style="padding:5px 10px;border-radius:6px;border:1px solid #4a3010;background:linear-gradient(135deg,#261508,#160c04);color:#c07030;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap;transition:opacity .15s"
            title="Kill any stuck processes, clear in-memory scraper state, and delete all encounter data">
            ⟳ Reset
          </button>
          <button id="scrbtn-__incomplete__" onclick="runIncomplete()"
            style="padding:5px 14px;border-radius:6px;border:1px solid #1a5c1a;background:linear-gradient(135deg,#0e3010,#081a08);color:#7adf7a;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap;transition:background .15s,border-color .15s,color .15s">
            ▶ Run Incomplete
          </button>
          <button id="scrbtn-__all__" onclick="runAll()"
            style="padding:5px 14px;border-radius:6px;border:1px solid #1a3898;background:linear-gradient(135deg,#0e2260,#0a1848);color:#7ab4ff;font-size:12px;cursor:pointer;font-weight:600;white-space:nowrap;transition:background .15s,border-color .15s,color .15s">
            ▶ Run All
          </button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));grid-auto-rows:82px;gap:8px">
        ${encCards}
      </div>
      <div style="margin-top:4px">${utilRows}</div>
    </div>
    <div class="card" style="margin-bottom:0">
      <div class="card-head">
        <div class="ico"><i class="bi bi-terminal-fill"></i></div>
        <div><h2>Activity log</h2><div class="sub">Live output from running scrapers.</div></div>
        <button onclick="document.getElementById('scr-log').innerHTML=''"
          style="margin-left:auto;padding:4px 10px;border-radius:5px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:11px;cursor:pointer;font-weight:600">
          Clear
        </button>
      </div>
      <div id="scr-log"
        style="font-family:'Courier New',monospace;font-size:11px;line-height:1.55;background:#030810;border:1px solid #0e1828;border-radius:6px;padding:10px 12px;height:480px;overflow-y:auto;white-space:pre-wrap;word-break:break-all">
        <span style="color:#364560">Waiting for scraper activity…</span>
      </div>
    </div>
  </div>
  <script>
  (function(){
    var running = {};

    function setCard(group, s) {
      var st  = document.getElementById('scrst-'  + group);
      var btn = document.getElementById('scrbtn-' + group);
      if (!st) return;
      var isRunning = s.status === 'running';
      running[group] = isRunning;
      var pct = s.total > 0 ? Math.round(s.done / s.total * 100) : 0;
      if (isRunning) {
        st.textContent = s.total > 0 ? 'Scanning ' + pct + '%' : 'Scanning…';
        st.style.color = '#4a7fff';
      } else if (s.status === 'done') {
        var doneText = 'Done ✓' + (s.inserted > 0 ? ' · ' + s.inserted.toLocaleString() + ' enc.' : '');
        if (s.errors > 0) {
          st.innerHTML = doneText + ' · <span style="color:#f06070">' + s.errors + ' err.</span>';
        } else {
          st.textContent = doneText;
        }
        st.style.color = '#fac000';
      } else if (s.status === 'error') {
        st.textContent = 'Error ✗';
        st.style.color = '#f05060';
      } else {
        st.textContent = 'Idle';
        st.style.color = '#546070';
      }
      if (btn) {
        btn.textContent = isRunning ? '■ Stop' : '▶ Run';
        btn.style.background  = isRunning ? 'linear-gradient(135deg,#2d0e0e,#1a0808)' : 'linear-gradient(135deg,#0e2260,#0a1848)';
        btn.style.borderColor = isRunning ? '#6b2020' : '#1a3898';
        btn.style.color       = isRunning ? '#ff9090' : '#7ab4ff';
      }
    }

    function scraperAct(group) {
      var url = running[group] ? '/admin/scraper/stop' : '/admin/scraper/run';
      fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({gameGroup:group}) })
        .then(function(r){ return r.json(); })
        .then(function(d){ if (d.error) alert(d.error); })
        .catch(function(e){ alert('Request failed: ' + e.message); });
    }
    window.scraperAct = scraperAct;

    var UTIL_STYLES = {
      'static': { bg: 'linear-gradient(135deg,#1e0e40,#140a30)', border: '#6a3aac', color: '#a370f7' }
    };

    function setUtilBtn(key, isRunning, result) {
      var btn  = document.getElementById('scrbtn-' + key);
      var stat = document.getElementById('utilst-' + key);
      if (isRunning) {
        if (btn) {
          btn.textContent = '■ Running…';
          btn.style.background  = 'linear-gradient(135deg,#2d0e0e,#1a0808)';
          btn.style.borderColor = '#6b2020';
          btn.style.color       = '#ff9090';
          btn.style.opacity     = '1';
          btn.disabled = true;
        }
        if (stat) { stat.textContent = 'Running…'; stat.style.color = '#4a7fff'; }
      } else {
        if (btn) {
          btn.textContent = '▶ Run';
          btn.style.opacity = '1';
          btn.disabled = false;
          var s = UTIL_STYLES[key];
          if (s) {
            btn.style.background  = s.bg;
            btn.style.borderColor = s.border;
            btn.style.color       = s.color;
          }
        }
        if (stat) {
          if (!result) {
            stat.textContent = '';
          } else if (result.status === 'done') {
            stat.textContent = 'Done ✓' + (result.ts ? ' · ' + result.ts : '');
            stat.style.color = '#fac000';
          } else if (result.status === 'error') {
            stat.textContent = 'Error ✗' + (result.code != null ? ' (code ' + result.code + ')' : '') + (result.ts ? ' · ' + result.ts : '');
            stat.style.color = '#f05060';
          }
        }
      }
    }

    function runUtil(key) {
      var btn = document.getElementById('scrbtn-' + key);
      if (btn && btn.disabled) return;
      setUtilBtn(key, true);
      fetch('/admin/scraper/run-' + key, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d.error) {
            alert(d.error);
            setUtilBtn(key, false);
            return;
          }
          // Display output lines in the activity log
          if (d.lines && d.lines.length) {
            d.lines.forEach(function(l) {
              appendLog({ type: 'log', gameGroup: key, text: l.text, level: l.level, ts: d.ts });
            });
          }
          setUtilBtn(key, false, { status: d.ok ? 'done' : 'error', code: d.exitCode, ts: d.ts });
        })
        .catch(function(e){ alert(e.message); setUtilBtn(key, false); });
    }
    window.runUtil = runUtil;


    // Representative colour for each game group tag in the activity log.
    // Derived from GAME_COLORS in app.js — one colour per generation/game era.
    var GROUP_COLORS = {
      RBY:  '#F0594E', // Red
      GSC:  '#E0B53A', // Gold
      RSE:  '#3DC971', // Emerald
      FRLG: '#F07840', // FireRed (orange-red, distinct from RBY)
      DPPT: '#AEB6BD', // Platinum
      HGSS: '#E0C050', // HeartGold (warmer gold, distinct from GSC)
      BW:   '#9AA0A6', // Black
      BW2:  '#A98CE0', // Black 2
      XY:   '#5B9BFF', // X
      ORAS: '#5FBF66', // Alpha Sapphire green (distinct from RSE)
      SM:   '#F0A03A', // Sun
      USUM: '#F06A10', // Ultra Sun (deeper orange, distinct from SM)
      LGPE: '#F0CB2E', // Pikachu yellow
      SwSh: '#3AB6F0', // Sword
      IoA:  '#3AB6F0', // Isle of Armor (Sword DLC)
      CT:   '#9DC4E8', // Crown Tundra (cooler blue)
      BDSP: '#C4A8F0', // Brilliant Diamond (purple-blue)
      PLA:  '#8BBFAD', // Legends: Arceus
      SV:   '#B07AE0', // Violet
      Kita: '#B07AE0', // Kitakami (SV DLC)
      BB:   '#B07AE0', // Blueberry (SV DLC)
      static: '#a370f7', // Static encounters
      all:    '#7ab4ff', // Run All
    };

    // Per-abbreviation colours for multi-game group log tags, e.g. [FR LG] each in their game colour.
    var GROUP_TAG_PARTS = {
      RBY:  [['R','#F0594E'],['B','#5B9BFF'],['Y','#F0CB2E']],
      GSC:  [['G','#E0B53A'],['S','#B8BFC6'],['C','#5FC7D6']],
      RSE:  [['R','#F0594E'],['S','#5B9BFF'],['E','#3DC971']],
      FRLG: [['FR','#F0594E'],['LG','#5FBF66']],
      DPPT: [['D','#9DC4E8'],['P','#F0A8C4'],['Pt','#AEB6BD']],
      HGSS: [['HG','#E0B53A'],['SS','#B8BFC6']],
      BW:   [['B','#9AA0A6'],['W','#D6DAE0']],
      BW2:  [['B2','#A98CE0'],['W2','#6FD0F0']],
      XY:   [['X','#5B9BFF'],['Y','#F0594E']],
      ORAS: [['OR','#F0594E'],['AS','#5B9BFF']],
      SM:   [['Su','#F0A03A'],['Mo','#6E8FE0']],
      USUM: [['US','#F08A3A'],['UM','#6E8FE0']],
      LGPE: [['P','#F0CB2E'],['E','#C99A5E']],
      SwSh: [['Sw','#3AB6F0'],['Sh','#F0594E']],
      BDSP: [['BD','#9DC4E8'],['SP','#F0A8C4']],
      SV:   [['Sc','#F0594E'],['V','#B07AE0']],
    };

    function appendLog(d) {
      var log = document.getElementById('scr-log');
      if (!log) return;
      if (log.children.length === 1 && log.children[0].style.color === '#364560') log.innerHTML = '';
      var atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      var grp    = d.gameGroup || '?';
      var tagCol = GROUP_COLORS[grp] || '#4a7fff';
      var ts     = d.ts ? '<span style="color:#2a3e5a">' + d.ts + '</span> ' : '';
      var parts  = GROUP_TAG_PARTS[grp];
      var tag = parts
        ? parts.map(function(p){ return '<span style="color:' + p[1] + ';font-weight:700">[' + p[0] + ']</span>'; }).join('') + ' '
        : '<span style="color:' + tagCol + ';font-weight:700">[' + grp + ']</span> ';
      var col = (d.level === 'error' || /\bERROR\b/.test(d.text || '')) ? '#f06070' : '#8aa8c8';
      var txt    = (d.text || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').trimEnd();
      var div    = document.createElement('div');
      div.style.whiteSpace = 'pre-wrap';
      div.innerHTML = ts + tag + '<span style="color:' + col + '">' + txt + '</span>';
      log.appendChild(div);
      if (atBottom) log.scrollTop = log.scrollHeight;
    }

    // DLC groups that roll up into their parent card in the admin panel.
    var DLC_PARENT = { IoA: 'SwSh', CT: 'SwSh', Kita: 'SV', BB: 'SV' };

    var runAllActive = false;
    function runAll() {
      var btn = document.getElementById('scrbtn-__all__');
      if (runAllActive) {
        // Stop the run-all sequence
        fetch('/admin/scraper/stop', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({gameGroup:'__all__'}) })
          .then(function(r){ return r.json(); })
          .then(function(d){ if (d.error) alert(d.error); })
          .catch(function(e){ alert(e.message); });
        return;
      }
      if (btn) { btn.textContent = '■ Stop All'; btn.style.background='linear-gradient(135deg,#2d0e0e,#1a0808)'; btn.style.borderColor='#6b2020'; btn.style.color='#ff9090'; }
      runAllActive = true;
      fetch('/admin/scraper/run-all', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d.error) {
            alert(d.error);
            runAllActive = false;
            if (btn) { btn.textContent = '▶ Run All'; btn.style.background='linear-gradient(135deg,#0e2260,#0a1848)'; btn.style.borderColor='#1a3898'; btn.style.color='#7ab4ff'; }
          }
        })
        .catch(function(e){
          alert(e.message);
          runAllActive = false;
          if (btn) { btn.textContent = '▶ Run All'; btn.style.background='linear-gradient(135deg,#0e2260,#0a1848)'; btn.style.borderColor='#1a3898'; btn.style.color='#7ab4ff'; }
        });
    }
    window.runAll = runAll;
    function forceReset() {
      if (!confirm('This will kill all running scrapers AND delete all encounter data from the database. Continue?')) return;
      fetch('/admin/scraper/force-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
        .then(function(r){ return r.json(); })
        .then(function(d){ if (d.error) alert(d.error); })
        .catch(function(e){ alert('Reset failed: ' + e.message); });
    }
    window.forceReset = forceReset;
    function resetRunAllBtn() {
      runAllActive = false;
      var btn = document.getElementById('scrbtn-__all__');
      if (btn) { btn.textContent = '▶ Run All'; btn.disabled = false; btn.style.opacity = '1'; btn.style.background='linear-gradient(135deg,#0e2260,#0a1848)'; btn.style.borderColor='#1a3898'; btn.style.color='#7ab4ff'; }
    }

    var runIncompleteActive = false;
    function runIncomplete() {
      var btn = document.getElementById('scrbtn-__incomplete__');
      if (runIncompleteActive) {
        fetch('/admin/scraper/stop', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({gameGroup:'__all__'}) })
          .then(function(r){ return r.json(); })
          .then(function(d){ if (d.error) alert(d.error); })
          .catch(function(e){ alert(e.message); });
        return;
      }
      if (btn) { btn.textContent = '■ Stop'; btn.style.background='linear-gradient(135deg,#2d0e0e,#1a0808)'; btn.style.borderColor='#6b2020'; btn.style.color='#ff9090'; }
      runIncompleteActive = true;
      fetch('/admin/scraper/run-incomplete', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })
        .then(function(r){ return r.json(); })
        .then(function(d){
          if (d.error) {
            alert(d.error);
            runIncompleteActive = false;
            if (btn) { btn.textContent = '▶ Run Incomplete'; btn.style.background='linear-gradient(135deg,#0e3010,#081a08)'; btn.style.borderColor='#1a5c1a'; btn.style.color='#7adf7a'; }
          }
        })
        .catch(function(e){
          alert(e.message);
          runIncompleteActive = false;
          if (btn) { btn.textContent = '▶ Run Incomplete'; btn.style.background='linear-gradient(135deg,#0e3010,#081a08)'; btn.style.borderColor='#1a5c1a'; btn.style.color='#7adf7a'; }
        });
    }
    window.runIncomplete = runIncomplete;
    function resetRunIncompleteBtn() {
      runIncompleteActive = false;
      var btn = document.getElementById('scrbtn-__incomplete__');
      if (btn) { btn.textContent = '▶ Run Incomplete'; btn.disabled = false; btn.style.opacity = '1'; btn.style.background='linear-gradient(135deg,#0e3010,#081a08)'; btn.style.borderColor='#1a5c1a'; btn.style.color='#7adf7a'; }
    }

    var es = new EventSource('/api/scraper-events');
    es.onmessage = function(ev) {
      var d = JSON.parse(ev.data);
      if (d.type === 'init') {
        Object.keys(d.progress).forEach(function(g){ setCard(g, d.progress[g]); });
        var anyRunning = Object.values(d.progress).some(function(s){ return s.status === 'running'; });
        if (!anyRunning && !d.util.allRunning) { resetRunAllBtn(); resetRunIncompleteBtn(); }
        // Restore utility button states after a page reload
        if (d.util.static) {
          setUtilBtn('static', true);
        } else if (d.util.staticResult) {
          setUtilBtn('static', false, d.util.staticResult);
        }
        // Restore button active state after a page reload mid-sequence
        if (d.util.allRunning) {
          if (d.util.sequenceType === 'incomplete') {
            runIncompleteActive = true;
            var incBtn = document.getElementById('scrbtn-__incomplete__');
            if (incBtn) { incBtn.textContent = '■ Stop'; incBtn.style.background='linear-gradient(135deg,#2d0e0e,#1a0808)'; incBtn.style.borderColor='#6b2020'; incBtn.style.color='#ff9090'; }
          } else {
            runAllActive = true;
            var allBtn = document.getElementById('scrbtn-__all__');
            if (allBtn) { allBtn.textContent = '■ Stop All'; allBtn.style.background='linear-gradient(135deg,#2d0e0e,#1a0808)'; allBtn.style.borderColor='#6b2020'; allBtn.style.color='#ff9090'; }
          }
        }
      } else if (d.type === 'progress') {
        var target = DLC_PARENT[d.gameGroup] || d.gameGroup;
        setCard(target, d);
        // Only reset sequence buttons via DOM check when no sequence is active —
        // avoids the race where one group finishes before the next is marked running.
        if (d.status !== 'running' && !runAllActive && !runIncompleteActive) {
          var stillRunning = false;
          document.querySelectorAll('[id^="scrst-"]').forEach(function(el){
            if (el.style.color === '#4a7fff') stillRunning = true;
          });
          if (!stillRunning) { resetRunAllBtn(); resetRunIncompleteBtn(); }
        }
      } else if (d.type === 'sequence-done') {
        resetRunAllBtn();
        resetRunIncompleteBtn();
      } else if (d.type === 'util') {
        var utilKey = (d.key || '').replace(/^__|__$/g, '');
        setUtilBtn(utilKey, !!d.running, d.running ? null : { status: d.status, code: d.code, ts: d.ts });
      } else if (d.type === 'log') {
        appendLog(d);
      }
    };
  })();

  // Match the activity log height to the scraper cards panel so they stay level.
  (function syncLogHeight() {
    var left = document.getElementById('scraper-cards-panel');
    var log  = document.getElementById('scr-log');
    if (!left || !log) return;
    function sync() {
      var head  = log.parentElement.querySelector('.card-head');
      var used  = (head ? head.offsetHeight + 18 : 0) + 46; // head + its margin-bottom + card padding
      log.style.height = Math.max(240, left.offsetHeight - used) + 'px';
    }
    sync();
    if (window.ResizeObserver) new ResizeObserver(sync).observe(left);
  })();

  // ── Static Encounters viewer ───────────────────────────────────────────────
  // Toggle overlay that embeds the full Static & Special Encounters viewer
  // (served bare at /static-encounters?embed=1). Replaces the old standalone
  // "Encounters" nav tab — open and close it from here as needed.
  function toggleStaticEncounters(forceOpen) {
    var ov = document.getElementById('se-overlay');
    if (!ov) return;
    var isOpen = ov.style.display === 'flex';
    var open = (forceOpen != null) ? forceOpen : !isOpen;
    if (open) {
      var fr = document.getElementById('se-frame');
      if (fr && !fr.getAttribute('src')) fr.setAttribute('src', '/static-encounters?embed=1');
      ov.style.display = 'flex';
    } else {
      ov.style.display = 'none';
    }
  }
  window.toggleStaticEncounters = toggleStaticEncounters;
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') toggleStaticEncounters(false); });
  </script>

  <!-- Static & Special Encounters viewer (toggled from the Scrapers panel) -->
  <div id="se-overlay" onclick="if(event.target===this)toggleStaticEncounters(false)"
    style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.92);align-items:center;justify-content:center;padding:16px">
    <div style="background:#070e1a;border:1px solid #182035;border-radius:12px;width:min(1180px,100%);height:90vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #0e1828;flex-shrink:0">
        <i class="bi bi-shield-fill-exclamation" style="color:#a370f7;font-size:16px"></i>
        <div style="font-size:15px;font-weight:700;color:#c9d1d9">Static &amp; Special Encounters</div>
        <button onclick="toggleStaticEncounters(false)"
          style="margin-left:auto;padding:4px 12px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:12px;cursor:pointer;font-weight:600">
          &#x2715; Close
        </button>
      </div>
      <iframe id="se-frame" title="Static and Special Encounters"
        style="flex:1;width:100%;border:0;background:#08101c"></iframe>
    </div>
  </div>

  <script>
  // ── Locations Table modal ──────────────────────────────────────────────────
  (function(){
    var _data   = null;
    var _group  = 'all';
    var _status = 'all'; // 'all' | 'wild' | 'no-wild' | 'special'
    var _search = '';
    var _expanded = null;

    var GROUP_ORDER = ['RBY','FRLG','LGPE','GSC','HGSS','RSE','ORAS','DPPT','BDSP',
                       'BW','BW2','XY','SM','USUM','SwSh','IoA','CT','PLA','LZA','SV','Kita','BB'];

    var TH_STYLE = 'padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;'
      + 'color:#364560;font-weight:700;text-align:left;border-bottom:2px solid #182035;white-space:nowrap;';

    function filteredData() {
      return (_data || []).filter(function(r) {
        if (_group  !== 'all' && r.game_group !== _group) return false;
        if (_status === 'wild'    && r.enc_count === 0)    return false;
        if (_status === 'no-wild' && r.enc_count > 0)      return false;
        if (_status === 'special' && !r.has_static_data)   return false;
        if (_search) {
          var q = _search.toLowerCase();
          if (r.name.toLowerCase().indexOf(q) >= 0) return true;
          for (var i = 0; i < r.pokemon.length; i++) {
            if (r.pokemon[i].name.toLowerCase().indexOf(q) >= 0) return true;
          }
          return false;
        }
        return true;
      });
    }

    function wildCell(v) {
      if (v === true)  return '<span style="color:#5fd58a;font-weight:700">✓</span>';
      if (v === false) return '<span style="color:#f05060;font-weight:700">✗</span>';
      return '<span style="color:#364560">—</span>';
    }
    function specCell(v) {
      if (v === true)  return '<span style="color:#f0c040;font-weight:700">✓</span>';
      if (v === false) return '<span style="color:#364560">✗</span>';
      return '<span style="color:#364560">—</span>';
    }

    function renderTable() {
      var rows  = filteredData();
      var tbody = document.getElementById('loc-tbody');
      var count = document.getElementById('loc-row-count');
      if (!tbody) return;
      if (count) count.textContent = rows.length.toLocaleString() + ' location' + (rows.length !== 1 ? 's' : '');

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#364560;padding:24px">No locations match</td></tr>';
        return;
      }

      tbody.innerHTML = rows.map(function(r) {
        var countCell = r.enc_count > 0
          ? '<span style="font-weight:600;color:#7ab4ff">' + r.enc_count + '</span>'
          : '<span style="color:#364560">0</span>';

        var preview = '';
        if (r.pokemon.length > 0) {
          var names = r.pokemon.slice(0, 5).map(function(p){ return p.name; }).join(', ');
          if (r.pokemon.length > 5) names += ' <span style="color:#364560">+' + (r.pokemon.length - 5) + '</span>';
          preview = names;
        }

        var isExp = _expanded === r.id;
        var expRow = '';
        if (isExp && r.pokemon.length > 0) {
          var chips = r.pokemon.map(function(p) {
            return '<span style="display:inline-flex;align-items:center;gap:3px;margin:2px 3px;padding:2px 8px;'
              + 'background:#0c1526;border:1px solid #182035;border-radius:4px;font-size:10px;color:#9bb0c8">'
              + '<span style="color:#364560;font-size:9px">#' + p.num + '</span>' + p.name + '</span>';
          }).join('');
          expRow = '<tr><td colspan="6" style="padding:8px 16px 12px 20px;background:#060d1a;'
            + 'border-bottom:1px solid #0e1828"><div style="display:flex;flex-wrap:wrap">' + chips + '</div></td></tr>';
        }

        return '<tr onclick="window._locToggle(' + r.id + ')" style="cursor:pointer;border-bottom:1px solid #0e1828'
          + (isExp ? ';background:#080f1c' : '') + '">'
          + '<td style="padding:6px 8px;font-size:12px;color:#c9d1d9">' + r.name + '</td>'
          + '<td style="padding:6px 8px;font-size:10px;font-weight:700;color:#7ab4ff;white-space:nowrap">' + r.game_group + '</td>'
          + '<td style="padding:6px 8px;text-align:center">' + wildCell(r.has_wild_data) + '</td>'
          + '<td style="padding:6px 8px;text-align:center">' + specCell(r.has_static_data) + '</td>'
          + '<td style="padding:6px 8px;text-align:center;font-size:12px">' + countCell + '</td>'
          + '<td style="padding:6px 8px;font-size:11px;color:#8a9ab0;max-width:340px">' + preview + '</td>'
          + '</tr>' + expRow;
      }).join('');
    }

    function setGroup(g, el) {
      _group = g; _expanded = null;
      document.querySelectorAll('.loc-grp-btn').forEach(function(b){ b.classList.remove('loc-grp-active'); });
      if (el) el.classList.add('loc-grp-active');
      renderTable();
    }

    function setStatus(s, el) {
      _status = s; _expanded = null;
      document.querySelectorAll('.loc-sts-btn').forEach(function(b){ b.classList.remove('loc-sts-active'); });
      if (el) el.classList.add('loc-sts-active');
      renderTable();
    }

    window._locToggle = function(id) {
      _expanded = (_expanded === id) ? null : id;
      renderTable();
    };
    window._locSetSearch = function(v) {
      _search = v; _expanded = null;
      renderTable();
    };
    window._locSetGroup  = setGroup;
    window._locSetStatus = setStatus;

    window.showLocationsTable = function() {
      var overlay = document.getElementById('loc-overlay');
      if (!overlay) return;
      overlay.style.display = 'flex';
      if (_data) { renderTable(); return; }

      var tbody = document.getElementById('loc-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#7ab4ff;padding:24px">Loading…</td></tr>';

      fetch('/admin/scraper/locations-table')
        .then(function(r){ return r.json(); })
        .then(function(data) {
          if (!Array.isArray(data)) {
            var msg = (data && data.error) ? data.error : 'Unexpected response';
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:#f05060;padding:16px">Error: ' + msg + '</td></tr>';
            return;
          }
          _data = data;

          var seen = {};
          var groups = [];
          data.forEach(function(r) { if (!seen[r.game_group]) { groups.push(r.game_group); seen[r.game_group] = true; } });
          groups.sort(function(a, b) {
            var ai = GROUP_ORDER.indexOf(a), bi = GROUP_ORDER.indexOf(b);
            return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
          });

          var bar = document.getElementById('loc-grp-bar');
          if (bar) {
            bar.innerHTML = '<button class="loc-grp-btn loc-grp-active" onclick="_locSetGroup(\'all\',this)">All (' + data.length + ')</button>'
              + groups.map(function(g) {
                var cnt = data.filter(function(r){ return r.game_group === g; }).length;
                return '<button class="loc-grp-btn" onclick="_locSetGroup(\'' + g + '\',this)">' + g
                  + ' <span style="opacity:.6">(' + cnt + ')</span></button>';
              }).join('');
          }

          // Status counts
          var wildCnt    = data.filter(function(r){ return r.enc_count > 0; }).length;
          var noWildCnt  = data.filter(function(r){ return r.enc_count === 0; }).length;
          var specCnt    = data.filter(function(r){ return r.has_static_data === true; }).length;
          var stsBar = document.getElementById('loc-sts-bar');
          if (stsBar) {
            stsBar.innerHTML =
              '<button class="loc-sts-btn loc-sts-active" onclick="_locSetStatus(\'all\',this)">All (' + data.length + ')</button>'
              + '<button class="loc-sts-btn" onclick="_locSetStatus(\'wild\',this)"><span style="color:#5fd58a">✓</span> Has encounters (' + wildCnt + ')</button>'
              + '<button class="loc-sts-btn" onclick="_locSetStatus(\'no-wild\',this)"><span style="color:#f05060">✗</span> No encounters (' + noWildCnt + ')</button>'
              + '<button class="loc-sts-btn" onclick="_locSetStatus(\'special\',this)"><span style="color:#f0c040">✓</span> Has special (' + specCnt + ')</button>';
          }

          renderTable();
        })
        .catch(function(e) {
          if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:#f05060;padding:16px">Error: ' + e.message + '</td></tr>';
        });
    };
  })();
  </script>

  <!-- Locations Table Overlay -->
  <div id="loc-overlay" onclick="if(event.target===this)this.style.display='none'"
    style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.92);align-items:center;justify-content:center;padding:16px">
    <div style="background:#070e1a;border:1px solid #182035;border-radius:12px;width:min(1200px,100%);max-height:90vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #0e1828;flex-shrink:0">
        <i class="bi bi-pin-map-fill" style="color:#7ab4ff;font-size:16px"></i>
        <div>
          <div style="font-size:15px;font-weight:700;color:#c9d1d9">Scraper Locations</div>
          <div style="font-size:11px;color:#546070">All locations known to the encounter scrapers</div>
        </div>
        <span id="loc-row-count" style="margin-left:auto;margin-right:12px;font-size:11px;color:#546070"></span>
        <button onclick="document.getElementById('loc-overlay').style.display='none'"
          style="padding:4px 12px;border-radius:6px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:12px;cursor:pointer;font-weight:600">
          &#x2715; Close
        </button>
      </div>
      <div style="padding:10px 18px;border-bottom:1px solid #0e1828;display:flex;flex-direction:column;gap:8px;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input id="loc-search" type="text" placeholder="Search location or Pok&#xe9;mon&#x2026;"
            oninput="window._locSetSearch&&window._locSetSearch(this.value)"
            style="padding:6px 10px;background:#0c1526;border:1px solid #182035;border-radius:6px;color:#c9d1d9;font-size:12px;width:240px;box-sizing:border-box;outline:none">
          <div id="loc-sts-bar" style="display:flex;flex-wrap:wrap;gap:4px">
            <span style="color:#364560;font-size:11px">Click &#x1f4cd; Locations to load</span>
          </div>
        </div>
        <div id="loc-grp-bar" style="display:flex;flex-wrap:wrap;gap:4px">
        </div>
      </div>
      <div style="overflow-y:auto;flex:1">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#040b18;position:sticky;top:0;z-index:1">
              <th style="padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;text-align:left;border-bottom:2px solid #182035">Location</th>
              <th style="padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;text-align:left;border-bottom:2px solid #182035;white-space:nowrap">Group</th>
              <th style="padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;text-align:center;border-bottom:2px solid #182035;white-space:nowrap" title="Wild encounter data found by scraper">Wild</th>
              <th style="padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;text-align:center;border-bottom:2px solid #182035;white-space:nowrap" title="Special / static encounter section found">Special</th>
              <th style="padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;text-align:center;border-bottom:2px solid #182035">#</th>
              <th style="padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#364560;font-weight:700;text-align:left;border-bottom:2px solid #182035">Pok&#xe9;mon</th>
            </tr>
          </thead>
          <tbody id="loc-tbody">
            <tr><td colspan="6" style="text-align:center;color:#364560;padding:24px">Click &#x1f4cd; Locations to load</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <style>
    .loc-grp-btn{padding:3px 10px;border-radius:20px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:10px;font-weight:600;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
    .loc-grp-btn:hover{background:#111e36;color:#9bb0c8}
    .loc-grp-btn.loc-grp-active{background:linear-gradient(135deg,#0e2260,#0a1848);border-color:#1a3898;color:#7ab4ff}
    .loc-sts-btn{padding:3px 10px;border-radius:20px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:10px;font-weight:600;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
    .loc-sts-btn:hover{background:#111e36;color:#9bb0c8}
    .loc-sts-btn.loc-sts-active{background:#0e1e30;border-color:#1a3060;color:#9bb0c8}
    #loc-tbody tr:hover td{background:#090f1e}
    #loc-search:focus{border-color:#2a4bd0;box-shadow:0 0 0 3px rgba(74,127,255,.14)}
  </style>`;
}

function adminTabHtml(list, currentUser, { error = null, notice = null, auth = {}, oidcLib = true, suggestedRedirect = '', dbStats = null, adminSubtab = 'accounts' } = {}) {
  const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';
  const total    = list.length;
  const admins   = list.filter(u => u.is_admin).length;
  const disabled = list.filter(u => u.disabled).length;
  const sso      = list.filter(u => u.auth_provider === 'oidc').length;

  const activeSub = ['accounts', 'authentication', 'scrapers'].includes(adminSubtab) ? adminSubtab : 'accounts';

  const subTabBar = `
    <div class="sub-stabs">
      <a class="sub-stab${activeSub === 'accounts' ? ' active' : ''}" href="/settings?tab=admin&adminSubtab=accounts"><i class="bi bi-people-fill"></i>Accounts</a>
      <a class="sub-stab${activeSub === 'authentication' ? ' active' : ''}" href="/settings?tab=admin&adminSubtab=authentication"><i class="bi bi-shield-lock-fill"></i>Authentication</a>
      <a class="sub-stab${activeSub === 'scrapers' ? ' active' : ''}" href="/settings?tab=admin&adminSubtab=scrapers"><i class="bi bi-cpu-fill"></i>Encounter Scrapers</a>
    </div>`;

  // ── Accounts sub-tab ──────────────────────────────────────────────────────
  const rows = list.map(u => `
    <tr>
      <td>
        <div class="user-cell">
          <span class="avatar">${esc(initial(u.display_name || u.username))}</span>
          <div>
            <div class="uname">${esc(u.display_name || u.username)}${u.id === currentUser.id ? ' <span class="muted">(you)</span>' : ''}</div>
            <div class="muted" style="font-size:11px">${esc(u.username)}${u.email ? ` · ${esc(u.email)}` : ''}</div>
          </div>
        </div>
      </td>
      <td class="col-src">${u.auth_provider === 'oidc' ? '<span class="pill pill-oidc">SSO</span>' : '<span class="pill pill-user">local</span>'}</td>
      <td>${u.is_admin ? '<span class="pill pill-admin">admin</span>' : '<span class="pill pill-user">user</span>'} ${u.disabled ? '<span class="pill pill-off">disabled</span>' : ''}</td>
      <td><strong style="color:#c9d1d9">${u.caught_count}</strong></td>
      <td class="col-login" style="color:#6b7a99;font-size:12px;white-space:nowrap">${fmtRelative(u.last_login_at)}</td>
      <td>
        <div class="actions">
          ${u.id === currentUser.id ? '' : `
          <form method="post" action="/admin/users/${u.id}/toggle-admin"><button class="btn btn-sm btn-ghost" type="submit" title="${u.is_admin ? 'Revoke admin' : 'Make admin'}"><i class="bi ${u.is_admin ? 'bi-person-dash' : 'bi-person-up'}"></i>${u.is_admin ? 'Revoke admin' : 'Make admin'}</button></form>
          <form method="post" action="/admin/users/${u.id}/toggle-disabled"><button class="btn btn-sm btn-ghost" type="submit"><i class="bi ${u.disabled ? 'bi-unlock' : 'bi-slash-circle'}"></i>${u.disabled ? 'Enable' : 'Disable'}</button></form>`}
          ${u.auth_provider === 'local' ? `<form method="post" action="/admin/users/${u.id}/reset-password" onsubmit="return promptPw(this)"><input type="hidden" name="password"><button class="btn btn-sm btn-ghost" type="submit"><i class="bi bi-arrow-repeat"></i>Reset password</button></form>` : ''}
          <a class="btn btn-sm btn-ghost" href="/admin/users/${u.id}/export-caught" download="living-pokedex-${esc(u.username)}-export.json" title="Download caught data"><i class="bi bi-file-earmark-arrow-down"></i>Export</a>
          <input type="file" id="ai-native-${u.id}" accept=".json" style="display:none">
          <button class="btn btn-sm btn-ghost" onclick="adminRunImport(${u.id},'native')" title="Import native export JSON"><i class="bi bi-file-earmark-arrow-up"></i>Import</button>
          ${u.caught_count > 0 ? `<form method="post" action="/admin/users/${u.id}/clear-caught" onsubmit="return confirm('Clear all ${u.caught_count.toLocaleString()} caught records for ${esc(u.username)}? This cannot be undone.')"><button class="btn btn-sm btn-danger" type="submit" title="Clear all caught data"><i class="bi bi-x-octagon"></i>Clear caught</button></form>` : ''}
          ${u.id === currentUser.id ? '' : `<form method="post" action="/admin/users/${u.id}/delete" onsubmit="return confirm('Delete ${esc(u.username)} and all their caught data?')"><button class="btn btn-sm btn-danger" type="submit" title="Delete account"><i class="bi bi-trash3"></i></button></form>`}
        </div>
      </td>
    </tr>`).join('');

  const dbStatsHtml = dbStats ? `
    <div class="stats" style="margin-top:10px">
      <div class="stat"><div class="n"><i class="bi bi-collection-fill"></i>${Number(dbStats.pokemon_count).toLocaleString()}</div><div class="l">Pokémon species</div></div>
      <div class="stat"><div class="n"><i class="bi bi-map-fill"></i>${Number(dbStats.encounter_count).toLocaleString()}</div><div class="l">Encounter records</div></div>
      <div class="stat"><div class="n"><i class="bi bi-check2-square"></i>${Number(dbStats.caught_count).toLocaleString()}</div><div class="l">Caught records</div></div>
      ${dbStats.schema_version ? `<div class="stat"><div class="n" style="font-size:18px">v${esc(dbStats.schema_version)}</div><div class="l">DB schema</div></div>` : ''}
    </div>` : '';

  const accountsContent = `
    <div class="stats">
      <div class="stat"><div class="n"><i class="bi bi-people-fill"></i>${total}</div><div class="l">Accounts</div></div>
      <div class="stat"><div class="n"><i class="bi bi-shield-lock-fill"></i>${admins}</div><div class="l">Admins</div></div>
      <div class="stat"><div class="n"><i class="bi bi-shield-check"></i>${sso}</div><div class="l">SSO</div></div>
      <div class="stat"><div class="n"><i class="bi bi-slash-circle"></i>${disabled}</div><div class="l">Disabled</div></div>
    </div>
    ${dbStatsHtml}

    <div class="card" style="margin-top:14px">
      <div class="card-head">
        <div class="ico"><i class="bi bi-person-plus-fill"></i></div>
        <div>
          <h2>Create account</h2>
          <div class="sub">New users are created here — there is no public sign-up.</div>
        </div>
      </div>
      <form method="post" action="/admin/users">
        <div class="row">
          <div><label>Username</label><input type="text" name="username" placeholder="trainer" required></div>
          <div><label>Email <span style="text-transform:none;color:#3a4a63;font-weight:500">(optional)</span></label><input type="email" name="email" placeholder="you@example.com"></div>
        </div>
        <div class="row" style="margin-top:4px">
          <div><label>Password</label><input type="password" name="password" placeholder="At least 4 characters" required></div>
          <div>
            <label>Role</label>
            <div class="seg">
              <label><input type="radio" name="is_admin" value="false" checked><span>User</span></label>
              <label><input type="radio" name="is_admin" value="true"><span>Admin</span></label>
            </div>
          </div>
        </div>
        <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-person-plus"></i>Create account</button></div>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-people-fill"></i></div>
        <div>
          <h2>Accounts</h2>
          <div class="sub">${total} ${total === 1 ? 'account' : 'accounts'} total.</div>
        </div>
      </div>
      <div id="admin-import-msg" style="display:none;margin:8px 0 0;padding:8px 12px;border-radius:6px;font-size:13px;background:rgba(100,180,100,.12);color:#7ecb7e;border:1px solid rgba(100,180,100,.25)"></div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>User</th><th class="col-src">Source</th><th>Role</th><th>Caught</th><th class="col-login">Last login</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <script>
      function promptPw(form){var p=prompt('New password for this user:');if(!p)return false;form.password.value=p;return true;}
      function adminRunImport(userId, fmt) {
        var input = document.getElementById('ai-' + fmt + '-' + userId);
        input.value = '';
        input.onchange = function() {
          var file = input.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(e) {
            var url = '/admin/users/' + userId + '/import-caught';
            fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: e.target.result })
              .then(function(r) { return r.json(); })
              .then(function(d) {
                var msg = d.error || '';
                if (!msg) {
                  var parts = [];
                  if (d.imported) parts.push(d.imported.toLocaleString() + ' imported');
                  if (d.shinyImported) parts.push(d.shinyImported.toLocaleString() + ' shiny imported');
                  if (d.skipped) parts.push(d.skipped.toLocaleString() + ' skipped');
                  msg = parts.join(', ') || 'Done (nothing new)';
                  if (d.errors && d.errors.length) msg += ' — ' + d.errors[0];
                }
                var notice = document.getElementById('admin-import-msg');
                notice.textContent = msg;
                notice.style.display = '';
                setTimeout(function() { notice.style.display = 'none'; }, 8000);
              })
              .catch(function(err) { alert('Import failed: ' + err.message); });
          };
          input.click();
        };
        input.click();
      }
    </script>`;

  // ── Authentication sub-tab ────────────────────────────────────────────────
  const modeLine = !auth.enabled
    ? '<i class="bi bi-unlock"></i> Auth is <strong style="color:#ff9d9d">disabled</strong> (AUTH_ENABLED=false) — the site runs without a login wall.'
    : `<i class="bi bi-toggles"></i> Local sign-in: <strong style="color:${auth.localEnabled ? '#5fd58a' : '#ff9d9d'}">${auth.localEnabled ? 'on' : 'off'}</strong> &nbsp;·&nbsp; SSO/OIDC: <strong style="color:${auth.oidcEnabled ? '#5fd58a' : '#ff9d9d'}">${auth.oidcEnabled ? 'on' : 'off'}</strong>`;

  const o = auth.oidc || {};
  const secretSet  = Boolean(o.clientSecret);
  const configured = typeof auth.oidcConfigured === 'function' ? auth.oidcConfigured() : Boolean(o.issuer && o.clientId && o.redirectUri);
  const onPill  = (on) => on
    ? '<span class="pill pill-admin"><i class="bi bi-check-circle"></i> enabled</span>'
    : '<span class="pill pill-user">disabled</span>';
  const redirectVal = o.redirectUri || suggestedRedirect;

  const authContent = `
    <div class="lead" style="font-size:13px;color:#546070;margin-bottom:16px">${modeLine}</div>
    ${!auth.enabled ? '<div class="msg msg-err"><i class="bi bi-unlock"></i>The login wall is off (AUTH_ENABLED=false in the environment). These settings have no effect until it is turned back on.</div>' : ''}

    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-person-badge-fill"></i></div>
        <div>
          <h2>Local sign-in &nbsp;${onPill(auth.localEnabled)}</h2>
          <div class="sub">Username &amp; password accounts created on this site.</div>
        </div>
      </div>
      <form method="post" action="/admin/auth/local">
        <div class="seg" style="max-width:320px">
          <label><input type="radio" name="local_enabled" value="true"${auth.localEnabled ? ' checked' : ''}><span>Enabled</span></label>
          <label><input type="radio" name="local_enabled" value="false"${auth.localEnabled ? '' : ' checked'}><span>Disabled</span></label>
        </div>
        <div class="field-hint">You can only turn this off once OIDC is enabled and configured, so there's always a way in.</div>
        <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check-lg"></i>Save</button></div>
      </form>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="ico"><i class="bi bi-shield-lock-fill"></i></div>
        <div>
          <h2>OIDC / SSO &nbsp;${onPill(auth.oidcEnabled)} ${configured ? '' : '<span class="pill pill-off">not configured</span>'}</h2>
          <div class="sub">Single sign-on via Authentik or any OpenID Connect provider.</div>
        </div>
      </div>
      ${!oidcLib ? '<div class="msg msg-err"><i class="bi bi-exclamation-triangle-fill"></i>The <code>openid-client</code> package is not installed in the running container. Run <code>npm install</code> in <code>web/</code> (it is listed in package.json) and restart before enabling.</div>' : ''}
      <form method="post" action="/admin/auth/oidc">
        <label>Status</label>
        <div class="seg" style="max-width:320px">
          <label><input type="radio" name="oidc_enabled" value="true"${auth.oidcEnabled ? ' checked' : ''}><span>Enabled</span></label>
          <label><input type="radio" name="oidc_enabled" value="false"${auth.oidcEnabled ? '' : ' checked'}><span>Disabled</span></label>
        </div>
        <div class="row" style="margin-top:4px">
          <div><label>Button label</label><input type="text" name="label" value="${esc(o.label || 'Authentik')}" placeholder="Authentik"></div>
          <div><label>Client ID</label><input type="text" name="client_id" value="${esc(o.clientId || '')}" placeholder="from your provider"></div>
        </div>
        <label>Issuer URL</label>
        <input type="text" name="issuer" value="${esc(o.issuer || '')}" placeholder="https://authentik.example.com/application/o/pokedex/">
        <label>Client secret</label>
        <input type="password" name="client_secret" autocomplete="new-password" placeholder="${secretSet ? '•••••••• (saved — leave blank to keep)' : 'optional for public clients'}">
        <label>Redirect URI</label>
        <input type="text" name="redirect_uri" value="${esc(redirectVal)}" placeholder="${esc(suggestedRedirect)}">
        <div class="field-hint">Register this exact URL as the redirect/callback URI in your provider.${suggestedRedirect ? ` Suggested: <code>${esc(suggestedRedirect)}</code>` : ''}</div>
        <div class="form-actions">
          <button class="btn" type="submit"><i class="bi bi-check-lg"></i>Save OIDC settings</button>
        </div>
      </form>
      <form method="post" action="/admin/auth/oidc/test" style="margin-top:2px">
        <button class="btn btn-ghost btn-sm" type="submit"${configured && oidcLib ? '' : ' disabled style="opacity:.5;cursor:not-allowed"'}><i class="bi bi-plug"></i>Test connection</button>
        <span class="field-hint" style="margin-left:8px">Runs provider discovery against the saved Issuer.</span>
      </form>
    </div>`;

  const subContent = activeSub === 'authentication' ? authContent
    : activeSub === 'scrapers' ? scraperSectionHtml()
    : accountsContent;

  return `
    ${notice ? `<div class="msg msg-ok"><i class="bi bi-check-circle-fill"></i>${esc(notice)}</div>` : ''}
    ${error ? `<div class="msg msg-err"><i class="bi bi-exclamation-triangle-fill"></i>${esc(error)}</div>` : ''}
    ${subTabBar}
    ${subContent}`;
}

// ── Landing page (unauthenticated visitors) ────────────────────────────────
function landingPage({ localEnabled, oidcEnabled, oidcLabel = 'Authentik' } = {}) {
  const hasSignIn = localEnabled || oidcEnabled;
  const features = [
    { icon: 'bi-controller',          color: '#4a7fff', title: 'Every Game',         desc: 'Covers every main-series game from Red & Blue all the way to Scarlet & Violet, plus Legends: Arceus and Z-A.' },
    { icon: 'bi-geo-alt-fill',        color: '#f0a03a', title: 'Wild Encounters',    desc: 'See exactly where to find each Pokémon in each game — location, encounter method, level range, and rate.' },
    { icon: 'bi-check2-circle',       color: '#3dc971', title: 'Track Progress',     desc: 'Mark Pokémon as caught per game. Progress is saved per-player so multiple trainers can share one server.' },
    { icon: 'bi-diagram-3-fill',      color: '#b197fc', title: 'Evolution Chains',   desc: 'Tap any Pokémon to see its full evolution tree with methods, items, held items, and conditions.' },
    { icon: 'bi-map-fill',            color: '#5fc7d6', title: 'Regional Dexes',     desc: 'Browse Pokémon by region — Kanto through Paldea — with correct regional Pokédex numbering.' },
    { icon: 'bi-shield-check',        color: '#fac000', title: 'Trade Exclusives',   desc: 'Game-exclusive Pokémon are clearly flagged with which version you need to trade from to complete the dex.' },
  ];
  const featureCards = features.map(f => `
    <div style="background:linear-gradient(160deg,#0d1628,#0a1120);border:1px solid #182035;border-radius:14px;padding:20px 18px">
      <div style="width:36px;height:36px;border-radius:9px;background:${f.color}1a;border:1px solid ${f.color}40;display:flex;align-items:center;justify-content:center;margin-bottom:12px">
        <i class="bi ${f.icon}" style="font-size:16px;color:${f.color}"></i>
      </div>
      <div style="font-size:13px;font-weight:700;color:#e6edf3;margin-bottom:5px">${f.title}</div>
      <div style="font-size:12px;color:#546070;line-height:1.65">${f.desc}</div>
    </div>`).join('');

  const generationPills = ['Gen I','Gen II','Gen III','Gen IV','Gen V','Gen VI','Gen VII','Gen VIII','Gen IX','Legends'].map(g =>
    `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;background:#0c1628;border:1px solid #182035;color:#7a8ea8">${g}</span>`
  ).join('');

  const cta = hasSignIn
    ? `<a href="/auth/login" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 32px;border-radius:10px;border:1px solid #1a3898;background:linear-gradient(135deg,#143087,#0d1e5c);color:#bcd4ff;font-size:15px;font-weight:700;text-decoration:none;box-shadow:0 6px 24px -10px rgba(74,127,255,.9);transition:filter .12s" onmouseover="this.style.filter='brightness(1.15)'" onmouseout="this.style.filter=''"><i class="bi bi-box-arrow-in-right" style="font-size:17px"></i>Sign in to your account</a>`
    : `<div style="color:#546070;font-size:13px">Contact the administrator to get access.</div>`;

  const body = `
  <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 20px 80px">
    <div style="max-width:760px;width:100%;text-align:center">
      <img src="/favicon.svg" alt="" width="68" height="68"
           style="display:inline-block;margin-bottom:24px;filter:drop-shadow(0 8px 28px -8px rgba(74,127,255,.7))">
      <h1 style="font-size:42px;font-weight:800;letter-spacing:-.8px;margin-bottom:14px;
                 background:linear-gradient(90deg,#6eb5ff,#b197fc);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">
        Living Pokédex
      </h1>
      <p style="font-size:16px;color:#546070;line-height:1.7;max-width:520px;margin:0 auto 18px">
        Track every Pokémon you've caught across every game, from Red & Blue to Scarlet & Violet.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:40px">
        ${generationPills}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:48px;text-align:left">
        ${featureCards}
      </div>

      ${cta}
    </div>
  </div>`;
  return shell('Welcome', body, { showNav: false, bare: true });
}

// ── Dashboard (authenticated users) ───────────────────────────────────────
function dashboardPage(user, games, nationalTotal, regions, dexTotals = new Map(), recommendedCatch = null, shinyHunt = null, recentlyCaught = [], recentlyShinyCaught = [], leaderboard = []) {
  // games: [{ id, name, game_group, generation, color, caught, dexUrl }]
  // Includes DLC games (DLC_GROUPS) and HOME games.

  const isHome = (gg) => gg === 'HOME' || gg.startsWith('HOME_');

  const dlcGames  = games.filter(g => DLC_GROUPS.has(g.game_group));
  const mainGames = games.filter(g => !DLC_GROUPS.has(g.game_group) && !isHome(g.game_group));

  // ── Stats ───────────────────────────────────────────────────────────
  const totalCaught    = games.reduce((s, g) => s + g.caught, 0);
  const livingDexGame  = games.find(g => g.game_group === 'HOME' && g.name !== 'Shiny Dex');
  const homeCaught     = livingDexGame?.caught ?? 0;
  const livingDexUrl   = livingDexGame?.dexUrl ?? '/dex';
  const overallPct     = nationalTotal > 0 ? Math.min(100, Math.round(homeCaught / nationalTotal * 100)) : 0;

  function gameDexTotal(g) {
    const dexKey = GROUP_DEX_KEY[g.game_group];
    return dexKey ? (dexTotals.get(dexKey) ?? nationalTotal) : nationalTotal;
  }

  // DLC games for a base game (e.g., "Scarlet" → [S-Kitakami, S-Blueberry])
  const SIDE_PREFIX = { Sword: 'SW', Shield: 'SH', Scarlet: 'S', Violet: 'V' };
  function getDlcForBase(baseGame) {
    const side = SIDE_PREFIX[baseGame.name];
    if (!side) return [];
    return dlcGames.filter(d =>
      DISPLAY_GROUP[d.game_group] === baseGame.game_group &&
      d.name.startsWith(side + ' -')
    );
  }

  // A game is fully complete when the base AND every DLC have no Pokémon left.
  function isFullyComplete(g) {
    if (g.caught < gameDexTotal(g)) return false;
    return getDlcForBase(g).every(dlc => dlc.caught >= gameDexTotal(dlc));
  }

  // Games in progress: has catches and is not yet fully complete, sorted by most recently caught, capped at 6
  const inProgressGames = mainGames
    .filter(g => g.caught > 0 && !isFullyComplete(g))
    .sort((a, b) => {
      const ta = a.lastCaughtAt ? new Date(a.lastCaughtAt).getTime() : 0;
      const tb = b.lastCaughtAt ? new Date(b.lastCaughtAt).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 6);

  const activeGames = mainGames.filter(g => g.caught > 0).length;

  // ── Render: individual game card with optional DLC sub-bars ─────────
  const gameCard = (g) => {
    const gameTotal  = gameDexTotal(g);
    const fillPct    = gameTotal > 0 ? Math.min(100, g.caught / gameTotal * 100) : 0;
    const basePctStr = gameTotal > 0 ? Math.min(100, g.caught / gameTotal * 100).toFixed(2) + '%' : '0.00%';
    const c    = g.color;
    const dlcs = getDlcForBase(g);
    const dlcData = dlcs.map(dlc => {
      const dlcTotal   = gameDexTotal(dlc);
      const dlcFillPct = dlcTotal > 0 ? Math.min(100, dlc.caught / dlcTotal * 100) : 0;
      const dlcPctStr  = dlcTotal > 0 ? Math.min(100, dlc.caught / dlcTotal * 100).toFixed(2) + '%' : '0.00%';
      return { dlcFillPct, dlcPctStr, label: GROUP_LABELS[dlc.game_group] ?? dlc.game_group, caught: dlc.caught, total: dlcTotal };
    });
    const totalCaughtAll   = Math.min(g.caught, gameTotal) + dlcData.reduce((s, d) => s + Math.min(d.caught, d.total), 0);
    const totalPossibleAll = gameTotal + dlcData.reduce((s, d) => s + d.total, 0);
    const overallPctStr    = totalPossibleAll > 0 ? Math.min(100, totalCaughtAll / totalPossibleAll * 100).toFixed(2) + '%' : '0.00%';
    const dlcBarsHtml = dlcData.map(({ dlcFillPct, dlcPctStr, label }) =>
      `<div style="margin-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
          <span style="font-size:8px;color:#364560;font-weight:600;letter-spacing:.3px">${esc(label)}</span>
          <span style="font-size:8px;color:#364560">${dlcPctStr}</span>
        </div>
        <div style="height:2px;background:#0a1322;border-radius:1px;overflow:hidden">
          <div style="width:${dlcFillPct}%;height:100%;background:${c}99;border-radius:1px"></div>
        </div>
      </div>`
    ).join('');
    return `<a href="${esc(g.dexUrl)}"
      style="display:block;background:linear-gradient(160deg,${c}0d,#0a1020);border:1px solid ${c}3a;border-top:2px solid ${c};border-radius:10px;padding:14px 15px;text-decoration:none;transition:border-color .15s,box-shadow .15s"
      onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.3)';this.style.borderColor='${c}80'"
      onmouseout="this.style.boxShadow='';this.style.borderColor='${c}3a'">
      <div style="font-size:11px;font-weight:700;color:${c};line-height:1.35">${esc(g.name)}</div>
      <div style="font-size:19px;font-weight:800;color:#e6edf3;margin:7px 0 8px;line-height:1">${overallPctStr}<span style="font-size:10px;color:#46566f;font-weight:500"> overall</span></div>
      <div style="height:3px;background:#0a1322;border-radius:2px;overflow:hidden"><div style="width:${fillPct}%;height:100%;background:${c};border-radius:2px"></div></div>
      <div style="font-size:9px;color:#46566f;margin-top:4px;font-weight:600">${basePctStr} base</div>
      ${dlcBarsHtml}
    </a>`;
  };

  // ── Render: stat chip ────────────────────────────────────────────────
  const chip = (icon, value, label, color) => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;background:linear-gradient(160deg,#0d1628,#0a1120);border:1px solid #182035;border-radius:12px;flex:1;min-width:130px">
      <i class="bi ${icon}" style="font-size:22px;color:${color};opacity:.85;flex-shrink:0"></i>
      <div>
        <div style="font-size:22px;font-weight:800;color:#e6edf3;line-height:1">${value}</div>
        <div style="font-size:10px;color:#546070;font-weight:700;margin-top:4px;text-transform:uppercase;letter-spacing:.5px">${label}</div>
      </div>
    </div>`;

  // ── Render: leaderboard ──────────────────────────────────────────────
  const MEDAL = ['#f5c842', '#c0c0c0', '#cd7f32'];
  const leaderboardHtml = (() => {
    if (leaderboard.length === 0) return '';

    const playerRow = (p, rank, caught, total, barColor, medal, showPct) => {
      const isMe = p.id === user.id;
      const initials = (p.display_name || p.username).slice(0, 2).toUpperCase();
      const pct = total > 0 ? Math.min(100, Math.round(caught / total * 100)) : 0;
      const fillPct = showPct ? pct : (total > 0 ? Math.min(100, caught / total * 100) : 0);
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${isMe ? '#0d1628' : '#090e1c'};border:1px solid ${isMe ? '#4a7fff40' : '#182035'};border-radius:7px">
        <div style="font-size:11px;font-weight:800;color:${medal ?? '#364560'};width:16px;text-align:center;flex-shrink:0">${rank}</div>
        <div style="width:26px;height:26px;border-radius:50%;background:${barColor}22;border:1px solid ${barColor}55;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <span style="font-size:9px;font-weight:800;color:${barColor}">${esc(initials)}</span>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:${isMe ? '#e6edf3' : '#8a9ab4'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.display_name || p.username)}${isMe ? ' <span style="font-size:9px;color:#4a7fff;font-weight:500">(you)</span>' : ''}</div>
          <div style="margin-top:3px;height:3px;background:#0a1322;border-radius:2px;overflow:hidden">
            <div style="width:${fillPct}%;height:100%;background:${barColor};border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${showPct ? `<div style="font-size:12px;font-weight:800;color:${medal ?? (isMe ? '#7ab4ff' : '#364560')}">${pct}%</div>` : ''}
          <div style="font-size:9px;color:#364560;margin-top:1px">${caught.toLocaleString()}</div>
        </div>
      </div>`;
    };

    const makeColumn = (title, icon, iconColor, sortKey, total, showPct) => {
      const sorted = [...leaderboard].sort((a, b) => b[sortKey] - a[sortKey]);
      const effectiveTotal = total > 0 ? total : (sorted[0]?.[sortKey] ?? 1);
      const rowsHtml = sorted.map((p, i) => {
        const medal = MEDAL[i] ?? null;
        const barColor = medal ?? (p.id === user.id ? '#4a7fff' : '#2a4060');
        return playerRow(p, i + 1, p[sortKey], effectiveTotal, barColor, medal, showPct);
      }).join('');
      return `<div style="flex:1 0 130px;min-width:0;min-height:0;display:flex;flex-direction:column;background:#060c1a;border:1px solid #182035;border-radius:10px;padding:10px 10px 8px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;flex-shrink:0">
          <i class="bi ${icon}" style="font-size:13px;color:${iconColor}"></i>
          <span style="font-size:11px;font-weight:700;color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</span>
        </div>
        <div style="flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px">${rowsHtml}</div>
      </div>`;
    };

    const livingCol = makeColumn('Living Dex', 'bi-house-heart', '#4a7fff', 'home_caught', nationalTotal, true);
    const shinyCol  = makeColumn('Shiny Dex', 'bi-stars', '#f5c842', 'shiny_caught', nationalTotal, true);
    const gameCol   = makeColumn('Game Dexes', 'bi-controller', '#3dc971', 'game_caught', 0, false);

    return `<div class="dash-leaderboard" style="flex:1;min-height:0;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-shrink:0">
        <h3 style="font-size:13px;font-weight:700;color:#e6edf3;white-space:nowrap"><i class="bi bi-trophy" style="color:#f5c842;margin-right:5px"></i>Leaderboards</h3>
        <div style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></div>
      </div>
      <div style="flex:1;min-height:0;display:flex;gap:8px;overflow-x:auto">${livingCol}${shinyCol}${gameCol}</div>
    </div>`;
  })();

  // ── Render: games in progress ────────────────────────────────────────
  const inProgressHtml = inProgressGames.length
    ? `<div class="dash-games-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:8px;overflow-y:auto;align-content:start;max-height:185px">
        ${inProgressGames.map(gameCard).join('')}
      </div>`
    : `<div style="padding:20px;text-align:center;border:1px dashed #1a2a42;border-radius:10px;color:#364560;font-size:13px">
        Nothing in progress yet — open the <a href="/dex" style="color:#4a7fff">Living Dex</a> and start marking Pokémon as caught.
      </div>`;

  // ── Shared widget helpers ─────────────────────────────────────────────
  const typeBadgeHtml = (t) => t
    ? `<span style="display:inline-block;background:${TYPE_COLORS[t] ?? '#888'};color:#fff;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.3px">${esc(t)}</span>`
    : '';
  const locationRowsHtml = (locs) => locs.length
    ? locs.map(loc => `<div style="font-size:11px;color:#7a96b4;padding:5px 0;border-bottom:1px solid #0e1828;line-height:1.3">${esc(loc)}</div>`).join('')
    : `<div style="font-size:11px;color:#364560;font-style:italic;padding:6px 0">No wild encounters</div>`;
  const rerollBtn = (type) => `
    <button class="btn btn-ghost btn-sm" onclick="ldDoReroll(this,'${type}')"
      style="width:100%;gap:6px;font-size:11px;color:#546070;border-color:#182035">
      <i class="bi bi-arrow-clockwise"></i>Reroll
    </button>`;

  // ── Render: catch-next widget ─────────────────────────────────────────
  const catchWidget = (() => {
    if (!recommendedCatch) return '';
    const { pokemon: p, gameName, gameColor, gameUrl, locations = [] } = recommendedCatch;
    const num = String(p.pokedex_number).padStart(3, '0');
    const tc  = TYPE_COLORS[p.type1] ?? '#223152';
    return `
      <div data-widget="catch" class="dash-widget" style="flex-shrink:0;width:240px;display:flex;flex-direction:column;gap:8px">
        <a data-field="link" href="${esc(gameUrl)}" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;background:linear-gradient(160deg,${tc}14,#060c1a);border:1px solid ${tc}35;border-top:2px solid ${tc}70;border-radius:14px;padding:18px 16px 16px;text-decoration:none;transition:border-color .15s,box-shadow .15s;overflow:hidden"
          onmouseover="this.style.boxShadow='0 6px 28px ${tc}28';this.style.borderColor='${tc}60'"
          onmouseout="this.style.boxShadow='';this.style.borderColor='${tc}35'">
          <div data-field="header" style="font-size:9px;font-weight:700;color:${tc};text-transform:uppercase;letter-spacing:.9px;align-self:flex-start">Catch Next</div>
          <div data-field="glow" style="display:flex;align-items:center;justify-content:center;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,${tc}20,transparent 68%)">
            <img data-field="icon" src="${esc(p.icon_url ?? '')}" width="96" height="96" style="object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 3px 10px ${tc}70)">
          </div>
          <div style="text-align:center;width:100%">
            <div data-field="number" style="font-size:10px;color:#364560;font-weight:600;margin-bottom:3px">#${num}</div>
            <div data-field="name" style="font-size:17px;font-weight:800;color:#e6edf3;letter-spacing:-.3px;line-height:1.2">${esc(p.name)}</div>
            <div data-field="form" style="font-size:10px;color:#546070;margin-top:2px${p.form_name ? '' : ';display:none'}">${esc(p.form_name ?? '')}</div>
          </div>
          <div data-field="types" style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">${typeBadgeHtml(p.type1)}${typeBadgeHtml(p.type2)}</div>
          <div style="width:100%;border-top:1px solid #182035;padding-top:10px;flex:1;display:flex;flex-direction:column;min-height:0">
            <div data-field="game-chip" style="font-size:10px;font-weight:700;color:${gameColor};background:${gameColor}18;border:1px solid ${gameColor}28;border-radius:20px;padding:3px 10px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(gameName)}</div>
            <div style="font-size:9px;font-weight:700;color:#364560;text-transform:uppercase;letter-spacing:.6px;margin:10px 0 4px">Encounter Locations</div>
            <div data-field="locations" style="flex:1;overflow-y:auto;min-height:0">${locationRowsHtml(locations)}</div>
          </div>
        </a>
        ${rerollBtn('catch')}
      </div>`;
  })();

  // ── Render: shiny-hunt widget ─────────────────────────────────────────
  const SHINY_GOLD = '#f5c842';
  const shinyWidget = (() => {
    if (!shinyHunt) return '';
    const { pokemon: p, shinyIconUrl, locations = [] } = shinyHunt;
    const num = String(p.pokedex_number).padStart(3, '0');
    return `
      <div data-widget="shiny" class="dash-widget" style="flex-shrink:0;width:240px;display:flex;flex-direction:column;gap:8px">
        <a data-field="link" href="/dex" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;background:linear-gradient(160deg,${SHINY_GOLD}10,#060c1a);border:1px solid ${SHINY_GOLD}35;border-top:2px solid ${SHINY_GOLD}80;border-radius:14px;padding:18px 16px 16px;text-decoration:none;transition:border-color .15s,box-shadow .15s;overflow:hidden"
          onmouseover="this.style.boxShadow='0 6px 28px ${SHINY_GOLD}30';this.style.borderColor='${SHINY_GOLD}70'"
          onmouseout="this.style.boxShadow='';this.style.borderColor='${SHINY_GOLD}35'">
          <div style="font-size:9px;font-weight:700;color:${SHINY_GOLD};text-transform:uppercase;letter-spacing:.9px;align-self:flex-start">✦ Shiny Hunt</div>
          <div data-field="glow" style="display:flex;align-items:center;justify-content:center;width:100px;height:100px;border-radius:50%;background:radial-gradient(circle,${SHINY_GOLD}22,transparent 68%)">
            <img data-field="icon" src="${esc(shinyIconUrl)}" width="96" height="96" style="object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 3px 12px ${SHINY_GOLD}80)">
          </div>
          <div style="text-align:center;width:100%">
            <div data-field="number" style="font-size:10px;color:#364560;font-weight:600;margin-bottom:3px">#${num}</div>
            <div data-field="name" style="font-size:17px;font-weight:800;color:#e6edf3;letter-spacing:-.3px;line-height:1.2">${esc(p.name)}</div>
            <div data-field="form" style="font-size:10px;color:#546070;margin-top:2px${p.form_name ? '' : ';display:none'}">${esc(p.form_name ?? '')}</div>
          </div>
          <div data-field="types" style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">${typeBadgeHtml(p.type1)}${typeBadgeHtml(p.type2)}</div>
          <div style="width:100%;border-top:1px solid #182035;padding-top:10px;flex:1;display:flex;flex-direction:column;min-height:0">
            <div style="font-size:10px;font-weight:700;color:${SHINY_GOLD};background:${SHINY_GOLD}14;border:1px solid ${SHINY_GOLD}28;border-radius:20px;padding:3px 10px;text-align:center">Pokémon HOME Shiny Dex</div>
            <div style="font-size:9px;font-weight:700;color:#364560;text-transform:uppercase;letter-spacing:.6px;margin:10px 0 4px">Wild Encounters</div>
            <div data-field="locations" style="flex:1;overflow-y:auto;min-height:0">${locationRowsHtml(locations)}</div>
          </div>
        </a>
        ${rerollBtn('shiny')}
      </div>`;
  })();

  const widgetCount = (recommendedCatch ? 1 : 0) + (shinyHunt ? 1 : 0);
  const maxWidth = widgetCount === 2 ? '1620px' : widgetCount === 1 ? '1380px' : '1100px';

  const body = `
  <style>
    body { height:100vh !important; min-height:unset !important; overflow:hidden !important; display:flex !important; flex-direction:column !important; }
    @keyframes ld-spin{to{transform:rotate(360deg)}}.ld-spinning{animation:ld-spin .7s linear infinite;display:inline-block}
    @media(max-width:820px){
      body{height:auto !important;min-height:100vh !important;overflow-y:auto !important}
      .dash-outer{overflow:visible !important;flex:none !important;padding:12px 14px !important}
      .dash-row{flex-direction:column !important;gap:16px !important;align-items:stretch !important}
      .dash-widget{display:none !important}
      .dash-recent{display:none !important}
      .dash-main{overflow:visible !important;min-height:0 !important}
      .dash-games-grid{flex:none !important;overflow-y:visible !important}
    }
  </style>
  <div class="dash-outer" style="flex:1;min-height:0;overflow:hidden;padding:14px 24px;max-width:${maxWidth};margin:0 auto;width:100%;box-sizing:border-box;display:flex;flex-direction:column">
    <div class="dash-row" style="flex:1;min-height:0;display:flex;gap:28px;align-items:stretch">

      ${catchWidget}

      <div class="dash-main" style="flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:hidden">

        <!-- Hero -->
        <div style="position:relative;overflow:hidden;flex-shrink:0;padding:14px 20px;background:linear-gradient(135deg,#090f22 0%,#06101e 100%);border:1px solid #182035;border-radius:16px">
          <div style="position:absolute;top:-60px;right:-60px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(74,127,255,.05),transparent 70%);pointer-events:none"></div>
          <div style="position:absolute;bottom:-40px;right:80px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(163,112,247,.04),transparent 70%);pointer-events:none"></div>
          <h2 style="font-size:20px;font-weight:800;color:#e6edf3;letter-spacing:-.4px;margin-bottom:3px">Welcome back, ${esc(user.display_name || user.username)}!</h2>
          <p style="font-size:12px;color:#546070">Pick up where you left off, or start a new adventure.</p>
          ${homeCaught > 0 ? `
          <div style="margin-top:10px;max-width:500px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11px;color:#546070;font-weight:600">Living Dex Progress</span>
              <span style="font-size:12px;color:#7ab4ff;font-weight:700">${homeCaught.toLocaleString()} / ${nationalTotal.toLocaleString()} caught</span>
            </div>
            <div style="height:5px;background:#0a1322;border-radius:3px;overflow:hidden">
              <div style="width:${overallPct}%;height:100%;background:linear-gradient(90deg,#4a7fff,#a370f7);border-radius:3px"></div>
            </div>
            <div style="font-size:10px;color:#364560;margin-top:3px">${overallPct}% of the national dex complete</div>
          </div>` : ''}
          ${(activeGames > 0 || totalCaught > 0) ? `
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:10px">
            ${activeGames > 0 ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#0c1526;border:1px solid #182035;border-radius:20px;font-size:11px;color:#7a8ea8"><i class="bi bi-controller" style="font-size:11px;color:#4a7fff"></i>${activeGames} game${activeGames === 1 ? '' : 's'} active</span>` : ''}
            ${totalCaught > 0 ? `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#0c1526;border:1px solid #182035;border-radius:20px;font-size:11px;color:#7a8ea8"><i class="bi bi-check2-square" style="font-size:11px;color:#3dc971"></i>${totalCaught.toLocaleString()} catches</span>` : ''}
          </div>` : ''}
        </div>

        ${leaderboardHtml}

        <!-- Games in Progress -->
        <div style="flex-shrink:0;display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h3 style="font-size:13px;font-weight:700;color:#e6edf3;white-space:nowrap">Games in Progress</h3>
            <div style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></div>
            <a href="${livingDexUrl}" style="font-size:12px;color:#4a7fff;font-weight:600;text-decoration:none;white-space:nowrap">Living Dex →</a>
          </div>
          ${inProgressHtml}
        </div>

        <!-- Recently Caught + Shinies stacked -->
        <div class="dash-recent" style="flex-shrink:0;display:flex;flex-direction:column;gap:10px">

          <div style="flex:1;min-width:0">
            <div style="height:20px;display:flex;align-items:center;gap:10px;margin-bottom:7px">
              <h3 style="font-size:12px;font-weight:700;color:#e6edf3;white-space:nowrap;line-height:1">Recently Caught</h3>
              <div style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></div>
            </div>
            ${recentlyCaught.length ? `
            <div style="display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;height:185px;align-items:flex-start">
              ${recentlyCaught.map(r => {
                const num = String(r.pokedex_number).padStart(3, '0');
                const tc  = TYPE_COLORS[r.type1] ?? '#223152';
                return `<a href="/dex?game_id=${r.game_id}" style="flex-shrink:0;width:110px;height:165px;overflow:hidden;background:linear-gradient(160deg,${tc}10,#0a1020);border:1px solid ${tc}30;border-top:2px solid ${tc}60;border-radius:10px;padding:10px 8px 8px;text-align:center;text-decoration:none;display:block;transition:box-shadow .15s,border-color .15s" onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.35)';this.style.borderColor='${tc}70'" onmouseout="this.style.boxShadow='';this.style.borderColor='${tc}30'">
                  <img src="${esc(r.icon_url ?? '')}" width="64" height="64" style="object-fit:contain;display:block;margin:0 auto" loading="lazy">
                  <div style="font-size:9px;color:#364560;margin-top:3px;font-weight:500">#${num}</div>
                  <div style="font-size:11px;font-weight:700;color:#c9d1d9;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
                  <div style="font-size:10px;color:#4a7fff;margin-top:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.display_name || r.username)}</div>
                  <div style="font-size:9px;color:#546070;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((r.game_names ?? [])[0] ?? '')}</div>
                  <div style="font-size:8px;color:#364560;margin-top:2px">${fmtRelative(r.caught_at)}</div>
                </a>`;
              }).join('')}
            </div>` : `<div style="height:185px;display:flex;align-items:center;justify-content:center;border:1px dashed #1a2a42;border-radius:10px;color:#364560;font-size:12px">No Pokémon caught yet.</div>`}
          </div>

          <div style="flex:1;min-width:0">
            <div style="height:20px;display:flex;align-items:center;gap:10px;margin-bottom:7px">
              <h3 style="font-size:12px;font-weight:700;color:#e6edf3;white-space:nowrap;line-height:1">✦ Recently Caught Shinies</h3>
              <div style="flex:1;height:1px;background:linear-gradient(90deg,#182035,transparent)"></div>
            </div>
            ${recentlyShinyCaught.length ? `
            <div style="display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;height:185px;align-items:flex-start">
              ${recentlyShinyCaught.map(r => {
                const num      = String(r.pokedex_number).padStart(3, '0');
                const shinyUrl = (r.icon_url ?? '').replace('/normal/', '/shiny/');
                const GOLD     = '#f5c842';
                return `<a href="/dex?game_id=${r.game_id}" style="flex-shrink:0;width:110px;height:165px;overflow:hidden;background:linear-gradient(160deg,${GOLD}10,#0a1020);border:1px solid ${GOLD}30;border-top:2px solid ${GOLD}70;border-radius:10px;padding:10px 8px 8px;text-align:center;text-decoration:none;display:block;transition:box-shadow .15s,border-color .15s" onmouseover="this.style.boxShadow='0 4px 14px rgba(0,0,0,.35)';this.style.borderColor='${GOLD}90'" onmouseout="this.style.boxShadow='';this.style.borderColor='${GOLD}30'">
                  <img src="${esc(shinyUrl)}" width="64" height="64" style="object-fit:contain;display:block;margin:0 auto;filter:drop-shadow(0 2px 6px ${GOLD}60)" loading="lazy">
                  <div style="font-size:9px;color:#364560;margin-top:3px;font-weight:500">#${num}</div>
                  <div style="font-size:11px;font-weight:700;color:#c9d1d9;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
                  <div style="font-size:10px;color:${GOLD};margin-top:3px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.display_name || r.username)}</div>
                  <div style="font-size:9px;color:#546070;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.game_name ?? '')}</div>
                  <div style="font-size:8px;color:#364560;margin-top:2px">${fmtRelative(r.caught_at)}</div>
                </a>`;
              }).join('')}
            </div>` : `<div style="height:185px;display:flex;align-items:center;justify-content:center;border:1px dashed #1a2a42;border-radius:10px;color:#364560;font-size:12px">No shinies caught yet.</div>`}
          </div>

        </div>

      </div>

      ${shinyWidget}

    </div>
  </div>
  <script>(function(){
    var TC = ${JSON.stringify(TYPE_COLORS)};
    var GOLD = '${SHINY_GOLD}';

    function typeBadge(t) {
      if (!t) return '';
      return '<span style="display:inline-block;background:'+(TC[t]||'#888')+';color:#fff;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.3px">'+t+'</span>';
    }
    function locationRows(locs) {
      if (!locs || !locs.length) return '<div style="font-size:11px;color:#364560;font-style:italic;padding:6px 0">No wild encounters</div>';
      return locs.map(function(l){return '<div style="font-size:11px;color:#7a96b4;padding:5px 0;border-bottom:1px solid #0e1828;line-height:1.3">'+l+'</div>';}).join('');
    }
    function q(w,sel){return w.querySelector('[data-field="'+sel+'"]');}

    function applyToCatch(w, d) {
      var p = d.pokemon, tc = TC[p.type1]||'#223152';
      var num = String(p.pokedex_number).padStart(3,'0');
      var link = q(w,'link');
      link.href = d.gameUrl || '/dex';
      link.style.background = 'linear-gradient(160deg,'+tc+'14,#060c1a)';
      link.style.borderColor = tc+'35'; link.style.borderTopColor = tc+'70';
      link.onmouseover = function(){this.style.boxShadow='0 6px 28px '+tc+'28';this.style.borderColor=tc+'60';};
      link.onmouseout  = function(){this.style.boxShadow='';this.style.borderColor=tc+'35';};
      q(w,'header').style.color = tc;
      q(w,'glow').style.background = 'radial-gradient(circle,'+tc+'20,transparent 68%)';
      var img = q(w,'icon'); img.src = p.icon_url||''; img.style.filter='drop-shadow(0 3px 10px '+tc+'70)';
      q(w,'number').textContent = '#'+num;
      q(w,'name').textContent = p.name;
      var fe = q(w,'form'); fe.textContent = p.form_name||''; fe.style.display = p.form_name ? '' : 'none';
      q(w,'types').innerHTML = typeBadge(p.type1)+typeBadge(p.type2);
      var chip = q(w,'game-chip');
      chip.textContent = d.gameName||'';
      chip.style.color = d.gameColor||'#3dc971';
      chip.style.background = (d.gameColor||'#3dc971')+'18';
      chip.style.borderColor = (d.gameColor||'#3dc971')+'28';
      q(w,'locations').innerHTML = locationRows(d.locations);
    }

    function applyToShiny(w, d) {
      var p = d.pokemon;
      var num = String(p.pokedex_number).padStart(3,'0');
      var img = q(w,'icon'); img.src = d.shinyIconUrl||p.icon_url||'';
      q(w,'number').textContent = '#'+num;
      q(w,'name').textContent = p.name;
      var fe = q(w,'form'); fe.textContent = p.form_name||''; fe.style.display = p.form_name ? '' : 'none';
      q(w,'types').innerHTML = typeBadge(p.type1)+typeBadge(p.type2);
      q(w,'locations').innerHTML = locationRows(d.locations);
    }

    window.ldDoReroll = function(btn, type) {
      var w = document.querySelector('[data-widget="'+type+'"]');
      if (!w) return;
      btn.disabled = true;
      var icon = btn.querySelector('.bi');
      if (icon) icon.className = 'bi bi-arrow-clockwise ld-spinning';
      fetch('/api/suggestion/reroll', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({type: type})
      }).then(function(r){return r.json();}).then(function(d){
        if (type === 'catch') applyToCatch(w, d);
        else applyToShiny(w, d);
      }).catch(function(){}).finally(function(){
        btn.disabled = false;
        if (icon) icon.className = 'bi bi-arrow-clockwise';
      });
    };

    // Detect and persist user's timezone (used for midnight-reset logic)
    var storedTz = ${JSON.stringify(user.settings?.timezone ?? null)};
    var detectedTz = (typeof Intl !== 'undefined') ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    if (detectedTz && detectedTz !== storedTz) {
      fetch('/api/suggestion/timezone', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({timezone: detectedTz})
      });
    }

    // Hide leaderboard if it doesn't have enough vertical space to render usefully
    (function() {
      var lb = document.querySelector('.dash-leaderboard');
      if (!lb) return;
      var MIN_H = 150;
      function checkLeaderboard() {
        lb.style.display = '';
        void lb.offsetHeight; // force layout recalc
        if (lb.offsetHeight < MIN_H) lb.style.display = 'none';
      }
      checkLeaderboard();
      window.addEventListener('resize', checkLeaderboard);
    })();
  })();</script>`;

  return shell('Home', body, { user, active: 'home' });
}

// ── Encounter Location Browser page ──────────────────────────────────────────
function locationsPage(user) {
  const TC = JSON.stringify(TYPE_COLORS);
  const body = `
<div class="wrap">
  <div class="page-head" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1">
      <h2><i class="bi bi-pin-map-fill" style="font-size:20px;margin-right:8px;opacity:.8"></i>Encounter Location Browser</h2>
      <div class="lead">Browse and debug wild encounter data from all scrapers.</div>
    </div>
    <a href="/settings?tab=admin&adminSubtab=scrapers" class="btn btn-ghost btn-sm"><i class="bi bi-arrow-left"></i>Back to Scrapers</a>
  </div>
  ${bulbapediaCredit('margin-bottom:14px')}

  <div id="loc-root">
    <!-- View tabs + count -->
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #182035;flex-wrap:wrap">
      <button id="tab-loc" class="lp-vtab lp-vtab-on" onclick="lp.setView('location')">
        <i class="bi bi-pin-map"></i> By Location
      </button>
      <button id="tab-poke" class="lp-vtab" onclick="lp.setView('pokemon')">
        <i class="bi bi-circle-fill" style="font-size:10px"></i> By Pokémon
      </button>
      <span id="lp-count" style="margin-left:auto;font-size:12px;color:#364560"></span>
    </div>

    <!-- Filters row -->
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input id="lp-search" type="text" placeholder="Search location or Pokémon…"
          oninput="lp.setSearch(this.value)"
          style="padding:7px 12px;border-radius:7px;border:1px solid #1c2942;background:#070d18;color:#e6edf3;font-size:13px;outline:none;width:240px;transition:border-color .15s,box-shadow .15s">
        <div id="lp-sts-bar" style="display:flex;gap:4px;flex-wrap:wrap">
          <span style="font-size:11px;color:#364560">Loading…</span>
        </div>
      </div>
      <div id="lp-type-bar" style="display:flex;flex-wrap:wrap;gap:4px"></div>
      <div id="lp-grp-bar" style="display:flex;flex-wrap:wrap;gap:4px"></div>
    </div>

    <!-- Location view -->
    <div id="lp-loc-view" class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Location</th>
            <th>Group</th>
            <th title="Wild encounter data flag">Wild</th>
            <th title="Special / static encounter flag">Special</th>
            <th style="text-align:center">#</th>
            <th>Pokémon encountered</th>
          </tr>
        </thead>
        <tbody id="lp-loc-tbody">
          <tr><td colspan="6" style="text-align:center;color:#364560;padding:40px">Loading…</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Pokémon view -->
    <div id="lp-poke-view" class="table-wrap" style="display:none">
      <table>
        <thead>
          <tr>
            <th style="width:44px"></th>
            <th style="width:60px">#</th>
            <th>Pokémon</th>
            <th>Type</th>
            <th style="text-align:center">Locations</th>
            <th>Appears in</th>
          </tr>
        </thead>
        <tbody id="lp-poke-tbody">
          <tr><td colspan="6" style="text-align:center;color:#364560;padding:40px">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .lp-vtab{display:inline-flex;align-items:center;gap:6px;padding:7px 15px;border-radius:7px;border:1px solid #182035;
    background:#0c1526;color:#6b7a99;font-size:13px;font-weight:600;cursor:pointer;transition:background .12s,color .12s}
  .lp-vtab:hover{color:#c9d1d9;background:#0e1e33}
  .lp-vtab.lp-vtab-on{background:linear-gradient(135deg,#0e2260,#0a1848);border-color:#1a3898;color:#7ab4ff}
  .lp-grp{padding:3px 10px;border-radius:20px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:11px;font-weight:600;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
  .lp-grp:hover{background:#111e36;color:#9bb0c8}
  .lp-grp.on{background:linear-gradient(135deg,#0e2260,#0a1848);border-color:#1a3898;color:#7ab4ff}
  .lp-sts{padding:3px 10px;border-radius:20px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:11px;font-weight:600;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
  .lp-sts:hover{background:#111e36;color:#9bb0c8}
  .lp-sts.on{background:#0e1e30;border-color:#1a3060;color:#9bb0c8}
  .lp-type{padding:2px 9px;border-radius:20px;font-size:10px;font-weight:700;cursor:pointer;border:2px solid transparent;opacity:.45;transition:opacity .12s,box-shadow .12s}
  .lp-type:hover{opacity:.8}
  .lp-type.on{opacity:1;box-shadow:0 0 0 2px rgba(255,255,255,.2)}
  #lp-loc-tbody tr,#lp-poke-tbody tr{cursor:pointer}
  #lp-loc-tbody tr:hover td,#lp-poke-tbody tr:hover td{background:rgba(12,21,38,.55) !important}
  .lp-exp-row td{background:#060d1a !important}
  .lp-chip{display:inline-flex;align-items:center;gap:4px;margin:2px 3px;padding:3px 8px;
    background:#0c1526;border:1px solid #182035;border-radius:5px;font-size:11px;color:#9bb0c8;white-space:nowrap}
  .lp-chip .grp{color:#7ab4ff;font-size:9px;font-weight:700}
  .lp-chip .num{color:#364560;font-size:9px}
  #lp-search:focus{border-color:#2a4bd0;box-shadow:0 0 0 3px rgba(74,127,255,.14)}
</style>

<script>
(function(){
  'use strict';
  var TC = ${TC};
  var ALL_TYPES = ['Normal','Fire','Water','Electric','Grass','Ice','Fighting','Poison',
                   'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
  var GRP_ORDER = ['RBY','FRLG','LGPE','GSC','HGSS','RSE','ORAS','DPPT','BDSP',
                   'BW','BW2','XY','SM','USUM','SwSh','IoA','CT','PLA','LZA','SV','Kita','BB'];
  var BATCH = 500;

  var _data    = null;
  var _pokeMap = null;
  var _view    = 'location';
  var _group   = 'all';
  var _status  = 'all';
  var _type    = null;
  var _search  = '';
  var _exp     = null;

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function tb(t){
    if(!t) return '';
    var c=TC[t]||'#888';
    return '<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;color:#fff;background:'+c+';margin-right:2px">'+t+'</span>';
  }

  function wIcon(v){
    return v===true  ? '<span style="color:#5fd58a;font-weight:700">✓</span>'
         : v===false ? '<span style="color:#f05060;font-weight:700">✗</span>'
         : '<span style="color:#546070">—</span>';
  }

  function buildPokeMap(data){
    var m={};
    for(var i=0;i<data.length;i++){
      var loc=data[i];
      for(var j=0;j<loc.pokemon.length;j++){
        var p=loc.pokemon[j];
        if(!m[p.id]) m[p.id]={id:p.id,name:p.name,num:p.num,type1:p.type1,type2:p.type2,icon_url:p.icon_url,locs:[]};
        m[p.id].locs.push({name:loc.name,grp:loc.game_group});
      }
    }
    return m;
  }

  function locMatchType(loc){
    if(!_type) return true;
    for(var i=0;i<loc.pokemon.length;i++){
      var p=loc.pokemon[i];
      if(p.type1===_type||p.type2===_type) return true;
    }
    return false;
  }

  function filteredLocs(){
    return (_data||[]).filter(function(r){
      if(_group!=='all'&&r.game_group!==_group) return false;
      if(_status==='wild'&&r.enc_count===0) return false;
      if(_status==='no-wild'&&r.enc_count>0) return false;
      if(_status==='special'&&!r.has_static_data) return false;
      if(!locMatchType(r)) return false;
      if(_search){
        var q=_search.toLowerCase();
        if(r.name.toLowerCase().indexOf(q)>=0) return true;
        for(var i=0;i<r.pokemon.length;i++){
          if(r.pokemon[i].name.toLowerCase().indexOf(q)>=0) return true;
        }
        return false;
      }
      return true;
    });
  }

  function filteredPokes(){
    var all=_pokeMap?Object.values(_pokeMap):[];
    return all.filter(function(p){
      if(_type&&p.type1!==_type&&p.type2!==_type) return false;
      if(_group!=='all'){
        var hasGrp=false;
        for(var i=0;i<p.locs.length;i++){ if(p.locs[i].grp===_group){hasGrp=true;break;} }
        if(!hasGrp) return false;
      }
      if(_search){
        var q=_search.toLowerCase();
        if(p.name.toLowerCase().indexOf(q)>=0) return true;
        for(var i=0;i<p.locs.length;i++){
          if(p.locs[i].name.toLowerCase().indexOf(q)>=0) return true;
        }
        return false;
      }
      return true;
    }).sort(function(a,b){return a.num-b.num;});
  }

  function renderLocs(){
    var rows=filteredLocs();
    var tbody=document.getElementById('lp-loc-tbody');
    var cnt=document.getElementById('lp-count');
    if(!tbody) return;
    if(cnt) cnt.textContent=rows.length.toLocaleString()+' location'+(rows.length!==1?'s':'');
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#364560;padding:40px">No locations match your filters.</td></tr>';
      return;
    }
    var html='';
    var lim=Math.min(rows.length,BATCH);
    for(var i=0;i<lim;i++){
      var r=rows[i];
      var isE=_exp===r.id;
      var cc=r.enc_count>0?'<span style="font-weight:600;color:#7ab4ff">'+r.enc_count+'</span>':'<span style="color:#364560">0</span>';
      var pv='';
      if(r.pokemon.length>0){
        pv=r.pokemon.slice(0,5).map(function(p){return esc(p.name);}).join(', ');
        if(r.pokemon.length>5) pv+=' <span style="color:#364560">+'+(r.pokemon.length-5)+'</span>';
      }
      html+='<tr onclick="lp.toggle('+r.id+')" style="'+(isE?'background:#080f1c;':'')+'border-bottom:1px solid #0e1828">'
        +'<td style="font-size:12px;color:#c9d1d9">'+esc(r.name)+'</td>'
        +'<td style="font-size:11px;font-weight:700;color:#7ab4ff;white-space:nowrap">'+esc(r.game_group)+'</td>'
        +'<td style="text-align:center">'+wIcon(r.has_wild_data)+'</td>'
        +'<td style="text-align:center">'+wIcon(r.has_static_data)+'</td>'
        +'<td style="text-align:center;font-size:12px">'+cc+'</td>'
        +'<td style="font-size:11px;color:#8a9ab0;max-width:360px">'+pv+'</td>'
        +'</tr>';
      if(isE&&r.pokemon.length>0){
        var chips=r.pokemon.map(function(p){
          var img=p.icon_url?'<img src="'+esc(p.icon_url)+'" width="22" height="22" style="object-fit:contain;image-rendering:pixelated">':'';
          return '<span class="lp-chip">'+img+'<span class="num">#'+p.num+'</span>'+esc(p.name)+tb(p.type1)+tb(p.type2)+'</span>';
        }).join('');
        html+='<tr class="lp-exp-row"><td colspan="6" style="padding:8px 16px 14px 24px;border-bottom:1px solid #0e1828">'
          +'<div style="display:flex;flex-wrap:wrap">'+chips+'</div></td></tr>';
      }
    }
    if(rows.length>BATCH){
      html+='<tr><td colspan="6" style="text-align:center;padding:12px;color:#546070;font-size:12px">Showing first '+BATCH+' of '+rows.length+' — narrow your filters to see more.</td></tr>';
    }
    tbody.innerHTML=html;
  }

  function renderPokes(){
    var rows=filteredPokes();
    var tbody=document.getElementById('lp-poke-tbody');
    var cnt=document.getElementById('lp-count');
    if(!tbody) return;
    if(cnt) cnt.textContent=rows.length.toLocaleString()+' Pokémon';
    if(!rows.length){
      tbody.innerHTML='<tr><td colspan="6" style="text-align:center;color:#364560;padding:40px">No Pokémon match your filters.</td></tr>';
      return;
    }
    var html='';
    var lim=Math.min(rows.length,BATCH);
    for(var i=0;i<lim;i++){
      var p=rows[i];
      var isE=_exp===p.id;
      var num=String(p.num).padStart(3,'0');
      var spr=p.icon_url?'<img src="'+esc(p.icon_url)+'" width="32" height="32" style="object-fit:contain;image-rendering:pixelated">'
        :'<div style="width:32px;height:32px;background:#0c1526;border-radius:4px"></div>';
      // deduplicate locations
      var seen={},locs=[];
      for(var j=0;j<p.locs.length;j++){
        var k=p.locs[j].grp+'|'+p.locs[j].name;
        if(!seen[k]){seen[k]=true;locs.push(p.locs[j]);}
      }
      // filter locs by current group
      if(_group!=='all') locs=locs.filter(function(l){return l.grp===_group;});
      var pv=locs.slice(0,3).map(function(l){return esc(l.name);}).join(', ');
      if(locs.length>3) pv+=' <span style="color:#364560">+'+(locs.length-3)+'</span>';
      html+='<tr data-pid="'+esc(p.id)+'" onclick="lp.toggle(this.dataset.pid)" style="'+(isE?'background:#080f1c;':'')+'border-bottom:1px solid #0e1828">'
        +'<td style="padding:6px 10px">'+spr+'</td>'
        +'<td style="color:#364560;font-size:11px;white-space:nowrap">#'+num+'</td>'
        +'<td style="font-weight:600;color:#c9d1d9">'+esc(p.name)+'</td>'
        +'<td>'+tb(p.type1)+tb(p.type2)+'</td>'
        +'<td style="text-align:center;font-weight:600;color:#7ab4ff">'+locs.length+'</td>'
        +'<td style="font-size:11px;color:#8a9ab0;max-width:340px">'+pv+'</td>'
        +'</tr>';
      if(isE&&locs.length>0){
        var chips=locs.map(function(l){
          return '<span class="lp-chip"><span class="grp">'+esc(l.grp)+'</span>'+esc(l.name)+'</span>';
        }).join('');
        html+='<tr class="lp-exp-row"><td colspan="6" style="padding:8px 16px 14px 24px;border-bottom:1px solid #0e1828">'
          +'<div style="display:flex;flex-wrap:wrap">'+chips+'</div></td></tr>';
      }
    }
    if(rows.length>BATCH){
      html+='<tr><td colspan="6" style="text-align:center;padding:12px;color:#546070;font-size:12px">Showing first '+BATCH+' of '+rows.length+' — narrow your filters.</td></tr>';
    }
    tbody.innerHTML=html;
  }

  function render(){
    if(_view==='location') renderLocs(); else renderPokes();
  }

  function buildBars(data){
    // Group bar
    var seen={},groups=[];
    for(var i=0;i<data.length;i++){var g=data[i].game_group;if(!seen[g]){groups.push(g);seen[g]=true;}}
    groups.sort(function(a,b){var ai=GRP_ORDER.indexOf(a),bi=GRP_ORDER.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi);});
    var gb=document.getElementById('lp-grp-bar');
    if(gb){
      gb.innerHTML='<button class="lp-grp on" data-grp="all" onclick="lp.setGroup(this.dataset.grp,this)">All ('+data.length+')</button>'
        +groups.map(function(g){
          var c=data.filter(function(r){return r.game_group===g;}).length;
          return '<button class="lp-grp" data-grp="'+g+'" onclick="lp.setGroup(this.dataset.grp,this)">'+g+' <span style="opacity:.6">('+c+')</span></button>';
        }).join('');
    }
    // Status bar
    var wc=data.filter(function(r){return r.enc_count>0;}).length;
    var nc=data.filter(function(r){return r.enc_count===0;}).length;
    var sc=data.filter(function(r){return r.has_static_data===true;}).length;
    var sb=document.getElementById('lp-sts-bar');
    if(sb){
      sb.innerHTML='<button class="lp-sts on" data-sts="all" onclick="lp.setStatus(this.dataset.sts,this)">All ('+data.length+')</button>'
        +'<button class="lp-sts" data-sts="wild" onclick="lp.setStatus(this.dataset.sts,this)"><span style="color:#5fd58a">✓</span> Has enc. ('+wc+')</button>'
        +'<button class="lp-sts" data-sts="no-wild" onclick="lp.setStatus(this.dataset.sts,this)"><span style="color:#f05060">✗</span> No enc. ('+nc+')</button>'
        +'<button class="lp-sts" data-sts="special" onclick="lp.setStatus(this.dataset.sts,this)"><span style="color:#f0c040">✓</span> Special ('+sc+')</button>';
    }
    // Type bar
    var tb2=document.getElementById('lp-type-bar');
    if(tb2){
      tb2.innerHTML='<span style="font-size:10px;color:#364560;font-weight:700;text-transform:uppercase;letter-spacing:.4px;align-self:center;margin-right:2px">Type:</span>'
        +ALL_TYPES.map(function(t){
          var bg=TC[t]||'#888';
          return '<button class="lp-type" data-type="'+t+'" onclick="lp.setType(this.dataset.type,this)"'
            +' style="color:#fff;background:'+bg+';border-color:'+bg+'">'+t+'</button>';
        }).join('');
    }
  }

  window.lp = {
    setView: function(v){
      _view=v; _exp=null;
      document.getElementById('lp-loc-view').style.display=v==='location'?'':'none';
      document.getElementById('lp-poke-view').style.display=v==='pokemon'?'':'none';
      document.querySelectorAll('.lp-vtab').forEach(function(b){b.classList.remove('lp-vtab-on');});
      var t=document.getElementById(v==='location'?'tab-loc':'tab-poke');
      if(t) t.classList.add('lp-vtab-on');
      render();
    },
    setGroup: function(g,el){
      _group=g; _exp=null;
      document.querySelectorAll('.lp-grp').forEach(function(b){b.classList.remove('on');});
      if(el) el.classList.add('on');
      render();
    },
    setStatus: function(s,el){
      _status=s; _exp=null;
      document.querySelectorAll('.lp-sts').forEach(function(b){b.classList.remove('on');});
      if(el) el.classList.add('on');
      render();
    },
    setType: function(t,el){
      _type=(_type===t)?null:t; _exp=null;
      document.querySelectorAll('.lp-type').forEach(function(b){b.classList.remove('on');});
      if(_type&&el) el.classList.add('on');
      render();
    },
    setSearch: function(v){ _search=v; _exp=null; render(); },
    toggle: function(id){ _exp=(_exp===id)?null:id; render(); },
  };

  fetch('/admin/scraper/locations-table')
    .then(function(r){return r.json();})
    .then(function(data){
      if(!Array.isArray(data)) throw new Error((data&&data.error)||'Bad response');
      _data=data;
      _pokeMap=buildPokeMap(data);
      buildBars(data);
      render();
    })
    .catch(function(e){
      var msg='<tr><td colspan="6" style="color:#f05060;padding:32px">Error: '+e.message+'</td></tr>';
      var b1=document.getElementById('lp-loc-tbody');
      var b2=document.getElementById('lp-poke-tbody');
      if(b1) b1.innerHTML=msg;
      if(b2) b2.innerHTML=msg;
    });
})();
</script>`;

  return shell('Locations', body, { user, active: 'settings' });
}

function staticEncountersPage(user, { embed = false } = {}) {
  const GL = JSON.stringify(GROUP_LABELS);
  const body = `
<div class="wrap">
  <div class="page-head" style="margin-bottom:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
    <div style="flex:1">
      <h2><i class="bi bi-shield-fill-exclamation" style="font-size:20px;margin-right:8px;opacity:.8;color:#a370f7"></i>Static &amp; Special Encounters</h2>
      <div class="lead">All gifts, legendaries, fossils, roaming Pokémon and story catches — per game and requirements.</div>
    </div>
  </div>
  ${bulbapediaCredit('margin-bottom:16px')}

  <div class="card" style="padding:16px 20px 20px">
    <!-- Controls row -->
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input id="se-search" type="text" placeholder="Search Pokémon, location or group…"
        oninput="se.filter()"
        style="padding:7px 12px;border-radius:7px;border:1px solid #1c2942;background:#070d18;color:#e6edf3;font-size:13px;outline:none;width:260px;flex-shrink:0;transition:border-color .15s">
      <div id="se-method-bar" style="display:flex;flex-wrap:wrap;gap:4px;flex:1"></div>
      <span id="se-count" style="font-size:11px;color:#364560;white-space:nowrap;margin-left:auto"></span>
    </div>
    <!-- Group tabs -->
    <div id="se-group-bar" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid #0e1828">
      <span style="font-size:11px;color:#364560">Loading…</span>
    </div>
    <!-- Table -->
    <div style="overflow-x:auto">
      <table id="se-table" style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:#040b18">
            <th style="padding:8px 10px;text-align:left;color:#546070;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;border-bottom:1px solid #0e1828">Pokémon</th>
            <th style="padding:8px 10px;text-align:left;color:#546070;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #0e1828">Location</th>
            <th style="padding:8px 10px;text-align:left;color:#546070;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap;border-bottom:1px solid #0e1828">Method</th>
            <th style="padding:8px 6px;text-align:center;color:#546070;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #0e1828">Lv</th>
            <th style="padding:8px 10px;text-align:left;color:#546070;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #0e1828">Versions</th>
            <th style="padding:8px 10px;text-align:left;color:#546070;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #0e1828">Requirements &amp; Notes</th>
          </tr>
        </thead>
        <tbody id="se-tbody">
          <tr><td colspan="6" style="padding:32px;text-align:center;color:#364560">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  #se-table tbody tr:hover { background: #090f1e; }
  .se-tab { padding:4px 12px;border-radius:20px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:11px;font-weight:600;cursor:pointer;transition:background .12s,color .12s,border-color .12s }
  .se-tab:hover { background:#111e36;color:#9bb0c8 }
  .se-tab.on { background:linear-gradient(135deg,#1e0e40,#140a30);border-color:#6a3aac;color:#a370f7 }
  .se-mtab { padding:3px 10px;border-radius:20px;border:1px solid #182035;background:#0c1526;color:#6b7a99;font-size:10px;font-weight:600;cursor:pointer;transition:background .12s,color .12s,border-color .12s }
  .se-mtab:hover { background:#111e36 }
  .se-mtab.on { border-color:var(--mc);color:var(--mc);background:rgba(0,0,0,.3) }
  .se-req { font-size:11px;color:#8a9ab0;line-height:1.45 }
  .se-req .tag { display:inline-block;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:700;margin-right:3px;margin-bottom:2px;vertical-align:middle }
  .se-req .tag-post { background:#2a1800;color:#f0a040;border:1px solid #3a2000 }
  .se-req .tag-event { background:#2a0010;color:#f06070;border:1px solid #3a0018 }
  .se-req .tag-shiny { background:#1a1600;color:#ffd700;border:1px solid #2a2200 }
  .se-req .tag-roam { background:#1a0a00;color:#f07060;border:1px solid #2a1000 }
  .se-req .tag-day { background:#001828;color:#80c0f0;border:1px solid #002838 }
  .se-note { font-size:10px;color:#546070;margin-top:2px }
</style>

<script>
(function(){
  var GL = ${GL};
  var MC = { special:'#7ab4ff', unique:'#f0c040', gift:'#60d070', egg:'#80c0f0',
             fossil:'#b0a060', wanderer:'#f07060', 'mega-stone':'#c080e0' };
  var METHODS = ['special','unique','gift','egg','fossil','wanderer','mega-stone'];
  var ALL_DATA = [];
  var activeGroup  = 'all';
  var activeMethods = new Set(METHODS);
  var searchStr    = '';

  function tagHtml(c) {
    var t = [];
    if (c.postgame)  t.push('<span class="tag tag-post">post-game</span>');
    if (c.event)     t.push('<span class="tag tag-event">event</span>');
    if (c.shiny)     t.push('<span class="tag tag-shiny">&#9733; always shiny</span>');
    if (c.roaming)   t.push('<span class="tag tag-roam">roaming</span>');
    if (c.day)       t.push('<span class="tag tag-day">' + esc(c.day) + ' only</span>');
    return t.join('');
  }

  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function render() {
    var q = searchStr.toLowerCase();
    var rows = ALL_DATA.filter(function(r) {
      if (activeGroup !== 'all' && r.game_group !== activeGroup) return false;
      if (!activeMethods.has(r.encounter_method)) return false;
      if (q && r.pokemon_name.toLowerCase().indexOf(q) < 0 &&
               r.location.toLowerCase().indexOf(q) < 0 &&
               r.game_group.toLowerCase().indexOf(q) < 0 &&
               (GL[r.game_group]||'').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    var count = document.getElementById('se-count');
    if (count) count.textContent = rows.length.toLocaleString() + ' encounter' + (rows.length !== 1 ? 's' : '');

    var tbody = document.getElementById('se-tbody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:#364560">No encounters match</td></tr>';
      return;
    }

    var prevGroup = null;
    tbody.innerHTML = rows.map(function(r) {
      var mc = MC[r.encounter_method] || '#7ab4ff';
      var c  = r.conditions || {};

      // Group header row
      var header = '';
      if (r.game_group !== prevGroup) {
        prevGroup = r.game_group;
        header = '<tr style="background:#040b18;position:sticky;top:45px">' +
          '<td colspan="6" style="padding:6px 10px;font-size:10px;font-weight:700;color:#a370f7;letter-spacing:.5px;text-transform:uppercase;border-bottom:1px solid #0e1828">' +
          esc(GL[r.game_group] || r.game_group) + '</td></tr>';
      }

      // Versions
      var games = r.games || [];
      var gHtml = games.map(function(g){ return '<span style="display:inline-block;background:#0a1228;border:1px solid #182035;border-radius:4px;padding:1px 5px;font-size:9px;color:#8a9ab0;margin:1px">' + esc(g) + '</span>'; }).join('');

      // Requirements
      var reqParts = [];
      reqParts.push(tagHtml(c));
      if (c.requires) {
        var reqs = Array.isArray(c.requires) ? c.requires : [c.requires];
        reqs.forEach(function(req){ reqParts.push('<span style="color:#c9d1d9">' + esc(req) + '</span>'); });
      }
      if (c.event_item) reqParts.push('<span style="color:#f06070">Event item: ' + esc(c.event_item) + '</span>');
      var noteHtml = c.note ? '<div class="se-note">' + esc(c.note) + '</div>' : '';

      var level = (r.min_level != null)
        ? (r.min_level === r.max_level ? r.min_level : r.min_level + '–' + r.max_level)
        : '—';

      var row = '<tr style="border-bottom:1px solid #0a1220">' +
        '<td style="padding:7px 10px;white-space:nowrap"><span style="color:#546070;font-size:9px">#' + esc(r.dex_num) + ' </span><span style="color:#c9d1d9;font-weight:600">' + esc(r.pokemon_name) + '</span></td>' +
        '<td style="padding:7px 10px;color:#9bb0c8">' + esc(r.location) + '</td>' +
        '<td style="padding:7px 10px;white-space:nowrap"><span style="color:' + mc + ';font-weight:600;font-size:11px">' + esc(r.encounter_method) + '</span></td>' +
        '<td style="padding:7px 6px;text-align:center;color:#c9d1d9">' + level + '</td>' +
        '<td style="padding:7px 10px">' + gHtml + '</td>' +
        '<td style="padding:7px 10px"><div class="se-req">' + (reqParts.join(' ') || '<span style="color:#364560">—</span>') + noteHtml + '</div></td>' +
        '</tr>';
      return header + row;
    }).join('');
  }

  function buildGroupBar(data) {
    var groups = ['all'];
    var seen = {};
    data.forEach(function(r){ if (!seen[r.game_group]) { seen[r.game_group] = true; groups.push(r.game_group); } });
    var bar = document.getElementById('se-group-bar');
    if (!bar) return;
    bar.innerHTML = groups.map(function(g) {
      var label = g === 'all' ? 'All' : (GL[g] || g);
      return '<button class="se-tab' + (g === activeGroup ? ' on' : '') + '" onclick="se.setGroup(' + JSON.stringify(g) + ',this)">' + esc(label) + '</button>';
    }).join('');
  }

  function buildMethodBar() {
    var bar = document.getElementById('se-method-bar');
    if (!bar) return;
    bar.innerHTML = METHODS.map(function(m) {
      var mc = MC[m] || '#7ab4ff';
      var on = activeMethods.has(m);
      return '<button class="se-mtab' + (on ? ' on' : '') + '" style="--mc:' + mc + '" onclick="se.toggleMethod(' + JSON.stringify(m) + ',this)">' + esc(m) + '</button>';
    }).join('');
  }

  window.se = {
    filter: function() { searchStr = document.getElementById('se-search').value; render(); },
    setGroup: function(g, el) {
      activeGroup = g;
      document.querySelectorAll('.se-tab').forEach(function(b){ b.classList.remove('on'); });
      if (el) el.classList.add('on');
      render();
    },
    toggleMethod: function(m, el) {
      if (activeMethods.has(m)) activeMethods.delete(m); else activeMethods.add(m);
      if (el) el.classList.toggle('on');
      render();
    },
  };

  fetch('/api/static-encounters')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      if (!Array.isArray(data)) throw new Error(data.error || 'Bad response');
      ALL_DATA = data;
      buildGroupBar(data);
      buildMethodBar();
      render();
    })
    .catch(function(e) {
      var tbody = document.getElementById('se-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="padding:32px;text-align:center;color:#f05060">Error: ' + esc(e.message) + '</td></tr>';
    });
})();
</script>`;

  // `embed` renders without the top nav so the page can be framed inside the
  // Static Encounters toggle overlay on the Scrapers admin panel.
  return shell('Static Encounters', body, { user, active: 'static-encounters', bare: embed });
}

module.exports = { esc, loginPage, claimPage, settingsPage, shell, landingPage, dashboardPage, locationsPage, staticEncountersPage };
