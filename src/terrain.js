// Gelände: ein Tal von Süden nach Norden (z-Achse) mit Bergen links und rechts.
// Die Höhe wird genau so berechnet, wie das Gelände gezeichnet wird,
// damit Figur und Auto exakt auf dem Boden stehen.

export const WORLD_SIZE = 640;      // Meter
export const GRID = 128;            // Anzahl Felder pro Seite
export const CELL = WORLD_SIZE / GRID;
export const HALF = WORLD_SIZE / 2;

export const valleyCenter = (z) => 6 * Math.sin(z / 130);
export const roadX = (z) => -6 + 7 * Math.sin(z / 95);
export const riverX = (z) => 27 + 9 * Math.sin(z / 70) + 4 * Math.sin(z / 23);

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function noise(x, z) {
  return Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.043)
    + 0.5 * Math.sin(x * 0.11 + z * 0.07)
    + 0.25 * Math.sin(x * 0.23 - z * 0.19 + 2.0)
    + 0.12 * Math.sin(x * 0.53 + z * 0.41);
}

// Flache Stelle für das Dorf
export const VILLAGE = { minZ: -30, maxZ: 150 };

export function rawHeight(x, z) {
  const d = Math.abs(x - valleyCenter(z));
  const m = Math.max(0, d - 55);
  let h = Math.pow(m, 1.55) * 0.11;                    // Bergflanken
  h += noise(x, z) * (0.35 + Math.min(m, 70) * 0.22);  // Unebenheiten, an den Hängen stärker
  h *= smoothstep(5, 15, Math.abs(x - roadX(z)));      // Strasse bleibt flach

  const dv = Math.abs(x - riverX(z));                  // Flussbett der Muota
  if (dv < 7) {
    const t = 1 - dv / 7;
    h -= 1.7 * t * t * (3 - 2 * t);
  }
  return h;
}

export class Terrain {
  constructor() {
    const n = GRID + 1;
    this.heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        this.heights[j * n + i] = rawHeight(-HALF + i * CELL, -HALF + j * CELL);
      }
    }
  }

  h(i, j) {
    const n = GRID + 1;
    i = Math.max(0, Math.min(GRID, i));
    j = Math.max(0, Math.min(GRID, j));
    return this.heights[j * n + i];
  }

  // Höhe an einer beliebigen Stelle (gleiche Dreiecke wie das gezeichnete Gelände)
  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    const i = Math.max(0, Math.min(GRID - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(GRID - 1, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const h00 = this.h(i, j), h10 = this.h(i + 1, j), h01 = this.h(i, j + 1), h11 = this.h(i + 1, j + 1);
    if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }
}
