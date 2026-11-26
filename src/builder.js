import * as THREE from 'three';

// Sammelt viele einfache Formen mit Farben in EINEM Mesh.
// Das ist auf dem Handy sehr schnell (wenige Zeichenaufrufe).
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
export const ROOF = makeRoof();

// Satteldach: Breite 1 (x), Höhe 1 (y), Tiefe 1 (z)
function makeRoof() {
  const L = [-0.5, 0, -0.5], R = [0.5, 0, -0.5], T = [0, 1, -0.5];
  const L2 = [-0.5, 0, 0.5], R2 = [0.5, 0, 0.5], T2 = [0, 1, 0.5];
  const tris = [L, T, R, L2, R2, T2, L, L2, T, T, L2, T2, R, T, R2, T, T2, R2, L, R, R2, L, R2, L2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return g;
}

export class Builder {
  constructor() { this.pos = []; this.col = []; }

  add(geometry, matrix, color, jitter = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = g.attributes.position;
    tmpC.set(color);
    for (let i = 0; i < p.count; i += 3) {
      // pro Dreieck leicht andere Helligkeit = typischer Low-Poly-Look
      const k = jitter ? 1 + (Math.random() - 0.5) * jitter : 1;
      for (let t = 0; t < 3; t++) {
        tmpV.fromBufferAttribute(p, i + t).applyMatrix4(matrix);
        this.pos.push(tmpV.x, tmpV.y, tmpV.z);
        this.col.push(tmpC.r * k, tmpC.g * k, tmpC.b * k);
      }
    }
  }

  // Form an Position x,y,z (Mitte), Grösse sx,sy,sz, Drehung ry (um y-Achse)
  shape(geometry, x, y, z, sx, sy, sz, color, ry = 0, rx = 0, rz = 0, jitter = 0) {
    tmpE.set(rx, ry, rz, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    this.add(geometry, tmpM, color, jitter);
  }

  box(x, y, z, sx, sy, sz, color, ry = 0, jitter = 0) {
    this.shape(UNIT_BOX, x, y, z, sx, sy, sz, color, ry, 0, 0, jitter);
  }

  build(material, uvScale = 0.4) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(planarUVs(this.pos, uvScale), 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

export const lowPolyMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

// Texturkoordinaten automatisch aus der Lage im Raum (je nach Ausrichtung des Dreiecks)
export function planarUVs(pos, scale) {
  const uv = new Float32Array(pos.length / 3 * 2);
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const ux = pos[i + 3] - ax, uy = pos[i + 4] - ay, uz = pos[i + 5] - az;
    const vx = pos[i + 6] - ax, vy = pos[i + 7] - ay, vz = pos[i + 8] - az;
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    for (let k = 0; k < 3; k++) {
      const x = pos[i + k * 3], y = pos[i + k * 3 + 1], z = pos[i + k * 3 + 2];
      const o = (i / 3 + k) * 2;
      if (ny >= nx && ny >= nz) { uv[o] = x * scale; uv[o + 1] = z * scale; }
      else if (nx >= nz) { uv[o] = z * scale; uv[o + 1] = y * scale; }
      else { uv[o] = x * scale; uv[o + 1] = y * scale; }
    }
  }
  return uv;
}
