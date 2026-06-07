'use strict';

// End-to-end check of the browser extension: loads it + the existing logged-in
// KNLTB session, drives the real h2h page, and asserts the opened calculator
// URL carries the known-good deltas. Usage: node scripts/verify-extension.js

const path = require('path');
const { chromium } = require('playwright');

const EXT = path.resolve(__dirname, '..', 'extension');
const USER_DATA_DIR = path.join(__dirname, '.knltb-userdata');
const H2H = 'https://mijnknltb.toernooi.nl/head-2-head?OrganizationCode=ORGCODE&T1P1MemberID=PLAYER1&T1P2MemberID=PLAYER2&T2P1MemberID=PLAYER3&T2P2MemberID=PLAYER4';

const EXPECT_W = '-0.3408,-0.2782,-0.2366,-0.1949,-0.1741,-0.1532,-0.1324,-0.1532,-0.1116';
const EXPECT_L = '0.1592,0.0968,0.0551,0.0134,0,0,0,0,0';

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

    const okW = w === EXPECT_W, okL = l === EXPECT_L, okG = g === 'f,f,m,m';

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

    const pipelineOk = okG && okW && okL;
    console.log(`\nRESULT: g ${okG ? 'OK' : 'FAIL'} | w ${okW ? 'OK' : 'FAIL'} | l ${okL ? 'OK' : 'FAIL'} | render ${renderNote}`);
    if (!pipelineOk || (!isRemote && rowsVisible !== 9)) process.exitCode = 1;
  } finally {
    await ctx.close();
  }
})().catch(e => { console.error('ERR', e); process.exit(1); });
