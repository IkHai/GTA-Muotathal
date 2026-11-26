import * as THREE from 'three';
import { Builder } from './builder.js';
import { makeBlobShadow } from './shadow.js';

/** Einfaches Arcade-Auto: Gas, Bremse/Rückwärts, Lenken mit dem Joystick. */
export class Car {
  constructor(scene, world, spawn) {
    this.world = world;
    this.x = spawn.x; this.z = spawn.z;
    this.heading = spawn.heading;
    this.speed = 0;
    this.steer = 0;
    this.maxSpeed = 30;        // m/s (~110 km/h)
    this.maxReverse = 8;
    this.accel = 9;
    this.brake = 22;
    this.roll = 3;
    this.hasDriver = false;
    this.bump = 0;
    this.kick = { x: 0, z: 0 };  // Schub nach einem Zusammenstoss (Welt-Richtung, m/s)
    this.spin = 0;               // Drehung nach einem Zusammenstoss (rad/s)

    this.mesh = new THREE.Group();
    this.body = buildBody(spawn.color);
    this.mesh.add(this.body);

    // Räder
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const hubMat = new THREE.MeshPhongMaterial({ color: 0x9a9a9a, shininess: 60 });
    const hubGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.24, 8);
    hubGeo.rotateZ(Math.PI / 2);
    this.wheels = [];
    this.frontPivots = [];
    for (const [x, z, front] of [[-0.8, 1.38, true], [0.8, 1.38, true], [-0.8, -1.38, false], [0.8, -1.38, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.34, z);
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.add(new THREE.Mesh(hubGeo, hubMat));
      pivot.add(w);
      this.mesh.add(pivot);
      this.wheels.push(w);
      if (front) this.frontPivots.push(pivot);
    }
    scene.add(this.mesh);
    this.shadow = makeBlobShadow(2.4, 5, 0.6);
    scene.add(this.shadow);
    this.placeOnGround();
    (Car.all ||= []).push(this);
  }

  get forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  update(dt, input) {
    const gas = this.hasDriver && input.gas;
    const brake = this.hasDriver && input.brake;
    const steerIn = this.hasDriver ? input.move.x : 0;
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 8);

    let s = this.speed;
    if (gas && !brake) s = approach(s, this.maxSpeed, this.accel * (1 - Math.max(0, s) / (this.maxSpeed * 1.4)) * dt);
    else if (brake && s > 0.5) s = approach(s, 0, this.brake * dt);
    else if (brake) s = approach(s, -this.maxReverse, this.accel * 0.6 * dt);
    else s = approach(s, 0, (this.hasDriver ? this.roll : 8) * dt);

    // Lenken: bei Tempo weniger stark, rückwärts umgekehrt
    const speedFactor = Math.min(1, Math.abs(s) / 4) * (1 - Math.min(0.55, Math.abs(s) / 60));
    this.heading -= this.steer * 1.9 * speedFactor * Math.sign(s) * dt;

    // Drehimpuls nach einem Stoss (Auto dreht sich ein wenig)
    if (this.spin) {
      this.heading += this.spin * dt;
      this.spin *= Math.max(0, 1 - dt * 3);
      if (Math.abs(this.spin) < 0.02) this.spin = 0;
    }

    const f = this.forward;
    const k = this.kick;
    let nx = this.x + (f.x * s + k.x) * dt;
    let nz = this.z + (f.z * s + k.z) * dt;

    // zu steil? Dann bleibt das Auto stehen
    const t = this.world.terrain;
    const ry = this.groundY;   // aktuelle Höhe: unter Brücken durchfahren
    const h1 = t.heightAt(nx, nz, ry);
    const dist = Math.hypot(nx - this.x, nz - this.z);
    // Steigung über 2 m gemessen, damit kleine Kanten (Strassenrand, Brückenende) nicht blockieren
    const mvx = (nx - this.x) / (dist || 1), mvz = (nz - this.z) / (dist || 1);
    const ga = t.heightAt(this.x - mvx * 0.5, this.z - mvz * 0.5, ry), gb = t.heightAt(this.x + mvx * 1.5, this.z + mvz * 1.5, ry);
    let blocked = dist > 1e-4 && (gb - ga) / 2 > 0.75;

