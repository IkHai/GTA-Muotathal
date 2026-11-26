import * as THREE from 'three';
import { Car } from './car.js';

// Story: Flucht von Glarus über den Pragelpass in den Stalden.
// Eine kurze Zwischensequenz (Kamerafahrten mit Untertiteln), danach übernimmt der Spieler.

const STOP_BEFORE = 10;    // so viele Meter vor dem Ortspunkt Stalden hält das Auto
const LANE = 1.4;          // rechte Fahrbahnhälfte

export class Story {
  constructor(scene, world, camera) {
    this.scene = scene;
    this.world = world;
    this.camera = camera;
    this.active = false;
    this.done = false;
    this.route = buildPragelRoute(world);
    this.ui = {
      root: document.body,
      sub: document.getElementById('subtitle'),
      skip: document.getElementById('skip'),
      obj: document.getElementById('objective'),
      fade: document.getElementById('fade'),
    };
    this.objective = null;
    this.marker = null;
    if (!this.route) return;

    this.car = new Car(scene, world, { x: 0, z: 0, heading: 0, color: 0x2b2d31 });
    this.car.story = true;
    this.end = this.route.length - STOP_BEFORE;
    this.shots = this.makeShots();
    this.placeCar(this.shots[0].s0);
    this.ui.skip.addEventListener('click', () => { if (this.active) this.finish(); });
  }

  get available() { return !!this.route; }

  // Die Kameraeinstellungen. s = Weg auf der Pragelstrasse in Metern
  makeShots() {
    const E = this.end;
    return [
      { dur: 6.5, s0: Math.max(0, E - 430), v0: 21, v1: 21, cam: 'wide',
        text: 'Glarus, letzte Nacht. Der Bruch ist schiefgegangen.' },
      { dur: 6.5, s0: Math.max(0, E - 260), v0: 21, v1: 19, cam: 'chase',
        text: 'Über den Pragel, nur weg. Hinten im Klöntal suchen sie schon.' },
      { dur: 9, s0: Math.max(0, E - 70), v0: 14, v1: 0, brake: true, cam: 'arrive',
        text: 'Stalden. Hier kennt dich keiner. Noch nicht.' },
    ];
  }

  start(onDone) {
    if (!this.route) { onDone && onDone(null); return; }
    this.onDone = onDone;
    this.active = true;
    this.shotIndex = -1;
    document.body.classList.add('cutscene');
    this.nextShot();
  }

  nextShot() {
    this.shotIndex++;
    const shot = this.shots[this.shotIndex];
    if (!shot) { this.finish(); return; }
    this.t = 0;
    this.s = shot.s0;
    this.v = shot.v0;
    this.ui.sub.textContent = shot.text;
    this.ui.sub.classList.remove('show');
    void this.ui.sub.offsetWidth;
    this.ui.sub.classList.add('show');
    this.flash();
    // fester Kamerastandort für Totale und Ankunft
    const p = this.pointAt(shot.s0);
    if (shot.cam === 'wide') {
      // hoch über dem Pass, seitlich vor dem Auto
      const q = this.pointAt(shot.s0 + 90);
      this.fixed = new THREE.Vector3(q.x + q.nx * 38, 0, q.z + q.nz * 38);
      this.fixed.y = Math.max(this.ground(this.fixed.x, this.fixed.z), this.ground(p.x, p.z)) + 22;
    } else if (shot.cam === 'arrive') {
      // am Strassenrand im Stalden, das Auto kommt auf die Kamera zu
      const q = this.pointAt(this.end + 6);
      this.fixed = new THREE.Vector3(q.x - q.nx * 7, 0, q.z - q.nz * 7);
      this.fixed.y = this.ground(this.fixed.x, this.fixed.z) + 1.6;
    } else this.fixed = null;
    this.placeCar(this.s);
    this.updateCamera(0, true);
  }

