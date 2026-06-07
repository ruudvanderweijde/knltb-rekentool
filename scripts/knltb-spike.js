'use strict';

// Playwright spike for mijnknltb head-to-head → player ratings.
// First run: a Chromium window opens and pauses on the login page; log in
// manually, then resume the Playwright Inspector. Subsequent runs reuse the
// session via a persistent user-data dir.
//
// Usage:
//   node scripts/knltb-spike.js "<head-to-head URL>"
//   node scripts/knltb-spike.js --login-only            (just sign in, no h2h)
//   node scripts/knltb-spike.js --reset                 (wipe stored session)

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const USER_DATA_DIR = path.join(__dirname, '.knltb-userdata');
const OUT_DIR = path.join(__dirname, 'knltb-spike-output');
const DOM_DIR = path.join(OUT_DIR, 'dom');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');
const NETWORK_LOG = path.join(OUT_DIR, 'network.jsonl');
const FINDINGS_PATH = path.join(OUT_DIR, 'findings.md');

const LOGIN_URL = 'https://mijnknltb.toernooi.nl/';

function ensureDirs() {
  for (const d of [OUT_DIR, DOM_DIR, SHOT_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { url: null, loginOnly: false, reset: false };
  for (const a of args) {
    if (a === '--login-only') opts.loginOnly = true;
    else if (a === '--reset') opts.reset = true;
    else if (a.startsWith('http')) opts.url = a;
    else if (!a.startsWith('--')) opts.url = a;
  }
  return opts;
}

function attachNetworkRecorder(context, phaseRef) {
  const stream = fs.createWriteStream(NETWORK_LOG, { flags: 'a' });

  context.on('request', (req) => {
    const rec = {
      ts: new Date().toISOString(),
      phase: phaseRef.value,
      kind: 'request',
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
    };
    stream.write(JSON.stringify(rec) + '\n');
  });

  context.on('response', async (resp) => {
    const req = resp.request();
    const url = resp.url();
    const contentType = resp.headers()['content-type'] || '';
    let bodySnippet = null;

    // Only sniff JSON / text responses; never blobs/images.
    if (/json|text|javascript|xml/i.test(contentType)) {
      try {
        const buf = await resp.body();
        bodySnippet = buf.slice(0, 2048).toString('utf8');
      } catch {
        // Some responses (redirects, aborted) can't be read.
      }
    }

    const rec = {
      ts: new Date().toISOString(),
      phase: phaseRef.value,
      kind: 'response',
      url,
      method: req.method(),
      status: resp.status(),
      contentType,
      resourceType: req.resourceType(),
      bodySnippet,
    };
    stream.write(JSON.stringify(rec) + '\n');
  });

  return () => stream.end();
}

function safeName(s) {
  return s.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80);
}

async function savePageArtifacts(page, label) {
  const html = await page.content();
  fs.writeFileSync(path.join(DOM_DIR, `${label}.html`), html);
  await page.screenshot({ path: path.join(SHOT_DIR, `${label}.png`), fullPage: true });
}

async function collectPlayerLinks(page) {
  // Heuristic: head-to-head page links to player profiles. Selectors will be
  // confirmed during the spike — try several candidates.
  return page.evaluate(() => {
    const candidates = new Set();
    const anchors = [...document.querySelectorAll('a[href]')];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      // Common patterns: /player/<id>, /speler/<id>, /profile/<id>
      if (/\/(player|players|speler|spelers|profile)\//i.test(href)) {
        candidates.add(new URL(href, location.href).toString());
      }
    }
    return [...candidates];
  });
}

