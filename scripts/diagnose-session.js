'use strict';

// Diagnostic: load the FIRST player profile from a head-to-head URL using the
// stored KNLTB session and report what the page actually shows — so we can tell
// an expired login apart from a changed selector.
//
// Usage: node scripts/diagnose-session.js "<head-to-head URL>"

const path = require('path');
const { chromium } = require('playwright');

const USER_DATA_DIR = path.join(__dirname, '.knltb-userdata');

function parseHeadToHeadUrl(input) {
  const u = new URL(input);
  const org = u.searchParams.get('OrganizationCode');
  const ids = ['T1P1MemberID', 'T1P2MemberID', 'T2P1MemberID', 'T2P2MemberID']
    .map(k => u.searchParams.get(k));
  return { org, ids };
}

function profileUrl(orgCode, memberId) {
  const slug = Buffer.from(`base64:${memberId}`, 'utf8').toString('base64');
  return `https://mijnknltb.toernooi.nl/player/${orgCode.toUpperCase()}/${slug}`;
}

(async () => {
  const url = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!url) { console.error('Pass the head-to-head URL.'); process.exit(2); }

  const { org, ids } = parseHeadToHeadUrl(url);
  const target = profileUrl(org, ids[0]);
  console.error(`OrganizationCode: ${org}`);
  console.error(`Profile URL:      ${target}\n`);

  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2500); // let any JS / redirects settle

  const finalUrl = page.url();
  const title = await page.title();
  const looksLikeLogin =
    /login|signin|sso|account|auth/i.test(finalUrl) ||
    (await page.locator('input[type="password"]').count()) > 0;

  const padelDuoCount = await page.locator('span[title="Padel Dubbel"] .tag-duo__value').count();
  const anyTagDuo = await page.locator('.tag-duo__value').count();
  const tagTitles = await page.locator('[title]').evaluateAll(els =>
    [...new Set(els.map(e => e.getAttribute('title')).filter(Boolean))]
      .filter(t => /padel|tennis|dubbel|enkel/i.test(t))
  );

  console.error(`Final URL:        ${finalUrl}`);
  console.error(`Page title:       ${title}`);
  console.error(`Looks like login: ${looksLikeLogin}`);
  console.error(`Padel-Dubbel hits: ${padelDuoCount}`);
  console.error(`All .tag-duo__value on page: ${anyTagDuo}`);
  console.error(`Rating-ish [title] values: ${JSON.stringify(tagTitles)}`);

  const bodyText = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
  console.error(`\n--- first 400 chars of body text ---\n${bodyText}`);

  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });