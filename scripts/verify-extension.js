'use strict';

// End-to-end check of the browser extension: loads it + the existing logged-in
// KNLTB session, drives a real h2h page, and (optionally) asserts the opened
// calculator URL carries known-good deltas.
//
// No personal data is hardcoded — supply a real head-2-head URL (and optional
// expected values for regression) via env vars:
//   KNLTB_H2H_URL='https://mijnknltb.toernooi.nl/head-2-head?...' \
//   KNLTB_EXPECT_G=f,f,m,m KNLTB_EXPECT_W='-0.34,...' KNLTB_EXPECT_L='0.15,...' \
//   node scripts/verify-extension.js
// Keep your real fixtures out of git (e.g. a local, gitignored env file).

const path = require('path');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..', 'extension');
const USER_DATA_DIR = path.join(__dirname, '.knltb-userdata');
const H2H = process.env.KNLTB_H2H_URL;
if (!H2H) {
  console.error('Set KNLTB_H2H_URL to a mijnknltb head-2-head URL to run this check.');
  process.exit(2);
}
const EXPECT_G = process.env.KNLTB_EXPECT_G || null; // e.g. "f,f,m,m"
const EXPECT_W = process.env.KNLTB_EXPECT_W || null;
const EXPECT_L = process.env.KNLTB_EXPECT_L || null;

(async () => {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false, // extensions require a headed (or --headless=new) context
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    const page = ctx.pages()[0] || (await ctx.newPage());
    page.on('console', m => console.log('  [page]', m.type(), m.text()));
    page.on('pageerror', e => console.log('  [pageerror]', e.message));
    ctx.on('serviceworker', sw => {
      console.log('  [sw] registered', sw.url());
      sw.on('console', m => console.log('  [sw]', m.type(), m.text()));
    });
    await page.goto(H2H, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.waitForSelector('#knltb-rekentool-btn', { timeout: 15_000 });
    console.log('✓ button injected');

    await page.click('#knltb-rekentool-btn');
    await page.waitForSelector('.krt-go', { timeout: 30_000 }); // after ratings fetch
    const names = await page.$$eval('.krt-name', els => els.map(e => e.textContent));
    const genders = await page.$$eval('.krt-select', els => els.map(e => e.value));
    console.log('✓ confirm modal:', names.map((n, i) => `${n}(${genders[i]})`).join(', '));

    const newPagePromise = ctx.waitForEvent('page', { timeout: 45_000 }).catch(() => null);
    await page.click('.krt-go');
    let calc = await newPagePromise;
    if (!calc) {
      const body = await page.locator('.krt-body').innerText().catch(() => '(gone)');
      console.log('  [no new tab] modal body:', JSON.stringify(body));
      throw new Error('No calculator tab opened — see modal body / logs above.');
    }
    await calc.waitForLoadState('domcontentloaded');
    const url = calc.url();

    const w = decodeURIComponent((url.match(/[?&]w=([^&]*)/) || [])[1] || '');
    const l = decodeURIComponent((url.match(/[?&]l=([^&]*)/) || [])[1] || '');
    const g = (url.match(/[?&]g=([^&]*)/) || [])[1] || '';
    console.log('✓ calculator opened:', calc.url().slice(0, 80) + '…');
    console.log('  g =', g);
    console.log('  w =', w);
    console.log('  l =', l);

    // Each assertion is skipped (treated as pass) when no expected value is set.
    const check = (actual, expected) => expected == null ? 'skip' : (actual === expected ? 'OK' : 'FAIL');
    const rW = check(w, EXPECT_W), rL = check(l, EXPECT_L), rG = check(g, EXPECT_G);

    // Render check is best-effort: when CALC_URL points at GitHub Pages it only
    // renders once Pages is deployed. The pipeline assertion (g/w/l) is the gate.
    const rowsVisible = await calc.locator('#winBody tr').count().catch(() => 0);
    const isRemote = /^https?:/i.test(url);
    const renderNote = rowsVisible === 9
      ? 'OK (9 rows)'
      : isRemote ? 'skipped (hosted calculator not deployed yet)' : 'FAIL';
    if (rowsVisible === 9) {
      const label1 = await calc.locator('label[for="r1"]').innerText().catch(() => '');
      console.log(`  rendered label r1="${label1}"`);
    }

    const pipelineFailed = [rW, rL, rG].includes('FAIL');
    console.log(`\nRESULT: g ${rG} | w ${rW} | l ${rL} | render ${renderNote}`);
    if (pipelineFailed || (!isRemote && rowsVisible !== 9)) process.exitCode = 1;
  } finally {
    await ctx.close();
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
