import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Car } from './car.js';
import { FollowCamera } from './camera.js';
import { Minimap } from './minimap.js';

const SKY = 0x8fb7dc;
const startEl = document.getElementById('start');
startEl.classList.add('loading');

// ---------- Renderer ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 90, 430);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 900);

// Licht: Sonne + Himmel/Boden-Licht
scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a6b3a, 1.5));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.position.set(-0.5, 1, -0.35);
scene.add(sun);

// Sonne am Himmel
const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
scene.add(sunDisc);

// ---------- Welt und Spielfiguren ----------
const world = buildWorld(scene);
const input = new Input();
const player = new Player(scene, world);
const cars = world.carSpawns.map((s) => new Car(scene, world, s));
const follow = new FollowCamera(camera, world);
follow.yaw = 0;
follow.focus.set(player.position.x, player.position.y + 1.5, player.position.z);
const minimap = new Minimap(document.getElementById('minimap'), world);

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

// Gebiet-Anzeige wie bei Open-World-Spielen
let lastArea = '';
function areaName() {
  const z = player.position.z;
  if (currentCar ? false : player.position.y > 40) return 'Bergwald';
  if (z < -40) return 'Talboden Süd';
  if (z < 160) return 'Muotathal Dorf';
  return 'Hinterthal';
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
  for (const c of cars) c.update(dt, input);
  if (currentCar) { player.position.set(currentCar.x, currentCar.mesh.position.y, currentCar.z); }

  const target = currentCar ? currentCar.mesh.position : player.position;
  follow.update(dt, look, target, currentCar ? 'car' : 'foot', currentCar ? currentCar.heading : 0, currentCar ? currentCar.speed : 0);

  // Sonne und Wolken
  sunDisc.position.copy(camera.position).addScaledVector(sun.position.clone().normalize(), 600);
  sunDisc.lookAt(camera.position);
  world.clouds.position.x = ((now / 1000) * 1.5) % 120;

  speedEl.textContent = currentCar ? currentCar.kmh + ' km/h' : '';

  const area = areaName();
  if (area !== lastArea) { lastArea = area; toast(area); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) toastEl.classList.remove('show'); }

  minimap.update(dt, player.position, currentCar ? currentCar.heading : player.heading, follow.yaw, cars);

  renderer.render(scene, camera);

  // FPS messen und bei Bedarf die Auflösung senken
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 1) {
    const fps = fpsFrames / fpsTime;
    fpsEl.textContent = Math.round(fps) + ' FPS';
    if (fps < 28) slowTime++; else slowTime = 0;
    if (slowTime >= 3 && pixelRatio > 0.6) {
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
follow.update(0.016, { x: 0, y: 0 }, player.position, 'foot', 0, 0);
requestAnimationFrame(frame);

startEl.addEventListener('pointerup', async () => {
  startEl.style.display = 'none';
  running = true;
  last = performance.now();
  try {
    if (document.documentElement.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  } catch (_) { /* nicht jedes Handy erlaubt das */ }
  setTimeout(resize, 300);
}, { once: true });

// Für Tests im Browser
window.__game = { player, cars, input, follow, world, get currentCar() { return currentCar; } };