    // Laternen: mit genug Tempo fallen sie um
    const vx = f.x * s + k.x, vz = f.z * s + k.z, v = Math.hypot(vx, vz);
    if (!blocked && this.world.lampsNear) {
      for (const L of this.world.lampsNear(nx, nz, 3.2)) {
        const lx = L.x - nx, lz = L.z - nz;
        const u = lx * f.x + lz * f.z, w = lx * f.z - lz * f.x;
        if (Math.abs(u) > HL + 0.2 || Math.abs(w) > HW + 0.2) continue;
        if (v > 7) {
          this.world.knockLamp(L, vx, vz, v);
          s *= 0.8; k.x *= 0.8; k.z *= 0.8;
          this.bump = 0.25;
        }
      }
    }

    // Hindernisse: zwei Kreise vorne und hinten
    if (!blocked) {
      for (const off of [1.35, -1.35]) {
        const cx = nx + f.x * off, cz = nz + f.z * off;
        const r = this.world.colliders.resolve(cx, cz, 1.0, h1 + 0.2, 0.1, 1.4);
        // nur blockieren, wenn man sich hineinbewegt (vom Hindernis weg geht immer)
        if (r.hit && (r.x - cx) * (nx - this.x) + (r.z - cz) * (nz - this.z) < 1e-6) { blocked = true; break; }
      }
    }
    // andere Autos: Stoss mit Impuls, beide werden weggestossen
    let hitCar = false;
    if (!blocked && Car.all) {
      for (const o of Car.all) {
        if (o === this || Math.abs(o.x - nx) > 6 || Math.abs(o.z - nz) > 6) continue;
        const now = carOverlap(this.x, this.z, this.heading, o.x, o.z, o.heading);
        const next = carOverlap(nx, nz, this.heading, o.x, o.z, o.heading);
        if (next > 0 && next >= now - 1e-4) {
          blocked = true; hitCar = true;
          s = this.collide(o, s, nx, nz);
          break;
        }
      }
    }
    if (Math.abs(nx) > this.world.half - 6 || Math.abs(nz) > this.world.half - 6) blocked = true;

    if (blocked && !hitCar) {
      if (Math.abs(s) > 6 || Math.hypot(k.x, k.z) > 6) this.bump = 0.25;
      s = -s * 0.25;
      k.x *= -0.25; k.z *= -0.25;
    } else if (!blocked) {
      this.x = nx; this.z = nz;
    }
    // Rutschen quer zur Fahrtrichtung bremst stark (Reifen haften)
    const kl = Math.hypot(k.x, k.z);
    if (kl > 0) {
      const nk = Math.max(0, kl - (5 + kl * 0.8) * dt) / kl;
      k.x *= nk; k.z *= nk;
    }
    this.speed = s;
    this.bump = Math.max(0, this.bump - dt);

