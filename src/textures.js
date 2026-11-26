import * as THREE from 'three';

// Alle Texturen werden beim Start gezeichnet (keine Bilddateien nötig).
// Sie sind eher grau gehalten; die eigentliche Farbe kommt von den Eckfarben (vertex colors).

let maxAniso = 4;
export function setRenderer(r) { maxAniso = Math.min(4, r.capabilities.getMaxAnisotropy()); }

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// einfaches Rauschen
function noise(g, s, base, amp, count, sizeMin, sizeMax, alpha = 0.5) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < count; i++) {
    const v = Math.floor(128 + (Math.random() - 0.5) * 2 * amp);
    g.fillStyle = `rgba(${v},${v},${v},${alpha * Math.random()})`;
    const r = sizeMin + Math.random() * (sizeMax - sizeMin);
    const x = Math.random() * s, y = Math.random() * s;
    for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) g.fillRect(x + dx, y + dy, r, r);
  }
}

const cache = {};
export const tex = {
  grass: () => cache.grass ??= canvas(256, (g, s) => {
    noise(g, s, '#c8c8c8', 90, 9000, 1, 3, 0.45);
    // Halme
    for (let i = 0; i < 2500; i++) {
      const v = 150 + Math.random() * 105;
      g.strokeStyle = `rgba(${v},${v},${v - 10},0.35)`;
      const x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4); g.stroke();
    }
    for (let i = 0; i < 40; i++) { // dunkle Flecken
      g.fillStyle = 'rgba(60,60,60,0.06)';
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 0, 7); g.fill();
    }
  }),
  rock: () => cache.rock ??= canvas(256, (g, s) => {
    noise(g, s, '#b4b4b4', 110, 6000, 1, 5, 0.5);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(40,40,40,${0.15 + Math.random() * 0.2})`;
      g.lineWidth = 1 + Math.random();
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 18; g.lineTo(x, y); }
      g.stroke();
    }
  }),
  asphalt: () => cache.asphalt ??= canvas(256, (g, s) => {
    noise(g, s, '#bdbdbd', 70, 14000, 1, 2, 0.6);
    for (let i = 0; i < 12; i++) { // Flicken
      g.fillStyle = `rgba(70,70,70,${0.08 + Math.random() * 0.08})`;
      g.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 50, 10 + Math.random() * 30);
    }
    for (let i = 0; i < 6; i++) { // Risse
      g.strokeStyle = 'rgba(40,40,40,0.35)';
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 20; y += (Math.random() - 0.5) * 20; g.lineTo(x, y); }
      g.stroke();
    }
  }),
  plaster: () => cache.plaster ??= canvas(128, (g, s) => {
    noise(g, s, '#e6e6e6', 40, 4000, 1, 2, 0.35);
    const grad = g.createLinearGradient(0, s, 0, 0); // Schmutz unten
    grad.addColorStop(0, 'rgba(90,80,70,0.25)'); grad.addColorStop(0.4, 'rgba(90,80,70,0)');
    g.fillStyle = grad; g.fillRect(0, 0, s, s);
  }),
  wood: () => cache.wood ??= canvas(128, (g, s) => {
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, s, s);
    const plank = s / 8;
    for (let i = 0; i < 8; i++) {
      const v = 170 + Math.random() * 60;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, i * plank, s, plank - 2);
      g.fillStyle = 'rgba(40,40,40,0.6)'; g.fillRect(0, i * plank + plank - 2, s, 2);
      for (let k = 0; k < 30; k++) { // Maserung
        g.fillStyle = `rgba(60,60,60,${Math.random() * 0.15})`;
        g.fillRect(Math.random() * s, i * plank + Math.random() * plank, 10 + Math.random() * 40, 1);
      }
    }
  }),
  roof: () => cache.roof ??= canvas(128, (g, s) => {
    g.fillStyle = '#b0b0b0'; g.fillRect(0, 0, s, s);
    const row = s / 10, w = s / 8;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const v = 150 + Math.random() * 70;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(c * w - (r % 2) * w / 2, r * row, w - 1, row - 1);
      }
      g.fillStyle = 'rgba(30,30,30,0.5)'; g.fillRect(0, r * row + row - 2, s, 2);
    }
  }),
  stone: () => cache.stone ??= canvas(128, (g, s) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, s, s);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) {
      const v = 140 + Math.random() * 80;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(c * 22 + (r % 2) * 11 + 1, r * 16 + 1, 20 + Math.random() * 4, 14);
    }
  }),
  needles: () => cache.needles ??= canvas(128, (g, s) => {
    noise(g, s, '#9a9a9a', 120, 5000, 1, 3, 0.6);
    for (let i = 0; i < 700; i++) {
      const v = Math.random() < 0.5 ? 60 : 210;
      g.strokeStyle = `rgba(${v},${v},${v},0.4)`;
      const x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + 3 + Math.random() * 4); g.stroke();
    }
  }),
  // feine Körnung für Innenräume
  grain: () => cache.grain ??= canvas(128, (g, s) => {
    noise(g, s, '#ebebeb', 45, 5000, 1, 2, 0.3);
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 20;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(90,90,90,0.07)'); gr.addColorStop(1, 'rgba(90,90,90,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }),
  // weiche grosse Flecken für Abwechslung auf den Wiesen (hell/dunkel, trocken/saftig)
  macro: () => cache.macro ??= canvas(128, (g, s) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 26;
      const v = Math.random() < 0.5 ? 255 : 0;
      for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s], [s, s], [-s, -s], [s, -s], [-s, s]]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        gr.addColorStop(0, `rgba(${v},${v},${v},0.22)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
        g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }),
  water: () => cache.water ??= canvas(128, (g, s) => {
    noise(g, s, '#b8c4c8', 60, 2500, 1, 4, 0.3);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.4})`;
      const x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + Math.random() * 14, y); g.stroke();
    }
  }),
};

// Gelände: grosse helle/dunkle und trockene/saftige Flecken, damit nicht alles gleich grün ist
function macroVariation(mat) {
  const macro = tex.macro();
  macro.colorSpace = THREE.NoColorSpace;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMacro = { value: macro };
    sh.fragmentShader = 'uniform sampler2D uMacro;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float mA = texture2D(uMacro, vMapUv * 0.06).r;
      float mB = texture2D(uMacro, vMapUv * 0.013 + 0.37).r;
      float mC = texture2D(uMacro, vMapUv * 0.21 + 0.71).r;
      diffuseColor.rgb *= 1.0 + (mA - 0.5) * 0.9 + (mC - 0.5) * 0.5;
      float green = diffuseColor.g - max(diffuseColor.r, diffuseColor.b);
      float dry = smoothstep(0.5, 0.7, mB) * smoothstep(0.0, 0.05, green);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.06, 0.72), dry * 0.7);
      float lush = smoothstep(0.5, 0.3, mB) * smoothstep(0.0, 0.05, green);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 1.05, 0.8), lush * 0.6);`);
  };
  return mat;
}

// Einheitliche Materialien
export function materials() {
  const lam = (map, extra = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, map, ...extra });
  return {
    terrain: macroVariation(lam(tex.grass())),
    rock: lam(tex.rock()),
    road: lam(tex.asphalt(), { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    plaster: lam(tex.plaster()),
    wood: lam(tex.wood()),
    roof: lam(tex.roof()),
    stone: lam(tex.stone()),
    plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glass: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x667788 }),
    tree: lam(tex.needles()),
    water: new THREE.MeshPhongMaterial({ color: 0x638582, map: tex.water(), shininess: 60, specular: 0x8899aa, transparent: true, opacity: 0.86, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
}
