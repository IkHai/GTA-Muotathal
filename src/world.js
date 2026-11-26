import * as THREE from 'three';
import { Terrain, LAND } from './terrain.js';
import { Builder, ROOF, planarUVs, UNIT_BOX as UNIT_BOX_REF } from './builder.js';
import { materials } from './textures.js';
import { Colliders } from './collision.js';
import { makeRng } from './rng.js';
import { buildRoadNet, drawRoadNet } from './roads.js';
import { prepareRivers, drawRivers } from './river.js';

// Kachelgrösse für Gelände und Details. Nur Kacheln in der Nähe werden fein gezeichnet.
const CHUNK = 500;
const NEAR_LOD = 900;       // bis hier Gelände in voller Auflösung (10 m)
const DETAIL_DIST = 1600;   // bis hier Häuser, Strassen, Flüsse
const TREE_NEAR = 650;      // bis hier ausführliche Tannen
const TREE_FAR = 1400;      // bis hier einfache Tannen

const C = {
  meadow: [0x86a050, 0x93a85a, 0x7c9a48], forestFloor: 0x56603a, rock: [0x8c867a, 0x7b766c], scree: 0x9f998d,
  town: 0x77795c, waterBed: 0x5d6650, snow: 0xe8ecf0,
  asphalt: 0x5a5a5c, asphaltMain: 0x4e4e51, gravel: 0x9a8c72, path: 0x8a7b60, line: 0xd8d8cc,
  wood: [0x6e4a30, 0x5f3f28, 0x7a5638], plaster: [0xd8d1c0, 0xcfc6b2, 0xc8c1b0], stone: 0x8e8a80,
  roof: [0x6a4434, 0x5a3a2c, 0x55565a, 0x704a3a], window: 0x2a343c, shutter: 0x3d5a40,
  pine: 0x3c4c2e, pine2: 0x33412a, bark: 0x4a3a2c,
};

export async function loadWorld(scene, onProgress = () => {}) {
  const get = async (f, type) => {
    const r = await fetch('data/' + f + '?v=' + (window.__VERSION || 'dev'), { cache: 'no-cache' });
    if (!r.ok) throw new Error(f + ': ' + r.status);
    return type === 'json' ? r.json() : r.arrayBuffer();
  };
  onProgress('Lade Höhendaten …');
  const [meta, hBuf, lBuf, osm] = await Promise.all([get('meta.json', 'json'), get('terrain.bin'), get('landcover.bin'), get('osm.json', 'json')]);
  const bBuf = meta.backdrop ? await get('backdrop.bin').catch(() => null) : null;
  onProgress('Baue das Tal …');
  await new Promise((r) => setTimeout(r, 30));
  return buildWorld(scene, meta, new Uint16Array(hBuf), new Uint8Array(lBuf), osm, bBuf && new Uint16Array(bBuf));
}

