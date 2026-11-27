// Dorfboden für den Stalden: ein feines 1-m-Höhenraster statt des groben 10-m-Geländes.
//
// Warum: Auf einem 10-m-Raster kann der Boden weder bündig an einen Randstein anschliessen
// noch unter einem Haus eben sein. Früher entstanden dadurch Inseln zwischen den Strassen,
// olivgrüne Böschungsstreifen und Sockel/Podeste, die Höhenunterschiede überbrücken mussten.
//
// Regeln:
// 1. Neben jeder Strasse liegt der Boden auf Gehweghöhe (Strasse + 18 cm), zwischen Strassen
//    wird weich zwischen deren Höhen gemittelt. Keine Inseln, keine Gräben.
// 2. Unter jedem eigenen Gebäude („Pad“) ist der Boden exakt eben auf Höhe des Gehwegs vor
//    der Haustür. Davor läuft er bis zum Gehweg aus. Kein Sockel, kein Podest nötig.
// 3. Am Rand des Bereichs geht der Boden exakt ins grobe Gelände über (keine Kante).
import * as THREE from 'three';

const STEP = 1;

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// rect: { x0, z0, x1, z1 } auf das 10-m-Raster ausgerichtet
// pads: [{ F, ramp }] Gebäude-Rahmen aus frameFromFootprint
export function buildTownGround(terrain, rivers, rect, pads) {
  const { x0, z0, x1, z1 } = rect;
  const nx = Math.round((x1 - x0) / STEP), nz = Math.round((z1 - z0) / STEP);
  const raw = (x, z) => terrain.rawHeightAt(x, z);
  // Strassen in der Nähe (ohne Brücken)
  const segs = [];
  for (const w of terrain.roadWays) {
    if (w.bridge) continue;
    const C = (w.main ? 0.07 : 0.05) + 0.13;      // Oberkante Gehweg über der Fahrbahnachse
    for (const s of w.segs) {
      if (Math.max(s.x1, s.x2) < x0 - 50 || Math.min(s.x1, s.x2) > x1 + 50 || Math.max(s.z1, s.z2) < z0 - 50 || Math.min(s.z1, s.z2) > z1 + 50) continue;
      segs.push({ ...s, C });
    }
  }
  // Höhe ohne Gebäude: aus den Strassen gemittelt
  const streetLevel = (x, z) => {
    let sw = 0, sh = 0, dmin = Infinity, onH = NaN, onP = -1, onD = 0, onL = 0.05;
    for (const s of segs) {
      let t = ((x - s.x1) * (s.x2 - s.x1) + (z - s.z1) * (s.z2 - s.z1)) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dist = Math.hypot(x - s.x1 - (s.x2 - s.x1) * t, z - s.z1 - (s.z2 - s.z1) * t) - s.hw;
      const rh = s.h1 + (s.h2 - s.h1) * t;
      if (dist <= 0 && s.prio > onP) { onP = s.prio; onH = rh; onD = dist; onL = s.C - 0.13; }
      if (dist < dmin) dmin = dist;
      const d = Math.max(0, dist);
      if (d > 60) continue;
      const w = 1 / (d + 1) ** 8;        // die nächste Strasse bestimmt fast allein (Gehweg bündig)
      sw += w; sh += w * (rh + s.C);
    }
    return { S: sw ? sh / sw : NaN, dmin, onH, onD, onL };
  };
  // Gebäude-Pads: lokaler Abstand zum Grundriss
  const padInfo = pads.map(({ F, ramp, id }) => {
    const [cx, cz] = F.toWorld(0, -0.8);
    return { F, ramp, id, level: streetLevel(cx, cz).S, c: Math.cos(F.rotY), s: Math.sin(F.rotY) };
  });
  const local = (p, x, z) => {
    const dx = x - p.F.fx, dz = z - p.F.fz;
    return [dx * p.c - dz * p.s, dx * p.s + dz * p.c];    // Umkehrung von toWorld
  };
  const W = nx + 1;
  const H = new Float32Array(W * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * STEP, z = z0 + j * STEP;
    const o = raw(x, z);
    const { S, dmin, onH, onD, onL } = streetLevel(x, z);
    let v;
    // unter der Fahrbahn: am Rand knapp unter dem Belag (keine Rinne neben der Strasse), innen tiefer
    if (onH === onH) v = onH + onL - 0.03 + Math.min(0, onD + 1) * 0.4;
    else {
      v = S === S ? S : o;
      // am Fahrbahnrand bündig (nichts stösst durch den Belag), weich übergehend in die Umgebung
      if (dmin < 1.5 && onH !== onH) {
        let near = NaN, bd = Infinity;
        for (const s of segs) {
          let t = ((x - s.x1) * (s.x2 - s.x1) + (z - s.z1) * (s.z2 - s.z1)) / s.len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(x - s.x1 - (s.x2 - s.x1) * t, z - s.z1 - (s.z2 - s.z1) * t) - s.hw;
          if (d < bd) { bd = d; near = s.h1 + (s.h2 - s.h1) * t; }
        }
        const e = near + 0.04;
        if (v > e) v = e + (v - e) * smooth(0, 1.5, bd);
      }
      // weit weg von Strassen: zurück zum Gelände
      v = v + (o - v) * smooth(30, 55, dmin);
      // Gebäude-Pads (eben) mit Auslauf
      let bw = 0, sl = 0, sw4 = 0;
      for (const p of padInfo) {
        const [lx, lz] = local(p, x, z);
        const hw = p.F.width / 2 + 0.4;
        const ex = Math.max(0, Math.abs(lx) - hw), ezF = Math.max(0, -0.4 - lz), ezB = Math.max(0, lz - p.F.depth - 0.4);
        const e = Math.hypot(ex, ezF + ezB);
        const ramp = ezF > 0 && ex < 0.5 ? p.ramp : 8;
        let w = 1 - smooth(0, ramp, e);
        if (e > 0) {
          // ausserhalb des Hauses gewinnt der Gehweg an seiner Aussenkante (bündig, keine Stufe)
          w *= smooth(1.95, 3.2, dmin);
          // liegt eine andere Strasse tiefer/höher als der Bauplatz, gewinnt sie an ihrem Rand
          if (Math.abs(p.level - v) > 0.3) w *= smooth(0, 6, dmin);
        }
        if (w <= 0) continue;
        bw = Math.max(bw, w);
        // zwei Bauplätze nebeneinander: weich zwischen ihren Höhen (keine Stufe in der Gasse)
        const w4 = w ** 4;
        sl += w4 * p.level; sw4 += w4;
      }
      if (bw > 0) v = v + (sl / sw4 - v) * bw;
    }
    // Fluss: dort bleibt das Gelände, wie es ist
    if (rivers && rivers.at) {
      const r = rivers.at(x, z);
      if (r && r.e < 40) v = o + (v - o) * smooth(18, 40, r.e);
    }
    // Rand des Bereichs: exakt ins grobe Gelände
    const db = Math.min(x - x0, x1 - x, z - z0, z1 - z);
    H[j * W + i] = o + (v - o) * smooth(0, 22, db);
  }
  const fine = {
    x0, z0, x1, z1, nx, nz, H,
    inside: (x, z) => x > x0 && x < x1 && z > z0 && z < z1,
    // gleiche Dreiecksaufteilung wie das gezeichnete Netz
    at(x, z) {
      const fx = (x - x0) / STEP, fz = (z - z0) / STEP;
      const i = Math.max(0, Math.min(nx - 1, Math.floor(fx))), j = Math.max(0, Math.min(nz - 1, Math.floor(fz)));
      const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
      const h00 = H[j * W + i], h10 = H[j * W + i + 1], h01 = H[(j + 1) * W + i], h11 = H[(j + 1) * W + i + 1];
      if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
      return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
    },
    pads: padInfo.map((p) => ({ id: p.id, level: p.level, x: p.F.ox, z: p.F.oz })),
  };
  terrain.fine = fine;
  return fine;
}

