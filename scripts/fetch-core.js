'use strict';

// Shared KNLTB + nlpadel fetch logic, used by both the CLI
// (knltb-fetch-ratings.js) and the local web server (server.js).
//
// Two endpoints, one logged-in KNLTB SSO session (persistent Playwright
// context at scripts/.knltb-userdata/):
//   - mijnknltb.toernooi.nl   → player names (h2h page) + padel-dubbel ratings
//   - nlpadel.nl rekentool    → the 18 score-weighted deltas
//
// Gender is NOT published on KNLTB, so callers guess it (guessGender) and
// confirm with the user before fetching deltas — it materially changes the
// result whenever the two teams differ in gender mix.

const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(__dirname, '.knltb-userdata');
const NLPADEL_URL =
  'https://www.nlpadel.nl/alles-over-padel/speel-padel/speelsterkte-rating/speelsterkte-rekentool/';

const { WIN_SCENARIOS, LOSS_SCENARIOS } = require(path.join(ROOT, 'scenarios.js'));

// ── URL parsing ──────────────────────────────────────────────────────────────

function parseHeadToHeadUrl(input) {
  const u = new URL(input);
  const org = u.searchParams.get('OrganizationCode');
  const ids = ['T1P1MemberID', 'T1P2MemberID', 'T2P1MemberID', 'T2P2MemberID']
    .map(k => u.searchParams.get(k));
  if (!org || ids.some(v => !v)) {
    throw new Error(
      'URL mist OrganizationCode of een van T1P1/T1P2/T2P1/T2P2 MemberID query-parameters.'
    );
  }
  return { org, ids };
}

function profileUrl(orgCode, memberId) {
  const slug = Buffer.from(`base64:${memberId}`, 'utf8').toString('base64');
  return `https://mijnknltb.toernooi.nl/player/${orgCode.toUpperCase()}/${slug}`;
}

// ── gender helpers ───────────────────────────────────────────────────────────

// Normalize a gender token ("m","v","f","man","vrouw","heren","dames","male",
// "female") to the 'male'/'female' values nlpadel expects.
function normalizeGender(s) {
  if (!s) return null;
  const t = String(s).trim().toLowerCase();
  if (/^(v|f|vrouw|dame|dames|female|w)/.test(t)) return 'female';
  if (/^(m|man|heren|male)/.test(t)) return 'male';
  return null;
}

// Guess gender from the first name purely to pre-fill the confirmation step.
// Short list of common Dutch names + simple endings; unknown → 'male'.
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

// ── small utils ──────────────────────────────────────────────────────────────

function dutchToNumber(s) { return Number.parseFloat(String(s).trim().replace(',', '.')); }
function numberToDutch(n) { return String(n).replace('.', ','); }

// Cheap concurrency limiter — no library needed for ~18 small tasks.
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

// ── shared persistent context (serialized: one launch at a time) ──────────────

// launchPersistentContext locks the user-data dir, so concurrent launches fail.
// Serialize all browser work through a single promise chain.
let chain = Promise.resolve();
function withContext(fn) {
  const run = chain.then(async () => {
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: true,
      viewport: { width: 1280, height: 900 },
    });
    try {
      const page = context.pages()[0] || (await context.newPage());
      return await fn(context, page);
    } finally {
      await context.close();
    }
  });
  // keep the chain alive even if this run rejects
  chain = run.then(() => {}, () => {});
  return run;
}

// ── KNLTB scraping ───────────────────────────────────────────────────────────

async function scrapeNames(page, url, profileUrls) {
  const slugs = profileUrls.map(u => u.split('/').pop());
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(1000);
  return await page.evaluate((wanted) => {
    return wanted.map((slug) => {
      const a = document.querySelector(`a[href$="/${slug}"]`);
      return a ? (a.textContent || '').trim().replace(/\s+/g, ' ') || null : null;
    });
  }, slugs);
}

