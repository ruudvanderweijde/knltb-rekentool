# Het DSS (Dynamische Speelsterkte Systeem)

## Hoe wordt de rating bepaald
Het uitgangspunt van het DSS is dat elke wedstrijd meetelt voor je rating. Je rating
wordt elke wedstrijd aangepast aan de hand van een wiskundige formule. De uitleg
over het algoritme en de werking voor het enkel- en dubbelspel tennis is hieronder
verder uitgewerkt

### Het algoritme
Na elke gespeelde wedstrijd wordt de rating van een speler aangepast. Voor het
enkelspel tennis wordt de nieuwe rating in twee stappen vastgesteld. Voor het
dubbelspel tennis wordt de nieuwe rating in drie stappen vastgesteld. De stijging en
daling zal voor de spelers of koppels altijd hetzelfde zijn. Eerst zal de werking worden
toegelicht. Vervolgens zal de berekening van de verschillende parameters uitgelegd
worden.

#### Dubbelspel
Voor het dubbelspel wordt de nieuwe rating van een speler in drie stappen vastgesteld.

##### Stap 1: de gecombineerde rating bepalen
Ten eerste wordt de gecombineerde rating bepaald van een koppel. Dit gebeurt door
middel van de onderstaande formule.

```
R12 = ΘR1 + (1 − Θ)R2

R12 = de gecombineerde rating van speler 1 en 2
Θ = 0,5 (thèta)
R1 = rating speler 1
R2 = rating speler 2
```

##### Stap 2: de winstverwachting bepalen

```
prob = 1 / (1 + e^(-q(R1 − R2)))
```
Vervolgens wordt op basis van de gecombineerde rating de winstverwachting bepaald.
De q is in het geval van dubbelspel vastgesteld op 2,012. R1 staat in dit geval voor de
gecombineerde rating van speler 1 en 2. R2 staat voor de gecombineerde rating van
het andere koppel.

##### Stap 3: de nieuwe rating bepalen

```
R1' = R1 + K x (prob - result_score)
```

Tot slot wordt de nieuwe rating berekend op basis van het resultaat van de wedstrijd
door middel van de onderstaande formule. De spelers binnen het koppel ontvangen
hetzelfde resultaat.

#### Voorbeeld dubbelspel

Victor speelt met Helga tegen Pieter en Lisa.

Victor heeft een rating van 5,0000 en Helga heeft een rating van 6,0000. Pieter heeft
een rating van 5,8000 en Lisa heeft een rating van 4,8000. Pieter en Lisa winnen de
partij. Om de nieuwe rating van de spelers te berekenen worden de drie stappen
uitgevoerd.

##### Stap 1:
De gecombineerde rating van Victor en Helga is 0,5*5,0000 + 0,5*6,0000 = 5,5000
De gecombineerde rating van Pieter en Lisa is 0,5*5,8000 + 0,5*4,8000 = 5,3000

##### Stap 2:
Op basis van de gecombineerde ratings is de verwachting dat Victor en Helga winnen
40% en de verwachting dat Pieter en Lisa winnen is 60%.

##### Stap 3:
Pieter en Lisa winnen de partij en krijgen een resultaat van ‘’1’’ in de berekening en
Victor en Helga krijgen een ‘’0’’ als resultaat. De volgende berekening wordt dan
uitgevoerd voor de spelers:

Victor:
5,0000 (oude rating) + 0,275 (K)*(0,4-0) = 5,1102 (nieuwe rating)

Helga:
6,0000 (oude rating) + 0,275 (K)*(0,4-0) = 6,1102 (nieuwe rating)

Pieter:
5,8000 (oude rating) + 0,275 (K)*(0,6-1) = 5,6898 (nieuwe rating)

Lisa:
4,8000 (oude rating) + 0,275 (K)*(0,6-1) = 4,6898 (nieuwe rating)

#### De parameters
In de formules zitten een drietal parameters die zijn berekend door KNLTB, namelijk de
‘’q’’ bij de berekening van de winstverwachting, de ‘’K’’ voor het maximale stijgen/dalen
van de rating en de Θ (thèta) om wiskundig te bepalen welk aandeel een speler heeft in
een dubbelspel. De parameters zijn berekend op basis van historische data en worden
in de komende jaren periodiek geëvalueerd op basis van nieuwe wedstrijd data om
blijvend recht te doen.

##### Winstverwachting ‘’q’’
De ‘’q’’ bepaalt de winstverwachting bij een verschil in rating tussen twee spelers. De
waarde van q is bepaald op basis van historische data uit 2018 en 2019 (gehele
speeljaren). Uiteindelijk is de meest optimale waarde wiskundig berekend voor het
enkelspel en dubbelspel tennis. Voor het enkelspel is deze waarde 1,824 en voor het
dubbelspel 2,012.

##### Maximale stijging en daling ‘’K’’
De parameter ‘’K’’ bepaalt hoeveel een speler maximaal kan stijgen of dalen per
gespeelde wedstrijd. Wederom is op basis van historische data uit 2018 en 2019
wiskundig bepaalt dat de optimale waarde 0,275 is. De rating van een speler kan dus
maximaal 0,275 beter of minder worden bij een winstverwachting van <0,01%.

##### De waarde Θ (thèta)
De eerste stap voor de berekening van de nieuwe rating is de gecombineerde rating
bepalen van het koppel. De waarde Θ (thèta) kan een getal tussen de 0 en de 1 zijn.
Op basis van historische data uit 2018 en 2019 is er geconstateerd dat het aandeel van
‘’betere’’ speler wiskundig niet significant is voor het resultaat van de wedstrijd. Er is
daarom voor gekozen om deze waarde op 0,5 te houden, wat inhoudt dat beide spelers
een gelijk aandeel hebben voor de totstandkoming van de winstverwachting en het
uiteindelijke resultaat.