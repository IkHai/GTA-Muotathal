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

  landAt(x, z) {
    const i = Math.round((x + this.half) / this.res), j = Math.round((z + this.half) / this.res);
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return 0;
    return this.land[j * this.n + i];
  }

  // Höhe an beliebiger Stelle (gleiche Dreiecksaufteilung wie das gezeichnete Gelände)
  heightAt(x, z) {
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
