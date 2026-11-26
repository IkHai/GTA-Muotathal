import * as THREE from 'three';
import { resample } from './roads.js';

// Die Muota ist im Tal verbaut: eingetieftes Bett mit Blocksteinufern, Steine im Wasser,
// oben auf dem Damm ein Kiesweg, im Dorf mit Metallgeländer.

const WALL_IN = 1.4;   // Mauerfuss: so weit innerhalb der Wasserkante
const WALL_OUT = 0.9;  // Mauerkrone: so weit ausserhalb der Wasserkante
const PATH_D = 3.0;    // Abstand Dammweg-Mitte von der Wasserkante
const PATH_W = 2.4;
const BAND = PATH_D + PATH_W / 2 + 1.8;   // ebene Dammkrone bis hier (ab Wasserkante)
const RAMP = 8;                           // danach Übergang aufs Gelände über 8 m

export function prepareRivers(water, terrain) {
  const ground = terrain.heightAt.bind(terrain);
  const rivers = [];
  for (const w of water) {
    if (w.t !== 'river' || w.n !== 'Muota') continue;
    const raw = [];
    for (let i = 0; i < w.p.length; i += 2) raw.push([w.p[i] / 10, w.p[i + 1] / 10]);
    if (raw.length < 2) continue;
    const pts = resample(raw, 5);
    const hw = w.w / 2;
    // Wasserspiegel: tiefster Punkt in der Nähe
    const wl = pts.map(([x, z]) => {
      let m = Infinity;
      for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) m = Math.min(m, ground(x + dx, z + dz));
      return m + 0.35;
    });
    // Dammkrone: mindestens 2.2 m über dem Wasser, sonst das Ufergelände (geglättet)
    const crest = pts.map(([x, z], i) => {
      const [nx, nz] = normal(pts, i);
      const a = ground(x + nx * (hw + 4), z + nz * (hw + 4)), b = ground(x - nx * (hw + 4), z - nz * (hw + 4));
      return [Math.max(wl[i] + 2.2, Math.min(a, wl[i] + 4)), Math.max(wl[i] + 2.2, Math.min(b, wl[i] + 4))];
    });
    for (let k = 0; k < 2; k++) {     // glätten
      for (let i = 1; i < crest.length - 1; i++) for (const s of [0, 1]) crest[i][s] = (crest[i - 1][s] + crest[i][s] * 2 + crest[i + 1][s]) / 4;
    }
    rivers.push({ w, pts, wl, crest, hw });
  }

  // Gelände: Bett eintiefen, Dammkrone aufschütten
  const n = terrain.n, res = terrain.res, half = terrain.half, H = terrain.heights;
  const best = new Map();   // Gitterpunkt -> nächster Flussabschnitt
  for (const r of rivers) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const len2 = (x2 - x1) ** 2 + (z2 - z1) ** 2 || 1e-6;
      const reach = r.hw + 8;
      const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - reach + half) / res)), i1 = Math.min(n - 1, Math.ceil((Math.max(x1, x2) + reach + half) / res));
      const j0 = Math.max(0, Math.floor((Math.min(z1, z2) - reach + half) / res)), j1 = Math.min(n - 1, Math.ceil((Math.max(z1, z2) + reach + half) / res));
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
        const px = -half + k * res, pz = -half + j * res;
        let t = ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x1 + (x2 - x1) * t, qz = z1 + (z2 - z1) * t;
        const d = Math.hypot(px - qx, pz - qz);
        const side = ((x2 - x1) * (pz - z1) - (z2 - z1) * (px - x1)) > 0 ? 0 : 1;
        const wl = r.wl[i] + (r.wl[i + 1] - r.wl[i]) * t;
        const cr = r.crest[i][side] + (r.crest[i + 1][side] - r.crest[i][side]) * t;
        const idx = j * n + k;
        const e = d - r.hw;
        const b = best.get(idx);
        if (!b || e < b.e) best.set(idx, { e, wl, cr });
      }
    }
  }
  for (const [idx, { e, wl, cr }] of best) {
    if (e < -3) H[idx] = Math.min(H[idx], wl - 1.2);
    else if (e >= 0 && e < BAND + 2) H[idx] = Math.max(H[idx], cr);
  }

  // Abschnitte für schnelle Abfragen (Dammhöhe an beliebiger Stelle)
  const grid = new Map();
  for (const r of rivers) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const seg = { r, i, x1, z1, x2, z2, len2: (x2 - x1) ** 2 + (z2 - z1) ** 2 || 1e-6 };
      const m = r.hw + BAND + 8;
      for (let a = Math.floor((Math.min(x1, x2) - m) / 16); a <= Math.floor((Math.max(x1, x2) + m) / 16); a++) {
        for (let b = Math.floor((Math.min(z1, z2) - m) / 16); b <= Math.floor((Math.max(z1, z2) + m) / 16); b++) {
          const k = a * 100003 + b;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(seg);
        }
      }
    }
  }
  const info = { e: 0, cr: 0, wl: 0, qx: 0, qz: 0, ux: 0, uz: 0 };
  rivers.at = (x, z) => {
    const l = grid.get(Math.floor(x / 16) * 100003 + Math.floor(z / 16));
    if (!l) return null;
    let best = null, be = Infinity, bt = 0, bs = 0;
    for (const g of l) {
      let t = ((x - g.x1) * (g.x2 - g.x1) + (z - g.z1) * (g.z2 - g.z1)) / g.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const e = Math.hypot(x - g.x1 - (g.x2 - g.x1) * t, z - g.z1 - (g.z2 - g.z1) * t) - g.r.hw;
      if (e < be) { be = e; best = g; bt = t; bs = ((g.x2 - g.x1) * (z - g.z1) - (g.z2 - g.z1) * (x - g.x1)) > 0 ? 0 : 1; }
    }
    if (!best) return null;
    const { r, i } = best;
    info.e = be;
    info.qx = best.x1 + (best.x2 - best.x1) * bt; info.qz = best.z1 + (best.z2 - best.z1) * bt;
    const dd = Math.hypot(x - info.qx, z - info.qz) || 1;
    info.ux = (x - info.qx) / dd; info.uz = (z - info.qz) / dd;
    info.hw = r.hw;
    info.cr = r.crest[i][bs] + (r.crest[i + 1][bs] - r.crest[i][bs]) * bt;
    info.wl = r.wl[i] + (r.wl[i + 1] - r.wl[i]) * bt;
    return info;
  };
  return rivers;
}

