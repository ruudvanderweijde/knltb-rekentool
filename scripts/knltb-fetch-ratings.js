'use strict';

// Fetch padel-doubles ratings + names of the 4 players in a mijnknltb
// head-to-head URL, then fetch the 18 score-weighted deltas from nlpadel.nl.
// Prints a JSON summary plus a deep-link to the local calculator, and can open
// it. Gender is not on KNLTB, so it is guessed from the name and confirmed
// interactively (or set with --genders=m,m,v,v).
//
// Usage:
//   node scripts/knltb-fetch-ratings.js "<head-to-head URL>"
//   node scripts/knltb-fetch-ratings.js "<URL>" --open
//   node scripts/knltb-fetch-ratings.js "<URL>" --genders=v,v,m,m --open

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const {
  ROOT, WIN_SCENARIOS, LOSS_SCENARIOS,
  normalizeGender, guessGender,
  scrapeNamesAndRatings, fetchAllDeltas, buildCalcQuery,
} = require('./fetch-core');

const CALC_URL = `file://${path.join(ROOT, 'index.html')}`;

// Ask the user to confirm/correct the 4 genders, pre-filled with name guesses.
// Non-interactive (piped) stdin → returns the guesses unchanged.
function promptGenders(names, guesses) {
  const short = guesses.map(g => (g === 'female' ? 'v' : 'm'));
  if (!process.stdin.isTTY) {
    console.error(`  (niet-interactief: gok ${short.join(',')} — gebruik --genders om te overschrijven)`);
    return Promise.resolve(guesses);
  }
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  console.error('\n  Geslacht per speler (staat niet op KNLTB — controleer de gok):');
  names.forEach((n, i) => console.error(`    ${i + 1}. ${(n || `Speler ${i + 1}`).padEnd(22)} → ${short[i]}`));
  return new Promise((resolve) => {
    rl.question(`  Bevestig (m/v, komma-gescheiden) [${short.join(',')}]: `, (answer) => {
      rl.close();
      const a = answer.trim();
      if (!a) return resolve(guesses);
      const parts = a.split(',').map(normalizeGender);
      resolve(guesses.map((g, i) => parts[i] || g));
    });
  });
}

function openInBrowser(url) {
  // macOS `open` (and some xdg-open setups) treat a file:// URL with a query
  // string as a literal file path and silently drop everything after `?`.
  // Work around it via a tiny temp page that JS-redirects to the full URL.
  const redirect = path.join(os.tmpdir(), `knltb-rekentool-open.html`);
  fs.writeFileSync(
    redirect,
    `<!doctype html><meta charset="utf-8"><title>KNLTB Rekentool…</title>` +
    `<script>location.replace(${JSON.stringify(url)})</script>` +
    `<p>Doorverwijzen… <a href="${url.replace(/"/g, '&quot;')}">klik hier</a> als dit niet automatisch gebeurt.</p>`
  );
  const target = `file://${redirect}`;
  const cmd =
    process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  execFile(cmd, [target], (err) => {
    if (err) console.error(`Kon browser niet openen: ${err.message}`);
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const openFlag = argv.includes('--open');
  const url = argv.find(a => !a.startsWith('--'));
  if (!url) {
    console.error('Usage: node scripts/knltb-fetch-ratings.js "<head-to-head URL>" [--open] [--genders=m,m,v,v]');
    process.exit(2);
  }

  // Optional manual gender override: --genders=m,m,v,v (player order T1P1..T2P2).
  const genderArg = (argv.find(a => a.startsWith('--genders=')) || '').split('=')[1];
  const genderOverride = (genderArg ? genderArg.split(',') : []).map(normalizeGender);

  // 1. Names + ratings from KNLTB.
  const { ids, profileUrls, names, ratings } =
    await scrapeNamesAndRatings(url, { onProgress: m => console.error(`  ${m}`) });

  // 2. Confirm genders (override wins; otherwise guess + prompt).
  const genders = genderOverride.length === 4 && genderOverride.every(Boolean)
    ? genderOverride
    : await promptGenders(names, names.map((n, i) => genderOverride[i] || guessGender(n)));
  console.error(`  Geslacht: ${genders.map(g => g === 'female' ? 'v' : 'm').join(',')}`);

  // 3. The 18 deltas from nlpadel.
  console.error(`  ${WIN_SCENARIOS.length + LOSS_SCENARIOS.length} deltas ophalen van nlpadel.nl...`);
  const { winDeltas, lossDeltas } =
    await fetchAllDeltas({ ratings, genders, onProgress: m => console.error(`    ${m}`) });

  const query = buildCalcQuery({ ratings, names, genders, winDeltas, lossDeltas });
  const calcLink = `${CALC_URL}?${query}`;

  console.log(JSON.stringify({
    players: ids.map((id, i) => ({
      memberId: id, profileUrl: profileUrls[i],
      name: names[i], gender: genders[i], padelDoubles: ratings[i],
    })),
    winDeltas, lossDeltas, calculatorLink: calcLink,
  }, null, 2));

  if (openFlag) openInBrowser(calcLink);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});