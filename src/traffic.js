import { Car } from './car.js';

// Autos, die von selbst auf den Hauptstrassen hin- und herfahren.
// Man kann sie anhalten lassen (davorstehen) oder einsteigen und mitnehmen.

const COLORS = [0x5a5f66, 0x7a1e1a, 0x2f3d52, 0xb8b4a8, 0x3c4a3a, 0x8a7a5a, 0x1d1f22, 0x6b6e72];

export class Traffic {
  constructor(scene, world, count = 6) {
    this.world = world;
    this.cars = [];
    const lim = world.half - 30;
    const pieces = [];
    for (const r of world.mainRoads) {
      let cur = [];
      for (const pt of r.pts) {
        if (Math.abs(pt[0]) < lim && Math.abs(pt[1]) < lim) cur.push(pt);
        else { if (cur.length > 1) pieces.push({ pts: cur, w: r.w }); cur = []; }
      }
      if (cur.length > 1) pieces.push({ pts: cur, w: r.w });
    }
    const routes = buildRoutes(pieces).filter((r) => r.length > 300);
    if (!routes.length) return;
    for (let i = 0; i < count; i++) {
      // die meisten Autos auf der längsten Strasse, verteilt um den Startpunkt
      const route = i < count - 2 ? routes[0] : routes[i % routes.length];
      let near = 0, best = Infinity;
      for (const p of route.pts) { const d = Math.hypot(p.x - world.spawn.x, p.z - world.spawn.z); if (d < best) { best = d; near = p.d; } }
      const s = Math.max(10, Math.min(route.length - 10, near + (i - 2) * 110 + 40));
      const car = new Car(scene, world, { x: 0, z: 0, heading: 0, color: COLORS[i % COLORS.length] });
      car.traffic = { route, s, dir: i % 2 ? 1 : -1, speed: 0, target: 11 + (i % 3) * 2 };
      this.cars.push(car);
      this.place(car);
    }
  }

  release(car) { car.traffic = null; }

  update(dt, player, playerCar, allCars) {
    for (const car of this.cars) {
      const t = car.traffic;
      if (!t) continue;
      // Hindernis vor dem Auto? (Fussgänger, andere Autos)
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let free = 30;
      const check = (x, z, r) => {
        const dx = x - car.x, dz = z - car.z;
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
        if (ahead > 0 && side < r) free = Math.min(free, ahead);
      };
      if (!playerCar) check(player.position.x, player.position.z, 2.2);
      for (const o of allCars) if (o !== car) check(o.x, o.z, 2.4);
      const want = free < 7 ? 0 : free < 18 ? t.target * (free - 7) / 11 : t.target;
      t.speed += Math.max(-9 * dt, Math.min(3 * dt, want - t.speed));
      t.s += t.dir * t.speed * dt;
      if (t.s < 5) { t.s = 5; t.dir = 1; }
      if (t.s > t.route.length - 5) { t.s = t.route.length - 5; t.dir = -1; }
      car.speed = t.speed;
      this.place(car);
      for (const w of car.wheels) w.rotation.x += t.speed / 0.34 * dt;
    }
  }

  place(car) {
    const t = car.traffic;
    const p = pointAt(t.route, t.s), p2 = pointAt(t.route, t.s + t.dir * 3);
    const h = Math.atan2(p2.x - p.x, p2.z - p.z);
    let d = h - car.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    car.heading += d * 0.25;
    // Rechtsverkehr: auf die rechte Fahrbahnhälfte
    const lane = Math.min(1.8, p.w / 4);
    car.x = p.x - Math.cos(h) * lane;
    car.z = p.z + Math.sin(h) * lane;
    car.placeOnGround();
  }
}

// Einzelne OSM-Strassenstücke zu langen Routen verbinden
function buildRoutes(roads) {
  const key = ([x, z]) => Math.round(x) + ',' + Math.round(z);
  const unused = roads.map((r) => ({ pts: r.pts, w: r.w })).sort((a, b) => b.pts.length - a.pts.length);
  const routes = [];
  while (unused.length) {
    const first = unused.shift();
    let pts = first.pts.slice();
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < unused.length; i++) {
        const p = unused[i].pts;
        const head = key(pts[0]), tail = key(pts[pts.length - 1]);
        if (key(p[0]) === tail) pts = pts.concat(p.slice(1));
        else if (key(p[p.length - 1]) === tail) pts = pts.concat(p.slice(0, -1).reverse());
        else if (key(p[p.length - 1]) === head) pts = p.slice(0, -1).concat(pts);
        else if (key(p[0]) === head) pts = p.slice(1).reverse().concat(pts);
        else continue;
        unused.splice(i, 1); grown = true; break;
      }
    }
    const route = { pts: [], w: first.w, length: 0 };
    let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      route.pts.push({ x: pts[i][0], z: pts[i][1], d: acc });
    }
    route.length = acc;
    routes.push(route);
  }
  return routes.sort((a, b) => b.length - a.length);
}

function pointAt(route, s) {
  const p = route.pts;
  s = Math.max(0, Math.min(route.length, s));
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].d < s) lo = m; else hi = m; }
  const a = p[lo], b = p[hi];
  const t = (s - a.d) / Math.max(1e-6, b.d - a.d);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, w: route.w };
}
