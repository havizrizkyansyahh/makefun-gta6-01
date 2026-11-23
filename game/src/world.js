// The game world: owns the scene and every system (city, sky, effects, player, traffic, police,
// missions, pickups) and runs one simulation step: driving and collisions, people, crimes and the
// police response, damage, wrecks that burn and explode, pickups, money, the clock, sound and the
// camera. It also handles being wasted or busted, respawning, and the save file.
import * as THREE from '../vendor/three.module.min.js';
import { City, PIER } from './city.js';
import { Signals } from './signals.js';
import { Weather } from './weather.js';
import { SkidMarks } from './skids.js';
import { Sky } from './sky.js';
import { Effects } from './effects.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { CameraRig } from './camera.js';
import { collideVehicles, Vehicle, headlightGlow } from './vehicles.js';
import { Pickup, Marker } from './markers.js';
import { STATIONS } from './audio.js';
import { CITY, DAY_SECONDS, START_HOUR, SAVE_KEY, PLAYER } from './config.js';
import { makeRng } from './rng.js';

export class World {
  constructor(renderer, audio, hud, seed = 7) {
    this.renderer = renderer;
    this.audio = audio;
    this.hud = hud;
    this.rng = makeRng(seed * 31 + 5);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2400);
    this.cityPitch = CITY.pitch;
    this.density = 1;
    this.difficulty = 1;
    this.city = new City(this.scene, seed);
    this.signals = new Signals(this.scene, this.city);
    this.weather = new Weather(this);
    this.skids = new SkidMarks(this.scene);
    // two real spot lights ride along on whatever the player drives after dark
    this.headlights = [0, 1].map(() => {
      const l = new THREE.SpotLight('#fff1d0', 0, 70, 0.5, 0.55, 1.3);
      this.scene.add(l, l.target);
      return l;
    });
    this.sky = new Sky(this.scene);
    this.fx = new Effects(this.scene);
    this.vehicles = [];
    this.npcs = [];
    this.pickups = [];
    this.events = [];
    this.player = new Player(this);
    this.rig = new CameraRig(this.camera);
    this.traffic = new Traffic(this);
    this.police = new Police(this);
    this.missions = new Missions(this);
    this.money = 250;
    this.hour = START_HOUR;
    this.time = 0;
    this.stats = { kills: 0, cops: 0, stolen: 0, deliveries: 0, missions: 0, crashes: 0, played: 0 };
    this.station = 0;
    this.downTimer = 0;
    this.downKind = null;
    this.lastDistrict = null;
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    hud.attach(this);
  }

  /** Begin a fresh game at Nadia's truck on Palmline Beach. */
  newGame() {
    const n = this.city.places.nadia;
    // start on the sand behind the boulevard, looking at Nadia's truck and the sea
    this.player.place(n.x - 7, n.z - 11, 0.5);
    this.rig.snap(0.55, 0.12);
    this.populate();
  }

  populate() {
    if (this.populated) return;
    this.populated = true;
    this.traffic.spawnParked();
    this.traffic.update(0, true);
    // a starter car parked on the boulevard by the truck
    const n = this.city.places.nadia;
    const seg = { a: this.city.nearestNode(n.x - 40, n.z - 20), b: this.city.nearestNode(n.x + 50, n.z - 20), t: 0.5 };
    // two speedboats tied up at the end of the pier
    for (const side of [-1, 1]) {
      const boat = new Vehicle(this.scene, 'marisol', side > 0 ? '#f4f4f0' : '#1d3557', PIER.x + side * 6.5, PIER.z1 - 12, 0);
      boat.kind = 'parked';
      this.vehicles.push(boat);
    }
    // a bike on the sand by the truck, for anyone who prefers two wheels
    const bike = new Vehicle(this.scene, 'sprint', '#ffb703', n.x + 9, n.z - 4, Math.PI / 2);
    bike.kind = 'parked';
    this.vehicles.push(bike);
    if (seg.a !== seg.b) {
      const v = this.traffic.spawnCar(seg, 'ardent');
      if (v) { v.ai = null; v.driver = null; v.kind = 'parked'; v.vel.x = v.vel.z = 0; }
    }
  }

  where() { return this.player.where(); }

  /** Rough "could the player see this point" test: in front of the camera, within range. */
  isVisible(x, y, z, range) {
    const c = this.camera.position;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d > range) return false;
    this.projScreen.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    return this.frustum.containsPoint(new THREE.Vector3(x, y, z));
  }

  // ------------------------------------------------------------ crime, damage, death
  gunfire(x, z) {
    for (const n of this.npcs) {
      if (Math.hypot(n.pos.x - x, n.pos.z - z) < 45) n.alarm(x, z);
    }
    for (const v of this.vehicles) if (v.ai && v.ai.mode === 'traffic' && Math.hypot(v.pos.x - x, v.pos.z - z) < 50) v.ai.panic = 8;
    if (this.player.current !== 'fist') this.police.report('shots', x, z, false);
  }

  playerHitNpc(npc, dmg, melee = false) {
    if (npc.invulnerable) return;
    const killed = npc.hurt(dmg, this.player.pos);
    const at = this.player.where();
    if (npc.role === 'cop') this.police.report(killed ? 'copKill' : 'copHit', at.x, at.z);
    else if (npc.role === 'civ') this.police.report(killed ? 'murder' : 'assault', at.x, at.z, killed);
    else if (npc.role === 'saint' && killed) this.police.report('murder', at.x, at.z, false);
    if (melee) this.fx.spawn('dust', npc.pos.x, npc.y + 1.4, npc.pos.z, 2);
  }

  onNpcKilled(npc) {
    this.stats.kills += 1;
    if (npc.role === 'cop') this.stats.cops += 1;
    const r = this.rng;
    if (npc.role === 'cop' || npc.role === 'saint') {
      this.pickups.push(new Pickup(this.scene, 'ammo', npc.pos.x + 0.6, npc.pos.z, npc.y, { amount: npc.weapon === 'smg' ? 30 : 12 }));
    }
    if (npc.role === 'saint' || r.chance(0.35)) {
      this.pickups.push(new Pickup(this.scene, 'cash', npc.pos.x - 0.5, npc.pos.z + 0.4, npc.y, { amount: npc.role === 'saint' ? r.int(60, 180) : r.int(8, 60) }));
    }
  }

  hurtPlayer(amount, from) {
    const p = this.player;
    if (p.dead || this.godMode) return;
    let a = amount * this.difficulty;
    if (p.armor > 0) {
      const soak = Math.min(p.armor, a * 0.7);
      p.armor -= soak;
      a -= soak;
    }
    p.health -= a;
    p.hurtFlash = 0.35;
    if (p.health <= 0) this.wasted();
    void from;
  }

  wasted() {
    const p = this.player;
    if (p.dead) return;
    p.health = 0;
    p.dead = true;
    if (p.vehicle) p.exitVehicle();
    this.downKind = 'wasted';
    this.downTimer = 4.5;
    this.hud.bigText('WASTED', '', 4, '#ff3b3b', true);
    this.audio.ui('wasted');
    this.missions.onPlayerDown();
  }

  busted() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    if (p.vehicle) p.exitVehicle();
    p.human.animate(0, 0, 'hands');
    this.downKind = 'busted';
    this.downTimer = 4.5;
    this.hud.bigText('BUSTED', '', 4, '#7aa2ff', true);
    this.audio.ui('fail');
    this.missions.onPlayerDown();
  }

  respawn() {
    const p = this.player;
    const kind = this.downKind;
    const place = kind === 'busted' ? this.city.places.precinct : this.city.places.hospital;
    const fee = Math.min(this.money, kind === 'busted' ? 300 + Math.round(this.money * 0.05) : 200 + Math.round(this.money * 0.05));
    this.money -= fee;
    if (kind === 'busted') {
      for (const k of ['pistol', 'smg', 'shotgun']) p.weapons[k].ammo = Math.floor(p.weapons[k].ammo / 2);
    }
    p.dead = false;
    p.health = PLAYER.maxHealth;
    p.human.fall = 0;
    this.police.clear();
    p.place(place.x, place.z + 1.5, place.face);
    this.rig.snap(place.face, 0.2);
    this.downKind = null;
    this.hud.notify(kind === 'busted' ? `The SBPD kept $${fee} and half your ammo.` : `St. Amara Medical billed you $${fee}.`);
  }

  onEnterVehicle(v) {
    this.stats.stolen += 1;
    this.hud.vehicleName(v.spec.name);
    const st = this.audio.tune(this.station);
    if (st) this.hud.radio(st);
    this.rig.idle = 5;
  }

  onExitVehicle() {
    this.audio.tune(-1);
    this.audio.engine(false, 0, 0);
  }

  cycleRadio() {
    this.station = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
    const st = this.audio.tune(this.station);
    this.hud.radio(st);
  }

  // ------------------------------------------------------------ the step
  step(dt, input) {
    // the weapon wheel: hold Tab, time slows, the mouse points at a weapon instead of the camera
    const wheel = this.hud.weapons;
    const p0 = this.player;
    if (input.down('Tab') && !p0.dead && !wheel.open) wheel.openWheel(p0);
    if (wheel.open) {
      wheel.point(input.mouseDX, input.mouseDY, p0);
      ['fist', 'pistol', 'smg', 'shotgun'].forEach((k, i) => { if (input.hit(`Digit${i + 1}`) && p0.weapons[k].owned) wheel.choice = k; });
      input.mouseDX = 0;
      input.mouseDY = 0;
      if (!input.down('Tab')) {
        const k = wheel.closeWheel();
        if (k && k !== p0.current) p0.select(k);
      } else dt *= 0.25;
    }
    this.time += dt;
    this.stats.played += dt;
    this.hour = (this.hour + (dt * 24) / DAY_SECONDS) % 24;
    const p = this.player;
    this.hud.frameStart();

    if (p.dead) {
      this.downTimer -= dt;
      if (this.downTimer <= 0) this.respawn();
    }
    p.update(dt, input, this.rig);
    this.signals.update(dt);

    // vehicles: AI, physics, collisions
    this.events.length = 0;
    for (const v of this.vehicles) {
      if (v.ai) v.ai.update(dt);
      const asleep = !v.ai && v.driver === null && v.speed < 0.05 && v.health > 0 && v !== p.vehicle;
      if (!asleep || v.kind === 'abandoned' || v.spec.body === 'boat') v.update(dt, this.city, this.events, this);
      v.lights(this.time, this.sky.night);
    }
    collideVehicles(this.vehicles, this.events);
    this.skids.update(this.vehicles, this.city);
    this.handleVehicleEvents();
    this.vehicleHits(dt);
    this.wrecks(dt);

    for (const n of this.npcs) n.update(dt);
    this.separatePeople();
    this.cullFar();
    this.police.update(dt);
    this.traffic.update(dt);
    this.missions.update(dt, input);
    this.collectPickups(dt);
    this.fx.update(dt);

    const at = this.where();
    this.sky.update(this.hour, at);
    this.weather.update(dt);
    this.weather.applyToSky(this.sky, this.scene);
    this.city.setWet(this.weather.wet);
    if (this.waypoint) {
      const wp = this.waypoint;
      wp.marker.update(dt);
      wp.t -= dt;
      if (wp.t <= 0) { wp.t = 0.5; this.updateRoute(); }
      const here = this.where();
      if (Math.hypot(here.x - wp.x, here.z - wp.z) < 12) { this.clearWaypoint(); this.hud.notify('You have arrived.'); this.audio.ui('pickup'); }
    }
    this.lightsOn();
    this.city.syncSky(this.sky.uniforms);
    this.city.update(this.time, this.sky.night);
    this.rig.update(dt, this, input);
    this.sounds();

    const d = this.city.districtAt(at.x, at.z);
    if (d !== this.lastDistrict) {
      if (this.lastDistrict !== null) this.hud.district(d);
      this.lastDistrict = d;
    }
    this.hud.update(dt);
  }

  handleVehicleEvents() {
    const p = this.player;
    for (const e of this.events) {
      const at = this.where();
      if (e.type === 'crash') {
        const d = Math.hypot(e.vehicle.pos.x - at.x, e.vehicle.pos.z - at.z);
        this.audio.crash(e.impact, d);
        if (e.vehicle === p.vehicle) {
          this.fx.shake = Math.max(this.fx.shake, Math.min(1, e.impact / 20));
          this.stats.crashes += 1;
          if (p.vehicle.spec.body === 'bike' && e.impact > 11) this.throwRider(e.impact);
          if (e.impact > 18) this.hurtPlayer((e.impact - 18) * 1.5, null);
        }
        this.fx.spawn('spark', e.vehicle.pos.x + e.vehicle.fx * e.vehicle.halfLen, 0.6, e.vehicle.pos.z + e.vehicle.fz * e.vehicle.halfLen, 6);
      } else if (e.type === 'carhit') {
        const d = Math.hypot(e.x - at.x, e.z - at.z);
        this.audio.crash(e.impact, d);
        this.fx.spawn('spark', e.x, 0.7, e.z, 8);
        const mine = e.a === p.vehicle || e.b === p.vehicle;
        if (mine) {
          this.fx.shake = Math.max(this.fx.shake, Math.min(1, e.impact / 18));
          if (p.vehicle.spec.body === 'bike' && e.impact > 9) { this.throwRider(e.impact); continue; }
          const other = e.a === p.vehicle ? e.b : e.a;
          // only the player's own ramming is a crime, not being rammed by a cruiser
          const mineSpeed = p.vehicle.speed;
          if (other.kind === 'police' && mineSpeed > 8 && mineSpeed > other.speed) this.police.report('ramCop', at.x, at.z);
          if (other.ai && other.ai.mode === 'traffic') other.ai.panic = 6;
        }
      }
    }
  }

  /** Off the bike and onto the tarmac after a hard hit. */
  throwRider(impact) {
    const p = this.player;
    const v = p.vehicle;
    if (!v) return;
    const vx = v.vel.x;
    const vz = v.vel.z;
    p.exitVehicle();
    p.vel.x = vx * 0.5;
    p.vel.z = vz * 0.5;
    p.vy = 4;
    p.grounded = false;
    this.hurtPlayer(Math.min(60, impact * 1.6), null);
    this.hud.notify('Thrown off the bike!');
  }

  /** Moving cars knock people down. */
  vehicleHits() {
    const p = this.player;
    for (const v of this.vehicles) {
      const sp = v.speed;
      if (sp < 3.5) continue;
      for (const n of this.npcs) {
        if (n.dead || n.inVehicle) continue;
        if (Math.abs(n.pos.x - v.pos.x) > v.halfLen + 1 || Math.abs(n.pos.z - v.pos.z) > v.halfLen + 1) continue;
        for (const c of v.circles()) {
          const d = Math.hypot(n.pos.x - c.x, n.pos.z - c.z);
          if (d < v.radius + 0.35) {
            n.pos.x += v.vel.x * 0.08 + (n.pos.x - c.x) * 0.5;
            n.pos.z += v.vel.z * 0.08 + (n.pos.z - c.z) * 0.5;
            // knocked flying by the bonnet
            n.knockVel = { x: v.vel.x * 0.75, z: v.vel.z * 0.75, y: 2.5 + sp * 0.18 };
            if (v === p.vehicle) this.playerHitNpc(n, sp * 6);
            else n.hurt(sp * 6, v.pos);
            n.knockVel = null;
            this.audio.impact();
            break;
          }
        }
      }
      if (!p.vehicle && !p.dead && v !== p.vehicle) {
        for (const c of v.circles()) {
          const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
          if (d < v.radius + PLAYER.radius) {
            this.hurtPlayer(sp * 2.6, v);
            p.vel.x += v.vel.x * 0.6;
            p.vel.z += v.vel.z * 0.6;
            this.audio.impact();
            break;
          }
        }
      }
    }
  }

  /** Damaged cars smoke, wrecks burn, then explode and hurt everything near. */
  wrecks(dt) {
    const p = this.player;
    for (const v of this.vehicles) {
      if (v.dead) continue;
      const hx = v.pos.x + v.fx * (v.halfLen - 0.6);
      const hz = v.pos.z + v.fz * (v.halfLen - 0.6);
      if (v.health < 45 && Math.random() < dt * (v.health < 20 ? 14 : 5)) this.fx.spawn('smoke', hx, v.y + 1.1, hz);
      if (v.health <= 0) {
        if (Math.random() < dt * 30) this.fx.spawn('fire', hx, v.y + 1.0, hz);
        if (v.burn > 3.2) this.explode(v);
      }
      if (v === p.vehicle && v.skid > 0.5 && v.speed > 6 && Math.random() < dt * 25) {
        this.fx.spawn('tyre', v.pos.x - v.fx * v.halfLen * 0.7, 0.3, v.pos.z - v.fz * v.halfLen * 0.7);
      }
    }
  }

  explode(v) {
    const p = this.player;
    v.explode();
    this.fx.explosion(v.pos.x, v.y, v.pos.z);
    const at = this.where();
    this.audio.explosion(Math.hypot(v.pos.x - at.x, v.pos.z - at.z));
    v.vel.x *= 0.2; v.vel.z *= 0.2;
    if (p.vehicle === v) p.exitVehicle();
    for (const n of this.npcs) {
      const d = Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z);
      if (d < 7) {
        const k = 9 * (1 - d / 7) + 2;
        n.knockVel = { x: ((n.pos.x - v.pos.x) / (d || 1)) * k, z: ((n.pos.z - v.pos.z) / (d || 1)) * k, y: 4 + k * 0.4 };
        n.hurt(200 * (1 - d / 7) + 20, v.pos);
      }
    }
    for (const o of this.vehicles) {
      if (o === v) continue;
      const d = Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z);
      if (d < 8) o.damage(70 * (1 - d / 8));
    }
    const d = Math.hypot(p.pos.x - v.pos.x, p.pos.z - v.pos.z);
    if (d < 7) this.hurtPlayer(110 * (1 - d / 7), v);
    if (v.mission === true || v.kind === 'police') this.police.report('shots', v.pos.x, v.pos.z, false);
  }

  /** Drop a waypoint: a purple beam in the world and a GPS route along the streets. */
  setWaypoint(x, z) {
    this.clearWaypoint();
    const y = this.city.groundHeight(x, z);
    this.waypoint = { x, z, marker: new Marker(this.scene, x, z, '#c77dff', 2.2, y), route: [], t: 0 };
    this.updateRoute();
  }

  clearWaypoint() {
    if (this.waypoint) this.waypoint.marker.remove();
    this.waypoint = null;
  }

  /** Recompute the route from wherever the player is now. */
  updateRoute() {
    const wp = this.waypoint;
    if (!wp) return;
    const at = this.where();
    const nodes = this.city.route(this.city.nearestNode(at.x, at.z), this.city.nearestNode(wp.x, wp.z));
    wp.route = [{ x: at.x, z: at.z }, ...nodes.map((n) => ({ x: this.city.nodes[n].x, z: this.city.nodes[n].z })), { x: wp.x, z: wp.z }];
  }

  /** Headlights: beams on the road for every car, real light from the player's own. */
  lightsOn() {
    const night = Math.min(1, this.sky.night + this.weather.rain * 0.5);
    headlightGlow.opacity = Math.max(0, night - 0.35) / 0.65 * 0.45;
    const v = this.player.vehicle;
    this.headlights.forEach((l, i) => {
      if (!v || v.dead || night < 0.4) { l.intensity = 0; return; }
      const side = (i === 0 ? 1 : -1) * (v.spec.body === 'bike' ? 0 : v.spec.wid * 0.3);
      const fx = v.fx; const fz = v.fz;
      const x = v.pos.x + fx * v.halfLen + Math.cos(v.heading) * side;
      const z = v.pos.z + fz * v.halfLen - Math.sin(v.heading) * side;
      l.position.set(x, v.y + 0.75, z);
      l.target.position.set(x + fx * 20, 0, z + fz * 20);
      l.intensity = (night - 0.4) / 0.6 * (v.spec.body === 'bike' && i === 1 ? 0 : 170);
    });
  }

  /** Skip drawing cars and people the fog would hide anyway. */
  cullFar() {
    const c = this.camera.position;
    for (const v of this.vehicles) v.mesh.visible = Math.abs(v.pos.x - c.x) + Math.abs(v.pos.z - c.z) < 420;
    for (const n of this.npcs) {
      if (!n.inVehicle) n.human.root.visible = Math.abs(n.pos.x - c.x) + Math.abs(n.pos.z - c.z) < 200;
    }
  }

  separatePeople() {
    const p = this.player;
    const list = this.npcs;
    for (const n of list) {
      if (n.dead || n.inVehicle) continue;
      if (!p.vehicle && !p.dead) {
        const dx = n.pos.x - p.pos.x;
        const dz = n.pos.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.75 && d > 0.001) { n.pos.x = p.pos.x + (dx / d) * 0.75; n.pos.z = p.pos.z + (dz / d) * 0.75; }
      }
    }
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        if (Math.abs(dx) > 0.7 || Math.abs(dz) > 0.7) continue;
        const d = Math.hypot(dx, dz);
        if (d < 0.65 && d > 0.001) {
          const push = (0.65 - d) / 2;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
  }

  collectPickups(dt) {
    const p = this.player;
    if (p.dead) return;
    const at = this.where();
    const reach = p.vehicle ? 3.2 : 1.4;
    for (const k of this.pickups) {
      if (k.taken) continue;
      k.update(dt);
      if (Math.hypot(k.x - at.x, k.z - at.z) > reach) continue;
      k.remove();
      this.audio.ui(k.kind === 'cash' ? 'cash' : 'pickup');
      this.fx.spawn('cash', k.x, k.baseY, k.z, 8);
      if (k.kind === 'cash') {
        if (k.data.amount) { this.money += k.data.amount; this.hud.notify(`+$${k.data.amount}`); }
      } else if (k.kind === 'ammo') {
        const key = ['smg', 'shotgun', 'pistol'].find((w) => p.weapons[w].owned) || 'pistol';
        p.give(key, k.data.amount || 12);
        this.hud.notify(`Ammo +${k.data.amount || 12}`);
      } else if (k.kind === 'health') p.health = Math.min(100, p.health + 40);
      else if (k.kind === 'armor') p.armor = Math.min(100, p.armor + 50);
      else if (k.kind === 'shell') {
        this.missions.shellsFound.add(k.data.shell);
        this.money += 250;
        const n = this.missions.shellsFound.size;
        this.hud.notify(`Sun Shell found! ${n}/12   +$250`);
        if (n === 12) this.hud.bigText('ALL SUN SHELLS', 'The Breaker 12 is yours, free at every shop visit', 5, '#ffb3c7');
        if (n === 12) p.give('shotgun', 24);
      }
    }
    this.pickups = this.pickups.filter((k) => !k.taken || k.data.mission);
  }

  sounds() {
    const p = this.player;
    const v = p.vehicle;
    const a = this.audio;
    if (v && !v.dead) {
      const rpm = Math.min(1, Math.abs(v.forward) / v.spec.top);
      const gearRpm = (rpm * 4) % 1 * 0.5 + rpm * 0.6;
      a.engine(true, gearRpm, Math.abs(v.input.throttle));
      a.skid(v.skid > 0.4 && v.speed > 6 ? v.skid : 0);
    } else {
      a.engine(false, 0, 0);
      a.skid(0);
    }
    let siren = 0;
    const at = this.where();
    for (const o of this.vehicles) {
      if (!o.siren || o.dead) continue;
      const d = Math.hypot(o.pos.x - at.x, o.pos.z - at.z);
      siren = Math.max(siren, 1 / (1 + (d * d) / 2500));
    }
    a.siren(siren);
    const h = this.police.heli;
    a.rotor(h && !h.dead ? 1 / (1 + ((h.pos.x - at.x) ** 2 + (h.pos.z - at.z) ** 2 + h.pos.y ** 2) / 2500) : 0);
  }

  // ------------------------------------------------------------ saving
  serialize() {
    const p = this.player;
    const at = p.vehicle ? { x: p.vehicle.pos.x, z: p.vehicle.pos.z } : p.pos;
    return {
      v: 1,
      savedAt: Date.now(),
      money: this.money,
      hour: this.hour,
      station: this.station,
      player: { x: at.x, z: at.z, heading: p.heading, health: p.health, armor: p.armor, weapons: p.weapons, current: p.current },
      missions: this.missions.serialize(),
      stats: this.stats,
    };
  }

  save() {
    try {
      const data = this.serialize();
      data.player.weapons = JSON.parse(JSON.stringify(data.player.weapons, (k, val) => (val === Infinity ? 'inf' : val)));
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  autosave() {
    if (this.save()) this.hud.notify('Progress saved.');
  }

  static readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  load(data) {
    const p = this.player;
    this.money = data.money ?? 0;
    this.hour = data.hour ?? START_HOUR;
    this.station = data.station ?? 0;
    Object.assign(this.stats, data.stats || {});
    for (const [k, w] of Object.entries(data.player.weapons || {})) {
      if (!p.weapons[k]) continue;
      p.weapons[k].owned = !!w.owned;
      p.weapons[k].ammo = w.ammo === 'inf' ? Infinity : w.ammo;
      p.weapons[k].clip = w.clip === 'inf' ? Infinity : w.clip;
    }
    p.health = data.player.health || 100;
    p.armor = data.player.armor || 0;
    this.missions.restore(data.missions || {});
    // wake up at the safehouse door
    const s = this.city.places.safehouse;
    p.place(s.x, s.z + 1.5, s.face);
    this.rig.snap(s.face, 0.2);
    p.select(p.weapons[data.player.current]?.owned ? data.player.current : 'fist');
    this.populate();
  }

  render() {
    this.sky.updateEnvironment(this.renderer);
    if (this.post) this.post.render(this.scene, this.camera, this.time);
    else this.renderer.render(this.scene, this.camera);
  }
}

export { PIER };