async function writeFindingsTemplate(opts) {
  if (fs.existsSync(FINDINGS_PATH)) return; // don't overwrite prior notes
  const tpl = `# KNLTB spike — findings

Spike run: ${new Date().toISOString()}
Input head-to-head URL: ${opts.url || '(none — login-only run)'}

## 1. URL patterns observed

- Login flow: see ${path.relative(ROOT, NETWORK_LOG)} (filter \`phase=login\`)
- Head-to-head URL host:
- Player profile URL pattern:

## 2. Rating extraction path

Tick the option that best matches what the network log / DOM shows:

- [ ] **Internal JSON API** (preferred)
  - Endpoint:
  - Auth header / cookie:
  - JSON field for padel rating:
- [ ] **DOM scrape from profile page**
  - Selector:
  - Notes on multi-rating disambiguation (tennis vs padel):

## 3. Session persistence

- [ ] Confirmed: re-running the script without manual login worked.
- [ ] Failed: session expired after ___ / requires re-login each time.

## 4. Anti-bot / rate-limit signals

- Cloudflare / hCaptcha / Recaptcha challenge? (yes / no / details)
- Any 429s or unusual headers in the network log?

## 5. Next-step recommendation

(One sentence: which path to take for Stage 2.)
`;
  fs.writeFileSync(FINDINGS_PATH, tpl);
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.reset) {
    if (fs.existsSync(USER_DATA_DIR)) {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
      console.log(`Removed ${USER_DATA_DIR}`);
    } else {
      console.log('Nothing to reset.');
    }
    return;
  }

  if (!opts.url && !opts.loginOnly) {
    console.error('Usage: node scripts/knltb-spike.js "<head-to-head URL>"');
    console.error('   or: node scripts/knltb-spike.js --login-only');
    process.exit(2);
  }

  ensureDirs();

  // Truncate the network log per run so artifacts stay scoped to one session.
  fs.writeFileSync(NETWORK_LOG, '');

  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    slowMo: 80,
    viewport: { width: 1280, height: 900 },
  });

  const phaseRef = { value: 'init' };
  const closeNet = attachNetworkRecorder(context, phaseRef);

  const page = context.pages()[0] || (await context.newPage());

  // --- Phase: ensure logged in ---
  phaseRef.value = 'login';
  console.log(`Opening ${LOGIN_URL} — log in manually if prompted, then resume the Playwright Inspector.`);
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // Give the user a chance to log in. page.pause() opens the inspector so they
  // can click "Resume" once login is complete. If the session is already valid
  // they can just resume immediately.
  await page.pause();

  await savePageArtifacts(page, 'after-login');

  if (opts.loginOnly) {
    console.log('Login-only run complete. Session stored in', USER_DATA_DIR);
    closeNet();
    await writeFindingsTemplate(opts);
    await context.close();
    return;
  }

  // --- Phase: head-to-head page ---
  phaseRef.value = 'h2h';
  console.log(`Navigating to head-to-head: ${opts.url}`);
  await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
  } catch {
    console.log('(networkidle not reached within 15s — continuing)');
  }
  await savePageArtifacts(page, 'h2h');

  const playerLinks = await collectPlayerLinks(page);
  console.log(`Found ${playerLinks.length} candidate player links.`);
  for (const link of playerLinks) console.log('  -', link);

  // --- Phase: each player profile ---
  // Cap at 4 (head-to-head should have exactly 4); if the heuristic finds
  // more, the user can re-inspect the DOM dump.
  const limit = Math.min(playerLinks.length, 4);
  for (let i = 0; i < limit; i++) {
    const url = playerLinks[i];
    phaseRef.value = `player-${i + 1}`;
    console.log(`Visiting player ${i + 1}: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      try {
        await page.waitForLoadState('networkidle', { timeout: 15_000 });
      } catch {}
      await savePageArtifacts(page, `player-${i + 1}-${safeName(url)}`);
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
    }
  }

  // Pause one more time so the user can poke around manually before close.
  phaseRef.value = 'manual-inspection';
  console.log('Pausing for manual inspection. Resume the inspector to finish.');
  await page.pause();

  closeNet();
  await writeFindingsTemplate(opts);
  await context.close();

  console.log('\nDone. Outputs:');
  console.log('  Network log:', path.relative(ROOT, NETWORK_LOG));
  console.log('  DOM dumps:  ', path.relative(ROOT, DOM_DIR));
  console.log('  Screenshots:', path.relative(ROOT, SHOT_DIR));
  console.log('  Findings:   ', path.relative(ROOT, FINDINGS_PATH));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
