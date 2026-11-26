import * as THREE from 'three';
import { Builder } from './builder.js';
import { Colliders } from './collision.js';
import { makeCharacter } from './player.js';
import { neonFigureTex, posterTex, plainTex } from './handmade.js';

// Begehbare Innenräume wie in den alten Open-World-Spielen: an der Tür „Betreten“ tippen,
// kurz schwarz, dann steht man drinnen. Die Räume liegen tief unter der Karte und haben
// eigene Kollisionen. Hell's Club (EG, 1. OG, 2. OG nach Nicks Grundriss) und der Wohnblock
// (Treppenhaus und Lars' Wohnung im 3. Stock).

const DEPTH = 300;   // so weit unter dem Boden liegen die Räume

// Einfarbige Flächen mit eingebackener Helligkeit (oben hell, Seiten mittel, unten dunkel):
// drinnen soll keine Sonne scheinen, darum ungelichtet.
function baked(B) {
  const p = B.pos, c = B.col;
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const k = ny / l > 0.6 ? 1 : ny / l < -0.6 ? 0.55 : 0.78 + 0.1 * (nz / l) + 0.04 * (nx / l);
    for (let t = 0; t < 9; t++) c[i + t] *= k;
  }
  const m = B.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  return m;
}
const glowMesh = (B) => B.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));

// Ein Stockwerk-Baukasten: alles in lokalen Koordinaten (Gruppe bei O), Kollision in Welt
class Kit {
  constructor(O, cols) { this.O = O; this.cols = cols; this.B = new Builder(); this.G = new Builder(); this.extra = []; }
  // fester Block mit Kollision
  solid(x, y, z, sx, sy, sz, color) {
    this.B.box(x, y, z, sx, sy, sz, color);
    const O = this.O;
    this.cols.addBox(O.x + x - sx / 2, O.x + x + sx / 2, O.z + z - sz / 2, O.z + z + sz / 2, O.y + y - sy / 2, O.y + y + sy / 2);
  }
  // nur Kollision
  block(x, z, sx, sz, y0, y1) {
    const O = this.O;
    this.cols.addBox(O.x + x - sx / 2, O.x + x + sx / 2, O.z + z - sz / 2, O.z + z + sz / 2, O.y + y0, O.y + y1);
  }
  // Boden (begehbar) und Decke
  floor(x0, x1, z0, z1, y, color) { this.solid((x0 + x1) / 2, y - 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, color); }
  // Wand entlang x (z fest) oder entlang z (x fest) mit Öffnungen [{c, w}]
  wall(axis, fixed, a0, a1, y0, h, color, gaps = [], t = 0.16, trim) {
    const segs = [];
    let s = a0;
    for (const g of gaps.slice().sort((p, q) => p.c - q.c)) { segs.push([s, g.c - g.w / 2]); s = g.c + g.w / 2; }
    segs.push([s, a1]);
    const put = (b0, b1, yb, hh) => {
      if (b1 - b0 < 0.01) return;
      if (axis === 'x') this.solid((b0 + b1) / 2, yb + hh / 2, fixed, b1 - b0, hh, t, color);
      else this.solid(fixed, yb + hh / 2, (b0 + b1) / 2, t, hh, b1 - b0, color);
    };
    for (const [b0, b1] of segs) put(b0, b1, y0, h);
    for (const g of gaps) {
      const gh = g.h ?? 2.15;
      put(g.c - g.w / 2, g.c + g.w / 2, y0 + gh, h - gh);
      // Türrahmen
      const fc = g.frame ?? 0x3a2418;
      if (axis === 'x') {
        for (const sg of [-1, 1]) this.B.box(g.c + sg * (g.w / 2 + 0.04), y0 + gh / 2, fixed, 0.08, gh, t + 0.06, fc);
        this.B.box(g.c, y0 + gh + 0.04, fixed, g.w + 0.16, 0.08, t + 0.06, fc);
      } else {
        for (const sg of [-1, 1]) this.B.box(fixed, y0 + gh / 2, g.c + sg * (g.w / 2 + 0.04), t + 0.06, gh, 0.08, fc);
        this.B.box(fixed, y0 + gh + 0.04, g.c, t + 0.06, 0.08, g.w + 0.16, fc);
      }
    }
    // Sockelleiste
    if (trim) for (const [b0, b1] of segs) {
      if (b1 - b0 < 0.01) continue;
      for (const sd of [-1, 1]) {
        if (axis === 'x') this.B.box((b0 + b1) / 2, y0 + 0.45, fixed + sd * (t / 2 + 0.02), b1 - b0, 0.9, 0.03, trim);
        else this.B.box(fixed + sd * (t / 2 + 0.02), y0 + 0.45, (b0 + b1) / 2, 0.03, 0.9, b1 - b0, trim);
      }
    }
  }
  // geschlossene Tür als Bild an einer Wand (nx/nz = Richtung in den Raum)
  door(x, y, z, nx, nz, color = 0x5a3420, w = 1.0) {
    const ry = nx ? Math.PI / 2 : 0;
    const off = 0.1;
    this.B.box(x + nx * off, y + 1.05, z + nz * off, w, 2.1, 0.05, color, ry);
    this.B.box(x + nx * (off + 0.01), y + 2.14, z + nz * (off + 0.01), w + 0.16, 0.1, 0.06, 0x2a1810, ry);
    for (const s of [-1, 1]) {
      const px = nx ? x + nx * (off + 0.01) : x + s * (w / 2 + 0.05), pz = nx ? z + s * (w / 2 + 0.05) : z + nz * (off + 0.01);
      this.B.box(px, y + 1.05, pz, 0.1, 2.1, 0.06, 0x2a1810, ry);
    }
    const hx = nx ? x + nx * (off + 0.05) : x + w * 0.35, hz = nx ? z + w * 0.35 : z + nz * (off + 0.05);
    this.B.box(hx, y + 1.0, hz, 0.1, 0.04, 0.1, 0xc0a040);
  }
  // Bild/Plakat (Textur) an der Wand
  picture(tex, x, y, z, w, h, ry, glow = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glow ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true }) : new THREE.MeshBasicMaterial({ map: tex, color: 0xb0b0b0 }));
    m.position.set(x, y, z); m.rotation.y = ry;
    this.extra.push(m);
    return m;
  }
  done(group) {
    group.add(baked(this.B));
    if (this.G.pos.length) group.add(glowMesh(this.G));
    for (const m of this.extra) group.add(m);
  }
}

