// Kai Moreno, the player: walking, sprinting and jumping relative to the camera, aiming and
// shooting through the crosshair, punching, switching and reloading weapons, getting into any
// car (pulling the driver out if there is one), driving it, bailing out, and changing clothes.
import { Human, LOOKS } from './human.js';
import { PLAYER } from './config.js';
import { WEAPONS, WEAPON_ORDER, traceShot, jitter } from './combat.js';
import { Npc } from './npc.js';
import { nearShore } from './boats.js';
import { PIER, COAST_Z } from './city.js';
import { damp, wrapAngle } from './rng.js';

export class Player {
  constructor(world) {
    this.world = world;
    this.human = new Human(LOOKS.kai);
    world.scene.add(this.human.root);
    this.pos = { x: 0, z: 0 };
    this.vel = { x: 0, z: 0 };
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.health = PLAYER.maxHealth;
    this.armor = 0;
    this.dead = false;
    this.vehicle = null;
    this.moveSpeed = 0;
    this.grounded = true;
    this.aiming = false;
    this.fireCd = 0;
    this.reloadT = 0;
    this.punchT = 0;
    this.stepT = 0;
    this.hurtFlash = 0;
    this.weapons = {
      fist: { owned: true, ammo: Infinity, clip: Infinity },
      pistol: { owned: true, ammo: 36, clip: 12 },
      smg: { owned: false, ammo: 0, clip: 0 },
      shotgun: { owned: false, ammo: 0, clip: 0 },
      carbine: { owned: false, ammo: 0, clip: 0 },
    };
    this.current = 'fist';
    this.human.setWeapon(null);
  }

  /** Dress Kai in a new look (an outfit from Threadline or the wardrobe): rebuild his model. */
  setLook(look) {
    const old = this.human;
    const visible = old.root.visible;
    this.world.scene.remove(old.root);
    this.human = new Human(look);
    this.human.root.visible = visible;
    this.human.setWeapon(this.current === 'fist' ? null : this.current);
    this.world.scene.add(this.human.root);
    this.sync();
  }

  where() { return this.vehicle ? this.vehicle.pos : this.pos; }

  place(x, z, heading = 0) {
    this.pos.x = x;
    this.pos.z = z;
    this.heading = heading;
    this.y = this.world.city.groundHeight(x, z);
    this.vy = 0;
    this.sync();
  }

  select(key) {
    if (!this.weapons[key] || !this.weapons[key].owned) return;
    this.current = key;
    this.reloadT = 0;
    this.human.setWeapon(key === 'fist' ? null : key);
    this.world.hud.weaponChanged();
  }

  cycle(step) {
    const owned = WEAPON_ORDER.filter((k) => this.weapons[k].owned);
    const i = owned.indexOf(this.current);
    this.select(owned[(i + step + owned.length) % owned.length]);
  }

  give(key, ammo) {
    const w = this.weapons[key];
    const fresh = !w.owned;
    w.owned = true;
    w.ammo += ammo;
    if (w.clip === 0) {
      // load the new magazine of the weapon just given, not of the one in hand
      const take = Math.min(WEAPONS[key].mag, w.ammo);
      w.clip += take;
      w.ammo -= take;
    }
    if (fresh) this.select(key);
  }

  reload(instant = false) {
    if (this.current === 'fist') return;
    const spec = WEAPONS[this.current];
    const w = this.weapons[this.current];
    if (w.clip >= spec.mag || w.ammo <= 0) return;
    if (instant) {
      const take = Math.min(spec.mag - w.clip, w.ammo);
      w.clip += take;
      w.ammo -= take;
    } else if (this.reloadT <= 0) {
      this.reloadT = 1.1;
      this.world.audio.ui('move');
    }
  }

