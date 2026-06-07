// MV3 service worker: fetches the 18 nlpadel deltas. The rekentool needs no
// login, but it IS cross-origin to the page — content scripts can't read the
// response, so the network work happens here (host_permissions grant access),
// and the result is messaged back to the content script.

// Chrome runs this as a service worker (only background.js is loaded) so it must
// pull in the deps. Firefox runs it as an event page via manifest
// background.scripts (which already loaded scenarios.js + shared.js), where
// importScripts doesn't exist — hence the guard.
if (typeof importScripts === 'function') {
  importScripts('scenarios.js', 'shared.js');
}

const NLPADEL_URL =
  'https://www.nlpadel.nl/alles-over-padel/speel-padel/speelsterkte-rating/speelsterkte-rekentool/';

// One anti-forgery token for the whole batch: it's reusable (not single-use),
// and fetching it once avoids concurrent token-GETs clobbering each other's
// paired cookie in the shared browser cookie store (which caused HTTP 400s).
async function getAntiForgeryToken() {
  const resp = await fetch(NLPADEL_URL, { credentials: 'include' });
  if (!resp.ok) throw new Error(`GET nlpadel mislukt: ${resp.status}`);
  const html = await resp.text();
  const m = html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!m) throw new Error('Anti-forgery token niet gevonden');
  return m[1];
}

async function postScenario(token, params, scenario, team1Wins) {
  const form = buildNlpadelForm({
    token, ...params, sets: scenario.sets, superTiebreak: scenario.superTiebreak, team1Wins,
  });
  return fetch(NLPADEL_URL, {
    method: 'POST',
    credentials: 'include',
    // Referer is required — without it nlpadel rejects the antiforgery POST (400).
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': NLPADEL_URL },
    body: new URLSearchParams(form),
  });
}

// nlpadel rotates the antiforgery cookie on each response, so a single token
// reused across *staggered concurrent* POSTs intermittently 400s. Running the
// 18 POSTs serially (one reused token) is reliable; on the rare 400 we refetch
// the token and retry. ~18 quick POSTs ≈ a few seconds.
async function fetchAllDeltas({ ratings, genders }) {
  const [R1, R2, R3, R4] = ratings;
  const params = { R1, R2, R3, R4, genders };
  let token = await getAntiForgeryToken();

  const run = async (scenario, team1Wins) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const resp = await postScenario(token, params, scenario, team1Wins);
      if (resp.ok) return parseNlpadelResponse(await resp.text()).deltaTeam1;
      token = await getAntiForgeryToken(); // refresh paired cookie+token, then retry
    }
    throw new Error(`POST nlpadel bleef falen voor ${scenario.label}`);
  };

  const winDeltas = [];
  for (const s of WIN_SCENARIOS) winDeltas.push(await run(s, true));
  const lossDeltas = [];
  for (const s of LOSS_SCENARIOS) lossDeltas.push(await run(s, false));
  return { winDeltas, lossDeltas };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'fetchDeltas') {
    fetchAllDeltas({ ratings: msg.ratings, genders: msg.genders })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: String(err && err.message || err) }));
    return true; // keep the message channel open for the async response
  }
});
