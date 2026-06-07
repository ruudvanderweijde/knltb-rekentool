# KNLTB Padel Rekentool

Bereken de DSS-ratingwijziging per uitslag voor een padel-dubbelpartij. Lees de
vier *padel-dubbel* ratings + namen van een mijnknltb head-2-head pagina en haal
de 18 uitslag-scenario's op bij de officiële [nlpadel.nl rekentool][rekentool].

> **Onofficieel.** Niet gelieerd aan of goedgekeurd door de KNLTB of nlpadel.
> De browser-extensie draait volledig in je eigen browser met **jouw eigen
> KNLTB-login** — er worden geen wachtwoorden of gegevens verzameld of naar een
> server gestuurd. Gebruik op eigen risico en respecteer de voorwaarden van de KNLTB.

[rekentool]: https://www.nlpadel.nl/alles-over-padel/speel-padel/speelsterkte-rating/speelsterkte-rekentool/

## Voor gebruikers: de browser-extensie

De extensie zet een knop op elke mijnknltb **head-2-head** pagina. Eén klik haalt
de ratings + namen op (met jouw login), vraagt om het geslacht te bevestigen (dat
staat niet op KNLTB), en opent de rekentool met alles ingevuld.

### Installeren (Chrome / Edge)

1. `npm run sync:ext` (kopieert de rekentool-bestanden in de extensie — eenmalig of na een update).
2. Open `chrome://extensions`, zet **Ontwikkelaarsmodus** aan.
3. **Niet-ingepakte extensie laden** → kies de map `extension/`.

### Installeren (Firefox desktop)

1. `npm run sync:ext`
2. Open `about:debugging#/runtime/this-firefox` → **Tijdelijke extensie laden** → kies `extension/manifest.json`.

### Installeren (Android — Firefox)

Werkt op **Firefox voor Android** (Chrome op Android ondersteunt geen extensies; iOS
wordt niet ondersteund — dat vereist een Safari-app via de App Store).

**Tijdelijk testen via USB / emulator** (laptop nodig):
1. Zorg dat `adb` (Android Platform Tools) in je PATH staat en Firefox op het toestel/de
   emulator draait met **Instellingen → Remote debugging via USB** aan.
2. `npm run ext:run:android` — laadt de extensie tijdelijk.

**Permanent installeren op al je toestellen** (Mozilla-ondertekende XPI):
1. Maak een gratis [addons.mozilla.org](https://addons.mozilla.org) account en API-sleutels.
2. `WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... npm run ext:sign` → levert een
   **ondertekende** `.xpi` in `dist/` (niet-ondertekende XPI's kunnen niet op Firefox
   Android geïnstalleerd worden).
3. Zet de `.xpi` online (bijv. als GitHub release-asset) en open de link in Firefox op de
   telefoon om te installeren. (Of publiceer de extensie listed op AMO.)

### Gebruiken

1. Log in op [mijnknltb.toernooi.nl](https://mijnknltb.toernooi.nl).
2. Open een **head-2-head** vergelijking van 4 spelers (een dubbelpartij).
3. Klik op **🎾 Bereken rating-scenario's** (rechtsonder).
4. Controleer het geslacht per speler en klik **Bereken →**. Er opent een tabblad
   met de ratingwijziging per uitslag.

## Voor de beheerder: CLI & lokale web-app

Naast de extensie zijn er twee lokale hulpmiddelen (vereisen Playwright + een
opgeslagen KNLTB-sessie in `scripts/.knltb-userdata/`):

```bash
npm start                                            # lokale web-app op http://localhost:3000
node scripts/knltb-fetch-ratings.js "<h2h URL>" --open   # CLI: ophalen + calculator openen
```

## Ontwikkelen & testen

Vereist **Node.js ≥ 18**. Eenmalig `npm install` voor Playwright (alleen voor CLI/server/verificatie).

```bash
npm test                              # unit tests (DSS-config, ratings, winstverwachting)
npm run sync:ext                      # extensie-bestanden synchroniseren
node scripts/verify-extension.js      # end-to-end test van de extensie (vereist login + display)
```

## Structuur

```
index.html, app.js, style.css        ← de calculator (statische pagina, query-gestuurd)
config.js, calculator.js, scenarios.js ← DSS-constanten, win-kans, de 18 scenario's
extension/                            ← browser-extensie (MV3)
  manifest.json, content.js, background.js, shared.js, modal.css
  scenarios.js, calculator/           ← gegenereerd door `npm run sync:ext`
scripts/
  fetch-core.js                       ← gedeelde Node-fetch-logica (CLI + server)
  knltb-fetch-ratings.js              ← CLI
  sync-extension.js, verify-extension.js
server.js                             ← lokale web-app
tests/calculator.test.js
```

## Hoe het werkt

- **Lager = beter.** Schaal ~1 (prof) → ~9 (beginner).
- De calculator rekent zelf **geen** delta's uit — die komen van nlpadel (de formule is
  niet openbaar). De pagina toont gecombineerde ratings + winstverwachting lokaal.
- **Geslacht beïnvloedt de delta** zodra de twee teams qua geslacht verschillen
  (♀♀ vs ♂♂ ≠ ♂♂ vs ♂♂). Het staat niet op KNLTB, dus het wordt gegokt op voornaam
  en bevestigd door de gebruiker.
- De nlpadel-rekentool vereist **geen** login; alleen het lezen van de KNLTB-ratings wel.
```
