// Kleine runde Karte oben links, gezeichnet aus den echten Kartendaten.
// Oben = Blickrichtung der Kamera, "N" zeigt nach Norden.

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    // doppelte Auflösung, damit die runde Karte auf dem Handy scharf ist (gezeichnet wird in 140er-Einheiten)
    this.size = canvas.width;
    canvas.width = canvas.height = this.size * 2;
    this.ctx = canvas.getContext('2d');
    this.ctx.scale(2, 2);
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
    // Nur das Gelände kommt als Bild; Wasser, Häuser und Strassen werden als Pfade in Metern
    // gezeichnet, damit die Karte beim Hineinzoomen scharf bleibt.
    this.land = map;
    this.vec = buildVectors(world);
  }

  update(dt, pos, heading, camYaw, cars) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.1;
    const ctx = this.ctx, w = this.size, c = w / 2;
    if (this.indoor) return this.drawIndoor(pos, heading, camYaw);
    const zoom = 1.2;
    ctx.save();
    ctx.clearRect(0, 0, w, w);
    ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#3d5236'; ctx.fillRect(0, 0, w, w);
    ctx.translate(c, c);
    ctx.rotate(Math.PI + camYaw);
    ctx.scale(zoom, zoom);
    ctx.drawImage(this.land, -(pos.x + this.half) * this.scale, -(pos.z + this.half) * this.scale);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-pos.x, -pos.z);
    drawVectors(ctx, this.vec, 1 / (zoom * this.scale), 0.55, pos, 400);
    ctx.translate(pos.x, pos.z);
    if (this.zone) this.zone.draw(ctx, (x) => x - pos.x, (z) => z - pos.z, 2.5 / (zoom * this.scale), false);
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
    this.drawArrow(heading, camYaw);
  }

  // Spielerpfeil und Norden
  drawArrow(heading, camYaw) {
    const ctx = this.ctx, c = this.size / 2;
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

  // Im Haus: Grundriss des Stockwerks, in dem man steht
  drawIndoor(pos, heading, camYaw) {
    const ctx = this.ctx, w = this.size, c = w / 2;
    const S = w / 15;                  // etwa 7 m Radius
    const feet = pos.y, rot = Math.PI + camYaw;
    ctx.save();
    ctx.clearRect(0, 0, w, w);
    ctx.beginPath(); ctx.arc(c, c, c, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#15161a'; ctx.fillRect(0, 0, w, w);
    ctx.translate(c, c);
    ctx.rotate(rot);
    ctx.scale(S, S);
    ctx.translate(-pos.x, -pos.z);
    const plan = this.indoor.plan;
    // Boden
    ctx.fillStyle = '#5d5a52';
    for (const it of plan) if (it[6] === 0 && Math.abs(it[5] - feet) < 0.45 && (it[2] - it[0]) * (it[3] - it[1]) > 1.5) ctx.fillRect(it[0], it[1], it[2] - it[0], it[3] - it[1]);
    // Treppen
    for (const it of plan) {
      if (it[6] !== 1 || it[4] > feet + 1.6 || it[5] < feet - 1.6) continue;
      ctx.fillStyle = '#8f8a7c'; ctx.fillRect(it[0], it[1], it[2] - it[0], it[3] - it[1]);
      ctx.strokeStyle = '#4a473f'; ctx.lineWidth = 0.05; ctx.beginPath();
      for (let z = it[1] + 0.3; z < it[3]; z += 0.3) { ctx.moveTo(it[0], z); ctx.lineTo(it[2], z); }
      ctx.stroke();
    }
    // Wände und Möbel auf Brusthöhe
    ctx.fillStyle = '#e8e2d0'; ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 1.4 / S;
    for (const it of plan) {
      if (it[4] > feet + 1.0 || it[5] < feet + 0.5) continue;
      const thin = Math.min(it[2] - it[0], it[3] - it[1]) < 0.25;
      if (it[6] === 2) { ctx.fillStyle = '#a8a294'; ctx.beginPath(); ctx.arc((it[0] + it[2]) / 2, (it[1] + it[3]) / 2, (it[2] - it[0]) / 2, 0, Math.PI * 2); ctx.fill(); continue; }
      if (it[6] !== 0) continue;
      ctx.fillStyle = thin ? '#e8e2d0' : '#a8a294';
      ctx.fillRect(it[0], it[1], it[2] - it[0], it[3] - it[1]);
      if (thin) ctx.strokeRect(it[0], it[1], it[2] - it[0], it[3] - it[1]);
    }
    ctx.restore();
    // Ziel im gleichen Massstab
    if (this.target) {
      const dx = this.target.x - pos.x, dz = this.target.z - pos.z;
      const rx = dx * Math.cos(rot) - dz * Math.sin(rot), ry = dx * Math.sin(rot) + dz * Math.cos(rot);
      let px = rx * S, py = ry * S;
      const l = Math.hypot(px, py), max = c - 10;
      if (l > max) { px *= max / l; py *= max / l; }
      const other = this.target.y !== undefined && Math.abs(this.target.y - feet) > 1.6;
      ctx.fillStyle = other ? 'rgba(242,194,48,.5)' : '#f2c230'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c + px, c + py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (other) { ctx.fillStyle = '#000'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.target.y > feet ? '▲' : '▼', c + px, c + py + 1); }
    }
    this.drawArrow(heading, camYaw);
    // Stockwerk
    const name = this.indoor.floorName ? this.indoor.floorName(feet, pos.x) : '';
    if (name) {
      ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.fillStyle = '#ffd860';
      ctx.strokeText(name, c, w - 22); ctx.fillText(name, c, w - 22);
    }
  }
}

