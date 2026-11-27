// Gelände aus echten Höhendaten (siehe data/ und scripts/build-geodata.mjs).
// Raster: n x n Punkte im Abstand res, Zeile 0 = Norden (z = -half).

export class Terrain {
  constructor(meta, heightsU16, landU8) {
    this.size = meta.size;
    this.half = meta.size / 2;
    this.res = meta.res;
    this.n = meta.n;
    this.base = meta.baseHeight;
    this.heights = new Float32Array(this.n * this.n);
    for (let k = 0; k < this.heights.length; k++) this.heights[k] = this.base + heightsU16[k] / 10;
    this.land = landU8;
  }

  h(i, j) {
    const n = this.n;
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    j = j < 0 ? 0 : j >= n ? n - 1 : j;
    return this.heights[j * n + i];
  }

  // Gelände in einem Kreis stark glätten (für ein ebenes, ordentliches Dorf).
  // Innerhalb r0 voll geglättet, bis r1 weich zurück zum Original.
  smoothArea(cx, cz, r0, r1, passes = 8) {
    const n = this.n, res = this.res, half = this.half, H = this.heights;
    const i0 = Math.max(1, Math.floor((cx - r1 - half * 0 + half) / res) - 3), i1 = Math.min(n - 2, Math.ceil((cx + r1 + half) / res) + 3);
    const j0 = Math.max(1, Math.floor((cz - r1 + half) / res) - 3), j1 = Math.min(n - 2, Math.ceil((cz + r1 + half) / res) + 3);
    const orig = new Float32Array(H);
    let cur = new Float32Array(H);
    for (let p = 0; p < passes; p++) {
      const nxt = new Float32Array(cur);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += cur[(j + dj) * n + i + di];
        nxt[j * n + i] = s / 9;
      }
      cur = nxt;
    }
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(-half + i * res - cx, -half + j * res - cz);
      const w = d <= r0 ? 1 : d >= r1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * (d - r0) / (r1 - r0));
      const k = j * n + i;
      H[k] = orig[k] * (1 - w) + cur[k] * w;
    }
  }

  landAt(x, z) {
    const i = Math.round((x + this.half) / this.res), j = Math.round((z + this.half) / this.res);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    return this.land[j * this.n + i];
  }

  // Höhe an beliebiger Stelle. Im Stalden gilt der feine Dorfboden (townground.js).
  heightAt(x, z) {
    if (this.fine && this.fine.inside(x, z)) return this.fine.at(x, z);
    return this.rawHeightAt(x, z);
  }

  // Höhe aus dem groben Raster (gleiche Dreiecksaufteilung wie das gezeichnete Gelände)
  rawHeightAt(x, z) {
    const fx = (x + this.half) / this.res, fz = (z + this.half) / this.res;
    const last = this.n - 2;
    const i = Math.max(0, Math.min(last, Math.floor(fx)));
    const j = Math.max(0, Math.min(last, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const h00 = this.h(i, j), h10 = this.h(i + 1, j), h01 = this.h(i, j + 1), h11 = this.h(i + 1, j + 1);
    if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }
}

export const LAND = { MEADOW: 0, FOREST: 1, ROCK: 2, WATER: 3, TOWN: 4, SCREE: 5 };
