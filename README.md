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

### Installeren op je telefoon (Android)

> **Alleen Android + Firefox.** Chrome op Android ondersteunt geen extensies, en
> **iPhone/iOS wordt niet ondersteund** (dat zou een aparte Safari-app via de App Store
> vereisen). Op de telefoon gebruik je dus de app **Firefox** (uit de Play Store).

Wat je nodig hebt:
- Een Android-telefoon met **[Firefox](https://play.google.com/store/apps/details?id=org.mozilla.firefox)** geïnstalleerd.
- Een **ondertekende `.xpi`** van de extensie (zie *Een ondertekende build maken* hieronder
  als die er nog niet is — niet-ondertekende extensies kunnen niet op Firefox Android).

Installeren:
1. Open in **Firefox op je telefoon** de link naar de ondertekende `.xpi` van de
   [**Releases-pagina**](https://github.com/ruudvanderweijde/knltb-rekentool/releases).
2. Firefox vraagt om te bevestigen → tik **Toevoegen / Add**.
3. Sta toegang toe tot `mijnknltb.toernooi.nl`, `nlpadel.nl` en `id.knltb.nl` als
   Firefox daarom vraagt (nodig om je ratings te lezen en de uitslagen te berekenen).

Daarna werkt het net als op desktop (zie [Gebruiken](#gebruiken)): log in op mijnknltb in
Firefox, open een head-2-head pagina en tik op de knop **🎾 Bereken rating-scenario's**.

#### Een ondertekende build maken (voor de beheerder)

Extensies moeten door Mozilla **ondertekend** zijn voordat ze op Firefox Android te
installeren zijn. Maak eenmalig een gratis [addons.mozilla.org](https://addons.mozilla.org)
account met API-sleutels en draai:

**Automatisch via GitHub Actions (aanbevolen):** voeg de twee AMO-sleutels toe als repo-secrets
(*Settings → Secrets and variables → Actions*): `WEB_EXT_API_KEY` en `WEB_EXT_API_SECRET`.
Publiceer daarna een **release met een semver-tag** (bijv. `v1.0.0`); de workflow
`.github/workflows/release-extension.yml` tekent de extensie (versie = de tag) en hangt de
ondertekende `.xpi` automatisch aan de release. Bump de tag per release — AMO weigert een
al-ondertekende versie opnieuw.

**Handmatig/lokaal** levert hetzelfde op:

```bash
WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... npm run ext:sign   # → ondertekende .xpi in dist/
```

Eerst **lokaal testen** op een toestel/emulator (laptop nodig)? Zorg dat `adb` in je PATH
staat en Firefox op het toestel draait met **Instellingen → Remote debugging via USB** aan,
en draai `npm run ext:run:android` (laadt de extensie tijdelijk).

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
