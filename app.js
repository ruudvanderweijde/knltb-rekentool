const PLAYER_NAMES = ['Speler 1', 'Speler 2', 'Speler 3', 'Speler 4'];
const DEFAULT_PLAYER_NAMES = [...PLAYER_NAMES];

let prefetchedWinDeltas  = null; // array of 9 numbers or null
let prefetchedLossDeltas = null;

document.addEventListener('DOMContentLoaded', () => {
  ['r1', 'r2', 'r3', 'r4'].forEach(id => {
    document.getElementById(id).addEventListener('input', recalculate);
  });
  applyUrlPrefill();
  recalculate();
});

function applyUrlPrefill() {
  // Read from both query string and hash so links survive macOS `open` even
  // if it strips one of them.
  const params = new URLSearchParams(
    window.location.search + '&' + window.location.hash.replace(/^#/, '')
  );
  ['R1', 'R2', 'R3', 'R4'].forEach((key, i) => {
    const v = params.get(key);
    if (v == null) return;
    document.getElementById(`r${i + 1}`).value = v;
  });
  applyPlayerNames(params.get('n'), params.get('g'));
  prefetchedWinDeltas  = parseDeltaList(params.get('w'));
  prefetchedLossDeltas = parseDeltaList(params.get('l'));
}

// `n` is a comma-separated list of up to 4 URL-encoded player names; `g` is a
// comma-separated list of genders (m/v or male/female). Blank/missing names
// fall back to the default "Speler N" label; unknown genders show no symbol.
function applyPlayerNames(rawNames, rawGenders) {
  const names = (rawNames || '').split(',').map(s => decodeURIComponent(s).trim());
  const genders = (rawGenders || '').split(',').map(s => s.trim().toLowerCase());
  if (!rawNames && !rawGenders) return;
  for (let i = 0; i < 4; i++) {
    PLAYER_NAMES[i] = names[i] || DEFAULT_PLAYER_NAMES[i];
    const label = document.querySelector(`label[for="r${i + 1}"]`);
    if (!label) continue;
    const symbol = genderSymbol(genders[i]);
    label.textContent = PLAYER_NAMES[i];
    if (symbol) {
      const span = document.createElement('span');
      span.className = `gender gender-${symbol === '♀' ? 'f' : 'm'}`;
      span.textContent = ` ${symbol}`;
      label.appendChild(span);
    }
  }
}

function genderSymbol(g) {
  if (!g) return '';
  if (g.startsWith('v') || g.startsWith('f') || g.startsWith('w')) return '♀';
  if (g.startsWith('m')) return '♂';
  return '';
}

function parseDeltaList(s) {
  if (!s) return null;
  const parts = s.split(',').map(Number);
  if (parts.length !== WIN_SCENARIOS.length) return null;
  if (parts.some(n => !Number.isFinite(n))) return null;
  return parts;
}

function recalculate() {
  const R1 = parseRating('r1');
  const R2 = parseRating('r2');
  const R3 = parseRating('r3');
  const R4 = parseRating('r4');

  const allValid = [R1, R2, R3, R4].every(r => !isNaN(r) && r >= 1 && r <= 12);

  updateCombined('r12', R1, R2);
  updateCombined('r34', R3, R4);
  setVisible('probSection', allValid);

  const hasPrefetch = prefetchedWinDeltas && prefetchedLossDeltas;
  setVisible('resultsSection', allValid && hasPrefetch);
  setVisible('noResultsHint', allValid && !hasPrefetch);

  if (!allValid) return;

  const result = calcPadel(R1, R2, R3, R4);
  renderProbability(result);
  if (hasPrefetch) renderMatrix(R1, R2, R3, R4);
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

// Names come from the URL (?n=) and are interpolated into innerHTML in
// renderGroup, so they must be escaped to prevent XSS via crafted links.
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
  if (!isNaN(Ra) && !isNaN(Rb) && Ra >= 1 && Ra <= 12 && Rb >= 1 && Rb <= 12) {
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
function fmtDelta(d)  { return (d >= 0 ? '+' : '') + d.toFixed(4); }
function deltaClass(d){ return d < 0 ? 'delta-good' : 'delta-bad'; }
