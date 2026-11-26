import * as THREE from 'three';

// Spielbereich für Kapitel 1: nur rund um den Stalden (nach Nicks Skizze auf der Karte).
// Ausserhalb ist es gesperrt, bis Kapitel 1 geschafft ist. Die Grenze sieht man als
// leuchtenden Vorhang in der Welt und als Linie auf den Karten.

export const POLY = [
  [1995, -486], [1533, -457], [1303, -451], [1153, -336], [1061, -244], [1084, -140], [1130, -60],
  [1182, 33], [1222, 79], [1211, 113], [1165, 206], [1159, 275], [1199, 309], [1361, 292],
  [1533, 321], [1706, 390], [1821, 401], [1960, 344], [1995, 280],
];

export class Zone {
  constructor(scene, world) {
    this.poly = POLY;
    this.active = false;
    this.world = world;
    // Vorhang entlang der Grenze (ohne das Stück am Kartenrand)
    const t = world.terrain, pos = [], uv = [];
    const H = 12;
    for (let i = 0; i < POLY.length - 1; i++) {
      const [ax, az] = POLY[i], [bx, bz] = POLY[i + 1];
      if (ax > 1990 && bx > 1990) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 8));
      for (let k = 0; k < n; k++) {
        const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n;
        const x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
        const y0 = t.heightAt(x0, z0) - 2, y1 = t.heightAt(x1, z1) - 2;
        pos.push(x0, y0, z0, x1, y1, z1, x1, y1 + H, z1, x0, y0, z0, x1, y1 + H, z1, x0, y0 + H, z0);
        uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // Nur in der Nähe sichtbar: Deckkraft fällt mit dem Abstand zum Spieler ab (unter ~6 m voll, ab ~22 m weg)
    this.uniforms = { uPlayer: { value: new THREE.Vector3() }, uTime: { value: 0 } };
    this.wall = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; varying vec3 vW;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uPlayer; uniform float uTime; varying vec2 vUv; varying vec3 vW;
        void main() {
          float d = distance(vW.xz, uPlayer.xz) + max(0.0, abs(vW.y - uPlayer.y) - 3.0) * 0.6;
          float near = 1.0 - smoothstep(6.0, 22.0, d);
          if (near <= 0.001) discard;
          float h = vW.y - uPlayer.y;
          float fall = 1.0 - smoothstep(0.0, 9.0, h);
          float grid = max(step(0.93, fract(vW.y * 0.8 - uTime * 0.4)), step(0.96, fract((vW.x + vW.z) * 0.5)));
          float a = near * (0.16 + 0.5 * grid) * fall + near * 0.35 * (1.0 - smoothstep(0.0, 1.5, abs(h + 0.3)));
          gl_FragColor = vec4(vec3(1.0, 0.36, 0.16) * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    this.wall.frustumCulled = false;
    this.wall.visible = false;
    scene.add(this.wall);
  }

  contains(x, z) {
    const p = this.poly;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, zi] = p[i], [xj, zj] = p[j];
      if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  bbox() {
    if (!this._bb) {
      const xs = this.poly.map((p) => p[0]), zs = this.poly.map((p) => p[1]);
      this._bb = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    }
    return this._bb;
  }

  setActive(on) { this.active = on; this.wall.visible = on; }

  update(px, py, pz, t) { this.uniforms.uPlayer.value.set(px, py, pz); this.uniforms.uTime.value = t; }

  // Grenze und abgedunkeltes Aussen auf einer Karte zeichnen. tx/tz: Welt -> Karte
  draw(g, tx, tz, lw, big) {
    if (!this.active) return;
    g.save();
    g.beginPath();
    const huge = 1e5;
    g.moveTo(-huge, -huge); g.lineTo(huge, -huge); g.lineTo(huge, huge); g.lineTo(-huge, huge); g.closePath();
    this.poly.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
    g.closePath();
    g.fillStyle = big ? 'rgba(12,16,12,0.9)' : 'rgba(10,12,10,0.6)';
    g.fill('evenodd');
    g.beginPath();
    this.poly.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
    g.closePath();
    g.strokeStyle = 'rgba(255,90,40,0.95)'; g.lineWidth = lw; g.stroke();
    if (big) {
      g.font = `bold ${lw * 5}px Arial`; g.fillStyle = 'rgba(255,200,170,0.9)'; g.textAlign = 'center';
      g.fillText('Rest des Tals: nach Kapitel 1', tx(1500), tz(-520));
    }
    g.restore();
  }
}
