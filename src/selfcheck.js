// Automatische Weltprüfung: findet die Fehlerarten, die früher erst im Spiel aufgefallen sind.
// Aufruf im Browser: __game.selfCheck()  →  { ok, problems: [...], stats }
// Läuft auch in tools/check-world.mjs (Playwright) vor jedem Release.
//
// Geprüft wird:
//  1. Eigene Gebäude stehen eben auf dem Boden (kein Sockel/Podest, nicht versunken)
//  2. Kanten im Dorfboden: nirgends ein Sprung > 20 cm zwischen zwei Punkten im Abstand 0.5 m
//     (ausser am Randstein und an Gebäuden). Findet Inseln, Gräben, Podeste und Lücken.
//  3. Gehweg schliesst bündig an den Boden daneben an
//  4. Zäune kreuzen oder berühren sich nicht und stehen nicht auf Strasse/Gehweg/Pflaster
//  5. Ziel- und Türpunkte liegen auf begehbarem Boden, nicht in einer Wand
//  6. Wohnung ist vor dem Gespräch mit Bruno abgeschlossen

export function selfCheck(game) {
  const { world, story, interiors } = game;
  const t = world.terrain, f = t.fine, cols = world.colliders;
  const problems = [];
  const P = (kind, msg, x, z) => problems.push({ kind, msg, x: x === undefined ? undefined : +x.toFixed(1), z: z === undefined ? undefined : +z.toFixed(1) });
  const isRoad = (x, z, e = 0) => { const r = t.roadAt(x, z, e); return r === r; };
  const isWalk = (x, z) => { if (!t.walkAt) return false; const w = t.walkAt(x, z); return w === w; };
  const inBuilding = (x, z) => !!(cols && cols.resolve(x, z, 0.05, t.heightAt(x, z) + 0.5).hit);

  // 1. Gebäude eben
  for (const id of ['club', 'home', 'haus', 'imbiss', 'shop']) {
    const lm = world.landmarks[id];
    if (!lm) { P('gebäude', `${id} fehlt`); continue; }
    const pad = f && f.pads.find((p) => p.id === id);
    if (!pad) { P('gebäude', `${id}: kein ebener Bauplatz`); continue; }
    const h = lm.heading, fx = Math.sin(h), fz = Math.cos(h);
    // direkt vor der Fassade muss der Boden auf Höhe des Bauplatzes liegen
    const door = lm.door;
    const g = t.heightAt(door.x, door.z);
    if (Math.abs(g - pad.level) > 0.45) P('gebäude', `${id}: Boden vor der Tür ${(g - pad.level).toFixed(2)} m neben dem Bauplatz`, door.x, door.z);
    let lo = Infinity, hi = -Infinity;
    for (let a = -3; a <= 3; a += 1) for (let b = 1; b <= 5; b += 1) {
      const x = lm.x + fz * a + fx * (b - 3), z = lm.z - fx * a + fz * (b - 3);
      const y = t.heightAt(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    if (hi - lo > 0.05) P('gebäude', `${id}: Boden unter dem Haus nicht eben (${(hi - lo).toFixed(2)} m)`, lm.x, lm.z);
  }

  const bridges = [];
  for (const w of t.roadWays || []) if (w.bridge) for (const sg of w.segs) bridges.push(sg);
  const nearBridge = (x, z) => bridges.some((sg) => {
    let u = ((x - sg.x1) * (sg.x2 - sg.x1) + (z - sg.z1) * (sg.z2 - sg.z1)) / sg.len2; u = u < 0 ? 0 : u > 1 ? 1 : u;
    return Math.hypot(x - sg.x1 - (sg.x2 - sg.x1) * u, z - sg.z1 - (sg.z2 - sg.z1) * u) - sg.hw < 8;
  });

  // 2. + 3. Kanten im Dorfboden
  let samples = 0, edges = 0;
  if (f) {
    const step = 0.5;
    for (let x = f.x0 + 25; x < f.x1 - 25; x += step) for (let z = f.z0 + 25; z < f.z1 - 25; z += step) {
      samples++;
      const h0 = t.heightAt(x, z);
      for (const [dx, dz] of [[step, 0], [0, step]]) {
        const x2 = x + dx, z2 = z + dz, h1 = t.heightAt(x2, z2);
        const dh = Math.abs(h1 - h0);
        if (dh < 0.2) continue;
        // Kante = Sprung, der viel grösser ist als die Neigung davor und danach (ein steiler Hang ist keine Kante)
        const before = Math.abs(h0 - t.heightAt(x - dx, z - dz)), after = Math.abs(t.heightAt(x2 + dx, z2 + dz) - h1);
        if (before > dh * 0.5 || after > dh * 0.5) continue;      // gleichmässiger Hang, keine Kante
        // erlaubt: Randstein (Strasse auf einer Seite), Gebäude, Fluss, Brücke
        if (isRoad(x, z, 0.3) || isRoad(x2, z2, 0.3)) continue;
        if (inBuilding(x, z) || inBuilding(x2, z2)) continue;
        if (world.rivers && world.rivers.at) { const r = world.rivers.at(x, z); if (r && r.e < 30) continue; }
        if (nearBridge(x, z)) continue;                         // Böschung an der Brückenrampe
        edges++;
        if (edges <= 25) P('kante', `Sprung von ${dh.toFixed(2)} m im Boden`, x, z);
      }
    }
    if (edges > 25) P('kante', `… insgesamt ${edges} Kanten`);
  }

  // 4. Zäune
  const fs = (game.props && game.props.fenceSegs) || [];
  const cross = (a, b) => {
    const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
    const d1 = o(a[0], a[1], a[2], a[3], b[0], b[1]), d2 = o(a[0], a[1], a[2], a[3], b[2], b[3]);
    const d3 = o(b[0], b[1], b[2], b[3], a[0], a[1]), d4 = o(b[0], b[1], b[2], b[3], a[2], a[3]);
    return d1 * d2 < 0 && d3 * d4 < 0;
  };
  let fenceBad = 0;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i];
    const mx = (a[0] + a[2]) / 2, mz = (a[1] + a[3]) / 2;
    if (isRoad(mx, mz, 0.2) || isWalk(mx, mz) || (t.isPaved && t.isPaved(mx, mz))) { fenceBad++; if (fenceBad < 10) P('zaun', 'Zaun auf Strasse/Gehweg/Platz', mx, mz); }
    for (let j = i + 2; j < fs.length; j++) if (cross(a, fs[j])) { fenceBad++; if (fenceBad < 10) P('zaun', 'Zäune kreuzen sich', mx, mz); }
  }

  // 5. Türen und Ziele erreichbar
  for (const id of ['club', 'home', 'haus', 'imbiss', 'shop']) {
    const lm = world.landmarks[id];
    if (lm && inBuilding(lm.door.x, lm.door.z)) P('tür', `${id}: Türpunkt steckt in einem Hindernis`, lm.door.x, lm.door.z);
  }
  const pk = world.landmarks.club && world.landmarks.club.parking;
  if (!pk) P('parkplatz', 'Club-Parkplatz fehlt');
  else {
    // Parkplatz muss von der Strasse aus ohne Kante erreichbar sein
    if (inBuilding(pk.x, pk.z)) P('parkplatz', 'Parkplatz liegt in einem Hindernis', pk.x, pk.z);
    const h0 = t.heightAt(pk.x, pk.z);
    let ok = false;
    for (let a = 0; a < 16 && !ok; a++) {
      const ux = Math.sin(a / 16 * Math.PI * 2), uz = Math.cos(a / 16 * Math.PI * 2);
      let prev = h0, smooth = true;
      for (let d = 0.5; d < 20; d += 0.5) {
        const x = pk.x + ux * d, z = pk.z + uz * d, h = t.heightAt(x, z);
        if (Math.abs(h - prev) > 0.2 || inBuilding(x, z)) { smooth = false; break; }
        prev = h;
        if (isRoad(x, z)) { ok = smooth; break; }
      }
    }
    if (!ok) P('parkplatz', 'Parkplatz ist nicht ohne Kante von der Strasse aus befahrbar', pk.x, pk.z);
  }

  // 6. Story-Sperre
  if (interiors && story && world.landmarks.home) {
    const was = story.step;
    story.step = 'park';
    const d = world.landmarks.home.door;
    const a = interiors.actionAt({ x: d.x, y: t.heightAt(d.x, d.z), z: d.z });
    if (a && a.label === 'Betreten') P('story', 'Wohnblock vor dem Gespräch mit Bruno betretbar');
    story.step = was;
  }

  return { ok: problems.length === 0, problems, stats: { samples, edges, fences: fs.length } };
}
