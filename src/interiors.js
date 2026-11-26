import * as THREE from 'three';
import { Builder } from './builder.js';
import { Colliders } from './collision.js';
import { makeCharacter } from './player.js';
import { neonFigureTex, posterTex, plainTex } from './handmade.js';
import { tex } from './textures.js';

// Begehbare Innenräume wie in den alten Open-World-Spielen: an der Tür „Betreten“ tippen,
// kurz schwarz, dann steht man drinnen. Die Räume liegen tief unter der Karte und haben
// eigene Kollisionen. Hell's Club (EG, 1. OG, 2. OG nach Nicks Grundriss) und der Wohnblock
// (Treppenhaus und Lars' Wohnung im 3. Stock).

const DEPTH = 300;   // so weit unter dem Boden liegen die Räume

// Licht in den Räumen: bis zu MAXL farbige Lampen (die nächsten beim Spieler) beleuchten
// Boden, Wände und Möbel pro Bildpunkt. Dazu eine schwache Grundhelligkeit.
const MAXL = 12;
export const ROOM_LIGHT = {
  uLP: { value: Array.from({ length: MAXL }, () => new THREE.Vector3(0, -1e5, 0)) },
  uLC: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
  uLR: { value: new Array(MAXL).fill(1) },
  uAmb: { value: 0.6 },
};
function litMaterial(map) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, map });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, ROOM_LIGHT);
    sh.vertexShader = 'varying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWN = normalize(mat3(modelMatrix) * normal);`);
    sh.fragmentShader = `#define MAXL ${MAXL}\nuniform vec3 uLP[MAXL];\nuniform vec3 uLC[MAXL];\nuniform float uLR[MAXL];\nuniform float uAmb;\nvarying vec3 vWP;\nvarying vec3 vWN;\n` +
      sh.fragmentShader.replace('#include <aomap_fragment>', `
      vec3 Lsum = vec3(uAmb);
      vec3 nn = normalize(vWN);
      for (int i = 0; i < MAXL; i++) {
        vec3 d = uLP[i] - vWP;
        float dist = length(d);
        float a = clamp(1.0 - dist / uLR[i], 0.0, 1.0);
        a *= a;
        float nd = max(dot(nn, d / max(dist, 0.001)), 0.0) * 0.8 + 0.2;
        Lsum += uLC[i] * (a * nd);
      }
      reflectedLight.indirectDiffuse = Lsum;`);
  };
  return m;
}

// Flächen mit eingebackener Helligkeit (oben hell, Seiten mittel, unten dunkel), dazu das Raumlicht
function baked(B, map) {
  const p = B.pos, c = B.col;
  for (let i = 0; i < p.length; i += 9) {
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const k = ny / l > 0.6 ? 1 : ny / l < -0.6 ? 0.6 : 0.8 + 0.08 * (nz / l) + 0.04 * (nx / l);
    for (let t = 0; t < 9; t++) c[i + t] *= k * 1.08;
  }
  return B.build(litMaterial(map), 0.7);
}

// Kiste mit abgerundeten Kanten (r = Radius) in echter Grösse
const rboxCache = new Map();
function roundBox(sx, sy, sz, r, seg = 3) {
  const key = [sx, sy, sz, r, seg].map((v) => v.toFixed(3)).join(',');
  let g = rboxCache.get(key);
  if (g) return g;
  r = Math.min(r, sx / 2 - 0.001, sy / 2 - 0.001, sz / 2 - 0.001);
  g = new THREE.BoxGeometry(1, 1, 1, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3(sx / 2 - r, sy / 2 - r, sz / 2 - r);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) * sx, p.getY(i) * sy, p.getZ(i) * sz);
    const cx = Math.max(-inner.x, Math.min(inner.x, v.x)), cy = Math.max(-inner.y, Math.min(inner.y, v.y)), cz = Math.max(-inner.z, Math.min(inner.z, v.z));
    const d = new THREE.Vector3(v.x - cx, v.y - cy, v.z - cz);
    if (d.lengthSq() > 1e-9) d.setLength(r);
    p.setXYZ(i, cx + d.x, cy + d.y, cz + d.z);
  }
  g = g.toNonIndexed();
  rboxCache.set(key, g);
  return g;
}

const glowMesh = (B) => B.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));

// Ein Stockwerk-Baukasten: alles in lokalen Koordinaten (Gruppe bei O), Kollision in Welt
class Kit {
  constructor(O, cols) { this.O = O; this.cols = cols; this.bs = {}; this.cur = 'grain'; this.G = new Builder(); this.extra = []; this.plan = []; this.lights = []; }
  // Werkstoff wählen: alles danach bekommt diese Textur (grain, wood, tiles, velvet, quilt, damask, mirror)
  get B() { return this.bs[this.cur] ??= new Builder(); }
  mat(name, fn) { const old = this.cur; this.cur = name; fn(); this.cur = old; }
  // Lampe: wirft farbiges Licht (r = Reichweite) und hat optional einen Schein
  light(x, y, z, color, r, strength = 1, halo = 0) {
    const c = new THREE.Color(color);
    this.lights.push({ p: new THREE.Vector3(this.O.x + x, this.O.y + y, this.O.z + z), c: new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(strength), r });
    if (halo) this.halo(x, y, z, color, halo);
  }
  halo(x, y, z, color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.halo(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, toneMapped: false }));
    s.position.set(x, y, z); s.scale.set(size, size, 1);
    this.extra.push(s);
  }
  // runde Kiste, optional fest
  round(x, y, z, sx, sy, sz, color, r = 0.08, ry = 0, solid = false) {
    this.B.shape(roundBox(sx, sy, sz, r), x, y, z, 1, 1, 1, color, ry);
    if (solid) {
      const O = this.O, rot = Math.abs(Math.sin(ry)) > 0.7;
      const wx = rot ? sz : sx, wz = rot ? sx : sz;
      this.cols.addBox(O.x + x - wx / 2, O.x + x + wx / 2, O.z + z - wz / 2, O.z + z + wz / 2, O.y + y - sy / 2, O.y + y + sy / 2);
      this.mark(x - wx / 2, z - wz / 2, x + wx / 2, z + wz / 2, y - sy / 2, y + sy / 2);
    }
  }
  // für die Karte: Rechteck in Weltkoordinaten mit Höhe
  mark(x0, z0, x1, z1, y0, y1, kind = 0) { const O = this.O; this.plan.push([O.x + x0, O.z + z0, O.x + x1, O.z + z1, O.y + y0, O.y + y1, kind]); }
  // runde Hindernisse nur in einem Stockwerk
  circle(x, z, r, y0, y1) {
    const O = this.O;
    this.cols.addCircle(O.x + x, O.z + z, r, O.y + y0, O.y + y1);
    this.mark(x - r, z - r, x + r, z + r, y0, y1, 2);
  }
  // fester Block mit Kollision
  solid(x, y, z, sx, sy, sz, color) {
    this.B.box(x, y, z, sx, sy, sz, color);
    const O = this.O;
    this.cols.addBox(O.x + x - sx / 2, O.x + x + sx / 2, O.z + z - sz / 2, O.z + z + sz / 2, O.y + y - sy / 2, O.y + y + sy / 2);
    this.mark(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, y - sy / 2, y + sy / 2);
  }
  // nur Kollision
  block(x, z, sx, sz, y0, y1) {
    const O = this.O;
    this.cols.addBox(O.x + x - sx / 2, O.x + x + sx / 2, O.z + z - sz / 2, O.z + z + sz / 2, O.y + y0, O.y + y1);
    this.mark(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, y0, y1);
  }
  // Treppenlauf entlang z: begehbare Stufen von (z0, y0) nach (z1, y1)
  flight(xc, w, z0, z1, y0, y1, n, color = 0x6a5a4a, nose = 0x3a2a20) {
    const O = this.O, dz = (z1 - z0) / n, rise = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const top = y0 + rise * (i + 1), zc = z0 + dz * (i + 0.5), d = Math.abs(dz);
      this.B.box(xc, top - 0.17, zc, w, 0.34, d, i % 2 ? color : color + 0x060606);
      this.B.box(xc, top - 0.015, zc + Math.sign(dz) * (d / 2 - 0.03), w, 0.03, 0.06, nose);
      this.cols.addBox(O.x + xc - w / 2, O.x + xc + w / 2, O.z + Math.min(zc - d / 2, zc + d / 2), O.z + Math.max(zc - d / 2, zc + d / 2), O.y + top - 0.34, O.y + top);
    }
    this.mark(xc - w / 2, Math.min(z0, z1), xc + w / 2, Math.max(z0, z1), Math.min(y0, y1), Math.max(y0, y1), 1);
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
    for (const [name, B] of Object.entries(this.bs)) if (B.pos.length) group.add(baked(B, tex[name]()));
    if (this.G.pos.length) group.add(glowMesh(this.G));
    for (const m of this.extra) group.add(m);
  }
}

