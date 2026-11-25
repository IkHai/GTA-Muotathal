# Muotathal – Open-World-Handyspiel

Ein eigenes Open-World-Spiel, das im Muotathal (Kanton Schwyz) spielt.
Grafik im kantigen Low-Poly-Stil der frühen 2000er. Gebaut mit **Unity 6**, zuerst für **Android**.

## Was schon drin ist

- **Touch-Steuerung:** Joystick links (laufen / lenken), rechts wischen (Kamera drehen),
  Knöpfe für **Springen**, **Einsteigen/Aussteigen**, **Gas** und **Bremse**.
- **Spielfigur** mit Gehen, Rennen (Joystick ganz drücken) und Springen.
- **Auto** zum Einsteigen und Herumfahren.
- **Testszene** `Assets/Scenes/Muotathal_Test.unity`: ein Platzhalter-Tal mit Strasse,
  Fluss, Dorf mit Kirche, Tannen und Bergen.
- Feste **30 FPS** und eine FPS-Anzeige oben links.

Die Testszene wird beim ersten Öffnen des Projekts **automatisch gebaut**.
Über das Menü **Muotathal → Testszene neu bauen** kannst du sie jederzeit neu erzeugen.

## Projekt öffnen

1. **Unity Hub** installieren: https://unity.com/download
2. Im Hub unter **Installs → Install Editor** eine **Unity 6** Version (6000.0 LTS oder neuer) installieren.
   Dabei das Modul **Android Build Support** mit **OpenJDK** und **Android SDK & NDK Tools** anhaken.
3. Dieses Repository herunterladen (GitHub: **Code → Download ZIP** und entpacken, oder mit GitHub Desktop klonen).
4. Im Hub **Projects → Add → Add project from disk** und den Ordner wählen.
5. Projekt öffnen. Beim ersten Mal dauert das einige Minuten.
   - Fragt Unity nach einer anderen Editor-Version: deine installierte Unity-6-Version wählen.
   - Fragt Unity, ob das **neue Input System** aktiviert werden soll: **Yes** klicken (Unity startet neu).
6. Die Szene `Assets/Scenes/Muotathal_Test` öffnet sich. Oben auf **Play ▶** drücken.

**Im Editor testen:** WASD = laufen, Leertaste = springen, E = ein-/aussteigen,
im Auto W = Gas, S = Bremse/Rückwärts, rechte Maustaste halten = Kamera drehen.
Die Bildschirm-Knöpfe kann man auch mit der Maus anklicken.

## Auf dem Android-Handy testen

1. Auf dem Handy **Entwickleroptionen** einschalten: *Einstellungen → Über das Telefon →*
   7-mal auf **Build-Nummer** tippen.
2. In den Entwickleroptionen **USB-Debugging** einschalten.
3. Handy per USB-Kabel an den PC anschliessen und auf dem Handy **USB-Debugging zulassen** bestätigen.
4. In Unity **File → Build Profiles** öffnen, **Android** wählen und **Switch Platform** klicken.
5. Bei **Run Device** dein Handy auswählen (sonst **Refresh** klicken).
6. **Build and Run** klicken und einen Ordner für die Datei wählen (z.B. einen neuen Ordner `Builds`).
   Das Spiel wird gebaut, aufs Handy kopiert und startet von selbst.

## Ordnerstruktur

```
Assets/
  Scripts/
    Core/       Spielstart (30 FPS), FPS-Anzeige
    Input/      Joystick, Wisch-Bereich, Touch-Knöpfe
    Player/     Spielfigur, Ein-/Aussteigen
    Vehicles/   Auto
    Camera/     Kamera hinter der Figur
  Editor/       Baut die Testszene und setzt die Android-Einstellungen
  Generated/    Automatisch erzeugte Materialien und Formen (entsteht beim ersten Öffnen)
  Scenes/       Szenen
Packages/       Benötigte Unity-Pakete
```

Wichtig: Es werden **keine** Inhalte, Namen oder Grafiken aus anderen Spielen verwendet.
