import * as THREE from 'three';
import { makeBlobShadow } from './shadow.js';


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

    // Figur mit realistischeren Proportionen (ca. 1.80 m)
    const g = new THREE.Group();
    const M = (color) => new THREE.MeshLambertMaterial({ color });
    const jacket = M(0x3b4636), pants = M(0x3c414c), skin = M(0xc4977a), hair = M(0x2a211b), shoe = M(0x2e241c), shirt = M(0x8c8c86);
    const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; return m;
    };
    const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);
    const hip = new THREE.Group(); hip.position.y = 0.95; g.add(hip);
    // Oberkörper
    hip.add(part(cap(0.17, 0.32), jacket, 0, 0.3, 0, 1.25, 1, 0.75));
    hip.add(part(new THREE.BoxGeometry(0.2, 0.3, 0.02), shirt, 0, 0.42, 0.12));   // Shirt unter offener Jacke
    hip.add(part(cap(0.15, 0.08), pants, 0, 0.0, 0, 1.15, 1, 0.8));              // Becken
    hip.add(part(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin, 0, 0.66, 0)); // Hals
    const head = new THREE.Group(); head.position.set(0, 0.8, 0); hip.add(head);
    head.add(part(new THREE.SphereGeometry(0.115, 12, 10), skin, 0, 0, 0, 0.9, 1.1, 1));
    head.add(part(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.03, -0.01, 0.95, 1, 1.02));
    head.add(part(new THREE.BoxGeometry(0.03, 0.04, 0.03), skin, 0, -0.02, 0.11)); // Nase
    const limb = (r, len, mat, x, y, footMat) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
      pivot.add(part(cap(r, len), mat, 0, -len / 2 - r * 0.3, 0));
      if (footMat === 'hand') pivot.add(part(new THREE.SphereGeometry(r * 1.05, 8, 6), skin, 0, -len - r * 1.2, 0));
      else if (footMat) pivot.add(part(new THREE.BoxGeometry(0.11, 0.08, 0.27), footMat, 0, -len - r * 1.2, 0.05));
      return pivot;
    };
    this.armL = limb(0.055, 0.52, jacket, -0.25, 0.5, 'hand'); hip.add(this.armL);
    this.armR = limb(0.055, 0.52, jacket, 0.25, 0.5, 'hand'); hip.add(this.armR);
    this.legL = limb(0.075, 0.78, pants, -0.1, -0.02, shoe); hip.add(this.legL);
    this.legR = limb(0.075, 0.78, pants, 0.1, -0.02, shoe); hip.add(this.legR);
    this.armL.rotation.z = -0.08; this.armR.rotation.z = 0.08;
    this.hip = hip;
    this.mesh = g;
    scene.add(g);

    this.shadow = makeBlobShadow(0.9, 0.9, 0.35);
    scene.add(this.shadow);

    this.position = new THREE.Vector3(world.spawn.x, 0, world.spawn.z);
    this.position.y = world.terrain.heightAt(this.position.x, this.position.z);
    this.heading = 0;
  }

  setVisible(v) { this.mesh.visible = v; this.shadow.visible = v; }

  groundAt(x, z, feetY) {
    const t = this.world.terrain.heightAt(x, z, feetY);
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
    const hOld = this.world.terrain.heightAt(p.x, p.z, p.y);
    const hNew = this.world.terrain.heightAt(nx, nz, p.y);
    const dist = Math.hypot(nx - p.x, nz - p.z);
    if (dist > 1e-4 && (hNew - hOld) / dist > 1.1 && hNew > p.y + 0.2) { nx = p.x; nz = p.z; }

    const r = this.world.colliders.resolve(nx, nz, this.radius, p.y);
    nx = Math.max(-this.world.half + 5, Math.min(this.world.half - 5, r.x));
    nz = Math.max(-this.world.half + 5, Math.min(this.world.half - 5, r.z));
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
      this.armL.rotation.x = -0.7; this.armR.rotation.x = -0.7;
    } else {
      this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.9; this.armR.rotation.x = swing * 0.9;
    }
    this.hip.position.y = 0.95 + Math.abs(Math.sin(this.phase)) * 0.04 * Math.min(1, this.speed / 2);
    this.hip.rotation.x = run * 0.12;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
    const g = this.world.terrain.heightAt(this.position.x, this.position.z, this.position.y);
    const s = this.world.colliders.supportAt(this.position.x, this.position.z, this.radius, this.position.y + 0.01);
    this.shadow.position.set(this.position.x, Math.max(g, s) + 0.05, this.position.z);
  }

  teleport(x, z, heading) {
    this.position.set(x, this.groundAt(x, z, this.world.terrain.heightAt(x, z) + 0.3), z);
    this.heading = heading;
    this.vy = 0; this.speed = 0; this.grounded = true;
  }
}
