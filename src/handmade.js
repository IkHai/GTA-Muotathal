import * as THREE from 'three';
import { Builder } from './builder.js';

// Von Hand gebaute Story-Gebäude (Hell's Club, Wohnblock): eigene Geometrie statt
// hochgezogenem OSM-Grundriss. Lage und Grösse kommen aus OpenStreetMap, das Aussehen
// folgt Nicks Concept Art (eigene Umsetzung, alle Texturen selbst gezeichnet).

// ---------- Texturen ----------
const cache = {};
function canvasTex(key, w, h, draw, repeat = false) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (cache[key] = t);
}

function rnd(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Verwitterter Verputz: Flecken, Laufspuren und abgeplatzte Stellen mit Backstein
export function plasterTex(base, key) {
  return canvasTex('plaster' + key, 512, 512, (g, w, h) => {
    const r = rnd(7 + key.length * 13);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.03 + r() * 0.05})` : `rgba(255,255,255,${0.03 + r() * 0.05})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6);
    }
    // Laufspuren von oben
    for (let i = 0; i < 26; i++) {
      const x = r() * w, len = 60 + r() * 260;
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, 'rgba(40,34,28,.28)'); grad.addColorStop(1, 'rgba(40,34,28,0)');
      g.fillStyle = grad; g.fillRect(x, 0, 4 + r() * 14, len);
    }
    // grosse Schmutzflecken
    for (let i = 0; i < 10; i++) {
      const x = r() * w, y = r() * h, s = 30 + r() * 90;
      const grad = g.createRadialGradient(x, y, 2, x, y, s);
      grad.addColorStop(0, 'rgba(60,50,40,.13)'); grad.addColorStop(1, 'rgba(60,50,40,0)');
      g.fillStyle = grad; g.fillRect(x - s, y - s, s * 2, s * 2);
    }
    // abgeplatzt: Backstein sichtbar
    for (let i = 0; i < 3; i++) {
      const x = r() * w, y = r() * h, pw = 30 + r() * 70, ph = 20 + r() * 50;
      g.save();
      g.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * Math.PI * 2, rr = 0.7 + r() * 0.3;
        g.lineTo(x + Math.cos(a) * pw / 2 * rr, y + Math.sin(a) * ph / 2 * rr);
      }
      g.closePath();
      g.fillStyle = '#7a4c3a'; g.fill();
      g.clip();
      g.strokeStyle = 'rgba(200,190,170,.7)'; g.lineWidth = 2;
      for (let yy = y - ph; yy < y + ph; yy += 9) {
        g.beginPath(); g.moveTo(x - pw, yy); g.lineTo(x + pw, yy); g.stroke();
        for (let xx = x - pw + ((yy / 9) % 2) * 10; xx < x + pw; xx += 20) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 9); g.stroke(); }
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke();
    }
  }, true);
}

function roofTex() {
  return canvasTex('rooftiles', 256, 256, (g, w, h) => {
    const r = rnd(99);
    g.fillStyle = '#3e2a22'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = (y / 16) % 2 ? -8 : 0; x < w; x += 16) {
        const s = 0.8 + r() * 0.35;
        g.fillStyle = `rgb(${Math.round(78 * s)},${Math.round(52 * s)},${Math.round(40 * s)})`;
        g.fillRect(x + 1, y + 1, 14, 13);
        if (r() < 0.12) { g.fillStyle = 'rgba(90,110,60,.45)'; g.fillRect(x + 2, y + 6, 10, 7); }   // Moos
      }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y + 13, w, 3);
    }
  }, true);
}

export function graffitiTex(seed) {
  return canvasTex('graffiti' + seed, 256, 128, (g, w, h) => {
    const r = rnd(seed);
    g.clearRect(0, 0, w, h);
    const cols = ['#e8e8ee', '#ff5a8a', '#6ad0ff', '#f2d14a', '#9a6aff'];
    for (let n = 0; n < 2; n++) {
      g.strokeStyle = cols[Math.floor(r() * cols.length)]; g.lineWidth = 7 - n * 3; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); let x = 20, y = 70 + n * 8; g.moveTo(x, y);
      for (let k = 0; k < 7; k++) { const nx = x + 25 + r() * 8, ny = 40 + r() * 60; g.bezierCurveTo(x + 10, y - 50 * r(), nx - 10, ny + 40 * r(), nx, ny); x = nx; y = ny; }
      g.stroke();
    }
  });
}

// Neon-Figur über dem Schild: liegende Dame als einfache Umrisslinie (wie ein klassisches Barschild)
export function neonFigureTex() {
  return canvasTex('hellfigure', 512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#ffb0d4'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = '#ff2f86'; g.shadowBlur = 26;
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath();
      g.arc(150, 70, 26, 0, Math.PI * 2);                       // Kopf
      g.moveTo(130, 60); g.quadraticCurveTo(100, 90, 118, 130);  // Haar
      g.moveTo(165, 95); g.quadraticCurveTo(190, 150, 175, 200); // Rücken
      g.quadraticCurveTo(230, 215, 300, 200);                    // Sitz
      g.quadraticCurveTo(360, 150, 420, 120);                    // Bein oben
      g.lineTo(440, 60);                                         // Unterschenkel
      g.moveTo(300, 200); g.quadraticCurveTo(380, 210, 460, 205); // Bein unten
      g.moveTo(170, 120); g.lineTo(130, 200);                    // Arm
      g.moveTo(80, 225); g.lineTo(470, 225);                     // Linie darunter
      g.stroke();
    }
  });
}

export function plainTex(text, bg, fg) {
  return canvasTex('t' + text, 256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 36px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  });
}

