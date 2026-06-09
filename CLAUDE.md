# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                          # run all tests
node --test tests/calculator.test.js  # run a single test file
npm start                         # local web app at http://localhost:3000 (paste URL → confirm gender → calc)
npx serve .                       # serve static calculator only (no fetch UI)
open index.html                   # open directly in browser (file://)

# CLI: pull 4 KNLTB padel ratings + 18 nlpadel deltas, then open the calculator:
node scripts/knltb-fetch-ratings.js "<mijnknltb head-2-head URL>" --open

# Public manual-entry page proxy (Cloudflare Worker in proxy/):
npm run proxy:dev                 # local worker at http://localhost:8787
npm run proxy:deploy              # deploy → set the URL as DELTAS_API in app.js
```

No build step required. (A browser extension was removed in favour of the manual-entry
webpage + proxy; see git history if you need it.)

## Architecture

Standalone web page (no build step, no framework) that displays DSS (Dutch padel rating system) rating-change scenarios for doubles matches. The page itself does **not** compute deltas — those come from the official nlpadel.nl rekentool via a local Node + Playwright helper.

**Local calculation layer** (`calculator.js`, `config.js`, `scenarios.js`):
- `config.js` — DSS constants: `q=2.012`, `K=0.275`, `θ=0.5`
- `calculator.js` — `calcPadel(R1,R2,R3,R4)` returns combined ratings + win probability (logistic sigmoid). The score-weighted delta math has been removed because the formula is not public and reverse-engineered approximations diverged from nlpadel for several scenarios.
- `scenarios.js` — `WIN_SCENARIOS` + `LOSS_SCENARIOS` (9 each). Shared between the browser UI and the Node fetcher; **order is significant** because the URL-encoded delta lists rely on it.

**Web UI** (`index.html`, `app.js`, `style.css`):
- `app.js` reads `R1..R4` and pre-fetched deltas (`w`, `l`) from the URL query string (also accepts hash, for resilience to macOS `open` quirks).
- Renders combined ratings + win probability locally; renders the 18-row delta table only when pre-fetched data is present. Without pre-fetched data, shows a hint pointing at the CLI.
- KNLTB brand colors: blue `#003087`, orange `#F47920`.

**KNLTB / nlpadel integration** (`scripts/fetch-core.js` — shared module):
- `fetch-core.js` holds all the reusable fetch logic and is required by **both** the CLI (`scripts/knltb-fetch-ratings.js`) and the local web server (`server.js`). Exports: `scrapeNamesAndRatings(url)`, `fetchAllDeltas({ratings,genders})`, `buildCalcQuery(...)`, plus `guessGender`/`normalizeGender`/`parseHeadToHeadUrl`/`profileUrl`.
- `withContext()` serializes all Playwright work through one promise chain — `launchPersistentContext` locks `scripts/.knltb-userdata/`, so concurrent launches would fail (matters for the server handling overlapping requests).
- Reuses a logged-in KNLTB SSO session stored in `scripts/.knltb-userdata/` (Playwright persistent context).
- Parses `T1P1MemberID..T2P2MemberID` from a mijnknltb head-2-head URL. Builds each player-profile URL as `/player/<ORG_UUID_UPPER>/<base64("base64:" + memberID)>`.
- Scrapes the *padel-dubbel* rating from `span[title="Padel Dubbel"] > .tag-duo__value` on each profile. The h2h page itself displays a player's **tennis enkel** rating, not padel — never extract from there.
- Scrapes each player's **name** from the h2h page's `/player/<slug>` anchors (matched by slug → reliable, in T1P1..T2P2 order). **Gender is not published anywhere on KNLTB profile/h2h pages** (verified: no meta, icon, gendered rating category, or sex field — only the name differs). So gender is *guessed* from the first name (`guessGender`, small Dutch name list + endings) and **confirmed via an interactive prompt** (`promptGenders`); non-interactive stdin uses the guess. Manual override `--genders=m,m,v,v` (T1P1..T2P2) skips the prompt entirely. Gender feeds the nlpadel form fields `ghp1/ghp2/gvp1/gvp2` and **materially changes the deltas** whenever the two teams differ in gender mix (e.g. ♀♀ vs ♂♂ ≠ ♂♂ vs ♂♂; same-gender-on-both-sides is symmetric, so ♀♀vs♀♀ == ♂♂vs♂♂).
- POSTs the 18 scenarios to nlpadel.nl's rekentool form (`__RequestVerificationToken` is single-use; refetch GET → POST per scenario). Runs at concurrency 4. The rekentool requires KNLTB SSO; the same persistent context handles it.
- `--open` writes a tiny temp redirect page in `os.tmpdir()` and opens *that*, because macOS `open` drops the query string from a `file://…?…` URL (treats it as a literal path). The redirect JS-navigates to the full calculator URL, preserving the query.