    // Räder drehen und lenken
    for (const w of this.wheels) w.rotation.x += s / 0.34 * dt;
    for (const p of this.frontPivots) p.rotation.y = -this.steer * 0.45;
    this.placeOnGround();
  }

  /**
   * Stoss zwischen diesem Auto (Tempo s) und Auto o. Gleiche Masse, etwas elastisch.
   * Gibt das neue Vorwärtstempo zurück; o bekommt den Rest als Schub.
   */
  collide(o, s, nx, nz) {
    const f = this.forward, g = o.forward;
    const os = o.traffic ? o.traffic.speed : o.speed;
    const vax = f.x * s + this.kick.x, vaz = f.z * s + this.kick.z;
    const vbx = g.x * os + o.kick.x, vbz = g.z * os + o.kick.z;
    // Stossrichtung: von der Mitte dieses Autos zum Berührungspunkt bzw. zur Mitte des anderen
    const ox = this.x, oz = this.z;
    this.x = nx; this.z = nz;
    const c = contactPoint(this, o);
    this.x = ox; this.z = oz;
    let n = { x: o.x - this.x, z: o.z - this.z };
    const nl = Math.hypot(n.x, n.z) || 1; n.x /= nl; n.z /= nl;
    const rel = (vax - vbx) * n.x + (vaz - vbz) * n.z;
    if (rel <= 0) return s;
    const j = (1 + 0.3) * rel / 2;
    if (j > 4) this.bump = o.bump = 0.25;
    // dieses Auto
    const ax = vax - n.x * j, az = vaz - n.z * j;
    const ns = ax * f.x + az * f.z;
    this.kick.x = ax - f.x * ns; this.kick.z = az - f.z * ns;
    this.spin += spinFrom(this, c, -n.x * j, -n.z * j);
    // das andere Auto: Verkehr hält bei einem harten Stoss an und wird zum normalen Auto
    if (o.traffic) {
      if (j < 2) { o.traffic.speed = 0; return ns; }
      o.traffic = null;
      o.speed = os;
    }
    const bx = vbx + n.x * j, bz = vbz + n.z * j;
    const bs = bx * g.x + bz * g.z;
    o.speed = bs;
    o.kick.x = bx - g.x * bs; o.kick.z = bz - g.z * bs;
    o.spin += spinFrom(o, c, n.x * j, n.z * j);
    return ns;
  }

  placeOnGround() {
    const t = this.world.terrain;
    const f = this.forward;
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading); // links
    const ry = this.groundY;
    const hf = t.heightAt(this.x + f.x * 1.3, this.z + f.z * 1.3, ry);
    const hb = t.heightAt(this.x - f.x * 1.3, this.z - f.z * 1.3, ry);
    const hl = t.heightAt(this.x + lx * 0.85, this.z + lz * 0.85, ry);
    const hr = t.heightAt(this.x - lx * 0.85, this.z - lz * 0.85, ry);
    const y = Math.max((hf + hb) / 2, (hl + hr) / 2, t.heightAt(this.x, this.z, ry));
    this.groundY = y;
    this.mesh.position.set(this.x, y, this.z);
    this.mesh.rotation.set(-Math.atan2(hf - hb, 2.6), this.heading, Math.atan2(hl - hr, 1.7), 'YXZ');
    // leichtes Wanken beim Beschleunigen und in Kurven
    this.body.rotation.z = this.steer * Math.min(1, Math.abs(this.speed) / 15) * 0.05;
    this.body.rotation.x = this.bump > 0 ? Math.sin(this.bump * 40) * 0.04 : 0;
    this.shadow.position.set(this.x, y + 0.06, this.z);
    this.shadow.rotation.z = this.heading;
  }

  get kmh() { return Math.round(Math.abs(this.speed) * 3.6); }

  exitPosition() {
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    return [
      { x: this.x + lx * 2, z: this.z + lz * 2 },
      { x: this.x - lx * 2, z: this.z - lz * 2 },
      { x: this.x - Math.sin(this.heading) * 3.5, z: this.z - Math.cos(this.heading) * 3.5 },
    ];
  }
}

function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

// Karosserie: viertürige Limousine der 90er (eigenes Design)
function frustum(bw, bl, tw, tl, h, tzOff = 0) {
  // Kiste, oben schmaler/kürzer als unten (für Kabine, Motorhaube)
  const B = [[-bw / 2, 0, -bl / 2], [bw / 2, 0, -bl / 2], [bw / 2, 0, bl / 2], [-bw / 2, 0, bl / 2]];
  const T = [[-tw / 2, h, -tl / 2 + tzOff], [tw / 2, h, -tl / 2 + tzOff], [tw / 2, h, tl / 2 + tzOff], [-tw / 2, h, tl / 2 + tzOff]];
  const q = (a, b, c, d) => [a, b, c, a, c, d];
  const tris = [
    ...q(T[0], T[3], T[2], T[1]), ...q(B[0], B[1], B[2], B[3]),
    ...q(B[0], T[0], T[1], B[1]), ...q(B[1], T[1], T[2], B[2]), ...q(B[2], T[2], T[3], B[3]), ...q(B[3], T[3], T[0], B[0]),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return g;
}

export function buildBody(color) {
  const group = new THREE.Group();
  const paint = new Builder(), trim = new Builder(), glass = new Builder(), lights = new Builder();
  const dark = 0x1c1d1f, chrome = 0xa8a8a8;
  // Unterteil mit leicht schrägen Seiten
  paint.shape(frustum(1.76, 4.5, 1.8, 4.42, 0.42), 0, 0.36, 0, 1, 1, 1, color);
  // Motorhaube und Kofferraum leicht abfallend
  paint.shape(frustum(1.74, 1.3, 1.66, 1.22, 0.1), 0, 0.78, 1.55, 1, 1, 1, color);
  paint.shape(frustum(1.74, 1.0, 1.66, 0.9, 0.12), 0, 0.78, -1.7, 1, 1, 1, color);
  // Kabine: Fensterflächen dunkel, Dach in Wagenfarbe
  glass.shape(frustum(1.66, 2.5, 1.36, 1.55, 0.5, -0.12), 0, 0.78, -0.2, 1, 1, 1, 0x1f262c);
  paint.shape(frustum(1.38, 1.58, 1.34, 1.5, 0.05), 0, 1.27, -0.32, 1, 1, 1, color);
  // Säulen
  for (const s of [-1, 1]) paint.box(s * 0.75, 1.03, -0.2, 0.06, 0.5, 0.08, color);
  // Stossstangen, Schweller, Grill
  trim.box(0, 0.42, 2.24, 1.8, 0.2, 0.1, dark);
  trim.box(0, 0.42, -2.24, 1.8, 0.2, 0.1, dark);
  for (const s of [-1, 1]) trim.box(s * 0.9, 0.42, 0, 0.04, 0.12, 2.6, dark);
  trim.box(0, 0.64, 2.22, 0.8, 0.14, 0.04, 0x2a2a2a);
  trim.box(0, 0.72, 2.22, 0.82, 0.02, 0.05, chrome);
  for (const s of [-1, 1]) {
    lights.box(s * 0.62, 0.66, 2.21, 0.36, 0.13, 0.04, 0xe8e2c8);   // Scheinwerfer
    lights.box(s * 0.64, 0.68, -2.21, 0.36, 0.14, 0.04, 0x8a1610);  // Rücklichter
    trim.box(s * 0.92, 1.0, 0.45, 0.08, 0.06, 0.14, dark);          // Spiegel
    trim.box(s * 0.89, 0.62, 0.0, 0.02, 0.03, 0.18, chrome);       // Türgriffe
    trim.box(s * 0.89, 0.62, -0.9, 0.02, 0.03, 0.18, chrome);
  }
  trim.box(0, 0.5, -2.27, 0.5, 0.12, 0.02, 0xd8d8d0);                // Nummernschild
  const paintMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x666666 });
  const glassMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 120, specular: 0xaabbcc });
  const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const [b, m] of [[paint, paintMat], [glass, glassMat], [trim, trimMat], [lights, lightMat]]) {
    const mesh = b.build(m);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}