// ---------- Hilfen ----------
// Rechteck (aus OSM) mit Vorderseite zur Strasse. Lokales System: x entlang der Front,
// z von der Front ins Haus hinein, y nach oben ab gMin.
function frameFromFootprint(pts, terrain) {
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  let ax = 1, az = 0, best = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l > best) { best = l; ax = (x2 - x1) / l; az = (z2 - z1) / l; }
  }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of pts) {
    const u = (x - cx) * ax + (z - cz) * az, v = -(x - cx) * az + (z - cz) * ax;
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
  }
  const ox = cx + (u0 + u1) / 2 * ax - (v0 + v1) / 2 * az, oz = cz + (u0 + u1) / 2 * az + (v0 + v1) / 2 * ax;
  const L = u1 - u0, W = v1 - v0;
  // vier Seiten: Normale nach aussen, halbe Ausdehnung
  const sides = [
    { nx: ax, nz: az, half: L / 2, along: W },
    { nx: -ax, nz: -az, half: L / 2, along: W },
    { nx: -az, nz: ax, half: W / 2, along: L },
    { nx: az, nz: -ax, half: W / 2, along: L },
  ];
  for (const s of sides) {
    s.road = 99;
    for (let d = 1; d <= 16; d++) {
      const h = terrain.roadAt(ox + s.nx * (s.half + d), oz + s.nz * (s.half + d), 0);
      if (h === h) { s.road = d; break; }
    }
  }
  const front = sides.slice().sort((a, b) => a.road - b.road || b.along - a.along)[0];
  const width = front.along, depth = front.half * 2;
  // Ursprung: Mitte der Frontwand
  const fx = ox + front.nx * front.half, fz = oz + front.nz * front.half;
  const rotY = Math.atan2(-front.nx, -front.nz);      // lokales +z zeigt ins Haus
  const toWorld = (x, z) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return [fx + x * c + z * s, fz - x * s + z * c];
  };
  // Bodenhöhe: das Haus steht auf dem höchsten Punkt rundherum (inkl. Strasse und Platz),
  // damit nichts über die Fenster und Türen ragt. Unten reicht der Sockel bis zum tiefsten Punkt.
  const raw = pts.map(([x, z]) => terrain.groundAt(x, z));
  const around = [];
  const W2 = front.along / 2, Dd = front.half * 2;
  for (let i = 0; i <= 8; i++) {
    const t = -W2 - 1 + (W2 * 2 + 2) * i / 8;
    for (const z of [-3, -1.2]) around.push(toWorld(t, z));
    for (const x of [-W2 - 1.2, W2 + 1.2]) around.push(toWorld(x, (Dd + 2) * i / 8 - 1));
  }
  const ground = pts.concat(around).map(([x, z]) => terrain.heightAt(x, z));
  const gMax = Math.max(...ground);
  const frontPts = around.filter((_, i) => i % 4 < 2);
  const gMin = Math.max(...pts.concat(frontPts).map(([x, z]) => terrain.heightAt(x, z))) + 0.05;
  const drop = gMin - Math.min(...raw);      // so tief muss der Sockel hinunter
  return { ox, oz, fx, fz, rotY, width, depth, gMin, gMax, drop, nx: front.nx, nz: front.nz, L, W, ax, az, toWorld };
}

// Fläche mit Textur. Punkte lokal (x, y, z), Reihenfolge gegen den Uhrzeiger von aussen
function quad(pos, uv, a, b, c, d, uvs) {
  pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  uv.push(...uvs[0], ...uvs[1], ...uvs[2], ...uvs[0], ...uvs[2], ...uvs[3]);
}
function texMesh(pos, uv, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Dachflächen: Oberseite einseitig (sonst wirft sie Schatten auf sich selbst), Unterseite dunkel
function roofMeshes(group, rp, ru, color, tex) {
  const top = texMesh(rp, ru, new THREE.MeshLambertMaterial({ map: tex === undefined ? roofTex() : tex, color }));
  top.receiveShadow = false;
  group.add(top);
  const bp = [], bu = [];
  for (let i = 0; i < rp.length; i += 9) bp.push(...rp.slice(i + 6, i + 9), ...rp.slice(i + 3, i + 6), ...rp.slice(i, i + 3));
  for (let i = 0; i < ru.length; i += 6) bu.push(...ru.slice(i + 4, i + 6), ...ru.slice(i + 2, i + 4), ...ru.slice(i, i + 2));
  const under = texMesh(bp, bu, new THREE.MeshLambertMaterial({ color: 0x3a2c22 }));
  under.castShadow = false;
  group.add(under);
}

// Kasten-Wände (ohne Dach) als Textur-Flächen; s = Meter pro Texturkachel
function boxWalls(pos, uv, W, D, y0, y1, s) {
  const hw = W / 2;
  const P = [[-hw, 0], [hw, 0], [hw, D], [-hw, D]];   // Front, rechts, hinten, links (von oben im Uhrzeiger)
  let u = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = P[(i + 1) % 4], [x2, z2] = P[i];  // Umlauf so, dass aussen sichtbar ist
    const len = Math.hypot(x2 - x1, z2 - z1);
    quad(pos, uv, [x1, y0, z1], [x2, y0, z2], [x2, y1, z2], [x1, y1, z1],
      [[u / s, y0 / s], [(u + len) / s, y0 / s], [(u + len) / s, y1 / s], [u / s, y1 / s]]);
    u += len;
  }
}

