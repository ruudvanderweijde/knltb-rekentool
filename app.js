const DEFAULT_PLAYER_NAMES = ['Speler 1', 'Speler 2', 'Speler 3', 'Speler 4'];
const PLAYER_NAMES = [...DEFAULT_PLAYER_NAMES];

// Anonymous, stateless proxy that fetches the nlpadel deltas (needed only to get
// around the browser's CORS + SameSite rules; no login/secrets). Override for
// local testing, e.g. http://localhost:8787/deltas
const DELTAS_API = 'https://knltb-rekentool-proxy.ruudvanderweijde.workers.dev/deltas';

let prefetchedWinDeltas  = null; // array of 9 numbers or null
let prefetchedLossDeltas = null;

document.addEventListener('DOMContentLoaded', () => {
  ['r1', 'r2', 'r3', 'r4', 'n1', 'n2', 'n3', 'n4'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalculate);
  });
  applyUrlPrefill();
  const btn = document.getElementById('calcBtn');
  if (btn) btn.addEventListener('click', fetchDeltas);
  const paste = document.getElementById('pasteBox');
  if (paste) paste.addEventListener('input', e => parsePasted(e.target.value));
  const share = document.getElementById('shareBtn');
  if (share) share.addEventListener('click', copyShareLink);
  recalculate();
});