// Begehbarer Damm: ausserhalb der Mauer zählt die Dammkrone bzw. die Böschung
export function installRiverGround(rivers, terrain) {
  if (!rivers.length) return;
  const prev = terrain.heightAt;
  terrain.heightAt = (x, z) => {
    const h = prev(x, z);
    const r = rivers.at(x, z);
    if (!r || r.e < WALL_OUT || r.e > BAND + RAMP) return h;
    if (terrain.roadAt) { const rh = terrain.roadAt(x, z); if (rh === rh) return h; }   // Strassen haben Vorrang
    let band = r.cr;
    if (r.e > BAND) {
      // gerader Übergang von der Dammkrone zum Gelände 8 m weiter aussen
      const cr = r.cr, k = (r.e - BAND) / RAMP, d = r.hw + BAND + RAMP;
      const g = prev(r.qx + r.ux * d, r.qz + r.uz * d);
      band = cr + (g - cr) * k;
    }
    return Math.max(h, band);
  };
}

function normal(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [-dz / l, dx / l];     // zeigt nach links (Seite 0)
}

const tmp = new THREE.Color();
function tri(b, color, ...v) { tmp.set(color); for (const p of v) { b.pos.push(p[0], p[1], p[2]); b.col.push(tmp.r, tmp.g, tmp.b); } }
function quad2(b, color, A, B, Cc, D) { tri(b, color, A, B, Cc, A, Cc, D, A, Cc, B, A, D, Cc); }