function buildWorld(scene, meta, heights, land, osm, backdrop) {
  const terrain = new Terrain(meta, heights, land);
  // Muota verbauen und Strassennetz zuerst: beide passen das Gelände an
  const rivers = prepareRivers(osm.water, terrain);
  const net = buildRoadNet(osm.roads, terrain);
  const colliders = new Colliders();
  const rng = makeRng(4417);
  const half = terrain.half;
  const chunksPerSide = Math.ceil(meta.size / CHUNK);
  const M = materials();
  const mat = M.terrain;

  // ---------- Kacheln anlegen ----------
  const chunks = [];
  const chunkAt = (x, z) => {
    const ci = Math.max(0, Math.min(chunksPerSide - 1, Math.floor((x + half) / CHUNK)));
    const cj = Math.max(0, Math.min(chunksPerSide - 1, Math.floor((z + half) / CHUNK)));
    return chunks[cj * chunksPerSide + ci];
  };
  for (let cj = 0; cj < chunksPerSide; cj++) {
    for (let ci = 0; ci < chunksPerSide; ci++) {
      const x0 = -half + ci * CHUNK, z0 = -half + cj * CHUNK;
      const ch = {
        x0, z0, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2,
        detail: { plaster: new Builder(), wood: new Builder(), roof: new Builder(), stone: new Builder(), plain: new Builder(), glass: new Builder() },
        roads: new Builder(), water: [], trees: [],
      };
      ch.lod0 = buildTerrainChunk(terrain, x0, z0, 1, mat);
      ch.lod1 = buildTerrainChunk(terrain, x0, z0, 5, mat);
      scene.add(ch.lod0, ch.lod1);
      chunks.push(ch);
    }
  }

  // ---------- Strassen ----------
  const roadColor = (t) => ({
    primary: C.asphaltMain, secondary: C.asphaltMain, tertiary: C.asphalt, trunk: C.asphaltMain,
    unclassified: C.asphalt, residential: C.asphalt, living_street: C.asphalt, service: C.asphalt,
    track: C.gravel, path: C.path, footway: C.path, cycleway: C.asphalt, steps: C.stone, bridleway: C.path,
  }[t] ?? C.asphalt);
  const mainRoads = [];
  const inNet = new Set(net.ways.map((w) => w.r));
  for (const r of osm.roads) {
    if (r.tn) continue;
    const pts = toPts(r.p);
    const big = ['primary', 'secondary', 'tertiary', 'trunk', 'unclassified'].includes(r.t);
    // Feldwege und Fusswege liegen weiter auf dem Gelände
    if (!inNet.has(r)) ribbon(pts, r.w, 6, roadColor(r.t), 0.12, false, terrain, chunkAt, (ch) => ch.roads);
    if (big) mainRoads.push({ ...r, pts });
  }
  drawRoadNet(net, terrain, chunkAt, colliders, roadColor);

  // ---------- Gewässer ----------
  const riverSet = new Set(rivers.map((r) => r.w));
  for (const w of osm.water) {
    if (riverSet.has(w)) continue;
    const pts = toPts(w.p);
    waterRibbon(pts, w.w, terrain, chunkAt);
  }

  // ---------- Gebäude ----------
  const houses = [];
  for (const b of osm.buildings) {
    const info = building(b, terrain, colliders, chunkAt, rng);
    if (info) houses.push(info);
  }

  const buildingIndex = new Map();
  for (const h of houses) {
    const k = Math.floor(h.x / 50) + ',' + Math.floor(h.z / 50);
    buildingIndex.set(k, (buildingIndex.get(k) || 0) + 1);
  }

  // Rasterkarte aller Strassen (2 m), damit keine Bäume oder Laternen auf der Fahrbahn stehen
  const onRoad = makeRoadMask(osm.roads.concat(rivers.map((r) => ({ p: r.w.p, w: r.w.w + 12 }))), half);
  drawRivers(rivers, terrain, chunkAt, colliders, rng, (x, z, e) => { const h = terrain.roadAt(x, z, e); return h === h; }, osm.roads);

  // ---------- Wald ----------
  const res = terrain.res;
  for (let j = 0; j < terrain.n; j++) {
    for (let i = 0; i < terrain.n; i++) {
      if (terrain.land[j * terrain.n + i] !== LAND.FOREST) continue;
      if (rng() > 0.42) continue;
      const x = -half + i * res + rng.range(-4.5, 4.5), z = -half + j * res + rng.range(-4.5, 4.5);
      if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) continue;
      if (onRoad(x, z, 1.5)) continue;
      const y = terrain.heightAt(x, z);
      const s = rng.range(0.85, 1.6);
      chunkAt(x, z).trees.push(x, y, z, s, rng() * 6.28);
      colliders.addCircle(x, z, 0.4 * s);
    }
  }
  // einzelne Bäume auf Wiesen
  for (let k = 0; k < 1500; k++) {
    const x = rng.range(-half + 5, half - 5), z = rng.range(-half + 5, half - 5);
    if (terrain.landAt(x, z) !== LAND.MEADOW) continue;
    if (nearRoad(x, z, mainRoads, 12) || onRoad(x, z, 3)) continue;
    const y = terrain.heightAt(x, z);
    const s = rng.range(0.9, 1.5);
    chunkAt(x, z).trees.push(x, y, z, s, rng() * 6.28);
    colliders.addCircle(x, z, 0.4 * s);
  }

  // ---------- Strassenlaternen an den Hauptstrassen im Dorf ----------
  for (const r of mainRoads) {
    const p = resample(r.pts, 35);
    for (let i = 1; i < p.length - 1; i++) {
      const [x, z] = p[i], [nx2, nz2] = p[i + 1];
      const near = osm.buildings.length && houseNear(x, z, buildingIndex, 45);
      if (!near) continue;
      const dx = nx2 - x, dz = nz2 - z, l = Math.hypot(dx, dz) || 1;
      const side = (i % 2 ? 1 : -1) * (r.w / 2 + 0.9);
      const lx = x - dz / l * side, lz = z + dx / l * side;
      const g = terrain.heightAt(lx, lz);
      const D = chunkAt(lx, lz).detail.plain;
      D.box(lx, g + 3, lz, 0.14, 6, 0.14, 0x4a4d50);
      const ax = dz / l * Math.sign(side) * 0.6, az = -dx / l * Math.sign(side) * 0.6;
      D.box(lx + ax, g + 6, lz + az, 0.1, 0.1, 0.1, 0x4a4d50);
      D.box(lx + ax * 1.6, g + 5.95, lz + az * 1.6, 0.5, 0.12, 0.5, 0x3a3c3e);
      D.box(lx + ax * 1.6, g + 5.86, lz + az * 1.6, 0.36, 0.04, 0.36, 0xf2ead0);
      if (!onRoad(lx, lz, 0.3)) colliders.addCircle(lx, lz, 0.15);
    }
  }

  const treeNear = makeTreeGeometry(true), treeFar = makeTreeGeometry(false);
  const treeMat = M.tree;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), pv = new THREE.Vector3();

  // ---------- Kacheln fertigstellen ----------
  for (const ch of chunks) {
    ch.group = new THREE.Group();
    for (const [name, b] of Object.entries(ch.detail)) {
      if (!b.pos.length) continue;
      const m = b.build(M[name], name === 'wood' || name === 'plaster' ? 0.5 : 0.45);
      m.castShadow = true; m.receiveShadow = true;
      ch.group.add(m);
    }
    if (ch.roads.pos.length) { const m = ch.roads.build(M.road, 0.18); m.receiveShadow = true; ch.group.add(m); }
    if (ch.water.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ch.water, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(planarUVs(ch.water, 0.08), 2));
      g.computeVertexNormals();
      ch.group.add(new THREE.Mesh(g, M.water));
    }
    scene.add(ch.group);
    const count = ch.trees.length / 5;
    if (count) {
      ch.treeNear = new THREE.InstancedMesh(treeNear, treeMat, count);
      ch.treeFar = new THREE.InstancedMesh(treeFar, treeMat, count);
      for (let t = 0; t < count; t++) {
        const [x, y, z, s, r] = ch.trees.slice(t * 5, t * 5 + 5);
        m4.compose(pv.set(x, y, z), q.setFromAxisAngle(up, r), sc.set(s, s, s));
        ch.treeNear.setMatrixAt(t, m4);
        ch.treeFar.setMatrixAt(t, m4);
      }
      for (const m of [ch.treeNear, ch.treeFar]) { m.computeBoundingSphere(); m.frustumCulled = true; scene.add(m); }
      ch.treeNear.castShadow = true;
    }
    delete ch.trees; delete ch.detail; delete ch.roads; delete ch.water;
  }

  // ---------- Startpunkt und Autos auf der Hauptstrasse ----------
  const along = pointsAlongMainRoad(mainRoads);
  const spawnRoad = along.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const s0 = spawnRoad[0] || { x: 0, z: 0, dir: 0, w: 6 };
  const side = (p, d) => ({ x: p.x + Math.cos(p.dir) * d, z: p.z - Math.sin(p.dir) * d });
  const spawn = side(s0, s0.w / 2 + 2.5);
  const carSpots = [];
  if (!spawnRoad.length) carSpots.push({ x: spawn.x + 4, z: spawn.z + 4, heading: 0, color: 0xb8241c });
  const colors = [0x7a1e1a, 0x2f3d52, 0xb8b4a8, 0x3c4a3a];
  for (const p of spawnRoad) {
    if (carSpots.length >= 4) break;
    const d = Math.hypot(p.x - s0.x, p.z - s0.z);
    if (carSpots.length === 0 ? d < 10 || d > 30 : carSpots.every((c) => Math.hypot(c.x - p.x, c.z - p.z) > 250) && d < 1500) {
      const sp = side(p, -(p.w / 2 + 1.6));
      carSpots.push({ x: sp.x, z: sp.z, heading: p.dir, color: colors[carSpots.length] });
    }
  }

  // ---------- Kühe auf den Weiden ----------
  const cows = [];
  for (let herd = 0, tries = 0; herd < 9 && tries < 400; tries++) {
    const hx = rng.range(-half + 60, half - 60), hz = rng.range(-half + 60, half - 60);
    if (!cowSpot(hx, hz)) continue;
    herd++;
    const n = 3 + Math.floor(rng() * 5);
    for (let k = 0; k < n; k++) {
      const x = hx + rng.range(-25, 25), z = hz + rng.range(-25, 25);
      if (!cowSpot(x, z)) continue;
      cows.push([x, terrain.heightAt(x, z), z, rng() * 6.28, 0.9 + rng() * 0.2]);
      colliders.addCircle(x, z, 1.0);
    }
  }
  function cowSpot(x, z) {
    if (terrain.landAt(x, z) !== LAND.MEADOW) return false;
    const y = terrain.heightAt(x, z);
    if (Math.abs(terrain.heightAt(x + 4, z) - y) > 2 || Math.abs(terrain.heightAt(x, z + 4) - y) > 2) return false;
    if (nearRoad(x, z, mainRoads, 15) || onRoad(x, z, 4)) return false;
    return !colliders.resolve(x, z, 4, y).hit;
  }
  if (cows.length) {
    const cowMesh = new THREE.InstancedMesh(makeCowGeometry(), M.plain, cows.length);
    cows.forEach(([x, y, z, r, s], i) => {
      m4.compose(pv.set(x, y, z), q.setFromAxisAngle(up, r), sc.set(s, s, s));
      cowMesh.setMatrixAt(i, m4);
    });
    cowMesh.castShadow = true;
    cowMesh.frustumCulled = false;
    scene.add(cowMesh);
  }

  // ---------- Kartenrand sichtbar machen ----------
  scene.add(buildBorder(terrain, half - 5));

  // ---------- Berg-Kulisse rundherum ----------
  if (backdrop) scene.add(buildBackdrop(meta.backdrop, backdrop, terrain, M.plain));

  // ---------- Wolken ----------
  const clouds = buildClouds(rng, half, terrain.base + 1800);
  scene.add(clouds);

  return {
    cows, terrain, colliders, houses, clouds, meta, osm, chunks, half, mainRoads,
    spawn, carSpawns: carSpots,
    places: osm.places.filter((p) => ['village', 'hamlet', 'locality', 'isolated_dwelling', 'neighbourhood', 'town'].includes(p.type)),
    updateVisibility(cam) {
      for (const ch of chunks) {
        const d = Math.hypot(cam.x - ch.cx, cam.z - ch.cz);
        ch.lod0.visible = d < NEAR_LOD;
        ch.lod1.visible = !ch.lod0.visible;
        ch.group.visible = d < DETAIL_DIST;
        if (ch.treeNear) {
          ch.treeNear.visible = d < TREE_NEAR;
          ch.treeFar.visible = !ch.treeNear.visible && d < TREE_FAR;
        }
      }
    },
  };
}

function houseNear(x, z, index, d) {
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    if ((index.get((Math.floor(x / 50) + i) + ',' + (Math.floor(z / 50) + j)) || 0) >= 2) return true;
  }
  return false;
}

const toPts = (p) => { const out = []; for (let i = 0; i < p.length; i += 2) out.push([p[i] / 10, p[i + 1] / 10]); return out; };

// Liefert onRoad(x, z, extra): true, wenn der Punkt auf einer Strasse liegt (plus extra Meter Rand)
function makeRoadMask(roads, half) {
  const R = 2, n = Math.ceil(half * 2 / R);
  const dist = new Float32Array(n * n).fill(99);
  for (const r of roads) {
    if (r.tn) continue;
    const hw = (r.w || 3) / 2;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const x1 = r.p[i] / 10, z1 = r.p[i + 1] / 10, x2 = r.p[i + 2] / 10, z2 = r.p[i + 3] / 10;
      const L = Math.hypot(x2 - x1, z2 - z1) || 1e-6;
      const reach = hw + 6;
      const i0 = Math.max(0, Math.floor((Math.min(x1, x2) - reach + half) / R)), i1 = Math.min(n - 1, Math.ceil((Math.max(x1, x2) + reach + half) / R));
      const j0 = Math.max(0, Math.floor((Math.min(z1, z2) - reach + half) / R)), j1 = Math.min(n - 1, Math.ceil((Math.max(z1, z2) + reach + half) / R));
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
        const px = -half + (k + 0.5) * R, pz = -half + (j + 0.5) * R;
        const tt = Math.max(0, Math.min(1, ((px - x1) * (x2 - x1) + (pz - z1) * (z2 - z1)) / (L * L)));
        const d = Math.hypot(px - x1 - (x2 - x1) * tt, pz - z1 - (z2 - z1) * tt) - hw;
        if (d < dist[j * n + k]) dist[j * n + k] = d;
      }
    }
  }
  return (x, z, extra = 0) => {
    const k = Math.floor((x + half) / R), j = Math.floor((z + half) / R);
    if (k < 0 || j < 0 || k >= n || j >= n) return false;
    return dist[j * n + k] < extra + R * 0.71;
  };
}

