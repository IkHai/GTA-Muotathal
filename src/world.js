import * as THREE from 'three';
import { Terrain, GRID, CELL, HALF, roadX, riverX, valleyCenter, VILLAGE } from './terrain.js';
import { Builder, ROOF, lowPolyMaterial } from './builder.js';
import { Colliders } from './collision.js';
import { makeRng } from './rng.js';

const C = {
  grass1: 0x5f8f3a, grass2: 0x6c9a40, meadow: 0x7aa64a, rock: 0x7d7a72, rockDark: 0x5f5c56,
  snow: 0xf2f4f6, dirt: 0x8a7350, road: 0x47484c, line: 0xe8e8e0, water: 0x3f7fa0,
  wood: 0x8a5a33, woodDark: 0x5e3b22, plaster: 0xe9e2d3, roof: 0x6b3d2a, roofDark: 0x3d2a22,
  window: 0x2f4656, shutter: 0x2f6a3a, pine: 0x2d5a32, pine2: 0x23492a, bark: 0x5a3d26,
  hay: 0xd8b85a, stone: 0x9a968c, red: 0xb8332a, sign: 0x1f4f9c,
};

/** Baut das ganze Tal und gibt Szene-Objekte, Gelände und Hindernisse zurück. */
export function buildWorld(scene) {
  const terrain = new Terrain();
  const colliders = new Colliders();
  const rng = makeRng(1291);
  const mat = lowPolyMaterial();
  const houses = [];

  scene.add(buildTerrainMesh(terrain, mat));
  scene.add(buildRoad(terrain, mat));
  scene.add(buildRiver());

  const b = new Builder();

  // ---------- Dorf ----------
  const H = (x, z) => terrain.heightAt(x, z);
  for (let z = VILLAGE.minZ; z < VILLAGE.maxZ; z += rng.range(14, 22)) {
    for (const side of [-1, 1]) {
      if (rng() < 0.25) continue;
      const rx = roadX(z);
      let x = rx + side * rng.range(12, 20);
      if (side > 0 && x > riverX(z) - 11) continue;
      const rotated = rng() < 0.5;
      house(b, colliders, H, x, z, rotated, rng);
      houses.push({ x, z });
      if (rng() < 0.5) { // zweite Reihe
        const x2 = rx + side * rng.range(30, 40);
        if (side < 0 || x2 < riverX(z) - 11) { house(b, colliders, H, x2, z + rng.range(-4, 4), rng() < 0.5, rng); houses.push({ x: x2, z }); }
      }
    }
  }
  church(b, colliders, H, roadX(80) - 26, 80);
  houses.push({ x: roadX(80) - 26, z: 80, church: true });

  // Ortstafel am Dorfeingang
  const signZ = VILLAGE.minZ - 8, signX = roadX(signZ) - 5;
  b.box(signX, H(signX, signZ) + 1.2, signZ, 0.12, 2.4, 0.12, C.stone);
  b.box(signX, H(signX, signZ) + 2.5, signZ, 2.6, 0.8, 0.08, C.sign);
  colliders.addCircle(signX, signZ, 0.2);
  scene.add(makeSignText('Muotathal', signX, H(signX, signZ) + 2.5, signZ - 0.05));

  // ---------- Heuballen zum Draufspringen (beim Start) ----------
  const startZ = -60, sx = roadX(startZ) + 9;
  for (let i = 0; i < 4; i++) {
    const h = 0.8 * (i + 1);
    const x = sx + i * 1.9, z = startZ + 2;
    const g = H(x, z);
    b.box(x, g + h / 2 - 0.2, z, 1.8, h + 0.4, 1.8, i % 2 ? C.hay : 0xcfae50, 0, 0.12);
    colliders.addBox(x - 0.9, x + 0.9, z - 0.9, z + 0.9, g - 1, g + h - 0.2);
  }

  // ---------- Ställe auf den Wiesen ----------
  for (let k = 0; k < 14; k++) {
    const z = rng.range(-280, 280);
    const side = rng() < 0.5 ? -1 : 1;
    const x = valleyCenter(z) + side * rng.range(35, 70);
    if (nearRoadOrRiver(x, z, 10) || inVillage(x, z)) continue;
    const g = H(x, z);
    if (g > 12) continue;
    const rot = rng() < 0.5;
    const w = 6, d = 8;
    b.box(x, g + 1.6, z, rot ? d : w, 4.2, rot ? w : d, C.woodDark, 0, 0.1);
    b.shape(ROOF, x, g + 3.6, z, w + 1, 2, d + 1, C.roofDark, rot ? Math.PI / 2 : 0);
    colliders.addBoxCentered(x, z, w, d, g - 1, g + 5.6, rot);
  }

  // ---------- Tannenwald ----------
  const cone = new THREE.ConeGeometry(1, 1, 6);
  let trees = 0;
  for (let tries = 0; tries < 6000 && trees < 520; tries++) {
    const z = rng.range(-HALF + 10, HALF - 10);
    const x = valleyCenter(z) + rng.range(-150, 150);
    if (nearRoadOrRiver(x, z, 7) || inVillage(x, z) || nearStart(x, z)) continue;
    const g = H(x, z);
    if (g > 75) continue;                         // Baumgrenze
    if (g < 3 && rng() < 0.75) continue;          // im Talboden nur wenige Bäume
    const s = rng.range(0.8, 1.5);
    b.box(x, g + 0.9 * s, z, 0.45 * s, 1.8 * s, 0.45 * s, C.bark);
    b.shape(cone, x, g + 3.2 * s, z, 2.3 * s, 4.2 * s, 2.3 * s, rng() < 0.5 ? C.pine : C.pine2, rng() * 6, 0, 0, 0.15);
    b.shape(cone, x, g + 5.4 * s, z, 1.6 * s, 3.2 * s, 1.6 * s, C.pine, rng() * 6, 0, 0, 0.15);
    colliders.addCircle(x, z, 0.45 * s);
    trees++;
  }

  // ---------- Felsbrocken ----------
  const rock = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 90; k++) {
    const z = rng.range(-HALF + 10, HALF - 10);
    const x = valleyCenter(z) + rng.range(-120, 120);
    if (nearRoadOrRiver(x, z, 6) || inVillage(x, z) || nearStart(x, z)) continue;
    const s = rng.range(0.6, 2.2);
    const g = H(x, z);
    b.shape(rock, x, g + s * 0.3, z, s * 1.3, s, s * 1.1, rng() < 0.5 ? C.rock : C.rockDark, rng() * 6, rng(), 0, 0.2);
    colliders.addCircle(x, z, s * 1.05);
  }

  // ---------- Zaun entlang der Strasse beim Dorf ----------
  for (let z = -120; z < -40; z += 3) {
    const x = roadX(z) + 6;
    const g = H(x, z);
    b.box(x, g + 0.5, z, 0.15, 1, 0.15, C.woodDark);
    b.box(x, g + 0.75, z + 1.5, 0.08, 0.12, 3, C.wood);
  }

  const props = b.build(mat);
  scene.add(props);

  // ---------- Wolken ----------
  const clouds = buildClouds(rng);
  scene.add(clouds);

  return {
    terrain, colliders, houses, clouds,
    spawn: { x: roadX(-66) + 4, z: -66 },
    carSpawns: [
      { x: roadX(-58) + 1.8, z: -58, heading: 0, color: 0xb8241c },
      { x: roadX(70) - 1.8, z: 70, heading: Math.PI, color: 0xe2b21c },
    ],
  };
}

