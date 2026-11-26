// Baut die Kartendaten für das Spiel aus echten Geodaten.
//
//  - Gelände: swissALTI3D (swisstopo, 2 m), Ersatz: AWS Terrain Tiles
//  - Strassen, Häuser, Gewässer, Wald, Ortsnamen: OpenStreetMap (Overpass API)
//
// Ergebnis in ../data/:
//   meta.json       Ausschnitt, Raster, Quellen
//   terrain.bin     Höhen (Uint16, Dezimeter über meta.baseHeight), Zeile für Zeile von Nord nach Süd
//   landcover.bin   Bodenart pro Rasterpunkt (Uint8): 0 Wiese, 1 Wald, 2 Fels, 3 Wasser, 4 Siedlung, 5 Geröll
//   osm.json        Strassen, Gebäude, Gewässer, Orte (Koordinaten in Dezimetern)
//
// Koordinaten im Spiel: x = Osten (m), z = Süden (m), Ursprung = Mitte des Ausschnitts.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'data');

// ---------- Ausschnitt ----------
// Mitte: Dorf Muotathal (Kirche St. Sigismund und Walburga, ungefähr)
const CENTER_WGS = { lat: 46.9767, lon: 8.7640 };
const SIZE = 4000;   // Meter (Ost-West und Nord-Süd)
const RES = 10;      // Meter pro Rasterpunkt
const N = SIZE / RES + 1;

// ---------- Schweizer Koordinaten (LV95), Näherungsformeln von swisstopo ----------
export function wgsToLv95(lat, lon) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const E = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const Nn = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return { E, N: Nn };
}
export function lv95ToWgs(E, Nn) {
  const y = (E - 2600000) / 1e6, x = (Nn - 1200000) / 1e6;
  const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
  const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3;
  return { lat: p * 100 / 36, lon: l * 100 / 36 };
}

const c = wgsToLv95(CENTER_WGS.lat, CENTER_WGS.lon);
const E0 = Math.round(c.E / 10) * 10, N0 = Math.round(c.N / 10) * 10;
const minE = E0 - SIZE / 2, maxE = E0 + SIZE / 2, minN = N0 - SIZE / 2, maxN = N0 + SIZE / 2;
const sw = lv95ToWgs(minE - 200, minN - 200), ne = lv95ToWgs(maxE + 200, maxN + 200);
const BBOX = { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon };

const toGame = (lat, lon) => { const p = wgsToLv95(lat, lon); return [p.E - E0, -(p.N - N0)]; };

const log = (...a) => console.log('[geodata]', ...a);

async function fetchRetry(url, opts = {}, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok) return r;
      err = new Error(`${r.status} ${r.statusText} für ${url}`);
      if (r.status === 400) break;
    } catch (e) { err = e; }
    await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
  }
  throw err;
}

// ======================================================================
// Gelände
// ======================================================================
async function terrainSwisstopo() {
  const { fromArrayBuffer } = await import('geotiff');
  const items = [];
  let url = `https://data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissalti3d/items?bbox=${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}&limit=100`;
  while (url) {
    const j = await (await fetchRetry(url)).json();
    items.push(...j.features);
    url = (j.links || []).find((l) => l.rel === 'next')?.href;
  }
  // pro Kachel (1 km) die neueste Ausgabe mit 2 m Auflösung
  const tiles = new Map();
  for (const it of items) {
    const m = it.id.match(/_(\d{4})-(\d{4})$/);
    if (!m) continue;
    const key = `${m[1]}-${m[2]}`;
    const asset = Object.values(it.assets).find((a) => /_2_2056_5728\.tif$/.test(a.href));
    if (!asset) continue;
    const year = Number((it.id.match(/_(\d{4})_/) || [])[1] || 0);
    if (!tiles.has(key) || tiles.get(key).year < year) tiles.set(key, { href: asset.href, year, e: Number(m[1]) * 1000, n: Number(m[2]) * 1000 });
  }
  log(`swissALTI3D: ${tiles.size} Kacheln`);
  if (tiles.size === 0) throw new Error('keine swissALTI3D-Kacheln gefunden');

  const H = new Float32Array(N * N).fill(NaN);
  for (const t of tiles.values()) {
    if (t.e + 1000 < minE || t.e > maxE || t.n + 1000 < minN || t.n > maxN) continue;
    const buf = await (await fetchRetry(t.href)).arrayBuffer();
    const tif = await fromArrayBuffer(buf);
    const img = await tif.getImage();
    const [w, h] = [img.getWidth(), img.getHeight()];
    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    const data = (await img.readRasters({ interleave: true }));
    for (let j = 0; j < N; j++) {
      const nn = maxN - j * RES;
      for (let i = 0; i < N; i++) {
        const ee = minE + i * RES;
        const px = Math.floor((ee - ox) / rx), py = Math.floor((nn - oy) / ry);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        // Mittelwert über 3x3 Pixel (6 m) glättet kleine Unebenheiten
        let s = 0, cnt = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx, yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const v = data[yy * w + xx];
          if (v > -100) { s += v; cnt++; }
        }
        if (cnt) H[j * N + i] = s / cnt;
      }
    }
    log(`  Kachel ${t.e / 1000}-${t.n / 1000} (${t.year}) fertig`);
  }
  return { H, source: 'swissALTI3D © swisstopo' };
}