function nearRoad(x, z, roads, d) {
  for (const r of roads) for (let i = 0; i < r.pts.length; i += 2) {
    if (Math.abs(r.pts[i][0] - x) < d && Math.abs(r.pts[i][1] - z) < d) return true;
  }
  return false;
}

function pointsAlongMainRoad(roads) {
  const out = [];
  const pri = (t) => ({ primary: 0, secondary: 0, trunk: 0, tertiary: 1, unclassified: 2 }[t] ?? 3);
  const best = Math.min(...roads.map((r) => pri(r.t)), 3);
  for (const r of roads) {
    if (pri(r.t) !== best) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 20) {
        out.push({ x: ax + (bx - ax) * s / len, z: az + (bz - az) * s / len, dir: Math.atan2(bx - ax, bz - az), w: r.w });
      }
    }
  }
  return out;
}

// Linie in gleichmässige Punkte unterteilen
function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}

function ribbon(pts, width, step, color, lift, bridge, terrain, chunkAt, pick) {
  if (pts.length < 2) return;
  const p = resample(pts, step);
  const tc = new THREE.Color(color);
  const h = p.map(([x, z]) => terrain.heightAt(x, z));
  if (bridge) {
    // Brücke: gerade Linie zwischen den Enden, nie unter dem Gelände
    const h0 = h[0], h1 = h[h.length - 1];
    for (let i = 0; i < h.length; i++) h[i] = Math.max(h0 + (h1 - h0) * i / (h.length - 1), h[i] + 0.3);
  }
  const hw = width / 2;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * hw, nz = dx / len * hw;
    // etwas breiter an den Ecken, damit keine Lücken entstehen
    const ex = dx / len * 0.3, ez = dz / len * 0.3;
    const ya = h[i] + lift, yb = h[i + 1] + lift;
    const L0 = [ax + nx - ex, ya, az + nz - ez], R0 = [ax - nx - ex, ya, az - nz - ez];
    const L1 = [bx + nx + ex, yb, bz + nz + ez], R1 = [bx - nx + ex, yb, bz - nz + ez];
    const b = pick(chunkAt((ax + bx) / 2, (az + bz) / 2));
    const k = 0.96 + ((i * 7) % 5) * 0.02;
    for (const v of upTri(L0, L1, R0)) { b.pos.push(...v); b.col.push(tc.r * k, tc.g * k, tc.b * k); }
    for (const v of upTri(R0, L1, R1)) { b.pos.push(...v); b.col.push(tc.r * k, tc.g * k, tc.b * k); }
    if (bridge) {
      // Brückenrand
      const rail = new THREE.Color(0x8a8a8a);
      for (const [P, Q] of [[L0, L1], [R0, R1]]) {
        const top = (v) => [v[0], v[1] + 0.8, v[2]];
        for (const v of [...upTriSide(P, Q, top(P)), ...upTriSide(top(P), Q, top(Q))]) { b.pos.push(...v); b.col.push(rail.r, rail.g, rail.b); }
      }
    }
  }
}