function nearRoadOrRiver(x, z, m) {
  return Math.abs(x - roadX(z)) < 3.5 + m || Math.abs(x - riverX(z)) < 6 + m;
}
function inVillage(x, z) {
  return z > VILLAGE.minZ - 12 && z < VILLAGE.maxZ + 12 && x > roadX(z) - 50 && x < riverX(z) - 4;
}
function nearStart(x, z) {
  return Math.abs(z + 60) < 22 && Math.abs(x - roadX(z)) < 24;
}

function house(b, colliders, H, x, z, rotated, rng) {
  const w = rng.range(8, 10), d = rng.range(9, 12);
  const floors = rng() < 0.4 ? 3 : 2;
  const wallH = floors * 2.8;
  const g = Math.min(H(x - w / 2, z - d / 2), H(x + w / 2, z + d / 2), H(x, z));
  const ry = rotated ? Math.PI / 2 : 0;
  const wood = rng() < 0.6;
  // Sockel aus Stein, darüber Holz (Strickbau) oder Verputz
  b.box(x, g + 0.4, z, rotated ? d : w, 1.6, rotated ? w : d, C.stone, 0, 0.06);
  b.box(x, g + 1.2 + (wallH - 1.2) / 2, z, rotated ? d : w, wallH - 1.2, rotated ? w : d, wood ? C.wood : C.plaster, 0, 0.08);
  // Fenster mit grünen Läden auf der Längsseite
  const along = (d - 2) / 3;
  for (let f = 0; f < floors; f++) {
    const y = g + 2 + f * 2.8;
    for (let k = 0; k < 3; k++) {
      const off = -d / 2 + 1 + along * (k + 0.5);
      for (const s of [-1, 1]) {
        const px = rotated ? x + off : x + s * (w / 2 + 0.03);
        const pz = rotated ? z + s * (w / 2 + 0.03) : z + off;
        b.box(px, y, pz, rotated ? 1 : 0.06, 1.1, rotated ? 0.06 : 1, C.window);
        const sx = rotated ? 0.85 : 0, sz = rotated ? 0 : 0.85;
        b.box(px - sx, y, pz - sz, rotated ? 0.45 : 0.08, 1.1, rotated ? 0.08 : 0.45, C.shutter);
        b.box(px + sx, y, pz + sz, rotated ? 0.45 : 0.08, 1.1, rotated ? 0.08 : 0.45, C.shutter);
      }
    }
  }
  // Satteldach mit Überstand
  const roofH = w * 0.38;
  b.shape(ROOF, x, g + wallH, z, w + 1.6, roofH, d + 1.6, wood ? C.roof : C.roofDark, ry, 0, 0, 0.05);
  colliders.addBoxCentered(x, z, w, d, g - 1, g + wallH + roofH, rotated);
}

