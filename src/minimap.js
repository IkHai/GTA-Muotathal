import { HALF, roadX, riverX } from './terrain.js';

/** Kleine runde Karte oben links. Norden zeigt immer in Blickrichtung der Kamera. */
export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.timer = 0;
    // Karte einmal vorzeichnen (1 Pixel = 2 Meter)
    const size = 320;
    this.scale = size / (HALF * 2);
    const map = document.createElement('canvas');
    map.width = map.height = size;
    const g = map.getContext('2d');
    const t = world.terrain;
    const img = g.createImageData(size, size);
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = px / this.scale - HALF, z = py / this.scale - HALF;
        const h = t.heightAt(x, z);
        let r = 96, gg = 140, b = 70;
        if (h > 95) { r = 235; gg = 238; b = 240; }
        else if (h > 30) { const k = Math.min(1, (h - 30) / 60); r = 96 + 40 * k; gg = 120 - 10 * k; b = 70 + 40 * k; }
        else if (h > 6) { r = 80; gg = 115; b = 60; }
        const i = (py * size + px) * 4;
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const line = (fn, width, color) => {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      for (let z = -HALF; z <= HALF; z += 4) {
        const px = (fn(z) + HALF) * this.scale, py = (z + HALF) * this.scale;
        if (z === -HALF) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
    };
    line(riverX, 5, '#3f86b8');
    line(roadX, 3.5, '#e8e2cf');
    g.fillStyle = '#c9a27a';
    for (const h of world.houses) {
      const s = h.church ? 6 : 4;
      g.fillRect((h.x + HALF) * this.scale - s / 2, (h.z + HALF) * this.scale - s / 2, s, s);
    }
    this.map = map;
  }

  update(dt, pos, heading, camYaw, cars) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1; // 10x pro Sekunde reicht
    const ctx = this.ctx, w = this.canvas.width, c = w / 2;
    const zoom = 1.6;
    ctx.save();
    ctx.clearRect(0, 0, w, w);
    ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#56733f'; ctx.fillRect(0, 0, w, w);
    ctx.translate(c, c);
    // Karte so drehen, dass "vorne" (Blickrichtung) oben ist. Karten-x = Welt-x, Karten-y = Welt-z
    ctx.rotate(Math.PI + camYaw);
    ctx.scale(zoom, zoom);
    ctx.drawImage(this.map, -(pos.x + HALF) * this.scale, -(pos.z + HALF) * this.scale);
    ctx.scale(this.scale, this.scale);
    for (const car of cars) {
      if (car.hasDriver) continue;
      ctx.fillStyle = '#f2b632'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
      ctx.fillRect(car.x - pos.x - 4, car.z - pos.z - 4, 8, 8);
    }
    ctx.restore();
    // Spieler-Pfeil in der Mitte
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(camYaw - heading);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // "N" zeigt talaufwärts (+z)
    const r = c - 13;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText('N', c + Math.sin(camYaw) * r, c - Math.cos(camYaw) * r);
    ctx.fillText('N', c + Math.sin(camYaw) * r, c - Math.cos(camYaw) * r);
  }
}