function tableWithCandle(k, x, z, y = 0, r = 0.42) {
  k.B.shape(new THREE.CylinderGeometry(r, r, 0.05, 14), x, y + 0.72, z, 1, 1, 1, 0x3a2016);
  k.B.shape(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6), x, y + 0.35, z, 1, 1, 1, 0x1a1a1a);
  k.G.box(x, y + 0.82, z, 0.07, 0.14, 0.07, 0xffc870);
  k.block(x, z, r * 1.6, r * 1.6, y, y + 0.75);
}

// ---------- Hell's Club ----------
function buildClubInside(club, terrain, cols) {
  const O = new THREE.Vector3(club.x, terrain.heightAt(club.x, club.z) - DEPTH, club.z);
  const group = new THREE.Group(); group.position.copy(O);
  const k = new Kit(O, cols);
  const hx = 6.75, D = 13.5;
  const Y1 = 3.4, Y2 = 6.4, TOP = 9.0;
  const H0 = 3.2, H1 = 2.75, H2 = 2.6;              // Raumhöhen
  // Hülle: Aussenwände, Böden, Decken
  k.floor(-hx, hx, 0, D, 0, 0x2a141a);
  k.floor(-hx, hx, 0, D, Y1, 0x3a1418);
  k.floor(-hx, hx, 0, D, Y2, 0x6a6458);
  k.solid(0, H0 + 0.1, D / 2, hx * 2, 0.2, D, 0x120a0e);           // Decke EG
  k.solid(0, Y1 + H1 + 0.1, D / 2, hx * 2, 0.2, D, 0x1e0c10);
  k.solid(0, TOP + 0.1, D / 2, hx * 2, 0.2, D, 0xb8b2a4);
  for (const [y0, h, col] of [[0, H0, 0x3a1830], [Y1, H1, 0x5a1a22], [Y2, H2, 0xc8bea4]]) {
    k.wall('x', -0.08, -hx, hx, y0, h, col, [], 0.16);
    k.wall('x', D + 0.08, -hx, hx, y0, h, col, [], 0.16);
    k.wall('z', -hx - 0.08, 0, D, y0, h, col, [], 0.16);
    k.wall('z', hx + 0.08, 0, D, y0, h, col, [], 0.16);
  }
  // Holzverkleidung unten im EG und Neonleisten an der Decke
  for (const [x, z, sx, sz] of [[0, 0.02, hx * 2, 0.03], [0, D - 0.02, hx * 2, 0.03], [-hx + 0.02, D / 2, 0.03, D], [hx - 0.02, D / 2, 0.03, D]]) {
    k.B.box(x, 0.55, z, sx, 1.1, sz, 0x2a140e);
    k.G.box(x, H0 - 0.12, z, sx, 0.05, sz, z === 0.02 || z === D - 0.02 ? 0xff3a8a : 0x8a3aff);
  }
  // Fenster (innen dunkel, mit Vorhängen)
  const win = (x, y, z, ry, curtain) => {
    k.B.box(x, y, z, 1.1, 1.4, 0.04, 0x0c0a14, ry);
    for (const s of [-1, 1]) {
      const dx = ry ? 0 : s * 0.75, dz = ry ? s * 0.75 : 0;
      k.B.box(x + dx, y - 0.1, z + dz, 0.45, 1.9, 0.06, curtain, ry);
    }
  };

  // ===== EG: Hauptraum mit Bühne und Bar =====
  // Eingangstür (rot, Neonrahmen)
  k.B.box(0.6, 1.2, 0.04, 1.9, 2.4, 0.06, 0x6a0c18);
  k.G.box(0.6, 2.45, 0.08, 2.1, 0.05, 0.05, 0xff4f9a);
  for (const s of [-1, 1]) k.G.box(0.6 + s * 1.05, 1.2, 0.08, 0.05, 2.4, 0.05, 0xff4f9a);
  k.G.box(0.6, 2.75, 0.1, 0.9, 0.22, 0.04, 0x40ff80);                                   // Notausgang-Schild
  // Bar hinten
  k.solid(-1.0, 0.55, 12.0, 7.0, 1.1, 0.7, 0x3a1c12);
  k.B.box(-1.0, 1.13, 11.95, 7.3, 0.06, 0.9, 0x6b3f28);
  k.G.box(-1.0, 0.08, 11.62, 7.0, 0.04, 0.04, 0xff3a8a);
  k.solid(2.6, 0.55, 12.75, 0.7, 1.1, 0.8, 0x3a1c12);                                 // Ecke der Theke
  for (const y of [1.5, 2.0, 2.5]) {
    k.B.box(-1.0, y, D - 0.2, 7.4, 0.05, 0.3, 0x2a1410);
    k.G.box(-1.0, y + 0.03, D - 0.06, 7.4, 0.03, 0.03, y === 2.0 ? 0x3ac8ff : 0xff5aa8);
  }
  const bottles = [0x2f6b3a, 0x8a5a1a, 0xc8c8c0, 0x6a1a1a, 0x2a4a7a, 0xd0a030, 0x6a2a6a];
  for (let i = 0; i < 48; i++) {
    const x = -4.5 + (i % 16) * 0.46, y = [1.68, 2.18, 2.68][Math.floor(i / 16)];
    k.B.box(x, y, D - 0.2, 0.09, 0.3 + (i % 3) * 0.04, 0.09, bottles[(i * 5) % bottles.length]);
  }
  k.B.box(-1.0, 2.1, D - 0.35, 2.4, 1.0, 0.02, 0x5a5a6a);                              // Spiegel
  for (let i = 0; i < 6; i++) {
    const x = -4.0 + i * 1.15;
    k.B.shape(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 6), x, 0.38, 11.25, 1, 1, 1, 0x888888);
    k.B.shape(new THREE.CylinderGeometry(0.22, 0.2, 0.1, 10), x, 0.78, 11.25, 1, 1, 1, 0x8a1a2a);
  }
  // Bühne mit Stange, Neonring und Scheinwerfern (ohne Tänzerin)
  const sx = 0.3, sz = 6.4, sr = 2.0;
  k.B.shape(new THREE.CylinderGeometry(sr, sr + 0.05, 0.45, 32), sx, 0.225, sz, 1, 1, 1, 0x1a1418);
  k.B.shape(new THREE.CylinderGeometry(sr - 0.1, sr - 0.1, 0.02, 32), sx, 0.46, sz, 1, 1, 1, 0x3a2a34);
  k.G.shape(new THREE.TorusGeometry(sr + 0.02, 0.035, 6, 40), sx, 0.42, sz, 1, 1, 1, 0xff3a9a, 0, Math.PI / 2);
  k.B.shape(new THREE.CylinderGeometry(0.035, 0.035, H0 - 0.45, 8), sx, 0.45 + (H0 - 0.45) / 2, sz, 1, 1, 1, 0xe0e0e8);
  cols.addCircle(O.x + sx, O.z + sz, sr);
  const cones = [];
  for (const [cx, cz, col] of [[-1.6, 4.8, 0xff3aa8], [2.2, 4.8, 0xb04aff], [0.3, 8.6, 0xff6ac0]]) {
    k.B.box(cx, H0 - 0.15, cz, 0.3, 0.3, 0.3, 0x111111);
    const h = H0 - 0.3, dx = sx - cx, dz = sz - cz;
    const len = Math.hypot(dx, h, dz);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, len, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    cone.position.set((cx + sx) / 2, H0 - 0.3 - h / 2, (cz + sz) / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx, h, -dz).normalize());
    cones.push(cone); k.extra.push(cone);
  }
  // Lichtfleck auf der Bühne
  k.G.shape(new THREE.CylinderGeometry(1.2, 1.2, 0.01, 24), sx, 0.475, sz, 1, 1, 1, 0x6a2a52);
  // Diskokugel
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), new THREE.MeshBasicMaterial({ color: 0xd0d0e0 }));
  ball.position.set(-2.6, H0 - 0.55, 9.0);
  k.extra.push(ball);
  // Nischen mit Sofas links und rechts
  const booth = (x, z, side) => {
    const wx = x + side * 0.0;
    k.solid(wx, 0.25, z, 0.8, 0.5, 2.6, 0x5a1020);                         // Sitz
    k.B.box(wx - side * 0.35, 0.75, z, 0.25, 1.0, 2.6, 0x6a1428);          // Lehne
    for (const s of [-1, 1]) k.B.box(wx, 0.45, z + s * 1.25, 0.8, 0.9, 0.2, 0x4a0c1a);
    tableWithCandle(k, x + side * 1.15, z, 0, 0.45);
    k.G.box(x - side * 0.38, 2.0, z, 0.04, 0.3, 0.2, 0xffb070);           // Wandlampe
  };
  booth(-hx + 0.45, 3.2, -1); booth(-hx + 0.45, 8.0, -1);
  booth(hx - 0.45, 5.6, 1); booth(hx - 0.45, 9.4, 1);
  tableWithCandle(k, -2.8, 3.4); tableWithCandle(k, -3.0, 9.0); tableWithCandle(k, 3.5, 2.6 + 1.6);
  for (const [x, z] of [[-2.8, 2.6], [-2.8, 4.2], [-3.0, 8.2], [-3.0, 9.8]]) {
    k.B.box(x, 0.25, z, 0.5, 0.5, 0.5, 0x5a1020); k.B.box(x, 0.65, z + (z % 1 > 0.5 ? 0.2 : -0.2), 0.5, 0.4, 0.1, 0x4a0c1a);
  }
  // WC vorne rechts
  k.wall('z', 3.9, 0, 3.6, 0, H0, 0x3a1830, [], 0.14);
  k.wall('x', 3.6, 3.9, hx, 0, H0, 0x3a1830, [{ c: 5.3, w: 0.95 }], 0.14);
  k.B.box(5.3, 0.01, 1.8, 2.8, 0.02, 3.5, 0x8a8a90);                                    // Fliesen
  k.solid(6.2, 0.22, 0.7, 0.45, 0.44, 0.6, 0xe8e8e8); k.B.box(6.45, 0.7, 0.7, 0.15, 0.6, 0.5, 0xe8e8e8);   // Toilette
  k.solid(4.4, 0.85, 0.3, 0.6, 0.15, 0.45, 0xe0e0e0); k.B.box(4.4, 1.6, 0.04, 0.6, 0.8, 0.02, 0x7a8a9a);  // Lavabo, Spiegel
  k.picture(plainTex('WC', '#1a1a1a', '#ffffff'), 5.3, 2.5, 3.6 + 0.09, 0.5, 0.2, 0);
  // Treppe nach oben (hinten links) und Personal-Tür
  k.door(-hx, 0, 12.5, 1, 0, 0x4a2a18);
  k.picture(plainTex('PRIVAT', '#2a0a10', '#ff9ac4'), -hx + 0.1, 2.45, 12.5, 0.7, 0.18, Math.PI / 2);
  k.door(5.2, 0, D, 0, -1, 0x3a3a3a);
  // Neonfigur und Plakate
  k.picture(neonFigureTex(), hx - 0.12, 2.2, 7.6, 2.4, 1.2, -Math.PI / 2, true);
  k.picture(posterTex(), -hx + 0.1, 1.8, 5.6, 0.7, 1.0, Math.PI / 2, true);
  k.picture(posterTex(), hx - 0.1, 1.8, 11.2, 0.7, 1.0, -Math.PI / 2, true);

  // ===== 1. OG: VIP-Flur und vier VIP-Zimmer =====
  const cz0 = 5.9, cz1 = 7.6;
  k.wall('x', cz0, -hx, hx, Y1, H1, 0x5a1a22, [{ c: -3.4, w: 1.0 }, { c: 2.6, w: 1.0 }], 0.14, 0x2a140e);
  k.wall('x', cz1, -hx, hx, Y1, H1, 0x5a1a22, [{ c: -3.0, w: 1.0 }, { c: 2.6, w: 1.0 }], 0.14, 0x2a140e);
  k.wall('z', 0, 0, cz0, Y1, H1, 0x4a141c, [], 0.14);
  k.wall('z', 0, cz1, D, Y1, H1, 0x4a141c, [], 0.14);
  k.B.box(0, Y1 + 0.01, (cz0 + cz1) / 2, hx * 2 - 0.4, 0.02, 0.9, 0x8a1424);           // roter Läufer
  for (let x = -5.5; x <= 5.5; x += 2.75) {
    k.G.shape(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), x, Y1 + H1 - 0.05, (cz0 + cz1) / 2, 1, 1, 1, 0xff6a9a);
    for (const z of [cz0 + 0.1, cz1 - 0.1]) k.G.box(x + 1.3, Y1 + 1.8, z, 0.14, 0.22, 0.06, 0xffc080);
  }
  k.picture(posterTex(), -1.2, Y1 + 1.5, cz1 - 0.09, 0.6, 0.9, Math.PI, true);
  k.picture(posterTex(), 0.8, Y1 + 1.5, cz0 + 0.09, 0.6, 0.9, 0, true);
  k.door(-hx, Y1, (cz0 + cz1) / 2, 1, 0, 0x6a4424);                                     // Seitentür zur Aussentreppe
  k.door(5.6, Y1, cz1, 0, -1, 0x3a2418);                                               // Treppe nach unten
  k.door(5.6, Y1, cz0, 0, 1, 0x3a2418);                                                // Treppe nach oben
  k.picture(plainTex('↓ EG', '#1a0a10', '#ffd0e0'), 5.6, Y1 + 2.35, cz1 - 0.1, 0.5, 0.14, Math.PI);
  k.picture(plainTex('↑ 2. OG', '#1a0a10', '#ffd0e0'), 5.6, Y1 + 2.35, cz0 + 0.1, 0.5, 0.14, 0);
  const vipBed = (x, z, round, ry = 0) => {
    if (round) {
      k.B.shape(new THREE.CylinderGeometry(1.2, 1.2, 0.45, 24), x, Y1 + 0.23, z, 1, 1, 1, 0x7a1424);
      k.B.shape(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 24), x, Y1 + 0.49, z, 1, 1, 1, 0xa01a30);
      cols.addCircle(O.x + x, O.z + z, 1.2);
    } else {
      k.solid(x, Y1 + 0.25, z, 2.0, 0.5, 2.2, 0x7a1424);
      k.B.box(x, Y1 + 0.52, z + 0.2, 1.9, 0.06, 1.7, 0xa01a30);
    }
    for (const s of [-1, 1]) k.B.box(x + s * 0.45, Y1 + 0.6, z - (round ? 0.7 : 0.85), 0.6, 0.15, 0.35, 0xe8d8d8);
    k.B.box(x, Y1 + 1.0, z - (round ? 1.3 : 1.15), 2.2, 1.3, 0.15, 0x4a0c18);             // Kopfteil
    for (const s of [-1, 1]) {
      k.solid(x + s * 1.5, Y1 + 0.3, z - 1.0, 0.45, 0.6, 0.45, 0x2a1410);
      k.G.box(x + s * 1.5, Y1 + 0.75, z - 1.0, 0.2, 0.25, 0.2, 0xffa060);
    }
  };
  // vorne links: rundes Bett und Whirlpool
  vipBed(-4.0, 3.6, true);
  k.B.shape(new THREE.CylinderGeometry(1.0, 1.0, 0.6, 24), -1.4, Y1 + 0.3, 1.5, 1, 1, 1, 0x3a2a30);
  k.G.shape(new THREE.CylinderGeometry(0.88, 0.88, 0.02, 24), -1.4, Y1 + 0.62, 1.5, 1, 1, 1, 0x9a4aff);
  cols.addCircle(O.x - 1.4, O.z + 1.5, 1.0);
  win(-3.6, Y1 + 1.5, 0.05, 0, 0x8a1424);
  // vorne rechts: Bett, Sessel, Spiegel
  vipBed(3.6, 3.4, false);
  k.solid(1.0, Y1 + 0.3, 1.0, 0.8, 0.6, 0.8, 0x5a1020);
  k.B.box(6.6, Y1 + 1.5, 3.4, 0.03, 1.6, 1.0, 0x6a6a7a);
  win(3.6, Y1 + 1.6, 0.05, 0, 0x8a1424);
  // hinten links und rechts
  vipBed(-3.6, 11.2, false); vipBed(3.4, 11.0, true);
  k.G.shape(new THREE.TorusGeometry(0.9, 0.03, 6, 24), 3.4, Y1 + H1 - 0.06, 11.0, 1, 1, 1, 0xff3a6a, 0, Math.PI / 2);
  k.G.box(-3.6, Y1 + H1 - 0.06, 10.8, 2.2, 0.04, 0.04, 0xff3a6a);
  for (const x of [-hx + 0.3, hx - 0.3]) k.B.shape(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 8), x, Y1 + 0.25, D - 0.4, 1, 1, 1, 0x4a4a4a);   // Pflanzen
  for (const x of [-hx + 0.3, hx - 0.3]) for (let i = 0; i < 5; i++) k.B.box(x, Y1 + 0.9, D - 0.4, 0.7, 0.04, 0.16, 0x2e5a2a, i * 0.6);

  // ===== 2. OG: Office, Garderobe, Lager, WC =====
  k.wall('x', cz0, -hx, hx, Y2, H2, 0xb8ae94, [{ c: -3.4, w: 1.0 }, { c: 2.6, w: 1.0 }], 0.14, 0x6a5a48);
  k.wall('x', cz1, -hx, hx, Y2, H2, 0xb8ae94, [{ c: -3.0, w: 1.0 }, { c: 3.0, w: 0.9 }], 0.14, 0x6a5a48);
  k.wall('z', 0, 0, cz0, Y2, H2, 0xa89e86, [], 0.14);
  k.wall('z', 1.6, cz1, D, Y2, H2, 0xa89e86, [], 0.14);
  k.door(hx, Y2, (cz0 + cz1) / 2, -1, 0, 0x3a2418);                                    // Treppe nach unten
  k.picture(plainTex('↓ 1. OG', '#2a2a2a', '#ffffff'), hx - 0.1, Y2 + 2.3, (cz0 + cz1) / 2, 0.5, 0.14, -Math.PI / 2);
  k.G.box(0, Y2 + H2 - 0.05, (cz0 + cz1) / 2, 2.4, 0.05, 0.2, 0xe8f0ff);              // Neonröhre
  // Office (vorne links)
  k.solid(-3.4, Y2 + 0.4, 2.4, 2.2, 0.8, 1.0, 0x4a2a16);                               // Schreibtisch
  k.B.box(-3.4, Y2 + 0.82, 2.4, 2.3, 0.05, 1.1, 0x6a3a1e);
  k.B.box(-3.0, Y2 + 1.05, 2.6, 0.45, 0.4, 0.4, 0xd0c8a8);                               // alter Computer
  k.G.box(-3.0, Y2 + 1.07, 2.39, 0.34, 0.26, 0.02, 0x50a080);
  k.G.box(-4.1, Y2 + 1.1, 2.3, 0.15, 0.12, 0.15, 0xffd070);                              // Lampe
  k.B.box(-3.7, Y2 + 0.86, 2.2, 0.4, 0.02, 0.3, 0xf0f0e0);                              // Papiere
  k.B.box(-3.3, Y2 + 0.95, 2.1, 0.08, 0.22, 0.08, 0x8a5a1a);                              // Whisky
  k.solid(-3.4, Y2 + 0.55, 3.5, 0.7, 1.1, 0.7, 0x2a1810);                               // Ledersessel
  for (let i = 0; i < 3; i++) { k.solid(-hx + 0.35, Y2 + 0.65, 1.0 + i * 0.6, 0.55, 1.3, 0.55, 0x7a7a78); for (let j = 0; j < 3; j++) k.B.box(-hx + 0.64, Y2 + 0.3 + j * 0.4, 1.0 + i * 0.6, 0.02, 0.04, 0.2, 0x3a3a3a); }
  k.B.box(-0.12, Y2 + 1.5, 3.0, 0.03, 0.9, 1.4, 0x8a6a40);                               // Pinnwand
  for (let i = 0; i < 8; i++) k.B.box(-0.14, Y2 + 1.2 + (i % 3) * 0.25, 2.5 + (i * 0.37) % 1.1, 0.02, 0.18, 0.14, [0xe8e0d0, 0xd0a080, 0x9ab0c0][i % 3]);
  k.solid(-0.6, Y2 + 0.4, 5.3, 0.7, 0.8, 0.6, 0x3a3a3c);                                 // Tresor
  k.picture(posterTex(), -hx + 0.1, Y2 + 1.6, 4.4, 0.6, 0.9, Math.PI / 2, false);
  k.B.box(-3.4, Y2 + 1.4, 0.06, 1.2, 1.4, 0.03, 0x1a1a1a);
  for (let i = 0; i < 9; i++) k.B.box(-3.4, Y2 + 0.8 + i * 0.15, 0.09, 1.2, 0.04, 0.02, 0xc8b890);  // Lamellen
  // Garderobe (vorne rechts)
  for (let i = 0; i < 6; i++) { k.solid(hx - 0.3, Y2 + 0.9, 0.6 + i * 0.5, 0.5, 1.8, 0.45, i % 2 ? 0x5a6a7a : 0x4e5e6e); }
  k.solid(2.4, Y2 + 0.38, 0.4, 2.0, 0.76, 0.6, 0x3a2a24);
  k.B.box(2.4, Y2 + 1.5, 0.08, 1.6, 1.0, 0.02, 0x7a8a9a);
  for (let i = 0; i < 6; i++) k.G.box(1.6 + i * 0.32, Y2 + 2.05, 0.1, 0.09, 0.09, 0.05, 0xfff0c0);
  k.B.box(1.6, Y2 + 1.6, 4.6, 1.6, 0.04, 0.04, 0x9a9a9a);
  for (let i = 0; i < 6; i++) k.B.box(1.0 + i * 0.22, Y2 + 1.1, 4.6, 0.05, 0.9, 0.4, [0xc02a5a, 0x2a2a2a, 0xd0b040, 0x6a2a9a][i % 4]);
  // Lager (hinten links)
  for (const z of [8.3, 12.9]) for (let x = -6.0; x <= -1.2; x += 1.6) {
    k.block(x, z, 1.4, 0.5, Y2, Y2 + 2.2);
    for (const y of [0.1, 0.8, 1.5, 2.1]) k.B.box(x, Y2 + y, z, 1.4, 0.04, 0.5, 0x7a7a7a);
    for (const s of [-1, 1]) k.B.box(x + s * 0.68, Y2 + 1.1, z, 0.04, 2.2, 0.5, 0x5a5a5a);
    for (let j = 0; j < 3; j++) k.B.box(x - 0.4 + j * 0.42, Y2 + 0.3 + (j % 2) * 0.7, z, 0.36, 0.34, 0.4, [0xb08a5a, 0xe8e8e0, 0x9a7a4a][j]);
  }
  for (const [x, z] of [[-4.2, 10.5], [-3.6, 10.9], [-2.2, 10.4]]) k.solid(x, Y2 + 0.3, z, 0.6, 0.6, 0.6, 0x8a6a40);
  k.B.shape(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10), -5.6, Y2 + 0.3, 10.6, 1, 1, 1, 0x9a9aa0);
  k.G.box(-3.6, Y2 + H2 - 0.05, 10.6, 1.4, 0.05, 0.15, 0xe8f0ff);
  // WC Personal (hinten rechts)
  k.solid(4.6, Y2 + 0.22, 12.8, 0.45, 0.44, 0.6, 0xe8e8e8);
  k.solid(2.4, Y2 + 0.85, 13.2, 0.6, 0.15, 0.4, 0xe0e0e0);
  k.B.box(3.6, Y2 + 0.01, 10.6, 5.6, 0.02, 5.8, 0x8a9090);

  k.done(group);
  // Bruno steht vor der Bar
  const bruno = makeCharacter({ jacket: 0x5a1020, shirt: 0xe8dcc8, pants: 0x1e1e22, hair: 0x101010, skin: 0xc08a6a, shoe: 0x111111, wide: 1.25 });
  const bf = bruno.part;
  bruno.head.add(bf(new THREE.BoxGeometry(0.2, 0.05, 0.03), bruno.M(0x050505), 0, 0.02, 0.105));
  bruno.hip.add(bf(new THREE.TorusGeometry(0.1, 0.012, 6, 16), bruno.M(0xd4af37), 0, 0.55, 0.1, 1, 1.2, 1));
  bruno.group.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.copy(o.material.color).multiplyScalar(0.3); });
  bruno.group.position.set(-1.0, 0, 10.2);
  bruno.group.rotation.y = Math.PI;
  bruno.group.userData.fig = bruno;
  group.add(bruno.group);
  cols.addCircle(O.x - 1.0, O.z + 10.2, 0.35);

  const W = (x, y, z) => new THREE.Vector3(O.x + x, O.y + y, O.z + z);
  return {
    group, O, ball, cones, bruno: bruno.group,
    spots: {
      front: W(0.6, 0, 0.9), frontIn: W(0.6, 0, 1.6),
      egUp: W(-hx + 0.8, 0, 12.5), egArrive: W(-hx + 1.2, 0, 11.6),
      side: W(-hx + 0.7, Y1, (cz0 + cz1) / 2), sideIn: W(-hx + 1.2, Y1, (cz0 + cz1) / 2),
      ogDown: W(5.6, Y1, cz1 - 0.55), ogUp: W(5.6, Y1, cz0 + 0.55),
      og2Down: W(hx - 0.8, Y2, (cz0 + cz1) / 2), og2Arrive: W(hx - 1.3, Y2, (cz0 + cz1) / 2),
      bruno: W(-1.0, 0, 9.2), lars: W(-0.75, 0, 8.7),
      wide: W(3.6, 2.4, 4.2),
    },
  };
}

