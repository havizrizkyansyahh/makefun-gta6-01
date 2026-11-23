// The Solmara Bay PD: crimes raise a wanted level of up to five stars; patrol cruisers are
// dispatched to chase, ram and box the player in, officers get out to arrest (one star) or
// shoot (two and up); a search area follows the last place the police saw the player, and
// staying out of sight beyond it long enough loses them. Being caught on foot is a bust.
import { WANTED } from './config.js';
import { Npc } from './npc.js';

const CRIMES = {
  shots: { min: 1, add: 0 },
  assault: { min: 1, add: 0 },
  murder: { min: 1, add: 0.5 },
  jack: { min: 1, add: 0 },
  copHit: { min: 2, add: 0.5 },
  copKill: { min: 2, add: 1 },
  ramCop: { min: 1, add: 0.35 },
};

export class Police {
  constructor(world) {
    this.world = world;
    this.level = 0;       // fractional heat; stars = floor
    this.lastSeen = { x: 0, z: 0 };
    this.seen = false;
    this.hidden = 0;
    this.flash = 0;
    this.spawnTimer = 0;
    this.bustTimer = 0;
    this.locked = false;  // missions can pin the level
    this.cooldown = 0;
  }

  get stars() { return Math.min(WANTED.maxStars, Math.floor(this.level)); }

  /** Report a crime at (x, z). witnessed=false only counts when police or many civilians are near. */
  report(kind, x, z, witnessed = true) {
    if (this.world.player.dead) return;
    const c = CRIMES[kind];
    if (!c) return;
    if (!witnessed && !this.copsNear(x, z, 70)) return;
    const before = this.stars;
    this.level = Math.max(this.level, c.min) + c.add;
    this.level = Math.min(this.level, WANTED.maxStars + 0.99);
    if (this.stars > before) {
      this.world.audio.ui('wanted');
      this.flash = 2;
    }
    this.lastSeen = { x, z };
    this.hidden = 0;
  }

  /** Set the level outright (missions). */
  set(stars) {
    if (stars > this.stars) { this.world.audio.ui('wanted'); this.flash = 2; }
    this.level = stars;
    const p = this.world.player.where();
    this.lastSeen = { x: p.x, z: p.z };
    this.hidden = 0;
  }

  clear() {
    this.level = 0;
    this.hidden = 0;
    for (const v of this.world.vehicles) {
      if (v.kind === 'police') {
        v.siren = false;
        if (v.ai) v.ai.mode = 'traffic';
      }
    }
  }

  copsNear(x, z, r) {
    for (const v of this.world.vehicles) if (v.kind === 'police' && !v.dead && Math.hypot(v.pos.x - x, v.pos.z - z) < r) return true;
    for (const n of this.world.npcs) if (n.role === 'cop' && !n.dead && Math.hypot(n.pos.x - x, n.pos.z - z) < r) return true;
    return false;
  }

