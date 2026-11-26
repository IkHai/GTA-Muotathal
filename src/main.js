import * as THREE from 'three';
import { loadWorld } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Car } from './car.js';
import { FollowCamera } from './camera.js';
import { Minimap, BigMap } from './minimap.js';
import { Traffic } from './traffic.js';
import { Story } from './story.js';

import { setRenderer } from './textures.js';

const HAZE = 0xb4c0c6;
const startEl = document.getElementById('start');
startEl.classList.add('loading');

// ---------- Renderer ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
setRenderer(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, 250, 5200);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 9000);

// Licht: warme Nachmittagssonne, bläulicher Himmel, bräunlicher Boden
scene.add(new THREE.HemisphereLight(0xc4d6e8, 0x6a5c40, 1.5));
const sunDir = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();
const sun = new THREE.DirectionalLight(0xffdcae, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
const sc = sun.shadow.camera;
sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 500;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// Himmel: Verlauf vom dunstigen Horizont zu tiefem Blau
const sky = (() => {
  const g = new THREE.SphereGeometry(8500, 24, 12);
  const col = [], p = g.attributes.position;
  const top = new THREE.Color(0x5f86b4), mid = new THREE.Color(0x9fb6cc), hor = new THREE.Color(HAZE);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 8500;
    if (y < 0.05) c.copy(hor); else if (y < 0.3) c.copy(hor).lerp(mid, (y - 0.05) / 0.25); else c.copy(mid).lerp(top, Math.min(1, (y - 0.3) / 0.5));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  return m;
})();
scene.add(sky);

// Sonne am Himmel mit Schein
const sunDisc = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,235,1)'); grad.addColorStop(0.15, 'rgba(255,240,210,0.9)');
  grad.addColorStop(0.4, 'rgba(255,225,180,0.25)'); grad.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true }));
})();
sunDisc.scale.set(1400, 1400, 1);
scene.add(sunDisc);

// ---------- Welt und Spielfiguren ----------
const loadingEl = document.getElementById('loading');
let world;
try {
  world = await loadWorld(scene, (t) => { loadingEl.textContent = t; });
} catch (e) {
  loadingEl.textContent = 'Fehler beim Laden der Karte: ' + e.message;
  throw e;
}
document.getElementById('credits').textContent = 'Karte: ' + [world.meta.sources.terrain, world.meta.aerial && world.terrain.aerial ? 'Luftbild SWISSIMAGE © swisstopo' : '', world.meta.sources.osm].filter(Boolean).join(' · ');
const input = new Input();
const player = new Player(scene, world);
const cars = world.carSpawns.map((s) => new Car(scene, world, s));
const traffic = new Traffic(scene, world, 6);
cars.push(...traffic.cars);
const story = new Story(scene, world, camera);
if (story.available) cars.push(story.car);
const follow = new FollowCamera(camera, world);
follow.yaw = 0;
follow.focus.set(player.position.x, player.position.y + 1.5, player.position.z);
const minimap = new Minimap(document.getElementById('minimap'), world);
const bigMap = new BigMap(minimap, world);

let currentCar = null;
input.setDriving(false);

const fpsEl = document.getElementById('fps');
const speedEl = document.getElementById('speed');
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(text, seconds = 2.5) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  toastTimer = seconds;
}