function tableWithCandle(k, x, z, y = 0, r = 0.42) {
  k.mat('wood', () => k.B.shape(new THREE.CylinderGeometry(r, r, 0.05, 24), x, y + 0.72, z, 1, 1, 1, 0x4a2618));
  k.B.shape(new THREE.TorusGeometry(r, 0.025, 6, 24), x, y + 0.72, z, 1, 1, 1, 0xa88a4a, 0, Math.PI / 2);
  k.B.shape(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), x, y + 0.35, z, 1, 1, 1, 0x8a8a90);
  k.B.shape(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 16), x, y + 0.015, z, 1, 1, 1, 0x2a2a2a);
  k.G.shape(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), x, y + 0.8, z, 1, 1, 1, 0xc84a20);
  k.G.shape(new THREE.SphereGeometry(0.02, 6, 4), x, y + 0.87, z, 1, 1.6, 1, 0xffe0a0);
  k.halo(x, y + 0.88, z, 0xffa040, 0.45);
  k.block(x, z, r * 1.6, r * 1.6, y, y + 0.75);
}

// ---------- Hell's Club ----------
function buildClubInside(club, terrain, cols) {
  const O = new THREE.Vector3(club.x, terrain.heightAt(club.x, club.z) - DEPTH, club.z);
  const group = new THREE.Group(); group.position.copy(O);
  const k = new Kit(O, cols);
  const hx = 6.75, D = 13.5;
  // gleiche Stockwerkhöhen wie aussen: EG 4.3 m, 1. OG 3.4 m
  const Y1 = 4.3, Y2 = 7.7, TOP = 10.4;
  const H0 = Y1 - 0.3, H1 = Y2 - Y1 - 0.3, H2 = TOP - Y2;     // Raumhöhen bis zur Decke
  // Treppenhaus hinten links: zwei Läufe pro Stockwerk mit Zwischenpodest hinten
  const CX0 = -hx, CX1 = -4.15, CM = -5.45;                     // Kern, Mittelwand
  const ZF = 9.5, ZM = 12.0;                                    // Läufe zwischen ZF und ZM, Podest dahinter
  const laneA = (CX0 + CM) / 2, laneB = (CM + CX1) / 2, lw = CM - CX0 - 0.14;
  // Hülle: Böden mit Loch über dem Treppenhaus, Decke oben
  k.mat('tiles', () => k.floor(-hx, hx, 0, D, 0, 0x4a3a44));
  for (const [y, col, m] of [[Y1, 0x5a3424, 'wood'], [Y2, 0x7a7468, 'grain']]) k.mat(m, () => {
    k.solid((CX1 + hx) / 2, y - 0.15, D / 2, hx - CX1, 0.3, D, col);
    k.solid((CX0 + CX1) / 2, y - 0.15, ZF / 2, CX1 - CX0, 0.3, ZF, col);
  });
  k.solid(0, TOP + 0.1, D / 2, hx * 2, 0.2, D, 0xb8b2a4);
  for (const [y0, h, col, m] of [[0, Y1, 0x4a2040, 'damask'], [Y1, Y2 - Y1, 0x7a2430, 'damask'], [Y2, TOP - Y2, 0xc8bea4, 'grain']]) k.mat(m, () => {
    k.wall('x', -0.08, -hx, hx, y0, h, col, [], 0.16);
    k.wall('x', D + 0.08, -hx, hx, y0, h, col, [], 0.16);
    k.wall('z', -hx - 0.08, 0, D, y0, h, col, [], 0.16);
    k.wall('z', hx + 0.08, 0, D, y0, h, col, [], 0.16);
  });
  // Holztäfer unten im EG, Zierleiste, Neonleisten an der Decke
  k.mat('wood', () => {
    for (const [x, z, sx, sz] of [[0, 0.03, hx * 2, 0.05], [0, D - 0.03, hx * 2, 0.05], [-hx + 0.03, D / 2, 0.05, D], [hx - 0.03, D / 2, 0.05, D]]) {
      k.B.box(x, 0.6, z, sx, 1.2, sz, 0x4a2414);
      k.B.box(x, 1.22, z, sx + (sx > 1 ? 0 : 0.04), 0.06, sz + (sz > 1 ? 0 : 0.04), 0x8a6a3a);
    }
  });
  for (const [x, z, sx, sz] of [[0, 0.02, hx * 2, 0.03], [0, D - 0.02, hx * 2, 0.03], [-hx + 0.02, D / 2, 0.03, D], [hx - 0.02, D / 2, 0.03, D]]) {
    k.G.box(x, H0 - 0.12, z, sx, 0.05, sz, z === 0.02 || z === D - 0.02 ? 0xff3a8a : 0x8a3aff);
  }
  k.light(0, H0 - 0.4, 0.6, 0xff3a8a, 5, 0.7);
  k.light(-hx + 0.5, H0 - 0.4, 4.5, 0x8a3aff, 5, 0.7);
  k.light(hx - 0.5, H0 - 0.4, 7.5, 0x8a3aff, 5, 0.7);
  // Deckenspots
  for (const [x, z] of [[-3, 2], [3, 2], [-3, 8], [3, 9.5], [0, 11]]) {
    k.B.shape(new THREE.CylinderGeometry(0.12, 0.1, 0.12, 10), x, H0 - 0.06, z, 1, 1, 1, 0x1a1a1a);
    k.G.shape(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 10), x, H0 - 0.125, z, 1, 1, 1, 0xfff0d8);
  }
  // Fenster (innen dunkel, mit Samtvorhängen)
  const win = (x, y, z, ry, curtain) => {
    k.B.box(x, y, z, 1.1, 1.4, 0.04, 0x0c0a14, ry);
    k.mat('velvet', () => {
      for (const s of [-1, 1]) {
        const dx = ry ? 0 : s * 0.75, dz = ry ? s * 0.75 : 0;
        k.round(x + dx, y - 0.1, z + dz, ry ? 0.08 : 0.5, 1.9, ry ? 0.5 : 0.08, curtain, 0.03, 0);
      }
      k.round(x, y + 0.85, z, ry ? 0.1 : 1.9, 0.25, ry ? 1.9 : 0.1, curtain, 0.04, 0);
    });
  };

  // ===== EG: Hauptraum mit Bühne und Bar =====
  // Eingangstür (rot gepolstert, Neonrahmen)
  k.mat('quilt', () => k.round(0.6, 1.2, 0.06, 1.9, 2.4, 0.08, 0x6a0c18, 0.03));
  k.G.box(0.6, 2.45, 0.1, 2.1, 0.05, 0.05, 0xff4f9a);
  for (const s of [-1, 1]) k.G.box(0.6 + s * 1.05, 1.2, 0.1, 0.05, 2.4, 0.05, 0xff4f9a);
  k.G.box(0.6, 2.75, 0.1, 0.9, 0.22, 0.04, 0x40ff80);                                   // Notausgang-Schild
  k.light(0.6, 2.2, 0.5, 0xff4f9a, 3, 0.6);
  // Bar hinten: gepolsterte Front, Holzplatte, Leuchtband unten
  k.mat('quilt', () => {
    k.round(-0.6, 0.55, 12.0, 6.0, 1.1, 0.7, 0x4a1420, 0.08, 0, true);
    k.round(2.6, 0.55, 12.75, 0.7, 1.1, 0.8, 0x4a1420, 0.08, 0, true);                 // Ecke der Theke
  });
  k.mat('wood', () => {
    k.round(-0.6, 1.14, 11.95, 6.3, 0.08, 0.95, 0x6a3a1e, 0.035);
    k.round(2.6, 1.14, 12.75, 0.95, 0.08, 1.0, 0x6a3a1e, 0.035);
    k.B.box(-0.6, 0.9, D - 0.35, 6.6, 1.8, 0.4, 0x3a1e10);                              // Rückbuffet
  });
  k.G.box(-0.6, 0.06, 11.6, 6.0, 0.04, 0.04, 0xff3a8a);
  k.light(-2.4, 0.25, 11.2, 0xff3a8a, 2.2, 0.9); k.light(1.2, 0.25, 11.2, 0xff3a8a, 2.2, 0.9);
  // Spiegel hinter der Bar mit beleuchteten Glasregalen
  k.mat('mirror', () => k.B.box(-0.6, 2.35, D - 0.1, 6.2, 1.5, 0.03, 0x8a8aa0));
  k.mat('wood', () => { for (const sx of [-1, 1]) k.B.box(-0.6 + sx * 3.15, 2.35, D - 0.12, 0.12, 1.7, 0.08, 0x2a1408); k.B.box(-0.6, 3.15, D - 0.12, 6.4, 0.12, 0.08, 0x2a1408); });
  for (const y of [1.85, 2.4, 2.95]) {
    k.G.box(-0.6, y, D - 0.25, 6.0, 0.025, 0.28, 0x6a8aa8);
    k.G.box(-0.6, y - 0.03, D - 0.12, 6.0, 0.02, 0.02, y === 2.4 ? 0x3ac8ff : 0xff5aa8);
  }
  k.light(-0.6, 2.4, D - 0.5, 0x3ac8ff, 4, 0.6);
  const bottles = [0x2f8b4a, 0xb07a2a, 0xe8e8e0, 0x9a2a2a, 0x3a6aaa, 0xe0b040, 0x8a3a9a];
  const body = new THREE.CylinderGeometry(1, 1, 1, 10), neck = new THREE.CylinderGeometry(0.4, 1, 1, 10);
  for (let i = 0; i < 39; i++) {
    const x = -3.3 + (i % 13) * 0.45 + (i % 2) * 0.05, y = [1.87, 2.42, 2.97][Math.floor(i / 13)];
    const h = 0.2 + (i % 3) * 0.04, r = 0.04 + (i % 4) * 0.006, c = bottles[(i * 5) % bottles.length];
    k.G.shape(body, x, y + h / 2, D - 0.25, r, h, r, new THREE.Color(c).multiplyScalar(0.75).getHex());
    k.G.shape(neck, x, y + h + 0.05, D - 0.25, r * 0.55, 0.1, r * 0.55, new THREE.Color(c).multiplyScalar(0.55).getHex());
  }
  // Zapfhähne, Gläser, Kasse auf der Theke
  for (let i = 0; i < 3; i++) {
    const x = 0.6 + i * 0.25;
    k.B.shape(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), x, 1.36, 12.1, 1, 1, 1, 0xc8c8d0);
    k.G.shape(new THREE.SphereGeometry(0.045, 8, 6), x, 1.56, 12.1, 1, 1, 1, [0xffc040, 0xff5a5a, 0x5ac8ff][i]);
  }
  for (const [x, z] of [[-3.0, 11.8], [-2.2, 11.75], [-1.6, 11.85], [0.0, 11.8], [1.8, 11.75]]) {
    k.G.shape(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 10), x, 1.24, z, 1, 1, 1, 0x6a7a8a);
    k.G.shape(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), x, 1.215, z, 1, 1, 1, x < -2 ? 0xc87a20 : 0xa0a040);
  }
  k.round(-3.2, 1.3, 12.2, 0.4, 0.25, 0.35, 0x2a2a2e, 0.04);
  k.G.box(-3.2, 1.37, 12.02, 0.25, 0.08, 0.01, 0x40ff80);
  // Hängelampen über der Theke
  for (const x of [-2.8, -0.6, 1.6]) {
    k.B.box(x, 3.35, 12.0, 0.015, 1.3, 0.015, 0x111111);
    k.B.shape(new THREE.ConeGeometry(0.28, 0.25, 16, 1, true), x, 2.65, 12.0, 1, 1, 1, 0x1a1a1a);
    k.G.shape(new THREE.SphereGeometry(0.08, 10, 8), x, 2.55, 12.0, 1, 1, 1, 0xffd8a0);
    k.light(x, 2.4, 12.0, 0xffb070, 3.2, 1.0, 0.9);
  }
  // Barhocker: Chromstange, gepolsterter Sitz
  for (let i = 0; i < 6; i++) {
    const x = -3.2 + i * 1.1;
    k.B.shape(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 16), x, 0.015, 11.25, 1, 1, 1, 0xa8a8b0);
    k.B.shape(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 8), x, 0.38, 11.25, 1, 1, 1, 0xc8c8d0);
    k.B.shape(new THREE.TorusGeometry(0.16, 0.012, 6, 16), x, 0.3, 11.25, 1, 1, 1, 0xc8c8d0, 0, Math.PI / 2);
    k.mat('quilt', () => k.B.shape(new THREE.CylinderGeometry(0.21, 0.19, 0.1, 18), x, 0.78, 11.25, 1, 1, 1, 0x9a1a2a));
    k.B.shape(new THREE.TorusGeometry(0.2, 0.025, 6, 18), x, 0.82, 11.25, 1, 1, 1, 0x6a0c18, 0, Math.PI / 2);
  }
  // Bühne mit Stange, Leuchtring und Scheinwerfern (ohne Tänzerin)
  const sx = 0.3, sz = 6.4, sr = 2.0;
  k.mat('tiles', () => k.B.shape(new THREE.CylinderGeometry(sr, sr + 0.05, 0.45, 40), sx, 0.225, sz, 1, 1, 1, 0x2a2228));
  k.B.shape(new THREE.CylinderGeometry(sr - 0.1, sr - 0.1, 0.02, 40), sx, 0.46, sz, 1, 1, 1, 0x4a3a44);
  k.G.shape(new THREE.TorusGeometry(sr + 0.02, 0.035, 6, 48), sx, 0.42, sz, 1, 1, 1, 0xff3a9a, 0, Math.PI / 2);
  k.G.shape(new THREE.TorusGeometry(sr - 0.12, 0.02, 6, 48), sx, 0.47, sz, 1, 1, 1, 0xb04aff, 0, Math.PI / 2);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; k.G.shape(new THREE.SphereGeometry(0.035, 6, 4), sx + Math.cos(a) * (sr + 0.06), 0.2, sz + Math.sin(a) * (sr + 0.06), 1, 1, 1, 0xfff0f8); }
  k.B.shape(new THREE.CylinderGeometry(0.035, 0.035, H0 - 0.45, 10), sx, 0.45 + (H0 - 0.45) / 2, sz, 1, 1, 1, 0xf0f0f8);
  k.circle(sx, sz, sr, 0, 0.45);
  k.light(sx, 2.6, sz, 0xff4ab0, 6.5, 1.4);
  k.light(sx, 0.7, sz, 0xb04aff, 3.0, 0.8);
  k.halo(sx, 0.5, sz, 0xff3a9a, 1.6);
  const cones = [];
  for (const [cx, cz, col] of [[-1.6, 4.8, 0xff3aa8], [2.2, 4.8, 0xb04aff], [0.3, 8.6, 0xff6ac0]]) {
    k.B.shape(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 12), cx, H0 - 0.2, cz, 1, 1, 1, 0x111111);
    k.G.shape(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 12), cx, H0 - 0.38, cz, 1, 1, 1, col);
    k.halo(cx, H0 - 0.42, cz, col, 0.9);
    const h = H0 - 0.3, dx = sx - cx, dz = sz - cz;
    const len = Math.hypot(dx, h, dz);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.75, len, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    cone.position.set((cx + sx) / 2, H0 - 0.3 - h / 2, (cz + sz) / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-dx, h, -dz).normalize());
    cones.push(cone); k.extra.push(cone);
  }
  // Diskokugel
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 2), new THREE.MeshBasicMaterial({ color: 0xd0d0e0 }));
  ball.position.set(2.2, H0 - 0.6, 3.2);
  k.extra.push(ball);
  k.B.box(2.2, H0 - 0.25, 3.2, 0.01, 0.5, 0.01, 0x222222);
  // Lautsprecher oben in den Ecken
  for (const [x, z, ry] of [[-hx + 0.35, 1.0, Math.PI / 2], [hx - 0.35, 12.6, -Math.PI / 2], [-4.5, 9.2, Math.PI / 2]]) {
    k.round(x, H0 - 0.7, z, 0.5, 0.75, 0.4, 0x141414, 0.05, ry);
    for (const [dy, r] of [[0.15, 0.15], [-0.2, 0.08]]) k.B.shape(new THREE.CylinderGeometry(r, r, 0.02, 14), x + Math.sin(ry) * 0.2, H0 - 0.7 + dy, z, 1, 1, 1, 0x2a2a2a, ry, Math.PI / 2);
  }
  // DJ-Pult vorne links
  k.round(-4.2, 0.55, 0.65, 1.7, 1.1, 0.7, 0x1a1a1e, 0.06, 0, true);
  k.G.box(-4.2, 0.12, 1.01, 1.6, 0.03, 0.02, 0x3ac8ff);
  for (const x of [-4.7, -3.7]) k.B.shape(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20), x, 1.12, 0.65, 1, 1, 1, 0x2a2a2a);
  k.G.box(-4.2, 1.12, 0.65, 0.25, 0.02, 0.2, 0xff5aa8);
  k.light(-4.2, 1.4, 1.2, 0x3ac8ff, 2.2, 0.6);
  // Nischen mit gesteppten Samtsofas links und rechts (side = Richtung zur Wand)
  const booth = (x, z, side) => {
    k.mat('quilt', () => {
      k.round(x - side * 0.05, 0.22, z, 0.75, 0.44, 2.4, 0x6a1028, 0.1, 0, true);         // Sitz
      k.round(x + side * 0.3, 0.85, z, 0.24, 0.95, 2.4, 0x7a1430, 0.1);                   // Lehne
      for (const s of [-1, 1]) k.round(x, 0.5, z + s * 1.25, 0.8, 0.62, 0.2, 0x5a0c22, 0.08);
    });
    k.mat('velvet', () => { for (const s of [-1, 1]) k.round(x - side * 0.05, 0.49, z + s * 0.58, 0.66, 0.1, 1.08, 0x8a1838, 0.05); });
    tableWithCandle(k, x - side * 1.15, z, 0, 0.45);
    k.B.box(x + side * 0.4, 2.0, z, 0.06, 0.05, 0.3, 0x8a6a3a);
    k.G.shape(new THREE.SphereGeometry(0.1, 10, 8), x + side * 0.3, 2.05, z, 1, 1.3, 1, 0xffc080);
    k.light(x + side * 0.1, 1.9, z, 0xffa860, 3.0, 0.9, 0.8);
  };
  booth(-hx + 0.45, 3.0, -1); booth(-hx + 0.45, 6.3, -1);
  booth(hx - 0.45, 5.6, 1); booth(hx - 0.45, 9.4, 1);
  tableWithCandle(k, -2.8, 3.4); tableWithCandle(k, -3.0, 9.0); tableWithCandle(k, 3.5, 2.6 + 1.6);
  for (const [x, z] of [[-2.8, 2.6], [-2.8, 4.2], [-3.0, 8.2], [-3.0, 9.8]]) {
    const back = z % 1 > 0.5 ? 0.2 : -0.2;
    k.mat('quilt', () => { k.round(x, 0.28, z, 0.48, 0.14, 0.48, 0x7a1430, 0.05); k.round(x, 0.65, z + back, 0.48, 0.5, 0.1, 0x6a1028, 0.04); });
    for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) k.B.box(x + ox, 0.1, z + oz, 0.03, 0.2, 0.03, 0x1a1a1a);
  }
  // WC vorne rechts
  k.mat('damask', () => {
    k.wall('z', 3.9, 0, 3.6, 0, H0, 0x4a2040, [], 0.14);
    k.wall('x', 3.6, 3.9, hx, 0, H0, 0x4a2040, [{ c: 5.3, w: 0.95 }], 0.14);
  });
  k.mat('tiles', () => k.B.box(5.3, 0.01, 1.8, 2.8, 0.02, 3.5, 0xb8b8c0));
  k.round(6.2, 0.22, 0.7, 0.45, 0.44, 0.6, 0xe8e8e8, 0.12, 0, true); k.round(6.45, 0.7, 0.7, 0.15, 0.6, 0.5, 0xe8e8e8, 0.05);   // Toilette
  k.round(4.4, 0.85, 0.3, 0.6, 0.15, 0.45, 0xe0e0e0, 0.05, 0, true); k.mat('mirror', () => k.B.box(4.4, 1.6, 0.04, 0.6, 0.8, 0.02, 0x9aaaba));  // Lavabo, Spiegel
  k.G.box(4.4, 2.05, 0.08, 0.5, 0.04, 0.04, 0xfff0e0);
  k.light(5.3, 2.6, 1.8, 0xfff0e0, 3, 0.7);
  k.picture(plainTex('WC', '#1a1a1a', '#ffffff'), 5.3, 2.5, 3.6 + 0.09, 0.5, 0.2, 0);
  // Personal-Tür hinten rechts
  k.door(5.2, 0, D, 0, -1, 0x3a3a3a);
  // Neonfigur und Plakate
  k.picture(neonFigureTex(), hx - 0.12, 2.2, 7.6, 2.4, 1.2, -Math.PI / 2, true);
  k.light(hx - 0.6, 2.2, 7.6, 0xff5ac8, 3.5, 0.8);
  k.picture(posterTex(), -hx + 0.1, 1.9, 4.65, 0.7, 1.0, Math.PI / 2, true);
  k.picture(posterTex(), hx - 0.1, 1.9, 11.2, 0.7, 1.0, -Math.PI / 2, true);

  // ===== Treppenhaus =====
  const stairWall = 0x4a3a34, step = 0x5a4a3e;
  k.cur = 'wood';
  k.wall('z', CX1, ZF, D, 0, Y1, stairWall, [], 0.14);                 // EG: Kern zum Raum hin
  k.wall('z', CX1, 7.6, D, Y1, TOP - Y1, stairWall, [], 0.14);          // oben: Kern zu den Zimmern
  k.wall('z', CM, ZF, ZM, 0, TOP, stairWall, [], 0.14);                 // Mittelwand zwischen den Läufen
  // EG -> 1. OG
  k.flight(laneA, lw, ZF, ZM, 0, Y1 / 2, 12, step);
  k.solid((CX0 + CX1) / 2, Y1 / 2 - 0.15, (ZM + D) / 2, CX1 - CX0, 0.3, D - ZM, step);   // Zwischenpodest (Aussentür)
  k.flight(laneB, lw, ZM, ZF, Y1 / 2, Y1, 12, step);
  k.solid(laneB, 0.95, (ZF + ZM) / 2, lw, 1.9, ZM - ZF, stairWall);    // Abstellraum unter dem Lauf
  // 1. OG -> 2. OG
  const Ym = (Y1 + Y2) / 2;
  k.flight(laneA, lw, ZF, ZM, Y1, Ym, 10, step);
  k.solid((CX0 + CX1) / 2, Ym - 0.15, (ZM + D) / 2, CX1 - CX0, 0.3, D - ZM, step);
  k.flight(laneB, lw, ZM, ZF, Ym, Y2, 10, step);
  k.cur = 'grain';
  // Geländer oben am Treppenloch
  k.solid(laneA, Y2 + 0.5, ZF + 0.05, lw, 1.0, 0.08, 0x2a2a2a);
  // Holztür zur Aussentreppe auf dem Zwischenpodest, Lampen, Schilder
  k.door(-hx, Y1 / 2, (ZM + D) / 2, 1, 0, 0x6a4424);
  for (const y of [Y1 / 2, Ym]) { k.G.box(CX1 - 0.1, y + 2.0, (ZM + D) / 2, 0.06, 0.25, 0.4, 0xffe0b0); k.light(CX1 - 0.6, y + 1.9, (ZM + D) / 2, 0xffd8a0, 4, 0.9, 0.7); }
  k.G.box(CM, Y1 - 0.5, ZF - 0.6, 0.6, 0.08, 0.3, 0xfff0d0);
  k.light(CM, Y1 - 0.7, ZF - 0.6, 0xfff0d0, 3.5, 0.6);
  k.picture(plainTex('1. OG · VIP', '#1a0a10', '#ffd0e0'), CX1 - 0.09, Y1 + 2.4, 8.6, 0.8, 0.2, -Math.PI / 2);
  k.picture(plainTex('2. OG · Büro', '#2a2a2a', '#ffffff'), CX1 - 0.09, Y2 + 2.0, 8.6, 0.8, 0.2, -Math.PI / 2);
  k.picture(plainTex('PRIVAT ↑', '#2a0a10', '#ff9ac4'), (CX0 + CX1) / 2, 2.9, ZF - 0.02, 0.8, 0.2, Math.PI);

  // ===== 1. OG: VIP-Flur und vier VIP-Zimmer =====
  const cz0 = 5.9, cz1 = 7.6;
  k.wall('x', cz0, -hx, hx, Y1, H1, 0x5a1a22, [{ c: -3.4, w: 1.0 }, { c: 2.6, w: 1.0 }], 0.14, 0x2a140e);
  k.wall('x', cz1, -hx, hx, Y1, H1, 0x5a1a22, [{ c: (CX0 + CX1) / 2, w: 2.3, h: H1 - 0.2 }, { c: -2.0, w: 1.0 }, { c: 2.6, w: 1.0 }], 0.14, 0x2a140e);
  k.wall('z', 0, 0, cz0, Y1, H1, 0x4a141c, [], 0.14);
  k.wall('z', 0, cz1, D, Y1, H1, 0x4a141c, [], 0.14);
  k.B.box(0, Y1 + 0.01, (cz0 + cz1) / 2, hx * 2 - 0.4, 0.02, 0.9, 0x8a1424);           // roter Läufer
  for (let x = -5.5; x <= 5.5; x += 2.75) {
    k.G.shape(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), x, Y1 + H1 - 0.05, (cz0 + cz1) / 2, 1, 1, 1, 0xff6a9a);
    k.light(x, Y1 + H1 - 0.5, (cz0 + cz1) / 2, 0xff6a9a, 3.2, 0.8, 0.8);
    for (const z of [cz0 + 0.1, cz1 - 0.1]) k.G.box(x + 1.3, Y1 + 1.8, z, 0.14, 0.22, 0.06, 0xffc080);
  }
  k.picture(posterTex(), -1.2, Y1 + 1.5, cz1 - 0.09, 0.6, 0.9, Math.PI, true);
  k.picture(posterTex(), 0.8, Y1 + 1.5, cz0 + 0.09, 0.6, 0.9, 0, true);
  const vipBed = (x, z, round, ry = 0) => {
    if (round) {
      k.B.shape(new THREE.CylinderGeometry(1.2, 1.2, 0.45, 24), x, Y1 + 0.23, z, 1, 1, 1, 0x7a1424);
      k.B.shape(new THREE.CylinderGeometry(1.15, 1.15, 0.08, 24), x, Y1 + 0.49, z, 1, 1, 1, 0xa01a30);
      k.circle(x, z, 1.2, Y1, Y1 + 0.5);
    } else {
      k.mat('quilt', () => k.round(x, Y1 + 0.25, z, 2.0, 0.5, 2.2, 0x7a1424, 0.1, 0, true));
      k.mat('velvet', () => k.round(x, Y1 + 0.53, z + 0.2, 1.9, 0.1, 1.7, 0xa01a30, 0.05));
    }
    for (const s of [-1, 1]) k.round(x + s * 0.45, Y1 + 0.62, z - (round ? 0.7 : 0.85), 0.6, 0.16, 0.35, 0xe8d8d8, 0.07);
    k.mat('quilt', () => k.round(x, Y1 + 1.0, z - (round ? 1.3 : 1.15), 2.2, 1.3, 0.18, 0x4a0c18, 0.08));             // Kopfteil
    for (const s of [-1, 1]) {
      k.mat('wood', () => k.round(x + s * 1.5, Y1 + 0.3, z - 1.0, 0.45, 0.6, 0.45, 0x3a1a10, 0.04, 0, true));
      k.B.shape(new THREE.CylinderGeometry(0.02, 0.06, 0.2, 8), x + s * 1.5, Y1 + 0.7, z - 1.0, 1, 1, 1, 0xa88a4a);
      k.G.shape(new THREE.CylinderGeometry(0.1, 0.14, 0.18, 14, 1, true), x + s * 1.5, Y1 + 0.88, z - 1.0, 1, 1, 1, 0xffa060);
    }
    k.light(x, Y1 + 1.2, z - 0.6, 0xff8a50, 3.6, 0.9);
  };
  // vorne links: rundes Bett und Whirlpool
  vipBed(-4.0, 3.6, true);
  k.B.shape(new THREE.CylinderGeometry(1.0, 1.0, 0.6, 24), -1.4, Y1 + 0.3, 1.5, 1, 1, 1, 0x3a2a30);
  k.G.shape(new THREE.CylinderGeometry(0.88, 0.88, 0.02, 24), -1.4, Y1 + 0.62, 1.5, 1, 1, 1, 0x9a4aff);
  k.circle(-1.4, 1.5, 1.0, Y1, Y1 + 0.6);
  win(-3.6, Y1 + 1.5, 0.05, 0, 0x8a1424);
  // vorne rechts: Bett, Sessel, Spiegel
  vipBed(3.6, 3.4, false);
  k.solid(1.0, Y1 + 0.3, 1.0, 0.8, 0.6, 0.8, 0x5a1020);
  k.B.box(6.6, Y1 + 1.5, 3.4, 0.03, 1.6, 1.0, 0x6a6a7a);
  win(3.6, Y1 + 1.6, 0.05, 0, 0x8a1424);
  // hinten links und rechts
  vipBed(-2.05, 11.4, false); vipBed(3.4, 11.0, true);
  k.G.shape(new THREE.TorusGeometry(0.9, 0.03, 6, 24), 3.4, Y1 + H1 - 0.06, 11.0, 1, 1, 1, 0xff3a6a, 0, Math.PI / 2);
  k.G.box(-2.05, Y1 + H1 - 0.06, 10.8, 2.2, 0.04, 0.04, 0xff3a6a);
  for (const x of [CX1 + 0.4, hx - 0.3]) k.B.shape(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 8), x, Y1 + 0.25, D - 0.4, 1, 1, 1, 0x4a4a4a);   // Pflanzen
  for (const x of [CX1 + 0.4, hx - 0.3]) for (let i = 0; i < 5; i++) k.B.box(x, Y1 + 0.9, D - 0.4, 0.7, 0.04, 0.16, 0x2e5a2a, i * 0.6);

  // ===== 2. OG: Office, Garderobe, Lager, WC =====
  k.wall('x', cz0, -hx, hx, Y2, H2, 0xb8ae94, [{ c: -3.4, w: 1.0 }, { c: 2.6, w: 1.0 }], 0.14, 0x6a5a48);
  k.wall('x', cz1, -hx, hx, Y2, H2, 0xb8ae94, [{ c: (CX0 + CX1) / 2, w: 2.3 }, { c: -2.0, w: 1.0 }, { c: 3.0, w: 0.9 }], 0.14, 0x6a5a48);
  k.wall('z', 0, 0, cz0, Y2, H2, 0xa89e86, [], 0.14);
  k.wall('z', 1.6, cz1, D, Y2, H2, 0xa89e86, [], 0.14);
  k.G.box(0, Y2 + H2 - 0.05, (cz0 + cz1) / 2, 2.4, 0.05, 0.2, 0xe8f0ff);              // Neonröhre
  k.light(0, Y2 + H2 - 0.4, (cz0 + cz1) / 2, 0xe8f0ff, 4, 0.7);
  k.light(-3.4, Y2 + 2.0, 2.8, 0xffe0b0, 4, 0.8);                                        // Office
  k.light(3.6, Y2 + 2.0, 2.4, 0xfff0d0, 4, 0.7);                                         // Garderobe
  k.light(3.6, Y2 + 2.0, 10.6, 0xe8f0ff, 4, 0.6);
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
  for (const z of [8.3, 12.9]) for (const x of [-3.3, -1.7, -0.1]) {
    k.block(x, z, 1.4, 0.5, Y2, Y2 + 2.2);
    for (const y of [0.1, 0.8, 1.5, 2.1]) k.B.box(x, Y2 + y, z, 1.4, 0.04, 0.5, 0x7a7a7a);
    for (const s of [-1, 1]) k.B.box(x + s * 0.68, Y2 + 1.1, z, 0.04, 2.2, 0.5, 0x5a5a5a);
    for (let j = 0; j < 3; j++) k.B.box(x - 0.4 + j * 0.42, Y2 + 0.3 + (j % 2) * 0.7, z, 0.36, 0.34, 0.4, [0xb08a5a, 0xe8e8e0, 0x9a7a4a][j]);
  }
  for (const [x, z] of [[-3.3, 10.5], [-2.7, 10.9], [-1.0, 10.4]]) k.solid(x, Y2 + 0.3, z, 0.6, 0.6, 0.6, 0x8a6a40);
  k.B.shape(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10), 0.9, Y2 + 0.3, 10.6, 1, 1, 1, 0x9a9aa0);
  k.G.box(-1.3, Y2 + H2 - 0.05, 10.6, 1.4, 0.05, 0.15, 0xe8f0ff);
  k.light(-1.3, Y2 + H2 - 0.4, 10.6, 0xe8f0ff, 4, 0.7);
  // WC Personal (hinten rechts)
  k.solid(4.6, Y2 + 0.22, 12.8, 0.45, 0.44, 0.6, 0xe8e8e8);
  k.solid(2.4, Y2 + 0.85, 13.2, 0.6, 0.15, 0.4, 0xe0e0e0);
  k.B.box(3.6, Y2 + 0.01, 10.6, 5.6, 0.02, 5.8, 0x8a9090);

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
  k.circle(-1.0, 10.2, 0.35, 0, 1.8);
  k.done(group);

  const W = (x, y, z) => new THREE.Vector3(O.x + x, O.y + y, O.z + z);
  return {
    group, O, ball, cones, bruno: bruno.group, plan: k.plan, lights: k.lights, amb: 0.42,
    floorName: (y) => (y - O.y < Y1 - 1.0 ? 'EG' : y - O.y < Y2 - 0.8 ? '1. OG' : '2. OG'),
    spots: {
      front: W(0.6, 0, 0.9), frontIn: W(0.6, 0, 1.6),
      side: W(-hx + 0.55, Y1 / 2, (ZM + D) / 2), sideIn: W(-hx + 1.0, Y1 / 2, (ZM + D) / 2),
      stairs: W(laneA, 0, ZF - 0.6), og1: W(-5.4, Y1, 8.4), og2: W(-5.4, Y2, 8.4),
      bruno: W(-1.0, 0, 9.2), lars: W(-0.75, 0, 8.7),
      wide: W(3.6, 2.4, 4.2),
    },
  };
}

