// The Bayside Run: a one-lap street race through Little Marisco and Midtown against three
// rivals. Drive into the chequered marker on the avenue and press E; the field lines up, a
// countdown runs, rivals follow the course on the road graph, and the finishing order pays.
// Kai's best winning time is kept with the save.
import { Marker } from './markers.js';
import { LaneDriver } from './traffic.js';
import { CITY } from './config.js';
import { formatTime } from './rng.js';

const CORNERS = [[8, 6], [8, 2], [3, 2], [3, 7], [8, 7], [8, 6]];
const PRIZES = [2000, 900, 400, 0];
const RIVALS = [['bayrunner', '#fb8500'], ['ardent', '#2ec4b6'], ['halcyon', '#c77dff']];

export class StreetRace {
  constructor(world) {
    this.world = world;
    const city = world.city;
    // the course: every road node between the corners, in order
    this.route = [];
    for (let k = 0; k < CORNERS.length - 1; k += 1) {
      const [i0, j0] = CORNERS[k];
      const [i1, j1] = CORNERS[k + 1];
      const steps = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
      for (let s = 0; s < steps; s += 1) {
        this.route.push(city.nodeId(i0 + Math.sign(i1 - i0) * s, j0 + Math.sign(j1 - j0) * s));
      }
    }
    this.checkpoints = this.route.filter((_, i) => i % 2 === 0 && i > 0).concat([this.route[0]]);
    const a = city.nodes[this.route[0]];
    const b = city.nodes[this.route[1]];
    const dz = Math.sign(b.z - a.z);
    this.start = { x: a.x - dz * CITY.laneOffset, z: a.z + dz * 14 };
    this.marker = new Marker(world.scene, this.start.x, this.start.z, '#ff9f1c', 3.2, 0);
    this.active = null;
  }

  /** Line up the field and start the countdown. */
  begin() {
    const w = this.world;
    const v = w.player.vehicle;
    const r = this.route;
    const a = w.city.nodes[r[0]];
    const b = w.city.nodes[r[1]];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const heading = Math.atan2(dx, dz);
    // clear the grid of traffic
    for (const o of w.vehicles) {
      if (o !== v && o.kind === 'traffic' && Math.hypot(o.pos.x - a.x, o.pos.z - a.z) < 70) o.pos.x += 400;
    }
    v.pos.x = a.x + dx * 8 - dz * CITY.laneOffset;
    v.pos.z = a.z + dz * 8 + dx * CITY.laneOffset;
    v.heading = heading;
    v.vel.x = v.vel.z = 0;
    const rivals = RIVALS.map(([key, color], k) => {
      const car = w.traffic.spawnCar({ a: r[0], b: r[1], t: (24 + k * 13) / len }, key) || null;
      if (!car) return null;
      car.parts.paint.color.set(color);
      car.vel.x = car.vel.z = 0;
      car.heading = heading;
      car.kind = 'mission';
      car.mission = true;
      const ai = new LaneDriver(w, car, r[0], r[1], 'race');
      ai.route = r;
      ai.ri = 1;
      ai.cruise = 27 + k * 1.5;
      ai.laps = 0;
      ai.hold = true;
      car.ai = ai;
      return car;
    }).filter(Boolean);
    this.active = { rivals, next: 0, countdown: 3.5, time: 0, outOfCar: 0, cp: null };
    w.hud.bigText('BAYSIDE RUN', 'One lap. Hit every checkpoint.', 2, '#ff9f1c');
    this.placeCheckpoint();
  }

  placeCheckpoint() {
    const s = this.active;
    if (s.cp) s.cp.remove();
    const n = this.world.city.nodes[this.checkpoints[s.next]];
    s.cp = new Marker(this.world.scene, n.x, n.z, '#ff9f1c', 7, 0);
  }

  /** Progress through the lap, for the player and for a rival, comparable to each other. */
  rivalProgress(car) {
    const ai = car.ai;
    const idx = (ai.laps || 0) * this.route.length + (ai.ri - 1);
    return idx / 2;
  }

