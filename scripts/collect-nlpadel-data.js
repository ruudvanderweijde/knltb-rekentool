'use strict';

// Collect test data from the official nlpadel.nl rekentool.
// Usage: node scripts/collect-nlpadel-data.js

const { chromium } = require('playwright');

const URL = 'https://www.nlpadel.nl/alles-over-padel/speel-padel/speelsterkte-rating/speelsterkte-rekentool/';

const fmt = (n) => (n === '' ? '' : String(n).replace('.', ','));

const TEST_CASES = [
  // W1v: re-verify existing W1 test as sanity check
  { label: 'W1v', r1: 7.1093, r2: 7.5307, r3: 8.0000, r4: 7.6280, sets: [[6,0],[6,0]], stb: null, winner: 'thuis' },
  // W-series A: 7.1093/7.5307 vs 8.0/7.628 — extend to new T_eff values
  { label: 'WA_T8', r1: 7.1093, r2: 7.5307, r3: 8.0000, r4: 7.6280, sets: [[6,4],[6,4]], stb: null, winner: 'thuis' },
  { label: 'WA_T2', r1: 7.1093, r2: 7.5307, r3: 8.0000, r4: 7.6280, sets: [[6,1],[6,1]], stb: null, winner: 'thuis' },
  // E-series: same ratings, T_eff=1 (6-1, 6-0) — interpolation point
  { label: 'E_T1',  r1: 8.4901, r2: 6.8206, r3: 7.7091, r4: 8.7853, sets: [[6,1],[6,0]], stb: null, winner: 'thuis' },
  // E-series: verify previous results
  { label: 'E1', r1: 8.4901, r2: 6.8206, r3: 7.7091, r4: 8.7853, sets: [[6,4],[6,4]], stb: null, winner: 'thuis' },
  { label: 'E2', r1: 8.4901, r2: 6.8206, r3: 7.7091, r4: 8.7853, sets: [[6,2],[6,2]], stb: null, winner: 'thuis' },
  // Y-series: same combined rating as W4 (R12=7.11385) but with different opponent (R34=8.2472 like E-series)
  // R1=6.1, R2=8.1 → R12=7.1, diff≈-1.1472, winProb much higher; too high
  // Use R1=6.7, R2=7.5 → R12=7.1, R34=8.2472, diff=-1.1472
  { label: 'Y1_T0', r1: 6.7000, r2: 7.5000, r3: 7.7091, r4: 8.7853, sets: [[6,0],[6,0]], stb: null, winner: 'thuis' },
  { label: 'Y1_T4', r1: 6.7000, r2: 7.5000, r3: 7.7091, r4: 8.7853, sets: [[6,2],[6,2]], stb: null, winner: 'thuis' },
  // Z-series: same R34 as E-series (8.2472 combined) but with W-like own rating (R12≈7.32)
  // R1=7.5, R2=7.1 → R12=7.3, R34=8.2472
  { label: 'Z1_T0', r1: 7.5000, r2: 7.1000, r3: 7.7091, r4: 8.7853, sets: [[6,0],[6,0]], stb: null, winner: 'thuis' },
  { label: 'Z1_T4', r1: 7.5000, r2: 7.1000, r3: 7.7091, r4: 8.7853, sets: [[6,2],[6,2]], stb: null, winner: 'thuis' },
];

async function fillText(page, selector, value) {
  const loc = page.locator(selector);
  await loc.click({ clickCount: 3 });
  if (value === '') {
    await loc.press('Delete');
  } else {
    await loc.pressSequentially(fmt(value), { delay: 30 });
  }
}