async function extractRating(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('span[title="Padel Dubbel"] .tag-duo__value')
    .first().waitFor({ state: 'attached', timeout: 10_000 });
  const raw = await page
    .locator('span[title="Padel Dubbel"] .tag-duo__value').first().innerText();
  const rating = dutchToNumber(raw);
  if (!Number.isFinite(rating)) throw new Error(`Kon rating "${raw}" niet lezen van ${url}`);
  return rating;
}

// High-level: from an h2h URL, get the 4 names (h2h page) + ratings (profiles).
// Gender does not depend on this, so it can be confirmed afterwards.
async function scrapeNamesAndRatings(url, { onProgress = () => {} } = {}) {
  const { org, ids } = parseHeadToHeadUrl(url);
  const profileUrls = ids.map(id => profileUrl(org, id));
  return withContext(async (context, page) => {
    const names = await scrapeNames(page, url, profileUrls).catch(() => profileUrls.map(() => null));
    const ratings = [];
    for (let i = 0; i < profileUrls.length; i++) {
      const rating = await extractRating(page, profileUrls[i]);
      ratings.push(rating);
      onProgress(`P${i + 1} (${ids[i]}): ${rating}${names[i] ? ` — ${names[i]}` : ''}`);
    }
    return { org, ids, profileUrls, names, ratings };
  });
}

// ── nlpadel rekentool ────────────────────────────────────────────────────────

async function getAntiForgeryToken(ctx) {
  const resp = await ctx.request.get(NLPADEL_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (knltb-rekentool)' },
  });
  if (!resp.ok()) throw new Error(`GET nlpadel form mislukt: ${resp.status()}`);
  const html = await resp.text();
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!m) throw new Error('Anti-forgery token niet gevonden in nlpadel-formulier');
  return m[1];
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
  // The deltas are strictly zero-sum. If they aren't, we parsed the wrong page
  // (e.g. an SSO/redirect 200 instead of the result) or nlpadel's layout
  // changed — fail loudly rather than show a plausible-but-wrong rating change.
  if (Math.abs(deltaTeam1 + deltaTeam2) > 0.001) {
    throw new Error(`nlpadel-respons niet zero-sum (Δ1=${deltaTeam1}, Δ2=${deltaTeam2}) — verkeerde pagina geparset?`);
  }
  return { deltaTeam1, deltaTeam2 };
}

async function fetchScenarioDelta(ctx, params, scenario, team1Wins) {
  const token = await getAntiForgeryToken(ctx); // single-use per request
  const form = buildNlpadelForm({
    token, ...params, sets: scenario.sets, superTiebreak: scenario.superTiebreak, team1Wins,
  });
  const resp = await ctx.request.post(NLPADEL_URL, { form, headers: { Referer: NLPADEL_URL } });
  if (!resp.ok()) throw new Error(`POST nlpadel gaf ${resp.status()} voor ${scenario.label}`);
  return parseNlpadelResponse(await resp.text());
}

// High-level: fetch all 18 deltas for the given ratings + genders.
async function fetchAllDeltas({ ratings, genders, onProgress = () => {} }) {
  const [R1, R2, R3, R4] = ratings;
  const params = { R1, R2, R3, R4, genders };
  return withContext(async (context) => {
    const winDeltas = await mapWithLimit(WIN_SCENARIOS, 4, (s, i) =>
      fetchScenarioDelta(context, params, s, true)
        .then(r => { onProgress(`W${i + 1} ${s.label}: ${r.deltaTeam1}`); return r.deltaTeam1; }));
    const lossDeltas = await mapWithLimit(LOSS_SCENARIOS, 4, (s, i) =>
      fetchScenarioDelta(context, params, s, false)
        .then(r => { onProgress(`L${i + 1} ${s.label}: ${r.deltaTeam1}`); return r.deltaTeam1; }));
    return { winDeltas, lossDeltas };
  });
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

module.exports = {
  ROOT, USER_DATA_DIR, WIN_SCENARIOS, LOSS_SCENARIOS,
  parseHeadToHeadUrl, profileUrl, normalizeGender, guessGender,
  scrapeNamesAndRatings, fetchAllDeltas, buildCalcQuery,
};