function church(b, colliders, H, x, z) {
  const g = H(x, z);
  const w = 12, d = 24;
  b.box(x, g + 5, z, w, 10, d, C.plaster, 0, 0.04);
  b.shape(ROOF, x, g + 10, z, w + 1, 5, d + 1, C.roofDark);
  for (let k = 0; k < 4; k++) {
    for (const s of [-1, 1]) b.box(x + s * (w / 2 + 0.03), g + 6, z - 8 + k * 5, 0.06, 4, 1.5, C.window);
  }
  // Turm mit Zwiebelhaube
  const tz = z - d / 2 - 2.5;
  b.box(x, g + 12, tz, 5, 24, 5, C.plaster, 0, 0.04);
  b.box(x, g + 20, tz - 2.53, 2, 2, 0.06, 0x333333); // Uhr
  b.shape(new THREE.SphereGeometry(1, 6, 4), x, g + 26, tz, 3.4, 3.2, 3.4, 0x3d6e5a);
  b.shape(new THREE.ConeGeometry(1, 1, 6), x, g + 30, tz, 1.4, 5, 1.4, 0x3d6e5a);
  b.box(x, g + 33, tz, 0.15, 1.6, 0.15, 0xd4af37);
  colliders.addBoxCentered(x, z, w, d, g - 1, g + 15);
  colliders.addBoxCentered(x, tz, 5, 5, g - 1, g + 34);
}