// Fenster an einer Seite. side: 'f' vorne, 'b' hinten, 'l' links, 'r' rechts; t = Position entlang der Seite
function windowAt(B, side, t, y, W, D, opt = {}) {
  const w = opt.w ?? 1.15, h = opt.h ?? 1.45;
  const hw = W / 2;
  let x, z, nx, nz, ry;
  if (side === 'f') { x = t; z = 0; nx = 0; nz = -1; ry = 0; }
  else if (side === 'b') { x = t; z = D; nx = 0; nz = 1; ry = 0; }
  else if (side === 'l') { x = -hw; z = t; nx = -1; nz = 0; ry = Math.PI / 2; }
  else { x = hw; z = t; nx = 1; nz = 0; ry = Math.PI / 2; }
  const out = opt.out ?? 0;
  const at = (o) => [x + nx * (o + out), z + nz * (o + out)];
  const [gx, gz] = at(0.03);
  B.box(gx, y, gz, w, h, 0.04, opt.glass ?? 0x1e1416, ry);                    // Glas
  if (opt.curtain !== false) {
    const [cx, cz] = at(0.05);
    const off = (w / 2 - 0.16);
    for (const s of [-1, 1]) {
      const px = cx + (side === 'f' || side === 'b' ? s * off : 0), pz = cz + (side === 'l' || side === 'r' ? s * off : 0);
      B.box(px, y, pz, 0.3, h - 0.1, 0.02, opt.curtain ?? 0x7a2236, ry);
    }
  }
  const [fx, fz] = at(0.08);
  const fc = opt.frame ?? 0xb9b2a2;
  B.box(fx, y + h / 2, fz, w + 0.16, 0.1, 0.12, fc, ry);
  B.box(fx, y - h / 2, fz, w + 0.3, 0.1, 0.2, fc, ry);                         // Sims
  const along = (o) => side === 'f' || side === 'b' ? [fx + o, fz] : [fx, fz + o];
  for (const s of [-1, 1]) { const [px, pz] = along(s * (w / 2 + 0.03)); B.box(px, y, pz, 0.08, h, 0.12, fc, ry); }
  const [mx, mz] = along(0); B.box(mx, y, mz, 0.05, h, 0.08, fc, ry);          // Mittelsprosse
  if (opt.shutter) {
    const [sx0, sz0] = at(0.1);
    for (const s of [-1, 1]) {
      if (opt.broken && s > 0) continue;                                       // ein Laden fehlt
      const o = s * (w / 2 + 0.33);
      const [px, pz] = side === 'f' || side === 'b' ? [sx0 + o, sz0] : [sx0, sz0 + o];
      B.box(px, y - (opt.askew && s < 0 ? 0.08 : 0), pz, 0.55, h + 0.05, 0.05, opt.shutter, ry);
      for (let k = -2; k <= 2; k++) B.box(px, y + k * 0.28, pz + (nz ? nz * 0.03 : 0) + 0, 0.5, 0.03, 0.06, 0x2a1414, ry);
    }
  }
  if (opt.roller != null) {
    // Rollladen halb unten
    const [rx, rz] = at(0.06);
    B.box(rx, y + h / 2 - opt.roller * h / 2, rz, w, opt.roller * h, 0.04, 0x8a8678, ry);
  }
}

// ---------- Hell's Club ----------
// Nach Nicks Concept Art: alte Gasthaus-Form mit Giebel zur Strasse, gelber Verputz,
// grüne Läden, zwei Klebdächer, Aussentreppe auf der linken Seite, oranger Anbau rechts,
// Neon-Schriftzug und Palmen-Graffiti im Erdgeschoss. Drei Etagen plus Dachboden.

// Rosa Wand mit Palmen-Silhouetten, Tags und abgeblättertem Putz (Erdgeschoss vorne)
function palmWallTex() {
  return canvasTex('clubpalms', 1024, 256, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, '#a86a84'); bg.addColorStop(0.45, '#cf7f9c'); bg.addColorStop(1, '#b0708c');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rnd(21);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 5); }
    const palm = (x, s, lean) => {
      g.strokeStyle = '#2a1424'; g.fillStyle = '#2a1424'; g.lineWidth = 9 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.5, h * 0.55, x + lean, h * 0.2); g.stroke();
      const tx = x + lean, ty = h * 0.2;
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI * 0.95 + k * Math.PI * 0.27;
        g.beginPath(); g.moveTo(tx, ty);
        g.quadraticCurveTo(tx + Math.cos(a) * 45 * s, ty + Math.sin(a) * 30 * s - 10, tx + Math.cos(a) * 85 * s, ty + Math.sin(a) * 20 * s + 30 * s);
        g.quadraticCurveTo(tx + Math.cos(a) * 45 * s, ty + Math.sin(a) * 30 * s + 6, tx, ty);
        g.fill();
      }
    };
    palm(150, 1.2, 30); palm(250, 0.75, -15); palm(790, 1.0, -22); palm(880, 0.7, 14);
    // Gras/Büsche unten
    g.fillStyle = '#2a1424';
    for (let x = 0; x < w; x += 14) { const hh = 10 + r() * 26; g.beginPath(); g.moveTo(x, h); g.lineTo(x + 7, h - hh); g.lineTo(x + 14, h); g.fill(); }
    // abgeblättert: heller Putz darunter
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(214,196,150,.75)'; g.fillRect(r() * w, r() * h * 0.8, 8 + r() * 36, 5 + r() * 16); }
    const tag = (x, y, col, s) => {
      g.strokeStyle = col; g.lineWidth = 5 * s; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) g.quadraticCurveTo(x + k * 14 * s + 7, y - 30 * s * r(), x + (k + 1) * 14 * s, y + (r() - 0.5) * 24 * s);
      g.stroke();
    };
    tag(20, 200, '#e8e8f0', 0.8); tag(940, 120, '#1a1a22', 0.6); tag(600, 235, '#e8e8f0', 0.6);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, h - 14, w, 14);
  });
}

// Neon-Schriftzug ohne Kasten (Buchstaben direkt an der Wand)
function neonLettersTex() {
  return canvasTex('hellletters', 1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = 'bold 170px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.shadowColor = '#ff2f86'; g.shadowBlur = 30;
    g.strokeStyle = '#ff5aa8'; g.lineWidth = 16; g.strokeText("HELL'S CLUB", w / 2, h / 2, w - 40);
    g.shadowBlur = 8; g.strokeStyle = '#ffe0ef'; g.lineWidth = 6; g.strokeText("HELL'S CLUB", w / 2, h / 2, w - 40);
  });
}