  end(place, reason) {
    const w = this.world;
    const s = this.active;
    if (s.cp) s.cp.remove();
    for (const car of s.rivals) {
      car.kind = 'traffic';
      car.mission = null;
      if (car.ai) { car.ai.mode = 'traffic'; car.ai.route = null; car.ai.cruise = 13; car.ai.hold = false; }
    }
    this.active = null;
    w.missions.timer = null;
    if (place === null) {
      void s;
      w.hud.bigText('RACE OVER', reason, 3, '#ff5252');
      w.audio.ui('fail');
      return;
    }
    const prize = PRIZES[place - 1];
    w.money += prize;
    w.stats.races = (w.stats.races || 0) + (place === 1 ? 1 : 0);
    const record = place === 1 && (!this.best || s.time < this.best);
    if (record) this.best = s.time;
    const names = ['1ST', '2ND', '3RD', '4TH'];
    const time = `  ·  ${formatTime(s.time)}${record ? ' (best)' : ''}`;
    w.hud.bigText(`${names[place - 1]} PLACE`, prize ? `Bayside Run  +$${prize.toLocaleString()}${time}` : `Bayside Run: no prize this time${time}`, 4, place === 1 ? '#ffd23f' : '#ffffff');
    w.audio.ui(place === 1 ? 'pass' : 'cash');
  }

  update(dt, input) {
    const w = this.world;
    const p = w.player;
    this.marker.update(dt);
    if (!this.active) {
      const busy = w.missions.busy();
      if (!busy && p.vehicle && p.vehicle.spec.body !== 'boat' && this.marker.inside(p.vehicle.pos.x, p.vehicle.pos.z, 1)) {
        w.hud.help(w.police.stars > 0 ? 'Lose the cops before racing.' : `Press E to start the Bayside Run (street race)${this.best ? `, best ${formatTime(this.best)}` : ''}.`);
        if (input.hit('KeyE') && w.police.stars === 0) { input.consume('KeyE'); this.begin(); }
      }
      return;
    }
    const s = this.active;
    s.cp.update(dt);
    if (s.countdown > 0) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      const after = Math.ceil(s.countdown);
      if (p.vehicle) { p.vehicle.vel.x *= 0.5; p.vehicle.vel.z *= 0.5; }
      if (s.countdown <= 0) for (const car of s.rivals) if (car.ai) car.ai.hold = false;
      if (after !== before) {
        w.hud.bigText(after > 0 ? String(after) : 'GO!', '', 0.9, after > 0 ? '#ffffff' : '#3dff8b');
        w.audio.ui(after > 0 ? 'move' : 'select');
      }
      return;
    }
    s.time += dt;
    w.missions.timer = s.time;
    if (!p.vehicle || p.vehicle.dead) {
      s.outOfCar += dt;
      if (s.outOfCar > 5 || (p.vehicle && p.vehicle.dead)) { this.end(null, 'You left the race.'); return; }
    } else s.outOfCar = 0;
    // checkpoints
    const at = p.where();
    if (s.cp.inside(at.x, at.z, 2)) {
      s.next += 1;
      w.audio.ui('pickup');
      if (s.next >= this.checkpoints.length) {
        const mine = this.checkpoints.length;
        const ahead = s.rivals.filter((car) => this.rivalProgress(car) > mine).length;
        this.end(ahead + 1);
        return;
      }
      this.placeCheckpoint();
    }
  }

  blips() {
    const out = [{ x: this.start.x, z: this.start.z, color: '#ff9f1c', kind: 'place', icon: 'flag', title: 'Bayside Run', desc: 'Street race: drive into the chequered marker and press E. Prizes $2,000 / $900 / $400.' }];
    if (this.active) {
      out.push({ x: this.active.cp.x, z: this.active.cp.z, color: '#ff9f1c', kind: 'objective', edge: true, icon: 'flag', title: 'Next checkpoint', desc: 'Bayside Run' });
      for (const car of this.active.rivals) out.push({ x: car.pos.x, z: car.pos.z, color: '#ffffff', kind: 'enemy', title: 'Rival racer', desc: car.spec.name });
    }
    return out;
  }

  objective() {
    if (!this.active) return null;
    const s = this.active;
    if (s.countdown > 0) return { title: 'Bayside Run', text: 'Get ready...' };
    const mine = s.next;
    const ahead = s.rivals.filter((car) => this.rivalProgress(car) > mine).length;
    return { title: `Bayside Run  ·  position ${ahead + 1}/4`, text: `Checkpoint ${s.next + 1} of ${this.checkpoints.length}.` };
  }
}