// ---------- Wohnblock: Treppenhaus und Lars' Wohnung ----------
function buildBlockInside(home, terrain, cols) {
  const O = new THREE.Vector3(home.x, terrain.heightAt(home.x, home.z) - DEPTH, home.z);
  const group = new THREE.Group(); group.position.copy(O);
  const k = new Kit(O, cols);
  // Treppenhaus (EG)
  const hx = 3, D = 5.5, H = 3.0;
  k.floor(-hx, hx, 0, D, 0, 0x8a8478);
  for (let x = -hx + 0.3; x < hx; x += 0.6) for (let z = 0.3; z < D; z += 0.6) if (((x + z) * 1.67 | 0) % 2) k.B.box(x, 0.005, z, 0.58, 0.01, 0.58, 0x6e685e);
  k.solid(0, H + 0.1, D / 2, hx * 2, 0.2, D, 0xd8d2c4);
  for (const [axis, f, a0, a1] of [['x', -0.08, -hx, hx], ['x', D + 0.08, -hx, hx], ['z', -hx - 0.08, 0, D], ['z', hx + 0.08, 0, D]]) {
    k.wall(axis, f, a0, a1, 0, H, 0xcfc8b4, [], 0.16);
  }
  for (const [x, z, sx, sz] of [[0, 0.02, hx * 2, 0.03], [0, D - 0.02, hx * 2, 0.03], [-hx + 0.02, D / 2, 0.03, D], [hx - 0.02, D / 2, 0.03, D]]) k.B.box(x, 0.7, z, sx, 1.4, sz, 0x5a7a62);
  // Haustür (Glas)
  k.B.box(0, 1.15, 0.04, 1.2, 2.3, 0.05, 0x6a5a40);
  k.B.box(0, 1.4, 0.07, 0.8, 1.4, 0.02, 0x9ab0b8);
  // Briefkästen
  for (let i = 0; i < 8; i++) k.B.box(-hx + 0.05, 1.2 + Math.floor(i / 4) * 0.35, 1.2 + (i % 4) * 0.42, 0.1, 0.3, 0.38, 0x8a7a50);
  // Treppe nach oben (Kulisse, ab der vierten Stufe versperrt)
  for (let i = 0; i < 14; i++) k.B.box(2.2, 0.1 + i * 0.2, 1.8 + i * 0.26, 1.4, 0.2, 0.26, 0x9a948a);
  for (let i = 0; i < 14; i++) k.B.box(2.2, i * 0.1, 1.8 + i * 0.26, 1.4, i * 0.2, 0.26, 0x8a847a);
  k.block(2.2, 3.6, 1.4, 3.8, 0, 3);
  k.B.shape(new THREE.BoxGeometry(0.05, 0.05, 4.2), 1.5, 1.9, 3.6, 1, 1, 1, 0x3a2a1a, 0, -Math.atan2(2.8, 3.64), 0);
  k.B.box(-1.5, 0.45, D - 0.1, 1.2, 0.7, 0.12, 0xe8e8e0);                               // Heizkörper
  k.G.shape(new THREE.SphereGeometry(0.1, 8, 6), 0, H - 0.4, 2.6, 1, 1, 1, 0xfff0c0);
  k.B.box(0, H - 0.2, 2.6, 0.02, 0.3, 0.02, 0x222222);
  k.picture(plainTex('3. Stock: Kasslov', '#f0ece0', '#202020'), 2.2, 1.6, 1.7 - 0.03, 0.9, 0.22, Math.PI);

  // Wohnung (3. Stock)
  const FY = 8.7, fx = 3.5, FD = 6, FH = 2.6;
  k.floor(-fx, fx, 0, FD, FY, 0x5a4a3a);
  k.solid(0, FY + FH + 0.1, FD / 2, fx * 2, 0.2, FD, 0xd0c8b0);
  for (const [axis, f, a0, a1] of [['x', -0.08, -fx, fx], ['x', FD + 0.08, -fx, fx], ['z', -fx - 0.08, 0, FD], ['z', fx + 0.08, 0, FD]]) {
    k.wall(axis, f, a0, a1, FY, FH, 0x9a8c64, [], 0.16);
  }
  // Wasserflecken an der Tapete
  for (const [x, z, s] of [[-3.45, 4.6, 0.8], [3.45, 1.2, 0.6], [1.5, 5.95, 0.7]]) k.B.box(x, FY + FH - 0.3, z, x === 1.5 ? s : 0.02, 0.4, x === 1.5 ? 0.02 : s, 0x6a6040);
  k.door(-2.5, FY, 0, 0, 1, 0x7a6a50);
  // Bett (Speicherpunkt) hinten links
  k.solid(-2.4, FY + 0.22, 5.1, 2.0, 0.44, 1.0, 0x6a5a48);
  k.B.box(-2.5, FY + 0.48, 5.1, 1.7, 0.1, 0.95, 0x5a6a8a);
  k.B.box(-3.2, FY + 0.55, 5.1, 0.4, 0.12, 0.6, 0xe0dcd0);
  k.B.box(-3.45, FY + 0.6, 5.1, 0.08, 0.8, 1.0, 0x4a3a28);
  k.solid(-1.0, FY + 0.3, 5.6, 0.45, 0.6, 0.45, 0x5a4630);
  k.G.box(-1.0, FY + 0.75, 5.6, 0.18, 0.25, 0.18, 0xffd890);
  k.B.box(-1.1, FY + 0.62, 5.45, 0.14, 0.03, 0.14, 0x3a3a3a);                            // Aschenbecher
  // Küchenzeile rechts
  k.solid(fx - 0.32, FY + 0.45, 1.8, 0.6, 0.9, 2.4, 0xc8c0a8);
  k.B.box(fx - 0.32, FY + 0.92, 1.8, 0.64, 0.04, 2.44, 0x8a7a60);
  for (const z of [1.0, 1.4]) k.B.shape(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), fx - 0.32, FY + 0.95, z, 1, 1, 1, 0x222222);
  k.B.box(fx - 0.32, FY + 0.92, 2.5, 0.4, 0.06, 0.5, 0x8a9098);
  k.B.box(fx - 0.2, FY + 1.9, 1.8, 0.35, 0.6, 2.4, 0xb8b098);
  k.solid(fx - 0.35, FY + 0.85, 3.5, 0.65, 1.7, 0.65, 0xe8e8e0);                        // Kühlschrank
  // Tisch und Stuhl
  k.solid(1.2, FY + 0.38, 3.8, 0.9, 0.76, 0.7, 0x7a5a3a);
  k.B.box(1.2, FY + 0.79, 3.8, 0.4, 0.06, 0.3, 0xd0c8b0);
  k.solid(1.2, FY + 0.25, 4.4, 0.4, 0.5, 0.4, 0x5a4028);
  // Sofa links und Fernseher
  k.solid(-3.05, FY + 0.25, 2.3, 0.8, 0.5, 1.8, 0x6a5a3a);
  k.B.box(-3.4, FY + 0.65, 2.3, 0.2, 0.8, 1.8, 0x5a4a30);
  k.solid(-0.6, FY + 0.3, 2.3, 0.5, 0.6, 1.0, 0x4a3a28);
  k.B.box(-0.6, FY + 0.82, 2.3, 0.5, 0.45, 0.6, 0x2a2a2a);
  k.G.box(-0.86, FY + 0.83, 2.3, 0.02, 0.32, 0.44, 0x8aa0c0);                            // Bildschirm
  k.B.box(-0.6, FY + 1.15, 2.3, 0.02, 0.25, 0.25, 0x6a6a6a, Math.PI / 4);                 // Antenne
  // Fenster hinten mit Rollladen
  k.G.box(0.8, FY + 1.5, FD - 0.03, 1.3, 1.3, 0.02, 0x9ab4cc);
  k.B.box(0.8, FY + 1.85, FD - 0.05, 1.3, 0.6, 0.02, 0x8a8678);
  k.B.box(0.8, FY + 0.84, FD - 0.1, 1.5, 0.06, 0.2, 0xe0dcd0);
  // Teppich, Glühbirne
  k.B.box(-1.6, FY + 0.01, 2.6, 2.0, 0.02, 1.6, 0x6a2a2a);
  k.G.shape(new THREE.SphereGeometry(0.08, 8, 6), 0, FY + FH - 0.5, 3, 1, 1, 1, 0xfff0c0);
  k.B.box(0, FY + FH - 0.25, 3, 0.02, 0.4, 0.02, 0x222222);
  k.door(fx, FY, 5.2, -1, 0, 0x8a7a60);                                                  // Bad
  k.done(group);

  const W = (x, y, z) => new THREE.Vector3(O.x + x, O.y + y, O.z + z);
  return {
    group, O,
    spots: {
      front: W(0, 0, 0.9), frontIn: W(-0.4, 0, 2.6),
      up: W(2.2, 0, 1.2), hallArrive: W(1.2, 0, 1.4),
      flatDoor: W(-2.5, FY, 0.8), flatArrive: W(-1.9, FY, 1.2),
      bed: W(-2.2, FY, 4.2),
    },
  };
}

