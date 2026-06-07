'use strict';

// Local web app for the KNLTB padel rekentool.
//
//   node server.js          # then open http://localhost:3000
//   PORT=8080 node server.js
//
// Flow: paste an h2h URL → confirm the (guessed) genders → the server fetches
// ratings + names from KNLTB and the 18 deltas from nlpadel, then redirects to
// the calculator with everything filled in. All cross-site work happens
// server-side using the persistent KNLTB session in scripts/.knltb-userdata/.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const {
  ROOT, normalizeGender, guessGender,
  scrapeNamesAndRatings, fetchAllDeltas, buildCalcQuery,
} = require('./scripts/fetch-core');

const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// ── tiny HTML helpers ──────────────────────────────────────────────────────

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function shell(title, body) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title><link rel="stylesheet" href="/style.css">
<style>
  .start-card { max-width: 640px; margin: 32px auto; }
  .start-card label.block { display:block; font-weight:600; color:var(--blue); margin:0 0 6px; }
  .start-card input[type=url]{ width:100%; padding:10px 12px; font-size:14px;
    border:1px solid var(--border); border-radius:6px; box-sizing:border-box; }
  .player-confirm{ display:flex; align-items:center; gap:12px; padding:8px 0;
    border-bottom:1px solid var(--border); }
  .player-confirm .pname{ flex:1; font-weight:600; }
  .player-confirm .prating{ color:var(--gray); font-variant-numeric:tabular-nums; }
  .player-confirm select{ padding:6px 8px; border:1px solid var(--border); border-radius:6px; }
  .btn-primary{ margin-top:18px; background:var(--orange); color:#fff; border:0;
    padding:11px 20px; font-size:15px; font-weight:600; border-radius:6px; cursor:pointer; }
  .btn-primary:hover{ filter:brightness(0.95); }
  .err{ background:#fdecea; border:1px solid #f5c6cb; color:var(--red);
    padding:12px 14px; border-radius:6px; }
  .muted{ color:var(--gray); font-size:13px; }
</style></head>
<body><header><div class="header-inner"><span class="logo">🎾</span>
<div><h1>KNLTB Padel Rekentool</h1>
<div class="subtitle">DSS ratingwijziging berekenen</div></div></div></header>
<main>${body}</main>
<footer><p>Lokale tool &middot; sessie uit <code>scripts/.knltb-userdata/</code></p></footer>
</body></html>`;
}

function startPage(message) {
  return shell('KNLTB Padel Rekentool', `
  <section class="card start-card">
    <h2>Nieuwe berekening</h2>
    ${message ? `<p class="err">${esc(message)}</p>` : ''}
    <form method="get" action="/prepare">
      <label class="block" for="url">Plak de mijnknltb head-2-head URL</label>
      <input type="url" id="url" name="url" required
        placeholder="https://mijnknltb.toernooi.nl/head-2-head?OrganizationCode=…">
      <p class="muted">Tip: stel een dubbelpartij samen op mijnknltb en kopieer de URL van de vergelijkingspagina.</p>
      <button class="btn-primary" type="submit">Spelers ophalen →</button>
    </form>
  </section>`);
}

function confirmPage({ url, names, ratings, guesses }) {
  const rows = names.map((n, i) => {
    const g = guesses[i] === 'female' ? 'female' : 'male';
    return `<div class="player-confirm">
      <span class="pname">${esc(n || `Speler ${i + 1}`)}</span>
      <span class="prating">${esc(ratings[i])}</span>
      <select name="g${i}">
        <option value="m"${g === 'male' ? ' selected' : ''}>Man ♂</option>
        <option value="v"${g === 'female' ? ' selected' : ''}>Vrouw ♀</option>
      </select>
    </div>`;
  }).join('');
  return shell('Bevestig geslacht', `
  <section class="card start-card">
    <h2>Bevestig geslacht</h2>
    <p class="muted">Geslacht staat niet op KNLTB — we gokken het op basis van de voornaam.
      Het beïnvloedt de deltas bij gemengde teams, dus controleer het even.</p>
    <form method="get" action="/fetch">
      <input type="hidden" name="url" value="${esc(url)}">
      <input type="hidden" name="r" value="${esc(ratings.join(','))}">
      <input type="hidden" name="n" value="${esc(names.map(x => encodeURIComponent(x || '')).join(','))}">
      ${rows}
      <button class="btn-primary" type="submit">Bereken 18 uitslagen →</button>
    </form>
  </section>`);
}

// ── request handling ─────────────────────────────────────────────────────────

function send(res, status, body, contentType = 'text/html; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function serveStatic(res, pathname) {
  const file = path.join(ROOT, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

async function handlePrepare(res, query) {
  const url = query.get('url');
  if (!url) return send(res, 400, startPage('Geef een URL op.'));
  try {
    const { names, ratings } = await scrapeNamesAndRatings(url);
    const guesses = names.map(guessGender);
    send(res, 200, confirmPage({ url, names, ratings, guesses }));
  } catch (err) {
    send(res, 200, startPage(friendly(err)));
  }
}

async function handleFetch(res, query) {
  try {
    const ratings = query.get('r').split(',').map(Number);
    const names = (query.get('n') || '').split(',').map(s => decodeURIComponent(s));
    const genders = [0, 1, 2, 3].map(i => normalizeGender(query.get(`g${i}`)) || 'male');
    if (ratings.length !== 4 || ratings.some(n => !Number.isFinite(n))) {
      throw new Error('Ongeldige ratings.');
    }
    const { winDeltas, lossDeltas } = await fetchAllDeltas({ ratings, genders });
    const q = buildCalcQuery({ ratings, names, genders, winDeltas, lossDeltas });
    res.writeHead(302, { Location: `/index.html?${q}` });
    res.end();
  } catch (err) {
    send(res, 200, startPage(friendly(err)));
  }
}

// Turn common failures into actionable Dutch hints.
function friendly(err) {
  const m = String(err && err.message || err);
  if (/login|Timeout.*Padel Dubbel|net::|ERR_/i.test(m)) {
    return 'Ophalen mislukt — waarschijnlijk is de KNLTB-sessie verlopen. ' +
      'Log opnieuw in (zie README) en probeer het nog eens. Details: ' + m;
  }
  return 'Er ging iets mis: ' + m;
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsed.pathname;
  if (pathname === '/' ) return send(res, 200, startPage());
  if (pathname === '/prepare') return void handlePrepare(res, parsed.searchParams);
  if (pathname === '/fetch') return void handleFetch(res, parsed.searchParams);
  return serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`KNLTB rekentool draait op http://localhost:${PORT}`);
});