function buildTerrainMesh(terrain, mat) {
  const n = GRID;
  const pos = new Float32Array(n * n * 6 * 3);
  const col = new Float32Array(n * n * 6 * 3);
  const c = new THREE.Color();
  let p = 0;
  const colors = {
    grass: [new THREE.Color(C.grass1), new THREE.Color(C.grass2), new THREE.Color(C.meadow)],
    rock: [new THREE.Color(C.rock), new THREE.Color(C.rockDark)],
    snow: new THREE.Color(C.snow), dirt: new THREE.Color(C.dirt),
  };
  const pushTri = (ax, az, bx, bz, cx, cz) => {
    const ha = terrain.heightAt(ax, az), hb = terrain.heightAt(bx, bz), hc = terrain.heightAt(cx, cz);
    const avg = (ha + hb + hc) / 3;
    const steep = Math.max(ha, hb, hc) - Math.min(ha, hb, hc);
    const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3;
    const hash = Math.abs(Math.sin(mx * 12.9898 + mz * 78.233) * 43758.5453) % 1;
    if (avg > 95 + hash * 25 && steep < 9) c.copy(colors.snow);
    else if (steep > 4.2 || avg > 70) c.copy(colors.rock[hash < 0.5 ? 0 : 1]);
    else if (avg < -0.4) c.copy(colors.dirt);
    else c.copy(colors.grass[Math.floor(hash * 3)]);
    const k = 0.93 + hash * 0.14;
    for (const [x, h, z] of [[ax, ha, az], [bx, hb, bz], [cx, hc, cz]]) {
      pos[p] = x; pos[p + 1] = h; pos[p + 2] = z;
      col[p] = c.r * k; col[p + 1] = c.g * k; col[p + 2] = c.b * k;
      p += 3;
    }
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = -HALF + i * CELL, x1 = x0 + CELL, z0 = -HALF + j * CELL, z1 = z0 + CELL;
      pushTri(x0, z0, x0, z1, x1, z0);
      pushTri(x1, z0, x0, z1, x1, z1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return new THREE.Mesh(g, mat);
}

function buildRoad(terrain, mat) {
  const b = new Builder();
  const pos = [], col = [];
  const road = new THREE.Color(C.road), line = new THREE.Color(C.line);
  const quad = (pts, color) => {
    for (const i of [0, 1, 2, 2, 1, 3]) { pos.push(...pts[i]); col.push(color.r, color.g, color.b); }
  };
  const step = 4;
  for (let z = -HALF; z < HALF; z += step) {
    const z2 = z + step;
    const p = (dx, zz) => { const x = roadX(zz) + dx; return [x, terrain.heightAt(x, zz) + 0.07, zz]; };
    // Reihenfolge so, dass die Fläche nach oben zeigt
    quad([p(-3.5, z), p(-3.5, z2), p(3.5, z), p(3.5, z2)], road);
    if ((z / step) % 2 === 0) {
      const q = (dx, zz) => { const a = p(dx, zz); a[1] += 0.02; return a; };
      quad([q(-0.12, z), q(-0.12, z + 2.2), q(0.12, z), q(0.12, z + 2.2)], line);
    }
  }
  b.pos = pos; b.col = col;
  return b.build(mat);
}

function buildRiver() {
  const pos = [];
  const step = 6, w = 7, y = -0.55;
  for (let z = -HALF; z < HALF; z += step) {
    const z2 = z + step, a = riverX(z), c = riverX(z2);
    pos.push(a - w, y, z, c - w, y, z2, a + w, y, z);
    pos.push(a + w, y, z, c - w, y, z2, c + w, y, z2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ color: C.water, transparent: true, opacity: 0.85 });
  return new THREE.Mesh(g, m);
}

function buildClouds(rng) {
  const b = new Builder();
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 22; k++) {
    const x = rng.range(-300, 300), z = rng.range(-300, 300), y = rng.range(150, 190);
    for (let p = 0; p < 5; p++) {
      b.shape(blob, x + rng.range(-14, 14), y + rng.range(-3, 3), z + rng.range(-8, 8),
        rng.range(8, 14), rng.range(4, 6), rng.range(6, 10), 0xffffff, rng() * 6);
    }
  }
  const mesh = b.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9 }));
  return mesh;
}

function makeSignText(text, x, y, z) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 80;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1f4f9c'; ctx.fillRect(0, 0, 256, 80);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.strokeRect(6, 6, 244, 68);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 42px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.75), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  m.rotation.y = Math.PI;
  return m;
}