function nearestCar() {
  let best = null, bestD = 3.8;
  for (const c of cars) {
    const d = Math.hypot(c.x - player.position.x, c.z - player.position.z);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  if (car.traffic) traffic.release(car);
  currentCar = car;
  car.hasDriver = true;
  player.setVisible(false);
  input.setDriving(true);
}

function exitCar() {
  const car = currentCar;
  if (Math.abs(car.speed) > 12) return; // zu schnell zum Aussteigen
  for (const p of car.exitPosition()) {
    const r = world.colliders.resolve(p.x, p.z, player.radius, world.terrain.heightAt(p.x, p.z));
    if (!r.hit) { player.teleport(p.x, p.z, car.heading); break; }
    if (p === car.exitPosition().at(-1)) player.teleport(r.x, r.z, car.heading);
  }
  car.hasDriver = false;
  currentCar = null;
  player.setVisible(true);
  input.setDriving(false);
}

// Gebiet-Anzeige: nächster Ortsname aus OpenStreetMap
let lastArea = '';
let nearEdge = false;
function areaName() {
  const p = player.position;
  let best = 'Muotathal', bestD = Infinity;
  for (const pl of world.places) {
    const w = { village: 1.6, town: 1.8, hamlet: 1, locality: 0.8, neighbourhood: 0.9, isolated_dwelling: 0.5 }[pl.type] || 1;
    const d = Math.hypot(pl.x - p.x, pl.z - p.z) / w;
    if (d < bestD) { bestD = d; best = pl.name; }
  }
  return best;
}

// ---------- Hauptschleife ----------
let last = performance.now();
let fpsFrames = 0, fpsTime = 0, slowTime = 0;
let running = false;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!running) { renderer.render(scene, camera); return; }
  dt = Math.min(dt, 1 / 20); // bei Rucklern nicht durch Wände springen

  // Zwischensequenz: Kamera und Fluchtauto laufen nach Drehbuch
  if (story.active) {
    story.update(dt);
    for (const c of cars) if (!c.traffic && !c.story) c.update(dt, input);
    traffic.update(dt, player, story.car, cars);
    world.updateLamps(dt);
    afterUpdate(now, story.car.mesh.position);
    measureFps(dt);
    return;
  }

  input.update();
  const look = input.consumeLook();

  if (currentCar) {
    if (input.consume('enter')) exitCar();
  } else {
    const car = nearestCar();
    input.setEnterAvailable(!!car);
    if (input.consume('enter') && car) enterCar(car);
  }
  input.consume('enter');

  if (currentCar) input.setEnterAvailable(Math.abs(currentCar.speed) <= 12);

  if (!currentCar) player.update(dt, input, follow.yaw);
  for (const c of cars) if (!c.traffic && !c.story) c.update(dt, input);
  traffic.update(dt, player, currentCar, cars);
  world.updateLamps(dt);
  if (currentCar) { player.position.set(currentCar.x, currentCar.mesh.position.y, currentCar.z); }

  const target = currentCar ? currentCar.mesh.position : player.position;
  follow.update(dt, look, target, currentCar ? 'car' : 'foot', currentCar ? currentCar.heading : 0, currentCar ? currentCar.speed : 0);

  minimap.target = bigMap.target = story.objective;

  afterUpdate(now, target);

  speedEl.textContent = currentCar ? currentCar.kmh + ' km/h' : '';

  const area = areaName();
  if (area !== lastArea) { lastArea = area; toast(area); }
  const done = story.checkObjective(player.position);
  if (done) toast(done, 6);
  // Kartenrand: Hinweis, wenn man nahe dran ist
  const edge = world.half - Math.max(Math.abs(player.position.x), Math.abs(player.position.z));
  if (edge < 25 && !nearEdge) { nearEdge = true; toast('Hier endet die Karte', 3); }
  else if (edge > 60) nearEdge = false;
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

  minimap.update(dt, player.position, currentCar ? currentCar.heading : player.heading, follow.yaw, cars);
  bigMap.update(player.position, currentCar ? currentCar.heading : player.heading, cars);

  renderer.render(scene, camera);
  measureFps(dt);
}

// Himmel, Sonne und Schatten nachführen
function afterUpdate(now, target) {
  // Sonne und Wolken
  sunDisc.position.copy(camera.position).addScaledVector(sunDir, 8000);
  sky.position.copy(camera.position);
  // Schatten folgen der Figur
  sun.target.position.copy(target);
  sun.position.copy(target).addScaledVector(sunDir, 250);
  world.clouds.position.x = ((now / 1000) * 4) % 600;
  world.updateVisibility(camera.position);
  if (story.active) renderer.render(scene, camera);
}

function measureFps(dt) {
  // FPS messen und bei Bedarf die Auflösung senken
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) {
    const fps = fpsFrames / fpsTime;
    fpsEl.textContent = Math.round(fps) + ' FPS';
    if (fps < 28) slowTime++; else slowTime = 0;
    if (slowTime >= 3 && renderer.shadowMap.enabled && pixelRatio <= 1.0) {
      // zuerst Schatten abschalten, wenn die Auflösung schon tief ist
      renderer.shadowMap.enabled = false; sun.castShadow = false;
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      slowTime = 0;
    } else if (slowTime >= 3 && pixelRatio > 0.6) {
      pixelRatio = Math.max(0.6, pixelRatio - 0.2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(innerWidth, innerHeight, false);
      slowTime = 0;
    }
    fpsFrames = 0; fpsTime = 0;
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- Start ----------
startEl.classList.remove('loading');
follow.yaw = Math.atan2(world.carSpawns[0] ? world.carSpawns[0].x - player.position.x : 0, world.carSpawns[0] ? world.carSpawns[0].z - player.position.z : 1);
follow.update(0.016, { x: 0, y: 0 }, player.position, 'foot', 0, 0);
world.updateVisibility(camera.position);
requestAnimationFrame(frame);

startEl.addEventListener('pointerup', async () => {
  startEl.style.display = 'none';
  running = true;
  last = performance.now();
  // Story: Flucht über den Pragel, danach sitzt man im Fluchtauto im Stalden
  story.start((car) => {
    if (!car) return;
    enterCar(car);
    follow.yaw = car.heading;
    follow.focus.set(car.x, car.mesh.position.y + 1.5, car.z);
    lastArea = '';
  });
  try {
    if (document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* nicht jedes Handy erlaubt das */ }
  setTimeout(resize, 300);
}, { once: true });

// Für Tests im Browser
window.__game = { player, cars, input, follow, world, story, enterCar, exitCar, get currentCar() { return currentCar; } };
