// Einfache Kollisionen: Kreise (Bäume, Felsen) und Kisten (Häuser).
// Ein Gitter sorgt dafür, dass nur Hindernisse in der Nähe geprüft werden.

const BUCKET = 16;

export class Colliders {
  constructor() { this.map = new Map(); this.boxes = []; }

  _key(i, j) { return i * 10007 + j; }

  _insert(item, minX, maxX, minZ, maxZ) {
    for (let i = Math.floor(minX / BUCKET); i <= Math.floor(maxX / BUCKET); i++) {
      for (let j = Math.floor(minZ / BUCKET); j <= Math.floor(maxZ / BUCKET); j++) {
        const k = this._key(i, j);
        let list = this.map.get(k);
        if (!list) { list = []; this.map.set(k, list); }
        list.push(item);
      }
    }
  }

  addCircle(x, z, r) {
    const c = { type: 0, x, z, r };
    this._insert(c, x - r, x + r, z - r, z + r);
    return c;
  }

  // Achsenparallele Kiste. bottom/top = Höhe unten/oben
  addBox(minX, maxX, minZ, maxZ, bottom, top) {
    const b = { type: 1, minX, maxX, minZ, maxZ, bottom, top };
    this.boxes.push(b);
    this._insert(b, minX, maxX, minZ, maxZ);
  }

  // Box um Mitte mit Drehung 0 oder 90 Grad
  addBoxCentered(x, z, w, d, bottom, top, rotated = false) {
    if (rotated) [w, d] = [d, w];
    this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, bottom, top);
  }

  // Gedrehte Kiste (z.B. Haus aus OpenStreetMap). ax/az = Richtung der langen Seite (Länge 1)
  addOrientedBox(cx, cz, ax, az, halfU, halfV, bottom, top) {
    const b = { type: 2, cx, cz, ax, az, hu: halfU, hv: halfV, bottom, top };
    const r = Math.hypot(halfU, halfV);
    this._insert(b, cx - r, cx + r, cz - r, cz + r);
  }

  near(x, z, r) {
    const out = new Set();
    for (let i = Math.floor((x - r) / BUCKET); i <= Math.floor((x + r) / BUCKET); i++) {
      for (let j = Math.floor((z - r) / BUCKET); j <= Math.floor((z + r) / BUCKET); j++) {
        const list = this.map.get(this._key(i, j));
        if (list) for (const it of list) out.add(it);
      }
    }
    return out;
  }

  /**
   * Schiebt einen Kreis (Figur) aus Hindernissen heraus.
   * feetY: Fusshöhe. Kisten, auf denen man steht, blockieren nicht.
   * Gibt {x, z, hit} zurück.
   */
  resolve(x, z, r, feetY, stepHeight = 0.35, headroom = 1.8) {
    let hit = false;
    for (const it of this.near(x, z, r + 1)) {
      if (it.dead) continue;   // z.B. umgefahrene Laterne
      if (it.type === 0) {
        const dx = x - it.x, dz = z - it.z;
        const min = r + it.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          x = it.x + dx / d * min;
          z = it.z + dz / d * min;
          hit = true;
        }
      } else if (it.type === 2) {
        if (feetY >= it.top - stepHeight || feetY + headroom < it.bottom) continue;
        // in die lokalen Achsen der Kiste umrechnen
        const px = x - it.cx, pz = z - it.cz;
        let u = px * it.ax + pz * it.az, v = -px * it.az + pz * it.ax;
        const cu = Math.max(-it.hu, Math.min(u, it.hu)), cv = Math.max(-it.hv, Math.min(v, it.hv));
        const du = u - cu, dv = v - cv;
        const d2 = du * du + dv * dv;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          u = cu + du / d * r; v = cv + dv / d * r;
        } else {
          const pu = it.hu + r - Math.abs(u), pv = it.hv + r - Math.abs(v);
          if (pu < pv) u = Math.sign(u || 1) * (it.hu + r); else v = Math.sign(v || 1) * (it.hv + r);
        }
        x = it.cx + u * it.ax - v * it.az;
        z = it.cz + u * it.az + v * it.ax;
      } else {
        if (feetY >= it.top - stepHeight || feetY + headroom < it.bottom) continue;
        const cx = Math.max(it.minX, Math.min(x, it.maxX));
        const cz = Math.max(it.minZ, Math.min(z, it.maxZ));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = cx + dx / d * r;
            z = cz + dz / d * r;
          } else {
            // Mitte steckt in der Kiste: kürzester Weg hinaus
            const pushes = [it.minX - r - x, it.maxX + r - x, it.minZ - r - z, it.maxZ + r - z];
            let best = 0;
            for (let k = 1; k < 4; k++) if (Math.abs(pushes[k]) < Math.abs(pushes[best])) best = k;
            if (best < 2) x += pushes[best]; else z += pushes[best];
          }
        }
      }
    }
    return { x, z, hit };
  }

  // Höchste Kisten-Oberfläche unter einem Punkt, auf die man treten kann
  supportAt(x, z, r, feetY, stepHeight = 0.35) {
    let best = -Infinity;
    for (const it of this.near(x, z, r)) {
      if (it.type !== 1) continue;
      if (x < it.minX - r * 0.5 || x > it.maxX + r * 0.5 || z < it.minZ - r * 0.5 || z > it.maxZ + r * 0.5) continue;
      if (feetY >= it.top - stepHeight && it.top > best) best = it.top;
    }
    return best;
  }

  // Ist ein Punkt in einer Kiste? (für die Kamera)
  insideBox(x, y, z) {
    for (const it of this.near(x, z, 0.5)) {
      if (it.type === 1 && x > it.minX && x < it.maxX && z > it.minZ && z < it.maxZ && y > it.bottom && y < it.top) return true;
      if (it.type === 2 && y > it.bottom && y < it.top) {
        const px = x - it.cx, pz = z - it.cz;
        if (Math.abs(px * it.ax + pz * it.az) < it.hu && Math.abs(-px * it.az + pz * it.ax) < it.hv) return true;
      }
    }
    return false;
  }
}