// Wellblech (Vordach), rot und angerostet
function metalTex() {
  return canvasTex('metalred', 128, 128, (g, w, h) => {
    g.fillStyle = '#8a2630'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 4, 0, 2, h); }
    const r = rnd(4);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(90,50,20,${0.2 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 3 + r() * 10, 2 + r() * 14); }
  }, true);
}

// Plakatrahmen mit leuchtender Tänzerin als einfacher Umriss (angezogen, wie ein Barschild)
export function posterTex() {
  return canvasTex('clubposter', 128, 192, (g, w, h) => {
    g.fillStyle = '#2a0c1c'; g.fillRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 90);
    grd.addColorStop(0, '#c0306a'); grd.addColorStop(1, '#3a0c24');
    g.fillStyle = grd; g.fillRect(8, 8, w - 16, h - 16);
    g.strokeStyle = '#ffc0dc'; g.lineWidth = 4; g.lineCap = 'round'; g.shadowColor = '#ff4f9a'; g.shadowBlur = 10;
    g.beginPath();
    g.arc(64, 46, 12, 0, Math.PI * 2);
    g.moveTo(64, 58); g.lineTo(60, 100); g.lineTo(46, 112); g.lineTo(82, 112); g.lineTo(68, 100);   // Kleid
    g.moveTo(58, 112); g.lineTo(54, 168); g.moveTo(70, 112); g.lineTo(76, 168);
    g.moveTo(62, 66); g.lineTo(40, 30); g.moveTo(66, 66); g.lineTo(88, 84);
    g.stroke();
    g.strokeStyle = '#d4af37'; g.lineWidth = 6; g.shadowBlur = 0; g.strokeRect(3, 3, w - 6, h - 6);
  });
}