// Dreieck so ausrichten, dass es nach oben zeigt
function upTri(a, b, c) {
  const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
  const ny = uz * vx - ux * vz;
  return ny >= 0 ? [a, b, c] : [a, c, b];
}
function upTriSide(a, b, c) { return [a, b, c, a, c, b]; } // beidseitig sichtbar

function dashes(pts, terrain, chunkAt) {
  const p = resample(pts, 3);
  const col = new THREE.Color(C.line);
  for (let i = 0; i < p.length - 1; i += 2) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * 0.08, nz = dx / len * 0.08;
    const ya = terrain.heightAt(ax, az) + 0.16, yb = terrain.heightAt(bx, bz) + 0.16;
    const b = chunkAt(ax, az).roads;
    const A = [ax + nx, ya, az + nz], B = [ax - nx, ya, az - nz], Cc = [bx + nx, yb, bz + nz], D = [bx - nx, yb, bz - nz];
    for (const v of [...upTri(A, Cc, B), ...upTri(B, Cc, D)]) { b.pos.push(...v); b.col.push(col.r, col.g, col.b); }
  }
}

function waterRibbon(pts, width, terrain, chunkAt) {
  if (pts.length < 2) return;
  const p = resample(pts, 5);
  // Wasser fliesst bergab: Höhe darf flussabwärts nicht steigen
  const h = p.map(([x, z]) => {
    let m = Infinity;
    for (const [dx, dz] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) m = Math.min(m, terrain.groundAt(x + dx, z + dz));
    return m + 0.35;
  });
  const hw = width / 2;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * hw, nz = dx / len * hw, ex = dx / len * 0.5, ez = dz / len * 0.5;
    const L0 = [ax + nx - ex, h[i], az + nz - ez], R0 = [ax - nx - ex, h[i], az - nz - ez];
    const L1 = [bx + nx + ex, h[i + 1], bz + nz + ez], R1 = [bx - nx + ex, h[i + 1], bz - nz + ez];
    const arr = chunkAt((ax + bx) / 2, (az + bz) / 2).water;
    for (const v of [...upTri(L0, L1, R0), ...upTri(R0, L1, R1)]) arr.push(...v);
  }
}

