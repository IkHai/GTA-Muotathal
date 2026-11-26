import * as THREE from 'three';

// Spielbereich für Kapitel 1: nur rund um den Stalden (nach Nicks Skizze auf der Karte).
// Ausserhalb ist es gesperrt, bis Kapitel 1 geschafft ist. Die Grenze sieht man als
// leuchtenden Vorhang in der Welt und als Linie auf den Karten.

const POLY = [
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
    const H = 45;
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
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const cg = c.getContext('2d');
    const gr = cg.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgba(255,90,40,0.75)'); gr.addColorStop(0.15, 'rgba(255,90,40,0.35)'); gr.addColorStop(1, 'rgba(255,90,40,0)');
    cg.fillStyle = gr; cg.fillRect(0, 0, 4, 64);
    const tex = new THREE.CanvasTexture(c);
    this.wall = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
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

  setActive(on) { this.active = on; this.wall.visible = on; }

  // Grenze und abgedunkeltes Aussen auf einer Karte zeichnen. tx/tz: Welt -> Karte
  draw(g, tx, tz, lw, big) {
    if (!this.active) return;
    g.save();
    g.beginPath();
    const huge = 1e5;
    g.moveTo(-huge, -huge); g.lineTo(huge, -huge); g.lineTo(huge, huge); g.lineTo(-huge, huge); g.closePath();
    this.poly.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
    g.closePath();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fill('evenodd');
    g.beginPath();
    this.poly.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z))));
    g.closePath();
    g.strokeStyle = 'rgba(255,90,40,0.95)'; g.lineWidth = lw; g.stroke();
    if (big) {
      g.font = `bold ${lw * 5}px Arial`; g.fillStyle = 'rgba(255,200,170,0.9)'; g.textAlign = 'center';
      g.fillText('Kapitel 1: nur hier', tx(1500), tz(-420));
    }
    g.restore();
  }
}
