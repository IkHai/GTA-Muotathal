import * as THREE from 'three';

// Strassennetz: ebene, feste Fahrbahnen mit geglättetem Höhenverlauf und echte Brücken.
// Das Gelände wird unter den Strassen abgesenkt bzw. aufgeschüttet, und terrain.heightAt
// liefert danach auf der Fahrbahn die Strassenhöhe (für Figur, Autos, Verkehr).

const CAR_ROADS = ['primary', 'secondary', 'tertiary', 'trunk', 'unclassified', 'residential', 'living_street', 'service'];
const MAIN = ['primary', 'secondary', 'tertiary', 'trunk', 'unclassified'];
const BUCKET = 8;

export function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return out;
}

// Brücke: gerade zwischen den Enden, in der Mitte nie unter dem Gelände
function bridgeProfile(pts, ground, endH = ground) {
  const g = pts.map(([x, z]) => ground(x, z));
  const n = g.length - 1;
  const a = endH(...pts[0]), b = endH(...pts[n]);
  return g.map((gi, i) => {
    const e = Math.min(i, n - i) * 2;          // Meter bis zum Brückenende
    return Math.max(a + (b - a) * i / n, gi + 0.4 * Math.min(1, e / 6));
  });
}

export function buildRoadNet(roads, terrain) {
  const ground = terrain.heightAt.bind(terrain);   // Gelände ohne Strassen
  // geglättete Geländehöhe: daran hängen alle Strassenenden, so passen Kreuzungen immer zusammen
  const S0 = (x, z) => (ground(x, z) * 2 + ground(x + 5, z) + ground(x - 5, z) + ground(x, z + 5) + ground(x, z - 5)) / 6;
  // an Brückenenden zählt die Uferkrone (höchster Punkt in der Nähe), damit die Brücke nicht absackt
  const bridgeEnds = new Set();
  const key = (x, z) => Math.round(x) + ',' + Math.round(z);
  for (const r of roads) if (r.b && !r.tn && r.p.length >= 4) { bridgeEnds.add(key(r.p[0] / 10, r.p[1] / 10)); bridgeEnds.add(key(r.p[r.p.length - 2] / 10, r.p[r.p.length - 1] / 10)); }
  const S = (x, z) => {
    if (!bridgeEnds.has(key(x, z))) return S0(x, z);
    let m = -Infinity;
    for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) m = Math.max(m, ground(x + dx, z + dz));
    return m + 0.1;
  };
  const grid = new Map();
  const segs = [];
  let lastD = 0;                                 // Abstand zur Fahrbahn beim letzten roadAt-Aufruf
  const ways = [];
  const insert = (w) => {
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [x1, z1] = w.pts[i], [x2, z2] = w.pts[i + 1];
      const s = { x1, z1, x2, z2, h1: w.h[i], h2: w.h[i + 1], hw: w.hw, prio: w.prio, bridge: w.bridge, len2: (x2 - x1) ** 2 + (z2 - z1) ** 2 || 1e-6 };
      segs.push(s);
      (w.segs ||= []).push(s);
      const m = w.hw + 0.5;
      for (let a = Math.floor((Math.min(x1, x2) - m) / BUCKET); a <= Math.floor((Math.max(x1, x2) + m) / BUCKET); a++) {
        for (let b = Math.floor((Math.min(z1, z2) - m) / BUCKET); b <= Math.floor((Math.max(z1, z2) + m) / BUCKET); b++) {
          const k = a * 100003 + b;
          let l = grid.get(k);
          if (!l) grid.set(k, l = []);
          l.push(s);
        }
      }
    }
  };
  const cand = roads.filter((r) => !r.tn && (CAR_ROADS.includes(r.t) || r.b) && r.p.length >= 4)
    .map((r) => ({ r, prio: r.b ? 3 : MAIN.includes(r.t) ? 2 : 1 }))
    .sort((x, y) => y.prio - x.prio || y.r.w - x.r.w);
  // Hauptstrassen zuerst; Nebenstrassen schliessen an deren Höhe an (keine Stufen an Kreuzungen)
  for (const { r, prio } of cand.filter((c) => !c.r.b).concat(cand.filter((c) => c.r.b))) {
    const raw = [];
    for (let i = 0; i < r.p.length; i += 2) raw.push([r.p[i] / 10, r.p[i + 1] / 10]);
    const pts = resample(raw, r.b ? 2 : 4);
    const g = pts.map(([x, z]) => ground(x, z));
    let h;
    if (r.b) h = bridgeProfile(pts, ground, S);
    else {
      const rad = MAIN.includes(r.t) ? 4 : 2;
      h = g.map((_, i) => {
        let s = 0, c = 0;
        for (let k = Math.max(0, i - rad); k <= Math.min(g.length - 1, i + rad); k++) { s += g[k]; c++; }
        return s / c;
      });
      const n = g.length - 1;
      const ta = S(pts[0][0], pts[0][1]), tb = S(pts[n][0], pts[n][1]);
      // Enden exakt auf die Zielhöhe ziehen, Korrektur läuft über max. 16 m aus
      const L = n * 4, ca = ta - h[0], cb = tb - h[n], R = Math.min(16, L);
      for (let i = 0; i <= n; i++) {
        const fa = Math.max(0, 1 - (i * 4) / R), fb = Math.max(0, 1 - ((n - i) * 4) / R);
        h[i] += ca * fa + cb * fb;
      }
    }
    const w = { r, pts, h, hw: r.w / 2, main: MAIN.includes(r.t), bridge: !!r.b, prio };
    ways.push(w);
    insert(w);
  }

  // Strassenhöhe an (x, z) oder NaN. extra = zusätzlicher Rand
  // refY: aktuelle Höhe (Fuss/Rad). Wer deutlich unter einer Brücke ist, fährt darunter durch.
  function roadAt(x, z, extra = 0, skipBridges = false, refY) {
    const l = grid.get(Math.floor(x / BUCKET) * 100003 + Math.floor(z / BUCKET));
    if (!l) return NaN;
    let best = null, bp = -1, bd = Infinity, bh = NaN;
    for (const s of l) {
      if (skipBridges && s.bridge) continue;
      let t = ((x - s.x1) * (s.x2 - s.x1) + (z - s.z1) * (s.z2 - s.z1)) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - s.x1 - (s.x2 - s.x1) * t, dz = z - s.z1 - (s.z2 - s.z1) * t;
      const d = Math.sqrt(dx * dx + dz * dz) - s.hw;
      if (d > extra) continue;
      if (d > 0 && s.bridge) continue;               // neben Brücken keine Böschung
      const h = s.h1 + (s.h2 - s.h1) * t;
      if (s.bridge && refY !== undefined && h - refY > 2.2) continue;   // unter der Brücke
      // auf der Fahrbahn zählt die Priorität, daneben die nächste Strasse
      const p = d <= 0 ? 10 + s.prio : 0;
      if (p > bp || (p === bp && d < bd)) { best = s; bp = p; bd = d; bh = h; }
    }
    lastD = bd;
    return best ? bh : NaN;
  }

  // ---------- Gelände anpassen: Einschnitte und Dämme ----------
  const n = terrain.n, res = terrain.res, half = terrain.half, H = terrain.heights;
  for (const s of segs) {
    if (s.bridge) continue;
    const reach = s.hw + 12;
    const i0 = Math.max(0, Math.floor((Math.min(s.x1, s.x2) - reach + half) / res)), i1 = Math.min(n - 1, Math.ceil((Math.max(s.x1, s.x2) + reach + half) / res));
    const j0 = Math.max(0, Math.floor((Math.min(s.z1, s.z2) - reach + half) / res)), j1 = Math.min(n - 1, Math.ceil((Math.max(s.z1, s.z2) + reach + half) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = -half + i * res, pz = -half + j * res;
      let t = ((px - s.x1) * (s.x2 - s.x1) + (pz - s.z1) * (s.z2 - s.z1)) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.max(0, Math.hypot(px - s.x1 - (s.x2 - s.x1) * t, pz - s.z1 - (s.z2 - s.z1) * t) - s.hw);
      if (d > 12) continue;
      const rh = s.h1 + (s.h2 - s.h1) * t;
      const k = j * n + i;
      // im Dorf flach an die Strasse anschliessen (keine Inseln und Gräben zwischen Strassen)
      const town = terrain.land[k] === 4;
      const maxH = town ? rh - 0.12 + d * 0.22 : rh - 0.25 + d * 0.8;      // Böschung bergseits
      if (H[k] > maxH) H[k] = maxH;
      if (d < (town ? 8 : 4)) {
        const minH = town ? rh - 0.12 - d * 0.22 : rh - 0.25 - d * 0.7;    // Damm talseits
        if (H[k] < minH) H[k] = minH;
      }
    }
  }
  // Nachbessern: nirgends darf Gelände durch die Fahrbahn stossen
  for (let pass = 0; pass < 4; pass++) {
    let fixed = 0;
    for (const s of segs) {
      if (s.bridge) continue;
      const L = Math.sqrt(s.len2), ux = (s.x2 - s.x1) / L, uz = (s.z2 - s.z1) / L;
      for (let a = 0; a <= L; a += 1) {
        const rh = s.h1 + (s.h2 - s.h1) * (a / L);
        for (const off of [-s.hw, 0, s.hw]) {
          const x = s.x1 + ux * a - uz * off, z = s.z1 + uz * a + ux * off;
          const g = ground(x, z);
          if (g > rh - 0.08) {
            const fx = (x + half) / res, fz = (z + half) / res;
            const i = Math.floor(fx), j = Math.floor(fz);
            for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
              const k = Math.min(n - 1, j + dj) * n + Math.min(n - 1, i + di);
              H[k] = Math.min(H[k], rh - 0.25);
            }
            fixed++;
          }
        }
      }
    }
    if (!fixed) break;
  }

  // ab jetzt: auf der Fahrbahn zählt die Strassenhöhe
  terrain.groundAt = ground;
  terrain.roadAt = roadAt;
  terrain.roadWays = ways;
  terrain.heightAt = (x, z, refY) => {
    const r = roadAt(x, z, 5, false, refY);
    const g = ground(x, z);
    if (r !== r) return g;
    if (lastD <= 0) return r;
    // Böschung neben einer erhöhten Strasse (wie gezeichnet, Neigung 1:1.4)
    return Math.max(g, r - (lastD - 0.2) / 1.4);
  };
  return { ways, roadAt };
}

