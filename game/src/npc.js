// People on the street: civilians walking the sidewalk loops around each block (and fleeing when
// guns come out), police officers who arrest or shoot depending on the wanted level, Glass Saints
// gang members and harbour-board heavies who guard their turf and fight, the story's contacts
// who wait for Kai, and the staff and customers inside the shops.
import { Human, civilianLook, LOOKS } from './human.js';
import { WEAPONS, jitter, traceShot } from './combat.js';
import { clamp, damp, wrapAngle } from './rng.js';

/** Position along a rectangular sidewalk loop at perimeter distance s. */
export function loopPoint(loop, s) {
  const w = loop.x1 - loop.x0;
  const h = loop.z1 - loop.z0;
  const per = 2 * (w + h);
  let t = ((s % per) + per) % per;
  if (t < w) return { x: loop.x0 + t, z: loop.z0 };
  t -= w;
  if (t < h) return { x: loop.x1, z: loop.z0 + t };
  t -= h;
  if (t < w) return { x: loop.x1 - t, z: loop.z1 };
  t -= w;
  return { x: loop.x0, z: loop.z1 - t };
}

/** Nearest perimeter distance on a loop to (x, z). */
export function loopProject(loop, x, z) {
  const w = loop.x1 - loop.x0;
  const h = loop.z1 - loop.z0;
  const cx = clamp(x, loop.x0, loop.x1);
  const cz = clamp(z, loop.z0, loop.z1);
  const d = [Math.abs(z - loop.z0), Math.abs(x - loop.x1), Math.abs(z - loop.z1), Math.abs(x - loop.x0)];
  const k = d.indexOf(Math.min(...d));
  if (k === 0) return cx - loop.x0;
  if (k === 1) return w + (cz - loop.z0);
  if (k === 2) return w + h + (loop.x1 - cx);
  return 2 * w + h + (loop.z1 - cz);
}

export class Npc {
  constructor(world, role, x, z, opts = {}) {
    this.world = world;
    this.role = role;
    const look = opts.look || (role === 'cop' ? LOOKS.cop : role === 'saint' ? LOOKS.saint : civilianLook(world.rng));
    this.human = new Human(look);
    world.scene.add(this.human.root);
    this.pos = { x, z };
    this.y = world.city.groundHeight(x, z);
    this.heading = opts.heading ?? world.rng.range(-Math.PI, Math.PI);
    this.speed = 0;
    this.health = opts.health ?? (role === 'cop' ? 90 : role === 'saint' ? 80 : 50);
    this.dead = false;
    this.deadTime = 0;
    this.invulnerable = !!opts.invulnerable;
    this.state = opts.state || 'walk';
    this.loop = opts.loop || null;
    this.s = this.loop ? loopProject(this.loop, x, z) : 0;
    this.dir = world.rng.chance(0.5) ? 1 : -1;
    this.lane = world.rng.range(-0.8, 0.8);
    this.walkSpeed = world.rng.range(1.2, 1.7);
    this.weapon = opts.weapon || (role === 'cop' ? 'pistol' : role === 'saint' ? world.rng.pick(['pistol', 'pistol', 'smg']) : null);
    this.human.setWeapon(this.weapon);
    this.cooldown = world.rng.range(0.5, 1.5);
    this.timer = 0;
    this.threat = null;
    this.mission = opts.mission || null;
    this.strafe = world.rng.chance(0.5) ? 1 : -1;
    this.accuracy = opts.accuracy ?? (role === 'saint' ? 0.85 : 1);
    this.alertRange = opts.alertRange ?? 26;
    this.persistent = !!opts.persistent;
    this.area = opts.area || null;       // the room a shop customer browses
    this.interior = opts.interior || null;
    this.inVehicle = null;
    this.vehicle = null;
    this.punchT = 0;
    this.sync(0);
  }

  get alive() { return !this.dead; }

