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
function plasterTex(base, key) {
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

// Wandmalerei im Erdgeschoss: Sonnenuntergang mit Palmen-Silhouetten, darüber Graffiti
function muralTex() {
  return canvasTex('clubmural', 1024, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3a1a3c'); sky.addColorStop(0.35, '#a23b6a'); sky.addColorStop(0.6, '#e2765a'); sky.addColorStop(0.75, '#f2b26a');
    sky.addColorStop(0.76, '#5a2040'); sky.addColorStop(1, '#2a1020');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,210,140,.85)'; g.beginPath(); g.arc(w * 0.5, h * 0.75, 70, Math.PI, 0); g.fill();
    const palm = (x, s, lean) => {
      g.strokeStyle = '#1a0a14'; g.fillStyle = '#1a0a14'; g.lineWidth = 10 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.5, h * 0.55, x + lean, h * 0.22); g.stroke();
      const tx = x + lean, ty = h * 0.22;
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI * 0.95 + k * Math.PI * 0.27;
        g.beginPath(); g.moveTo(tx, ty);
        g.quadraticCurveTo(tx + Math.cos(a) * 45 * s, ty + Math.sin(a) * 30 * s - 10, tx + Math.cos(a) * 85 * s, ty + Math.sin(a) * 20 * s + 30 * s);
        g.quadraticCurveTo(tx + Math.cos(a) * 45 * s, ty + Math.sin(a) * 30 * s + 6, tx, ty);
        g.fill();
      }
    };
    palm(90, 1.1, 25); palm(210, 0.8, -18); palm(800, 1.15, -28); palm(930, 0.85, 16);
    // Abblätternde Stellen und Graffiti (eigene Fantasie-Tags)
    const r = rnd(5);
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(200,180,160,.5)'; g.fillRect(r() * w, r() * h, 10 + r() * 40, 6 + r() * 20); }
    const tag = (x, y, col, s) => {
      g.strokeStyle = col; g.lineWidth = 5 * s; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 9; k++) g.quadraticCurveTo(x + k * 14 * s + 7, y - 30 * s * r(), x + (k + 1) * 14 * s, y + (r() - 0.5) * 24 * s);
      g.stroke();
    };
    tag(300, 210, '#d8d8e0', 1); tag(560, 230, '#7ad0ff', 0.8); tag(30, 240, '#ffffff', 0.7);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, h - 18, w, 18);
  });
}