// Grosse Karte zum Aufklappen (Minikarte antippen oder Taste M). Norden ist oben.
// ---------- Vektorkarte (bleibt beim Hineinzoomen scharf) ----------
const BIG = ['primary', 'secondary', 'tertiary', 'trunk'];
const FOOT = ['path', 'footway', 'steps', 'bridleway', 'cycleway'];
function buildVectors(world) {
  const pathOf = (p, close) => {
    const P = new Path2D();
    for (let i = 0; i < p.length; i += 2) (i ? P.lineTo(p[i] / 10, p[i + 1] / 10) : P.moveTo(p[i] / 10, p[i + 1] / 10));
    if (close) P.closePath();
    return P;
  };
  const bbox = (p) => {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i] / 10); c = Math.max(c, p[i] / 10); b = Math.min(b, p[i + 1] / 10); d = Math.max(d, p[i + 1] / 10); }
    return [a, b, c, d];
  };
  const v = { water: [], buildings: [], roads: { big: new Path2D(), small: new Path2D(), track: new Path2D(), foot: new Path2D() }, names: [] };
  for (const w of world.osm.water) v.water.push({ P: pathOf(w.p), w: Math.max(1.5, w.w || 2) });
  for (const b of world.osm.buildings) v.buildings.push({ P: pathOf(b.p, true), bb: bbox(b.p) });
  const seen = new Set();
  for (const r of world.osm.roads) {
    const kind = BIG.includes(r.t) ? 'big' : FOOT.includes(r.t) ? 'foot' : ['track', 'service'].includes(r.t) ? 'track' : 'small';
    v.roads[kind].addPath(pathOf(r.p));
    // Strassenname am längsten geraden Stück (einmal pro Name und Gegend)
    if (r.n && kind !== 'foot') {
      let best = 0, bi = 0;
      for (let i = 0; i + 3 < r.p.length; i += 2) { const l = Math.hypot(r.p[i + 2] - r.p[i], r.p[i + 3] - r.p[i + 1]); if (l > best) { best = l; bi = i; } }
      const x = (r.p[bi] + r.p[bi + 2]) / 20, z = (r.p[bi + 1] + r.p[bi + 3]) / 20;
      const key = r.n + Math.round(x / 250) + ',' + Math.round(z / 250);
      if (best / 10 > 35 && !seen.has(key)) {
        seen.add(key);
        let a = Math.atan2(r.p[bi + 3] - r.p[bi + 1], r.p[bi + 2] - r.p[bi]);
        if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
        v.names.push({ n: r.n, x, z, a, len: best / 10 });
      }
    }
  }
  return v;
}

