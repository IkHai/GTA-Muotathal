import * as THREE from 'three';

// Besondere Gebäude der Story im Stalden. Grundriss und Lage kommen aus OpenStreetMap,
// Aussehen, Schilder und Ausstattung sind eigenes Design (frei erfunden im Spiel-Stil).

export const LANDMARKS = [
  { id: 'club', name: "Hell's Club", x: 1514.8, z: -79.2, custom: 'club',
    style: { wall: 0xd6c27a, wallH: 9.8, wood: false, shutters: true, shutterColor: 0x2e5b3e, roof: 0x6a4a3a, gable: true } },
  { id: 'home', name: 'Wohnblock', x: 1541.3, z: -61.7, custom: 'block',
    style: { wall: 0x9c988b, wallH: 11.6, wood: false, shutters: false, roof: 0x5f5c57 } },
  { id: 'imbiss', name: 'Stalden One', x: 1483.2, z: -75.6,
    style: { wall: 0xece6d6, wallH: 3.9, wood: false, shutters: false, roof: 0x7d3328 } },
  { id: 'shop', name: 'Mode Muota', x: 1401.8, z: -41.3,
    style: { wall: 0xdcd4c4, wallH: 6.6, wood: false, shutters: false, roof: 0x55565a } },
];

export function findLandmark(b) {
  let cx = 0, cz = 0;
  const n = b.p.length / 2;
  for (let i = 0; i < b.p.length; i += 2) { cx += b.p[i] / 10; cz += b.p[i + 1] / 10; }
  cx /= n; cz /= n;
  return LANDMARKS.find((l) => Math.hypot(l.x - cx, l.z - cz) < 4);
}

// Wände mit Aussen-Normale; die Vorderseite ist die Wand, die am nächsten zur Strasse zeigt
function walls(info, terrain) {
  const out = [];
  const p = info.pts;
  for (let i = 0; i < p.length; i++) {
    const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length];
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.5) continue;
    const nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
    let road = 99;
    for (let d = 1; d <= 14; d++) {
      const h = terrain.roadAt(mx + nx * d, mz + nz * d, 0);
      if (h === h) { road = d; break; }
    }
    out.push({ x1, z1, x2, z2, len, nx, nz, mx, mz, road });
  }
  const front = out.filter((w) => w.len > 3).sort((a, b) => a.road - b.road || b.len - a.len)[0] || out[0];
  const back = out.filter((w) => w.len > 3).sort((a, b) => (b.nx * -front.nx + b.nz * -front.nz) - (a.nx * -front.nx + a.nz * -front.nz))[0] || front;
  return { all: out, front, back };
}

// ---------- Texturen (alles selbst gezeichnet) ----------
const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (texCache[key] = t);
}

function signTex(text, { bg = '#1b1b1d', fg = '#fff', glow = null, font = 'bold 72px "Arial Black", Arial', border = null, w = 512, h = 128 } = {}) {
  return canvasTex('sign:' + text + bg + fg, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); }
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = glow; g.shadowBlur = 22; }
    g.fillStyle = fg;
    g.fillText(text, w / 2, h / 2 + 4, w - 40);
    if (glow) g.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

// Wandmalerei: Strand mit Palmen (eigene Zeichnung)
function muralTex() {
  return canvasTex('mural', 512, 192, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8fc3dd'); sky.addColorStop(0.55, '#cfe6ef'); sky.addColorStop(0.56, '#4c9bb0'); sky.addColorStop(0.72, '#7fbfcc');
    sky.addColorStop(0.73, '#e3d3a4'); sky.addColorStop(1, '#cdb781');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * 60, 120); g.quadraticCurveTo(i * 60 + 15, 113, i * 60 + 30, 120); g.stroke(); }
    const palm = (x, s, lean) => {
      g.strokeStyle = '#7a5a36'; g.lineWidth = 9 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, 175); g.quadraticCurveTo(x + lean * 0.4, 110, x + lean, 60 * s + 10); g.stroke();
      const tx = x + lean, ty = 60 * s + 10;
      g.strokeStyle = '#2f6b33'; g.lineWidth = 7 * s;
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI + k * Math.PI / 6;
        g.beginPath(); g.moveTo(tx, ty);
        g.quadraticCurveTo(tx + Math.cos(a) * 30 * s, ty + Math.sin(a) * 22 * s - 6, tx + Math.cos(a) * 52 * s, ty + Math.sin(a) * 14 * s + 18 * s);
        g.stroke();
      }
    };
    palm(70, 1.1, 18); palm(200, 0.9, -14); palm(330, 1.15, 22); palm(450, 0.95, -10);
  });
}

