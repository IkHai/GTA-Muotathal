// Kleine runde Karte oben links, gezeichnet aus den echten Kartendaten.
// Oben = Blickrichtung der Kamera, "N" zeigt nach Norden.

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.timer = 0;
    this.half = world.half;
    const size = 800;                 // 1 Pixel = 5 m
    this.scale = size / (world.half * 2);
    const map = document.createElement('canvas');
    map.width = map.height = size;
    const g = map.getContext('2d');
    const t = world.terrain;
    const img = g.createImageData(size, size);
    const colors = [[104, 150, 70], [52, 92, 44], [130, 126, 118], [70, 130, 175], [150, 150, 140], [160, 155, 145]];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = px / this.scale - this.half, z = py / this.scale - this.half;
        const c = colors[t.landAt(x, z)] || colors[0];
        // Schummerung: Hang gegen Nordwesten heller
        const s = (t.heightAt(x - 5, z - 5) - t.heightAt(x + 5, z + 5)) * 0.9;
        const i = (py * size + px) * 4;
        img.data[i] = c[0] + s; img.data[i + 1] = c[1] + s; img.data[i + 2] = c[2] + s; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const toPx = (v) => (v + this.half) * this.scale;
    const line = (p, w, color) => {
      g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      for (let i = 0; i < p.length; i += 2) {
        const x = toPx(p[i] / 10), y = toPx(p[i + 1] / 10);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    };
    for (const w of world.osm.water) line(w.p, Math.max(1, w.w * this.scale), '#3f86b8');
    g.fillStyle = '#b9a184';
    for (const b of world.osm.buildings) {
      g.beginPath();
      for (let i = 0; i < b.p.length; i += 2) {
        const x = toPx(b.p[i] / 10), y = toPx(b.p[i + 1] / 10);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.fill();
    }
    for (const r of world.osm.roads) {
      const big = ['primary', 'secondary', 'tertiary', 'trunk'].includes(r.t);
      if (['path', 'footway', 'steps', 'bridleway'].includes(r.t)) line(r.p, 0.8, 'rgba(240,230,200,.55)');
      else line(r.p, big ? 2.6 : 1.6, big ? '#f1e3b0' : '#e6e1d2');
    }
    this.map = map;
  }

  update(dt, pos, heading, camYaw, cars) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    const ctx = this.ctx, w = this.canvas.width, c = w / 2;
    const zoom = 1.2;
    ctx.save();
    ctx.clearRect(0, 0, w, w);
    ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#3d5236'; ctx.fillRect(0, 0, w, w);
    ctx.translate(c, c);
    ctx.rotate(Math.PI + camYaw);
    ctx.scale(zoom, zoom);
    ctx.drawImage(this.map, -(pos.x + this.half) * this.scale, -(pos.z + this.half) * this.scale);
    ctx.scale(this.scale, this.scale);
    for (const car of cars) {
      if (car.hasDriver) continue;
      ctx.fillStyle = '#f2b632';
      ctx.fillRect(car.x - pos.x - 8, car.z - pos.z - 8, 16, 16);
    }
    ctx.restore();
    // Ziel: gelber Punkt, am Rand festgehalten, wenn es weit weg ist
    if (this.target) {
      const dx = this.target.x - pos.x, dz = this.target.z - pos.z;
      // gleiche Drehung wie die Karte
      const rx = dx * Math.cos(Math.PI + camYaw) - dz * Math.sin(Math.PI + camYaw), ry = dx * Math.sin(Math.PI + camYaw) + dz * Math.cos(Math.PI + camYaw);
      let px = rx * zoom * this.scale, py = ry * zoom * this.scale;
      const l = Math.hypot(px, py), max = c - 10;
      if (l > max) { px *= max / l; py *= max / l; }
      ctx.fillStyle = '#f2c230'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c + px, c + py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(camYaw - heading);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // Norden = -z
    const r = c - 13;
    const nx = c - Math.sin(camYaw) * r, ny = c + Math.cos(camYaw) * r;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText('N', nx, ny); ctx.fillText('N', nx, ny);
  }
}