function buildTerrainChunk(terrain, x0, z0, step, mat) {
  const res = terrain.res;
  const cells = Math.round(500 / res / step);
  const size = res * step;
  const pos = [], col = [], nor = [];
  const pal = {
    meadow: C.meadow.map((h) => new THREE.Color(h)), rock: C.rock.map((h) => new THREE.Color(h)),
    forest: new THREE.Color(C.forestFloor), scree: new THREE.Color(C.scree), town: new THREE.Color(C.town),
    water: new THREE.Color(C.waterBed), snow: new THREE.Color(C.snow),
  };
  const H = (x, z) => (terrain.groundAt || terrain.heightAt).call(terrain, x, z);
  const c = new THREE.Color(), c2 = new THREE.Color();
  // Farbe und Normale pro Eckpunkt (weiche Übergänge)
  const vert = (x, z) => {
    const y = H(x, z);
    const d = 6;
    const nx = H(x - d, z) - H(x + d, z), nz = H(x, z - d) - H(x, z + d), ny = 2 * d;
    const l = Math.hypot(nx, ny, nz);
    const slope = 1 - ny / l; // 0 = flach
    const land = terrain.landAt(x, z);
    const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
    const big = 0.5 + 0.5 * Math.sin(x * 0.013 + Math.cos(z * 0.011) * 2); // grosse Farbflecken
    if (land === LAND.FOREST) c.copy(pal.forest);
    else if (land === LAND.SCREE) c.copy(pal.scree);
    else if (land === LAND.WATER) c.copy(pal.water);
    else if (land === LAND.TOWN) c.copy(pal.town);
    else if (land === LAND.ROCK) c.copy(pal.rock[0]);
    else c.copy(pal.meadow[0]).lerp(pal.meadow[1], big).lerp(pal.meadow[2], hash * 0.3);
    // steile Hänge werden felsig
    const rockMix = Math.min(1, Math.max(0, (slope - 0.22) * 4));
    if (rockMix > 0) c.lerp(c2.copy(pal.rock[hash < 0.5 ? 0 : 1]), rockMix);
    if (y > 2200) c.lerp(pal.snow, Math.min(1, (y - 2200) / 150) * (1 - rockMix));
    const k = 0.94 + hash * 0.1;
    return [x, y, z, nx / l, ny / l, nz / l, c.r * k, c.g * k, c.b * k];
  };
  const verts = [];
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) verts.push(vert(x0 + i * size, z0 + j * size));
  const V = (i, j) => verts[j * (cells + 1) + i];
  const put = (v) => { pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); col.push(v[6], v[7], v[8]); };
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      put(V(i, j)); put(V(i, j + 1)); put(V(i + 1, j));
      put(V(i + 1, j)); put(V(i, j + 1)); put(V(i + 1, j + 1));
    }
  }
  // "Schürze" am Rand, damit zwischen grober und feiner Kachel keine Lücken sichtbar sind
  const skirt = (A, B) => {
    const A2 = A.slice(), B2 = B.slice(); A2[1] -= 25; B2[1] -= 25;
    for (const v of [A, B, A2, A2, B, B2, A, A2, B, A2, B2, B]) put(v);
  };
  for (let k = 0; k < cells; k++) {
    skirt(V(k, 0), V(k + 1, 0)); skirt(V(k, cells), V(k + 1, cells));
    skirt(V(0, k), V(0, k + 1)); skirt(V(cells, k), V(cells, k + 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = new Float32Array(pos.length / 3 * 2);
  for (let i = 0, o = 0; i < pos.length; i += 3, o += 2) { uv[o] = pos[i] * 0.22; uv[o + 1] = pos[i + 2] * 0.22; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

// ---------- Gebäude aus OpenStreetMap ----------
function building(b, terrain, colliders, chunkAt, rng) {
  let pts = toPts(b.p);
  if (pts.length < 3) return null;
  // Umlaufrichtung vereinheitlichen
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; area += x1 * z2 - x2 * z1; }
  if (area < 0) pts = pts.reverse();
  area = Math.abs(area) / 2;
  if (area < 6) return null;

  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  if (Math.abs(cx) > terrain.half - 3 || Math.abs(cz) > terrain.half - 3) return null;

  const ground = pts.map(([x, z]) => terrain.groundAt(x, z));
  const gMin = Math.min(...ground), gMax = Math.max(...ground);
  const t = b.t;
  const small = ['garage', 'garages', 'shed', 'hut', 'carport', 'roof', 'kiosk'].includes(t) || area < 30;
  const isChurch = t === 'church' || t === 'chapel' || b.a === 'place_of_worship';
  let wallH = b.h ? b.h * 0.72 : b.l ? b.l * 2.9 + 0.5 : small ? 3 : ['barn', 'farm_auxiliary', 'stable', 'cowshed'].includes(t) ? 5.5 : area > 400 ? 9 : 6.5;
  if (isChurch) wallH = Math.max(wallH, 11);
  const base = gMin - 0.6;
  const top = gMax + wallH;

  // Hauptrichtung = längste Kante
  let ax = 1, az = 0, best = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    const l = Math.hypot(x2 - x1, z2 - z1);
    if (l > best) { best = l; ax = (x2 - x1) / l; az = (z2 - z1) / l; }
  }
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, z] of pts) {
    const u = (x - cx) * ax + (z - cz) * az, v = -(x - cx) * az + (z - cz) * ax;
    uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
  }
  const ocx = cx + ((uMin + uMax) / 2) * ax - ((vMin + vMax) / 2) * az;
  const ocz = cz + ((uMin + uMax) / 2) * az + ((vMin + vMax) / 2) * ax;
  const L = uMax - uMin, W = vMax - vMin;

  const ch = chunkAt(cx, cz);
  const D = ch.detail;
  const hash = Math.abs(Math.sin(cx * 3.1 + cz * 7.7) * 1000) % 1;
  const isWood = !isChurch && !['apartments', 'commercial', 'retail', 'school', 'industrial', 'public', 'hotel'].includes(t) && hash < 0.55;
  const wallColor = isChurch ? 0xe2dccd : isWood ? C.wood[Math.floor(hash * 30) % 3] : C.plaster[Math.floor(hash * 30) % 3];
  const roofColor = isChurch ? 0x4d4440 : C.roof[Math.floor(hash * 70) % 4];

  // Wände (Steinsockel + Wand)
  const wc = new THREE.Color(wallColor), sc = new THREE.Color(C.stone), win = new THREE.Color(C.window);
  const sockel = Math.min(1.2, wallH * 0.2) + (gMax - gMin);
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
    quadWall(D.stone, x1, z1, x2, z2, base, gMin + sockel, sc);
    quadWall(isWood ? D.wood : D.plaster, x1, z1, x2, z2, gMin + sockel, top, wc);
    // Fenster auf langen Wänden
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (!small && len > 4) {
      const n = Math.floor(len / 3.2);
      const nx = (z2 - z1) / len * 0.05, nz = -(x2 - x1) / len * 0.05; // nach aussen (Umlauf gegen Uhrzeiger)
      const floors = Math.max(1, Math.floor((top - gMin - sockel) / 2.9));
      for (let f = 0; f < floors; f++) {
        const y0 = gMin + sockel + 0.9 + f * 2.9;
        if (y0 + 1.2 > top - 0.3) break;
        for (let k = 0; k < n; k++) {
          const s0 = (k + 0.5) / n - 0.55 / len, s1 = (k + 0.5) / n + 0.55 / len;
          const px1 = x1 + (x2 - x1) * s0 + nx, pz1 = z1 + (z2 - z1) * s0 + nz, px2 = x1 + (x2 - x1) * s1 + nx, pz2 = z1 + (z2 - z1) * s1 + nz;
          quadWall(D.glass, px1, pz1, px2, pz2, y0, y0 + 1.2, win);
          if (isWood || hash > 0.8) {
            const sh = new THREE.Color(C.shutter);
            const w = 0.5 / len;
            quadWall(D.plain, x1 + (x2 - x1) * (s0 - w) + nx, z1 + (z2 - z1) * (s0 - w) + nz, px1, pz1, y0, y0 + 1.2, sh);
            quadWall(D.plain, px2, pz2, x1 + (x2 - x1) * (s1 + w) + nx, z1 + (z2 - z1) * (s1 + w) + nz, y0, y0 + 1.2, sh);
          }
        }
      }
    }
  }

  // Dach
  const rc = new THREE.Color(roofColor);
  const rect = pts.length <= 5 && Math.abs(L * W - area) / area < 0.18;
  if (rect && !['flat'].includes(b.r)) {
    const roofH = Math.min(W * 0.42, 6);
    const ry = Math.atan2(ax, az);
    D.roof.shape(ROOF, ocx, top, ocz, W + 1.6, roofH, L + 1.6, roofColor, ry);
    // ROOF hat den First entlang z (= lange Seite)
  } else {
    // flaches Dach: Grundriss triangulieren
    const shape = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(shape, []);
    for (const [a, b2, c2] of tris) {
      const A = [pts[a][0], top + 0.05, pts[a][1]], B = [pts[b2][0], top + 0.05, pts[b2][1]], Cc = [pts[c2][0], top + 0.05, pts[c2][1]];
      for (const v of upTri(A, B, Cc)) { D.roof.pos.push(...v); D.roof.col.push(rc.r * 0.9, rc.g * 0.9, rc.b * 0.9); }
    }
  }

  // Kirchturm
  if (isChurch && area > 80) {
    const tx = ocx + ax * (L / 2 + 2.2), tz = ocz + az * (L / 2 + 2.2);
    const tg = terrain.heightAt(tx, tz);
    const ry = Math.atan2(ax, az);
    D.plaster.box(tx, tg + 13, tz, 5, 28, 5, 0xe2dccd, ry);
    D.plain.shape(new THREE.SphereGeometry(1, 10, 6), tx, tg + 28.5, tz, 3.2, 3, 3.2, 0x4f6b5c, ry);
    D.plain.shape(new THREE.ConeGeometry(1, 1, 10), tx, tg + 33, tz, 1.4, 6, 1.4, 0x4f6b5c, ry);
    D.plain.box(tx, tg + 22, tz, 5.1, 2, 2, 0x2a2a2a, ry);
    colliders.addOrientedBox(tx, tz, ax, az, 2.5, 2.5, tg - 1, tg + 36);
  }

  if (pts.length <= 5 && Math.abs(L * W - area) / area < 0.05) colliders.addOrientedBox(ocx, ocz, ax, az, L / 2, W / 2, base, top + 3);
  else {
    // unregelmässiger Grundriss: jede Wand einzeln, sonst entstehen unsichtbare Wände neben dem Haus
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const l = Math.hypot(x2 - x1, z2 - z1);
      if (l < 0.05) continue;
      colliders.addOrientedBox((x1 + x2) / 2, (z1 + z2) / 2, (x2 - x1) / l, (z2 - z1) / l, l / 2 + 0.1, 0.3, base, top + 3);
    }
  }
  return { x: cx, z: cz, pts, church: isChurch };
}

