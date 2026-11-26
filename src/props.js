import * as THREE from 'three';
import { Builder } from './builder.js';
import { buildBody, buildSuv } from './car.js';
import { POLY } from './zone.js';

// Leben im Dorf rund um den Stalden: Weide- und Gartenzäune, Dorfbrunnen, Bänke,
// parkierte Autos und Schilder (Ortstafel, Tempo 50, Wegweiser, Strassennamen).
// Alles fest an den Strassen aus OpenStreetMap ausgerichtet und auf dem echten Boden.

const CENTER = { x: 1516, z: -71 };      // Hell's Club
const MEADOW = 0, TOWN = 4;

function inPoly(x, z) {
  let inside = false;
  for (let i = 0, j = POLY.length - 1; i < POLY.length; j = i++) {
    const [xi, zi] = POLY[i], [xj, zj] = POLY[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

function signTex(draw, w = 256, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildProps(scene, world) {
  const t = world.terrain, cols = world.colliders;
  const B = new Builder();                 // Holz, Stein, Metall: ein Mesh
  const group = new THREE.Group();
  scene.add(group);
  const onRoad = (x, z, e) => { const h = t.roadAt(x, z, e); return h === h; };
  const free = (x, z, r) => !cols.resolve(x, z, r, t.heightAt(x, z) + 0.3).hit;
  const roads = [];
  for (const r of world.osm.roads) {
    if (r.tn || r.b) continue;
    const pts = [];
    for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    if (!pts.some(([x, z]) => Math.hypot(x - CENTER.x, z - CENTER.z) < 700)) continue;
    roads.push({ r, pts });
  }
  // gleichmässig entlang einer Linie: [x, z, Richtung x, Richtung z]
  const along = (pts, step) => {
    const out = [];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      for (let d = carry; d < len; d += step) out.push([ax + ux * d, az + uz * d, ux, uz]);
      carry = (carry - len) % step; if (carry < 0) carry += step;
    }
    return out;
  };
  const rot = (ux, uz) => Math.atan2(-uz, ux);    // Builder: lokales x entlang (ux, uz)

  // ---------- Zäune ----------
  let fences = 0;
  for (const { r, pts } of roads) {
    if (!['residential', 'unclassified', 'service', 'track', 'tertiary', 'secondary', 'living_street'].includes(r.t)) continue;
    const hw = (r.w || 4) / 2;
    for (const sgn of [1, -1]) {
      const P = along(pts, 2.4);
      const segs = [];
      for (let i = 0; i < P.length - 1; i++) {
        const [x0, z0, ux, uz] = P[i];
        const nx = -uz * sgn, nz = ux * sgn;
        const land = t.landAt(x0, z0);
        if (land !== MEADOW && land !== TOWN) continue;
        const run = Math.floor(i / 14);                                       // Abschnitte von ~34 m
        if (hash(run * 7 + sgn, r.p[0]) < (land === TOWN ? 0.45 : 0.35)) continue;
        const off = land === TOWN ? hw + 2.4 : hw + 1.6;
        const ax = x0 + nx * off, az = z0 + nz * off;
        const [x1, z1] = P[i + 1];
        const bx = x1 + nx * off, bz = z1 + nz * off;
        if (Math.hypot(ax - CENTER.x, az - CENTER.z) > 520 || !inPoly(ax, az)) continue;
        const pk = world.landmarks.club && world.landmarks.club.parking;
        if (pk && Math.hypot(ax - pk.x, az - pk.z) < 10) continue;
        if (onRoad(ax, az, 0.3) || onRoad(bx, bz, 0.3) || !free(ax, az, 0.3) || !free(bx, bz, 0.3)) continue;
        const ya = t.heightAt(ax, az), yb = t.heightAt(bx, bz);
        if (Math.abs(ya - yb) > 1.2) continue;
        segs.push([i, ax, az, bx, bz, ya, yb, land]);
      }
      // nur zusammenhängende Zaunstücke (mind. 4 Felder), keine einzelnen Reste in der Wiese
      let runStart = 0;
      for (let j = 0; j <= segs.length; j++) {
        if (j < segs.length && j > runStart && segs[j][0] === segs[j - 1][0] + 1 && segs[j][7] === segs[j - 1][7]) continue;
        if (j - runStart >= 4) for (let q = runStart; q < j; q++) drawFence(...segs[q], q === j - 1);
        runStart = j;
      }
    }
  }
  function drawFence(i, ax, az, bx, bz, ya, yb, land, last) {
    const len = Math.hypot(bx - ax, bz - az), ry = rot((bx - ax) / len, (bz - az) / len);
    const slope = Math.atan2(yb - ya, len);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ya + yb) / 2;
    if (land === TOWN) {
      // Gartenzaun: weisse Latten
      B.box(ax, ya + 0.5, az, 0.09, 1.0, 0.09, 0xd8d2c4, ry);
      for (const h of [0.25, 0.7]) B.shape(new THREE.BoxGeometry(1, 1, 1), mx, my + h, mz, len, 0.06, 0.03, 0xd0c8b8, ry, 0, slope);
      for (let k = 1; k < 8; k++) {
        const f = k / 8, px = ax + (bx - ax) * f, pz = az + (bz - az) * f, py = ya + (yb - ya) * f;
        B.box(px, py + 0.42, pz, 0.08, 0.84, 0.02, k % 2 ? 0xe4ded0 : 0xdad4c6, ry);
      }
    } else {
      // Weidezaun: Holzpfosten und zwei Latten
      B.box(ax, ya + 0.55, az, 0.12, 1.1, 0.12, 0x6a5a44, ry);
      for (const h of [0.45, 0.95]) B.shape(new THREE.BoxGeometry(1, 1, 1), mx, my + h, mz, len + 0.1, 0.08, 0.05, 0x7a6a50, ry, 0, slope);
    }
    cols.addOrientedBox(mx, mz, (bx - ax) / len, (bz - az) / len, len / 2, 0.06, my - 0.5, my + 1.1);
    if (last) B.box(bx, yb + 0.5, bz, land === TOWN ? 0.09 : 0.12, land === TOWN ? 1.0 : 1.1, land === TOWN ? 0.09 : 0.12, land === TOWN ? 0xd8d2c4 : 0x6a5a44, ry);
    fences++;
  }

  // ---------- Dorfbrunnen und Bänke ----------
  const bench = (x, z, ry) => {
    const y = t.heightAt(x, z);
    for (const s of [-0.75, 0.75]) {
      const lx = x + Math.cos(ry) * s, lz = z - Math.sin(ry) * s;
      B.box(lx, y + 0.22, lz, 0.08, 0.44, 0.5, 0x3a3a3c, ry);
    }
    const fx = Math.sin(ry), fz = Math.cos(ry);                   // nach vorne (lokal +z)
    for (let k = 0; k < 3; k++) B.box(x + fx * (k * 0.14 - 0.14), y + 0.46, z + fz * (k * 0.14 - 0.14), 1.8, 0.04, 0.11, 0x8a5a32, ry);
    for (let k = 0; k < 2; k++) B.box(x - fx * 0.24, y + 0.65 + k * 0.17, z - fz * 0.24, 1.8, 0.11, 0.04, 0x8a5a32, ry);
    cols.addOrientedBox(x, z, Math.cos(ry), -Math.sin(ry), 0.9, 0.3, y - 0.2, y + 0.5);
  };
  let fountain = null;
  for (let ring = 18; ring < 120 && !fountain; ring += 6) {
    for (let a = 0; a < 24 && !fountain; a++) {
      const x = CENTER.x + Math.cos(a / 24 * Math.PI * 2) * ring, z = CENTER.z + Math.sin(a / 24 * Math.PI * 2) * ring;
      if (t.landAt(x, z) !== TOWN || onRoad(x, z, 2.2) || !free(x, z, 3.2)) continue;
      const hs = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dz]) => t.heightAt(x + dx, z + dz));
      if (Math.max(...hs) - Math.min(...hs) > 0.6) continue;
      fountain = { x, z };
    }
  }
  if (fountain) {
    const { x, z } = fountain, y = t.heightAt(x, z);
    // zur nächsten Strasse ausrichten
    let ry = 0, best = Infinity;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2;
      for (let d = 2; d < 20; d += 2) if (onRoad(x + Math.cos(ang) * d, z + Math.sin(ang) * d, 0)) { if (d < best) { best = d; ry = -ang; } break; }
    }
    const stone = 0x9e9a90, dark = 0x7e7a72;
    const L = 2.8, Wd = 1.1, Ht = 0.8;
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (u, v) => [x + u * c + v * s, z - u * s + v * c];
    for (const [u, v, sx, sz] of [[0, -Wd / 2, L, 0.16], [0, Wd / 2, L, 0.16], [-L / 2, 0, 0.16, Wd], [L / 2, 0, 0.16, Wd]]) {
      const [px, pz] = P(u, v); B.box(px, y + Ht / 2 - 0.1, pz, sx, Ht + 0.2, sz, stone, ry);
      B.box(px, y + Ht + 0.03, pz, sx + 0.06, 0.06, sz + 0.06, dark, ry);
    }
    { const [px, pz] = P(0, 0); B.box(px, y + 0.1, pz, L, 0.2, Wd, dark, ry); }
    // Brunnenstock mit Röhre und Blumen
    const [cx, cz] = P(-L / 2 - 0.25, 0);
    B.box(cx, y + 0.85, cz, 0.4, 1.7, 0.4, stone, ry);
    B.box(cx, y + 1.75, cz, 0.52, 0.1, 0.52, dark, ry);
    B.shape(new THREE.CylinderGeometry(0.22, 0.17, 0.25, 10), cx, y + 1.92, cz, 1, 1, 1, 0x7a5a3a);
    for (let k = 0; k < 7; k++) B.shape(new THREE.SphereGeometry(0.08, 6, 4), cx + Math.cos(k) * 0.13, y + 2.08 + (k % 2) * 0.05, cz + Math.sin(k) * 0.13, 1, 1, 1, k % 3 ? 0xd02a3a : 0x3a6a2a);
    const [sx2, sz2] = P(-L / 2 + 0.05, 0);
    B.shape(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), (sx2 + cx) / 2, y + 1.3, (sz2 + cz) / 2, 1, 1, 1, 0x8a8a8a, ry + Math.PI / 2, 0, Math.PI / 2);
    // Wasser: Oberfläche und Strahl
    const wm = new THREE.MeshPhongMaterial({ color: 0x6a9ab0, transparent: true, opacity: 0.8, shininess: 90, specular: 0xaaccdd });
    const water = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.02, Wd - 0.2), wm);
    const [wx, wz] = P(0, 0); water.position.set(wx, y + Ht - 0.15, wz); water.rotation.y = ry;
    group.add(water);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xcfe6f0, transparent: true, opacity: 0.7 }));
    const [jx, jz] = P(-L / 2 + 0.3, 0); jet.position.set(jx, y + Ht + 0.2, jz);
    group.add(jet);
    cols.addOrientedBox(x, z, c, -s, L / 2 + 0.5, Wd / 2 + 0.1, y - 0.3, y + Ht);
    // zwei Bänke vor dem Brunnen
    for (const v of [-2.4, 2.4]) { const [bx, bz] = P(0, v); bench(bx, bz, ry + (v > 0 ? Math.PI : 0)); }
    world.landmarks.fountain = { x, z };
  }
  // weitere Bänke am Strassenrand im Dorf, Blick zur Strasse
  let benches = 0;
  for (const { r, pts } of roads) {
    if (benches >= 5 || !['secondary', 'tertiary', 'residential'].includes(r.t)) continue;
    const hw = (r.w || 4) / 2;
    for (const [x0, z0, ux, uz] of along(pts, 37)) {
      if (benches >= 5) break;
      const nx = -uz, nz = ux, off = hw + 2.6;
      const x = x0 + nx * off, z = z0 + nz * off;
      if (Math.hypot(x - CENTER.x, z - CENTER.z) > 350 || !inPoly(x, z) || t.landAt(x, z) !== TOWN) continue;
      if (onRoad(x, z, 0.8) || !free(x, z, 1.2)) continue;
      bench(x, z, Math.atan2(-nx, -nz));
      benches++;
    }
  }

  // ---------- Parkierte Autos vor den Häusern ----------
  const carColors = [0x6a6e74, 0x2a3a5a, 0x8a1c1c, 0xd8d8d0, 0x1e1e20, 0x3a5a3a, 0x9a8a6a, 0x4a4e8a];
  let cars = 0;
  const carSpots = [], signSpots = [];
  for (const { r, pts } of roads) {
    if (cars >= 8 || !['residential', 'service', 'unclassified', 'secondary', 'tertiary'].includes(r.t)) continue;
    const hw = (r.w || 4) / 2;
    for (const [x0, z0, ux, uz] of along(pts, 23)) {
      if (cars >= 8) break;
      const sgn = hash(x0, z0) < 0.5 ? 1 : -1;
      const nx = -uz * sgn, nz = ux * sgn, off = hw + 3.2;
      const x = x0 + nx * off, z = z0 + nz * off;
      if (Math.hypot(x - CENTER.x, z - CENTER.z) > 380 || !inPoly(x, z) || t.landAt(x, z) !== TOWN) continue;
      if (onRoad(x, z, 1.0) || !free(x, z, 2.4)) continue;
      const hs = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dz]) => t.heightAt(x + dx, z + dz));
      if (Math.max(...hs) - Math.min(...hs) > 0.8) continue;
      const y = t.heightAt(x, z);
      const suv = cars % 3 === 1, wr = suv ? 0.37 : 0.34, wb = suv ? 1.33 : 1.38;
      const car = suv ? buildSuv(cars % 2 ? 0xb4b8bc : 0x2e4a3a) : buildBody(carColors[cars % carColors.length]);
      const wg = new THREE.CylinderGeometry(wr, wr, 0.22, 12); wg.rotateZ(Math.PI / 2);
      const wmat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
      for (const [wx, wz] of [[-0.8, wb], [0.8, wb], [-0.8, -wb], [0.8, -wb]]) { const w = new THREE.Mesh(wg, wmat); w.position.set(wx, wr, wz); car.add(w); }
      const heading = Math.atan2(ux, uz) + (hash(z0, x0) < 0.5 ? Math.PI : 0);
      car.position.set(x, y, z); car.rotation.y = heading;
      group.add(car); carSpots.push([x, z, heading]);
      cols.addOrientedBox(x, z, Math.sin(heading), Math.cos(heading), 2.25, 0.95, y - 0.3, y + 1.4);
      cars++;
    }
  }

  // ---------- Schilder ----------
  const post = (x, z, h = 2.6) => { const y = t.heightAt(x, z); B.shape(new THREE.CylinderGeometry(0.04, 0.04, h, 8), x, y + h / 2, z, 1, 1, 1, 0x8a8e92); cols.addCircle(x, z, 0.08); return y; };
  const plate = (tex, x, y, z, w, h, ry, back = 0xb0b0b0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
    m.position.set(x, y, z); m.rotation.y = ry; group.add(m);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: back }));
    bm.position.set(x - Math.sin(ry) * 0.01, y, z - Math.cos(ry) * 0.01); bm.rotation.y = ry + Math.PI; group.add(bm);
  };
  const ortTex = signTex((g, w, h) => {
    g.fillStyle = '#1d4f9a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#ffffff'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Stalden', w / 2, h / 2 + 2);
  });
  const t50 = signTex((g, w) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, 7); g.fill();
    g.strokeStyle = '#d0141e'; g.lineWidth = w * 0.1; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - w * 0.07, 0, 7); g.stroke();
    g.fillStyle = '#111'; g.font = `bold ${w * 0.42}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('50', w / 2, w / 2 + 4);
  }, 128, 128);
  // Ortstafel und Tempo 50 dort, wo die Hauptstrasse ins Dorf kommt
  let signs = 0;
  for (const { r, pts } of roads) {
    if (!['secondary', 'tertiary', 'primary'].includes(r.t)) continue;
    const hw = (r.w || 6) / 2;
    const P = along(pts, 6);
    const T = P.map(([x, z]) => Math.hypot(x - CENTER.x, z - CENTER.z) < 230);       // Dorfeingang ~230 m vom Zentrum
    // nur echte Dorfgrenzen: 30 m davor und danach gleich, und weit weg von anderen Tafeln
    const steady = (i0, i1, v) => { for (let k = i0; k <= i1; k++) if (k < 0 || k >= T.length || T[k] !== v) return false; return true; };
    for (let i = 3; i < P.length - 3; i++) {
      const [x0, z0, ux, uz] = P[i];
      const town = T[i];
      if (steady(i, i + 2, town) && steady(i - 3, i - 1, !town) && Math.hypot(x0 - CENTER.x, z0 - CENTER.z) < 650 && inPoly(x0, z0)
        && !signSpots.some(([sx, sz]) => Math.hypot(sx - x0, sz - z0) < 150)) {
        // Fahrtrichtung ins Dorf: entgegen u, wenn wir das Dorf verlassen
        const dir = town ? 1 : -1, nx = uz * dir, nz = -ux * dir;     // rechte Strassenseite
        const x = x0 + nx * (hw + 1.0), z = z0 + nz * (hw + 1.0);
        if (!onRoad(x, z, 0.2)) {
          const y = post(x, z, 2.7);
          const face = Math.atan2(-ux * dir, -uz * dir);               // Schild schaut den Ankommenden an
          plate(ortTex, x, y + 2.25, z, 1.3, 0.65, face); signSpots.push([x, z, face]);
          plate(t50, x, y + 1.45, z, 0.6, 0.6, face);
          signs++;
        }
      }
    }
  }
  // Wegweiser (gelb) und Strassenname nahe beim Club
  {
    let best = null;
    for (const { r, pts } of roads) for (const [x0, z0, ux, uz] of along(pts, 3)) {
      const d = Math.hypot(x0 - CENTER.x, z0 - CENTER.z);
      if (d > 25 && d < 70 && (!best || d < best.d) && r.n) {
        const hw = (r.w || 4) / 2, x = x0 - uz * (hw + 0.9), z = z0 + ux * (hw + 0.9);
        if (!onRoad(x, z, 0.2) && free(x, z, 0.4)) best = { d, x, z, ux, uz, name: r.n };
      }
    }
    if (best) {
      const { x, z, ux, uz, name } = best;
      const y = post(x, z, 2.9);
      const yel = (txt, flip) => signTex((g, w, h) => {
        g.fillStyle = '#f2c200'; g.beginPath();
        if (flip) { g.moveTo(w, 0); g.lineTo(28, 0); g.lineTo(0, h / 2); g.lineTo(28, h); g.lineTo(w, h); }
        else { g.moveTo(0, 0); g.lineTo(w - 28, 0); g.lineTo(w, h / 2); g.lineTo(w - 28, h); g.lineTo(0, h); }
        g.closePath(); g.fill();
        g.fillStyle = '#111'; g.font = 'bold 30px Arial'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(txt, w / 2, h / 2);
      }, 256, 64);
      const ry = Math.atan2(ux, uz) + Math.PI / 2;
      plate(yel('Muotathal 50 min', false), x, y + 2.3, z, 1.1, 0.28, ry, 0xf2c200);
      plate(yel('Hinterthal 1 h 20', true), x, y + 1.98, z, 1.1, 0.28, ry, 0xf2c200);
      const nameTex = signTex((g, w, h) => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#1d4f9a'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#1d4f9a'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 + 2);
      }, 320, 64);
      plate(nameTex, x, y + 2.75, z, 1.0, 0.2, ry + Math.PI / 2);
      signs++;
    }
  }

  const mesh = B.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);
  world.props = { carSpots, signSpots };
  return { fences, fountain, benches, cars, signs };
}
