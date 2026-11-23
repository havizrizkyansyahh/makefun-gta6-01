// Street life around the player: LaneDriver steers any car along the road graph in the right
// lane (cruising, turning at intersections, braking for whatever is ahead, easing through
// flashing amber at night, backing out when stuck, or chasing / fleeing a target), and Traffic
// keeps a ring of moving cars, parked cars and pedestrians alive around the player (around the
// door he went in by, while he is indoors), spawning out of sight and removing far ones.
import { CITY, TRAFFIC } from './config.js';
import { Vehicle, MODELS, TRAFFIC_MIX } from './vehicles.js';
import { Npc } from './npc.js';
import { clamp, wrapAngle } from './rng.js';

export class LaneDriver {
  /** mode: 'traffic' | 'chase' | 'flee' */
  constructor(world, vehicle, a, b, mode = 'traffic') {
    this.world = world;
    this.v = vehicle;
    this.a = a;
    this.b = b;
    this.next = null;
    this.mode = mode;
    this.cruise = TRAFFIC.cruise * (0.85 + world.rng.next() * 0.3);
    this.stuck = 0;
    this.reverse = 0;
    this.panic = 0;
    this.blocked = 0;
    this.direct = false;
  }

  pickNext() {
    // racers follow their course
    if (this.route) return this.route[(this.ri + 1) % this.route.length];
    const city = this.world.city;
    const node = city.nodes[this.b];
    let options = node.links.filter((n) => n !== this.a);
    if (options.length === 0) options = node.links;
    if (this.mode === 'traffic') return this.world.rng.pick(options);
    const t = this.world.player.vehicle ? this.world.player.vehicle.pos : this.world.player.pos;
    let best = options[0];
    let score = this.mode === 'chase' ? Infinity : -Infinity;
    for (const o of options) {
      const n = city.nodes[o];
      const d = Math.hypot(n.x - t.x, n.z - t.z) + this.world.rng.next() * 25;
      if (this.mode === 'chase' ? d < score : d > score) { score = d; best = o; }
    }
    return best;
  }

  update(dt) {
    const v = this.v;
    const w = this.world;
    const city = w.city;
    if (v.dead) { v.input.throttle = 0; return; }
    if (this.hold) { v.input.throttle = 0; v.input.steer = 0; v.input.handbrake = true; return; }
    if (this.mode === 'parked') {
      // crew got out: stop and wait with the lights on
      v.input.throttle = v.forward > 0.3 ? -1 : v.forward < -0.3 ? 1 : 0;
      v.input.steer = 0;
      v.input.handbrake = Math.abs(v.forward) < 2;
      return;
    }
    const A = city.nodes[this.a];
    const B = city.nodes[this.b];
    let dx = B.x - A.x;
    let dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    const lane = CITY.laneOffset;
    const proj = (v.pos.x - A.x) * dx + (v.pos.z - A.z) * dz;
    if (this.next === null) this.next = this.pickNext();
    const C = city.nodes[this.next];
    let ex = C.x - B.x;
    let ez = C.z - B.z;
    const el = Math.hypot(ex, ez) || 1;
    ex /= el; ez /= el;
    const turn = Math.abs(dx * ez - dz * ex) > 0.5;

    if (proj > len - lane - 1.5) {
      this.a = this.b;
      this.b = this.next;
      this.next = null;
      if (this.route) {
        this.ri = (this.ri + 1) % this.route.length;
        if (this.ri === 0) this.laps = (this.laps || 0) + 1;
      }
      return;
    }

    const speed = v.forward;
    const look = 5 + Math.abs(speed) * 0.35;
    let tx; let tz;
    if (proj + look < len - 6) {
      tx = A.x + dx * (proj + look) + -dz * lane;
      tz = A.z + dz * (proj + look) + dx * lane;
    } else {
      const over = proj + look - (len - 6);
      tx = B.x + ex * over + -ez * lane;
      tz = B.z + ez * over + ex * lane;
    }

    // pursuit and flight leave the lane when the target is close and in the open
    const target = w.player.vehicle ? w.player.vehicle : w.player;
    const tdx = target.pos.x - v.pos.x;
    const tdz = target.pos.z - v.pos.z;
    const tdist = Math.hypot(tdx, tdz);
    this.direct = false;
    if (this.mode === 'chase' && tdist < 42 && city.lineOfSight(v.pos.x, 1.2, v.pos.z, target.pos.x, 1.2, target.pos.z)) {
      const lead = w.player.vehicle ? 0.5 : 0;
      tx = target.pos.x + (target.vel ? target.vel.x * lead : 0);
      tz = target.pos.z + (target.vel ? target.vel.z * lead : 0);
      this.direct = true;
    }

    const desired = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    const diff = wrapAngle(desired - v.heading);
    let steer = clamp(diff * 2.4, -1, 1);

    let want = this.mode === 'traffic' ? this.cruise : this.mode === 'chase' ? 27 : 26;
    if (this.panic > 0) { this.panic -= dt; want = Math.max(want, 21); }
    if (turn && proj > len - 26) want = Math.min(want, this.mode === 'traffic' ? 7.5 : 14);
    if (Math.abs(diff) > 0.6) want = Math.min(want, 8);
    // close in, then stop beside the player instead of ramming a standing target
    const targetSpeed = w.player.vehicle ? w.player.vehicle.speed : 0;
    if (this.direct && targetSpeed < 6) want = tdist < 13 ? 0 : Math.min(want, 6 + tdist * 0.5);

    // stop at the line on red (and on amber when there is room to stop); police and the
    // fleeing van run the lights; on night-time flashing amber drivers ease through
    if (this.mode === 'traffic' && w.signals) {
      const light = w.signals.state(this.b, Math.abs(dx) > Math.abs(dz) ? 'x' : 'z');
      const stopAt = len - CITY.roadHalf - 3.2;
      const toLine = stopAt - proj;
      if (light === 'flash' && toLine > -4 && toLine < 22) want = Math.min(want, 8);
      if (toLine > -0.5 && toLine < 40 && (light === 'red' || (light === 'amber' && toLine > 9))) {
        want = Math.min(want, Math.max(0, toLine * 0.55 - 0.3));
        this.waiting = true;
      } else this.waiting = false;
    }

    // brake for whatever is in front
    if (this.mode === 'traffic' || this.mode === 'race') {
      const gap = this.clearAhead(10 + Math.abs(speed) * 1.1);
      if (gap < Infinity) want = Math.min(want, Math.max(0, (gap - 5) * 0.8));
      if (want < 1 && gap < 9) {
        this.blocked += dt;
        if (this.blocked > 6 && !this.waiting && Math.random() < dt * 0.5) w.audio.horn();
      } else this.blocked = 0;
    }

    let throttle = clamp((want - speed) * 0.35, -1, 1);
    // stuck against something: back up and turn the other way
    if (this.reverse > 0) {
      this.reverse -= dt;
      throttle = -0.8;
      steer = -steer;
    } else if (want > 3 && Math.abs(speed) < 0.6 && !this.waiting) {
      this.stuck += dt;
      if (this.stuck > (this.mode === 'traffic' ? 3 : 1.2)) { this.reverse = 1.4; this.stuck = 0; }
    } else this.stuck = 0;

    v.input.throttle = throttle;
    v.input.steer = steer;
    v.input.handbrake = this.mode !== 'traffic' && Math.abs(diff) > 1.2 && speed > 12;
  }