export function drawRivers(rivers, terrain, chunkAt, colliders, rng, onRoad, roads) {
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  // vorhandene Wege aus OpenStreetMap: dort keinen zweiten Dammweg zeichnen
  const grid = new Map();
  for (const r of roads) {
    if (r.tn) continue;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const seg = [r.p[i] / 10, r.p[i + 1] / 10, r.p[i + 2] / 10, r.p[i + 3] / 10];
      const L = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
      for (let a = 0; a <= L; a += 5) {
        const x = seg[0] + (seg[2] - seg[0]) * a / (L || 1), z = seg[1] + (seg[3] - seg[1]) * a / (L || 1);
        const k = Math.floor(x / 10) + ',' + Math.floor(z / 10);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(x, z);
      }
    }
  }
  const nearWay = (x, z, d) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = grid.get((Math.floor(x / 10) + i) + ',' + (Math.floor(z / 10) + j));
      if (l) for (let k = 0; k < l.length; k += 2) if (Math.hypot(l[k] - x, l[k + 1] - z) < d) return true;
    }
    return false;
  };
  for (const r of rivers) {
    const { pts, wl, crest, hw } = r;
    // Wasserfläche
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const [nax, naz] = normal(pts, i), [nbx, nbz] = normal(pts, i + 1);
      const arr = chunkAt((ax + bx) / 2, (az + bz) / 2).water;
      const w = hw - 0.2;
      const L0 = [ax + nax * w, wl[i], az + naz * w], R0 = [ax - nax * w, wl[i], az - naz * w];
      const L1 = [bx + nbx * w, wl[i + 1], bz + nbz * w], R1 = [bx - nbx * w, wl[i + 1], bz - nbz * w];
      const up = (A, B, Cc) => { const ux = B[0] - A[0], uz = B[2] - A[2], vx = Cc[0] - A[0], vz = Cc[2] - A[2]; return uz * vx - ux * vz >= 0 ? [A, B, Cc] : [A, Cc, B]; };
      for (const v of [...up(L0, L1, R0), ...up(R0, L1, R1)]) arr.push(...v);
    }
    // Ufermauern (Blocksteine), Dammweg, Geländer
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const na = normal(pts, i), nb = normal(pts, i + 1);
      const ch = chunkAt((ax + bx) / 2, (az + bz) / 2);
      for (const side of [0, 1]) {
        const sg = side === 0 ? 1 : -1;
        const P = (p, nrm, d, y) => [p[0] + nrm[0] * d * sg, y, p[1] + nrm[1] * d * sg];
        const A = pts[i], B = pts[i + 1];
        const ca = crest[i][side], cb = crest[i + 1][side];
        const k = 0.9 + ((i * 13 + side * 5) % 7) * 0.03;
        const wallC = new THREE.Color(0x8d877b).multiplyScalar(k);
        // geneigte Blocksteinmauer vom Wasser bis zur Krone
        quad2(ch.detail.stone, wallC, P(A, na, hw - WALL_IN, wl[i] - 0.6), P(B, nb, hw - WALL_IN, wl[i + 1] - 0.6), P(B, nb, hw + WALL_OUT, cb), P(A, na, hw + WALL_OUT, ca));
        // Mauerkrone (Abdeckung)
        quad2(ch.detail.stone, 0x9c978c, P(A, na, hw + WALL_OUT, ca), P(B, nb, hw + WALL_OUT, cb), P(B, nb, hw + WALL_OUT + 0.6, cb + 0.02), P(A, na, hw + WALL_OUT + 0.6, ca + 0.02));
        // aufgefüllte Dammkrone (Wiese) und Böschung zum Gelände
        {
          const ground = terrain.groundAt || terrain.heightAt;
          const e0 = hw + WALL_OUT + 0.6, e1 = hw + BAND;
          const gc = new THREE.Color(0x7c9a48);
          if (terrain.aerial) {
            const [r, g, bl] = terrain.aerial.ground((ax + bx) / 2 + na[0] * e1 * sg, (az + bz) / 2 + na[1] * e1 * sg);
            gc.lerp(new THREE.Color().setRGB(r, g, bl, THREE.SRGBColorSpace).multiplyScalar(1.1), 0.6);
          }
          gc.multiplyScalar(k);
          quadUp(ch.detail.terrain, gc, P(A, na, e0, ca + 0.04), P(B, nb, e0, cb + 0.04), P(B, nb, e1, cb + 0.04), P(A, na, e1, ca + 0.04));
          // Übergang zum Gelände (wie die Begehbarkeit oben)
          const foot = (p, nrm, c) => {
            const e = e1 + RAMP, x = p[0] + nrm[0] * e * sg, z = p[1] + nrm[1] * e * sg;
            return [x, terrain.heightAt(x, z) - 0.05, z];
          };
          const fa = foot(A, na, ca), fb = foot(B, nb, cb);
          quadUp(ch.detail.terrain, gc.clone().multiplyScalar(0.92), P(A, na, e1, ca + 0.04), P(B, nb, e1, cb + 0.04), fb, fa);
        }
        // Dammweg aus Kies (nur wo frei: keine Strasse, kein Haus)
        const mx = (ax + bx) / 2 + (na[0] + nb[0]) / 2 * (hw + PATH_D) * sg, mz = (az + bz) / 2 + (na[1] + nb[1]) / 2 * (hw + PATH_D) * sg;
        const free = !onRoad(mx, mz, 0.5) && !nearWay(mx, mz, 6) && !colliders.resolve(mx, mz, 1.2, terrain.heightAt(mx, mz) + 0.2).hit;
        if (free) {
          const y = (p, nrm, d) => terrain.heightAt(p[0] + nrm[0] * d * sg, p[1] + nrm[1] * d * sg) + 0.06;
          const d0 = hw + PATH_D - PATH_W / 2, d1 = hw + PATH_D + PATH_W / 2;
          const c = new THREE.Color(0xa89c84).multiplyScalar(k);
          quadUp(ch.roads, c, P(A, na, d0, y(A, na, d0)), P(B, nb, d0, y(B, nb, d0)), P(B, nb, d1, y(B, nb, d1)), P(A, na, d1, y(A, na, d1)));
        }
        // Metallgeländer im Dorf
        if (terrain.landAt(mx, mz) === 4 && !onRoad(mx, mz, 0)) {
          const g0 = P(A, na, hw + WALL_OUT + 0.3, ca), g1 = P(B, nb, hw + WALL_OUT + 0.3, cb);
          const up = (v, h) => [v[0], v[1] + h, v[2]];
          quad2(ch.detail.plain, 0x6f7478, up(g0, 1.0), up(g1, 1.0), up(g1, 0.94), up(g0, 0.94));
          quad2(ch.detail.plain, 0x6f7478, up(g0, 0.5), up(g1, 0.5), up(g1, 0.46), up(g0, 0.46));
          quad2(ch.detail.plain, 0x6f7478, [g0[0] - 0.03, g0[1], g0[2] - 0.03], [g0[0] + 0.03, g0[1], g0[2] + 0.03], [g0[0] + 0.03, g0[1] + 1, g0[2] + 0.03], [g0[0] - 0.03, g0[1] + 1, g0[2] - 0.03]);
          const len = Math.hypot(g1[0] - g0[0], g1[2] - g0[2]) || 1;
          colliders.addOrientedBox((g0[0] + g1[0]) / 2, (g0[2] + g1[2]) / 2, (g1[0] - g0[0]) / len, (g1[2] - g0[2]) / len, len / 2, 0.15, Math.min(ca, cb) - 1, Math.max(ca, cb) + 1.1);
        }
      }
      // Steine im Flussbett
      const count = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < count; k++) {
        const t = rng(), off = (rng() * 2 - 1) * (hw - 1.5);
        const x = ax + (bx - ax) * t + na[0] * off, z = az + (bz - az) * t + na[1] * off;
        const s = 0.4 + rng() * rng() * 1.4;
        const y = wl[i] + (wl[i + 1] - wl[i]) * t - s * 0.35;
        const g = [0x8a867c, 0x7a776f, 0x9a958a, 0x6e6b64][Math.floor(rng() * 4)];
        ch.detail.plain.shape(rockGeo, x, y, z, s * 1.3, s * 0.8, s, g, rng() * 6.28, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, 0.25);
      }
    }
  }
}

function quadUp(b, color, A, B, Cc, D) {
  const ux = B[0] - A[0], uz = B[2] - A[2], vx = Cc[0] - A[0], vz = Cc[2] - A[2];
  if (uz * vx - ux * vz >= 0) tri(b, color, A, B, Cc, A, Cc, D); else tri(b, color, A, Cc, B, A, D, Cc);
}