async function runCase(page, tc) {
  // Ratings + gender (server requires gender selection)
  await fillText(page, '[name="hp1"]', tc.r1);
  await page.locator('[name="ghp1"]').selectOption('male');
  await fillText(page, '[name="hp2"]', tc.r2);
  await page.locator('[name="ghp2"]').selectOption('male');
  await fillText(page, '[name="vp1"]', tc.r3);
  await page.locator('[name="gvp1"]').selectOption('male');
  await fillText(page, '[name="vp2"]', tc.r4);
  await page.locator('[name="gvp2"]').selectOption('male');

  // Winner
  const radioId = tc.winner === 'thuis' ? '#HomeWinner' : '#VisitorWinner';
  await page.locator(radioId).check();

  // Set scores
  const sets = tc.sets;
  for (let s = 1; s <= 3; s++) {
    const val = sets[s - 1];
    await fillText(page, `[name="rhs${s}"]`, val ? val[0] : '');
    await fillText(page, `[name="rvs${s}"]`, val ? val[1] : '');
  }

  // Super tiebreak checkbox + scores
  const stbCb = page.locator('#rtbs3');
  const isChecked = await stbCb.isChecked();
  if (tc.stb && !isChecked) await stbCb.check();
  if (!tc.stb && isChecked) await stbCb.uncheck();

  if (tc.stb) {
    // STB scores go in the 3rd-set row (rhs3 / rvs3) after the checkbox is ticked
    await fillText(page, '[name="rhs3"]', tc.stb[0]);
    await fillText(page, '[name="rvs3"]', tc.stb[1]);
  }

  // Screenshot before submit for debugging
  await page.screenshot({ path: `scripts/before-submit-${tc.label}.png`, fullPage: false });

  // Submit and wait for page to reload with results
  await page.locator('input[value="Bereken rating"]').click();
  await page.waitForLoadState('networkidle', { timeout: 10_000 });

  // Extract results — page puts all computed values in <strong> elements in this order:
  // [0] thuis gecombineerd, [1] nr1, [2] nr2, [3] deltaTeam1 (negative),
  // [4] uit gecombineerd,   [5] nr3, [6] nr4, [7] deltaTeam2 (positive)
  const allStrong = await page.evaluate(() =>
    [...document.querySelectorAll('strong')]
      .map(el => el.textContent.trim())
      .filter(t => /^-?[\d,]+$/.test(t))
      .map(t => parseFloat(t.replace(',', '.')))
  );
  const result = {
    nr1:       allStrong[1],
    nr2:       allStrong[2],
    deltaTeam1: allStrong[3],
    nr3:       allStrong[5],
    nr4:       allStrong[6],
    deltaTeam2: allStrong[7],
  };

  return result;
}

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const page = await browser.newPage();

  console.log(`Navigeren naar ${URL} ...`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);

  // Dismiss cookie banner if present
  const allowAll = page.locator('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
  if (await allowAll.isVisible().catch(() => false)) {
    console.log('Cookie-banner wegklikken...');
    await allowAll.click();
    await page.waitForTimeout(1000);
  }

  // Wait for the form to be ready
  await page.locator('[name="hp1"]').waitFor({ state: 'visible', timeout: 10_000 });
  console.log('Formulier gereed.\n');

  const allResults = [];

  for (const tc of TEST_CASES) {
    // Navigate fresh to avoid stale state from previous POST
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.locator('[name="hp1"]').waitFor({ state: 'visible', timeout: 8_000 });

    console.log(`Invoeren: ${tc.label}  (sets: ${tc.sets.map(s => s.join('-')).join(', ')}${tc.stb ? ' STB '+tc.stb.join('-') : ''})`);
    try {
      const result = await runCase(page, tc);
      allResults.push({ tc, result });
      console.log(`  delta=${result.deltaTeam1}  nr1=${result.nr1} nr2=${result.nr2} nr3=${result.nr3} nr4=${result.nr4}\n`);
    } catch (err) {
      console.error(`  FOUT: ${err.message}\n`);
      allResults.push({ tc, result: null });
    }
  }

  // Dump HTML for debugging
  const fs = require('fs');
  fs.writeFileSync('scripts/result-page.html', await page.content());
  await page.screenshot({ path: 'scripts/results-page.png', fullPage: true });

  console.log('\n═══ Test assertions (klaar voor calculator.test.js) ═══\n');
  for (const { tc, result } of allResults) {
    if (!result) { console.log(`// ${tc.label}: FOUT\n`); continue; }
    const setsArg = JSON.stringify(tc.sets);
    const stbArg  = tc.stb ? `, ${JSON.stringify(tc.stb)}` : '';
    const scoreStr = tc.sets.map(s => s.join('-')).join(', ') + (tc.stb ? ' STB ' + tc.stb.join('-') : '');
    console.log(`test('${tc.label} (${scoreStr}): thuis wint, delta = ${result.deltaTeam1}', () => {`);
    console.log(`  const res = calcPadelScore(${tc.r1}, ${tc.r2}, ${tc.r3}, ${tc.r4}, ${setsArg}${stbArg});`);
    console.log(`  assert.equal(res.deltaTeam1,  ${result.deltaTeam1});`);
    console.log(`  assert.equal(res.deltaTeam2, +${result.deltaTeam2});`);
    console.log(`  assert.equal(res.newRating1,  ${result.nr1});`);
    console.log(`  assert.equal(res.newRating2,  ${result.nr2});`);
    console.log(`  assert.equal(res.newRating3,  ${result.nr3});`);
    console.log(`  assert.equal(res.newRating4,  ${result.nr4});`);
    console.log('});\n');
  }

  await page.waitForTimeout(10_000);
  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
