import * as THREE from 'three';
import { forecourt, paving, drapeRect } from './townground.js';
import { Builder } from './builder.js';
import { canvasTex, rnd, roofTex, plasterTex, graffitiTex, frameFromFootprint, quad, texMesh, roofMeshes, boxWalls, windowAt, frontSteps } from './handmade.js';

// Weitere Häuser am Stalden nach Nicks Concept Art (eigene Umsetzung, alle Texturen selbst
// gezeichnet, keine echten Marken): Wohnhaus zwischen Imbiss und Club, Kleiderladen
// «Mode Muota» und Imbiss «Stalden One».

// ---------- Texturen ----------
function stoneTex() {
  return canvasTex('stones', 256, 256, (g, w, h) => {
    const r = rnd(5);
    g.fillStyle = '#6c665c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      for (let x = (y / 32) % 2 ? -20 : 0; x < w; x += 40 + r() * 10) {
        const v = 120 + r() * 60;
        g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
        g.beginPath();
        g.roundRect ? g.roundRect(x + 2, y + 2, 36 + r() * 6, 27, 6) : g.rect(x + 2, y + 2, 36, 27);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x + 4, y + 22, 32, 6);
      }
    }
  }, true);
}

function woodTex(key, base) {
  return canvasTex('planks' + key, 256, 256, (g, w, h) => {
    const r = rnd(key.length * 17 + 3);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 21) {
      const v = 0.8 + r() * 0.35;
      g.fillStyle = `rgba(${v > 1 ? 255 : 0},${v > 1 ? 230 : 0},${v > 1 ? 200 : 0},${Math.abs(v - 1) * 0.5})`;
      g.fillRect(x, 0, 21, h);
      g.fillStyle = 'rgba(20,10,5,.55)'; g.fillRect(x + 19, 0, 2, h);
      for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(30,15,5,${r() * 0.2})`; g.fillRect(x + r() * 18, r() * h, 1, 20 + r() * 60); }
    }
  }, true);
}

function boardTex(key, lines, { bg = '#f1ead8', fg = '#9a1f1a', font = 'bold 64px Georgia, serif', w = 1024, h = 160, border = '#5a3b24' } = {}) {
  return canvasTex('board' + key, w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(80,50,20,.18)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.textBaseline = 'middle';
    for (const L of lines) {
      g.font = L.font || font; g.fillStyle = L.color || fg; g.textAlign = L.align || 'center';
      g.fillText(L.text, L.x ?? w / 2, L.y ?? h / 2 + 4, L.max || w - 40);
    }
  });
}

function chalkTex() {
  return canvasTex('chalk', 256, 320, (g, w, h) => {
    g.fillStyle = '#5a3b24'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2522'; g.fillRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#eeeae0'; g.textBaseline = 'middle';
    g.font = 'italic bold 34px Georgia, serif'; g.textAlign = 'center'; g.fillText('Imbiss', w / 2, 42);
    g.font = '24px Georgia, serif';
    const items = [['Bratwurst', '4.50'], ['Cervelat', '3.50'], ['Pommes', '3.50'], ['Bier 0.5 l', '3.80'], ['Sirup', '2.50']];
    items.forEach(([a, b], i) => {
      const y = 95 + i * 42;
      g.textAlign = 'left'; g.fillText('– ' + a, 24, y);
      g.textAlign = 'right'; g.fillText(b, w - 22, y);
    });
  });
}

function posterTex(key, title, sub, top, bottom) {
  return canvasTex('poster' + key, 128, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // Berge
    g.fillStyle = '#e8eef2';
    g.beginPath(); g.moveTo(0, 120); g.lineTo(35, 60); g.lineTo(55, 85); g.lineTo(80, 45); g.lineTo(128, 115); g.lineTo(128, 140); g.lineTo(0, 140); g.fill();
    g.fillStyle = '#4c6a4a'; g.fillRect(0, 118, w, 30);
    g.fillStyle = '#fff'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText(title, w / 2, 168);
    g.font = '12px Arial'; g.fillText(sub, w / 2, 184);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}

function stripeTex(a, b, key) {
  return canvasTex('awn' + key, 256, 64, (g, w, h) => {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 16, 0, 16, h); }
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h - 6, w, 6);
  }, true);
}

function checkTex() {
  return canvasTex('check', 64, 64, (g, w, h) => {
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(190,30,30,.6)';
    for (let i = 0; i < 8; i += 2) { g.fillRect(i * 8, 0, 8, h); g.fillRect(0, i * 8, w, 8); }
  }, true);
}

// ---------- Bausteine ----------
const lambert = (o) => new THREE.MeshLambertMaterial(o);

// Fläche mit Textur, lokal: Mitte (x, y, z), Breite w, Höhe h, Blick nach -z (zur Strasse) gedreht um ry
function plane(group, tex, x, y, z, w, h, ry = Math.PI, basic = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : lambert({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = ry;
  group.add(m);
  return m;
}

// Markise: schräge gestreifte Fläche plus senkrechter Volant mit Bogenkante
function awning(group, x, y, z0, width, depth, drop, tex) {
  tex = tex.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(width / 2.2, 1);
  const mat = lambert({ map: tex, side: THREE.DoubleSide });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.hypot(depth, drop)), mat);
  top.position.set(x, y - drop / 2, z0 - depth / 2);
  top.rotation.set(-Math.PI / 2 + Math.atan2(drop, depth), Math.PI, 0, 'YXZ');
  group.add(top);
  const val = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.28), mat);
  val.position.set(x, y - drop - 0.14, z0 - depth);
  val.rotation.y = Math.PI;
  group.add(val);
}

// Blumenkasten mit Geranien
function flowerBox(B, x, y, z, w, ry = 0) {
  B.box(x, y, z, w, 0.2, 0.26, 0x7a4a2a, ry);
  const n = Math.max(3, Math.round(w / 0.18));
  for (let k = 0; k < n; k++) {
    const t = -w / 2 + (k + 0.5) * w / n;
    const px = x + Math.cos(ry) * t, pz = z - Math.sin(ry) * t;
    B.shape(new THREE.SphereGeometry(0.1, 5, 4), px, y + 0.17 + (k % 2) * 0.04, pz, 1, 0.8, 1, k % 3 ? 0xd4232a : 0x2f6a2a);
  }
}

// Eisengeländer entlang x von xa bis xb auf Höhe y (Boden), bei z
// Stange zwischen zwei Punkten (lokal). Richtung exakt aus den Endpunkten, nichts wird geschätzt.
function bar(B, a, b, t, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
  B.shape(new THREE.BoxGeometry(t, t, L), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 1, 1, 1, color, Math.atan2(dx, dz), Math.atan2(-dy, Math.hypot(dx, dz)), 0);
}

function ironRail(B, xa, xb, y, z, h = 1.0, color = 0x1c1c1e) {
  const L = xb - xa;
  B.box((xa + xb) / 2, y + h, z, L, 0.05, 0.06, color);
  B.box((xa + xb) / 2, y + 0.12, z, L, 0.04, 0.04, color);
  for (let x = xa; x <= xb + 1e-3; x += 0.16) B.box(x, y + h / 2 + 0.06, z, 0.025, h - 0.1, 0.025, color);
}

// Satteldach mit First parallel zur Front (Giebel links und rechts)
function roofAlong(group, W, D, H, pitch, ov, color, wallTex) {
  const ridge = H + (D / 2) * Math.tan(pitch);
  const eaveY = H - ov * Math.tan(pitch);
  const x0 = -W / 2 - ov, x1 = W / 2 + ov;
  const slope = Math.hypot(D / 2 + ov, ridge - eaveY);
  const rp = [], ru = [];
  const U = [[0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, slope / 3], [0, slope / 3]];
  quad(rp, ru, [x1, eaveY, -ov], [x0, eaveY, -ov], [x0, ridge, D / 2], [x1, ridge, D / 2], U);
  quad(rp, ru, [x0, eaveY, D + ov], [x1, eaveY, D + ov], [x1, ridge, D / 2], [x0, ridge, D / 2], U);
  roofMeshes(group, rp, ru, color);
  const gp = [], gu = [];
  for (const [x, sgn] of [[-W / 2, -1], [W / 2, 1]]) {
    const a = [x, H, D * (sgn > 0 ? 1 : 0)], b = [x, H, D * (sgn > 0 ? 0 : 1)], c = [x, ridge, D / 2];
    gp.push(...a, ...b, ...c); gu.push(0, H / 4, D / 4, H / 4, D / 8, ridge / 4);
  }
  group.add(texMesh(gp, gu, lambert({ map: wallTex })));
  return ridge;
}

// Satteldach mit Giebel zur Strasse (First von vorne nach hinten)
function roofGableFront(group, W, D, H, pitch, ov, ovFront, color, gableTex) {
  const ridge = H + (W / 2) * Math.tan(pitch);
  const eaveY = H - ov * Math.tan(pitch);
  const xl = -W / 2 - ov, xr = W / 2 + ov, z0 = -ovFront, z1 = D + 0.5;
  const slope = Math.hypot(W / 2 + ov, ridge - eaveY);
  const rp = [], ru = [];
  const U = [[0, 0], [(z1 - z0) / 3, 0], [(z1 - z0) / 3, slope / 3], [0, slope / 3]];
  quad(rp, ru, [xl, eaveY, z0], [xl, eaveY, z1], [0, ridge, z1], [0, ridge, z0], U);
  quad(rp, ru, [xr, eaveY, z1], [xr, eaveY, z0], [0, ridge, z0], [0, ridge, z1], U);
  roofMeshes(group, rp, ru, color);
  // Giebeldreiecke vorne (Holz) und hinten
  const gp = [], gu = [];
  gp.push(W / 2, H, 0, -W / 2, H, 0, 0, ridge, 0); gu.push(W / 3, 0, 0, 0, W / 6, (ridge - H) / 3);
  gp.push(-W / 2, H, D, W / 2, H, D, 0, ridge, D); gu.push(0, 0, W / 3, 0, W / 6, (ridge - H) / 3);
  group.add(texMesh(gp, gu, lambert({ map: gableTex })));
  return ridge;
}

function finish(group, B, glow, F, chunkAt, colliders, walk, W, D, top) {
  const plain = B.build(lambert({ vertexColors: true }), 0.5);
  plain.castShadow = true; plain.receiveShadow = true;
  group.add(plain);
  if (glow.pos.length) group.add(glow.build(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  (chunkAt(F.ox, F.oz).extra ||= []).push(group);
  const c = Math.cos(F.rotY), s = Math.sin(F.rotY);
  // Hauptkörper (lokal x -W/2..W/2, z 0..D)
  const [mx, mz] = F.toWorld(0, D / 2);
  colliders.addOrientedBox(mx, mz, c, -s, W / 2, D / 2, F.gMin - 2, F.gMin + top);
  for (const [x, z, hu, hv, t] of walk) {
    const [wx, wz] = F.toWorld(x, z);
    colliders.addOrientedBox(wx, wz, c, -s, hu, hv, F.gMin - 3, F.gMin + t).walk = true;
  }
}

function groundY(F, terrain, x, z) {
  const [wx, wz] = F.toWorld(x, z);
  return terrain.heightAt(wx, wz) - F.gMin;
}

// ================= Wohnhaus zwischen Imbiss und Club =================
export function buildHaus(pts, { terrain, chunkAt, colliders }) {
  const F = frameFromFootprint(pts, terrain);
  const W = Math.min(F.width, 11.5), D = Math.min(F.depth, 10);
  const group = new THREE.Group();
  group.position.set(F.fx, F.gMin, F.fz); group.rotation.y = F.rotY;
  const G0 = 0.7, FH = 2.8, floors = 3, H = G0 + floors * FH;
  const wallTex = plasterTex('#d9b46c', 'haus');
  // Seite zum Imbiss (Westen) bekommt die Balkone
  const [lxw] = F.toWorld(-W / 2, 0), [rxw] = F.toWorld(W / 2, 0);
  const sL = lxw < rxw ? -1 : 1;

  const pos = [], uv = [];
  boxWalls(pos, uv, W, D, G0 - 0.05, H, 4.5);
  group.add(texMesh(pos, uv, lambert({ map: wallTex })));
  const low = [], lowUv = [];
  boxWalls(low, lowUv, W, D, -1.8 - F.drop, G0, 2.5);
  group.add(texMesh(low, lowUv, lambert({ map: stoneTex() })));
  const ridge = roofAlong(group, W, D, H, 0.6, 0.9, 0xcf7a58, wallTex);

  const B = new Builder(), glow = new Builder(), walk = [];
  const r = rnd(77);
  const shutter = 0x2f5a3a;
  // Gurtgesimse zwischen den Geschossen
  for (let f = 1; f <= floors; f++) B.box(0, G0 + f * FH - 0.05, -0.05, W + 0.1, 0.12, 0.12, 0xc9a55e);
  // Fensterachsen: auf der Balkonseite schmaler, sonst Doppelfenster
  const axes = [-0.34, -0.06, 0.2, 0.38].map((u) => u * W * -sL);
  const balcX0 = sL * (W / 2 - 3.4), balcX1 = sL * (W / 2 - 0.15);    // Balkonturm an der Ecke, innerhalb der Hausbreite
  const inBalc = (x) => (x - balcX0) * (x - balcX1) < 0;
  for (let f = 0; f < floors; f++) {
    const y = G0 + f * FH + 1.45;
    for (const [i, x] of axes.entries()) {
      if (f === 0 && i === 2) continue;                                  // Haustür
      if (f > 0 && inBalc(x)) continue;                                  // dort ist die Balkontür
      windowAt(B, 'f', x, y, W, D, { w: 1.2, h: 1.4, shutter: f > 0 || i !== 1 ? shutter : null, curtain: 0xe8e0d0, frame: 0xe8e2d4, glass: 0x2a2a30 });
      if (f === 1 && !inBalc(x)) flowerBox(B, x, y - 0.88, -0.2, 1.2);
    }
    // Balkontür im Balkonturm
    if (f > 0) windowAt(B, 'f', (balcX0 + balcX1) / 2, G0 + f * FH + 1.25, W, D, { w: 0.9, h: 2.1, curtain: 0xe8e0d0, frame: 0xe8e2d4, glass: 0x2a2a30 });
    for (const side of ['l', 'r']) for (const t of [D * 0.3, D * 0.72]) windowAt(B, side, t, y, W, D, { w: 1.0, h: 1.3, shutter, curtain: 0xe8e0d0, frame: 0xe8e2d4 });
    for (const t of [-W * 0.25, W * 0.25]) windowAt(B, 'b', t, y, W, D, { w: 1.1, h: 1.3, shutter, curtain: 0xe8e0d0, frame: 0xe8e2d4 });
  }
  // Balkonturm: zwei Balkone übereinander, Betonplatte, Eisengeländer, zwei Stützen bis auf den Boden
  const bLo = Math.min(balcX0, balcX1), bHi = Math.max(balcX0, balcX1), bD = 1.5;
  for (const f of [1, 2]) {
    const y = G0 + f * FH;
    B.box((bLo + bHi) / 2, y - 0.09, -bD / 2, bHi - bLo, 0.18, bD, 0xb8ad98);
    ironRail(B, bLo + 0.05, bHi - 0.05, y, -bD + 0.05, 1.0, 0x2a2a2c);
    for (const x of [bLo + 0.05, bHi - 0.05]) for (let z = -bD + 0.2; z < -0.05; z += 0.16) B.box(x, y + 0.56, z, 0.025, 0.9, 0.025, 0x2a2a2c);
    for (const x of [bLo + 0.05, bHi - 0.05]) B.box(x, y + 1.0, -bD / 2, 0.05, 0.05, bD, 0x2a2a2c);
  }
  for (const x of [bLo + 0.12, bHi - 0.12]) B.box(x, (G0 + FH - 0.18) / 2, -bD + 0.12, 0.2, G0 + FH - 0.18, 0.2, 0xcfc6b4);
  // Badetuch über der Brüstung, Satellitenschüssel
  const tx = (balcX0 + balcX1) / 2 + sL * 0.6;
  for (let k = 0; k < 6; k++) B.box(tx - 0.3 + k * 0.12, G0 + 2 * FH + 0.72, -bD + 0.0, 0.12, 0.6, 0.02, k % 2 ? 0xf0ece0 : 0xc0262a);
  // Langer Balkon im 2. OG auf der anderen Seite mit Eisengeländer
  {
    const xa = -sL * (W / 2 - 0.3), xb = sL * (W / 2 - 3.8);
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb), y = G0 + 2 * FH;
    B.box((lo + hi) / 2, y - 0.08, -0.55, hi - lo, 0.16, 1.1, 0xb8ad98);
    ironRail(B, lo, hi, y, -1.08);
    for (const x of [lo, hi]) B.box(x, y + 0.5, -0.55, 0.04, 1.0, 1.1, 0x1c1c1e);
    for (let k = 0; k < 4; k++) flowerBox(B, lo + 0.8 + k * (hi - lo - 1.6) / 3, y + 1.05, -1.08, 0.7);
  }
  // Haustür mit Vordach, Lampe, Treppe mit Geländern, Briefkästen
  const ex = axes[2];
  B.box(ex, G0 + 1.1, -0.04, 1.2, 2.2, 0.08, 0x5e3420);
  B.box(ex, G0 + 1.5, -0.09, 0.5, 0.8, 0.02, 0x9fb4b8);
  B.box(ex + 0.4, G0 + 1.05, -0.11, 0.06, 0.18, 0.06, 0xc9a23c);
  B.box(ex, G0 + 2.45, -0.5, 1.8, 0.08, 1.0, 0x5a5a58);
  for (const s of [-1, 1]) B.box(ex + s * 0.85, G0 + 2.3, -0.9, 0.03, 0.3, 0.03, 0x2a2a2a);
  glow.box(ex + 0.85, G0 + 2.05, -0.12, 0.2, 0.26, 0.12, 0xffd890);
  // Treppe: Podest vor der Tür, Stufen hinunter auf den Vorplatz, seitliche Mauern, Handläufe exakt entlang der Stufen
  const nSt = Math.round(G0 / 0.17), rise = G0 / nSt, run = 0.3, land = 0.9, sw2 = 1.5;
  const foot = -land - (nSt - 1) * run;
  B.box(ex, G0 / 2 - 0.15, -land / 2, sw2, G0 + 0.3, land, 0x9a958c);
  walk.push([ex, -land / 2, sw2 / 2, land / 2, G0]);
  for (let i = 1; i <= nSt - 0 && i < nSt + 1; i++) {
    const top = G0 - rise * i, zc = -land - (i - 0.5) * run;
    if (top < 0.02) break;
    B.box(ex, (top - 0.15) / 2, zc, sw2, top + 0.15, run, i % 2 ? 0x948f86 : 0x9a958c);
    walk.push([ex, zc, sw2 / 2, run / 2, top]);
  }
  for (const s2 of [-1, 1]) {
    const xr = ex + s2 * (sw2 / 2 + 0.1);
    // Wange: Mauer bis Podesthöhe, zur Strasse hin abgetreppt
    B.box(xr, (G0 + 0.1) / 2 - 0.05, -land / 2, 0.2, G0 + 0.2, land, 0x8a857c);
    for (let i = 1; i < nSt; i++) { const top = G0 - rise * i + 0.1; B.box(xr, top / 2 - 0.05, -land - (i - 0.5) * run, 0.2, top + 0.1, run, 0x8a857c); }
    // Handlauf: Pfosten oben und unten, Stange parallel zur Treppe
    const yTop = G0 + 0.9, zTop = -0.15, zBot = foot + 0.15, yBot = 0.9 + rise * 0.5;
    B.box(xr, (G0 + 0.1 + yTop) / 2, zTop, 0.04, yTop - G0 - 0.1, 0.04, 0x1c1c1e);
    B.box(xr, (0.1 + yBot) / 2, zBot, 0.04, yBot - 0.1, 0.04, 0x1c1c1e);
    bar(B, [xr, yTop, zTop], [xr, yTop, -land], 0.05, 0x1c1c1e);
    bar(B, [xr, yTop, -land], [xr, yBot, zBot], 0.05, 0x1c1c1e);
  }
  B.box(ex - sL * 1.35, G0 + 1.25, -0.08, 0.75, 0.45, 0.14, 0x8a8c8e);
  for (let k = 0; k < 4; k++) B.box(ex - sL * 1.35 - 0.27 + k * 0.18, G0 + 1.33, -0.16, 0.12, 0.03, 0.02, 0x2a2a2a);
  // Kellerfenster mit Gitter im Sockel
  for (const x of [axes[0], axes[3]]) {
    B.box(x, 0.25, -0.03, 0.9, 0.4, 0.04, 0x1a1a1a);
    for (let k = 0; k < 6; k++) B.box(x - 0.38 + k * 0.15, 0.25, -0.06, 0.03, 0.4, 0.03, 0x3a3a3a);
  }
  // Fallrohre, Kamin, Antenne
  // Fallrohre vom Boden bis unter die Dachrinne (nicht darüber hinaus)
  for (const s of [-1, 1]) B.box(s * (W / 2 - 0.1), (H - 0.4) / 2, -0.12, 0.12, H - 0.4, 0.12, 0x6a6a66);
  B.box(-sL * W * 0.2, ridge + 0.2, D * 0.5, 0.7, 1.6, 0.7, 0xb0a596);
  B.box(-sL * W * 0.2, ridge + 1.05, D * 0.5, 0.85, 0.12, 0.85, 0x6a625a);
  // Lukarne in der Dachfläche vorne
  {
    const y0 = H - 0.3, wD = 2.6;
    B.box(0, y0 + 1.1, 0.9, wD, 2.2, 1.6, 0xd9b46c);
    for (const s of [-1, 1]) B.shape(new THREE.BoxGeometry(1.75, 0.1, 2.4), s * 0.72, y0 + 2.55, 0.85, 1, 1, 1, 0xb8604a, 0, 0, -s * 0.62);
    windowAt(B, 'f', 0, y0 + 1.1, W, D, { w: 1.0, h: 1.1, out: -0.08, shutter, curtain: 0xe8e0d0, frame: 0xe8e2d4 });
  }
  // Velo an der Wand, Abfalleimer
  {
    const bx = ex - sL * 2.6, gy = groundY(F, terrain, bx, -0.4);
    for (const s of [-0.55, 0.55]) B.shape(new THREE.TorusGeometry(0.32, 0.03, 4, 14), bx + s, gy + 0.33, -0.3, 1, 1, 1, 0x1a1a1a);
    B.shape(new THREE.BoxGeometry(1.1, 0.04, 0.04), bx, gy + 0.55, -0.3, 1, 1, 1, 0x8a2a24, 0, 0, 0.25);
    B.box(bx - 0.45, gy + 0.75, -0.3, 0.24, 0.06, 0.1, 0x1a1a1a);
    B.box(bx + 0.5, gy + 0.85, -0.3, 0.04, 0.04, 0.5, 0x6a6a6a);
    const cx = sL * (W / 2 - 0.4), cy = groundY(F, terrain, cx, -0.6);
    B.shape(new THREE.CylinderGeometry(0.28, 0.25, 0.85, 10), cx, cy + 0.42, -0.6, 1, 1, 1, 0x7a7c7e);
    B.shape(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10), cx, cy + 0.88, -0.6, 1, 1, 1, 0x5a5c5e);
    colliders.addCircle(...F.toWorld(cx, -0.6), 0.3);
  }
  // Graffiti-Tag unten
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.8), lambert({ map: graffitiTex(41), transparent: true, depthWrite: false }));
  gm.position.set(ex - sL * 2.8, G0 + 0.9, -0.05); gm.rotation.y = Math.PI;
  group.add(gm);
  (chunkAt(F.ox, F.oz).extra ||= []).push(forecourt(terrain, F, -W / 2 - 0.5, W / 2 + 0.5, 8, paving(0x8a857c)));
  finish(group, B, glow, F, chunkAt, colliders, walk, W, D, ridge + 1);
  const [dx, dz] = F.toWorld(ex, foot - 0.6);
  return { result: { id: 'haus', name: 'Wohnhaus', door: { x: dx, z: dz }, x: F.ox, z: F.oz, heading: F.rotY }, info: { x: F.ox, z: F.oz, pts, church: false } };
}

// ================= Kleiderladen «Mode Muota» =================
export function buildShop(pts, { terrain, chunkAt, colliders }) {
  const F = frameFromFootprint(pts, terrain);
  const W = Math.min(F.width, 11), D = Math.min(F.depth, 8.5);
  const group = new THREE.Group();
  group.position.set(F.fx, F.gMin, F.fz); group.rotation.y = F.rotY;
  const G0 = 0.35, H = 3.7, S = 0.95;              // Boden, Traufe, Steinsockel
  const pos = [], uv = [];
  boxWalls(pos, uv, W, D, S, H, 4);
  group.add(texMesh(pos, uv, lambert({ map: plasterTex('#ece6da', 'shop') })));
  const low = [], lowUv = [];
  boxWalls(low, lowUv, W, D, -1.8 - F.drop, S, 2.2);
  group.add(texMesh(low, lowUv, lambert({ map: stoneTex() })));
  const ridge = roofGableFront(group, W, D, H, 0.55, 0.7, 1.1, 0x7a5644, woodTex('shop', '#7a4a26'));

  const B = new Builder(), glow = new Builder(), walk = [];
  const frame = 0x6e4422;
  // Holzbalken unter dem Giebel und Ortgang
  B.box(0, H + 0.05, -0.12, W + 0.4, 0.22, 0.24, 0x5a3818);
  // Schild am Giebel
  plane(group, boardTex('mode', [{ text: 'MODE MUOTA', font: 'bold 92px Georgia, serif', color: '#1f2f52' }], { bg: '#f4f0e6', border: '#3a2a1a' }), 0, H + 0.85, -0.16, Math.min(4.6, W * 0.5), 0.75);
  // Schaufenster links und rechts der Tür (vorgebaut, innen beleuchtet)
  const doorX = W * 0.12;
  const bays = [[-W / 2 + 0.5, doorX - 0.75], [doorX + 0.75, W / 2 - 0.5]];
  const jackets = [0x1f8a8a, 0x7a3a8a, 0xa8302a, 0x2f4f7a, 0x8a5a2a, 0xd0a040];
  let jk = 0;
  for (const [a, b] of bays) {
    const w = b - a, cx = (a + b) / 2;
    if (w < 1) continue;
    glow.box(cx, 1.95, -0.05, w, 2.0, 0.04, 0xe6d3a8);                        // beleuchtete Rückwand
    for (let k = 0; k < Math.max(1, Math.floor(w / 1.3)); k++) {
      const px = a + (k + 0.5) * w / Math.max(1, Math.floor(w / 1.3));
      B.box(px, 1.75, -0.25, 0.42, 0.7, 0.24, jackets[jk++ % jackets.length]);     // Jacke
      B.box(px, 1.2, -0.25, 0.34, 0.5, 0.2, 0x3a4a6a);                          // Hose
      B.box(px, 2.25, -0.25, 0.18, 0.24, 0.18, 0xe8d8c4);                       // Kopf
    }
    B.box(cx, 0.98, -0.25, w, 0.08, 0.5, frame);                               // Sockelbrett
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.05), new THREE.MeshPhongMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.25, shininess: 120, depthWrite: false }));
    gl.position.set(cx, 2.0, -0.48); gl.rotation.y = Math.PI; group.add(gl);
    for (const x of [a, b]) B.box(x, 2.0, -0.48, 0.1, 2.1, 0.12, frame);
    B.box(cx, 3.05, -0.48, w + 0.1, 0.12, 0.12, frame);
    B.box(cx, 0.97, -0.48, w + 0.1, 0.1, 0.12, frame);
    for (let k = 1; k < Math.round(w / 1.4); k++) B.box(a + k * w / Math.round(w / 1.4), 2.0, -0.49, 0.06, 2.1, 0.08, frame);
    flowerBox(B, cx, 0.86, -0.75, Math.min(w - 0.3, 2.2));
  }
  // Tür (Holz mit Glas), Stufen, Handlauf
  B.box(doorX, G0 + 1.1, -0.06, 1.1, 2.3, 0.1, frame);
  B.box(doorX, G0 + 1.35, -0.12, 0.7, 1.4, 0.02, 0xd8c9a0);
  B.box(doorX + 0.38, G0 + 1.05, -0.14, 0.05, 0.2, 0.05, 0xc9a23c);
  B.box(doorX, G0 / 2 - 0.3, -0.45, 1.6, G0 + 0.6, 0.9, 0x9a968e);
  walk.push([doorX, -0.45, 0.8, 0.45, G0]);
  const foot = frontSteps(B, walk, F, terrain, doorX, G0 - 0.12, 1.5, -0.9);
  B.box(doorX + 0.85, 0.85, -0.7, 0.04, 0.9, 0.04, 0x1c1c1e);
  B.box(doorX + 0.85, 1.3, -0.5, 0.04, 0.04, 1.0, 0x1c1c1e);
  // Markise blau-weiss über die ganze Front
  awning(group, 0, 3.4, -0.5, W - 0.6, 1.2, 0.45, stripeTex('#2a4a7a', '#eef0f4', 'mode'));
  // Seitenfenster mit blauen Läden und Blumenkasten
  for (const side of ['l', 'r']) for (const t of [D * 0.35, D * 0.72]) windowAt(B, side, t, 2.1, W, D, { w: 0.9, h: 1.1, shutter: 0x2a3e5a, curtain: 0xf0ece4, frame: 0xe8e2d4 });
  flowerBox(B, -W / 2 - 0.15, 1.42, D * 0.35, 0.9, Math.PI / 2);
  // Kleiderständer, Aufsteller, Topfbaum
  {
    const rx = -W / 2 + 1.8, gy = groundY(F, terrain, rx, -1.4);
    for (const s of [-0.8, 0.8]) B.box(rx + s, gy + 0.75, -1.4, 0.04, 1.5, 0.04, 0xb0b0b0);
    B.box(rx, gy + 1.48, -1.4, 1.65, 0.04, 0.04, 0xb0b0b0);
    for (const s of [-0.8, 0.8]) B.box(rx + s, gy + 0.03, -1.4, 0.05, 0.05, 0.5, 0xb0b0b0);
    for (let k = 0; k < 8; k++) B.box(rx - 0.7 + k * 0.2, gy + 1.0, -1.4, 0.12, 0.9, 0.42, jackets[k % jackets.length]);
    colliders.addOrientedBox(...F.toWorld(rx, -1.4), Math.cos(F.rotY), -Math.sin(F.rotY), 0.9, 0.3, F.gMin + gy - 0.2, F.gMin + gy + 1.6);
    const ax = doorX - 1.5, ay = groundY(F, terrain, ax, -1.5);
    B.shape(new THREE.BoxGeometry(0.75, 1.05, 0.05), ax, ay + 0.5, -1.38, 1, 1, 1, 0x6e4422, 0, -0.18);
    B.shape(new THREE.BoxGeometry(0.75, 1.05, 0.05), ax, ay + 0.5, -1.72, 1, 1, 1, 0x6e4422, 0, 0.18);
    const pst = plane(group, posterTex('mode', 'Neu!', 'Herbstjacken', '#7fb0d8', '#2a4a7a'), ax, ay + 0.55, -1.8, 0.6, 0.85);
    pst.rotation.x = 0.18;
    const px = -W / 2 + 0.5, py = groundY(F, terrain, px, -1.1);
    B.box(px, py + 0.25, -1.1, 0.5, 0.5, 0.5, 0x9a968e);
    B.shape(new THREE.ConeGeometry(0.35, 1.3, 8), px, py + 1.15, -1.1, 1, 1, 1, 0x2e5a2a);
    colliders.addCircle(...F.toWorld(px, -1.1), 0.35);
  }
  // Vorplatz (Pflaster) bis zum Gehweg, direkt auf dem Boden
  (chunkAt(F.ox, F.oz).extra ||= []).push(forecourt(terrain, F, -W / 2 - 1.5, W / 2 + 1.5, 8, paving(0x8e8778)));
  // Fallrohr, Kamin
  for (const s of [-1, 1]) B.box(s * (W / 2 - 0.1), (H - 0.3) / 2, -0.15, 0.12, H - 0.3, 0.12, 0x5a5a58);
  B.box(-W * 0.22, ridge - 0.2, D * 0.35, 0.6, 1.6, 0.6, 0xcfc8ba);
  B.box(-W * 0.22, ridge + 0.65, D * 0.35, 0.75, 0.12, 0.75, 0x6a625a);
  // Holzbeige an der Seite
  {
    const sx = -W / 2 - 1.1, gy = groundY(F, terrain, sx, D * 0.6);
    for (let k = 0; k < 4; k++) for (let j = 0; j < 7; j++) B.shape(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 6), sx, gy + 0.12 + k * 0.22, D * 0.35 + j * 0.24, 1, 1, 1, j % 2 ? 0x9a6a3a : 0x8a5a2e, 0, Math.PI / 2, Math.PI / 2);
    B.box(sx, gy + 1.15, D * 0.35 + 0.75, 1.2, 0.08, 2.0, 0x5a3818);
    colliders.addOrientedBox(...F.toWorld(sx, D * 0.35 + 0.75), Math.cos(F.rotY), -Math.sin(F.rotY), 0.5, 1.0, F.gMin + gy - 0.2, F.gMin + gy + 1.2);
  }
  finish(group, B, glow, F, chunkAt, colliders, walk.filter((w) => w[4] > 0.05), W, D, ridge + 0.5);
  const [dx, dz] = F.toWorld(doorX, foot - 0.6);
  return { result: { id: 'shop', name: 'Mode Muota', door: { x: dx, z: dz }, x: F.ox, z: F.oz, heading: F.rotY }, info: { x: F.ox, z: F.oz, pts, church: false } };
}

// ================= Imbiss «Stalden One» =================
export function buildImbiss(pts, { terrain, chunkAt, colliders }) {
  const F = frameFromFootprint(pts, terrain);
  const W = Math.min(F.width, 7.2), D = Math.min(F.depth, 4.6);
  const group = new THREE.Group();
  group.position.set(F.fx, F.gMin, F.fz); group.rotation.y = F.rotY;
  const H = 2.9, S = 0.9;
  const pos = [], uv = [];
  boxWalls(pos, uv, W, D, S, H, 3);
  group.add(texMesh(pos, uv, lambert({ map: woodTex('imbiss', '#6a4428') })));
  const low = [], lowUv = [];
  boxWalls(low, lowUv, W, D, -1.8 - F.drop, S, 3);
  group.add(texMesh(low, lowUv, lambert({ map: plasterTex('#d8d2c4', 'imbisslow') })));
  const ridge = roofAlong(group, W, D, H, 0.62, 0.7, 0xc0583e, woodTex('imbissg', '#5e3c22'));

  const B = new Builder(), glow = new Builder(), walk = [];
  // Schild über der Front, darüber zwei Lampen
  const sw = W * 0.9;
  plane(group, boardTex('imbiss', [
    { text: 'STALDEN ONE', font: 'italic bold 96px Georgia, serif', color: '#a3201a' },
    { text: 'IMBISS', font: 'bold 40px Georgia, serif', color: '#3a2a1a', x: 110 },
    { text: 'SNACKS', font: 'bold 30px Georgia, serif', color: '#3a2a1a', x: 920, y: 60 },
    { text: 'GETRÄNKE', font: 'bold 30px Georgia, serif', color: '#3a2a1a', x: 920, y: 104 },
  ], { bg: '#efe4c8' }), 0, H + 0.55, -0.62, sw, 0.85);
  B.box(0, H + 0.55, -0.57, sw + 0.1, 0.95, 0.06, 0x5a3818);
  for (const s of [-1, 1]) {
    B.box(s * sw * 0.3, H + 1.25, -0.55, 0.04, 0.5, 0.04, 0x2e4a32);
    B.box(s * sw * 0.3, H + 1.47, -0.75, 0.04, 0.04, 0.45, 0x2e4a32);
    B.shape(new THREE.ConeGeometry(0.2, 0.18, 10, 1, true), s * sw * 0.3, H + 1.38, -0.98, 1, 1, 1, 0x2e5a3a);
    glow.shape(new THREE.SphereGeometry(0.07, 6, 4), s * sw * 0.3, H + 1.3, -0.98, 1, 1, 1, 0xfff0c0);
  }
  // Verkaufsfenster: beleuchtetes Inneres, Theke, Regale, Verkäufer
  const wx0 = -0.6, wx1 = 1.9, wcx = (wx0 + wx1) / 2, ww = wx1 - wx0;
  glow.box(wcx, 1.65, -0.03, ww, 1.2, 0.04, 0xe8d6a8);
  for (let k = 0; k < 2; k++) B.box(wcx, 1.5 + k * 0.45, -0.08, ww - 0.2, 0.04, 0.12, 0x5a3818);
  for (let k = 0; k < 9; k++) B.box(wcx - ww / 2 + 0.3 + k * 0.25, 1.62 + (k % 2) * 0.45, -0.06, 0.07, 0.22, 0.07, [0x2a6a3a, 0x8a2a1a, 0xc8a040][k % 3]);
  B.box(wcx - 0.3, 1.55, -0.35, 0.42, 0.55, 0.26, 0x1f2a44);                     // Verkäufer
  B.box(wcx - 0.3, 1.45, -0.49, 0.38, 0.45, 0.02, 0xf2f0ea);                     // Schürze
  B.shape(new THREE.SphereGeometry(0.15, 8, 6), wcx - 0.3, 2.0, -0.35, 1, 1.1, 1, 0xe0b898);
  B.box(wcx - 0.3, 1.95, -0.49, 0.18, 0.03, 0.02, 0x3a2414);                      // Schnauz
  B.box(wcx, 1.02, -0.2, ww + 0.2, 0.08, 0.5, 0x8a5a2e);                          // Theke
  for (const x of [wx0, wx1]) B.box(x, 1.65, -0.05, 0.1, 1.3, 0.12, 0x4a2e16);
  B.box(wcx, 2.3, -0.05, ww + 0.1, 0.1, 0.12, 0x4a2e16);
  for (const [x, c] of [[wcx + 0.5, 0xd8b020], [wcx + 0.7, 0xb8241c]]) B.shape(new THREE.CylinderGeometry(0.05, 0.06, 0.22, 8), x, 1.17, -0.3, 1, 1, 1, c);
  awning(group, wcx, 2.55, -0.1, ww + 0.9, 1.0, 0.4, stripeTex('#c4271f', '#f4efe6', 'imbiss'));
  // Menütafel, Plakate (erfundene Marken)
  plane(group, chalkTex(), -1.7, 1.75, -0.06, 0.95, 1.2);
  plane(group, posterTex('mt', 'Muotathal', 'Ferien im Tal', '#8ab8d8', '#3a6a9a'), -W / 2 + 0.55, 1.9, -0.06, 0.6, 0.9);
  plane(group, posterTex('aq', 'ALPENQUELL', 'erfrischt!', '#d84a3a', '#8a1a14'), W / 2 - 0.75, 1.75, -0.06, 0.6, 0.9);
  // Getränkekisten und Abfalleimer an der Seitenwand hinten, nicht vor der Theke
  {
    const kx = -W / 2 - 0.3, kz = D - 0.6, gy = groundY(F, terrain, kx, kz);
    for (let k = 0; k < 3; k++) B.box(kx, gy + 0.17 + k * 0.34, kz - (k === 2 ? 0.05 : 0), 0.36, 0.33, 0.5, k % 2 ? 0xd8b020 : 0xb8241c);
    const bx = W / 2 + 0.35, bz = D - 0.8, by = groundY(F, terrain, bx, bz);
    B.shape(new THREE.CylinderGeometry(0.25, 0.23, 0.9, 10), bx, by + 0.45, bz, 1, 1, 1, 0x8c8e90);
    B.shape(new THREE.SphereGeometry(0.25, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), bx, by + 0.9, bz, 1, 0.6, 1, 0x8c8e90);
    colliders.addCircle(...F.toWorld(bx, bz), 0.28);
    colliders.addCircle(...F.toWorld(kx, kz), 0.35);
  }
  // Terrasse mit Holzzaun, Tischen mit Karotuch, roten Stühlen und Sonnenschirm
  {
    // Platz vor dem Häuschen bis zur Strasse; sonst seitlich
    let depth = 0;
    for (let d = 0.5; d <= 5; d += 0.5) {
      let hit = false;
      for (let x = 0; x <= W / 2 + 2.5; x += 0.5) {
        const [wx, wz] = F.toWorld(x, -d - 0.3);
        if (terrain.roadAt(wx, wz, 0.4) === terrain.roadAt(wx, wz, 0.4)) hit = true;
        if (terrain.walkAt) { const w = terrain.walkAt(wx, wz); if (w === w) hit = true; }     // nie auf den Gehweg
      }
      if (hit) break;
      depth = d;
    }
    let ox = 0.4, oz = -1.2 - Math.max(0, depth - 1.2) / 2, tw = W / 2 + 2.2, td = Math.max(1.6, depth - 1.0);
    let side = false;
    if (depth < 2.6) { side = true; ox = W / 2 + 2.2; oz = D * 0.45; tw = 3.8; td = D * 0.9; }
    const x0 = ox - tw / 2, x1 = ox + tw / 2, z0 = oz - td / 2, z1 = oz + td / 2;
    // Terrassenboden: Holzdielen direkt auf dem Boden (kein Podest)
    (chunkAt(F.ox, F.oz).extra ||= []).push(drapeRect(terrain, F, x0, x1, z0, z1, (x) => (Math.floor(x * 6) % 2 ? 0x8a6a4a : 0x7e6044), { lift: 0.03, step: 0.25 }));
    const gyAt = (x, z) => groundY(F, terrain, x, z) + 0.03;
    const tex = checkTex();
    const tables = side ? [[ox, oz - td * 0.22], [ox, oz + td * 0.25]] : [[ox - tw * 0.2, oz], [ox + tw * 0.25, oz]];
    for (const [tx, tz] of tables) {
      const ty = gyAt(tx, tz);
      B.box(tx, ty + 0.38, tz, 0.08, 0.76, 0.08, 0x3a3a3a);
      B.box(tx, ty + 0.01, tz, 0.5, 0.02, 0.5, 0x3a3a3a);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.95), lambert({ map: tex }));
      cloth.position.set(tx, ty + 0.79, tz); group.add(cloth);
      for (const [cx, cz, ry] of [[-0.75, 0, Math.PI / 2], [0.75, 0, -Math.PI / 2]]) {
        const sx = tx + cx, sz = tz + cz, sy = gyAt(sx, sz);
        B.box(sx, sy + 0.45, sz, 0.45, 0.05, 0.45, 0xb8241c, ry);
        B.box(sx + (cx > 0 ? 0.22 : -0.22), sy + 0.75, sz, 0.05, 0.6, 0.45, 0xb8241c);
        for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18]) B.box(sx + dx, sy + 0.215, sz + dz, 0.03, 0.43, 0.03, 0x8a8a8a);
      }
      colliders.addCircle(...F.toWorld(tx, tz), 0.55);
    }
    // Sonnenschirm (rot mit weissem Rand, erfundene Biermarke)
    const [px, pz] = side ? [ox + tw * 0.3, oz] : [x1 - 0.6, oz];
    const py = gyAt(px, pz);
    B.box(px, py + 1.25, pz, 0.05, 2.5, 0.05, 0xdddddd);
    B.box(px, py + 0.05, pz, 0.45, 0.1, 0.45, 0x5a5a5a);
    B.shape(new THREE.ConeGeometry(1.5, 0.55, 12), px, py + 2.55, pz, 1, 1, 1, 0xb8241c);
    B.shape(new THREE.CylinderGeometry(1.5, 1.5, 0.18, 12, 1, true), px, py + 2.2, pz, 1, 1, 1, 0xf0ece0);
    const lab = plane(group, boardTex('bräu', [{ text: 'MUOTA BRÄU', font: 'bold 80px Arial', color: '#b8241c' }], { bg: '#f0ece0', border: '#f0ece0', w: 512, h: 96 }), px, py + 2.2, pz - 1.52, 1.0, 0.18);
    lab.material.side = THREE.DoubleSide;
    // Holzzaun um die Terrasse
    const post = (x, z) => { const y = gyAt(x, z); B.box(x, y + 0.45, z, 0.08, 0.9, 0.08, 0x7a5a3a); };
    const fenceRun = (xa, za, xb, zb) => {
      const L = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(L / 0.14));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = xa + (xb - xa) * t, z = za + (zb - za) * t, y = gyAt(x, z), h = 0.7 + (k % 3) * 0.04;
        B.box(x, y + h / 2, z, 0.07, h, 0.025, k % 2 ? 0x8a6a48 : 0x7e6040, Math.atan2(-(zb - za), xb - xa));
      }
      const ya = gyAt(xa, za), yb = gyAt(xb, zb);
      bar(B, [xa, ya + 0.6, za], [xb, yb + 0.6, zb], 0.05, 0x6a4a2a);
      post(xa, za); post(xb, zb);
      const [mx, mz] = F.toWorld((xa + xb) / 2, (za + zb) / 2), [ax, az] = F.toWorld(xa, za), [bx, bz] = F.toWorld(xb, zb);
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      colliders.addOrientedBox(mx, mz, ux, uz, L / 2, 0.06, F.gMin - 0.5, F.gMin + 1.0);
    };
    if (side) { fenceRun(x1, z0, x1, z1); fenceRun(x0 + 0.2, z0, x1, z0); }
    else { fenceRun(x0, z0, x1 - 1.4, z0); fenceRun(x1, z0, x1, z1); }
  }
  // Vorplatz bis zum Gehweg
  (chunkAt(F.ox, F.oz).extra ||= []).push(forecourt(terrain, F, -W / 2 - 1, W / 2 + 4.5, 8, paving(0x8a857c)));
  // Fallrohre, kleines Kamin
  for (const s of [-1, 1]) B.box(s * (W / 2 - 0.08), (H - 0.3) / 2, -0.12, 0.1, H - 0.3, 0.1, 0x6a6a66);
  B.box(W * 0.25, ridge - 0.1, D * 0.6, 0.45, 1.0, 0.45, 0xb0a596);
  finish(group, B, glow, F, chunkAt, colliders, walk, W, D, ridge + 0.5);
  const [dx, dz] = F.toWorld(wcx, -1.4);
  return { result: { id: 'imbiss', name: 'Stalden One', door: { x: dx, z: dz }, x: F.ox, z: F.oz, heading: F.rotY }, info: { x: F.ox, z: F.oz, pts, church: false } };
}
