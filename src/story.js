import * as THREE from 'three';
import { Car } from './car.js';
import { Builder } from './builder.js';
import { makeCharacter } from './player.js';

// Story, Kapitel 1 (1990): Lars Kasslov flieht nach einem Raubüberfall in Glarus über den
// Pragelpass in den Stalden, findet im Hell's Club Hilfe bei Bruno Hell und bezieht eine Wohnung.
// Ablauf: Zwischensequenz -> Wagen verstecken -> in den Club (Gespräch) -> zur Wohnung (speichern).

// Spielstand des gewählten Kontos (siehe profiles.js)
let SAVE_KEY = 'muotathal-save';
export function setSaveKey(k) { SAVE_KEY = k; }
export function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch (_) { return null; } }
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* egal */ } }
function writeSave(data) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (_) { /* egal */ } }

// Gespräch im Club. who: 'B' = Bruno Hell, 'L' = Lars Kasslov
const CLUB_TALK = [
  ['B', 'Wir haben zu. … Ausser für Leute, die nicht von hier sind.'],
  ['L', 'Ich brauche einen Platz zum Schlafen. Und keine Fragen.'],
  ['B', 'Keine Fragen kosten extra. Du bist Kasslov, der aus Glarus. Das Radio redet seit heute Morgen von nichts anderem.'],
  ['L', 'Und?'],
  ['B', 'Und nichts. Im Stalden hört keiner Radio. Ich bin Bruno. Bruno Hell. Das hier ist mein Laden.'],
  ['B', 'Drüben im Block steht eine Wohnung leer. Klein, feucht, aber da klopft keine Polizei.'],
  ['L', 'Was willst du dafür?'],
  ['B', 'Ab und zu erledigst du etwas für mich. Kleine Aufträge. Nichts, was einer aus Glarus nicht kann.'],
  ['L', 'Abgemacht.'],
  ['B', 'Hier, der Schlüssel. Dritter Stock. Und Kasslov … lass den Wagen stehen. Der ist heiss.'],
];

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
    this.ui.skip.addEventListener('click', () => {
      if (!this.active) return;
      if (this.mode === 'talk') this.endTalk(); else this.finish();
    });
    this.ui.dialog = document.getElementById('dialog');
    this.ui.dname = document.getElementById('dialog-name');
    this.ui.dtext = document.getElementById('dialog-text');
    this.ui.dialog.addEventListener('pointerup', (e) => { e.stopPropagation(); if (this.mode === 'talk') this.nextLine(); });
    this.focus = new THREE.Vector3();
  }

  get available() { return !!this.route; }

  // Die Kameraeinstellungen. s = Weg auf der Pragelstrasse in Metern
  makeShots() {
    const E = this.end;
    return [
      { dur: 6.5, s0: Math.max(0, E - 430), v0: 21, v1: 21, cam: 'wide',
        text: 'Glarus, 1990. Der Raubüberfall ist schiefgegangen.' },
      { dur: 6.5, s0: Math.max(0, E - 260), v0: 21, v1: 19, cam: 'chase',
        text: 'Lars Kasslov flieht über den Pragel. Niemand hat ihn gesehen.' },
      { dur: 9, s0: Math.max(0, E - 70), v0: 14, v1: 0, brake: true, cam: 'arrive',
        text: 'Stalden, Muotathal. Hier muss er untertauchen.' },
    ];
  }

  // game: { enterCar, exitCar, player, follow, toast, currentCar() }
  attach(game) { this.game = game; }

  // Spielstart: neues Spiel mit Zwischensequenz oder weiter beim gespeicherten Stand
  begin() {
    const save = loadSave();
    const lm = this.world.landmarks || {};
    if (save && lm.club && lm.home) {
      if (lm.club.parking) this.parkCar(lm.club.parking);
      if (save.step === 'home') {
        this.placeOnFoot(lm.club.door, lm.club.heading + Math.PI);
        this.setStep('home');
      } else {
        this.placeOnFoot(lm.home.door, lm.home.heading + Math.PI);
        this.game.toast('Willkommen zurück, Lars.', 4);
      }
      return;
    }
    this.start((car) => {
      if (!car) return;
      this.game.enterCar(car);
      this.game.follow.yaw = car.heading;
      this.game.follow.focus.set(car.x, car.mesh.position.y + 1.5, car.z);
      this.setStep(lm.club ? (lm.club.parking ? 'park' : 'club') : null);
    });
  }

  placeOnFoot(p, heading, camYaw = heading) {
    this.game.player.teleport(p.x, p.z, heading);
    this.game.follow.yaw = camYaw;
    this.game.follow.focus.set(p.x, this.game.player.position.y + 1.5, p.z);
  }

  parkCar(p) {
    const c = this.car;
    if (!c) return;
    c.story = false;
    c.x = p.x; c.z = p.z; c.heading = p.heading; c.speed = 0; c.groundY = undefined;
    c.placeOnGround();
  }

  start(onDone) {
    if (!this.route) { onDone && onDone(null); return; }
    this.onDone = onDone;
    this.mode = 'intro';
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
    if (this.mode === 'talk') { this.updateTalk(dt); return; }
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
    this.mode = null;
    this.onDone && this.onDone(this.car);
  }

  // ---------- Ziele von Kapitel 1 ----------
  setStep(step) {
    this.step = step;
    const lm = this.world.landmarks || {};
    const inn = this.game && this.game.interiors;
    const S = (inn && inn.club && inn.club.spots) || null, H = (inn && inn.block && inn.block.spots) || null;
    if (step === 'park') this.setObjective("Versteck den Wagen auf dem Parkplatz neben dem Hell's Club", lm.club.parking, 4.5, { car: true });
    else if (step === 'club') {
      if (S) this.setObjective("Geh in den Hell's Club", lm.club.entry, 1.6, { foot: true, hold: true });
      else this.setObjective("Steig aus und geh in den Hell's Club", lm.club.door, 1.8, { foot: true });
    } else if (step === 'bruno') this.setObjective('Sprich mit Bruno an der Bar', S.bruno, 1.3, { foot: true });
    else if (step === 'home') {
      if (H) this.setObjective('Geh zu deiner Wohnung im Block gegenüber', lm.home.door, 1.8, { foot: true, hold: true });
      else this.setObjective('Geh zu deiner Wohnung im Block gegenüber', lm.home.door, 1.8, { foot: true });
    } else if (step === 'flat') this.setObjective('Geh die Treppe hoch in den 3. Stock', H.flat, 1.0, { foot: true });
    else if (step === 'bed') this.setObjective('Leg dich ins Bett', H.bed, 1.2, { foot: true });
    else this.clearObjective();
  }

  // Innenraum betreten (von den Innenräumen gemeldet)
  onEnter(where) {
    if (this.step === 'club' && where === 'club') this.setStep('bruno');
    else if (this.step === 'home' && where === 'block') this.setStep('flat');
  }

  // Speichern im Bett: aktueller Kapitelstand
  saveHere() {
    const step = this.step === 'bed' || this.step === 'flat' || !this.step ? 'free' : this.step;
    if (this.step === 'bed' || this.step === 'flat') this.setStep(null);
    writeSave({ v: 1, chapter: 1, step: step === 'free' ? 'free' : 'home' });
  }

  setObjective(text, p, radius, need = {}) {
    this.objective = { text, x: p.x, y: p.y, z: p.z, radius, need };
    this.ui.obj.textContent = text;
    this.ui.obj.classList.add('show');
    if (!this.marker) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
      g.translate(0, 0.5, 0);
      const m = new THREE.MeshBasicMaterial({ color: 0xf2c230, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, fog: false });
      this.marker = new THREE.Mesh(g, m);
      this.scene.add(this.marker);
    }
    this.marker.scale.set(radius * 0.8, need.car ? 3 : 2.2, radius * 0.8);
    this.marker.position.set(p.x, (p.y !== undefined ? p.y : this.world.terrain.heightAt(p.x, p.z)) - 0.2, p.z);
    this.marker.visible = true;
  }

  clearObjective() {
    this.objective = null;
    this.ui.obj.classList.remove('show');
    if (this.marker) this.marker.visible = false;
  }

  // Jedes Bild: Ziel erreicht? Gibt einen Hinweistext zurück, wenn etwas passiert ist.
  checkObjective(pos, car) {
    const o = this.objective;
    if (!o || this.active) return null;
    if (this.marker) this.marker.material.opacity = 0.24 + Math.sin(performance.now() / 300) * 0.08;
    if (Math.hypot(pos.x - o.x, pos.z - o.z) > o.radius) return null;
    if (o.y !== undefined && Math.abs(pos.y - o.y) > 1.6) return null;
    if (o.need.hold) return null;   // hier muss man „Betreten“ tippen
    if (o.need.car && (!car || Math.abs(car.speed) > 1.5)) return null;
    if (o.need.foot && car) return null;
    if (this.step === 'park') { this.setStep('club'); return 'Wagen versteckt'; }
    if (this.step === 'club' || this.step === 'bruno') { this.clearObjective(); this.startTalk(); return null; }
    if (this.step === 'flat') { this.setStep('bed'); return 'Deine Wohnung'; }
    if (this.step === 'home' || this.step === 'bed') {
      this.step = null;
      this.clearObjective();
      writeSave({ v: 1, chapter: 1, step: 'free' });
      return 'Neue Bleibe gefunden. Kapitel 1 geschafft!';
    }
    return null;
  }

  // ---------- Gespräch im Hell's Club ----------
  startTalk() {
    const lm = this.world.landmarks.club;
    const inn = this.game.interiors;
    if (inn && inn.inside === 'club') this.room = inn.talkRoom();
    else if (!this.room || this.room.inside) this.room = buildClubRoom(this.scene, lm, this.world.terrain);
    this.mode = 'talk';
    this.active = true;
    this.line = -1;
    this.lineTime = 0;
    this.room.group.visible = true;
    document.body.classList.add('cutscene');
    this.ui.dialog.classList.add('show');
    if (!this.room.inside) this.game.player.setVisible(false);
    this.flash();
    this.focus.copy(this.room.center);
    this.nextLine();
  }

  nextLine() {
    this.line++;
    if (this.line >= CLUB_TALK.length) { this.endTalk(); return; }
    const [who, text] = CLUB_TALK[this.line];
    this.ui.dname.textContent = who === 'B' ? 'Bruno Hell' : 'Lars Kasslov';
    this.ui.dname.className = who === 'B' ? 'bruno' : 'lars';
    this.ui.dtext.textContent = text;
    this.lineTime = 0;
    // Kamera über die Schulter des Zuhörers auf den Sprecher, erste Zeile als Totale
    const r = this.room;
    const S = who === 'B' ? r.bruno : r.lars, H = who === 'B' ? r.lars : r.bruno;
    const cam = this.camera;
    if (this.line === 0) {
      cam.position.copy(r.wide);
    } else {
      const dx = S.position.x - H.position.x, dz = S.position.z - H.position.z, l = Math.hypot(dx, dz) || 1;
      cam.position.set(H.position.x - dx / l * 1.9 + dz / l * 0.8, H.position.y + 1.85, H.position.z - dz / l * 1.9 - dx / l * 0.8);
    }
    // etwas tiefer zielen, damit die Köpfe über dem Dialogfenster stehen
    this.look = new THREE.Vector3(S.position.x, S.position.y + 1.1, S.position.z);
    cam.lookAt(this.look);
  }

  updateTalk(dt) {
    this.lineTime += dt;
    const r = this.room;
    // ein wenig Leben: Sprecher wippt, Diskokugel dreht sich
    const who = CLUB_TALK[Math.max(0, this.line)][0];
    const S = who === 'B' ? r.bruno : r.lars;
    S.userData.fig.head.rotation.y = Math.sin(this.lineTime * 3) * 0.08;
    S.userData.fig.armR.rotation.x = -0.2 - Math.abs(Math.sin(this.lineTime * 2.2)) * 0.35;
    r.ball.rotation.y += dt * 0.8;
    // langsamer Kameraschwenk in der Totale
    if (this.line === 0) { this.camera.position.x += dt * 0.15; this.camera.lookAt(this.look); }
  }

  endTalk() {
    this.mode = null;
    this.active = false;
    this.room.group.visible = false;
    document.body.classList.remove('cutscene');
    this.ui.dialog.classList.remove('show');
    this.game.player.setVisible(true);
    const lm = this.world.landmarks.club;
    if (this.room.inside) {
      // im Club bleiben, Blick Richtung Ausgang
      const P = this.game.player;
      this.game.follow.yaw = P.heading;
      this.game.follow.focus.set(P.position.x, P.position.y + 1.5, P.position.z);
    } else this.placeOnFoot(lm.door, lm.heading + Math.PI, lm.heading);   // Kamera zeigt auf die Fassade
    this.flash();
    writeSave({ v: 1, chapter: 1, step: 'home' });
    this.setStep('home');
    this.game.toast('Schlüssel erhalten', 3);
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

// ---------- Innenraum des Clubs (nur für die Szene, tief unter dem Haus versteckt) ----------
// Ungelichtete Farben (MeshBasic), Schummerlicht ist in den Farben schon drin.
function buildClubRoom(scene, club, terrain) {
  const g0 = terrain.heightAt(club.x, club.z) - 80;
  const O = new THREE.Vector3(club.x, g0, club.z);
  const b = new Builder();
  const W = 11, Dp = 8, H = 3.3;
  b.box(0, -0.1, 0, W, 0.2, Dp, 0x2a1418);                    // Teppich
  for (let i = -5; i <= 5; i++) b.box(i, 0.005, 0, 0.04, 0.01, Dp, 0x34191e);
  b.box(0, H + 0.1, 0, W, 0.2, Dp, 0x120c10);                 // Decke
  b.box(0, H / 2, -Dp / 2 - 0.1, W, H, 0.2, 0x3a1830);        // Wände
  b.box(0, H / 2, Dp / 2 + 0.1, W, H, 0.2, 0x2c1226);
  b.box(-W / 2 - 0.1, H / 2, 0, 0.2, H, Dp, 0x341429);
  b.box(W / 2 + 0.1, H / 2, 0, 0.2, H, Dp, 0x2f1224);
  // Neonleisten
  b.box(0, H - 0.25, -Dp / 2 + 0.02, W - 0.4, 0.06, 0.04, 0xff3a8a);
  b.box(-W / 2 + 0.02, H - 0.25, 0, 0.04, 0.06, Dp - 0.4, 0x3ac8ff);
  b.box(W / 2 - 0.02, H - 0.25, 0, 0.04, 0.06, Dp - 0.4, 0x3ac8ff);
  // Bar mit Regal und Flaschen
  b.box(-1.5, 0.55, -2.6, 5, 1.1, 0.7, 0x4a2a1c);
  b.box(-1.5, 1.13, -2.6, 5.2, 0.06, 0.85, 0x6b3f28);
  b.box(-1.5, 1.6, -3.85, 5.4, 0.05, 0.3, 0x3a2016);
  b.box(-1.5, 2.1, -3.85, 5.4, 0.05, 0.3, 0x3a2016);
  const bottles = [0x2f6b3a, 0x8a5a1a, 0xc8c8c0, 0x6a1a1a, 0x2a4a7a, 0xd0a030];
  for (let i = 0; i < 26; i++) {
    const x = -4 + (i % 13) * 0.4, y = i < 13 ? 1.78 : 2.28;
    b.box(x, y, -3.85, 0.09, 0.32, 0.09, bottles[(i * 7) % bottles.length]);
  }
  for (const x of [-3, -1.8, -0.6, 0.6]) {
    b.box(x, 0.4, -1.95, 0.08, 0.8, 0.08, 0x777777);
    b.box(x, 0.82, -1.95, 0.42, 0.08, 0.42, 0x8a1a2a);
  }
  // kleine Bühne mit Vorhang und Spiegeln
  b.box(3.6, 0.2, -2.2, 3, 0.4, 3, 0x1a1a1e);
  b.box(3.6, 0.41, -2.2, 2.6, 0.02, 2.6, 0x3a3a44);
  for (let k = 0; k < 9; k++) b.box(2.25 + k * 0.33, H / 2 + 0.2, -3.85, 0.3, H - 0.4, 0.12, k % 2 ? 0x7a0f1c : 0x8f1424);
  // Tische mit Sesseln
  for (const [x, z] of [[2.5, 1.8], [-0.5, 2], [-3.6, 1.2]]) {
    b.box(x, 0.36, z, 0.9, 0.06, 0.9, 0x5a3a26);
    b.box(x, 0.18, z, 0.12, 0.36, 0.12, 0x2a2a2a);
    for (const s of [-1, 1]) b.box(x + s * 0.9, 0.25, z, 0.6, 0.5, 0.7, 0x5a1020);
    b.box(x, 0.42, z, 0.08, 0.1, 0.08, 0xffd27a);             // Kerze
  }
  const group = new THREE.Group();
  const mesh = b.build(new THREE.MeshBasicMaterial({ vertexColors: true }));
  group.add(mesh);
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({ color: 0xc8c8d0, wireframe: false }));
  ball.position.set(0.5, H - 0.6, 0);
  group.add(ball);
  // Figuren
  const bruno = makeCharacter({ jacket: 0x5a1020, shirt: 0xe8dcc8, pants: 0x1e1e22, hair: 0x101010, skin: 0xc08a6a, shoe: 0x111111, wide: 1.25 });
  const bf = bruno.part;
  bruno.head.add(bf(new THREE.BoxGeometry(0.2, 0.05, 0.03), bruno.M(0x050505), 0, 0.02, 0.105));                 // Sonnenbrille
  bruno.hip.add(bf(new THREE.TorusGeometry(0.1, 0.012, 6, 16), bruno.M(0xd4af37), 0, 0.55, 0.1, 1, 1.2, 1));    // Goldkette
  const lars = makeCharacter();
  const B = bruno.group, L = lars.group;
  B.userData.fig = bruno; L.userData.fig = lars;
  B.position.set(-0.6, 0, -1.4); L.position.set(-0.4, 0, 0.4);
  B.rotation.y = Math.atan2(L.position.x - B.position.x, L.position.z - B.position.z);
  L.rotation.y = Math.atan2(B.position.x - L.position.x, B.position.z - L.position.z);
  // Licht für die Figuren: ungelichtete Farben wären zu flach, darum eigene Lambert-Farben aufhellen
  for (const fig of [bruno, lars]) fig.group.traverse((o) => { if (o.material && o.material.emissive) o.material.emissive.copy(o.material.color).multiplyScalar(0.25); });
  group.add(B, L);
  group.position.copy(O);
  group.visible = false;
  scene.add(group);
  const toWorld = (o) => o.getWorldPosition(new THREE.Vector3());
  group.updateMatrixWorld(true);
  return {
    group, ball,
    bruno: { get position() { return toWorld(B); }, userData: B.userData },
    lars: { get position() { return toWorld(L); }, userData: L.userData },
    center: O.clone().add(new THREE.Vector3(0, 1.5, 0)),
    wide: O.clone().add(new THREE.Vector3(3.8, 2.4, 3.3)),
  };
}