export class Interiors {
  constructor(scene, world, game) {
    this.world = world; this.game = game;
    this.cols = new Colliders();
    this.inside = null;         // 'club' | 'block' | null
    this.busy = false;
    this.points = [];
    const lm = world.landmarks || {};
    const fade = document.getElementById('fade');
    this.fade = fade;
    if (lm.club && lm.club.entry) {
      const c = this.club = buildClubInside(lm.club, world.terrain, this.cols);
      c.group.visible = false; scene.add(c.group);
      const S = c.spots, out = lm.club;
      const outH = out.heading + Math.PI;
      this.points.push(
        { where: null, p: { x: out.entry.x, z: out.entry.z }, r: 1.7, label: 'Betreten', go: () => this.go('club', S.frontIn, 0, 'club') },
        { where: null, p: out.upperDoor, r: 1.2, y: out.upperDoor.y, label: 'Betreten', go: () => this.go('club', S.sideIn, Math.PI / 2) },
        { where: 'club', p: S.front, r: 1.1, label: 'Hinaus', go: () => this.go(null, out.door, outH, null, out.heading) },
        { where: 'club', p: S.egUp, r: 1.0, label: 'Nach oben', go: () => this.go('club', S.ogDown.clone().setZ(S.ogDown.z - 0.4), -Math.PI / 2) },
        { where: 'club', p: S.ogDown, r: 0.8, label: 'Nach unten', go: () => this.go('club', S.egArrive, Math.PI / 2) },
        { where: 'club', p: S.ogUp, r: 0.8, label: 'Nach oben', go: () => this.go('club', S.og2Arrive, -Math.PI / 2) },
        { where: 'club', p: S.side, r: 1.0, label: 'Hinaus', go: () => this.go(null, { x: out.upperDoor.x, z: out.upperDoor.z, y: out.upperDoor.y }, outH) },
        { where: 'club', p: S.og2Down, r: 1.0, label: 'Nach unten', go: () => this.go('club', S.ogUp.clone().setZ(S.ogUp.z + 0.35), -Math.PI / 2) },
      );
    }
    if (lm.home) {
      const b = this.block = buildBlockInside(lm.home, world.terrain, this.cols);
      b.group.visible = false; scene.add(b.group);
      const S = b.spots, out = lm.home;
      this.points.push(
        { where: null, p: out.door, r: 1.8, label: 'Betreten', go: () => this.go('block', S.frontIn, 0, 'block') },
        { where: 'block', p: S.front, r: 1.0, label: 'Hinaus', go: () => this.go(null, out.door, out.heading + Math.PI, null, out.heading) },
        { where: 'block', p: S.up, r: 1.0, label: 'Nach oben', go: () => this.go('block', S.flatArrive, 0, 'flat') },
        { where: 'block', p: S.flatDoor, r: 0.9, label: 'Treppenhaus', go: () => this.go('block', S.hallArrive, Math.PI) },
        { where: 'block', p: S.bed, r: 1.2, label: 'Schlafen', go: () => this.sleep() },
      );
    }
  }