  update(dt, input, cam) {
    if (this.dead) {
      this.human.animate(dt, 0, this.world.downKind === 'busted' ? 'hands' : 'dead');
      this.sync();
      return;
    }
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.vehicle) {
      this.drive(dt, input);
      return;
    }
    const w = this.world;
    // weapon choice
    if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);
    if (input.hit('KeyQ')) this.cycle(1);
    WEAPON_ORDER.forEach((k, i) => { if (input.hit(`Digit${i + 1}`)) this.select(k); });
    if (input.hit('KeyR')) this.reload();

    // move relative to the camera
    const fx = Math.sin(cam.yaw);
    const fz = Math.cos(cam.yaw);
    const ix = input.axis('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight');
    const iz = input.axis('KeyS', 'KeyW', 'ArrowDown', 'ArrowUp');
    let mx = fx * iz + -fz * ix;
    let mz = fz * iz + fx * ix;
    const ml = Math.hypot(mx, mz);
    this.aiming = input.mouse(2) && this.current !== 'fist';
    if (input.mouseHit(2) && this.current !== 'fist') this.lockOn(cam);
    if (this.aiming) this.scareInSights(cam);
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = ml > 0 ? (this.aiming ? PLAYER.walk * 0.7 : run ? PLAYER.run : PLAYER.walk) : 0;
    if (ml > 0) { mx /= ml; mz /= ml; }
    const accel = this.grounded ? 14 : 3;
    this.vel.x = damp(this.vel.x, mx * speed, accel, dt);
    this.vel.z = damp(this.vel.z, mz * speed, accel, dt);
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // face where we go, or where we aim
    const firing = input.mouse(0);
    if (this.aiming || (firing && this.current !== 'fist')) this.heading = cam.yaw;
    else if (this.moveSpeed > 0.4) this.heading += wrapAngle(Math.atan2(this.vel.x, this.vel.z) - this.heading) * Math.min(1, dt * 12);

    // jumping and gravity over curbs and the pier
    const ground = w.city.groundHeight(this.pos.x, this.pos.z);
    if (this.grounded && input.hit('Space')) { this.vy = PLAYER.jump; this.grounded = false; }
    this.vy -= PLAYER.gravity * dt;
    this.y += this.vy * dt;
    if (this.y <= ground) {
      if (!this.grounded && this.vy < -2) w.audio.step(true);
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
    } else if (this.y - ground > 0.25) this.grounded = false;
    if (this.grounded && ground > this.y) this.y = ground;

    w.city.pushCircle(this.pos, PLAYER.radius, this.y);
    // parked and moving cars are solid on foot
    for (const v of w.vehicles) {
      const d0 = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
      if (d0 > v.halfLen + 1) continue;
      for (const c of v.circles()) {
        const dx = this.pos.x - c.x;
        const dz = this.pos.z - c.z;
        const d = Math.hypot(dx, dz);
        const r = v.radius + PLAYER.radius;
        if (d < r && d > 0.001) {
          this.pos.x = c.x + (dx / d) * r;
          this.pos.z = c.z + (dz / d) * r;
        }
      }
    }

    // footsteps
    if (this.grounded && this.moveSpeed > 1) {
      this.stepT -= dt * this.moveSpeed;
      if (this.stepT <= 0) { this.stepT = 1.7; w.audio.step(run); }
    }

    // combat
    this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.reload(true);
    }
    const spec = WEAPONS[this.current];
    if (firing && this.fireCd <= 0 && this.reloadT <= 0) {
      if (spec.melee) {
        if (input.mouseHit(0) || this.fireCd < -0.2) this.punch();
      } else if (spec.auto || input.mouseHit(0)) {
        this.shoot(cam, spec);
      }
    }
    if (this.punchT > 0) this.punchT -= dt * 2.6;

    // interact
    if (input.hit('KeyF') || input.hit('Enter')) this.tryEnter();

    let pose = this.grounded ? 'move' : 'air';
    if (this.aiming || (firing && !spec.melee)) pose = 'aim';
    if (this.punchT > 0) pose = 'punch';
    this.human.animate(dt, this.moveSpeed, pose, this.aiming || firing ? cam.pitch * 0.9 : 0, 1 - this.punchT);
    this.sync();
  }

  shoot(cam, spec) {
    const w = this.world;
    const ws = this.weapons[this.current];
    if (ws.clip <= 0) {
      this.reload();
      if (ws.ammo <= 0) { this.fireCd = 0.3; w.audio.ui('move'); }
      return;
    }
    ws.clip -= 1;
    this.fireCd = spec.rate;
    const o = cam.camera.position;
    const d = cam.dir;
    // start the ray level with the player so walls behind Kai do not stop bullets
    const t0 = Math.max(0, (this.pos.x - o.x) * d.x + (this.y + 1.4 - o.y) * d.y + (this.pos.z - o.z) * d.z);
    const ox = o.x + d.x * t0;
    const oy = o.y + d.y * t0;
    const oz = o.z + d.z * t0;
    const mx = this.pos.x + Math.sin(this.heading) * 0.6 + Math.cos(this.heading) * -0.25;
    const mz = this.pos.z + Math.cos(this.heading) * 0.6 - Math.sin(this.heading) * -0.25;
    const my = this.y + 1.45;
    const pellets = spec.pellets || 1;
    const spread = spec.spread * (this.aiming ? 0.5 : 1.4) * (1 + this.moveSpeed * 0.08);
    for (let k = 0; k < pellets; k += 1) {
      const [dx, dy, dz] = jitter(d.x, d.y, d.z, spread);
      const r = traceShot(w, this, ox, oy, oz, dx, dy, dz, spec.range);
      // the range's pop-up boards stand in front of the back wall: they take the round first
      const target = w.activities && w.activities.onShot(ox, oy, oz, dx, dy, dz, r.t);
      if (target) {
        w.fx.tracer(mx, my, mz, ox + dx * target.t, oy + dy * target.t, oz + dz * target.t);
        continue;
      }
      const hx = ox + dx * r.t;
      const hy = oy + dy * r.t;
      const hz = oz + dz * r.t;
      w.fx.tracer(mx, my, mz, hx, hy, hz);
      if (r.kind === 'npc') {
        const head = hy - r.ref.y > 1.55;
        w.playerHitNpc(r.ref, spec.dmg * (head ? 2.2 : 1));
      } else if (r.kind === 'vehicle') {
        r.ref.damage(spec.dmg * 0.35);
        w.fx.spawn('spark', hx, hy, hz, 4);
        if (r.ref.kind === 'police') w.police.report('copHit', this.pos.x, this.pos.z);
        if (r.ref.ai && r.ref.ai.mode === 'traffic') r.ref.ai.panic = 8;
      } else if (r.kind === 'heli') {
        r.ref.damage(spec.dmg * 0.5);
      } else if (r.kind === 'wall') {
        w.fx.spawn('dust', hx, hy, hz, 2);
        w.fx.spawn('spark', hx, hy, hz, 2);
      }
    }
    w.fx.spawn('muzzle', mx, my, mz);
    w.fx.shake = Math.max(w.fx.shake, pellets > 1 ? 0.35 : 0.12);
    cam.kick(pellets > 1 ? 0.05 : 0.018);
    w.audio.shot(spec.sound, 0);
    w.gunfire(this.pos.x, this.pos.z);
  }

  /** Civilians in the sights put their hands up. */
  scareInSights(cam) {
    for (const n of this.world.npcs) {
      if (n.role !== 'civ' || n.dead) continue;
      const dx = n.pos.x - this.pos.x;
      const dz = n.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 25 || d < 0.5) continue;
      const a = Math.atan2(dx, dz) - cam.yaw;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.12) n.scare();
    }
  }

  /** Aim assist: the nearest armed enemy (or anyone, failing that) close to the crosshair. */
  lockOn(cam) {
    const w = this.world;
    let best = null;
    let score = Infinity;
    for (const n of w.npcs) {
      if (n.dead || n.inVehicle || n.invulnerable) continue;
      const dx = n.pos.x - this.pos.x;
      const dz = n.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 45 || d < 1) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - cam.yaw), Math.cos(Math.atan2(dx, dz) - cam.yaw)));
      if (off > 0.32) continue;
      if (!w.city.lineOfSight(this.pos.x, this.y + 1.5, this.pos.z, n.pos.x, n.y + 1.3, n.pos.z)) continue;
      const hostile = n.role === 'saint' || (n.role === 'cop' && w.police.stars > 0);
      const s = off * 40 + d * 0.3 - (hostile ? 30 : 0);
      if (s < score) { score = s; best = n; }
    }
    if (best) cam.assist(best);
  }

  punch() {
    const w = this.world;
    this.punchT = 1;
    this.fireCd = WEAPONS.fist.rate;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let best = null;
    let bd = 2.0;
    for (const n of w.npcs) {
      if (n.dead || n.inVehicle) continue;
      const dx = n.pos.x - this.pos.x;
      const dz = n.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.3) { bd = d; best = n; }
    }
    if (best) {
      w.audio.punch();
      w.playerHitNpc(best, WEAPONS.fist.dmg, true);
      best.pos.x += fx * 0.6;
      best.pos.z += fz * 0.6;
    } else w.audio.ui('move');
  }

  /** Get into the nearest car within reach, pulling out whoever is driving it. */
  tryEnter() {
    const w = this.world;
    // the nearest unlocked vehicle in reach (big ones reach further: a yacht's side, a van's door)
    let best = null;
    let bd = Infinity;
    let locked = false;
    for (const v of w.vehicles) {
      if (v.dead) continue;
      const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z) - Math.max(0, v.spec.wid / 2 - 1);
      if (d > 4.2) continue;
      if (v.locked) { locked = true; continue; }
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) { if (locked) w.hud.notify('This one is locked.'); return; }
    const v = best;
    if (v.driver && v.driver !== 'player') {
      // carjack: the driver is thrown out on the kerb side and runs
      const sx = v.spec.wid / 2 + 0.8;
      const x = v.pos.x + Math.cos(v.heading) * sx;
      const z = v.pos.z - Math.sin(v.heading) * sx;
      const cop = v.kind === 'police';
      const n = new Npc(w, cop ? 'cop' : 'civ', x, z, { state: cop ? 'combat' : 'flee' });
      n.threat = { x: this.pos.x, z: this.pos.z };
      n.timer = 8;
      w.npcs.push(n);
      w.police.report(cop ? 'copHit' : 'jack', this.pos.x, this.pos.z, cop);
      w.audio.punch();
      if (v.mission && v.mission.onJack) v.mission.onJack(v);
    }
    v.driver = 'player';
    v.ai = null;
    v.crew = 0;
    if (v.kind !== 'police' && v.kind !== 'personal') v.kind = 'player';
    v.input.throttle = 0;
    v.input.handbrake = false;
    this.vehicle = v;
    this.human.root.visible = v.spec.body === 'bike' || v.spec.body === 'boat';
    this.aiming = false;
    w.onEnterVehicle(v);
  }

  exitVehicle() {
    const w = this.world;
    const v = this.vehicle;
    const sx = v.spec.wid / 2 + 0.7;
    this.pos.x = v.pos.x + Math.cos(v.heading) * sx;
    this.pos.z = v.pos.z - Math.sin(v.heading) * sx;
    if (v.spec.body === 'boat') {
      // step across onto the pier, or wade up onto the beach
      if (Math.abs(v.pos.x - PIER.x) < PIER.half + 5 && v.pos.z < PIER.z1 + 5) {
        this.pos.x = PIER.x + Math.sign(v.pos.x - PIER.x || 1) * (PIER.half - 1);
        this.pos.z = Math.min(v.pos.z, PIER.z1 - 1.5);
      } else {
        this.pos.x = v.pos.x;
        this.pos.z = COAST_Z - 2;
      }
    }
    this.heading = v.heading;
    this.y = w.city.groundHeight(this.pos.x, this.pos.z);
    this.vel.x = v.vel.x * 0.4;
    this.vel.z = v.vel.z * 0.4;
    if (v.speed > 9) {
      w.hurtPlayer(Math.min(25, v.speed * 0.8), null);
      w.hud.notify('You bailed out!');
    }
    v.driver = null;
    v.input.throttle = 0;
    v.input.steer = 0;
    v.input.handbrake = v.speed < 9;
    if (v.kind === 'player') v.kind = v.spec.body === 'boat' ? 'parked' : 'abandoned';
    this.vehicle = null;
    this.human.root.visible = true;
    w.city.pushCircle(this.pos, PLAYER.radius, this.y);
    w.onExitVehicle(v);
    this.sync();
  }

  drive(dt, input) {
    const w = this.world;
    const v = this.vehicle;
    // drive-by: shoot through the crosshair with whatever gun is in hand
    if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);
    if (input.hit('KeyQ')) this.cycle(1);
    this.fireCd -= dt;
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.reload(true); }
    const gun = WEAPONS[this.current];
    this.aiming = !gun.melee && (input.mouse(2) || input.mouse(0));
    if (!gun.melee && input.mouse(0) && this.fireCd <= 0 && this.reloadT <= 0 && (gun.auto || input.mouseHit(0))) this.shoot(this.world.rig, gun);
    v.input.throttle = input.axis('KeyS', 'KeyW', 'ArrowDown', 'ArrowUp');
    v.input.steer = input.axis('KeyD', 'KeyA', 'ArrowRight', 'ArrowLeft');
    v.input.handbrake = input.down('Space');
    if (input.hit('KeyH')) w.audio.horn();
    if (input.hit('KeyR')) w.cycleRadio();
    if (input.hit('KeyF') || input.hit('Enter')) {
      const barge = v.spec.body === 'boat' && w.city.platforms.find((f) => v.pos.x > f.x0 - 5 && v.pos.x < f.x1 + 5 && v.pos.z > f.z0 - 5 && v.pos.z < f.z1 + 5);
      if (barge) {
        this.exitVehicle();
        this.pos.x = Math.min(Math.max(v.pos.x, barge.x0 + 1), barge.x1 - 1);
        this.pos.z = Math.min(Math.max(v.pos.z, barge.z0 + 1), barge.z1 - 1);
        this.y = barge.y;
        return;
      }
      if (v.spec.body === 'boat' && !nearShore(v.pos.x, v.pos.z)) w.hud.notify('Too far from shore: bring the boat in to the beach, the pier or a barge.');
      else { this.exitVehicle(); return; }
    }
    this.pos.x = v.pos.x;
    this.pos.z = v.pos.z;
    this.y = v.y;
    this.heading = v.heading;
    this.moveSpeed = v.speed;
    if (v.spec.body === 'boat') {
      // standing at the console
      this.human.animate(dt, 0, 'idle');
      const c = Math.cos(v.heading);
      const s = Math.sin(v.heading);
      this.human.root.position.set(v.pos.x + c * 0.25 - s * 0.2, v.y + 0.97, v.pos.z - s * 0.25 - c * 0.2);
      this.human.root.rotation.set(v.parts.body.rotation.x, v.heading, v.parts.body.rotation.z);
    } else if (v.spec.body === 'bike') {
      // ride it: sit on the seat and lean with the bike
      this.human.animate(dt, 0, 'ride');
      this.human.root.position.set(v.pos.x - Math.sin(v.heading) * 0.2, v.y + 0.42, v.pos.z - Math.cos(v.heading) * 0.2);
      this.human.root.rotation.set(0, v.heading, 0);
      this.human.root.rotateZ(v.lean || 0);
    }
    if (v.dead) this.exitVehicle();
  }

  sync() {
    this.human.root.position.set(this.pos.x, this.y, this.pos.z);
    this.human.root.rotation.y = this.heading;
  }

  hasGun() { return this.current !== 'fist'; }
}