  flash() {
    const f = this.ui.fade;
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 60);
  }

  update(dt) {
    if (!this.active) return;
    const shot = this.shots[this.shotIndex];
    this.t += dt;
    if (shot.brake) {
      // gleichmässig bremsen, so dass das Auto genau am Ziel steht
      const left = this.end - this.s;
      const a = left > 0.05 ? (this.v * this.v) / (2 * left) : 99;
      this.v = Math.max(0, this.v - a * dt);
      if (left < 0.05) this.v = 0;
    } else {
      this.v += (shot.v1 - this.v) * Math.min(1, dt * 0.5);
    }
    this.s = Math.min(this.end, this.s + this.v * dt);
    this.placeCar(this.s);
    this.car.speed = this.v;
    for (const w of this.car.wheels) w.rotation.x += this.v / 0.34 * dt;
    this.updateCamera(dt, false);
    if (this.t >= shot.dur) this.nextShot();
  }

  updateCamera(dt, snap) {
    const shot = this.shots[this.shotIndex];
    const c = this.car, cam = this.camera;
    const target = new THREE.Vector3(c.x, c.mesh.position.y + 1, c.z);
    if (shot.cam === 'chase') {
      const f = c.forward;
      const want = new THREE.Vector3(c.x - f.x * 9 + f.z * 2.5, 0, c.z - f.z * 9 - f.x * 2.5);
      want.y = Math.max(c.mesh.position.y + 3.2, this.ground(want.x, want.z) + 1.5);
      if (snap) cam.position.copy(want); else cam.position.lerp(want, Math.min(1, dt * 6));
      target.set(c.x + f.x * 12, c.mesh.position.y + 1.2, c.z + f.z * 12);
    } else {
      cam.position.copy(this.fixed);
    }
    cam.lookAt(target);
  }

  // Ende der Sequenz (oder Überspringen): Spieler sitzt im Auto im Stalden
  finish() {
    this.active = false;
    this.placeCar(this.end);
    this.car.speed = 0;
    this.car.story = false;
    document.body.classList.remove('cutscene');
    this.ui.sub.classList.remove('show');
    this.flash();
    const village = this.world.places.find((p) => p.name === 'Muotathal') || { x: 143, z: 225 };
    this.setObjective('Fahr ins Dorf Muotathal und tauch unter', village.x, village.z, 30);
    this.onDone && this.onDone(this.car);
  }

  // ---------- Ziel mit Markierung ----------
  setObjective(text, x, z, radius) {
    this.objective = { text, x, z, radius, reached: false };
    this.ui.obj.textContent = text;
    this.ui.obj.classList.add('show');
    if (!this.marker) {
      const g = new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, 60, 24, 1, true);
      g.translate(0, 30, 0);
      const m = new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false });
      this.marker = new THREE.Mesh(g, m);
      this.scene.add(this.marker);
    }
    this.marker.position.set(x, this.world.terrain.heightAt(x, z) - 1, z);
    this.marker.visible = true;
  }

  // Prüft, ob das Ziel erreicht ist. Gibt einen Text zurück, wenn ja.
  checkObjective(pos, dt) {
    const o = this.objective;
    if (!o || o.reached) return null;
    if (this.marker) this.marker.material.opacity = 0.22 + Math.sin(performance.now() / 300) * 0.06;
    if (Math.hypot(pos.x - o.x, pos.z - o.z) < o.radius) {
      o.reached = true;
      this.marker.visible = false;
      this.ui.obj.classList.remove('show');
      this.objective = null;
      return 'Untergetaucht. Fortsetzung folgt …';
    }
    return null;
  }

  // ---------- Hilfen ----------
  ground(x, z) { return this.world.terrain.heightAt(x, z); }

  pointAt(s) {
    const r = this.route, p = r.pts;
    s = Math.max(0, Math.min(r.length, s));
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].d < s) lo = m; else hi = m; }
    const a = p[lo], b = p[hi];
    const t = (s - a.d) / Math.max(1e-6, b.d - a.d);
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    // nx/nz zeigt nach rechts (in Fahrtrichtung gesehen)
    return { x: a.x + dx * t, z: a.z + dz * t, dx: dx / l, dz: dz / l, nx: -dz / l, nz: dx / l };
  }

  placeCar(s) {
    const p = this.pointAt(s), p2 = this.pointAt(s + 4);
    const h = Math.atan2(p2.x - p.x, p2.z - p.z);
    const c = this.car;
    if (c.story && Math.abs(Math.atan2(Math.sin(h - c.heading), Math.cos(h - c.heading))) < 0.5) {
      c.heading += Math.atan2(Math.sin(h - c.heading), Math.cos(h - c.heading)) * 0.2;
    } else c.heading = h;
    c.x = p.x + p.nx * LANE;
    c.z = p.z + p.nz * LANE;
    c.kick.x = c.kick.z = 0;
    c.placeOnGround();
  }
}

// Pragelstrasse vom Kartenrand im Osten bis in den Stalden
function buildPragelRoute(world) {
  const half = world.half - 15;
  const stalden = world.places.find((p) => p.name === 'Stalden');
  const ways = world.osm.roads.filter((r) => r.n === 'Pragelstrasse').map((r) => {
    const pts = [];
    for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i] / 10, r.p[i + 1] / 10]);
    return pts;
  });
  if (!stalden || !ways.length) return null;
  // Teilstücke zu einer Linie verbinden
  const key = (p) => Math.round(p[0]) + ',' + Math.round(p[1]);
  const lines = [];
  const unused = ways.slice();
  while (unused.length) {
    let pts = unused.shift().slice();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < unused.length; i++) {
        const p = unused[i], head = key(pts[0]), tail = key(pts[pts.length - 1]);
        if (key(p[0]) === tail) pts = pts.concat(p.slice(1));
        else if (key(p[p.length - 1]) === tail) pts = pts.concat(p.slice(0, -1).reverse());
        else if (key(p[p.length - 1]) === head) pts = p.slice(0, -1).concat(pts);
        else if (key(p[0]) === head) pts = p.slice(1).reverse().concat(pts);
        else continue;
        unused.splice(i, 1); grown = true; break;
      }
    }
    lines.push(pts);
  }
  // Linie mit dem Punkt am nächsten beim Stalden
  let best = null, bi = 0, bd = Infinity;
  for (const pts of lines) pts.forEach((p, i) => {
    const d = Math.hypot(p[0] - stalden.x, p[1] - stalden.z);
    if (d < bd) { bd = d; best = pts; bi = i; }
  });
  if (!best || bd > 200) return null;
  // Richtung wählen, die zum Kartenrand führt (dort kommt man vom Pass herunter)
  const inside = (p) => Math.abs(p[0]) < half && Math.abs(p[1]) < half;
  const walk = (dir) => {
    const out = [];
    for (let i = bi; i >= 0 && i < best.length; i += dir) { if (!inside(best[i])) break; out.push(best[i]); }
    return out;
  };
  const a = walk(1), b = walk(-1);
  const edgeDist = (p) => half - Math.max(Math.abs(p[0]), Math.abs(p[1]));
  let path = (a.length > 1 && edgeDist(a[a.length - 1]) < (b.length > 1 ? edgeDist(b[b.length - 1]) : Infinity)) ? a : b;
  if (path.length < 2) return null;
  path = path.reverse();   // vom Rand zum Stalden
  const route = { pts: [], length: 0 };
  let acc = 0;
  path.forEach((p, i) => {
    if (i) acc += Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]);
    route.pts.push({ x: p[0], z: p[1], d: acc });
  });
  route.length = acc;
  return route.length > 120 ? route : null;
}