  // Was kann man hier tun? Nächster Punkt in Reichweite
  actionAt(pos) {
    if (this.busy) return null;
    let best = null, bestD = Infinity;
    for (const a of this.points) {
      if (a.where !== this.inside) continue;
      const py = a.p.y ?? a.y;
      if (py !== undefined && Math.abs(pos.y - py) > 1.5) continue;
      if (py === undefined && this.inside) continue;
      const d = Math.hypot(pos.x - a.p.x, pos.z - a.p.z);
      if (d < a.r && d < bestD) { bestD = d; best = a; }
    }
    return best;
  }

  // Schwarzblende, dann umsetzen
  go(where, to, heading, event, camYaw = heading) {
    if (this.busy) return;
    this.busy = true;
    this.fade.classList.add('on');
    setTimeout(() => {
      const { player, follow } = this.game;
      this.setInside(where);
      const y = to.y !== undefined ? to.y : this.world.terrain.heightAt(to.x, to.z);
      player.place(to.x, y, to.z, heading);
      follow.yaw = camYaw;
      follow.focus.set(to.x, y + 1.5, to.z);
      follow.curDist = where ? 2.5 : 4;
      if (event && this.game.story) this.game.story.onEnter(event);
      setTimeout(() => { this.fade.classList.remove('on'); this.busy = false; }, 120);
    }, 260);
  }