function graffitiTex(seed) {
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

// Neonschild: Schriftzug mit Untertitel (leuchtet, ungelichtet)
function neonSignTex() {
  return canvasTex('hellsign', 1024, 320, (g, w, h) => {
    g.fillStyle = '#1a0c12'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff4f9a'; g.lineWidth = 8; g.shadowColor = '#ff2f86'; g.shadowBlur = 24;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.font = 'bold 150px "Arial Black", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffd0e4'; g.fillText("HELL'S CLUB", w / 2, h * 0.42, w - 70);
    g.shadowBlur = 40; g.fillStyle = 'rgba(255,80,160,.6)'; g.fillText("HELL'S CLUB", w / 2, h * 0.42, w - 70);
    g.shadowBlur = 14; g.font = 'bold 54px Arial'; g.fillStyle = '#ff9ac4';
    g.fillText('STRIP  ·  BAR  ·  PRIVATE', w / 2, h * 0.8, w - 120);
  });
}

// Neon-Figur über dem Schild: liegende Dame als einfache Umrisslinie (wie ein klassisches Barschild)
function neonFigureTex() {
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

function plainTex(text, bg, fg) {
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
  const ground = pts.map(([x, z]) => terrain.groundAt(x, z));
  const gMin = Math.min(...ground), gMax = Math.max(...ground);
  const toWorld = (x, z) => {
    const c = Math.cos(rotY), s = Math.sin(rotY);
    return [fx + x * c + z * s, fz - x * s + z * c];
  };
  return { ox, oz, fx, fz, rotY, width, depth, gMin, gMax, nx: front.nx, nz: front.nz, L, W, ax, az, toWorld };
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
function roofMeshes(group, rp, ru, color) {
  const top = texMesh(rp, ru, new THREE.MeshLambertMaterial({ map: roofTex(), color }));
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
  const at = (o) => [x + nx * o, z + nz * o];
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
export function buildClub(pts, ctx) {
  const { terrain, chunkAt, colliders } = ctx;
  const F = frameFromFootprint(pts, terrain);
  const W = F.width, D = F.depth;
  const group = new THREE.Group();
  group.position.set(F.fx, F.gMin, F.fz);
  group.rotation.y = F.rotY;
  const base = -1.6 - (F.gMax - F.gMin) * 0;       // Sockel reicht in den Hang
  const G = 3.6, H1 = 6.7;                           // Erdgeschoss-Höhe, Traufe
  const pitch = 0.62;                                // Dachneigung (rad)
  const ridge = H1 + (W / 2) * Math.tan(pitch);

  // Wände: verwittert beige, unten weinrot
  const pos = [], uv = [];
  boxWalls(pos, uv, W, D, G, H1, 5);
  // Giebeldreiecke vorne und hinten
  for (const [z, sgn] of [[0, -1], [D, 1]]) {
    const a = [-W / 2 * sgn, H1, z], b = [W / 2 * sgn, H1, z], c = [0, ridge, z];
    pos.push(...a, ...b, ...c); uv.push(0, H1 / 5, W / 5, H1 / 5, W / 10, ridge / 5);
  }
  group.add(texMesh(pos, uv, new THREE.MeshLambertMaterial({ map: plasterTex('#c9b9a0', 'club'), side: THREE.FrontSide })));
  const low = [], lowUv = [];
  boxWalls(low, lowUv, W, D, base, G, 5);
  group.add(texMesh(low, lowUv, new THREE.MeshLambertMaterial({ map: plasterTex('#6e2a3a', 'clublow') })));
  // Wandmalerei auf der Front (Erdgeschoss)
  const mp = [], mu = [];
  quad(mp, mu, [W / 2 - 0.3, 0.25, -0.03], [-W / 2 + 0.3, 0.25, -0.03], [-W / 2 + 0.3, G - 0.15, -0.03], [W / 2 - 0.3, G - 0.15, -0.03], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  group.add(texMesh(mp, mu, new THREE.MeshLambertMaterial({ map: muralTex() })));

  // Dach mit Überstand, Sparren und Kamin
  const ov = 0.9, ovF = 1.1;
  const rp = [], ru = [];
  const eaveY = H1 - ov * Math.tan(pitch);
  const zl0 = -ovF, zl1 = D + ovF;
  for (const s of [-1, 1]) {
    const e = [s * (W / 2 + ov), eaveY], r = [0, ridge + 0.05];
    const A = [e[0], e[1], zl0], B2 = [e[0], e[1], zl1], C2 = [r[0], r[1], zl1], D2 = [r[0], r[1], zl0];
    const slope = Math.hypot(W / 2 + ov, ridge - eaveY);
    if (s > 0) quad(rp, ru, A, D2, C2, B2, [[0, 0], [0, slope / 3], [(zl1 - zl0) / 3, slope / 3], [(zl1 - zl0) / 3, 0]]);
    else quad(rp, ru, A, B2, C2, D2, [[0, 0], [(zl1 - zl0) / 3, 0], [(zl1 - zl0) / 3, slope / 3], [0, slope / 3]]);
  }
  roofMeshes(group, rp, ru, 0xffffff);
  const B = new Builder();
  // Dachkanten (Ortgang) und Sparren
  for (const s of [-1, 1]) {
    const len = Math.hypot(W / 2 + ov, ridge - eaveY);
    const ang = Math.atan2(ridge - eaveY, W / 2 + ov);
    for (const z of [zl0 + 0.08, zl1 - 0.08]) {
      B.shape(new THREE.BoxGeometry(len, 0.22, 0.14), s * (W / 4 + ov / 2), (eaveY + ridge) / 2 - 0.08, z, 1, 1, 1, 0x3a2418, 0, 0, -s * ang);
    }
    for (let z = 0.4; z < D; z += 1.1) B.box(s * (W / 2 + ov / 2), H1 - ov * Math.tan(pitch) / 2 - 0.12, z, ov + 0.2, 0.14, 0.12, 0x3a2418);
    B.box(s * (W / 2 + ov), eaveY - 0.12, D / 2, 0.16, 0.16, D + ovF * 2, 0x4a4a48);            // Dachrinne
  }
  B.box(W * 0.18, ridge - 0.3, D * 0.62, 0.8, 2.2, 0.8, 0x6a5a4c);                                // Kamin
  B.box(W * 0.18, ridge + 0.85, D * 0.62, 0.95, 0.12, 0.95, 0x3a3230);
  // Fallrohre an den Ecken
  for (const s of [-1, 1]) B.box(s * (W / 2 - 0.15), (base + eaveY) / 2, -0.12, 0.12, eaveY - base, 0.12, 0x5a5a58);

  // Fenster: vorne oben zwei (Mitte frei für das Schild), Giebelfenster, Seiten
  const shutter = 0x5a2226;
  windowAt(B, 'f', -W * 0.31, G + 1.55, W, D, { shutter, askew: true });
  windowAt(B, 'f', W * 0.31, G + 1.55, W, D, { shutter, broken: true });
  windowAt(B, 'f', 0, H1 + 1.0, W, D, { w: 0.9, h: 1.1, shutter: 0x4a1c20, curtain: 0x5a1a2a });
  for (const side of ['l', 'r']) {
    for (let k = 0; k < 3; k++) windowAt(B, side, D * (0.22 + k * 0.28), G + 1.55, W, D, { shutter, broken: k === 1 && side === 'l', askew: k === 2 });
    windowAt(B, side, D * 0.7, 1.9, W, D, { w: 0.9, h: 0.9, curtain: false, glass: 0x241a1c, frame: 0x4a3a34 });
  }
  for (let k = 0; k < 3; k++) windowAt(B, 'b', -W * 0.3 + k * W * 0.3, G + 1.55, W, D, { shutter });
  windowAt(B, 'b', W * 0.25, 1.8, W, D, { w: 1.6, h: 1.2, curtain: 0x5a1a2a });

  // Eingang: rote Doppeltür, Vordach mit Neonkante, Lampen, Absperrkordel, roter Teppich
  B.box(0, 1.2, 0.05, 2.2, 2.6, 0.2, 0x2a0c10);                                                 // Türnische
  for (const s of [-1, 1]) B.box(s * 0.47, 1.15, -0.04, 0.9, 2.3, 0.06, 0x8a1420);              // Türflügel
  for (const s of [-1, 1]) B.box(s * 0.12, 1.15, -0.09, 0.05, 0.4, 0.05, 0xd4af37);             // Griffe
  B.box(0, 2.75, -0.8, 3.4, 0.2, 1.6, 0x2a1a1e);                                                // Vordach
  B.box(0, -0.0, -1.9, 1.6, 0.03, 2.6, 0x8a1424);                                               // Teppich
  for (const s of [-1, 1]) for (const z of [-1.0, -2.8]) {
    B.box(s * 1.25, 0.45, z, 0.07, 0.9, 0.07, 0xd4af37);
    B.box(s * 1.25, 0.92, z, 0.14, 0.06, 0.14, 0xd4af37);
  }
  for (const s of [-1, 1]) B.shape(new THREE.BoxGeometry(0.05, 0.05, 1.8), s * 1.25, 0.72, -1.9, 1, 1, 1, 0x9a1020);
  // Klimagerät, Container, Abfallsäcke, Mülltonne
  B.box(-W / 2 - 0.2, G + 1.0, D * 0.45, 0.4, 0.6, 0.9, 0xcfcbc0);
  B.box(-W / 2 - 0.42, G + 1.0, D * 0.45, 0.04, 0.45, 0.45, 0x3a3a3a);
  B.box(-W / 2 + 1.6, 0.6, -1.5, 2.0, 1.2, 1.2, 0x3e4a42);
  B.box(-W / 2 + 1.6, 1.25, -1.5, 2.05, 0.1, 1.25, 0x2e3832);
  for (const [x, z, s] of [[-W / 2 + 0.3, -1.2, 0.45], [-W / 2 + 0.7, -0.6, 0.38], [W / 2 - 0.6, -0.7, 0.42]]) {
    B.shape(new THREE.SphereGeometry(1, 7, 5), x, s * 0.8, z, s, s * 0.9, s, 0x161616);
  }
  B.box(W / 2 - 1.3, 0.5, -0.6, 0.6, 1.0, 0.6, 0x4a4e52);

  const plain = B.build(new THREE.MeshLambertMaterial({ vertexColors: true }), 0.5);
  plain.castShadow = true; plain.receiveShadow = true;
  group.add(plain);

  // Leuchtendes: Schild, Figur, Neonleisten, Lampen (ungelichtet, damit sie glühen)
  const glow = (tex, transparent = false) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent, depthWrite: !transparent });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.56), glow(neonSignTex()));
  sign.position.set(0, G + 0.35, -0.25); sign.rotation.y = Math.PI;
  const signBox = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.7, 0.25), new THREE.MeshLambertMaterial({ color: 0x1a1014 }));
  signBox.position.set(0, G + 0.35, -0.12);
  const fig = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), glow(neonFigureTex(), true));
  fig.position.set(0.4, G + 1.75, -0.3); fig.rotation.y = Math.PI;
  group.add(signBox, sign, fig);
  const neonB = new Builder();
  neonB.box(0, 2.64, -1.6, 3.4, 0.06, 0.06, 0xff4f9a);
  for (const s of [-1, 1]) neonB.box(s * 1.7, 2.64, -0.8, 0.06, 0.06, 1.6, 0xff4f9a);
  for (const s of [-1, 1]) neonB.box(s * 1.13, 1.2, -0.1, 0.06, 2.5, 0.06, 0xff4f9a);         // Türrahmen
  neonB.box(0, 2.45, -0.1, 2.3, 0.06, 0.06, 0xff4f9a);
  for (const s of [-1, 1]) neonB.box(s * (W / 2 - 1.4), G - 0.35, -0.12, 0.35, 0.2, 0.18, 0xffd890); // Wandlampen
  for (const [x, y] of [[-0.7, 2.6], [0.7, 2.6], [0, 2.6]]) neonB.box(x, y, -1.2, 0.18, 0.04, 0.18, 0xfff0c0); // Spots im Vordach
  neonB.box(0, 1.2, 0.0, 1.9, 2.3, 0.04, 0xa01a3a);                                              // rotes Licht im Türspalt
  const neon = neonB.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  group.add(neon);
  // Graffiti an Seite und Container
  for (const [x, y, z, ry, seed] of [[-W / 2 - 0.04, 1.3, D * 0.3, -Math.PI / 2, 3], [W / 2 + 0.04, 1.2, D * 0.55, Math.PI / 2, 8], [-W / 2 + 1.6, 0.7, -2.12, Math.PI, 11]]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshLambertMaterial({ map: graffitiTex(seed), transparent: true, depthWrite: false }));
    gm.position.set(x, y, z); gm.rotation.y = ry;
    group.add(gm);
  }

  (chunkAt(F.ox, F.oz).extra ||= []).push(group);

  // Kollision: Hauptkörper, Container, Mülltonne
  const oy = F.gMin;
  const bxL = F.ax, bzL = F.az;
  colliders.addOrientedBox(F.ox, F.oz, bxL, bzL, F.L / 2, F.W / 2, oy - 2, oy + ridge + 1);
  for (const [x, z, r] of [[-W / 2 + 1.6, -1.5, 1.0], [W / 2 - 1.3, -0.6, 0.4]]) {
    const [wx, wz] = F.toWorld(x, z);
    colliders.addCircle(wx, wz, r);
  }

  const [dx, dz] = F.toWorld(0, -2.6);
  const result = { id: 'club', name: "Hell's Club", door: { x: dx, z: dz }, x: F.ox, z: F.oz, heading: F.rotY };
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
  boxWalls(low, lowUv, W, D, -1.8, G0 + 0.6, 4);
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