// g ist auf Weltmeter eingestellt; k = Meter pro Bildschirmpixel. view/rad: nur Häuser in der Nähe
function drawVectors(g, v, k, px, view, rad) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.setLineDash([]);
  for (const w of v.water) {
    g.strokeStyle = '#3a77a8'; g.lineWidth = Math.max(w.w + 1.2, 2.6 * px * k); g.stroke(w.P);
    g.strokeStyle = '#5b9fd0'; g.lineWidth = Math.max(w.w, 1.4 * px * k); g.stroke(w.P);
  }
  // Häuser, sobald sie gross genug sind
  if (k < 5) {
    g.fillStyle = '#d3c2a4'; g.strokeStyle = '#7d6b52'; g.lineWidth = Math.min(0.7, 1.2 * px * k);
    for (const b of v.buildings) {
      if (view && (b.bb[2] < view.x - rad || b.bb[0] > view.x + rad || b.bb[3] < view.z - rad || b.bb[1] > view.z + rad)) continue;
      g.fill(b.P); if (k < 1.2) g.stroke(b.P);
    }
  }
  const R = v.roads;
  // dunkler Rand, darüber hell (wie ein Stadtplan)
  g.strokeStyle = '#2a2a28';
  g.lineWidth = Math.max(4.2, 3.4 * px * k); g.stroke(R.track);
  g.lineWidth = Math.max(6.2, 4.6 * px * k); g.stroke(R.small);
  g.lineWidth = Math.max(8.6, 6.4 * px * k); g.stroke(R.big);
  g.strokeStyle = '#c7bfa8'; g.lineWidth = Math.max(2.8, 2.0 * px * k); g.stroke(R.track);
  g.strokeStyle = '#efeee8'; g.lineWidth = Math.max(4.8, 3.0 * px * k); g.stroke(R.small);
  g.strokeStyle = '#f5d66e'; g.lineWidth = Math.max(7, 4.6 * px * k); g.stroke(R.big);
  if (k < 2.5) {
    g.strokeStyle = 'rgba(250,244,225,.85)'; g.lineWidth = Math.max(1.1, 1.3 * px * k);
    g.setLineDash([3 * px * k, 3 * px * k]); g.stroke(R.foot); g.setLineDash([]);
  }
}