function quadWall(b, x1, z1, x2, z2, y0, y1, color) {
  if (y1 <= y0) return;
  const A = [x1, y0, z1], B = [x2, y0, z2], Cc = [x2, y1, z2], D = [x1, y1, z1];
  // Aussenseite: Grundriss gegen den Uhrzeigersinn (von oben, x rechts, z unten)
  for (const v of [A, Cc, B, A, D, Cc]) { b.pos.push(...v); b.col.push(color.r, color.g, color.b); }
}

// Braunvieh, wie es im Muotathal typisch ist (Kopf unten beim Grasen)
function makeCowGeometry() {
  const b = new Builder();
  const body = 0x6e5e50, dark = 0x3e342c, light = 0xb8ab98;
  b.box(0, 1.05, 0, 0.75, 0.75, 1.7, body);
  b.box(0, 1.0, 0.95, 0.6, 0.6, 0.3, body);                 // Brust
  b.box(0, 0.55, 1.25, 0.32, 0.36, 0.5, body, 0);           // Kopf (gesenkt)
  b.shape(UNIT_BOX_REF, 0, 0.62, 1.2, 0.34, 0.34, 0.55, body, 0, 0.8);
  b.box(0, 0.38, 1.47, 0.3, 0.2, 0.14, light);              // Maul
  for (const s of [-1, 1]) {
    b.box(s * 0.22, 0.78, 1.05, 0.22, 0.05, 0.08, light);   // Hörner
    b.box(s * 0.25, 0.35, 0.6, 0.15, 0.7, 0.15, body);      // Beine vorne
    b.box(s * 0.25, 0.35, -0.6, 0.15, 0.7, 0.15, body);     // Beine hinten
    b.box(s * 0.25, 0.04, 0.6, 0.16, 0.08, 0.17, dark);     // Klauen
    b.box(s * 0.25, 0.04, -0.6, 0.16, 0.08, 0.17, dark);
  }
  b.box(0, 0.7, -0.4, 0.3, 0.12, 0.3, 0xc8a8a0);            // Euter
  b.box(0, 0.9, -0.9, 0.06, 0.6, 0.06, dark);               // Schwanz
  b.box(0, 0.72, 0.95, 0.16, 0.2, 0.06, 0x8a7a40);          // Glocke
  return b.build(null, 0.5).geometry;
}

