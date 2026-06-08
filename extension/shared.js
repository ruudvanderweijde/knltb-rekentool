// Pure helpers shared by the extension's content script and background worker.
// Browser port of the Node-only scripts/fetch-core.js: same logic, but the
// Playwright `request`/`page` calls live in content.js/background.js instead.
//
// Classic script (no import/export) so it works both as a content script and
// via importScripts() in the MV3 service worker — top-level functions/consts
// are shared across files in the same realm, exactly like scenarios.js.
// Keep this in sync with scripts/fetch-core.js when the delta/gender logic
// changes (the pure functions are intentionally identical).

// ── head-to-head URL parsing ─────────────────────────────────────────────────

function parseHeadToHeadUrl(input) {
  const u = new URL(input);
  const org = u.searchParams.get('OrganizationCode');
  const ids = ['T1P1MemberID', 'T1P2MemberID', 'T2P1MemberID', 'T2P2MemberID']
    .map(k => u.searchParams.get(k));
  if (!org || ids.some(v => !v)) {
    throw new Error('URL mist OrganizationCode of een van de MemberID-parameters.');
  }
  return { org, ids };
}

function profileUrl(orgCode, memberId) {
  const slug = btoa(`base64:${memberId}`);
  return `https://mijnknltb.toernooi.nl/player/${orgCode.toUpperCase()}/${slug}`;
}

// ── gender helpers ───────────────────────────────────────────────────────────

function normalizeGender(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  if (/^(v|f|vrouw|dame|dames|female|w)/.test(t)) return 'female';
  if (/^(m|man|heren|male)/.test(t)) return 'male';
  return null;
}

// Gender is not published on KNLTB — guess from the first name to pre-fill the
// confirm modal. Short list of common Dutch names + simple endings; unknown →
// 'male'. The user always confirms, so this only needs to be a helpful default.
const FEMALE_NAMES = new Set([
  'anna','anne','anouk','astrid','bianca','carla','chantal','claudia','daphne','denise',
  'eline','ellen','els','emma','esther','eva','femke','fleur','ilse','ingrid','irene','iris',
  'janneke','jasmijn','jolanda','julia','karin','kim','laura','linda','lisa','lotte','maaike',
  'manon','marieke','marjolein','marlou','maria','mirjam','monique','nadia','nienke','noa',
  'petra','renske','rianne','romy','sandra','sanne','sara','sarah','saskia','sophie','suzanne',
  'tess','tessa','wilma','yvonne',
]);
const MALE_NAMES = new Set([
  'arjan','bart','bas','bram','daan','dennis','dirk','erik','erwin','frank','gijs','hans',
  'henk','jan','jeroen','joost','jorrit','kees','koen','lars','lucas','marcel','mark','martijn',
  'niels','patrick','peter','piet','rob','robert','roy','ruben','ruud','sander','sem','sven',
  'thijs','thomas','tim','tom','wouter',
]);

function guessGender(name) {
  if (!name) return 'male';
  const first = name.trim().split(/\s+/)[0].toLowerCase();
  if (FEMALE_NAMES.has(first)) return 'female';
  if (MALE_NAMES.has(first)) return 'male';
  if (/(a|ke|je)$/.test(first)) return 'female';
  return 'male';
}

// ── number formatting ────────────────────────────────────────────────────────

function dutchToNumber(s) { return Number.parseFloat(String(s).trim().replace(',', '.')); }
function numberToDutch(n) { return String(n).replace('.', ','); }

// ── nlpadel form / response ──────────────────────────────────────────────────

function buildNlpadelForm({ token, R1, R2, R3, R4, genders, sets, superTiebreak, team1Wins }) {
  const [s1, s2, s3] = [sets[0] || null, sets[1] || null, sets[2] || null];
  const [g1, g2, g3, g4] = genders || ['male', 'male', 'male', 'male'];
  const form = {
    __RequestVerificationToken: token,
    hp1: numberToDutch(R1), ghp1: g1,
    hp2: numberToDutch(R2), ghp2: g2,
    vp1: numberToDutch(R3), gvp1: g3,
    vp2: numberToDutch(R4), gvp2: g4,
    WinnerIsHome: team1Wins ? 'true' : 'false',
    rhs1: s1 ? String(s1[0]) : '', rvs1: s1 ? String(s1[1]) : '',
    rhs2: s2 ? String(s2[0]) : '', rvs2: s2 ? String(s2[1]) : '',
    rhs3: s3 ? String(s3[0]) : '', rvs3: s3 ? String(s3[1]) : '',
  };
  if (superTiebreak) {
    form.rtbs3 = 'true';
    form.rhs3 = String(superTiebreak[0]);
    form.rvs3 = String(superTiebreak[1]);
  }
  return form;
}

function parseNlpadelResponse(html) {
  // <strong> values: [3] deltaTeam1, [7] deltaTeam2 (see collect-nlpadel-data.js)
  const strongs = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)]
    .map(m => m[1].trim())
    .filter(t => /^-?[\d,]+$/.test(t))
    .map(t => dutchToNumber(t));
  if (strongs.length < 8) {
    throw new Error(`nlpadel-respons had ${strongs.length} getallen, verwacht 8`);
  }
  const deltaTeam1 = strongs[3];
  const deltaTeam2 = strongs[7];
  // Deltas are strictly zero-sum; if not, we parsed the wrong page (SSO/redirect
  // 200) or nlpadel's layout changed — fail rather than show a wrong rating change.
  if (Math.abs(deltaTeam1 + deltaTeam2) > 0.001) {
    throw new Error(`nlpadel-respons niet zero-sum (Δ1=${deltaTeam1}, Δ2=${deltaTeam2}) — verkeerde pagina geparset?`);
  }
  return { deltaTeam1, deltaTeam2 };
}

// ── calculator query string ──────────────────────────────────────────────────

function buildCalcQuery({ ratings, names, genders, winDeltas, lossDeltas, t }) {
  return [
    `R1=${ratings[0]}`, `R2=${ratings[1]}`, `R3=${ratings[2]}`, `R4=${ratings[3]}`,
    `n=${names.map(n => encodeURIComponent(n || '')).join(',')}`,
    `g=${genders.map(g => g[0]).join(',')}`,
    `w=${winDeltas.join(',')}`,
    `l=${lossDeltas.join(',')}`,
    `t=${t != null ? t : Date.now()}`,
  ].join('&');
}

// ── tiny concurrency limiter ─────────────────────────────────────────────────

async function mapWithLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// Optional Node reuse (tests); harmless/no-op in browser + service worker.
if (typeof module !== 'undefined') {
  module.exports = {
    parseHeadToHeadUrl, profileUrl, normalizeGender, guessGender,
    dutchToNumber, numberToDutch, buildNlpadelForm, parseNlpadelResponse,
    buildCalcQuery, mapWithLimit,
  };
}