// Grosse Karte zum Aufklappen (Minikarte antippen oder Taste M). Norden ist oben.
export class BigMap {
  constructor(minimap, world) {
    this.mini = minimap;
    this.world = world;
    this.el = document.getElementById('bigmap');
    this.canvas = document.getElementById('bigmap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.zoom = 1; this.cx = 0; this.cz = 0;
    this.isOpen = false;
    document.getElementById('minimap').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.open(); });
    document.getElementById('bigmap-close').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.close(); });
    for (const b of document.querySelectorAll('#bigmap-zoom div')) {
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.zoom = Math.max(1, Math.min(6, this.zoom * (b.dataset.z === '1' ? 1.6 : 1 / 1.6)));
        this.dirty = true;
      });
    }
    addEventListener('keydown', (e) => { if (e.code === 'KeyM') this.isOpen ? this.close() : this.open(); });
    // Verschieben mit dem Finger
    const pts = new Map();
    this.canvas.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const k = this.metersPerPx();
      this.cx -= (e.clientX - p[0]) * k; this.cz -= (e.clientY - p[1]) * k;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      this.dirty = true;
    });
    const up = (e) => pts.delete(e.pointerId);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  metersPerPx() { return (this.world.half * 2) / (Math.min(innerWidth, innerHeight) * 0.92 * this.zoom); }

  open() {
    this.isOpen = true;
    this.el.classList.add('open');
    this.cx = this.pos ? this.pos.x : 0; this.cz = this.pos ? this.pos.z : 0;
    this.zoom = 1.6;
    this.dirty = true;
  }

  close() { this.isOpen = false; this.el.classList.remove('open'); }

  update(pos, heading, cars) {
    this.pos = pos;
    if (!this.isOpen) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const g = this.ctx, half = this.world.half;
    const k = this.metersPerPx() / dpr;            // Meter pro Canvas-Pixel
    const lim = half;
    this.cx = Math.max(-lim, Math.min(lim, this.cx)); this.cz = Math.max(-lim, Math.min(lim, this.cz));
    const toX = (x) => W / 2 + (x - this.cx) / k, toY = (z) => H / 2 + (z - this.cz) / k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1d2419'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mini.map, toX(-half), toY(-half), 2 * half / k, 2 * half / k);
    g.strokeStyle = 'rgba(240,90,50,.9)'; g.lineWidth = 3 * dpr;
    g.strokeRect(toX(-half + 5), toY(-half + 5), (2 * half - 10) / k, (2 * half - 10) / k);
    // Ortsnamen
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const pl of this.world.places) {
      const big = pl.type === 'village' || pl.type === 'town';
      if (!big && this.zoom < 1.5 && pl.type === 'isolated_dwelling') continue;
      g.font = `${big ? 'bold ' : ''}${(big ? 17 : 12) * dpr}px Arial`;
      g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(0,0,0,.75)'; g.fillStyle = big ? '#fff6d8' : '#f0f0f0';
      g.strokeText(pl.name, toX(pl.x), toY(pl.z)); g.fillText(pl.name, toX(pl.x), toY(pl.z));
    }
    // Autos
    g.fillStyle = '#f2b632';
    for (const c of cars) if (!c.hasDriver) g.fillRect(toX(c.x) - 3 * dpr, toY(c.z) - 3 * dpr, 6 * dpr, 6 * dpr);
    // Ziel
    if (this.target) {
      g.fillStyle = '#f2c230'; g.strokeStyle = '#000'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(toX(this.target.x), toY(this.target.z), 8 * dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // Spieler-Pfeil
    g.save();
    g.translate(toX(pos.x), toY(pos.z));
    g.rotate(Math.PI - heading);
    g.scale(dpr * 1.4, dpr * 1.4);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // Nordpfeil
    g.font = `bold ${16 * dpr}px Arial`; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3 * dpr;
    g.strokeText('N ↑', 40 * dpr, 30 * dpr); g.fillText('N ↑', 40 * dpr, 30 * dpr);
  }
}