  setInside(where) {
    this.inside = where;
    const cols = where ? this.cols : null;
    this.game.player.indoor = cols;
    this.game.follow.indoor = cols;
    if (this.club) this.club.group.visible = where === 'club';
    if (this.block) this.block.group.visible = where === 'block';
  }

  sleep() {
    this.busy = true;
    this.fade.classList.add('on');
    setTimeout(() => {
      const st = this.game.story;
      st.saveHere();
      this.game.toast('Gespeichert', 2.5);
      setTimeout(() => { this.fade.classList.remove('on'); this.busy = false; }, 700);
    }, 300);
  }

  update(dt) {
    if (this.inside === 'club' && this.club) {
      this.club.ball.rotation.y += dt * 0.8;
      const t = performance.now() / 1000;
      this.club.cones.forEach((c, i) => { c.material.opacity = 0.12 + 0.06 * Math.sin(t * 2 + i * 2); });
    }
  }

  // Für das Gespräch mit Bruno: die echten Räume statt der Ersatzkulisse
  talkRoom() {
    if (!this.club) return null;
    const c = this.club, P = this.game.player;
    const S = c.spots;
    const b = c.bruno;
    const bx = c.O.x + b.position.x, bz = c.O.z + b.position.z;
    b.rotation.y = Math.atan2(S.lars.x - bx, S.lars.z - bz);
    P.place(S.lars.x, S.lars.y, S.lars.z, Math.atan2(bx - S.lars.x, bz - S.lars.z));
    P.mesh.position.copy(P.position); P.mesh.rotation.y = P.heading;
    for (const l of [P.armL, P.armR, P.legL, P.legR]) l.rotation.x = 0;
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    return {
      inside: true, group: new THREE.Group(), ball: c.ball,
      bruno: { get position() { return wp(b); }, userData: b.userData },
      lars: { get position() { return P.mesh.position.clone(); }, userData: { fig: { head: P.head, armR: P.armR } } },
      center: S.bruno.clone().add(new THREE.Vector3(0, 1.5, 0)),
      wide: S.wide,
    };
  }
}