**Public manual-entry page + nlpadel proxy** (`proxy/`, `app.js` manual mode):
- The hosted calculator is a no-login, no-install tool: the Spelers card has name + rating + ♂/♀ inputs per player and a **Bereken** button. `fetchDeltas` in `app.js` POSTs `{ratings, genders}` to `DELTAS_API`, sets `prefetchedWin/LossDeltas`, and reuses `renderMatrix`. The deep-link path (`?w=&l=` from the CLI) is unchanged.
- A browser page **cannot** call nlpadel directly — not auth (nlpadel needs none) but **CORS** (no `Access-Control-Allow-Origin`) + a **`SameSite=Strict; HttpOnly` antiforgery cookie** that never rides cross-site. So `proxy/` is a Cloudflare Worker that relays: `POST /deltas {ratings,genders}` → `{winDeltas,lossDeltas}`. Anonymous, stateless, no secrets.
- `proxy/nlpadel-core.mjs` is host-agnostic (global `fetch`, no Playwright). It mirrors `buildNlpadelForm`/`parseNlpadelResponse`/scenarios from `scripts/fetch-core.js` (a 2nd copy — keep identical). Its one new piece is `jarFetch`: a manual redirect-follower that carries cookies through nlpadel's `id.knltb.nl` SSO bounce (plain `fetch` fails there with "redirect count exceeded"). `fetchAllDeltas` gets the antiforgery token once, then POSTs the 18 scenarios serially with retry + `Referer` (concurrent POSTs race into HTTP 400).
- **Faster input** (in a `<details>` "Sneller invoeren"): `app.js` `parsePasted()` fills the rating/name inputs from a pasted blob; and `bookmarklet.js` (served on Pages, loaded via a tiny `javascript:` loader link in `index.html`) runs ON a mijnknltb head-2-head page, same-origin-scrapes the 4 padel ratings + names with the user's login, guesses gender, and opens the calculator with the existing `?R1..&n=&g=` deep-link (no server, reuses the retired extension's scrape logic; needs a real browser UA — KNLTB strips ratings for HeadlessChrome). Add new top-level static files to the `cp` list in `.github/workflows/pages.yml`.
- `DELTAS_API` in `app.js` must point at the deployed Worker URL; the hosted page is non-functional until it does. Verified in Node and live: `worker.fetch()` + `nlpadel-core` reproduce the known-good 18 deltas against live nlpadel.

**Local web app** (`server.js`, `npm start`):
- Plain Node `http` server (no deps beyond `fetch-core`). Serves the static calculator AND a two-step fetch UI. A static page can't do the fetch itself (CORS + needs the KNLTB session), so the server does all cross-site work server-side via `fetch-core`.
- Routes: `GET /` start form (paste h2h URL) → `GET /prepare?url=` scrapes names+ratings and renders a gender-confirm form pre-filled with `guessGender` (ratings/names passed via hidden fields, so they aren't re-scraped) → `GET /fetch?r=&n=&g0..g3=` fetches the 18 deltas and 302-redirects to `/index.html?<buildCalcQuery>`. Everything else is served as a static file from `ROOT`.
- Split is deliberate: ratings/names don't depend on gender (fetched in `/prepare`); only the gender-dependent deltas are fetched in `/fetch` after confirmation. `friendly()` maps session-expiry/timeout errors to a Dutch re-login hint.

**Tests** (`tests/calculator.test.js`):
- Node built-in `node:test` + `assert/strict`, Node ≥ 18.
- 8 tests covering DSS config, combined ratings, and the win-probability sigmoid only. Score-weighted delta validation lives in `scripts/collect-nlpadel-data.js` (kept for historical reference / regression spot-checks against nlpadel).

## Domain notes

- **Lower rating = better.** Scale runs **0 → 11** (lower = stronger). Input validation (app.js + proxy worker.js) accepts `0..11`.
- Calculator URL format: `index.html?R1=...&R2=...&R3=...&R4=...&n=name1,...,name4&g=m,m,v,v&w=d1,...,d9&l=d1,...,d9`. `n` is up to 4 URL-encoded player names (blank → "Speler N" fallback); `g` is one gender letter per player (`m`/`v`, shown as ♂/♀). The `w`/`l` arrays are signed deltas with 4 decimals, in the order defined by `scenarios.js`.
- Zero-sum: `delta_team1 + delta_team2 = 0` always. The UI shows `delta_team2 = −delta_team1`.
