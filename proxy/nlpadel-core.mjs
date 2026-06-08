// Host-agnostic nlpadel rekentool client. Runs in a Cloudflare Worker (and in
// Node ≥18) with global fetch — NO Playwright, NO browser. It exists only to
// sidestep the browser's CORS + SameSite=Strict restrictions; nlpadel itself
// needs no authentication. Stateless and anonymous.
//
// Mirrors the pure logic in scripts/fetch-core.js / extension/shared.js — keep
// the form-building, response-parsing, and scenario list identical.

const NLPADEL_URL =
  'https://www.nlpadel.nl/alles-over-padel/speel-padel/speelsterkte-rating/speelsterkte-rekentool/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';

// The 18 score scenarios — order must match scenarios.js (the UI maps deltas by index).
export const WIN_SCENARIOS = [
  { label: '6-0, 6-0',      sets: [[6,0],[6,0]],            superTiebreak: null },
  { label: '6-2, 6-1',      sets: [[6,2],[6,1]],            superTiebreak: null },
  { label: '6-3, 6-2',      sets: [[6,3],[6,2]],            superTiebreak: null },
  { label: '6-4, 6-3',      sets: [[6,4],[6,3]],            superTiebreak: null },
  { label: '7-5, 6-4',      sets: [[7,5],[6,4]],            superTiebreak: null },
  { label: '7-6, 6-4',      sets: [[7,6],[6,4]],            superTiebreak: null },
  { label: '6-3, 3-6, 7-5', sets: [[6,3],[3,6],[7,5]],      superTiebreak: null },
  { label: '6-1, 3-6, 7-6', sets: [[6,1],[3,6],[7,6]],      superTiebreak: null },
  { label: '6-4, 4-6, 7-6', sets: [[6,4],[4,6],[7,6]],      superTiebreak: null },
];
export const LOSS_SCENARIOS = [
  { label: '0-6, 0-6',      sets: [[0,6],[0,6]],            superTiebreak: null },
  { label: '1-6, 2-6',      sets: [[1,6],[2,6]],            superTiebreak: null },
  { label: '2-6, 3-6',      sets: [[2,6],[3,6]],            superTiebreak: null },
  { label: '3-6, 4-6',      sets: [[3,6],[4,6]],            superTiebreak: null },
  { label: '4-6, 5-7',      sets: [[4,6],[5,7]],            superTiebreak: null },
  { label: '5-7, 6-7',      sets: [[5,7],[6,7]],            superTiebreak: null },
  { label: '3-6, 6-3, 5-7', sets: [[3,6],[6,3],[5,7]],      superTiebreak: null },
  { label: '6-1, 3-6, 6-7', sets: [[6,1],[3,6],[6,7]],      superTiebreak: null },
  { label: '4-6, 6-4, 6-7', sets: [[4,6],[6,4],[6,7]],      superTiebreak: null },
];

function numberToDutch(n) { return String(n).replace('.', ','); }
function dutchToNumber(s) { return Number.parseFloat(String(s).trim().replace(',', '.')); }

function normalizeGender(s) {
  const t = String(s || '').trim().toLowerCase();
  if (/^(v|f|vrouw|dame|dames|female|w)/.test(t)) return 'female';
  return 'male';
}

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
  // <strong> values: [3] deltaTeam1, [7] deltaTeam2.
  const strongs = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)]
    .map(m => m[1].trim())
    .filter(t => /^-?[\d,]+$/.test(t))
    .map(t => dutchToNumber(t));
  if (strongs.length < 8) {
    throw new Error(`nlpadel-respons had ${strongs.length} getallen, verwacht 8`);
  }
  const deltaTeam1 = strongs[3];
  const deltaTeam2 = strongs[7];
  if (Math.abs(deltaTeam1 + deltaTeam2) > 0.001) {
    throw new Error(`nlpadel-respons niet zero-sum (Δ1=${deltaTeam1}, Δ2=${deltaTeam2})`);
  }
  return { deltaTeam1, deltaTeam2 };
}

// ── cookie-jar fetch ─────────────────────────────────────────────────────────
// Plain fetch can't complete nlpadel's GET: it bounces through an id.knltb.nl
// "checksession" redirect and fails with "redirect count exceeded" because it
// doesn't carry cookies across hops. We follow redirects manually, accumulating
// cookies, until we reach the 200 result/form page.

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}
function mergeSetCookie(jar, resp) {
  const list = typeof resp.headers.getSetCookie === 'function'
    ? resp.headers.getSetCookie()
    : (resp.headers.get('set-cookie') ? [resp.headers.get('set-cookie')] : []);
  for (const sc of list) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}

// Manual redirect-following fetch that carries+collects cookies in `jar`.
async function jarFetch(jar, url, { method = 'GET', body, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    const resp = await fetch(current, {
      method, body, redirect: 'manual',
      headers: { 'User-Agent': UA, Cookie: cookieHeader(jar), ...headers },
    });
    mergeSetCookie(jar, resp);
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) return resp;
      current = new URL(loc, current).toString();
      method = 'GET'; body = undefined;            // a redirect turns the request into GET
      headers = { ...headers, 'Content-Type': undefined };
      continue;
    }
    return resp;
  }
  throw new Error('te veel redirects bij nlpadel');
}

async function getToken(jar) {
  const resp = await jarFetch(jar, NLPADEL_URL);
  if (!resp.ok) throw new Error(`GET nlpadel mislukt: ${resp.status}`);
  const html = await resp.text();
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!m) throw new Error('Anti-forgery token niet gevonden');
  return m[1];
}

async function postScenario(jar, token, params, scenario, team1Wins) {
  const form = buildNlpadelForm({
    token, ...params, sets: scenario.sets, superTiebreak: scenario.superTiebreak, team1Wins,
  });
  const resp = await jarFetch(jar, NLPADEL_URL, {
    method: 'POST',
    body: new URLSearchParams(form),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: NLPADEL_URL },
  });
  return resp;
}

// ── public API ───────────────────────────────────────────────────────────────

// ratings: [R1,R2,R3,R4] numbers; genders: 4× 'm'/'v'/'male'/'female'.
export async function fetchAllDeltas({ ratings, genders }) {
  const [R1, R2, R3, R4] = ratings.map(Number);
  const params = { R1, R2, R3, R4, genders: (genders || []).map(normalizeGender) };

  const jar = {};
  let token = await getToken(jar);

  const run = async (scenario, team1Wins) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const resp = await postScenario(jar, token, params, scenario, team1Wins);
      if (resp.ok) return parseNlpadelResponse(await resp.text()).deltaTeam1;
      token = await getToken(jar); // refresh token+cookies, then retry
    }
    throw new Error(`nlpadel POST bleef falen voor ${scenario.label}`);
  };

  const winDeltas = [];
  for (const s of WIN_SCENARIOS) winDeltas.push(await run(s, true));
  const lossDeltas = [];
  for (const s of LOSS_SCENARIOS) lossDeltas.push(await run(s, false));
  return { winDeltas, lossDeltas };
}