function stripeTex(a, b) {
  return canvasTex('stripe' + a + b, 128, 32, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, h); }
  });
}

// ---------- Bausteine ----------
// Fläche an einer Wand, ein Stück nach aussen versetzt. u0/u1 = Anteil der Wandlänge
function wallPlane(w, u0, u1, y0, y1, mat, out = 0.07, repeat = 1) {
  const ax = w.x1 + (w.x2 - w.x1) * u0 + w.nx * out, az = w.z1 + (w.z2 - w.z1) * u0 + w.nz * out;
  const bx = w.x1 + (w.x2 - w.x1) * u1 + w.nx * out, bz = w.z1 + (w.z2 - w.z1) * u1 + w.nz * out;
  const g = new THREE.BufferGeometry();
  // gleiche Umlaufrichtung wie die Hauswände (aussen sichtbar); von aussen läuft x2 -> x1 nach rechts
  g.setAttribute('position', new THREE.Float32BufferAttribute([ax, y0, az, bx, y1, bz, bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([repeat, 0, 0, 1, 0, 0, repeat, 0, repeat, 1, 0, 1], 2));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

function at(w, u, out) { return [w.x1 + (w.x2 - w.x1) * u + w.nx * out, w.z1 + (w.z2 - w.z1) * u + w.nz * out]; }
const yaw = (w) => Math.atan2(w.nx, w.nz);

function palm(D, x, y, z, s, rng) {
  D.shape(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 8), x, y + 0.35, z, s, s, s, 0x8a4f32);
  let px = x, py = y + 0.7 * s, pz = z;
  const lean = rng() * 6.28;
  for (let k = 0; k < 5; k++) {
    const t = 0.06 * k;
    const nx = px + Math.sin(lean) * t * s, nz = pz + Math.cos(lean) * t * s;
    D.shape(new THREE.CylinderGeometry(0.11 - k * 0.012, 0.13 - k * 0.012, 0.75, 6), (px + nx) / 2, py + 0.37 * s, (pz + nz) / 2, s, s, s, 0x7a5a36);
    px = nx; pz = nz; py += 0.72 * s;
  }
  for (let k = 0; k < 7; k++) {
    const ry = k * 0.9 + lean, tilt = 0.55 + (k % 2) * 0.25;
    const dx = Math.sin(ry), dz = Math.cos(ry);
    D.shape(new THREE.BoxGeometry(0.34, 0.04, 1.6), px + dx * Math.cos(tilt) * 0.75 * s, py - Math.sin(tilt) * 0.75 * s, pz + dz * Math.cos(tilt) * 0.75 * s, s, s, s, k % 2 ? 0x3c7a3a : 0x2f6630, ry, tilt);
  }
}

function canopy(D, w, u, y, width, depth, color, ground) {
  const [x, z] = at(w, u, depth / 2);
  D.box(x, y, z, width, 0.12, depth, color, yaw(w));
  for (const s of [-1, 1]) {
    const [px, pz] = at(w, u + s * (width / 2 - 0.1) / w.len, depth - 0.1);
    D.box(px, (y + ground) / 2, pz, 0.08, y - ground, 0.08, color);
  }
}

// ---------- Gebäude ausstatten ----------
export function decorateLandmark(lm, info, { terrain, chunkAt, colliders }) {
  const ch = chunkAt(info.x, info.z);
  const D = ch.detail.plain;
  const extra = (ch.extra ||= []);
  const W = walls(info, terrain);
  const f = W.front, b = W.back;
  const y0 = info.gMin + info.sockel;      // Erdgeschoss-Boden
  const rng = mulberry(Math.round(info.x * 31 + info.z));
  const door = at(f, 0.5, 1.6);
  const result = { id: lm.id, name: lm.name, door: { x: door[0], z: door[1] }, x: info.x, z: info.z, heading: Math.atan2(-f.nx, -f.nz) };

  if (lm.id === 'club') {
    // Wandmalerei rundherum im Erdgeschoss, blau gestrichener Sockel
    const mural = new THREE.MeshLambertMaterial({ map: muralTex() });
    mural.map.wrapS = THREE.RepeatWrapping;
    for (const w of W.all) if (w.len > 2) extra.push(wallPlane(w, 0, 1, info.base + 0.6, y0 + 2.4, mural, 0.06, w.len / 7));
    // orangener Anbau-Teil hinten
    extra.push(wallPlane(b, 0.05, 0.95, y0 + 2.4, y0 + 5.2, new THREE.MeshLambertMaterial({ color: 0xd8623a }), 0.05));
    // Neonschild über dem Eingang
    const neon = new THREE.MeshBasicMaterial({ map: signTex("HELL'S CLUB", { bg: '#160a0c', fg: '#ff4a5a', glow: '#ff2040', border: '#ffb0c0' }), toneMapped: false });
    extra.push(wallPlane(f, 0.5 - 2.8 / f.len, 0.5 + 2.8 / f.len, y0 + 2.7, y0 + 3.8, neon, 0.12));
    // Eingang: dunkle Tür und grünes Vordach mit Pfosten
    extra.push(wallPlane(f, 0.5 - 0.7 / f.len, 0.5 + 0.7 / f.len, y0, y0 + 2.2, new THREE.MeshLambertMaterial({ color: 0x3a2418 }), 0.09));
    canopy(D, f, 0.5, y0 + 2.45, 2.2, 1.4, 0x2e5b3e, info.gMin);
    // Palmen in Töpfen neben dem Eingang
    for (const s of [-1, 1]) {
      const [px, pz] = at(f, 0.5 + s * 2.2 / f.len, 1.1);
      const g = terrain.heightAt(px, pz);
      palm(D, px, g, pz, 1, rng);
      colliders.addCircle(px, pz, 0.45);
    }
    // Terrasse hinten mit Sonnenschirmen
    const [tx, tz] = at(b, 0.5, 3.2);
    const tg = terrain.heightAt(tx, tz);
    D.box(tx, tg + 0.12, tz, Math.min(b.len * 0.85, 10), 0.24, 4.6, 0x7a5a3c, yaw(b));
    for (const s of [-1, 1]) {
      const [px, pz] = at(b, 0.5 + s * 2.6 / b.len, 3.4);
      const g = tg + 0.24;
      D.box(px, g + 0.72, pz, 1.1, 0.06, 1.1, 0xe8e2d4);
      D.box(px, g + 0.36, pz, 0.08, 0.72, 0.08, 0x3a3a3a);
      D.shape(new THREE.ConeGeometry(1.6, 0.6, 8), px, g + 2.4, pz, 1, 1, 1, s > 0 ? 0xb8241c : 0xe8d7a0);
      D.box(px, g + 1.2, pz, 0.05, 2.4, 0.05, 0xdddddd);
      colliders.addCircle(px, pz, 0.6);
    }
    // Parkplatz neben der Terrasse: Asphalt mit weissen Linien
    const [qx, qz] = at(b, 0.5, 10);
    const qg = terrain.heightAt(qx, qz);
    if (Math.abs(qg - tg) < 2.5 && terrain.roadAt(qx, qz, 1) !== terrain.roadAt(qx, qz, 1)) {
      const ry = yaw(b);
      D.box(qx, qg + 0.04, qz, 12, 0.08, 6, 0x3b3c3e, ry);
      for (let k = -2; k <= 2; k++) {
        const [lx, lz] = [qx + Math.cos(ry) * k * 2.6, qz - Math.sin(ry) * k * 2.6];
        D.box(lx, qg + 0.09, lz, 0.12, 0.02, 5, 0xe8e8e8, ry);
      }
      result.parking = { x: qx, z: qz, heading: ry + Math.PI };
    }
  } else if (lm.id === 'home') {
    // Balkone auf der Rückseite (zum Fluss), schmale Betonplatten mit Gitter
    for (let fl = 1; fl <= 3; fl++) {
      const y = y0 + fl * 2.9 - 0.15;
      if (y > info.top - 1) break;
      const [bx, bz] = at(b, 0.5, 0.75);
      const len = b.len * 0.8;
      D.box(bx, y, bz, len, 0.18, 1.5, 0x8d8a82, yaw(b));
      const [rx, rz] = at(b, 0.5, 1.45);
      D.box(rx, y + 0.55, rz, len, 0.9, 0.06, 0x4f5254, yaw(b));
      // Wäsche und eine kaputte Lamelle machen es schäbig
      if (fl === 2) D.box(rx, y + 0.7, rz + 0.02, 1.4, 0.5, 0.08, 0xc9c1a8, yaw(b));
    }
    // Wasserflecken an der Fassade
    const stain = new THREE.MeshLambertMaterial({ color: 0x6f6c63, transparent: true, opacity: 0.35, depthWrite: false });
    for (const w of W.all) if (w.len > 6) { const u0 = 0.1 + rng() * 0.5; extra.push(wallPlane(w, u0, u0 + 0.12 + rng() * 0.25, info.top - 3, info.top - 0.2, stain, 0.065)); }
    // Hauseingang mit Vordach und Briefkästen
    extra.push(wallPlane(f, 0.5 - 0.6 / f.len, 0.5 + 0.6 / f.len, y0, y0 + 2.2, new THREE.MeshLambertMaterial({ color: 0x5c4630 }), 0.09));
    canopy(D, f, 0.5, y0 + 2.5, 2.0, 1.2, 0x6a6a68, info.gMin);
    const [mx, mz] = at(f, 0.5 + 1.2 / f.len, 0.15);
    D.box(mx, y0 + 1.2, mz, 0.7, 0.5, 0.2, 0x8a6b3a, yaw(f));
    extra.push(wallPlane(f, 0.5 - 1.2 / f.len, 0.5 - 0.7 / f.len, y0 + 1.6, y0 + 1.9, new THREE.MeshLambertMaterial({ map: signTex('STALDEN 3', { bg: '#20446e', fg: '#fff', font: 'bold 60px Arial' }) }), 0.09));
  } else if (lm.id === 'imbiss') {
    // grosses Fenster, Leuchtschild, gestreifte Markise, Stehtische
    extra.push(wallPlane(f, 0.15, 0.85, y0 + 0.4, y0 + 2.2, new THREE.MeshLambertMaterial({ color: 0x2c3a44 }), 0.08));
    const sign = new THREE.MeshBasicMaterial({ map: signTex('STALDEN ONE', { bg: '#b3211c', fg: '#ffd23a', glow: '#ffb000' }), toneMapped: false });
    extra.push(wallPlane(f, 0.12, 0.88, y0 + 2.5, Math.min(info.top - 0.1, y0 + 3.4), sign, 0.1));
    const st = new THREE.MeshLambertMaterial({ map: stripeTex('#c4271f', '#f1ece0') });
    st.map.wrapS = THREE.RepeatWrapping;
    const [ax, az] = at(f, 0.5, 0.9);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(f.len * 0.72, 0.06, 1.8), st);
    aw.position.set(ax, y0 + 2.25, az); aw.rotation.set(0, yaw(f), 0, 'YXZ'); aw.rotateX(0.35);
    extra.push(aw);
    for (const s of [-1, 1]) {
      const [px, pz] = at(f, 0.5 + s * 2.4 / f.len, 2.6);
      const g = terrain.heightAt(px, pz);
      D.box(px, g + 0.55, pz, 0.08, 1.1, 0.08, 0x444444);
      D.shape(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 10), px, g + 1.1, pz, 1, 1, 1, 0xd8d0c0);
      colliders.addCircle(px, pz, 0.35);
    }
  } else if (lm.id === 'shop') {
    // Schaufenster mit Puppen, Schild, blaue Markise
    const glass = new THREE.MeshLambertMaterial({ color: 0x3b4d58 });
    for (const [u0, u1] of [[0.1, 0.42], [0.58, 0.9]]) {
      extra.push(wallPlane(f, u0, u1, y0 + 0.4, y0 + 2.3, glass, 0.08));
      for (let k = 0; k < 2; k++) {
        const [px, pz] = at(f, u0 + (u1 - u0) * (0.3 + k * 0.4), -0.6);
        D.box(px, y0 + 1.0, pz, 0.4, 1.0, 0.25, k ? 0xa23b4a : 0x2f4f7a, yaw(f));
        D.box(px, y0 + 1.65, pz, 0.22, 0.28, 0.22, 0xe0c9b0, yaw(f));
      }
    }
    extra.push(wallPlane(f, 0.46, 0.54, y0, y0 + 2.2, new THREE.MeshLambertMaterial({ color: 0x4a3626 }), 0.09));
    extra.push(wallPlane(f, 0.2, 0.8, y0 + 2.6, y0 + 3.4, new THREE.MeshLambertMaterial({ map: signTex('MODE MUOTA', { bg: '#f3efe6', fg: '#1f3a6a', font: 'italic bold 70px Georgia, serif', border: '#1f3a6a' }) }), 0.1));
    canopy(D, f, 0.5, y0 + 2.45, f.len * 0.8, 1.1, 0x2b4f86, info.gMin);
  }
  return result;
}

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
