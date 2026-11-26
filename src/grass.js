import * as THREE from 'three';
import { LAND } from './terrain.js';

// Gras, Blumen und Steine rund um den Spieler. Nur in der Nähe (sonst wird es auf dem Handy
// zu langsam). Die Plätze sind fest (aus den Koordinaten berechnet), darum springt nichts herum,
// wenn man sich bewegt. Am Rand werden die Büschel kleiner, damit sie nicht plötzlich auftauchen.

const CELL = 3;          // Meter pro Zelle
const R_GRASS = 40;      // Radius für Gras
const R_SMALL = 28;      // Radius für Blumen und Steine
const MAX_GRASS = 4200, MAX_FLOWER = 700, MAX_STONE = 300;

function hash(i, j, k) {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function bladeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 4 + Math.random() * 56, lean = (Math.random() - 0.5) * 18, h = 30 + Math.random() * 34;
    const v = 150 + Math.random() * 105;
    g.fillStyle = `rgb(${v},${v},${v * 0.92})`;
    g.beginPath(); g.moveTo(x - 1.6, 64); g.quadraticCurveTo(x + lean * 0.3, 64 - h * 0.6, x + lean, 64 - h); g.lineTo(x + 1.6, 64); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flowerTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const x = 8 + Math.random() * 48, top = 18 + Math.random() * 26;
    g.strokeStyle = '#5a7a3a'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, 64); g.lineTo(x + (Math.random() - 0.5) * 6, top); g.stroke();
  }
  // Blüten weiss: Farbe kommt pro Büschel (gelb, weiss, lila, blau)
  for (let i = 0; i < 7; i++) {
    const x = 8 + Math.random() * 48, y = 16 + Math.random() * 28;
    g.fillStyle = '#ffffff';
    for (let p = 0; p < 5; p++) { const a = p * 1.256; g.beginPath(); g.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.2, 0, 7); g.fill(); }
    g.fillStyle = '#e8c040'; g.beginPath(); g.arc(x, y, 1.4, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// drei gekreuzte Flächen, unten am Boden
function tuftGeometry() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const p = new THREE.PlaneGeometry(1, 1, 1, 2);
    p.translate(0, 0.5, 0);
    p.rotateY(k * Math.PI / 3);
    parts.push(p);
  }
  const pos = [], uv = [], idx = [];
  let o = 0;
  for (const p of parts) {
    pos.push(...p.attributes.position.array); uv.push(...p.attributes.uv.array);
    for (const i of p.index.array) idx.push(i + o);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Normalen nach oben: Gras wirkt dann von allen Seiten gleich hell
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  g.setIndex(idx);
  return g;
}

