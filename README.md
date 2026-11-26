# Muotathal 1

Ein eigenes Open-World-Spiel, das im Muotathal (Kanton Schwyz) spielt.
Kantige Low-Poly-Grafik im Stil der frühen 2000er. Läuft direkt im **Handy-Browser**,
ohne App-Installation und ohne PC.

## Spielen

Sobald GitHub Pages eingeschaltet ist (siehe unten), läuft das Spiel hier:

**https://ikhai.github.io/GTA-Muotathal/**

Handy quer halten, Link öffnen, auf den Bildschirm tippen.

| Steuerung | Handy | PC |
|---|---|---|
| Laufen / Lenken | Joystick links | WASD oder Pfeiltasten |
| Kamera drehen | rechts wischen | Maus rechts ziehen |
| Springen | Knopf „Springen“ | Leertaste |
| Ein-/Aussteigen | Knopf „Einsteigen“ | E |
| Gas / Bremse | Knöpfe im Auto | W / S |

Joystick wenig drücken = gehen, ganz drücken = rennen.

## GitHub Pages einschalten (einmalig, geht am Handy)

1. Im Browser das Repository öffnen und auf **Settings** tippen
   (in der Handy-Ansicht evtl. über **„…“** oder **Desktop-Ansicht**).
2. Links auf **Pages** tippen.
3. Bei **Source** „Deploy from a branch“ wählen, bei **Branch** `main` und `/ (root)` wählen, **Save**.
4. Nach 1–2 Minuten ist das Spiel unter dem Link oben erreichbar.

Jede Änderung, die in `main` gemergt wird, ist danach automatisch online.

## Was drin ist

- Das **echte Muotathal** im Massstab 1:1: rund 4 × 4 km um das Dorf sind begehbar,
  mit echtem Gelände, Strassen, Häusern, der Muota und Wald aus echten Geodaten
- Die Berge ringsum (16 × 16 km) als vereinfachte Kulisse
- Spielfigur: gehen, rennen, springen (z.B. auf die Heuballen beim Start)
- Zwei Autos zum Einsteigen und Herumfahren, mit km/h-Anzeige
- Runde Mini-Karte, Gebietsnamen, FPS-Anzeige
- Senkt automatisch die Auflösung, wenn das Handy zu langsam ist

## Kartendaten

Die Dateien in `data/` werden automatisch erzeugt (`scripts/build-geodata.mjs`):
GitHub lädt die Daten herunter, wenn sich das Skript ändert, oder per Hand unter
**Actions → Geodaten aktualisieren → Run workflow**.

- Höhenmodell: **swissALTI3D © swisstopo** (Open Government Data)
- Farben von Wiesen, Wegen und Dächern: Luftbild **SWISSIMAGE © swisstopo** (Open Government Data), geladen mit `tools/build-aerial.mjs` (Actions → Luftbild aktualisieren)
- Strassen, Gebäude, Gewässer, Wald, Ortsnamen: **© OpenStreetMap-Mitwirkende**, Lizenz [ODbL](https://www.openstreetmap.org/copyright)
- Berg-Kulisse: AWS Terrain Tiles (Tilezen; u.a. SRTM, EU-DEM)

Den Ausschnitt (Mitte, Grösse) kann man oben im Skript ändern, z.B. um das Tal zu erweitern.

## Neue Version veröffentlichen

Bei jeder Änderung die Zahl in `version.json` erhöhen. Dann laden alle Handys sofort die neuen Dateien statt der zwischengespeicherten.

## Technik

- [Three.js](https://threejs.org) (r170, liegt in `lib/`, keine Installation nötig)
- Reines HTML + JavaScript, kein Build-Schritt
- `src/` enthält den Code: `world.js` (Tal aus den Kartendaten, in Kacheln), `player.js`, `car.js`, `camera.js`, `input.js` (Touch), `minimap.js`

Es werden **keine** Inhalte, Namen oder Grafiken aus anderen Spielen verwendet.
