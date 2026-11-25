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

- Tal mit Strasse, Fluss (Muota), Dorf mit Kirche, Ställen, Tannenwald, Felsen und Bergen mit Schneegipfeln
- Spielfigur: gehen, rennen, springen (z.B. auf die Heuballen beim Start)
- Zwei Autos zum Einsteigen und Herumfahren, mit km/h-Anzeige
- Runde Mini-Karte, Gebietsnamen, FPS-Anzeige
- Senkt automatisch die Auflösung, wenn das Handy zu langsam ist

## Technik

- [Three.js](https://threejs.org) (r170, liegt in `lib/`, keine Installation nötig)
- Reines HTML + JavaScript, kein Build-Schritt
- `src/` enthält den Code: `world.js` (Tal), `player.js`, `car.js`, `camera.js`, `input.js` (Touch), `minimap.js`

Es werden **keine** Inhalte, Namen oder Grafiken aus anderen Spielen verwendet.