// Höhe des ebenen Bodens unter einem eigenen Gebäude (oder NaN)
export function padLevel(terrain, x, z) {
  const f = terrain.fine;
  if (!f) return NaN;
  for (const p of f.pads) if (Math.hypot(p.x - x, p.z - z) < 1) return p.level;
  return NaN;
}

// Netz des feinen Bodens, eingefärbt mit derselben Funktion wie das grobe Gelände
export function townGroundMesh(fine, colorAt, mat) {
  const { x0, z0, nx, nz, H } = fine;
  const W = nx + 1;
  const pos = [], nor = [], col = [];
  const verts = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * STEP, z = z0 + j * STEP, y = H[j * W + i];
    const hx0 = H[j * W + Math.max(0, i - 1)], hx1 = H[j * W + Math.min(nx, i + 1)];
    const hz0 = H[Math.max(0, j - 1) * W + i], hz1 = H[Math.min(nz, j + 1) * W + i];
    const n = new THREE.Vector3(hx0 - hx1, 2 * STEP, hz0 - hz1).normalize();
    const c = colorAt(x, z, y);
    verts.push([x, y, z, n.x, n.y, n.z, c[0], c[1], c[2]]);
  }
  const V = (i, j) => verts[j * W + i];
  const put = (v) => { pos.push(v[0], v[1], v[2]); nor.push(v[3], v[4], v[5]); col.push(v[6], v[7], v[8]); };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    put(V(i, j)); put(V(i, j + 1)); put(V(i + 1, j));
    put(V(i + 1, j)); put(V(i, j + 1)); put(V(i + 1, j + 1));
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