function makeTreeGeometry(detailed) {
  const b = new Builder();
  if (detailed) {
    const trunk = new THREE.CylinderGeometry(0.18, 0.25, 2, 4, 1, true);
    b.shape(trunk, 0, 1, 0, 1, 1, 1, C.bark);
    const cone = new THREE.ConeGeometry(1, 1, 6, 1, true);
    b.shape(cone, 0, 3.6, 0, 2.4, 4.6, 2.4, C.pine2);
    b.shape(cone, 0, 6.2, 0, 1.7, 3.8, 1.7, C.pine);
    b.shape(cone, 0, 8.4, 0, 1.0, 2.6, 1.0, C.pine);
  } else {
    const cone = new THREE.ConeGeometry(1, 1, 5, 1, true);
    b.shape(cone, 0, 5, 0, 2.3, 9.5, 2.3, C.pine2);
  }
  const mesh = b.build(null, 0.9);
  return mesh.geometry;
}

// Grobe Berge ausserhalb des begehbaren Bereichs (nur Kulisse)
function buildBackdrop(info, data, terrain, material) {
  const { n, res, size, baseHeight } = info;
  const half = size / 2, inner = terrain.half;
  const H = (i, j) => {
    const x = -half + i * res, z = -half + j * res;
    if (Math.abs(x) <= inner + 0.01 && Math.abs(z) <= inner + 0.01) return terrain.groundAt(x, z);
    return baseHeight + data[j * n + i] / 10;
  };
  const pos = [], col = [], nor = [];
  const c = new THREE.Color();
  const pal = { meadow: new THREE.Color(0x6c7a46), forest: new THREE.Color(0x3d4630), rock: new THREE.Color(0x8a857b), rock2: new THREE.Color(0x77736b), snow: new THREE.Color(0xe8ecf0) };
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const x0 = -half + i * res, z0 = -half + j * res, x1 = x0 + res, z1 = z0 + res;
      // Zellen im begehbaren Bereich überspringen
      if (x0 >= -inner - 0.01 && x1 <= inner + 0.01 && z0 >= -inner - 0.01 && z1 <= inner + 0.01) continue;
      const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
      for (const [ii, jj] of [[i, j], [i, j + 1], [i + 1, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) {
        const nx = H(Math.max(0, ii - 1), jj) - H(Math.min(n - 1, ii + 1), jj), nz = H(ii, Math.max(0, jj - 1)) - H(ii, Math.min(n - 1, jj + 1));
        const l = Math.hypot(nx, 2 * res, nz);
        nor.push(nx / l, 2 * res / l, nz / l);
      }
      for (const t of [[[x0, h00, z0], [x0, h01, z1], [x1, h10, z0]], [[x1, h10, z0], [x0, h01, z1], [x1, h11, z1]]]) {
        const ys = t.map((v) => v[1]);
        const my = (ys[0] + ys[1] + ys[2]) / 3, steep = (Math.max(...ys) - Math.min(...ys)) / res;
        const hash = Math.abs(Math.sin(t[0][0] * 12.9898 + t[0][2] * 78.233) * 43758.5453) % 1;
        if (my > 2250 + hash * 200 && steep < 0.9) c.copy(pal.snow);
        else if (steep > 0.85 || my > 1900 + hash * 150) c.copy(hash < 0.5 ? pal.rock : pal.rock2);
        else if (my > 1050 + hash * 300 || steep > 0.45) c.copy(pal.forest);
        else c.copy(pal.meadow);
        const k = 0.92 + hash * 0.16;
        for (const v of t) { pos.push(...v); col.push(c.r * k, c.g * k, c.b * k); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  return m;
}

function buildClouds(rng, half, y0) {
  const b = new Builder();
  const blob = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0; k < 26; k++) {
    const x = rng.range(-half * 1.5, half * 1.5), z = rng.range(-half * 1.5, half * 1.5), y = y0 + rng.range(-150, 150);
    for (let p = 0; p < 5; p++) {
      b.shape(blob, x + rng.range(-60, 60), y + rng.range(-12, 12), z + rng.range(-35, 35),
        rng.range(35, 60), rng.range(15, 25), rng.range(25, 45), 0xffffff, rng() * 6);
    }
  }
  return b.build(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9 }));
}

// Leuchtender, halb durchsichtiger Vorhang mit Streifen am Rand der spielbaren Karte
function buildBorder(terrain, e) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 128; y++) {
    const a = Math.pow(1 - y / 128, 1.6);           // unten kräftig, oben ausgeblendet
    for (let x = 0; x < 64; x++) {
      const stripe = ((x + y) >> 4) & 1;
      g.fillStyle = stripe ? `rgba(255,190,60,${0.55 * a})` : `rgba(230,70,40,${0.45 * a})`;
      g.fillRect(x, 127 - y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  const H = 14, step = 8;
  const pos = [], uv = [];
  const corners = [[-e, -e], [e, -e], [e, e], [-e, e], [-e, -e]];
  let u = 0;
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = corners[k], [x1, z1] = corners[k + 1];
    const n = Math.ceil(2 * e / step);
    for (let i = 0; i < n; i++) {
      const ax = x0 + (x1 - x0) * i / n, az = z0 + (z1 - z0) * i / n;
      const bx = x0 + (x1 - x0) * (i + 1) / n, bz = z0 + (z1 - z0) * (i + 1) / n;
      const ay = terrain.groundAt(ax, az) - 1, by = terrain.groundAt(bx, bz) - 1;
      const u0 = u, u1 = u + step / 8; u = u1;
      pos.push(ax, ay, az, bx, by, bz, bx, by + H, bz, ax, ay, az, bx, by + H, bz, ax, ay + H, az);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}