  /**
   * At a corner of the block, sometimes carry straight on over the road at the zebra crossing
   * (after waiting for the light) instead of turning along the block.
   */
  maybeCross(here, dx, dz) {
    const L = this.loop;
    const atX = Math.abs(here.x - L.x0) < 0.4 || Math.abs(here.x - L.x1) < 0.4;
    const atZ = Math.abs(here.z - L.z0) < 0.4 || Math.abs(here.z - L.z1) < 0.4;
    if (!atX || !atZ) return;
    this.crossCool = 8;
    if (Math.random() > 0.35) return;
    const w = this.world;
    const gap = w.cityPitch - (L.x1 - L.x0);
    const tx = here.x + Math.round(dx) * gap;
    const tz = here.z + Math.round(dz) * gap;
    if (!w.city.blockAt(tx, tz)) return;
    // the road being crossed runs across our path: its cars move on the other axis
    const axis = Math.abs(dx) > Math.abs(dz) ? 'z' : 'x';
    this.cross = { tx, tz, node: w.city.nearestNode((here.x + tx) / 2, (here.z + tz) / 2), axis };
    this.state = 'wait';
    this.timer = 0;
  }

  /** A gun is pointed this way: hands up for a moment. */
  scare() {
    if (this.dead || this.role !== 'civ' || this.state === 'flee' || this.state === 'cower') return;
    this.state = 'cower';
    this.timer = 2 + Math.random() * 2;
  }

  /** Something scary happened at (x, z): civilians run, armed people get ready. */
  alarm(x, z) {
    if (this.dead || this.invulnerable) return;
    if (this.role === 'civ') {
      if (this.state !== 'flee') this.timer = 6 + Math.random() * 5;
      this.state = 'flee';
      this.threat = { x, z };
    } else if (this.role === 'saint' && this.state === 'guard') {
      this.state = 'combat';
    }
  }

  hurt(amount, from) {
    if (this.dead || this.invulnerable) return false;
    this.health -= amount;
    this.world.fx.spawn('hit', this.pos.x, this.y + 1.3, this.pos.z, 3);
    if (this.role === 'saint' && this.state === 'guard') this.state = 'combat';
    if (this.health <= 0) {
      this.dead = true;
      this.deadTime = 0;
      this.state = 'dead';
      // ragdoll: thrown away from whatever hit them, falling the way they were pushed
      let kx = this.pos.x - (from ? from.x : this.pos.x - Math.sin(this.heading));
      let kz = this.pos.z - (from ? from.z : this.pos.z - Math.cos(this.heading));
      const kl = Math.hypot(kx, kz) || 1;
      kx /= kl; kz /= kl;
      const k = this.knockVel || { x: kx * 2.2, z: kz * 2.2, y: 1.2 };
      this.knock = { x: k.x, z: k.z, vy: k.y };
      this.knockVel = null;
      const sp = Math.hypot(k.x, k.z);
      if (sp > 0.1) this.heading = Math.atan2(-k.x, -k.z);
      this.spin = Math.min(9, sp * 0.6);
      this.human.setWeapon(null);
      this.world.onNpcKilled(this, from);
      return true;
    }
    if (this.role === 'civ') this.alarm(from ? from.x : this.pos.x, from ? from.z : this.pos.z);
    return false;
  }