// Wind: die Spitzen wiegen leicht hin und her
function addWind(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float sway = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.5 + sin(uTime * 2.9 + ip.x * 0.9) * 0.2;
      transformed.x += sway * 0.12 * uv.y * uv.y;
      transformed.z += sway * 0.06 * uv.y * uv.y;`);
    // beide Seiten gleich hell (sonst ist die Rückseite schwarz)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
  };
}

export class Grass {
  constructor(scene, world) {
    this.world = world;
    this.terrain = world.terrain;
    this.cells = new Map();
    this.center = null;
    this.uniforms = { uTime: { value: 0 } };

    const gm = new THREE.MeshLambertMaterial({ map: bladeTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
    addWind(gm, this.uniforms);
    this.grass = new THREE.InstancedMesh(tuftGeometry(), gm, MAX_GRASS);
    const fm = new THREE.MeshLambertMaterial({ map: flowerTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
    addWind(fm, this.uniforms);
    this.flowers = new THREE.InstancedMesh(tuftGeometry(), fm, MAX_FLOWER);
    const sg = new THREE.IcosahedronGeometry(1, 1);
    const sp = sg.attributes.position;
    for (let i = 0; i < sp.count; i++) {   // unregelmässige Steine
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const k = 0.8 + 0.35 * Math.abs(Math.sin(x * 5.1 + y * 3.7 + z * 4.3));
      sp.setXYZ(i, x * k, y * k * 0.55, z * k);
    }
    sg.computeVertexNormals();
    this.stones = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_STONE);
    for (const m of [this.grass, this.flowers, this.stones]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.stones.castShadow = true; this.stones.receiveShadow = true;
    // Farbspeicher anlegen
    const c = new THREE.Color(1, 1, 1);
    for (const m of [this.grass, this.flowers, this.stones]) m.setColorAt(0, c);
  }

  // Was wächst in dieser Zelle? Wird einmal berechnet und gemerkt.
  cell(i, j) {
    const key = i * 100003 + j;
    let c = this.cells.get(key);
    if (c) return c;
    c = { g: [], f: [], s: [] };
    const t = this.terrain, half = t.half - 5;
    const x0 = i * CELL, z0 = j * CELL;
    const land = t.landAt(x0 + CELL / 2, z0 + CELL / 2);
    let nG = 0, nF = 0, nS = 0;
    if (land === LAND.MEADOW) { nG = 5; nF = hash(i, j, 9) < 0.22 ? 2 : 0; nS = hash(i, j, 8) < 0.08 ? 1 : 0; }
    else if (land === LAND.FOREST) { nG = 2; nS = hash(i, j, 8) < 0.15 ? 1 : 0; }
    else if (land === LAND.TOWN) { nG = 2; nF = hash(i, j, 9) < 0.1 ? 1 : 0; }
    else if (land === LAND.ROCK || land === LAND.SCREE) { nG = 1; nS = hash(i, j, 8) < 0.6 ? 2 : 0; }
    const col = new THREE.Color();
    const put = (arr, n, salt, extra) => {
      for (let k = 0; k < n; k++) {
        const x = x0 + hash(i, j, salt + k * 3) * CELL, z = z0 + hash(i, j, salt + k * 3 + 1) * CELL;
        if (Math.abs(x) > half || Math.abs(z) > half) continue;
        if (t.roadAt) { const r = t.roadAt(x, z, land === LAND.TOWN ? 2.1 : 0.6); if (r === r) continue; }
        const y = t.heightAt(x, z);
        if (t.groundAt && Math.abs(y - t.groundAt(x, z)) > 0.6) continue;   // Fluss, Brücke
        if (t.landAt(x, z) === LAND.WATER) continue;
        if (this.world.colliders.resolve(x, z, 0.25, y + 0.2).hit) continue;   // Häuser, Bäume, Mauern
        // Farbe vom Boden (Luftbild), damit das Gras zum Gelände passt
        if (t.aerial) { const [r, g, b] = t.aerial.ground(x, z); col.setRGB(r, g, b, THREE.SRGBColorSpace); } else col.setRGB(0.45, 0.55, 0.25);
        arr.push(x, y, z, hash(i, j, salt + k * 3 + 2), ...extra(col, hash(i, j, salt + k * 7 + 5)));
      }
    };
    put(c.g, nG, 0, (cl, h) => {
      // etwas grüner und heller als der Boden, trockene Halme dazwischen
      const dry = h < 0.18;
      return [cl.r * 1.05 + (dry ? 0.12 : 0), cl.g * 1.15 + (dry ? 0.06 : 0.03), cl.b * 0.85];
    });
    const flowerCols = [[1, 0.86, 0.25], [1, 1, 1], [0.75, 0.5, 0.95], [0.45, 0.6, 1], [1, 0.55, 0.3]];
    put(c.f, nF, 40, (cl, h) => flowerCols[Math.floor(h * flowerCols.length)]);
    put(c.s, nS, 70, (cl, h) => { const v = 0.55 + h * 0.3; return [v, v * 0.97, v * 0.92]; });
    if (this.cells.size > 30000) this.cells.clear();
    this.cells.set(key, c);
    return c;
  }

  update(dt, pos, hidden) {
    this.uniforms.uTime.value += dt;
    const show = !hidden;
    for (const m of [this.grass, this.flowers, this.stones]) m.visible = show;
    if (!show) { this.center = null; return; }
    if (this.center && Math.hypot(pos.x - this.center.x, pos.z - this.center.z) < 4) return;
    this.center = { x: pos.x, z: pos.z };
    this.rebuild(pos);
  }

  rebuild(pos) {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const ci = Math.floor(pos.x / CELL), cj = Math.floor(pos.z / CELL), n = Math.ceil(R_GRASS / CELL);
    let g = 0, f = 0, st = 0;
    const fade = (d, R) => Math.min(1, (R - d) / (R * 0.3));
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const cx = (ci + di + 0.5) * CELL, cz = (cj + dj + 0.5) * CELL;
        const dc = Math.hypot(cx - pos.x, cz - pos.z);
        if (dc > R_GRASS + CELL) continue;
        const c = this.cell(ci + di, cj + dj);
        for (let k = 0; k < c.g.length && g < MAX_GRASS; k += 7) {
          const d = Math.hypot(c.g[k] - pos.x, c.g[k + 2] - pos.z);
          if (d > R_GRASS) continue;
          const h = c.g[k + 3], sc = fade(d, R_GRASS) * (0.7 + h * 0.6);
          q.setFromAxisAngle(up, h * 6.28);
          m4.compose(p.set(c.g[k], c.g[k + 1] - 0.03, c.g[k + 2]), q, s.set(0.75 * sc, 0.5 * sc, 0.75 * sc));
          this.grass.setMatrixAt(g, m4);
          this.grass.setColorAt(g, col.setRGB(c.g[k + 4], c.g[k + 5], c.g[k + 6]));
          g++;
        }
        if (dc > R_SMALL + CELL) continue;
        for (let k = 0; k < c.f.length && f < MAX_FLOWER; k += 7) {
          const d = Math.hypot(c.f[k] - pos.x, c.f[k + 2] - pos.z);
          if (d > R_SMALL) continue;
          const h = c.f[k + 3], sc = fade(d, R_SMALL) * (0.8 + h * 0.4);
          q.setFromAxisAngle(up, h * 6.28);
          m4.compose(p.set(c.f[k], c.f[k + 1] - 0.02, c.f[k + 2]), q, s.set(0.6 * sc, 0.42 * sc, 0.6 * sc));
          this.flowers.setMatrixAt(f, m4);
          this.flowers.setColorAt(f, col.setRGB(c.f[k + 4], c.f[k + 5], c.f[k + 6]));
          f++;
        }
        for (let k = 0; k < c.s.length && st < MAX_STONE; k += 7) {
          const d = Math.hypot(c.s[k] - pos.x, c.s[k + 2] - pos.z);
          if (d > R_SMALL) continue;
          const h = c.s[k + 3], r = (0.08 + h * h * 0.3) * fade(d, R_SMALL);
          q.setFromAxisAngle(up, h * 6.28);
          m4.compose(p.set(c.s[k], c.s[k + 1] - r * 0.2, c.s[k + 2]), q, s.set(r, r, r * (0.7 + h * 0.5)));
          this.stones.setMatrixAt(st, m4);
          this.stones.setColorAt(st, col.setRGB(c.s[k + 4], c.s[k + 5], c.s[k + 6]));
          st++;
        }
      }
    }
    for (const [m, cnt] of [[this.grass, g], [this.flowers, f], [this.stones, st]]) {
      m.count = cnt;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
