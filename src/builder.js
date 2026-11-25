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

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
  }
}

export const lowPolyMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
