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

# Browser extension (public delivery, per-user login):
npm run sync:ext                  # copy scenarios.js + calculator into extension/ (run before load/package)
node scripts/verify-extension.js  # end-to-end test: load ext + logged-in session, drive a real h2h page
```

No build step required.

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

**Browser extension** (`extension/`, MV3 — the public, per-user-login delivery):
- Why an extension and not a hosted site: a hosted page **cannot** use a visitor's KNLTB session (cross-origin CORS + cross-site cookies). Only code in the user's browser with `host_permissions` can. The extension does the whole flow client-side; no server, no shared account.
- `content.js` runs on `head-2-head*` pages: reads names from the live DOM (`/player/<slug>` anchors), fetches the 4 profiles **same-origin** (so the user's cookies ride along) and parses padel ratings, detects logout (`/user/login` redirect), shows the gender-confirm modal, then messages the background worker and opens the bundled calculator (`chrome.runtime.getURL('calculator/index.html')`) with the query string.
- `background.js` (service worker) does the 18 nlpadel POSTs — cross-origin fetches must happen here (content-script fetches are CORS-bound to the page origin); `host_permissions` let the worker read the responses.
- `shared.js` is the browser port of the pure helpers in `scripts/fetch-core.js` (guessGender, normalizeGender, buildNlpadelForm, parseNlpadelResponse, buildCalcQuery, mapWithLimit). **Keep the two in sync** — they're intentionally identical. Written as classic-script functions (no import/export) so they work both as a content script and via `importScripts()` in the worker, like `scenarios.js`.
- **Two non-obvious gotchas** (both found via `scripts/verify-extension.js`):
  1. `host_permissions` MUST include `https://id.knltb.nl/*` — nlpadel's GET bounces through an `id.knltb.nl` "checksession" SSO redirect before settling; without permission the worker can't follow it and `fetch` throws "Failed to fetch". (No KNLTB login is needed for nlpadel itself; the browser just carries cookies across the bounce.)
  2. The nlpadel POST MUST send a `Referer` header — without it, concurrent antiforgery POSTs race and return HTTP 400 (only ~half succeed). With `Referer` + concurrency 4 all 18 succeed, matching the Node version.
- `extension/scenarios.js` and `extension/calculator/` are generated by `npm run sync:ext` (gitignored). The extension bundles the calculator so it works offline; switch the `CALC_URL` constant in `content.js` to a GitHub Pages URL for shareable links.
- Verified end-to-end against the known-good test match (deltas `w=-0.3408,…`, `g=f,f,m,m`).

**Local web app** (`server.js`, `npm start`):
- Plain Node `http` server (no deps beyond `fetch-core`). Serves the static calculator AND a two-step fetch UI. A static page can't do the fetch itself (CORS + needs the KNLTB session), so the server does all cross-site work server-side via `fetch-core`.
- Routes: `GET /` start form (paste h2h URL) → `GET /prepare?url=` scrapes names+ratings and renders a gender-confirm form pre-filled with `guessGender` (ratings/names passed via hidden fields, so they aren't re-scraped) → `GET /fetch?r=&n=&g0..g3=` fetches the 18 deltas and 302-redirects to `/index.html?<buildCalcQuery>`. Everything else is served as a static file from `ROOT`.
- Split is deliberate: ratings/names don't depend on gender (fetched in `/prepare`); only the gender-dependent deltas are fetched in `/fetch` after confirmation. `friendly()` maps session-expiry/timeout errors to a Dutch re-login hint.

**Tests** (`tests/calculator.test.js`):
- Node built-in `node:test` + `assert/strict`, Node ≥ 18.
- 8 tests covering DSS config, combined ratings, and the win-probability sigmoid only. Score-weighted delta validation lives in `scripts/collect-nlpadel-data.js` (kept for historical reference / regression spot-checks against nlpadel).

## Domain notes

- **Lower rating = better.** Scale runs ~1 (professional) → ~9 (beginner). Real-world KNLTB ratings can exceed 9 — input validation accepts up to 12.
- Calculator URL format: `index.html?R1=...&R2=...&R3=...&R4=...&n=name1,...,name4&g=m,m,v,v&w=d1,...,d9&l=d1,...,d9`. `n` is up to 4 URL-encoded player names (blank → "Speler N" fallback); `g` is one gender letter per player (`m`/`v`, shown as ♂/♀). The `w`/`l` arrays are signed deltas with 4 decimals, in the order defined by `scenarios.js`.
- Zero-sum: `delta_team1 + delta_team2 = 0` always. The UI shows `delta_team2 = −delta_team1`.
