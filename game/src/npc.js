// People on the street: civilians walking the sidewalk loops around each block (and fleeing when
// guns come out), police officers who arrest or shoot depending on the wanted level, Glass Saints
// gang members who guard their turf and fight, and the story's contacts who wait for Kai.
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
    this.inVehicle = null;
    this.vehicle = null;
    this.punchT = 0;
    this.sync(0);
  }

  get alive() { return !this.dead; }

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
      this.human.animate(dt, 0, 'dead');
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
      case 'cower':
        pose = 'hands';
        break;
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
