import * as THREE from 'three';

/** Kamera hinter der Figur bzw. dem Auto. Wischen dreht sie. */
export class FollowCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.28;
    this.dist = 5;
    this.curDist = 5;
    this.height = 1.6;
    this.sensitivity = 3.2;   // Drehung pro Bildschirmbreite (Radiant)
    this.focus = new THREE.Vector3();
    this.idle = 10;
    this.indoor = null;   // Kollisionen eines Innenraums
  }

  update(dt, look, target, mode, carHeading, carSpeed) {
    // feste Kamera (z.B. für Szenen): { x, y, z, lx, ly, lz }
    if (this.fixed) {
      const f = this.fixed;
      this.camera.position.set(f.x, f.y, f.z);
      this.camera.lookAt(f.lx, f.ly, f.lz);
      return;
    }
    const k = this.sensitivity / Math.max(320, innerWidth);
    const moved = Math.abs(look.x) + Math.abs(look.y) > 0.5;
    this.idle = moved ? 0 : this.idle + dt;
    this.yaw -= look.x * k;
    this.pitch = Math.min(1.25, Math.max(-0.35, this.pitch + look.y * k));

    const inCar = mode === 'car';
    const wantDist = inCar ? 8.5 + Math.min(3, Math.abs(carSpeed) * 0.08) : this.indoor ? 3.2 : 4.6;
    this.dist += (wantDist - this.dist) * Math.min(1, dt * 3);
    this.height = inCar ? 2.0 : 1.55;

    // Im Auto dreht sich die Kamera nach kurzer Zeit wieder hinter das Auto
    if (inCar && this.idle > 1.0) {
      const back = carSpeed < -1 ? carHeading + Math.PI : carHeading;
      let d = back - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.2);
      this.pitch += (0.2 - this.pitch) * Math.min(1, dt * 1.5);
    }

    // Fokus weich nachführen
    const fx = target.x, fy = target.y + this.height, fz = target.z;
    const s = Math.min(1, dt * (inCar ? 12 : 18));
    this.focus.x += (fx - this.focus.x) * s;
    this.focus.y += (fy - this.focus.y) * s;
    this.focus.z += (fz - this.focus.z) * s;
    if (this.focus.distanceToSquared(target) > 400) this.focus.set(fx, fy, fz);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dx = -Math.sin(this.yaw) * cp, dy = sp, dz = -Math.cos(this.yaw) * cp;

    // Nicht durch Berge oder Häuser schauen. Drinnen fein abtasten und mit Abstand zur Wand,
    // damit man nicht durch dünne Mauern sieht.
    let allowed = this.dist;
    const cols = this.indoor;
    const steps = cols ? Math.ceil(this.dist / 0.08) : 10;
    const pad = 0.28;
    const hit = (x, y, z) => cols
      ? cols.insideBox(x, y, z) || cols.insideBox(x + pad, y, z) || cols.insideBox(x - pad, y, z) || cols.insideBox(x, y, z + pad) || cols.insideBox(x, y, z - pad) || cols.insideBox(x, y + pad, z) || cols.insideBox(x, y - pad, z)
      : this.world.terrain.heightAt(x, z, y) + 0.4 > y || this.world.colliders.insideBox(x, y, z);
    for (let i = 1; i <= steps; i++) {
      const d = this.dist * i / steps;
      const x = this.focus.x + dx * d, y = this.focus.y + dy * d, z = this.focus.z + dz * d;
      if (hit(x, y, z)) {
        allowed = Math.max(cols ? 0.15 : 0.8, this.dist * (i - 1) / steps);
        break;
      }
    }
    const rate = allowed < this.curDist ? (cols ? 60 : 20) : 3;
    if (cols && allowed < this.curDist) this.curDist = allowed;   // drinnen sofort, sonst blitzt die Wand durch
    this.curDist += (allowed - this.curDist) * Math.min(1, dt * rate);

    const cam = this.camera;
    cam.position.set(this.focus.x + dx * this.curDist, this.focus.y + dy * this.curDist, this.focus.z + dz * this.curDist);
    if (!this.indoor) {
      const minY = this.world.terrain.heightAt(cam.position.x, cam.position.z, cam.position.y) + 0.35;
      if (cam.position.y < minY) cam.position.y = minY;
    }
    cam.lookAt(this.focus);
  }

  snapBehind(heading) { this.yaw = heading; }
}
