# DSS-formule – padel dubbelspel

Bron: *KNLTB DSS uitgebreide uitleg*

---

## Stap 1 – Gecombineerde rating bepalen

$$R_{12} = \Theta \cdot R_1 + (1 - \Theta) \cdot R_2$$

| Symbool | Waarde | Omschrijving |
|---------|--------|--------------|
| $R_{12}$ | — | gecombineerde rating van speler 1 en 2 |
| $\Theta$ | 0,5 | aandeel per speler (gelijk verdeeld) |
| $R_1$ | invoer | rating speler 1 |
| $R_2$ | invoer | rating speler 2 |

## Stap 2 – Winstverwachting bepalen

$$\text{prob} = \frac{1}{1 + e^{-q \cdot (R_{12} - R_{34})}}$$

| Symbool | Waarde | Omschrijving |
|---------|--------|--------------|
| $q$ | 2,012 | winstverwachtingsfactor voor dubbelspel |
| $R_{12}$ | stap 1 | gecombineerde rating koppel 1 |
| $R_{34}$ | stap 1 | gecombineerde rating koppel 2 |

`prob` is de kans dat koppel 1 **verliest**. De winstkans van koppel 1 is dus `1 − prob`.

## Stap 3 – Nieuwe rating berekenen

$$R_{\text{new}} = R_{\text{old}} + K \cdot (\text{prob} - \text{result})$$

| Symbool | Waarde | Omschrijving |
|---------|--------|--------------|
| $K$ | 0,275 | maximale stijging/daling per wedstrijd |
| prob | stap 2 | winstverwachting van het betreffende koppel |
| result | 0 of 1 | **1** = gewonnen, **0** = verloren |

Beide spelers binnen een koppel ontvangen hetzelfde resultaat.

> **Let op:** een **lagere** rating is beter (1 = prof, 9 = beginner).
> Bij winst daalt de rating (verbetering), bij verlies stijgt de rating (verslechtering).

### Super tie-break

Een super tie-break telt als **1 game**. De winnaar van de super tie-break wint de wedstrijd.

---

## Parameters

| Parameter | Waarde | Omschrijving |
|-----------|--------|--------------|
| $q$ | 2,012 | dubbelspel (enkelspel: 1,824) |
| $K$ | 0,275 | maximale stap per wedstrijd |
| $\Theta$ | 0,5 | gelijk aandeel per speler in koppel |

Alle parameters zijn berekend op basis van historische wedstrijddata uit 2018–2019 en worden periodiek geëvalueerd.

---

## Rekenvoorbeeld

**Victor** (5,0000) en **Helga** (6,0000) spelen tegen **Pieter** (5,8000) en **Lisa** (4,8000).
Pieter en Lisa winnen de partij.

**Stap 1**

$$R_{VH} = 0{,}5 \times 5{,}0 + 0{,}5 \times 6{,}0 = 5{,}5000$$
$$R_{PL} = 0{,}5 \times 5{,}8 + 0{,}5 \times 4{,}8 = 5{,}3000$$

**Stap 2**

$$\text{prob}_{VH} = \frac{1}{1 + e^{-2{,}012 \times (5{,}5 - 5{,}3)}} \approx 0{,}40 \quad (40\%)$$
$$\text{prob}_{PL} = 1 - 0{,}40 = 0{,}60 \quad (60\%)$$

**Stap 3** (Pieter en Lisa winnen, result = 1 voor PL, result = 0 voor VH)

De winstverwachting is ≈ 40,07% voor VH en ≈ 59,93% voor PL (het document rondt af op 40%/60%).

| Speler | Berekening | Nieuwe rating |
|--------|-----------|--------------|
| Victor | $5{,}0000 + 0{,}275 \times (0{,}4007 - 0)$ | **5,1102** |
| Helga  | $6{,}0000 + 0{,}275 \times (0{,}4007 - 0)$ | **6,1102** |
| Pieter | $5{,}8000 + 0{,}275 \times (0{,}5993 - 1)$ | **5,6898** |
| Lisa   | $4{,}8000 + 0{,}275 \times (0{,}5993 - 1)$ | **4,6898** |
