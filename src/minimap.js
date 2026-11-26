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
