import * as THREE from 'three';
import { makeBlobShadow } from './shadow.js';
import { HALF } from './terrain.js';

const box = (w, h, d, color, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, flatShading: true }));
  m.position.set(x, y, z);
  return m;
};

/** Die Spielfigur zu Fuss. */
export class Player {
  constructor(scene, world) {
    this.world = world;
    this.radius = 0.38;
    this.walkSpeed = 2.4;
    this.runSpeed = 6.8;
    this.gravity = 22;
    this.jumpSpeed = 8.2;
    this.vy = 0;
    this.grounded = true;
    this.phase = 0;
    this.speed = 0;

    // Einfache Figur aus Klötzen: Karohemd, Jeans, Mütze
    const g = new THREE.Group();
    const hip = new THREE.Group(); hip.position.y = 0.95; g.add(hip);
    const torso = box(0.56, 0.62, 0.32, 0xa3322b, 0, 0.36, 0); hip.add(torso);
    const head = box(0.3, 0.32, 0.3, 0xe1b28e, 0, 0.86, 0); hip.add(head);
    hip.add(box(0.33, 0.1, 0.34, 0x26364f, 0, 1.04, 0.02));      // Mütze
    hip.add(box(0.34, 0.04, 0.18, 0x26364f, 0, 1.0, 0.2));       // Schild
    hip.add(box(0.06, 0.06, 0.04, 0x222222, -0.07, 0.88, 0.16)); // Augen
    hip.add(box(0.06, 0.06, 0.04, 0x222222, 0.07, 0.88, 0.16));
    const limb = (w, h, color, x, y) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
      pivot.add(box(w, h, w, color, 0, -h / 2, 0));
      return pivot;
    };
    this.armL = limb(0.16, 0.6, 0xa3322b, -0.37, 0.64); hip.add(this.armL);
    this.armR = limb(0.16, 0.6, 0xa3322b, 0.37, 0.64); hip.add(this.armR);
    this.legL = limb(0.2, 0.95, 0x3a4f78, -0.14, 0.02); hip.add(this.legL);
    this.legR = limb(0.2, 0.95, 0x3a4f78, 0.14, 0.02); hip.add(this.legR);
    this.hip = hip;
    this.mesh = g;
    scene.add(g);

    this.shadow = makeBlobShadow(1.1, 1.1);
    scene.add(this.shadow);

    this.position = new THREE.Vector3(world.spawn.x, 0, world.spawn.z);
    this.position.y = world.terrain.heightAt(this.position.x, this.position.z);
    this.heading = 0;
  }

  setVisible(v) { this.mesh.visible = v; this.shadow.visible = v; }

  groundAt(x, z, feetY) {
    const t = this.world.terrain.heightAt(x, z);
    const s = this.world.colliders.supportAt(x, z, this.radius, feetY);
    return Math.max(t, s);
  }

  update(dt, input, camYaw) {
    const p = this.position;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    let wx = fx * input.move.y + rx * input.move.x;
    let wz = fz * input.move.y + rz * input.move.x;
    const strength = Math.min(1, Math.hypot(input.move.x, input.move.y));
    if (strength > 0.001) { wx /= strength || 1; wz /= strength || 1; }

    // wenig drücken = gehen, ganz drücken = rennen
    const target = strength < 0.6
      ? this.walkSpeed * (strength / 0.6)
      : this.walkSpeed + (this.runSpeed - this.walkSpeed) * ((strength - 0.6) / 0.4);
    this.speed += (target - this.speed) * Math.min(1, dt * 10);

    if (strength > 0.05) {
      const want = Math.atan2(wx, wz);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 12);
    }

    // waagrecht bewegen
    let nx = p.x + wx * this.speed * dt * (strength > 0.001 ? 1 : 0);
    let nz = p.z + wz * this.speed * dt * (strength > 0.001 ? 1 : 0);

    // zu steile Hänge blockieren
    const hOld = this.world.terrain.heightAt(p.x, p.z);
    const hNew = this.world.terrain.heightAt(nx, nz);
    const dist = Math.hypot(nx - p.x, nz - p.z);
    if (dist > 1e-4 && (hNew - hOld) / dist > 1.1 && hNew > p.y + 0.2) { nx = p.x; nz = p.z; }

    const r = this.world.colliders.resolve(nx, nz, this.radius, p.y);
    nx = Math.max(-HALF + 5, Math.min(HALF - 5, r.x));
    nz = Math.max(-HALF + 5, Math.min(HALF - 5, r.z));
    p.x = nx; p.z = nz;

    // springen und fallen
    const ground = this.groundAt(p.x, p.z, p.y);
    if (input.consume('jump') && this.grounded) { this.vy = this.jumpSpeed; this.grounded = false; }
    this.vy -= this.gravity * dt;
    p.y += this.vy * dt;
    if (p.y <= ground) {
      // kleine Stufen runter "kleben" lassen, damit man nicht hüpft
      p.y = ground; this.vy = 0; this.grounded = true;
    } else if (this.grounded && p.y - ground < 0.4 && this.vy <= 0) {
      p.y = ground; this.vy = 0;
    } else {
      this.grounded = false;
    }

    this.animate(dt);
  }

  animate(dt) {
    const run = this.speed / this.runSpeed;
    this.phase += dt * (4 + this.speed * 1.6);
    const swing = Math.sin(this.phase) * Math.min(1, this.speed / 2) * (0.55 + run * 0.4);
    if (!this.grounded) {
      this.legL.rotation.x = -0.5; this.legR.rotation.x = 0.3;
      this.armL.rotation.x = -2.4; this.armR.rotation.x = -2.4;
    } else {
      this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.9; this.armR.rotation.x = swing * 0.9;
    }
    this.hip.position.y = 0.95 + Math.abs(Math.sin(this.phase)) * 0.06 * Math.min(1, this.speed / 2);
    this.hip.rotation.x = run * 0.18;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    const g = this.world.terrain.heightAt(this.position.x, this.position.z);
    const s = this.world.colliders.supportAt(this.position.x, this.position.z, this.radius, this.position.y + 0.01);
    this.shadow.position.set(this.position.x, Math.max(g, s) + 0.05, this.position.z);
  }

  teleport(x, z, heading) {
    this.position.set(x, this.groundAt(x, z, this.world.terrain.heightAt(x, z) + 0.3), z);
    this.heading = heading;
    this.vy = 0; this.speed = 0; this.grounded = true;
  }
}