  /** Distance to the nearest car, person or the player in our path; Infinity when clear. */
  clearAhead(range) {
    const v = this.v;
    const fx = v.fx;
    const fz = v.fz;
    let best = Infinity;
    const test = (x, z, width) => {
      const rx = x - v.pos.x;
      const rz = z - v.pos.z;
      const along = rx * fx + rz * fz;
      if (along <= 0 || along > range) return;
      const side = Math.abs(rx * -fz + rz * fx);
      if (side < width && along < best) best = along;
    };
    for (const o of this.world.vehicles) if (o !== v) test(o.pos.x, o.pos.z, 2.4);
    const p = this.world.player;
    if (!p.vehicle) test(p.pos.x, p.pos.z, 1.8);
    for (const n of this.world.npcs) if (!n.dead && !n.inVehicle) test(n.pos.x, n.pos.z, 1.6);
    return best;
  }
}

export class Traffic {
  constructor(world) {
    this.world = world;
    this.timer = 0;
  }

  /** Place a moving car on a road segment, lane and heading set from it. */
  spawnCar(seg, modelKey, mode = 'traffic') {
    const w = this.world;
    const city = w.city;
    const A = city.nodes[seg.a];
    const B = city.nodes[seg.b];
    const dx = (B.x - A.x) / w.cityPitch;
    const dz = (B.z - A.z) / w.cityPitch;
    const x = A.x + (B.x - A.x) * seg.t + -dz * CITY.laneOffset;
    const z = A.z + (B.z - A.z) * seg.t + dx * CITY.laneOffset;
    for (const o of w.vehicles) if (Math.hypot(o.pos.x - x, o.pos.z - z) < 12) return null;
    const key = modelKey || w.rng.pick(TRAFFIC_MIX);
    const v = new Vehicle(w.scene, key, w.rng.pick(MODELS[key].colors), x, z, Math.atan2(dx, dz));
    v.vel.x = dx * 8;
    v.vel.z = dz * 8;
    v.driver = { look: null };
    v.ai = new LaneDriver(w, v, seg.a, seg.b, mode);
    v.kind = mode === 'traffic' ? 'traffic' : 'special';
    w.vehicles.push(v);
    return v;
  }