// ---------- Geometrie ----------
const tmpA = new THREE.Color();
function push(b, color, ...verts) {
  tmpA.set(color);
  for (const v of verts) { b.pos.push(v[0], v[1], v[2]); b.col.push(tmpA.r, tmpA.g, tmpA.b); }
}
function quad(b, color, A, B, Cc, D) { push(b, color, A, B, Cc, A, Cc, D); }        // A-B-C-D gegen den Uhrzeigersinn von aussen
function quad2(b, color, A, B, Cc, D) { quad(b, color, A, B, Cc, D); quad(b, color, A, D, Cc, B); }

export function drawRoadNet(net, terrain, chunkAt, colliders, colors) {
  // Gehwege merken: sie zählen danach für terrain.heightAt (man läuft darauf statt hindurch)
  const walks = new Map(), WB = 8;
  const addWalk = (s) => {
    const m = s.wo + 1;
    for (let a = Math.floor((Math.min(s.x1, s.x2) - m) / WB); a <= Math.floor((Math.max(s.x1, s.x2) + m) / WB); a++)
      for (let b = Math.floor((Math.min(s.z1, s.z2) - m) / WB); b <= Math.floor((Math.max(s.z1, s.z2) + m) / WB); b++) {
        const k = a * 100003 + b;
        if (!walks.has(k)) walks.set(k, []);
        walks.get(k).push(s);
      }
  };
  const walkAt = (x, z) => {
    const l = walks.get(Math.floor(x / WB) * 100003 + Math.floor(z / WB));
    if (!l) return NaN;
    for (const s of l) {
      const L2 = (s.x2 - s.x1) ** 2 + (s.z2 - s.z1) ** 2 || 1e-6;
      const t = ((x - s.x1) * (s.x2 - s.x1) + (z - s.z1) * (s.z2 - s.z1)) / L2;
      if (t < 0 || t > 1) continue;
      const px = s.x1 + (s.x2 - s.x1) * t, pz = s.z1 + (s.z2 - s.z1) * t;
      // Seite: Gehweg liegt auf der Seite sgn der Normalen
      const o = ((x - px) * s.nx + (z - pz) * s.nz) * s.sgn;
      if (o >= s.hw - 0.02 && o <= s.wo + 0.02) return s.ya + (s.yb - s.ya) * t;
    }
    return NaN;
  };
  terrain.walkAt = walkAt;
  for (const w of net.ways) {
    const { pts, h, hw, r } = w;
    const color = colors(r.t);
    const lift = w.bridge ? 0.02 : w.main ? 0.07 : 0.05;
    // Gehweg-Eignung je Seite und Stück; nur zusammenhängende Stücke (mind. 3) werden gebaut
    const walkOK = { 1: [], '-1': [] };
    const hasWalk = !w.bridge && hw >= 2 && (w.main || r.t === 'residential' || r.t === 'living_street');
    for (let i = 0; i < pts.length - 1 && hasWalk; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      for (const sgn of [1, -1]) {
        const mx = (ax + bx) / 2 + nx * (hw + 0.9) * sgn, mz = (az + bz) / 2 + nz * (hw + 0.9) * sgn;
        let ok = terrain.landAt(mx, mz) === 4;
        if (ok) { const o = net.roadAt(mx, mz, 0.4); ok = o !== o; }
        if (ok) {
          const ea = net.roadAt(ax + nx * (hw + 1.9) * sgn, az + nz * (hw + 1.9) * sgn, 0.6), eb = net.roadAt(bx + nx * (hw + 1.9) * sgn, bz + nz * (hw + 1.9) * sgn, 0.6);
          ok = ea !== ea && eb !== eb;
        }
        if (ok) ok = terrain.groundAt(mx, mz) - (h[i] + h[i + 1]) / 2 - lift <= 0.5;
        // keine Gehwege, die knapp neben einer anderen, höher/tiefer liegenden Strasse enden (Stufe)
        if (ok) {
          for (const [px, pz, ph] of [[mx, mz, (h[i] + h[i + 1]) / 2], [ax + nx * (hw + 0.9) * sgn, az + nz * (hw + 0.9) * sgn, h[i]], [bx + nx * (hw + 0.9) * sgn, bz + nz * (hw + 0.9) * sgn, h[i + 1]]]) {
            const o = net.roadAt(px + nx * 1.3 * sgn, pz + nz * 1.3 * sgn, 1.6);
            if (o === o && Math.abs(o - ph) > 0.2) ok = false;
          }
        }
        walkOK[sgn][i] = ok;
      }
    }
    const runOK = (sgn, i) => {
      const a = walkOK[sgn];
      if (!a[i]) return false;
      let lo = i, hi = i;
      while (lo > 0 && a[lo - 1]) lo--;
      while (hi < a.length - 1 && a[hi + 1]) hi++;
      return hi - lo + 1 >= 3;
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      const ex = dx / len * 0.25, ez = dz / len * 0.25;
      const ya = h[i] + lift, yb = h[i + 1] + lift;
      const L0 = [ax + nx * hw - ex, ya, az + nz * hw - ez], R0 = [ax - nx * hw - ex, ya, az - nz * hw - ez];
      const L1 = [bx + nx * hw + ex, yb, bz + nz * hw + ez], R1 = [bx - nx * hw + ex, yb, bz - nz * hw + ez];
      const ch = chunkAt((ax + bx) / 2, (az + bz) / 2);
      const k = 0.96 + ((i * 7) % 5) * 0.02;
      const c = new THREE.Color(color).multiplyScalar(k);
      // Fahrbahn (zeigt nach oben)
      quadUp(ch.roads, c, L0, L1, R1, R0);
      // Randlinien auf Hauptstrassen
      if (w.main && hw >= 2.5) {
        for (const side of [1, -1]) {
          const o1 = (hw - 0.35) * side, o2 = (hw - 0.5) * side;
          const P = (x, z, o, y) => [x + nx * o, y + 0.015, z + nz * o];
          quadUp(ch.roads, 0xd8d8cc, P(ax, az, o1, ya), P(bx, bz, o1, yb), P(bx, bz, o2, yb), P(ax, az, o2, ya));
        }
      }
      // Trottoir mit Randstein im Dorf (Landnutzung „Siedlung“), nicht über Kreuzungen
      if (hasWalk) {
        for (const sgn of [1, -1]) {
          if (!runOK(sgn, i)) continue;
          const P = (x, z, o, y) => [x + nx * o * sgn, y, z + nz * o * sgn];
          const ca = ya + 0.13, cb = yb + 0.13, wo = hw + 1.9;
          addWalk({ x1: ax, z1: az, x2: bx, z2: bz, nx, nz, sgn, hw, wo, ya: ca, yb: cb });
          // Randstein: Kante und Oberseite
          const s1 = sgn > 0 ? [P(ax, az, hw, ya), P(bx, bz, hw, yb), P(bx, bz, hw, cb), P(ax, az, hw, ca)] : [P(bx, bz, hw, yb), P(ax, az, hw, ya), P(ax, az, hw, ca), P(bx, bz, hw, cb)];
          push(ch.roads, 0xb4b0a6, s1[0], s1[1], s1[2], s1[0], s1[2], s1[3]);
          push(ch.roads, 0xb4b0a6, s1[0], s1[2], s1[1], s1[0], s1[3], s1[2]);
          quadUp(ch.roads, 0xc2beb4, P(ax, az, hw, ca), P(bx, bz, hw, cb), P(bx, bz, hw + 0.2, cb), P(ax, az, hw + 0.2, ca));
          // Gehweg (etwas heller als die Fahrbahn) mit Fugen alle 4 m
          const k2 = 0.95 + ((i * 3) % 4) * 0.03;
          quadUp(ch.roads, new THREE.Color(0x8e8a84).multiplyScalar(k2), P(ax, az, hw + 0.2, ca), P(bx, bz, hw + 0.2, cb), P(bx, bz, wo, cb), P(ax, az, wo, ca));
          quadUp(ch.roads, 0x6e6a64, P(ax, az, hw + 0.2, ca + 0.003), P(ax + ex * 0.4, az + ez * 0.4, hw + 0.2, ca + 0.003), P(ax + ex * 0.4, az + ez * 0.4, wo, ca + 0.003), P(ax, az, wo, ca + 0.003));
          // Aussenkante bis zum Boden
          const ga = terrain.groundAt(...[P(ax, az, wo, 0)].map((v) => [v[0], v[2]])[0]) - 0.1, gb = terrain.groundAt(...[P(bx, bz, wo, 0)].map((v) => [v[0], v[2]])[0]) - 0.1;
          if (ga < ca || gb < cb) {
            const A = P(ax, az, wo, ca), Bq = P(bx, bz, wo, cb), A2 = P(ax, az, wo, Math.min(ca, ga)), B2 = P(bx, bz, wo, Math.min(cb, gb));
            push(ch.roads, 0x8a867c, A, Bq, B2, A, B2, A2);
            push(ch.roads, 0x8a867c, A, B2, Bq, A, A2, B2);
          }
        }
      }
      if (w.bridge) {
        bridgeSegment(ch.detail.plain, L0, L1, R0, R1, nx, nz, terrain, i, colliders, ax, az, bx, bz, len, h[i], h[i + 1], hw);
      } else {
        // Böschung/Strassenrand bis zum Gelände hinunter, damit die Strasse fest wirkt
        for (const [P, Q, sgn] of [[L0, L1, 1], [R0, R1, -1]]) {
          // im Dorf liegt der feine Boden bündig an der Strasse: keine Böschung
          if (terrain.fine && terrain.fine.inside(P[0], P[2]) && terrain.fine.inside(Q[0], Q[2])) continue;
          const gp = terrain.groundAt(P[0], P[2]), gq = terrain.groundAt(Q[0], Q[2]);
          const hp = P[1] - gp, hq = Q[1] - gq;
          if (hp < 0.12 && hq < 0.12) continue;
          // geneigte Böschung (Damm) nach aussen
          const foot = (V, hh) => {
            const o = Math.max(0, hh) * 1.4 + 0.2;
            const x = V[0] + nx * o * sgn, z = V[2] + nz * o * sgn;
            return [x, terrain.groundAt(x, z) - 0.15, z];
          };
          const Pf = foot(P, hp), Qf = foot(Q, hq);
          push(ch.roads, 0x93a060, P, Q, Qf, P, Qf, Pf);
          push(ch.roads, 0x93a060, P, Qf, Q, P, Pf, Qf);
        }
      }
    }
    // Mittellinie
    if (w.main && r.w >= 6) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1;
        const ux = dx / len, uz = dz / len, nx = -uz * 0.08, nz = ux * 0.08;
        const ch = chunkAt(ax, az);
        for (let a = 0; a + 3 <= len; a += 6) {
          const t0 = a / len, t1 = (a + 3) / len;
          const y0 = h[i] + (h[i + 1] - h[i]) * t0 + lift + 0.015, y1 = h[i] + (h[i + 1] - h[i]) * t1 + lift + 0.015;
          const x0 = ax + dx * t0, z0 = az + dz * t0, x1 = ax + dx * t1, z1 = az + dz * t1;
          quadUp(ch.roads, 0xd8d8cc, [x0 + nx, y0, z0 + nz], [x1 + nx, y1, z1 + nz], [x1 - nx, y1, z1 - nz], [x0 - nx, y0, z0 - nz]);
        }
      }
    }
  }
  const base = terrain.heightAt;
  terrain.heightAt = (x, z, refY) => {
    const wk = walkAt(x, z);
    return wk === wk ? Math.max(wk, base(x, z, refY)) : base(x, z, refY);
  };
}