  update(dt) {
    const w = this.world;
    if (this.dead) {
      this.deadTime += dt;
      const k = this.knock;
      if (k) {
        // tumble, land, bounce, slide to a stop
        this.pos.x += k.x * dt;
        this.pos.z += k.z * dt;
        k.vy -= 18 * dt;
        this.y += k.vy * dt;
        const ground = w.city.groundHeight(this.pos.x, this.pos.z);
        if (this.y <= ground) {
          this.y = ground;
          k.vy = Math.abs(k.vy) > 3 ? -k.vy * 0.3 : 0;
          const f = Math.exp(-6 * dt);
          k.x *= f;
          k.z *= f;
          this.spin *= f;
        }
        w.city.pushCircle(this.pos, 0.3, this.y);
        if (Math.hypot(k.x, k.z) < 0.05 && k.vy === 0) this.knock = null;
      }
      this.human.animate(dt, this.spin || 0, 'dead');
      this.sync();
      return;
    }
    let moveX = 0;
    let moveZ = 0;
    let wantSpeed = 0;
    let face = null;
    let pose = 'move';
    const player = w.player;
    const tp = player.vehicle ? player.vehicle.pos : player.pos;
    const dx = tp.x - this.pos.x;
    const dz = tp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    switch (this.state) {
      case 'walk': {
        if (!this.loop) { this.state = 'idle'; break; }
        this.s += this.dir * this.walkSpeed * dt;
        const ahead = loopPoint(this.loop, this.s + this.dir * 1.2);
        const here = loopPoint(this.loop, this.s);
        // offset sideways from the loop line so walkers do not march in single file
        const ex = ahead.x - here.x;
        const ez = ahead.z - here.z;
        const el = Math.hypot(ex, ez) || 1;
        const tx = ahead.x + (-ez / el) * this.lane;
        const tz = ahead.z + (ex / el) * this.lane;
        moveX = tx - this.pos.x;
        moveZ = tz - this.pos.z;
        wantSpeed = this.walkSpeed;
        this.crossCool = (this.crossCool || 0) - dt;
        if (this.crossCool <= 0 && this.role === 'civ') this.maybeCross(here, ex / el, ez / el);
        if (Math.random() < dt * 0.02) { this.state = 'idle'; this.timer = 2 + Math.random() * 4; }
        break;
      }
      case 'idle':
      case 'stand':
      case 'guard':
        pose = 'idle';
        if (this.state === 'idle') {
          this.timer -= dt;
          if (this.timer <= 0) this.state = this.loop ? 'walk' : 'idle';
        }
        if (this.state === 'guard' && dist < this.alertRange && !player.dead) this.state = 'combat';
        if (this.state === 'stand' && dist < 8) face = Math.atan2(dx, dz);
        break;
      case 'flee': {
        this.timer -= dt;
        const t = this.threat || tp;
        moveX = this.pos.x - t.x;
        moveZ = this.pos.z - t.z;
        wantSpeed = 6.2;
        if (this.timer <= 0) {
          this.state = 'return';
          const b = w.city.blockAt(this.pos.x, this.pos.z);
          if (b) this.loop = w.city.loops.find((l) => l.bx === b.bx && l.bz === b.bz) || this.loop;
        }
        break;
      }
      case 'return': {
        if (!this.loop) { this.state = 'idle'; break; }
        const s = loopProject(this.loop, this.pos.x, this.pos.z);
        const p = loopPoint(this.loop, s);
        moveX = p.x - this.pos.x;
        moveZ = p.z - this.pos.z;
        wantSpeed = 2.2;
        if (Math.hypot(moveX, moveZ) < 0.6) { this.s = s; this.state = 'walk'; }
        break;
      }
      case 'browse': {
        // a customer in a shop: drift between spots in the room, stop and look, move on
        const A = this.area;
        if (!A) { this.state = 'idle'; break; }
        if (!this.goal || this.timer <= 0) {
          this.goal = { x: A.x0 + Math.random() * (A.x1 - A.x0), z: A.z0 + Math.random() * (A.z1 - A.z0) };
          this.timer = 4 + Math.random() * 6;
        }
        this.timer -= dt;
        moveX = this.goal.x - this.pos.x;
        moveZ = this.goal.z - this.pos.z;
        if (Math.hypot(moveX, moveZ) < 0.5) { moveX = 0; moveZ = 0; pose = 'idle'; } else wantSpeed = 1.0;
        if (dist < 2.2) face = Math.atan2(dx, dz);
        break;
      }
      case 'cower':
        // hands up while a gun is on them, then run for it
        pose = 'hands';
        face = Math.atan2(dx, dz);
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'flee'; this.timer = 6; this.threat = { x: tp.x, z: tp.z }; }
        break;
      case 'wait': {
        // at the kerb, waiting for the cars on the road ahead to get a red light
        pose = 'idle';
        const c = this.cross;
        face = Math.atan2(c.tx - this.pos.x, c.tz - this.pos.z);
        const light = w.signals.state(c.node, c.axis);
        // on red they walk; when the lights only blink at night they look, wait a moment and go
        if (light === 'red' || (light === 'flash' && this.timer < -3) || (this.timer -= dt) < -25) this.state = 'cross';
        if (light === 'flash') this.timer -= dt;
        break;
      }
      case 'cross': {
        const c = this.cross;
        moveX = c.tx - this.pos.x;
        moveZ = c.tz - this.pos.z;
        wantSpeed = this.walkSpeed * 1.25;
        if (Math.hypot(moveX, moveZ) < 0.5) {
          const b = w.city.blockAt(this.pos.x + Math.sign(moveX) * 2, this.pos.z + Math.sign(moveZ) * 2) || w.city.blockAt(this.pos.x, this.pos.z);
          const loop = b && w.city.loops.find((l) => l.bx === b.bx && l.bz === b.bz);
          if (loop) { this.loop = loop; this.s = loopProject(loop, this.pos.x, this.pos.z); }
          this.state = 'walk';
          this.crossCool = 30;
        }
        break;
      }
      case 'combat':
      case 'arrest':
        ({ moveX, moveZ, wantSpeed, face, pose } = this.fight(dt, dx, dz, dist));
        break;
      default:
        pose = 'idle';
    }