export function buildClub(pts, ctx) {
  const { terrain, chunkAt, colliders } = ctx;
  const F = frameFromFootprint(pts, terrain);
  const W = F.width, D = F.depth, hw = W / 2;
  // u = Position von der Strasse aus gesehen (+ nach rechts), x = lokales System (+ nach links)
  const X = (u) => -u;
  const group = new THREE.Group();
  group.position.set(F.fx, F.gMin, F.fz);
  group.rotation.y = F.rotY;
  const base = -1.8 - F.drop;
  const G1 = 4.3, G2 = 7.7, H1 = 10.8;                // Decke EG, Decke 1. OG, Traufe (hohe alte Gasthaus-Etagen)
  const pitch = 0.5;
  const ridge = H1 + hw * Math.tan(pitch);

  // Wände: gelblicher, verwitterter Putz
  const pos = [], uv = [];
  boxWalls(pos, uv, W, D, base, H1, 5);
  for (const [z, sgn] of [[0, -1], [D, 1]]) {
    const a = [-hw * sgn, H1, z], b = [hw * sgn, H1, z], c = [0, ridge, z];
    pos.push(...a, ...b, ...c); uv.push(0, H1 / 5, W / 5, H1 / 5, W / 10, ridge / 5);
  }
  group.add(texMesh(pos, uv, new THREE.MeshLambertMaterial({ map: plasterTex('#d6c08a', 'clubyellow') })));
  // Erdgeschoss vorne: rosa Wand mit Palmen
  const mp = [], mu = [];
  quad(mp, mu, [hw - 0.15, 0.05, -0.03], [-hw + 0.15, 0.05, -0.03], [-hw + 0.15, G1 - 0.1, -0.03], [hw - 0.15, G1 - 0.1, -0.03], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  group.add(texMesh(mp, mu, new THREE.MeshLambertMaterial({ map: palmWallTex() })));
  // Oranger Anbau rechts im 1. OG (steht etwas vor)
  const a0 = hw - 2.9, a1 = hw - 0.05, ad = 0.3;
  const op = [], ou = [];
  quad(op, ou, [X(a0), G1, -ad], [X(a1), G1, -ad], [X(a1), G2, -ad], [X(a0), G2, -ad], [[0, 0], [0.6, 0], [0.6, 0.6], [0, 0.6]]);
  quad(op, ou, [X(a0), G1, 0], [X(a0), G1, -ad], [X(a0), G2, -ad], [X(a0), G2, 0], [[0, 0], [0.06, 0], [0.06, 0.6], [0, 0.6]]);
  quad(op, ou, [X(a1), G1, -ad], [X(a1), G1, 0], [X(a1), G2, 0], [X(a1), G2, -ad], [[0, 0], [0.06, 0], [0.06, 0.6], [0, 0.6]]);
  group.add(texMesh(op, ou, new THREE.MeshLambertMaterial({ map: plasterTex('#c9622c', 'clubannex') })));

  // Hauptdach mit grossem Vordach am Giebel
  const ov = 1.2, ovF = 1.9;
  const rp = [], ru = [];
  const eaveY = H1 - ov * Math.tan(pitch);
  const zl0 = -ovF, zl1 = D + 1.0;
  const slope = Math.hypot(hw + ov, ridge - eaveY);
  for (const s of [-1, 1]) {
    const e = s * (hw + ov);
    const A = [e, eaveY, zl0], B2 = [e, eaveY, zl1], C2 = [0, ridge + 0.05, zl1], D2 = [0, ridge + 0.05, zl0];
    if (s > 0) quad(rp, ru, A, D2, C2, B2, [[0, 0], [0, slope / 3], [(zl1 - zl0) / 3, slope / 3], [(zl1 - zl0) / 3, 0]]);
    else quad(rp, ru, A, B2, C2, D2, [[0, 0], [(zl1 - zl0) / 3, 0], [(zl1 - zl0) / 3, slope / 3], [0, slope / 3]]);
  }
  roofMeshes(group, rp, ru, 0xb0a8a0);

  // Klebdächer: rotes Wellblech über dem Eingang, braunes Band über dem 1. OG (mit Ecken)
  const pent = (x0, x1, y, d, drop, tex, color) => {
    const p = [], q = [];
    quad(p, q, [x0, y, 0], [x1, y, 0], [x1, y - drop, -d], [x0, y - drop, -d], [[0, 0], [(x1 - x0) / 2, 0], [(x1 - x0) / 2, d / 2], [0, d / 2]]);
    roofMeshes(group, p, q, color, tex);
  };
  pent(X(4.3), X(-4.6), G1 + 0.15, 1.5, 0.4, metalTex(), 0xffffff);
  pent(X(hw + 0.3), X(-hw - 0.3), G2 + 0.25, 1.0, 0.35, null, 0x9a8a80);

  const B = new Builder();
  const wood = 0x4a2e1c, woodD = 0x2e1c12;
  // Ortgang-Bretter, Pfetten und Sparrenköpfe
  const ang = Math.atan2(ridge - eaveY, hw + ov);
  for (const s of [-1, 1]) {
    for (const z of [zl0 + 0.1, zl1 - 0.1]) B.shape(new THREE.BoxGeometry(slope, 0.32, 0.12), s * (hw + ov) / 2, (eaveY + ridge) / 2 - 0.12, z, 1, 1, 1, woodD, 0, 0, -s * ang);
    for (let z = -ovF + 0.6; z < D; z += 0.9) B.box(s * (hw + ov / 2), eaveY + ov * Math.tan(pitch) / 2 - 0.2, z, ov + 0.1, 0.14, 0.12, wood);
    B.box(s * (hw + ov), eaveY - 0.12, (zl0 + zl1) / 2, 0.16, 0.16, zl1 - zl0, 0x5a5a58);    // Dachrinne
    B.box(s * (hw - 0.1), (base + eaveY) / 2, -0.12, 0.12, eaveY - base, 0.12, 0x6a6a68); // Fallrohr
  }
  for (const xp of [0, -hw * 0.5, hw * 0.5, -hw, hw]) {
    const yr = ridge - Math.abs(xp) * Math.tan(pitch) - 0.3;
    B.box(xp, yr, (zl0 + D) / 2, 0.24, 0.3, D - zl0 + 0.2, wood);                           // Pfette
    if (Math.abs(xp) > 0.1) B.shape(new THREE.BoxGeometry(0.14, 1.6, 0.14), xp * 0.96, yr - 0.6, -0.75, 1, 1, 1, woodD, 0, Math.PI / 4.5, 0); // Büge
  }
  B.box(-hw * 0.3, ridge - 0.2, D * 0.65, 0.7, 2.0, 0.7, 0x7a6a5c);                       // Kamin
  B.box(-hw * 0.3, ridge + 0.85, D * 0.65, 0.85, 0.1, 0.85, 0x3a3230);
  // Holzbalken unter den Klebdächern
  B.box(X(-0.15), G2 + 0.12, -0.05, W, 0.18, 0.12, wood);
  B.box(X(-0.15), G1 + 0.08, -0.05, 9.2, 0.14, 0.12, woodD);

  // Fenster mit grünen Läden
  const sh = { shutter: 0x2f4a36, frame: 0xe2dccb, curtain: 0x8a2a3a, glass: 0x3a1a22, w: 1.25, h: 1.75 };
  // 1. OG vorne: zwei links, eins rechts vom Schild, eins im Anbau
  for (const u of [-5.2, 2.9]) windowAt(B, 'f', X(u), G1 + 1.75, W, D, sh);
  windowAt(B, 'f', X(hw - 1.45), G1 + 1.75, W, D, { ...sh, shutter: null, out: ad });
  // 2. OG vorne: drei, Dachboden zwei
  for (const u of [-3.6, 0, 3.6]) windowAt(B, 'f', X(u), G2 + 1.65, W, D, { ...sh, broken: u === 3.6 });
  for (const u of [-1.4, 1.4]) windowAt(B, 'f', X(u), H1 + 1.3, W, D, { ...sh, w: 1.0, h: 1.3 });
  windowAt(B, 'f', X(hw - 1.45), 2.1, W, D, { ...sh, shutter: null, curtain: 0x5a1a2a });   // EG rechts
  // Seiten und hinten
  for (const side of ['l', 'r']) {
    const stairs = side === 'l';       // Aussentreppe auf der linken Seite (lokal +x)
    for (const [y, list] of [[2.0, stairs ? [11.0, 12.8] : [3.5, 9.5, 12]], [G1 + 1.7, stairs ? [2.6, 11.6] : [2.5, 5.5, 8.5, 11.5]], [G2 + 1.6, [2.5, 5.5, 8.5, 11.5]]]) {
      for (const z of list) if (z < D - 0.8) windowAt(B, side, z, y, W, D, { ...sh, w: 1.0, h: y < 2.5 ? 1.2 : 1.5, broken: z === 5.5 && side === 'r' });
    }
  }
  for (const u of [-3.5, 0, 3.5]) { windowAt(B, 'b', X(u), G1 + 1.7, W, D, sh); windowAt(B, 'b', X(u), G2 + 1.6, W, D, sh); }
  windowAt(B, 'b', X(2.5), 1.6, W, D, { w: 1.0, h: 1.0, curtain: false, glass: 0x241a1c, frame: 0x4a3a34 });

  // Eingang (leicht rechts der Mitte): rote Glas-Doppeltür, Plakate, Palmen in Töpfen, Kordel
  const du = 0.6, dx = X(du);
  B.box(dx, 1.45, 0.05, 2.5, 3.1, 0.2, 0x1a080c);
  for (const s of [-1, 1]) {
    B.box(dx + s * 0.55, 1.4, -0.05, 1.05, 2.8, 0.06, 0x6a0c18);
    B.box(dx + s * 0.55, 1.6, -0.09, 0.65, 1.9, 0.02, 0xb03050);                     // Glas, rot hinterleuchtet
    B.box(dx + s * 0.1, 1.15, -0.12, 0.04, 0.5, 0.05, 0xd4af37);
  }
  B.box(dx, 3.05, -0.5, 3.0, 0.12, 1.0, 0x2a1418);                                        // kleines Vordach über der Tür
  for (const s of [-1, 1]) {
    const px = dx + s * 1.45;
    B.shape(new THREE.CylinderGeometry(0.28, 0.2, 0.55, 8), px, 0.28, -0.45, 1, 1, 1, 0x5a5a5e);   // Topf
    B.shape(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 6), px, 1.0, -0.45, 1, 1, 1, 0x4a3a20);
    for (let k = 0; k < 6; k++) B.shape(new THREE.BoxGeometry(0.9, 0.03, 0.22), px + Math.cos(k) * 0.32, 1.45, -0.45 + Math.sin(k) * 0.32, 1, 1, 1, 0x2e5a2a, k * 1.05, 0, -0.5);
  }
  B.box(dx, 0.0, -1.6, 1.8, 0.03, 3.0, 0x8a1424);                                         // Teppich
  for (const s of [-1, 1]) for (const z of [-1.1, -2.9]) {
    B.box(dx + s * 1.2, 0.45, z, 0.07, 0.9, 0.07, 0xd4af37);
    B.box(dx + s * 1.2, 0.93, z, 0.14, 0.06, 0.14, 0xd4af37);
  }
  for (const s of [-1, 1]) B.shape(new THREE.BoxGeometry(0.05, 0.05, 1.8), dx + s * 1.2, 0.72, -2.0, 1, 1, 1, 0x9a1020);

  // Aussentreppe links (lokal +x) hinauf zur Holztür im 1. OG
  const SY = G1 / 2;                                    // Zwischenpodest des Treppenhauses
  const steps = 12, rise = SY / steps, run = 0.3, z0 = 0.7, sw = 1.3;
  const sx = hw + 0.05 + sw / 2;
  const walk = [];
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise, zc = z0 + i * run + run / 2;
    B.box(sx, top / 2 + base / 2, zc, sw, top - base, run, i % 2 ? 0x8e8a84 : 0x96928b);
    walk.push([sx, zc, sw / 2, run / 2, top]);
  }
  const zl = z0 + steps * run, landD = 1.8;
  B.box(sx, (SY + base) / 2, zl + landD / 2, sw, SY - base, landD, 0x8e8a84);
  walk.push([sx, zl + landD / 2, sw / 2, landD / 2, SY]);
  // Geländer
  const railLen = Math.hypot(steps * run, SY);
  B.shape(new THREE.BoxGeometry(0.05, 0.05, railLen), sx + sw / 2 - 0.05, SY / 2 + 0.95, z0 + steps * run / 2, 1, 1, 1, 0x3a3a3c, 0, -Math.atan2(SY, steps * run), 0);
  for (let i = 0; i <= steps; i += 3) B.box(sx + sw / 2 - 0.05, (i * rise) + 0.5, z0 + i * run, 0.04, 1.0, 0.04, 0x3a3a3c);
  B.box(sx + sw / 2 - 0.05, SY + 0.95, zl + landD / 2, 0.05, 0.05, landD, 0x3a3a3c);
  for (const z of [zl + 0.6, zl + landD]) B.box(sx + sw / 2 - 0.05, SY + 0.5, z, 0.04, 1.0, 0.04, 0x3a3a3c);
  // Holztür oben
  const doorZ = zl + landD / 2;
  B.box(hw + 0.04, SY + 1.1, doorZ, 0.08, 2.15, 1.0, 0x6a4424);
  B.box(hw + 0.09, SY + 1.1, doorZ - 0.33, 0.04, 0.08, 0.08, 0xc0a040);
  B.box(hw + 0.08, SY + 2.3, doorZ, 0.12, 0.12, 1.25, 0x3a2416);
  // Mülltonnen neben der Treppe, Klimagerät hinten
  for (const [z, c] of [[-0.6, 0x3a4a3e], [-1.6, 0x2e3a34], [0.4, 0x2a2e30]]) {
    B.box(sx + 1.6, 0.6, z, 0.75, 1.2, 0.85, c);
    B.box(sx + 1.6, 1.24, z - 0.05, 0.8, 0.08, 0.95, 0x1e2422);
  }
  B.box(X(-3), 2.2, D + 0.25, 0.9, 0.6, 0.45, 0xcfcbc0);
  for (const [x, z, s] of [[sx + 2.5, -1.0, 0.4], [sx + 2.4, 0.2, 0.34]]) B.shape(new THREE.SphereGeometry(1, 7, 5), x, s * 0.8, z, s, s * 0.9, s, 0x161616);

  const plain = B.build(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5);
  plain.castShadow = true; plain.receiveShadow = true;
  group.add(plain);

  // Leuchtendes
  const glow = (tex, transparent = false) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent, depthWrite: !transparent });
  const letters = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.5), glow(neonLettersTex(), true));
  letters.position.set(X(-1.15), G1 + 1.0, -0.08); letters.rotation.y = Math.PI;
  const fig = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), glow(neonFigureTex(), true));
  fig.position.set(X(-0.9), G1 + 2.45, -0.08); fig.rotation.y = Math.PI;
  group.add(letters, fig);
  for (const u of [-2.3, 3.3]) {
    const pst = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), glow(posterTex()));
    pst.position.set(X(u), 1.75, -0.07); pst.rotation.y = Math.PI;
    group.add(pst);
  }
  const neonB = new Builder();
  for (const s of [-1, 1]) neonB.box(dx + s * 1.28, 1.5, -0.1, 0.06, 3.0, 0.06, 0xff4f9a);
  neonB.box(dx, 2.98, -0.1, 2.6, 0.06, 0.06, 0xff4f9a);
  for (const u of [-2.6, 3.6]) neonB.box(X(u), G1 - 0.3, -0.15, 0.32, 0.18, 0.2, 0xffd890);     // Wandlampen
  neonB.box(X(-5.6), 3.6, -0.12, 0.3, 0.18, 0.2, 0xffd890);
  neonB.box(sx - 0.55, SY + 2.15, doorZ, 0.25, 0.2, 0.25, 0xffe0a0);                             // Lampe über der Holztür
  const neon = neonB.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  group.add(neon);
  // Graffiti an den Seiten
  for (const [x, y, z, ry, seed] of [[hw + 0.04, 1.2, 9.0, Math.PI / 2, 3], [-hw - 0.04, 1.2, D * 0.45, -Math.PI / 2, 8], [-hw - 0.04, 1.3, D * 0.8, -Math.PI / 2, 13]]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshLambertMaterial({ map: graffitiTex(seed), transparent: true, depthWrite: false }));
    gm.position.set(x, y, z); gm.rotation.y = ry;
    group.add(gm);
  }

  (chunkAt(F.ox, F.oz).extra ||= []).push(group);

  // Kollision: Hauptkörper, Treppe (begehbar), Mülltonnen, Pflanzen
  const oy = F.gMin;
  colliders.addOrientedBox(F.ox, F.oz, F.ax, F.az, F.L / 2, F.W / 2, oy - 2, oy + ridge + 1);
  const c = Math.cos(F.rotY), s = Math.sin(F.rotY);
  // lokale x-Achse in Weltkoordinaten: (c, -s)
  for (const [x, z, hu, hv, top] of walk) {
    const [wx, wz] = F.toWorld(x, z);
    colliders.addOrientedBox(wx, wz, c, -s, hu, hv, oy + base, oy + top).walk = true;
  }
  for (const [x, z, r] of [[sx + 1.6, -0.6, 0.5], [sx + 1.6, -1.6, 0.5], [sx + 1.6, 0.4, 0.5], [dx - 1.45, -0.45, 0.3], [dx + 1.45, -0.45, 0.3]]) {
    const [wx, wz] = F.toWorld(x, z);
    colliders.addCircle(wx, wz, r);
  }

  const [ex, ez] = F.toWorld(dx, -2.6);
  const [ux, uz] = F.toWorld(sx, doorZ);
  const [nx, nz] = F.toWorld(dx, -0.9);
  const result = { id: 'club', name: "Hell's Club", door: { x: ex, z: ez }, entry: { x: nx, z: nz, y: oy }, upperDoor: { x: ux, z: uz, y: oy + SY }, x: F.ox, z: F.oz, heading: F.rotY };
  // Parkplatz hinter dem Haus
  const [px, pz] = F.toWorld(0, D + 9);
  const pg = terrain.heightAt(px, pz);
  if (Math.abs(pg - F.gMin) < 3 && terrain.roadAt(px, pz, 1) !== terrain.roadAt(px, pz, 1)) {
    const P = new Builder();
    P.box(0, 0, 0, 12, 0.08, 6, 0x3b3c3e);
    for (let k = -2; k <= 2; k++) P.box(k * 2.6, 0.05, 0, 0.12, 0.02, 5, 0xe8e8e8);
    const pm = P.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
    pm.receiveShadow = true;
    pm.position.set(px, pg + 0.04, pz); pm.rotation.y = F.rotY;
    (chunkAt(px, pz).extra ||= []).push(pm);
    result.parking = { x: px, z: pz, heading: F.rotY + Math.PI };
  }
  return { result, info: { x: F.ox, z: F.oz, pts, church: false } };
}