// ---------- Wohnblock: Treppenhaus und Lars' Wohnung ----------
function buildBlockInside(home, terrain, cols) {
  const O = new THREE.Vector3(home.x, terrain.heightAt(home.x, home.z) - DEPTH, home.z);
  const group = new THREE.Group(); group.position.copy(O);
  let k = new Kit(O, cols);
  // Treppenhaus über 3 Stockwerke: Läufe rechts (x 0..3), Vorplätze links, Lars wohnt im 3. Stock
  const hx = 3, D = 5.5, FHs = 2.9, TOPB = 3 * FHs + 2.75;
  const ZF = 1.6, ZM = 4.0, CM = 1.5;
  const laneA = (0 + CM) / 2, laneB = (CM + hx) / 2, lw = CM - 0.14;
  const wallC = 0xcfc8b4, stepC = 0x8a847a;
  k.floor(-hx, hx, 0, D, 0, 0x8a8478);
  for (let x = -hx + 0.3; x < 0; x += 0.6) for (let z = 0.3; z < D; z += 0.6) if (((x + z) * 1.67 | 0) % 2) k.B.box(x, 0.005, z, 0.58, 0.01, 0.58, 0x6e685e);
  for (let f = 1; f <= 3; f++) {
    const y = f * FHs;
    k.solid(-hx / 2, y - 0.15, D / 2, hx, 0.3, D, 0x9a948a);                 // Vorplatz links
    k.solid(hx / 2, y - 0.15, ZF / 2, hx, 0.3, ZF, 0x9a948a);                // Vorplatz vor den Läufen
  }
  k.solid(0, TOPB + 0.1, D / 2, hx * 2, 0.2, D, 0xd8d2c4);
  for (const [axis, f, a0, a1] of [['x', -0.08, -hx, hx], ['x', D + 0.08, -hx, hx], ['z', hx + 0.08, 0, D]]) k.wall(axis, f, a0, a1, 0, TOPB, wallC, [], 0.16);
  // linke Wand: im 3. Stock die Tür zu Lars' Wohnung
  k.wall('z', -hx - 0.08, 0, D, 0, 3 * FHs, wallC, [], 0.16);
  k.wall('z', -hx - 0.08, 0, D, 3 * FHs, TOPB - 3 * FHs, wallC, [{ c: 0.85, w: 0.95 }], 0.16);
  k.wall('z', 0, ZF, D, 0, TOPB, wallC, [], 0.14);                         // Wand zwischen Vorplatz und Läufen
  k.wall('z', CM, ZF, ZM, 0, TOPB, wallC, [], 0.14);                       // Mittelwand
  for (let f = 0; f <= 3; f++) for (const [x, z, sx, sz] of [[-hx / 2, 0.02, hx, 0.03], [-hx + 0.02, D / 2, 0.03, D], [-0.09, (ZF + D) / 2, 0.03, D - ZF]]) k.B.box(x, f * FHs + 0.7, z, sx, 1.4, sz, 0x5a7a62);
  for (let f = 0; f < 3; f++) {
    const y = f * FHs, ym = y + FHs / 2;
    k.flight(laneA, lw, ZF, ZM, y, ym, 8, stepC, 0x5a544a);
    k.solid(hx / 2, ym - 0.15, (ZM + D) / 2, hx, 0.3, D - ZM, 0x9a948a);   // Zwischenpodest
    k.flight(laneB, lw, ZM, ZF, ym, y + FHs, 8, stepC, 0x5a544a);
    k.G.shape(new THREE.SphereGeometry(0.09, 8, 6), -1.5, y + FHs - 0.55, 2.6, 1, 1, 1, 0xfff0c0);
    k.light(-1.5, y + FHs - 0.7, 2.6, 0xfff0c0, 4.5, 0.6, 0.6);
    k.light(hx - 0.5, ym + 1.8, (ZM + D) / 2, 0xfff0c0, 3.5, 0.5);
    k.G.box(hx - 0.1, ym + 1.9, (ZM + D) / 2, 0.05, 0.2, 0.3, 0xfff0c0);
  }
  k.solid(laneB, 0.75, (ZF + ZM) / 2, lw, 1.5, ZM - ZF, 0x8a847a);          // unter dem ersten Lauf
  k.solid(laneA, 3 * FHs + 0.5, ZF + 0.05, lw, 1.0, 0.06, 0x3a2a1a);         // Geländer oben
  // Haustür (Glas)
  k.B.box(-1.2, 1.15, 0.04, 1.2, 2.3, 0.05, 0x6a5a40);
  k.B.box(-1.2, 1.4, 0.07, 0.8, 1.4, 0.02, 0x9ab0b8);
  // Briefkästen, Heizkörper
  for (let i = 0; i < 8; i++) k.B.box(-hx + 0.05, 1.2 + Math.floor(i / 4) * 0.35, 2.2 + (i % 4) * 0.42, 0.1, 0.3, 0.38, 0x8a7a50);
  k.B.box(-1.5, 0.45, D - 0.1, 1.2, 0.7, 0.12, 0xe8e8e0);
  // Wohnungstüren der Nachbarn (zu) und Namensschilder
  for (const [f, name] of [[1, 'Bürgler'], [2, 'Gwerder']]) {
    k.door(-hx, f * FHs, 0.85, 1, 0, 0x7a6a50);
    k.picture(plainTex(name, '#f0ece0', '#202020'), -hx + 0.1, f * FHs + 1.55, 1.6, 0.5, 0.13, Math.PI / 2);
  }
  k.picture(plainTex('Kasslov', '#f0ece0', '#202020'), -hx + 0.1, 3 * FHs + 1.55, 1.6, 0.5, 0.13, Math.PI / 2);
  k.picture(plainTex('3. Stock: Kasslov', '#f0ece0', '#202020'), -0.08, 1.6, 2.4, 0.9, 0.22, -Math.PI / 2);

  k.solid(-hx - 0.08, 3 * FHs - 0.15, 0.85, 0.24, 0.3, 0.95, 0x6a5a48);   // Schwelle zur Wohnung
  // Wohnung (3. Stock), links an das Treppenhaus angebaut
  k.done(group);
  const FY = 3 * FHs, fx = 3.5, FD = 6, FH = 2.6, FOX = -hx - fx - 0.16;
  const Of = O.clone().add(new THREE.Vector3(FOX, 0, 0));
  const fg = new THREE.Group(); fg.position.set(FOX, 0, 0); group.add(fg);
  const plan0 = k.plan, lights0 = k.lights;
  k = new Kit(Of, cols);
  k.floor(-fx, fx, 0, FD, FY, 0x5a4a3a);
  k.solid(0, FY + FH + 0.1, FD / 2, fx * 2, 0.2, FD, 0xd0c8b0);
  for (const [axis, f, a0, a1] of [['x', -0.08, -fx, fx], ['x', FD + 0.08, -fx, fx], ['z', -fx - 0.08, 0, FD]]) {
    k.wall(axis, f, a0, a1, FY, FH, 0x9a8c64, [], 0.16);
  }
  // Wand zum Treppenhaus (innen vor dessen Wand) mit der Wohnungstür
  k.wall('z', fx - 0.03, 0, FD, FY, FH, 0x9a8c64, [{ c: 0.85, w: 0.95, frame: 0x4a3420 }], 0.06);
  // Wasserflecken an der Tapete
  for (const [x, z, s] of [[-3.45, 4.6, 0.8], [3.43, 2.6, 0.6], [1.5, 5.95, 0.7]]) k.B.box(x, FY + FH - 0.3, z, x === 1.5 ? s : 0.02, 0.4, x === 1.5 ? 0.02 : s, 0x6a6040);
  // Bett (Speicherpunkt) hinten links
  k.solid(-2.4, FY + 0.22, 5.1, 2.0, 0.44, 1.0, 0x6a5a48);
  k.B.box(-2.5, FY + 0.48, 5.1, 1.7, 0.1, 0.95, 0x5a6a8a);
  k.B.box(-3.2, FY + 0.55, 5.1, 0.4, 0.12, 0.6, 0xe0dcd0);
  k.B.box(-3.45, FY + 0.6, 5.1, 0.08, 0.8, 1.0, 0x4a3a28);
  k.solid(-1.0, FY + 0.3, 5.6, 0.45, 0.6, 0.45, 0x5a4630);
  k.G.box(-1.0, FY + 0.75, 5.6, 0.18, 0.25, 0.18, 0xffd890);
  k.B.box(-1.1, FY + 0.62, 5.45, 0.14, 0.03, 0.14, 0x3a3a3a);                            // Aschenbecher
  // Küchenzeile rechts
  k.solid(fx - 0.36, FY + 0.45, 2.6, 0.6, 0.9, 2.4, 0xc8c0a8);
  k.B.box(fx - 0.36, FY + 0.92, 2.6, 0.64, 0.04, 2.44, 0x8a7a60);
  for (const z of [1.8, 2.2]) k.B.shape(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 12), fx - 0.36, FY + 0.95, z, 1, 1, 1, 0x222222);
  k.B.box(fx - 0.36, FY + 0.92, 3.3, 0.4, 0.06, 0.5, 0x8a9098);
  k.B.box(fx - 0.24, FY + 1.9, 2.6, 0.35, 0.6, 2.4, 0xb8b098);
  k.solid(fx - 0.39, FY + 0.85, 4.3, 0.65, 1.7, 0.65, 0xe8e8e0);                        // Kühlschrank
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
  k.light(0, FY + FH - 0.6, 3, 0xffe8b0, 5, 0.7, 0.6);
  k.light(-1.0, FY + 1.0, 5.4, 0xffc070, 2.2, 0.7);
  k.light(-1.2, FY + 0.9, 2.3, 0x8aa0e0, 2.2, 0.5);
  k.B.box(0, FY + FH - 0.25, 3, 0.02, 0.4, 0.02, 0x222222);
  k.door(fx - 0.06, FY, 5.3, -1, 0, 0x8a7a60);                                           // Bad
  k.done(fg);

  const W = (x, y, z) => new THREE.Vector3(O.x + x, O.y + y, O.z + z);
  return {
    group, O, plan: plan0.concat(k.plan), lights: lights0.concat(k.lights), amb: 0.7,
    floorName: (y, x) => {
      const r = y - O.y;
      if (x !== undefined && x < O.x - hx && r > FY - 1) return 'Wohnung Kasslov';
      const f = Math.round(r / FHs);
      return f <= 0 ? 'Treppenhaus EG' : `Treppenhaus ${f}. Stock`;
    },
    spots: {
      front: W(-1.2, 0, 0.9), frontIn: W(-1.2, 0, 2.4),
      flat: W(FOX + 2.2, FY, 0.9),
      bed: W(FOX - 2.2, FY, 4.2),
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
        { where: null, p: out.upperDoor, r: 1.2, y: out.upperDoor.y, label: 'Betreten', go: () => this.go('club', S.sideIn, Math.PI, 'club') },
        { where: 'club', p: S.front, r: 1.1, label: 'Hinaus', go: () => this.go(null, out.door, outH, null, out.heading) },
        { where: 'club', p: S.side, r: 0.9, label: 'Hinaus', go: () => this.go(null, { x: out.upperDoor.x, z: out.upperDoor.z, y: out.upperDoor.y }, outH) },
      );
    }
    if (lm.home) {
      const b = this.block = buildBlockInside(lm.home, world.terrain, this.cols);
      b.group.visible = false; scene.add(b.group);
      const S = b.spots, out = lm.home;
      this.points.push(
        { where: null, p: out.door, r: 1.8, label: 'Betreten', go: () => this.go('block', S.frontIn, 0, 'block') },
        { where: 'block', p: S.front, r: 1.0, label: 'Hinaus', go: () => this.go(null, out.door, out.heading + Math.PI, null, out.heading) },
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
    this.pickLights();
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

  // die nächsten Lampen beim Spieler ins Raumlicht übernehmen
  pickLights() {
    const room = this.inside === 'club' ? this.club : this.inside === 'block' ? this.block : null;
    if (!room) return;
    const p = this.game.player.position;
    const near = room.lights.map((l) => [l, Math.hypot(l.p.x - p.x, (l.p.y - p.y - 1) * 2.2, l.p.z - p.z) - l.r]).sort((a, b) => a[1] - b[1]);
    ROOM_LIGHT.uAmb.value = room.amb;
    for (let i = 0; i < ROOM_LIGHT.uLP.value.length; i++) {
      const l = near[i] && near[i][0];
      if (l) { ROOM_LIGHT.uLP.value[i].copy(l.p); ROOM_LIGHT.uLC.value[i].copy(l.c); ROOM_LIGHT.uLR.value[i] = l.r; }
      else { ROOM_LIGHT.uLP.value[i].set(0, -1e5, 0); ROOM_LIGHT.uLC.value[i].set(0, 0, 0); ROOM_LIGHT.uLR.value[i] = 1; }
    }
  }

  update(dt) {
    this.lightTimer = (this.lightTimer || 0) - dt;
    if (this.lightTimer <= 0) { this.lightTimer = 0.25; this.pickLights(); }
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