    // turn toward the way we move (or the face target), then step
    const ml = Math.hypot(moveX, moveZ);
    if (ml > 0.01 && wantSpeed > 0) {
      const target = Math.atan2(moveX, moveZ);
      if (face === null) this.heading += wrapAngle(target - this.heading) * Math.min(1, dt * 8);
      this.speed = damp(this.speed, wantSpeed, 6, dt);
      this.pos.x += (moveX / ml) * this.speed * dt;
      this.pos.z += (moveZ / ml) * this.speed * dt;
    } else {
      this.speed = damp(this.speed, 0, 8, dt);
    }
    if (face !== null) this.heading += wrapAngle(face - this.heading) * Math.min(1, dt * 10);
    w.city.pushCircle(this.pos, 0.35, this.y);
    this.y = damp(this.y, w.city.groundHeight(this.pos.x, this.pos.z), 15, dt);
    this.cooldown -= dt;
    if (this.punchT > 0) this.punchT -= dt * 2.5;
    this.human.animate(dt, this.speed, this.punchT > 0 ? 'punch' : pose, 0, 1 - this.punchT);
    this.sync(dt);
  }

  /** Police and gang combat: keep a fighting distance, strafe, and shoot when there is a line. */
  fight(dt, dx, dz, dist) {
    const w = this.world;
    const player = w.player;
    const out = { moveX: 0, moveZ: 0, wantSpeed: 0, face: Math.atan2(dx, dz), pose: 'aim' };
    if (player.dead) { out.pose = 'idle'; return out; }
    const cop = this.role === 'cop';
    const stars = w.police.stars;
    if (cop && stars === 0) { this.state = 'idle'; this.timer = 1e9; out.pose = 'idle'; return out; }
    const arresting = cop && stars <= 1 && !player.vehicle;
    if (arresting) {
      out.pose = 'move';
      if (dist > 1.1) { out.moveX = dx; out.moveZ = dz; out.wantSpeed = dist > 6 ? 6.5 : 3; }
      return out;
    }
    if (this.anchored) {
      // holding a position (a barge, a doorway): turn and shoot, never wander off it
      if (this.cooldown <= 0 && dist < 70) {
        const spec = WEAPONS[this.weapon || 'pistol'];
        this.cooldown = spec.auto ? 0.5 + Math.random() * 0.6 : 1.0 + Math.random() * 0.8;
        this.shoot(spec, dist);
      }
      return out;
    }
    const near = cop ? 7 : 5;
    const far = cop ? 18 : 15;
    if (dist > far) { out.moveX = dx; out.moveZ = dz; out.wantSpeed = 6.4; out.pose = dist > far + 8 ? 'move' : 'aim'; }
    else if (dist < near) { out.moveX = -dx; out.moveZ = -dz; out.wantSpeed = 2.5; }
    else {
      out.moveX = -dz * this.strafe;
      out.moveZ = dx * this.strafe;
      out.wantSpeed = 1.6;
      if (Math.random() < dt * 0.4) this.strafe *= -1;
    }
    if (out.wantSpeed > 5 && out.pose === 'move') return out;
    if (this.cooldown <= 0 && dist < 55) {
      const spec = WEAPONS[this.weapon || 'pistol'];
      this.cooldown = spec.auto ? 0.16 + Math.random() * 0.25 : 0.8 + Math.random() * 0.9;
      if (spec.auto && Math.random() < 0.15) this.cooldown = 1.4;
      this.shoot(spec, dist);
    }
    return out;
  }

  shoot(spec, dist) {
    const w = this.world;
    const p = w.player;
    const tx = p.vehicle ? p.vehicle.pos.x : p.pos.x;
    const tz = p.vehicle ? p.vehicle.pos.z : p.pos.z;
    const ty = (p.vehicle ? p.vehicle.y + 0.9 : p.y + 1.2);
    const ox = this.pos.x + Math.sin(this.heading) * 0.5;
    const oz = this.pos.z + Math.cos(this.heading) * 0.5;
    const oy = this.y + 1.45;
    if (!w.city.lineOfSight(ox, oy, oz, tx, ty, tz)) return;
    const pspeed = p.vehicle ? p.vehicle.speed : p.moveSpeed;
    const chance = clamp((0.62 - dist * 0.011 - pspeed * 0.018) * this.accuracy * w.difficulty, 0.06, 0.7);
    const hit = Math.random() < chance;
    let dx = tx - ox;
    let dy = ty - oy;
    let dz = tz - oz;
    const d = Math.hypot(dx, dy, dz);
    dx /= d; dy /= d; dz /= d;
    const [jx, jy, jz] = hit ? [dx, dy, dz] : jitter(dx, dy, dz, 0.06);
    const r = traceShot(w, this, ox, oy, oz, jx, jy, jz, spec.range);
    w.fx.spawn('muzzle', ox, oy, oz);
    w.fx.tracer(ox, oy, oz, ox + jx * r.t, oy + jy * r.t, oz + jz * r.t, this.role === 'cop' ? '#cfe3ff' : '#ffe0a0');
    w.audio.shot(spec.sound, Math.hypot(ox - p.pos.x, oz - p.pos.z));
    if (r.kind === 'player') w.hurtPlayer(spec.dmg * 0.45, this);
    else if (r.kind === 'vehicle') {
      r.ref.damage(spec.dmg * 0.25);
      if (r.ref === p.vehicle) w.hurtPlayer(spec.dmg * 0.08, this);
      w.fx.spawn('spark', ox + jx * r.t, oy + jy * r.t, oz + jz * r.t, 4);
    } else if (r.kind === 'npc') r.ref.hurt(spec.dmg * 0.6, this.pos);
    else if (r.kind === 'wall') w.fx.spawn('dust', ox + jx * r.t, oy + jy * r.t, oz + jz * r.t, 2);
  }

  sync() {
    this.human.root.position.set(this.pos.x, this.y, this.pos.z);
    this.human.root.rotation.y = this.heading;
    this.human.root.visible = !this.inVehicle;
  }

  remove() {
    this.world.scene.remove(this.human.root);
  }
}