// ---------- Wohnblock ----------
export function buildBlock(pts, ctx) {
  const { terrain, chunkAt, colliders } = ctx;
  const F = frameFromFootprint(pts, terrain);
  const W = F.width, D = F.depth;
  const group = new THREE.Group();
  group.position.set(F.fx, F.gMin, F.fz);
  group.rotation.y = F.rotY;
  const floors = 4, FH = 2.9, G0 = 0.9;            // Hochparterre
  const H = G0 + floors * FH;
  const pitch = 0.3, ov = 0.7;
  const ridge = H + (D / 2) * Math.tan(pitch);     // First parallel zur Front

  const pos = [], uv = [];
  boxWalls(pos, uv, W, D, G0 + 0.6, H, 5);
  // Giebel links und rechts
  for (const [x, sgn] of [[-W / 2, -1], [W / 2, 1]]) {
    const a = [x, H, D * (sgn > 0 ? 1 : 0)], b = [x, H, D * (sgn > 0 ? 0 : 1)], c = [x, ridge, D / 2];
    pos.push(...a, ...b, ...c); uv.push(0, H / 5, D / 5, H / 5, D / 10, ridge / 5);
  }
  group.add(texMesh(pos, uv, new THREE.MeshLambertMaterial({ map: plasterTex('#a9a194', 'block') })));
  const low = [], lowUv = [];
  boxWalls(low, lowUv, W, D, -1.8 - F.drop, G0 + 0.6, 4);
  group.add(texMesh(low, lowUv, new THREE.MeshLambertMaterial({ map: plasterTex('#6f6a62', 'blocklow') })));
  // Dach (First parallel zur Front)
  const rp = [], ru = [];
  const eaveY = H - ov * Math.tan(pitch);
  const x0 = -W / 2 - ov, x1 = W / 2 + ov;
  const slope = Math.hypot(D / 2 + ov, ridge - eaveY);
  quad(rp, ru, [x1, eaveY, -ov], [x0, eaveY, -ov], [x0, ridge, D / 2], [x1, ridge, D / 2], [[0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, slope / 3], [0, slope / 3]]);
  quad(rp, ru, [x0, eaveY, D + ov], [x1, eaveY, D + ov], [x1, ridge, D / 2], [x0, ridge, D / 2], [[0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, slope / 3], [0, slope / 3]]);
  roofMeshes(group, rp, ru, 0x9a9a9a);

  const B = new Builder();
  const r = rnd(42);
  // Fenster auf allen Seiten, vorne Balkone in zwei Achsen
  const cols = Math.max(3, Math.floor(W / 3.4));
  const balconyCols = [1, cols - 2];
  for (let f = 0; f < floors; f++) {
    const y = G0 + f * FH + 1.5;
    for (let c = 0; c < cols; c++) {
      const t = -W / 2 + (c + 0.5) * (W / cols);
      if (f === 0 && c === Math.floor(cols / 2)) continue;          // Hauseingang
      const roll = r() < 0.4 ? 0.3 + r() * 0.6 : null;
      const shut = r() < 0.25 ? 0x4e5a3e : null;
      windowAt(B, 'f', t, y, W, D, { roller: roll, shutter: shut, broken: shut && r() < 0.5, curtain: r() < 0.5 ? 0x8a7a5a : 0x6a3a2a });
      windowAt(B, 'b', t, y, W, D, { roller: r() < 0.4 ? 0.5 : null, curtain: 0x7a6a5a });
      // Balkone vorne ab dem 1. Stock
      if (f >= 1 && balconyCols.includes(c)) {
        const by = G0 + f * FH;
        B.box(t, by - 0.1, -0.75, 2.6, 0.18, 1.5, 0x8d8a82);
        B.box(t, by + 0.45, -1.47, 2.6, 0.9, 0.05, 0x4c4f50);
        for (const s of [-1, 1]) B.box(t + s * 1.28, by + 0.45, -0.75, 0.05, 0.9, 1.5, 0x4c4f50);
        B.box(t, by + 0.92, -1.47, 2.66, 0.06, 0.08, 0x3a3c3d);
        if (r() < 0.7) {                                            // Wäsche
          B.box(t, by + 1.3, -1.2, 2.2, 0.02, 0.02, 0xdddddd);
          for (let k = 0; k < 4; k++) B.box(t - 0.8 + k * 0.5, by + 1.05, -1.2, 0.35, 0.5, 0.02, [0xd8d0c0, 0x8a3a3a, 0x3a5a8a, 0xe0e0e0][k]);
        }
        if (r() < 0.5) B.box(t + 0.7, by + 0.3, -0.5, 0.5, 0.4, 0.4, 0x6a5a40);   // Kiste
      }
    }
    for (const side of ['l', 'r']) for (let k = 0; k < 2; k++) {
      windowAt(B, side, D * (0.3 + k * 0.4), y, W, D, { w: 0.9, roller: r() < 0.5 ? 0.5 : null, curtain: 0x7a6a5a });
    }
  }
  // Hauseingang: Tür, Vordach, Stufen, Briefkästen, Klingelschild
  const ex = -W / 2 + (Math.floor(cols / 2) + 0.5) * (W / cols);
  B.box(ex, G0 + 1.05, -0.04, 1.3, 2.3, 0.08, 0x5c4630);
  B.box(ex, G0 + 1.05, -0.09, 0.08, 2.1, 0.02, 0x2a2a2a);
  B.box(ex, G0 + 2.45, -0.7, 2.4, 0.15, 1.4, 0x6a6a68);
  for (let k = 0; k < 3; k++) B.box(ex, G0 * (k + 0.5) / 3, -0.4 - (2 - k) * 0.3, 2.0, G0 / 3 * 1.02, 0.35 + (2 - k) * 0.3 * 0 + 0.3, 0x8a8680);
  B.box(ex + 1.25, G0 + 1.2, -0.1, 0.9, 0.6, 0.18, 0x8a6b3a);
  B.box(ex - 0.9, G0 + 1.3, -0.06, 0.2, 0.3, 0.04, 0xbcb6a8);
  // Fallrohre, Satellitenschüssel, Mülltonnen
  for (const s of [-1, 1]) B.box(s * (W / 2 - 0.12), H / 2, -0.12, 0.12, H + 1.5, 0.12, 0x5a5a58);
  B.shape(new THREE.SphereGeometry(0.45, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), W / 2 - 2, G0 + 3 * FH + 1.6, -0.35, 1, 1, 0.35, 0xd8d8d0, 0, Math.PI / 2);
  for (let k = 0; k < 3; k++) B.box(ex + 2.6 + k * 0.75, 0.55, -0.6, 0.6, 1.1, 0.7, k % 2 ? 0x3a4a3a : 0x4a4e52);
  const plain = B.build(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5);
  plain.castShadow = true; plain.receiveShadow = true;
  group.add(plain);
  // Graffiti unten und Hausnummer
  for (const [x, z, ry, seed] of [[-W * 0.3, -0.04, Math.PI, 21], [W * 0.32, -0.04, Math.PI, 27], [-W / 2 - 0.04, D * 0.5, -Math.PI / 2, 33]]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), new THREE.MeshLambertMaterial({ map: graffitiTex(seed), transparent: true, depthWrite: false }));
    gm.position.set(x, 0.9, z); gm.rotation.y = ry;
    group.add(gm);
  }
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), new THREE.MeshLambertMaterial({ map: plainTex('STALDEN 3', '#20446e', '#ffffff') }));
  num.position.set(ex - 1.1, G0 + 2.0, -0.05); num.rotation.y = Math.PI;
  group.add(num);

  (chunkAt(F.ox, F.oz).extra ||= []).push(group);
  colliders.addOrientedBox(F.ox, F.oz, F.ax, F.az, F.L / 2, F.W / 2, F.gMin - 2, F.gMin + ridge + 1);
  const [dx, dz] = F.toWorld(ex, -1.6);
  return {
    result: { id: 'home', name: 'Wohnblock', door: { x: dx, z: dz }, x: F.ox, z: F.oz, heading: F.rotY },
    info: { x: F.ox, z: F.oz, pts, church: false },
  };
}