  /** Spawn a cruiser on a road out of the player's sight, 90-160 m away. */
  dispatch() {
    const w = this.world;
    const c = w.player.where();
    for (let tries = 0; tries < 20; tries += 1) {
      const seg = w.city.randomSegment(w.rng);
      const A = w.city.nodes[seg.a];
      const B = w.city.nodes[seg.b];
      const x = A.x + (B.x - A.x) * seg.t;
      const z = A.z + (B.z - A.z) * seg.t;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < 85 || d > 170) continue;
      if (w.isVisible(x, 1, z, 140)) continue;
      // drive toward the player: orient the segment so B is the nearer end
      const dA = Math.hypot(A.x - c.x, A.z - c.z);
      const dB = Math.hypot(B.x - c.x, B.z - c.z);
      const s = dB < dA ? seg : { a: seg.b, b: seg.a, t: 1 - seg.t };
      const v = w.traffic.spawnCar(s, 'cruiser', 'chase');
      if (!v) continue;
      v.kind = 'police';
      v.siren = true;
      v.crew = 2;
      return v;
    }
    return null;
  }

  /** Officers step out of a stopped cruiser near a player on foot. */
  deploy(v) {
    const w = this.world;
    const side = [1, -1];
    for (let k = 0; k < v.crew; k += 1) {
      const sx = side[k] * (v.spec.wid / 2 + 0.6);
      const x = v.pos.x + Math.cos(v.heading) * sx;
      const z = v.pos.z - Math.sin(v.heading) * sx;
      const n = new Npc(w, 'cop', x, z, { state: 'combat', heading: v.heading });
      n.fromCar = v;
      w.npcs.push(n);
    }
    v.crew = 0;
    v.ai.mode = 'parked';
    v.input.throttle = -0.5;
    v.input.steer = 0;
  }

  update(dt) {
    const w = this.world;
    const p = w.player;
    const where = p.where();
    if (this.flash > 0) this.flash -= dt;
    const stars = this.stars;

    // can any officer see the player?
    this.seen = false;
    if (stars > 0) {
      for (const v of w.vehicles) {
        if (v.kind !== 'police' || v.dead) continue;
        if (Math.hypot(v.pos.x - where.x, v.pos.z - where.z) < WANTED.sightRange && w.city.lineOfSight(v.pos.x, 1.4, v.pos.z, where.x, 1.4, where.z)) { this.seen = true; break; }
      }
      if (!this.seen) {
        for (const n of w.npcs) {
          if (n.role !== 'cop' || n.dead) continue;
          if (Math.hypot(n.pos.x - where.x, n.pos.z - where.z) < WANTED.sightRange && w.city.lineOfSight(n.pos.x, 1.6, n.pos.z, where.x, 1.4, where.z)) { this.seen = true; break; }
        }
      }
      if (this.seen) {
        this.lastSeen = { x: where.x, z: where.z };
        this.hidden = 0;
      } else if (!this.locked) {
        const out = Math.hypot(where.x - this.lastSeen.x, where.z - this.lastSeen.z) > WANTED.searchRadius[stars];
        this.hidden += dt * (out ? 1 : 0.25);
        if (this.hidden > WANTED.escapeTime[stars]) {
          this.clear();
          w.hud.notify('You lost the cops.');
        }
      }
    }

    // keep the right number of units on the board
    this.spawnTimer -= dt;
    const units = w.vehicles.filter((v) => v.kind === 'police' && !v.dead && v.ai && v.ai.mode !== 'traffic');
    if (stars > 0 && this.spawnTimer <= 0 && units.length < WANTED.units[stars]) {
      this.dispatch();
      this.spawnTimer = 4 - stars * 0.5;
    }
    for (let i = w.vehicles.length - 1; i >= 0; i -= 1) {
      const v = w.vehicles[i];
      if (v.kind !== 'police') continue;
      const d = Math.hypot(v.pos.x - where.x, v.pos.z - where.z);
      if (stars === 0 && d > 140 && !w.isVisible(v.pos.x, 1, v.pos.z, 200)) {
        v.remove();
        w.vehicles.splice(i, 1);
        continue;
      }
      if (v.dead || !v.ai) continue;
      v.siren = stars > 0;
      const playerSlow = !p.vehicle || p.vehicle.speed < 4;
      if (v.ai.mode === 'chase' && playerSlow && v.crew > 0 && d < 16 && v.speed < 6) this.deploy(v);
      if (v.ai.mode === 'parked') {
        v.input.throttle = v.forward > 0.3 ? -1 : 0;
        if (p.vehicle && d > 30) { v.ai.mode = 'chase'; v.crew = 2; }
      }
    }
    // officers far away or no longer needed walk off and are removed
    for (let i = w.npcs.length - 1; i >= 0; i -= 1) {
      const n = w.npcs[i];
      if (n.role !== 'cop') continue;
      const d = Math.hypot(n.pos.x - where.x, n.pos.z - where.z);
      if ((stars === 0 || d > 150) && d > 70) { n.remove(); w.npcs.splice(i, 1); continue; }
      if (stars > 0 && !n.dead && n.state !== 'combat') n.state = 'combat';
      if (stars === 0 && !n.dead && n.state === 'combat') { n.state = 'idle'; n.timer = 1e9; }
    }

    // busted: an officer has hold of the player who is standing still
    let grabbed = false;
    if (stars > 0 && !p.dead) {
      if (!p.vehicle) {
        for (const n of w.npcs) {
          if (n.role === 'cop' && !n.dead && Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) < 1.7 && p.moveSpeed < 2.2) grabbed = true;
        }
      } else if (p.vehicle.speed < 1.2) {
        for (const n of w.npcs) {
          if (n.role === 'cop' && !n.dead && Math.hypot(n.pos.x - p.vehicle.pos.x, n.pos.z - p.vehicle.pos.z) < 3.2) grabbed = true;
        }
      }
    }
    this.bustTimer = grabbed ? this.bustTimer + dt : Math.max(0, this.bustTimer - dt * 2);
    if (this.bustTimer > (p.vehicle ? 2.5 : 1.4)) {
      this.bustTimer = 0;
      w.busted();
    }
  }
}