// Parse a pasted blob into the rating (and optional name) inputs. Picks up to
// four numbers in 0..11, with an optional leading name before each.
function parsePasted(text) {
  const pairs = [...text.matchAll(/([\p{L}][\p{L}\s.'-]*?)?\s*(\d{1,2}(?:[.,]\d+)?)/gu)]
    .map(m => ({ name: (m[1] || '').trim(), num: parseFloat(m[2].replace(',', '.')) }))
    .filter(p => Number.isFinite(p.num) && p.num >= 0 && p.num <= 11)
    .slice(0, 4);
  if (!pairs.length) return;
  pairs.forEach((p, i) => {
    setVal(`r${i + 1}`, String(p.num).replace('.', ','));
    if (p.name) setVal(`n${i + 1}`, p.name);
  });
  recalculate();
}

function applyUrlPrefill() {
  // Read from both query string and hash so links survive macOS `open` even
  // if it strips one of them.
  const params = new URLSearchParams(
    window.location.search + '&' + window.location.hash.replace(/^#/, '')
  );
  ['R1', 'R2', 'R3', 'R4'].forEach((key, i) => {
    const v = params.get(key);
    if (v != null) setVal(`r${i + 1}`, v);
  });
  const names = (params.get('n') || '').split(',').map(s => decodeURIComponent(s).trim());
  const genders = (params.get('g') || '').split(',').map(s => s.trim().toLowerCase());
  for (let i = 0; i < 4; i++) {
    if (names[i]) setVal(`n${i + 1}`, names[i]);
    const sym = genderSymbol(genders[i]);
    if (sym) setVal(`g${i + 1}`, sym === '♀' ? 'v' : 'm');
  }
  prefetchedWinDeltas  = parseDeltaList(params.get('w'));
  prefetchedLossDeltas = parseDeltaList(params.get('l'));
}

function setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

function genderSymbol(g) {
  if (!g) return '';
  if (g.startsWith('v') || g.startsWith('f') || g.startsWith('w')) return '♀';
  if (g.startsWith('m')) return '♂';
  return '';
}

// Pull the (optional) names from the inputs into PLAYER_NAMES, falling back to
// the default "Speler N" when empty.
function readPlayerNames() {
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`n${i + 1}`);
    const v = el && el.value.trim();
    PLAYER_NAMES[i] = v || DEFAULT_PLAYER_NAMES[i];
  }
}

function readGenders() {
  return [1, 2, 3, 4].map(i => {
    const el = document.getElementById(`g${i}`);
    return el && el.value === 'v' ? 'female' : 'male';
  });
}

function parseDeltaList(s) {
  if (!s) return null;
  const parts = s.split(',').map(Number);
  if (parts.length !== WIN_SCENARIOS.length) return null;
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts;
}

function recalculate() {
  readPlayerNames();
  const R1 = parseRating('r1');
  const R2 = parseRating('r2');
  const R3 = parseRating('r3');
  const R4 = parseRating('r4');

  const allValid = [R1, R2, R3, R4].every(r => !isNaN(r) && r >= 0 && r <= 11);

  updateCombined('r12', R1, R2);
  updateCombined('r34', R3, R4);
  setVisible('probSection', allValid);

  const hasPrefetch = prefetchedWinDeltas && prefetchedLossDeltas;
  setVisible('resultsSection', allValid && hasPrefetch);
  setVisible('noResultsHint', allValid && !hasPrefetch);

  if (!allValid) return;

  const result = calcPadel(R1, R2, R3, R4);
  renderProbability(result);
  if (hasPrefetch) {
    renderMatrix(R1, R2, R3, R4);
    updateShareUrl();
  }
}

// Build a self-contained deep link carrying the ratings, names, genders and the
// fetched deltas, so a recipient sees the full result without fetching anything.
// Byte-compatible with the CLI's buildCalcQuery so links round-trip identically.
function buildShareUrl() {
  const ratings = ['r1', 'r2', 'r3', 'r4'].map(parseRating);
  if (!ratings.every(r => !isNaN(r) && r >= 0 && r <= 11)) return null;
  if (!prefetchedWinDeltas || !prefetchedLossDeltas) return null;
  const names = [1, 2, 3, 4].map(i => {
    const el = document.getElementById(`n${i}`);
    return (el && el.value.trim()) || '';
  });
  const genders = readGenders().map(g => (g === 'female' ? 'v' : 'm'));
  const query = [
    `R1=${ratings[0]}`, `R2=${ratings[1]}`, `R3=${ratings[2]}`, `R4=${ratings[3]}`,
    `n=${names.map(n => encodeURIComponent(n)).join(',')}`,
    `g=${genders.join(',')}`,
    `w=${prefetchedWinDeltas.map(d => d.toFixed(4)).join(',')}`,
    `l=${prefetchedLossDeltas.map(d => d.toFixed(4)).join(',')}`,
  ].join('&');
  return `${location.origin}${location.pathname}?${query}`;
}

function updateShareUrl() {
  const input = document.getElementById('shareUrl');
  if (!input) return;
  const url = buildShareUrl();
  input.value = url || '';
}

async function copyShareLink() {
  const input = document.getElementById('shareUrl');
  const url = input && input.value;
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    setShareStatus('Gekopieerd!');
  } catch {
    // Clipboard API blocked (e.g. insecure context) — fall back to select.
    if (input.select) { input.select(); input.setSelectionRange(0, url.length); }
    setShareStatus('Selecteer en kopieer (Ctrl/Cmd+C).');
  }
}

function setShareStatus(text) {
  const el = document.getElementById('shareStatus');
  if (el) el.textContent = text;
}

// Fetch the 18 deltas from the proxy for the current ratings + genders, then
// render. Editing the ratings invalidates a previous result, so we always
// recompute from the inputs on click.
async function fetchDeltas() {
  const ratings = ['r1', 'r2', 'r3', 'r4'].map(parseRating);
  if (!ratings.every(r => !isNaN(r) && r >= 0 && r <= 11)) {
    setStatus('Vul eerst 4 geldige ratings in (0–11).', true);
    return;
  }
  const btn = document.getElementById('calcBtn');
  btn.disabled = true;
  setStatus('Bezig met berekenen via nlpadel…');
  try {
    const resp = await fetch(DELTAS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratings, genders: readGenders() }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    const w = parseDeltaList((data.winDeltas || []).join(','));
    const l = parseDeltaList((data.lossDeltas || []).join(','));
    if (!w || !l) throw new Error('Onverwacht antwoord van de rekentool.');
    prefetchedWinDeltas = w;
    prefetchedLossDeltas = l;
    setStatus('');
    recalculate();
  } catch (err) {
    setStatus(`Mislukt: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
}

function setStatus(text, isError) {
  const el = document.getElementById('calcStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'calc-status' + (isError ? ' error' : '');
}

function renderProbability(result) {
  const p1 = pct(result.winProbTeam1);
  document.getElementById('probLabel1').textContent = `${p1}%`;
  document.getElementById('probLabel2').textContent = `${100 - p1}%`;
  document.getElementById('probFill').style.width = `${p1}%`;
  document.getElementById('probName1').textContent = `${PLAYER_NAMES[0]} / ${PLAYER_NAMES[1]}`;
  document.getElementById('probName2').textContent = `${PLAYER_NAMES[2]} / ${PLAYER_NAMES[3]}`;
}

function renderMatrix(R1, R2, R3, R4) {
  renderGroup('winHead',  'winBody',  WIN_SCENARIOS,  prefetchedWinDeltas,  R1, R2, R3, R4);
  renderGroup('lossHead', 'lossBody', LOSS_SCENARIOS, prefetchedLossDeltas, R1, R2, R3, R4);
}

function renderGroup(theadId, tbodyId, scenarios, deltas, R1, R2, R3, R4) {
  const [n1, n2, n3, n4] = PLAYER_NAMES.map(escapeHtml);
  document.getElementById(theadId).innerHTML = `
    <tr>
      <th>Uitslag</th>
      <th>&Delta; Team 1</th>
      <th>${n1} nieuw</th>
      <th>${n2} nieuw</th>
      <th>&Delta; Team 2</th>
      <th>${n3} nieuw</th>
      <th>${n4} nieuw</th>
    </tr>`;

  document.getElementById(tbodyId).innerHTML = scenarios.map((scenario, i) => {
    const d1 = deltas[i];
    const d2 = -d1;
    return `
    <tr>
      <td class="score-label">${scenario.label}</td>
      <td class="${deltaClass(d1)}">${fmtDelta(d1)}</td>
      <td class="rating-new">${fmt(R1 + d1)}</td>
      <td class="rating-new">${fmt(R2 + d1)}</td>
      <td class="${deltaClass(d2)}">${fmtDelta(d2)}</td>
      <td class="rating-new">${fmt(R3 + d2)}</td>
      <td class="rating-new">${fmt(R4 + d2)}</td>
    </tr>`;
  }).join('');
}

// Names come from user input / the URL (?n=) and are interpolated into innerHTML
// in renderGroup, so they must be escaped to prevent XSS via crafted links.
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function parseRating(id) {
  return parseFloat(document.getElementById(id).value.replace(',', '.'));
}

function updateCombined(elemId, Ra, Rb) {
  const el = document.getElementById(elemId);
  if (!isNaN(Ra) && !isNaN(Rb) && Ra >= 0 && Ra <= 11 && Rb >= 0 && Rb <= 11) {
    el.textContent = fmt(DSS_CONFIG.theta * Ra + (1 - DSS_CONFIG.theta) * Rb);
  } else {
    el.textContent = '—';
  }
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (el) el.hidden = !visible;
}

function pct(prob)    { return Math.round(prob * 100); }
function fmt(n)       { return n.toFixed(4); }
// Treat negative zero (e.g. team 2's -delta of a +0 team-1 delta) as negative, so
// it renders as "-0.0000" in green instead of "+0.0000" in red.
function isNeg(d)     { return d < 0 || Object.is(d, -0); }
function fmtDelta(d)  { return (isNeg(d) ? '-' : '+') + Math.abs(d).toFixed(4); }
function deltaClass(d){ return isNeg(d) ? 'delta-good' : 'delta-bad'; }
