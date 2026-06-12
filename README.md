# KNLTB Padel Rekentool

### 👉 [Open de rekentool](https://ruudvanderweijde.github.io/knltb-rekentool/) — **live, geen login of installatie**

Bereken de DSS-ratingwijziging per uitslag voor een padel-dubbelpartij: vul de vier
*padel-dubbel* ratings in en zie wat elke score met je rating doet. De 18 uitslag-scenario's
komen van de officiële [nlpadel.nl rekentool][rekentool].

> **Onofficieel.** Niet gelieerd aan of goedgekeurd door de KNLTB of nlpadel. Gebruik op
> eigen risico en respecteer de voorwaarden van de KNLTB. Er worden geen accounts of
> persoonsgegevens opgeslagen.

[rekentool]: https://www.nlpadel.nl/alles-over-padel/speel-padel/speelsterkte-rating/speelsterkte-rekentool/

## De webpagina (geen login, geen installatie)

Open de [**rekentool-pagina**](https://ruudvanderweijde.github.io/knltb-rekentool/), vul per
speler de **padel-dubbel rating** in (lees die af op mijnknltb), kies ♂/♀, en klik **Bereken
ratingwijziging**. Je krijgt de 18 uitslagen met de nieuwe ratings. Werkt op elk apparaat
(telefoon/desktop).

De ratings typ je zelf in — een gewone webpagina kan ze niet van je mijnknltb-account lezen
(daarvoor is een login nodig; zie de CLI hieronder).

**Deelbare link.** Na *Bereken ratingwijziging* verschijnt boven de tabel een link met de
knop **🔗 Kopieer link**. Die link bevat de spelers, ratings, geslachten én de opgehaalde
uitslagen — stuur 'm door en de ontvanger ziet exact dezelfde tabel, zonder zelf te
berekenen (geen proxy-call nodig).

**Sneller invoeren** (klap *Sneller invoeren* open op de pagina):
- **Plakveld** — plak de 4 ratings (bijv. `5,5 6 5 4,8`, of regels als `Marlou 5,5`); de
  velden worden ingevuld. Werkt overal, ook op mobiel.
- **Auto-fill knop (bookmarklet)** — sleep de link naar je bladwijzerbalk. Open dan een
  mijnknltb **head-2-head** pagina (ingelogd) en klik erop: de 4 padel-dubbel ratings + namen
  worden opgehaald en de rekentool opent ingevuld. Desktop; de knop moet als **bladwijzer
  bewaard** worden (browsers blokkeren `javascript:` in de adresbalk).

> **Over de proxy.** De pagina kan de nlpadel-rekentool niet rechtstreeks aanroepen
> (browsers blokkeren dat via CORS + een `SameSite=Strict`-cookie — niets met inloggen te
> maken; nlpadel vereist geen login). Een piepkleine, **anonieme en stateless** proxy
> (`proxy/`, een Cloudflare Worker) doet die call. Hij bewaart niets en kent geen accounts.
> Zie [De proxy draaien](#de-proxy-draaien-beheerder).

## Voor de beheerder: auto-ophalen via CLI & lokale web-app

Wie de ratings + namen automatisch uit een mijnknltb **head-2-head** URL wil halen (met je
eigen KNLTB-login) gebruikt de lokale tools. Vereisen Playwright + een opgeslagen
KNLTB-sessie in `scripts/.knltb-userdata/`:

```bash
npm start                                                # lokale web-app op http://localhost:3000
node scripts/knltb-fetch-ratings.js "<h2h URL>" --open   # CLI: ophalen + calculator openen
```

## De proxy draaien (beheerder)

De webpagina heeft de anonieme nlpadel-proxy nodig (`proxy/`, Cloudflare Worker).

```bash
npm run proxy:dev      # lokaal op http://localhost:8787  (wijzig DELTAS_API in app.js om te testen)
npm run proxy:deploy   # → https://knltb-rekentool-proxy.<jouw-subdomein>.workers.dev
```

Na `proxy:deploy` (eenmalig een gratis Cloudflare-account + `wrangler login` nodig) krijg je
de Worker-URL. Zet die als `DELTAS_API` boven in `app.js` en commit — pas dan werkt de
gehoste pagina. De proxy is anoniem en bewaart niets.

## Ontwikkelen & testen

Vereist **Node.js ≥ 18**. Eenmalig `npm install` voor Playwright (alleen voor de CLI/server).

```bash
npm test       # unit tests (DSS-config, gecombineerde ratings, winstverwachting)
```

## Structuur

```
index.html, app.js, style.css          ← de webpagina (statisch, query-gestuurd + handmatige invoer)
config.js, calculator.js, scenarios.js ← DSS-constanten, win-kans, de 18 scenario's
proxy/
  nlpadel-core.mjs                      ← nlpadel-client (fetch + cookie-jar, geen Playwright)
  worker.js, wrangler.toml              ← Cloudflare Worker (POST /deltas) + config
scripts/
  fetch-core.js                         ← gedeelde Node-fetch-logica (CLI + server, Playwright)
  knltb-fetch-ratings.js                ← CLI (auto-ophalen met je KNLTB-login)
  diagnose-session.js                   ← KNLTB-sessie diagnose
server.js                               ← lokale web-app (auto-ophalen)
tests/calculator.test.js
```

## Hoe het werkt

- **Lager = beter.** Schaal ~1 (prof) → ~9 (beginner).
- De calculator rekent zelf **geen** delta's uit — die komen van nlpadel (de formule is
  niet openbaar). De pagina toont gecombineerde ratings + winstverwachting lokaal.
- **Geslacht beïnvloedt de delta** zodra de twee teams qua geslacht verschillen
  (♀♀ vs ♂♂ ≠ ♂♂ vs ♂♂).
- De nlpadel-rekentool vereist **geen** login; alleen het lezen van de KNLTB-ratings wel.