// Belag (Asphalt, Pflaster), der exakt dem Boden folgt: Rechteck im lokalen Rahmen eines
// Gebäudes (x quer, z von der Front weg ins Haus; negative z = vor dem Haus).
// Liefert ein Mesh in Weltkoordinaten. Ränder sind gerade, nichts steht vor oder schwebt.
const tmpC = new THREE.Color();
export function drapeRect(terrain, F, x0, x1, z0, z1, color, opt = {}) {
  const lift = opt.lift ?? 0.025, step = opt.step ?? 0.5;
  const nx = Math.max(1, Math.ceil((x1 - x0) / step)), nz = Math.max(1, Math.ceil((z1 - z0) / step));
  const pos = [], col = [];
  if (opt.paved !== false) (terrain.pavedRects ||= []).push({ F, x0, x1, z0, z1 });
  ensurePaved(terrain);
  const P = (i, j) => {
    const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz;
    const [wx, wz] = F.toWorld(x, z);
    return [wx, terrain.heightAt(wx, wz) + lift, wz, x, z];
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
    if (opt.clip && [a, b, c, d].some((v) => opt.clip(v[0], v[2]))) continue;
    const cc = typeof color === 'function' ? color((a[3] + c[3]) / 2, (a[4] + c[4]) / 2) : color;
    tmpC.set(cc);
    for (const v of [a, d, c, a, c, b]) { pos.push(v[0], v[1], v[2]); col.push(tmpC.r, tmpC.g, tmpC.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // nach oben zeigend? sonst umdrehen
  if (g.attributes.normal.getY(0) < 0) {
    for (let k = 0; k < pos.length; k += 9) for (let q = 0; q < 3; q++) { const t = pos[k + 3 + q]; pos[k + 3 + q] = pos[k + 6 + q]; pos[k + 6 + q] = t; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
  }
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  return m;
}

// Vorplatz vor einem Gebäude: von der Fassade bis exakt an den Gehweg bzw. die Strasse.
// Jede Spalte endet genau dort, wo Gehweg/Strasse beginnt (gerade Kante statt Treppchen).
export function forecourt(terrain, F, x0, x1, depth, color) {
  const blocked = (x, z) => {
    const [wx, wz] = F.toWorld(x, z);
    const r = terrain.roadAt(wx, wz, 0); if (r === r) return true;
    if (terrain.walkAt) { const w = terrain.walkAt(wx, wz); if (w === w) return true; }
    return false;
  };
  const edge = (x) => {                     // wie weit vor die Fassade (negativ)
    let z = 0;
    while (z > -depth && !blocked(x, z - 0.05)) z -= 0.05;
    return z;
  };
  const cw = 0.4, nx = Math.max(1, Math.ceil((x1 - x0) / cw));
  const xs = [], zs = [];
  for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx; xs.push(x); zs.push(edge(x)); }
  const pos = [], col = [], lift = 0.012;
  const V = (x, z) => { const [wx, wz] = F.toWorld(x, z); return [wx, terrain.heightAt(wx, wz) + lift, wz, x, z]; };
  for (let i = 0; i < nx; i++) {
    const za = zs[i], zb = zs[i + 1];
    if (za > -0.05 && zb > -0.05) continue;
    const rows = Math.max(1, Math.ceil(Math.max(-za, -zb) / 0.4));
    for (let j = 0; j < rows; j++) {
      const t0 = j / rows, t1 = (j + 1) / rows;
      const a = V(xs[i], za * (1 - t0)), b = V(xs[i + 1], zb * (1 - t0)), c = V(xs[i + 1], zb * (1 - t1)), d = V(xs[i], za * (1 - t1));
      tmpC.set(typeof color === 'function' ? color((a[3] + c[3]) / 2, (a[4] + c[4]) / 2) : color);
      for (const v of [a, b, c, a, c, d]) { pos.push(v[0], v[1], v[2]); col.push(tmpC.r, tmpC.g, tmpC.b); }
    }
  }
  (terrain.pavedRects ||= []).push({ F, x0, x1, z0: Math.min(...zs), z1: 0.05 });
  ensurePaved(terrain);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  return m;
}
// Pflastersteine: zwei Grautöne im Verband
export const paving = (base = 0x8f8a82) => {
  const a = new THREE.Color(base), b = a.clone().multiplyScalar(0.92), c = a.clone().multiplyScalar(1.05);
  return (x, z) => { const k = (Math.floor(x * 2) + Math.floor(z * 2) * 3) % 3; return k === 0 ? a : k === 1 ? b : c; };
};

function ensurePaved(terrain) {
  terrain.isPaved ||= (x, z) => {
    for (const r of terrain.pavedRects) {
      const c = Math.cos(r.F.rotY), s = Math.sin(r.F.rotY), dx = x - r.F.fx, dz = z - r.F.fz;
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) return true;
    }
    return false;
  };
}