// Viereck, dessen Vorderseite nach oben zeigt
function quadUp(b, color, A, B, Cc, D) {
  const ux = B[0] - A[0], uz = B[2] - A[2], vx = Cc[0] - A[0], vz = Cc[2] - A[2];
  const up = uz * vx - ux * vz >= 0;
  if (up) push(b, color, A, B, Cc, A, Cc, D); else push(b, color, A, Cc, B, A, D, Cc);
}

const CONCRETE = 0x9c988e, CONCRETE_DARK = 0x7d7a72, RAIL = 0x6f7478;
function bridgeSegment(b, L0, L1, R0, R1, nx, nz, terrain, i, colliders, ax, az, bx, bz, len, ha, hb, hw) {
  const down = (v, d) => [v[0], v[1] - d, v[2]];
  const up = (v, d) => [v[0], v[1] + d, v[2]];
  // Fahrbahnplatte: Seiten und Unterseite
  quad2(b, CONCRETE, L0, L1, down(L1, 0.7), down(L0, 0.7));
  quad2(b, CONCRETE, R0, R1, down(R1, 0.7), down(R0, 0.7));
  quad2(b, CONCRETE_DARK, down(L0, 0.7), down(L1, 0.7), down(R1, 0.7), down(R0, 0.7));
  // Randbord (Brüstung unten) und Geländer
  for (const [P, Q, s] of [[L0, L1, 1], [R0, R1, -1]]) {
    const inset = (v, d) => [v[0] - nx * d * s, v[1], v[2] - nz * d * s];
    quad2(b, CONCRETE, P, Q, up(Q, 0.35), up(P, 0.35));
    quad2(b, CONCRETE, inset(P, 0.3), inset(Q, 0.3), up(inset(Q, 0.3), 0.35), up(inset(P, 0.3), 0.35));
    quad2(b, CONCRETE, up(P, 0.35), up(Q, 0.35), up(inset(Q, 0.3), 0.35), up(inset(P, 0.3), 0.35));
    // Handlauf
    const r0 = up(inset(P, 0.15), 1.05), r1 = up(inset(Q, 0.15), 1.05);
    quad2(b, RAIL, r0, r1, down(r1, 0.08), down(r0, 0.08));
    quad2(b, RAIL, up(inset(P, 0.15), 0.7), up(inset(Q, 0.15), 0.7), up(inset(Q, 0.15), 0.65), up(inset(P, 0.15), 0.65));
    // Pfosten
    const pp = inset(P, 0.15);
    quad2(b, RAIL, [pp[0] - 0.04, pp[1] + 0.35, pp[2] - 0.04], [pp[0] + 0.04, pp[1] + 0.35, pp[2] + 0.04], [pp[0] + 0.04, pp[1] + 1.05, pp[2] + 0.04], [pp[0] - 0.04, pp[1] + 1.05, pp[2] - 0.04]);
    // Kollision: Geländer hält Figur und Autos auf der Brücke
    const cx = (P[0] + Q[0]) / 2, cz = (P[2] + Q[2]) / 2, y = (P[1] + Q[1]) / 2;
    colliders.addOrientedBox(cx, cz, (bx - ax) / len, (bz - az) / len, len / 2 + 0.3, 0.2, y - 0.8, y + 1.1);
  }
  // Pfeiler alle ~12 m, wenn die Brücke hoch genug ist
  if (i % 6 === 3) {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ha + hb) / 2 - 0.7;
    const g = terrain.groundAt(mx, mz);
    if (my - g > 1.5) {
      const w = Math.max(0.6, hw * 0.6);
      const ux = (bx - ax) / len * 0.5, uz = (bz - az) / len * 0.5;
      const c = [
        [mx + nx * w + ux, mz + nz * w + uz], [mx - nx * w + ux, mz - nz * w + uz],
        [mx - nx * w - ux, mz - nz * w - uz], [mx + nx * w - ux, mz + nz * w - uz],
      ];
      for (let k = 0; k < 4; k++) {
        const [x1, z1] = c[k], [x2, z2] = c[(k + 1) % 4];
        quad2(b, CONCRETE_DARK, [x1, g - 1, z1], [x2, g - 1, z2], [x2, my, z2], [x1, my, z1]);
      }
    }
  }
}