// Überlappung zweier Autos (Rechteck 1.9 × 4.5 m). Rückgabe: Eindringtiefe in m (0 = frei).
const HW = 0.95, HL = 2.25;

// Ecke eines Autos, die am tiefsten im anderen steckt (sonst die Mitte zwischen beiden)
function contactPoint(a, b) {
  let best = null, bestD = 0;
  for (const [p, q] of [[a, b], [b, a]]) {
    const f = p.forward, qf = q.forward;
    for (const [u, w] of [[HL, HW], [HL, -HW], [-HL, HW], [-HL, -HW]]) {
      const x = p.x + f.x * u + f.z * w, z = p.z + f.z * u - f.x * w;
      const dx = x - q.x, dz = z - q.z;
      const lu = Math.abs(dx * qf.x + dz * qf.z), lw = Math.abs(dx * qf.z - dz * qf.x);
      const d = Math.min(HL - lu, HW - lw);
      if (d > bestD) { bestD = d; best = { x, z }; }
    }
  }
  return best || { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

// Drehung durch einen Stoss am Punkt c (Trägheit eines 4.5 m langen Autos)
function spinFrom(car, c, jx, jz) {
  const rx = c.x - car.x, rz = c.z - car.z;
  const w = (rz * jx - rx * jz) / 2.0;
  return Math.max(-3, Math.min(3, w * 0.9));
}
export function carOverlap(ax, az, ah, bx, bz, bh) {
  const dx = bx - ax, dz = bz - az;
  if (dx * dx + dz * dz > 30) return 0;
  const axes = [[Math.sin(ah), Math.cos(ah)], [Math.cos(ah), -Math.sin(ah)], [Math.sin(bh), Math.cos(bh)], [Math.cos(bh), -Math.sin(bh)]];
  let min = Infinity;
  for (const [ux, uz] of axes) {
    const ra = HL * Math.abs(ux * axes[0][0] + uz * axes[0][1]) + HW * Math.abs(ux * axes[1][0] + uz * axes[1][1]);
    const rb = HL * Math.abs(ux * axes[2][0] + uz * axes[2][1]) + HW * Math.abs(ux * axes[3][0] + uz * axes[3][1]);
    const d = ra + rb - Math.abs(dx * ux + dz * uz);
    if (d <= 0) return 0;
    if (d < min) min = d;
  }
  return min;
}