async function terrainAwsTiles() {
  const { PNG } = await import('pngjs');
  const z = 14;
  const lon2x = (lon) => (lon + 180) / 360 * 2 ** z;
  const lat2y = (lat) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
  const cache = new Map();
  const tile = async (tx, ty) => {
    const k = tx + '/' + ty;
    if (!cache.has(k)) {
      const buf = Buffer.from(await (await fetchRetry(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`)).arrayBuffer());
      cache.set(k, PNG.sync.read(buf));
    }
    return cache.get(k);
  };
  const sample = async (fx, fy) => {
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const png = await tile(tx, ty);
    const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
    const o = (py * 256 + px) * 4;
    return png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768;
  };
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const w = lv95ToWgs(minE + i * RES, maxN - j * RES);
      // bilinear
      const fx = lon2x(w.lon) - 0.5 / 256, fy = lat2y(w.lat) - 0.5 / 256;
      const d = 1 / 256;
      const x0 = Math.floor(fx * 256) / 256, y0 = Math.floor(fy * 256) / 256;
      const u = (fx - x0) / d, v = (fy - y0) / d;
      const a = await sample(x0 + 1e-9, y0 + 1e-9), b = await sample(x0 + d + 1e-9, y0 + 1e-9);
      const c2 = await sample(x0 + 1e-9, y0 + d + 1e-9), e = await sample(x0 + d + 1e-9, y0 + d + 1e-9);
      H[j * N + i] = (a * (1 - u) + b * u) * (1 - v) + (c2 * (1 - u) + e * u) * v;
    }
  }
  return { H, source: 'AWS Terrain Tiles (Mapzen/Tilezen, u.a. SRTM und EU-DEM)' };
}

function fillHoles(H) {
  // Lücken (z.B. fehlende Kachel) mit Nachbarwerten füllen
  for (let pass = 0; pass < 50; pass++) {
    let missing = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (!Number.isNaN(H[k])) continue;
      let s = 0, c3 = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const v = H[jj * N + ii];
        if (!Number.isNaN(v)) { s += v; c3++; }
      }
      if (c3) H[k] = s / c3; else missing++;
    }
    if (!missing) return;
  }
}

// ======================================================================
// OpenStreetMap
// ======================================================================
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

async function fetchOsm() {
  const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  const q = `[out:json][timeout:240];
(
  way["highway"](${b});
  way["building"](${b});
  way["waterway"](${b});
  way["natural"~"^(water|wood|scree|bare_rock|shingle|cliff)$"](${b});
  relation["natural"~"^(water|wood|scree|bare_rock)$"](${b});
  way["landuse"~"^(forest|residential|industrial|commercial|quarry)$"](${b});
  relation["landuse"~"^(forest|residential)$"](${b});
  way["railway"](${b});
  way["aerialway"](${b});
  node["place"](${b});
  node["natural"="peak"](${b});
);
out geom;`;
  let err;
  for (const url of OVERPASS) {
    try {
      const r = await fetchRetry(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 2);
      const j = await r.json();
      log(`OSM: ${j.elements.length} Elemente von ${url}`);
      return j.elements;
    } catch (e) { err = e; log('Overpass-Fehler', url, e.message); }
  }
  throw err;
}

// Ways einer Multipolygon-Relation zu geschlossenen Ringen verbinden
function assembleRings(ways) {
  const rings = [];
  const pool = ways.map((w) => w.slice());
  while (pool.length) {
    let ring = pool.pop();
    let guard = 0;
    while (guard++ < 10000) {
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] === last[0] && first[1] === last[1] && ring.length > 3) break;
      const idx = pool.findIndex((w) => {
        const a = w[0], z = w[w.length - 1];
        return (a[0] === last[0] && a[1] === last[1]) || (z[0] === last[0] && z[1] === last[1]);
      });
      if (idx < 0) break;
      const w = pool.splice(idx, 1)[0];
      if (w[0][0] === last[0] && w[0][1] === last[1]) ring = ring.concat(w.slice(1));
      else ring = ring.concat(w.slice().reverse().slice(1));
    }
    if (ring.length > 3) rings.push(ring);
  }
  return rings;
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bestD = tol;
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const inArea = (pts, margin = 50) => pts.some(([x, z]) => Math.abs(x) < SIZE / 2 + margin && Math.abs(z) < SIZE / 2 + margin);
const dm = (pts) => pts.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function rasterize(grid, poly, value, overwrite = () => true) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const i0 = Math.max(0, Math.floor((minX + SIZE / 2) / RES)), i1 = Math.min(N - 1, Math.ceil((maxX + SIZE / 2) / RES));
  const j0 = Math.max(0, Math.floor((minZ + SIZE / 2) / RES)), j1 = Math.min(N - 1, Math.ceil((maxZ + SIZE / 2) / RES));
  for (let j = j0; j <= j1; j++) {
    const z = -SIZE / 2 + j * RES;
    for (let i = i0; i <= i1; i++) {
      const x = -SIZE / 2 + i * RES;
      const k = j * N + i;
      if (overwrite(grid[k]) && pointInPoly(x, z, poly)) grid[k] = value;
    }
  }
}

function processOsm(elements) {
  const geom = (el) => el.geometry.map((p) => toGame(p.lat, p.lon));
  const roads = [], buildings = [], water = [], places = [], peaks = [], rails = [], lifts = [];
  const areas = []; // [value, ring]
  const ROAD_W = {
    motorway: 10, trunk: 9, primary: 7.5, secondary: 7, tertiary: 6, unclassified: 5, residential: 5,
    living_street: 4.5, service: 3.5, track: 3, path: 1.5, footway: 1.8, cycleway: 2, steps: 1.5, bridleway: 1.5,
  };
  const AREA = { wood: 1, forest: 1, scree: 5, shingle: 5, bare_rock: 2, water: 3, residential: 4, industrial: 4, commercial: 4, quarry: 5 };

  for (const el of elements) {
    const t = el.tags || {};
    if (el.type === 'node') {
      const [x, z] = toGame(el.lat, el.lon);
      if (Math.abs(x) > SIZE / 2 + 1500 || Math.abs(z) > SIZE / 2 + 1500) continue;
      if (t.place && t.name) places.push({ name: t.name, type: t.place, x: Math.round(x), z: Math.round(z) });
      if (t.natural === 'peak' && t.name) peaks.push({ name: t.name, ele: Number(t.ele) || null, x: Math.round(x), z: Math.round(z) });
      continue;
    }
    if (el.type === 'way' && el.geometry) {
      const pts = geom(el);
      if (!inArea(pts)) continue;
      if (t.building) {
        const ring = simplify(pts, 0.3);
        if (ring.length < 4) continue;
        const levels = Number(t['building:levels']) || null;
        const height = Number(String(t.height || '').replace(/[^\d.]/g, '')) || null;
        buildings.push({ p: dm(ring.slice(0, -1)), l: levels, h: height, t: t.building, a: t.amenity || undefined, r: t['roof:shape'] || undefined });
      } else if (t.highway && ROAD_W[t.highway] !== undefined) {
        roads.push({ t: t.highway, w: Number(t.width) || ROAD_W[t.highway], b: t.bridge === 'yes' ? 1 : undefined, tn: t.tunnel === 'yes' ? 1 : undefined, n: t.name || undefined, p: dm(simplify(pts, 0.8)) });
      } else if (t.waterway) {
        if (t.tunnel) continue;
        const w = t.waterway === 'river' ? 14 : t.waterway === 'canal' ? 5 : t.waterway === 'stream' ? 2.5 : 1.5;
        water.push({ t: t.waterway, w: Number(t.width) || w, n: t.name || undefined, p: dm(simplify(pts, 1)) });
      } else if (t.railway && !['abandoned', 'razed', 'proposed'].includes(t.railway)) {
        rails.push({ t: t.railway, p: dm(simplify(pts, 1)) });
      } else if (t.aerialway) {
        lifts.push({ t: t.aerialway, n: t.name || undefined, p: dm(pts) });
      }
      const v = AREA[t.natural] ?? AREA[t.landuse];
      if (v !== undefined && pts.length > 3) areas.push([v, pts]);
    } else if (el.type === 'relation' && el.members) {
      const v = AREA[t.natural] ?? AREA[t.landuse];
      if (v === undefined) continue;
      const outer = el.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry.map((p) => toGame(p.lat, p.lon)));
      const inner = el.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => m.geometry.map((p) => toGame(p.lat, p.lon)));
      for (const ring of assembleRings(outer)) if (inArea(ring, 500)) areas.push([v, ring]);
      for (const ring of assembleRings(inner)) if (inArea(ring, 500)) areas.push([-v, ring]); // Löcher
    }
  }

  // Bodenbedeckung rastern: grosse Flächen zuerst, Siedlung/Wasser/Fels zuletzt
  const land = new Uint8Array(N * N);
  const order = [1, 5, 2, 4, 3];
  for (const val of order) {
    for (const [v, ring] of areas) if (v === val) rasterize(land, ring, val);
    for (const [v, ring] of areas) if (v === -val) rasterize(land, ring, 0, (cur) => cur === val);
  }
  return { roads, buildings, water, places, peaks, rails, lifts, land };
}

// ======================================================================
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  log(`Ausschnitt LV95 E ${minE}-${maxE}, N ${minN}-${maxN} (${SIZE} m, Raster ${RES} m)`);

  let terrain;
  try { terrain = await terrainSwisstopo(); }
  catch (e) { log('swisstopo nicht verfügbar:', e.message, '-> Ersatzdaten'); terrain = await terrainAwsTiles(); }
  const H = terrain.H;
  fillHoles(H);
  let lo = Infinity, hi = -Infinity;
  for (const v of H) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const base = Math.floor(lo) - 1;
  const heights = new Uint16Array(N * N);
  for (let k = 0; k < H.length; k++) heights[k] = Math.round((H[k] - base) * 10);
  log(`Höhen ${lo.toFixed(1)} bis ${hi.toFixed(1)} m`);

  let osm = { roads: [], buildings: [], water: [], places: [], peaks: [], rails: [], lifts: [], land: new Uint8Array(N * N) };
  let osmOk = false;
  if (!process.argv.includes('--no-osm')) {
    osm = processOsm(await fetchOsm());
    osmOk = true;
  }
  const { land, ...features } = osm;

  await fs.writeFile(path.join(OUT, 'terrain.bin'), Buffer.from(heights.buffer));
  await fs.writeFile(path.join(OUT, 'landcover.bin'), Buffer.from(land.buffer));
  await fs.writeFile(path.join(OUT, 'osm.json'), JSON.stringify(features));
  const meta = {
    name: 'Muotathal',
    size: SIZE, res: RES, n: N,
    baseHeight: base, minHeight: lo, maxHeight: hi,
    lv95: { E0, N0, minE, maxE, minN, maxN },
    center: CENTER_WGS,
    created: new Date().toISOString(),
    sources: {
      terrain: terrain.source,
      osm: osmOk ? '© OpenStreetMap-Mitwirkende (ODbL)' : null,
    },
    counts: { roads: features.roads.length, buildings: features.buildings.length, water: features.water.length, places: features.places.length },
  };
  await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
  log('fertig', JSON.stringify(meta.counts));
}

main().catch((e) => { console.error(e); process.exit(1); });