// Orte mit Symbol (Kreis mit Zeichen und Name daneben)
const ICONS = {
  club: ['#e0388a', '♫'], home: ['#3a8a4a', '⌂'], imbiss: ['#e07a20', '🍴'], shop: ['#7a4ac0', '$'],
  fountain: ['#3a7ac0', '≈'], car: ['#f2b632', '▣'],
};
function drawIcon(g, x, y, id, name, s, showName) {
  const [col, sym] = ICONS[id] || ['#666', '•'];
  g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, 11 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(x, y, 9 * s, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = `bold ${11 * s}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(sym, x, y + 0.5 * s);
  if (showName && name) {
    g.font = `bold ${12 * s}px Arial`; g.textAlign = 'left';
    g.lineWidth = 3 * s; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(name, x + 14 * s, y);
    g.fillStyle = '#fff'; g.fillText(name, x + 14 * s, y);
  }
}

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
        this.zoom = Math.max(1, Math.min(16, this.zoom * (b.dataset.z === '1' ? 1.6 : 1 / 1.6)));
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
    // Kapitel 1: Karte zeigt den Stalden-Ausschnitt, ganz sichtbar
    if (this.zone && this.zone.active) {
      const [x0, z0, x1, z1] = this.zone.bbox();
      this.cx = (x0 + x1) / 2; this.cz = (z0 + z1) / 2;
      const fit = Math.min(innerWidth / (x1 - x0), innerHeight / (z1 - z0)) * 0.9;
      this.zoom = Math.max(1, fit * (this.world.half * 2) / (Math.min(innerWidth, innerHeight) * 0.92));
    }
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
    let lim = [-half, -half, half, half];
    if (this.zone && this.zone.active) lim = this.zone.bbox();
    this.cx = Math.max(lim[0], Math.min(lim[2], this.cx)); this.cz = Math.max(lim[1], Math.min(lim[3], this.cz));
    const toX = (x) => W / 2 + (x - this.cx) / k, toY = (z) => H / 2 + (z - this.cz) / k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1d2419'; g.fillRect(0, 0, W, H);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.mini.land, toX(-half), toY(-half), 2 * half / k, 2 * half / k);
    // Wasser, Häuser, Strassen als Vektoren: bei jedem Zoom scharf
    g.setTransform(1 / k, 0, 0, 1 / k, W / 2 - this.cx / k, H / 2 - this.cz / k);
    const view = { x: this.cx, z: this.cz }, rad = Math.max(W, H) * k;
    drawVectors(g, this.mini.vec, k, dpr, view, rad);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.strokeStyle = 'rgba(240,90,50,.9)'; g.lineWidth = 3 * dpr;
    g.strokeRect(toX(-half + 5), toY(-half + 5), (2 * half - 10) / k, (2 * half - 10) / k);
    const zoneOn = this.zone && this.zone.active;
    const shown = (x, z) => !zoneOn || this.zone.contains(x, z);
    // Strassennamen, wenn man nah genug ist
    if (k < 1.3) {
      g.font = `${11 * dpr}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const n of this.mini.vec.names) {
        if (!shown(n.x, n.z)) continue;
        const sx = toX(n.x), sy = toY(n.z);
        if (sx < -100 || sy < -50 || sx > W + 100 || sy > H + 50) continue;
        if (g.measureText(n.n).width > n.len / k * 1.1) continue;
        g.save(); g.translate(sx, sy); g.rotate(n.a);
        g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(255,255,255,.85)'; g.strokeText(n.n, 0, 0);
        g.fillStyle = '#333'; g.fillText(n.n, 0, 0);
        g.restore();
      }
    }
    if (this.zone) this.zone.draw(g, toX, toY, 3 * dpr, true);
    // Ortsnamen
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const pl of this.world.places) {
      if (!shown(pl.x, pl.z)) continue;
      const big = pl.type === 'village' || pl.type === 'town';
      if (!big && this.zoom < 1.5 && pl.type === 'isolated_dwelling') continue;
      g.font = `${big ? 'bold ' : ''}${(big ? 18 : 12) * dpr}px Arial`;
      g.lineWidth = 4 * dpr; g.strokeStyle = 'rgba(0,0,0,.8)'; g.fillStyle = big ? '#fff6d8' : '#f0f0f0';
      const y = toY(pl.z) - (big && k < 1.5 ? 60 * dpr : 0);
      g.strokeText(pl.name.toUpperCase(), toX(pl.x), y); g.fillText(pl.name.toUpperCase(), toX(pl.x), y);
    }
    // Orte mit Symbol
    const lms = [];
    for (const [id, lm] of Object.entries(this.world.landmarks || {})) {
      if (!lm || !ICONS[id]) continue;
      const x = lm.door ? lm.door.x : lm.x, z = lm.door ? lm.door.z : lm.z;
      if (x === undefined) continue;
      lms.push([id, x, z, lm.name || (id === 'fountain' ? 'Brunnen' : '')]);
    }
    const sc = dpr * Math.min(1.3, Math.max(0.8, 1.4 / Math.sqrt(k)));
    const order = ['club', 'home', 'fountain', 'imbiss', 'shop'];
    lms.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    const used = [];
    g.font = `bold ${12 * sc}px Arial`;
    for (const [id, x, z, name] of lms.slice().reverse()) if (shown(x, z)) drawIcon(g, toX(x), toY(z), id, '', sc, false);
    // Namen nur, wo sie sich nicht überdecken (wichtige zuerst)
    for (const [id, x, z, name] of lms) {
      if (!shown(x, z) || !name) continue;
      const sx = toX(x), sy = toY(z);
      g.font = `bold ${12 * sc}px Arial`;
      const r = [sx - 11 * sc, sy - 11 * sc, sx + 16 * sc + g.measureText(name).width, sy + 11 * sc];
      if (used.some((u) => r[0] < u[2] && r[2] > u[0] && r[1] < u[3] && r[3] > u[1])) continue;
      used.push(r);
      drawIcon(g, sx, sy, id, name, sc, true);
    }
    // Legende
    g.textBaseline = 'middle';
    let ly = H - 20 * dpr - lms.length * 26 * dpr;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(12 * dpr, ly - 18 * dpr, 150 * dpr, lms.length * 26 * dpr + 12 * dpr);
    for (const [id, , , name] of lms) { drawIcon(g, 30 * dpr, ly, id, name, dpr * 0.9, true); ly += 26 * dpr; }
    // Autos
    for (const c of cars) if (!c.hasDriver && shown(c.x, c.z)) drawIcon(g, toX(c.x), toY(c.z), 'car', '', dpr * 0.6, false);
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