  spawnParked() {
    const w = this.world;
    for (const spot of w.city.parking) {
      const key = w.rng.pick(['brisa', 'corso', 'ardent', 'bayrunner', 'halden', 'pelican', 'corso', 'marlin', 'sprint', 'sprint']);
      const v = new Vehicle(w.scene, key, w.rng.pick(MODELS[key].colors), spot.x, spot.z, spot.heading);
      v.y = w.city.groundHeight(spot.x, spot.z);
      v.kind = 'parked';
      w.vehicles.push(v);
    }
  }

  spawnPed(near, minD, maxD) {
    const w = this.world;
    const loops = w.city.loops.filter((l) => {
      const cx = (l.x0 + l.x1) / 2;
      const cz = (l.z0 + l.z1) / 2;
      const d = Math.hypot(cx - near.x, cz - near.z);
      return d > minD - 45 && d < maxD + 45;
    });
    if (loops.length === 0) return null;
    const loop = w.rng.pick(loops);
    const per = 2 * ((loop.x1 - loop.x0) + (loop.z1 - loop.z0));
    for (let tries = 0; tries < 6; tries += 1) {
      const s = w.rng.range(0, per);
      const n = new Npc(w, 'civ', 0, 0, { loop });
      n.s = s;
      const x0 = loop.x0; const x1 = loop.x1; const z0 = loop.z0; const z1 = loop.z1;
      const width = x1 - x0; const height = z1 - z0;
      let t = s;
      let x; let z;
      if (t < width) { x = x0 + t; z = z0; } else if ((t -= width) < height) { x = x1; z = z0 + t; } else if ((t -= height) < width) { x = x1 - t; z = z1; } else { t -= width; x = x0; z = z1 - t; }
      const d = Math.hypot(x - near.x, z - near.z);
      if (d < minD || d > maxD) { n.remove(); continue; }
      n.pos.x = x; n.pos.z = z;
      n.y = w.city.groundHeight(x, z);
      n.sync();
      w.npcs.push(n);
      return n;
    }
    return null;
  }

  /** Keep the street populated: remove far cars and people, add new ones out at the edge. */
  update(dt, initial = false) {
    const w = this.world;
    this.timer -= dt;
    if (this.timer > 0 && !initial) return;
    this.timer = 0.5;
    // indoors, the street outside the door is what stays alive
    const c = w.mapPos ? w.mapPos() : w.player.where();
    // remove far traffic and pedestrians (never the player's car, his own car or story actors)
    for (let i = w.vehicles.length - 1; i >= 0; i -= 1) {
      const v = w.vehicles[i];
      if (v === w.player.vehicle || v.mission || v.kind === 'parked' || v.kind === 'police' || v.kind === 'personal' || v.kind === 'prop') continue;
      const d = Math.hypot(v.pos.x - c.x, v.pos.z - c.z);
      if (d > TRAFFIC.despawn || (v.dead && d > 120)) {
        v.remove();
        w.vehicles.splice(i, 1);
      }
    }
    for (let i = w.npcs.length - 1; i >= 0; i -= 1) {
      const n = w.npcs[i];
      if (n.persistent || n.mission) continue;
      const d = Math.hypot(n.pos.x - c.x, n.pos.z - c.z);
      if (d > 190 || (n.dead && n.deadTime > 25)) {
        n.remove();
        w.npcs.splice(i, 1);
      }
    }
    const moving = w.vehicles.filter((v) => v.kind === 'traffic').length;
    const wantCars = Math.round(TRAFFIC.cars * w.density);
    for (let k = 0; k < (initial ? wantCars : 2) && moving + k < wantCars; k += 1) {
      for (let tries = 0; tries < 12; tries += 1) {
        const seg = w.city.randomSegment(w.rng);
        const A = w.city.nodes[seg.a];
        const B = w.city.nodes[seg.b];
        const x = A.x + (B.x - A.x) * seg.t;
        const z = A.z + (B.z - A.z) * seg.t;
        const d = Math.hypot(x - c.x, z - c.z);
        const lo = initial ? 25 : TRAFFIC.spawnMin;
        if (d < lo || d > TRAFFIC.spawnMax) continue;
        if (!initial && w.isVisible(x, 1, z, 120)) continue;
        if (this.spawnCar(seg)) break;
      }
    }
    if (w.interior) return; // nobody is watching the street spawn while Kai is inside
    const peds = w.npcs.filter((n) => n.role === 'civ' && !n.dead && !n.interior).length;
    const wantPeds = Math.round(TRAFFIC.peds * w.density);
    for (let k = 0; k < (initial ? wantPeds : 3) && peds + k < wantPeds; k += 1) {
      this.spawnPed(c, initial ? 8 : 70, initial ? 140 : 170);
    }
  }
}
