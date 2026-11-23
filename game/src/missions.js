// Runs the story and the side activities. Story missions start from a contact's marker, step
// through the definitions in story.js with a small helper API (markers, dialogue, spawning gangs
// and cars, counters), and pay out or fail. Beside them: courier runs from Bayline Couriers, the
// Coastline Arms counter, saving at Kai's apartment, and twelve Sun Shells hidden in the city.
import { MISSIONS, CAST } from './story.js';
import { Marker, TargetArrow, Pickup } from './markers.js';
import { Npc } from './npc.js';
import { Vehicle, MODELS } from './vehicles.js';
import { LaneDriver } from './traffic.js';
import { LOOKS } from './human.js';
import { WEAPONS } from './combat.js';
import { makeRng } from './rng.js';

export const SHOP = [
  { key: '1', label: 'Kestrel 9 pistol ammo (+24)', price: 60, buy: (p) => p.give('pistol', 24) },
  { key: '2', label: 'Viper SMG / ammo (+64)', price: 0, smg: true },
  { key: '3', label: 'Breaker 12 shotgun / shells (+12)', price: 0, shotgun: true },
  { key: '4', label: 'Body armour', price: 500, buy: (p) => { p.armor = 100; } },
  { key: '5', label: 'Med kit', price: 150, buy: (p) => { p.health = 100; } },
];

export class Missions {
  constructor(world) {
    this.world = world;
    this.completed = new Set();
    this.active = null;
    this.contactMarker = null;
    this.contactKey = null;
    this.contacts = {};
    this.lines = [];
    this.lineT = 0;
    this.side = null;
    this.cooldown = 0;
    this.shells = [];
    this.shellsFound = new Set();
    this.counter = null;
    this.timer = null;
    this.fixed = [];
    this.setupWorld();
  }

  // ------------------------------------------------------------ static places
  setupWorld() {
    const w = this.world;
    const pl = w.city.places;
    // the two contacts wait at their places
    for (const [key, look] of [['nadia', LOOKS.nadia], ['pearl', LOOKS.pearl]]) {
      const p = pl[key];
      const back = key === 'nadia' ? 3.4 : 3.2;
      const n = new Npc(w, 'contact', p.x - Math.sin(p.face) * back + (key === 'nadia' ? 3 : 0), p.z - Math.cos(p.face) * back, { look, state: 'stand', invulnerable: true, persistent: true, heading: p.face });
      n.weapon = null;
      n.human.setWeapon(null);
      w.npcs.push(n);
      this.contacts[key] = n;
    }
    // Nadia's food truck on the sand
    const truck = new Vehicle(w.scene, 'pelican', '#ff9f1c', pl.nadia.x, pl.nadia.z - 6.5, Math.PI / 2);
    truck.locked = true;
    truck.kind = 'prop';
    truck.mission = true;
    w.vehicles.push(truck);
    this.truck = truck;
    // fixed activity markers
    this.fixed = [
      { key: 'safehouse', marker: new Marker(w.scene, pl.safehouse.x, pl.safehouse.z, pl.safehouse.color, 1.6, 0.18) },
      { key: 'gunshop', marker: new Marker(w.scene, pl.gunshop.x, pl.gunshop.z, pl.gunshop.color, 1.6, 0.18) },
      { key: 'courier', marker: new Marker(w.scene, pl.courier.x, pl.courier.z, pl.courier.color, 1.6, 0.18) },
    ];
    // Sun Shells: twelve collectibles on sidewalks, the beach, the pier and in the parks
    const rng = makeRng(4242);
    const spots = [
      { x: pl.pierEnd.x - 2, z: pl.pierEnd.z + 2 },
      { x: pl.tower.x + 9, z: pl.tower.z + 9 },
    ];
    while (spots.length < 12) {
      const loop = rng.pick(w.city.loops);
      const t = rng.next();
      const x = loop.x0 + (loop.x1 - loop.x0) * t;
      const z = rng.chance(0.5) ? loop.z0 : loop.z1;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 120)) continue;
      spots.push({ x, z });
    }
    spots.forEach((s, i) => {
      const y = w.city.groundHeight(s.x, s.z);
      const p = new Pickup(w.scene, 'shell', s.x, s.z, y, { shell: i });
      this.shells.push(p);
      w.pickups.push(p);
    });
  }

  next() { return MISSIONS.find((m) => !this.completed.has(m.id)) || null; }

  // ------------------------------------------------------------ helper API for story steps
  makeCtx(def) {
    const w = this.world;
    const self = this;
    const ctx = {
      world: w,
      def,
      data: {},
      markers: [],
      arrows: [],
      spawned: [],
      cars: [],
      pickups: [],
      get px() { return w.player.where().x; },
      get pz() { return w.player.where().z; },
      place: (k) => w.city.places[k],
      marker(x, z, color = '#ffd23f', r = 2.4) {
        const m = new Marker(w.scene, x, z, color, r, w.city.groundHeight(x, z));
        ctx.markers.push(m);
        return m;
      },
      markAt(k) {
        const p = w.city.places[k];
        return ctx.marker(p.x, p.z, p.color || '#ffd23f', 2.4);
      },
      say: (lines) => self.say(lines),
      talkDone: () => self.lines.length === 0,
      near: (x, z, r) => Math.hypot(ctx.px - x, ctx.pz - z) < r,
      distTo: (p) => Math.hypot(ctx.px - p.x, ctx.pz - p.z),
      spawnGang(x, z, n, spread) {
        const list = [];
        for (let k = 0; k < n; k += 1) {
          const a = (k / n) * Math.PI * 2 + w.rng.next() * 0.5;
          const r = spread * (0.5 + w.rng.next() * 0.5);
          const g = new Npc(w, 'saint', x + Math.cos(a) * r, z + Math.sin(a) * r, { state: 'guard', mission: def.id, alertRange: 32 });
          g.heading = Math.atan2(Math.cos(a), Math.sin(a));
          w.npcs.push(g);
          ctx.spawned.push(g);
          list.push(g);
        }
        return list;
      },
      spawnBoss(x, z) {
        const b = new Npc(w, 'saint', x, z, { look: LOOKS.calder, state: 'guard', mission: def.id, health: 260, weapon: 'smg', accuracy: 1.1 });
        b.boss = true;
        w.npcs.push(b);
        ctx.spawned.push(b);
        return b;
      },
      spawnCar(model, x, z, heading, opts = {}) {
        const v = new Vehicle(w.scene, model, MODELS[model].colors[0], x, z, heading);
        v.y = w.city.groundHeight(x, z);
        v.mission = true;
        v.kind = 'mission';
        v.locked = !!opts.locked;
        w.vehicles.push(v);
        ctx.cars.push(v);
        return v;
      },
      spawnFleeing(model, dist) {
        // try road segments around the wanted distance, nearest to it first, until one is free
        const c = w.player.where();
        const nodes = w.city.nodes
          .map((n, i) => ({ i, n, off: Math.abs(Math.hypot(n.x - c.x, n.z - c.z) - dist) }))
          .sort((p, q) => p.off - q.off);
        let v = null;
        for (const { i, n } of nodes) {
          for (const b of n.links) {
            v = w.traffic.spawnCar({ a: i, b, t: 0.4 }, model, 'flee');
            if (v) break;
          }
          if (v) break;
        }
        v.mission = true;
        v.kind = 'mission';
        v.ai.cruise = 22;
        ctx.cars.push(v);
        return v;
      },
      pickup(kind, x, z) {
        const p = new Pickup(w.scene, kind, x, z, w.city.groundHeight(x, z), { amount: 0, mission: true });
        w.pickups.push(p);
        ctx.pickups.push(p);
        return p;
      },
      arrowOn(entity, color) {
        const a = new TargetArrow(w.scene, color);
        a.entity = entity;
        ctx.arrows.push(a);
      },
      clearArrows() {
        for (const a of ctx.arrows) a.remove();
        ctx.arrows.length = 0;
      },
      countDead(list, label) {
        const dead = list.filter((n) => n.dead).length;
        self.counter = `${label}: ${dead}/${list.length}`;
        return dead === list.length;
      },
      fail(reason) { self.fail(reason); return false; },
    };
    return ctx;
  }

  // ------------------------------------------------------------ dialogue
  say(lines) {
    for (const [who, text] of lines) this.lines.push({ who: CAST[who] || { name: who, color: '#fff' }, text, t: 1.4 + text.length * 0.055 });
    this.lineT = 0;
  }

  // ------------------------------------------------------------ running
  start(def) {
    const w = this.world;
    this.clearContact();
    this.active = { def, step: -1, ctx: this.makeCtx(def) };
    this.counter = null;
    w.hud.bigText(def.title.toUpperCase(), 'MISSION', 3);
    w.audio.ui('select');
    this.say(def.intro);
    this.advance();
  }

  advance() {
    const a = this.active;
    a.step += 1;
    this.counter = null;
    if (a.step >= a.def.steps.length) { this.pass(); return; }
    const step = a.def.steps[a.step];
    if (step.enter) step.enter(a.ctx);
  }

  cleanup(keepCars = false) {
    const w = this.world;
    const a = this.active;
    if (!a) return;
    const c = a.ctx;
    for (const m of c.markers) m.remove();
    c.clearArrows();
    for (const p of c.pickups) if (!p.taken) { p.remove(); }
    w.pickups = w.pickups.filter((p) => !p.taken);
    for (const n of c.spawned) n.mission = null;
    for (const v of c.cars) {
      if (v === w.player.vehicle || keepCars) { v.mission = null; if (v.kind === 'mission') v.kind = v === w.player.vehicle ? 'player' : 'abandoned'; continue; }
      v.mission = null;
      v.kind = 'abandoned';
    }
    this.active = null;
    this.counter = null;
    this.timer = null;
  }

  pass() {
    const w = this.world;
    const def = this.active.def;
    this.completed.add(def.id);
    w.money += def.reward;
    this.cleanup(true);
    w.hud.bigText('MISSION PASSED', `${def.title}  +$${def.reward.toLocaleString()}`, 4.5, '#ffd23f');
    w.audio.ui('pass');
    w.stats.missions = this.completed.size;
    if (!this.next()) {
      setTimeout(() => w.hud.bigText('SOLMARA BAY IS YOURS', 'The story is complete. Free roam, courier runs and Sun Shells await.', 7, '#ff5fa2'), 5000);
    }
    w.autosave();
    this.cooldown = 3;
  }

  fail(reason) {
    const w = this.world;
    if (!this.active) return;
    const title = this.active.def.title;
    this.cleanup();
    this.lines = [];
    w.hud.bigText('MISSION FAILED', reason || title, 4, '#ff5252');
    w.audio.ui('fail');
    this.cooldown = 4;
  }

  /** Called when the player is wasted or busted. */
  onPlayerDown() {
    if (this.active) this.fail('You can retry from the contact.');
    if (this.side && this.side.kind === 'taxi') this.dropPassenger(null);
    if (this.side) this.endSide(false, this.side.kind === 'taxi' ? 'Taxi shift over.' : 'Courier run failed.');
  }

  clearContact() {
    if (this.contactMarker) this.contactMarker.remove();
    this.contactMarker = null;
    this.contactKey = null;
    this.armed = true;
  }

  // ------------------------------------------------------------ side activities
  startCourier() {
    const w = this.world;
    this.side = { kind: 'courier', run: 0, marker: null, time: 0, total: 0 };
    w.hud.bigText('COURIER RUN', 'Bayline Couriers: deliver three parcels against the clock', 3, '#4fc3f7');
    this.nextDelivery();
  }

  nextDelivery() {
    const w = this.world;
    const s = this.side;
    if (s.marker) s.marker.remove();
    if (s.run >= 3) {
      w.money += 600;
      w.hud.bigText('RUN COMPLETE', `Bonus +$600   Total $${(s.total + 600).toLocaleString()}`, 4, '#4fc3f7');
      w.audio.ui('pass');
      this.side = null;
      w.stats.deliveries += 3;
      return;
    }
    const c = w.player.where();
    let loop;
    let x; let z;
    for (let k = 0; k < 40; k += 1) {
      loop = w.rng.pick(w.city.loops);
      x = (loop.x0 + loop.x1) / 2;
      z = w.rng.chance(0.5) ? loop.z0 : loop.z1;
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > 180 && d < 520) break;
    }
    const d = Math.hypot(x - c.x, z - c.z);
    s.marker = new Marker(w.scene, x, z, '#4fc3f7', 2.6, w.city.groundHeight(x, z));
    s.time = Math.round(d / 11 + 22);
    s.pay = Math.round(150 + d * 0.9);
    s.run += 1;
    w.hud.notify(`Parcel ${s.run}/3: deliver it to the blue marker.`);
  }

  // ------------------------------------------------------------ taxi fares (in any Marlin Cab)
  startTaxi() {
    this.side = { kind: 'taxi', stage: 'pickup', marker: null, time: 0, fares: 0, earned: 0, wait: 0, justStarted: true };
    this.world.hud.bigText('TAXI', 'Pick up fares in your Marlin Cab. Press T to clock off.', 3, '#ffd23f');
    this.nextFare();
  }

  /** A point on a sidewalk between lo and hi metres from the player. */
  kerbPoint(lo, hi) {
    const w = this.world;
    const c = w.player.where();
    let best = null;
    for (let k = 0; k < 60; k += 1) {
      const loop = w.rng.pick(w.city.loops);
      const x = w.rng.chance(0.5) ? loop.x0 : loop.x1;
      const z = w.rng.range(loop.z0 + 6, loop.z1 - 6);
      const d = Math.hypot(x - c.x, z - c.z);
      best = { x, z, d };
      if (d > lo && d < hi) break;
    }
    return best;
  }

  /** Let a passenger step out beside the cab and go about their day. */
  dropPassenger(v) {
    const n = this.side && this.side.fareNpc;
    if (!n) return;
    n.inVehicle = null;
    n.persistent = false;
    if (v) {
      n.pos.x = v.pos.x + Math.cos(v.heading) * 2;
      n.pos.z = v.pos.z - Math.sin(v.heading) * 2;
    }
    n.state = 'idle';
    n.timer = 1.5;
    n.loop = null;
    n.sync();
    this.side.fareNpc = null;
  }

  nextFare() {
    const w = this.world;
    const s = this.side;
    if (s.marker) s.marker.remove();
    const pt = this.kerbPoint(70, 220);
    s.stage = 'pickup';
    s.marker = new Marker(w.scene, pt.x, pt.z, '#ffd23f', 3, w.city.groundHeight(pt.x, pt.z));
    s.fareNpc = new Npc(w, 'civ', pt.x, pt.z, { state: 'stand', persistent: true });
    w.npcs.push(s.fareNpc);
    s.time = Math.round(pt.d / 9 + 30);
    w.hud.notify('A fare is waiting at the yellow marker.');
  }

  updateTaxi(dt, input, at) {
    const w = this.world;
    const s = this.side;
    const v = w.player.vehicle;
    // the key press that started the shift must not also end it
    const quit = input.hit('KeyT') && !s.justStarted;
    s.justStarted = false;
    if (!v || !v.spec.taxi || quit) {
      const msg = `Shift over: ${s.fares} fares, $${s.earned}.`;
      this.dropPassenger(v);
      this.endSide(true, msg);
      w.hud.notify(msg);
      this.timer = null;
      return;
    }
    s.marker.update(dt);
    s.time -= dt;
    this.timer = s.time;
    if (s.time <= 0) {
      w.hud.notify(s.stage === 'drop' ? 'Too slow: the passenger got out without paying.' : 'The fare found another cab.');
      this.dropPassenger(v);
      this.nextFare();
      return;
    }
    const stopped = v.speed < 2.5 && s.marker.inside(at.x, at.z, 1.5);
    if (s.stage === 'pickup' && stopped) {
      s.wait += dt;
      if (s.wait > 0.8) {
        s.wait = 0;
        s.fareNpc.inVehicle = v;
        s.fareNpc.sync();
        s.marker.remove();
        const pt = this.kerbPoint(180, 480);
        s.marker = new Marker(w.scene, pt.x, pt.z, '#ffd23f', 3, w.city.groundHeight(pt.x, pt.z));
        s.stage = 'drop';
        s.dist = pt.d;
        s.time = Math.round(pt.d / 10 + 25);
        s.limit = s.time;
        w.audio.ui('select');
        w.hud.notify(`"${w.rng.pick(['To the beach, and step on it!', 'Corvel Heights, please.', 'Follow the coast, I am late!', 'Just drive, I will tell you where.'])}"`);
      }
    } else if (s.stage === 'drop' && stopped) {
      const pay = Math.round(60 + s.dist * 0.55 + Math.max(0, s.time / s.limit) * 120);
      w.money += pay;
      s.fares += 1;
      s.earned += pay;
      w.audio.ui('cash');
      w.hud.notify(`Fare paid: $${pay}${s.time / s.limit > 0.4 ? ' (with a tip)' : ''}`);
      this.dropPassenger(v);
      w.stats.deliveries += 1;
      this.nextFare();
    }
  }

  endSide(ok, msg) {
    const w = this.world;
    if (!this.side) return;
    if (this.side.marker) this.side.marker.remove();
    this.side = null;
    if (!ok) { w.hud.bigText('RUN FAILED', msg, 3.5, '#ff5252'); w.audio.ui('fail'); }
  }

  buy(item) {
    const w = this.world;
    const p = w.player;
    let price = item.price;
    let action = item.buy;
    if (item.smg || item.shotgun) {
      const key = item.smg ? 'smg' : 'shotgun';
      const spec = WEAPONS[key];
      price = p.weapons[key].owned ? spec.ammoPrice : spec.price;
      action = (pl) => pl.give(key, spec.ammoPack);
    }
    if (w.money < price) { w.hud.notify('Not enough cash.'); w.audio.ui('fail'); return; }
    w.money -= price;
    action(p);
    w.audio.ui('cash');
    w.hud.notify(`Bought: ${item.label}`);
  }

  // ------------------------------------------------------------ per-frame
  update(dt, input) {
    const w = this.world;
    const p = w.player;
    const at = p.where();
    this.cooldown -= dt;

    // dialogue queue
    if (this.lines.length) {
      this.lineT += dt;
      if (this.lineT > this.lines[0].t || input.hit('Backspace')) { this.lines.shift(); this.lineT = 0; }
    }

    for (const f of this.fixed) f.marker.update(dt);
    for (const s of this.shells) if (!s.taken) s.update(dt);

    if (this.active) {
      const a = this.active;
      const c = a.ctx;
      for (const m of c.markers) m.update(dt);
      for (const ar of c.arrows) {
        const e = ar.entity;
        if (e.dead && !e.spec) { ar.mesh.visible = false; continue; }
        ar.follow(dt, e.pos.x, (e.y || 0) + (e.spec ? e.spec.hgt + 1.6 : 2.6), e.pos.z);
      }
      const step = a.def.steps[a.step];
      if (step && step.update(c, dt) === true && this.active === a) this.advance();
    } else if (!p.dead && this.cooldown <= 0) {
      // offer the next story mission at its giver
      const next = this.next();
      if (next && this.contactKey !== next.giver) {
        this.clearContact();
        const pl = w.city.places[next.giver];
        this.contactMarker = new Marker(w.scene, pl.x, pl.z, pl.color, 2.2, w.city.groundHeight(pl.x, pl.z));
        this.contactKey = next.giver;
        // standing in it already (the last mission ended here): step out and back in to start
        this.armed = !this.contactMarker.inside(at.x, at.z, 2);
      }
      if (this.contactMarker) {
        this.contactMarker.update(dt);
        const slow = !p.vehicle || p.vehicle.speed < 3;
        const inside = this.contactMarker.inside(at.x, at.z, 0.5);
        if (!inside && !this.contactMarker.inside(at.x, at.z, 2)) this.armed = true;
        if (!this.armed && inside) w.hud.help('Step out of the marker and back in to start the next mission.');
        else if (slow && inside && !this.side && w.police.stars === 0) this.start(next);
        else if (slow && this.contactMarker.inside(at.x, at.z, 0.5) && w.police.stars > 0) w.hud.help('Lose the cops before starting a mission.');
      }
    }

    // fixed places: save, shop, courier
    if (!p.vehicle && !p.dead) {
      for (const f of this.fixed) {
        if (!f.marker.inside(at.x, at.z, 0.3)) continue;
        if (f.key === 'safehouse') {
          w.hud.help('Press E to save your game.');
          if (input.hit('KeyE')) { w.save(); w.hud.notify('Game saved.'); w.audio.ui('select'); }
        } else if (f.key === 'gunshop') {
          w.hud.shop(SHOP.map((s) => {
            let price = s.price;
            let label = s.label;
            if (s.smg || s.shotgun) {
              const key = s.smg ? 'smg' : 'shotgun';
              price = p.weapons[key].owned ? WEAPONS[key].ammoPrice : WEAPONS[key].price;
              label = p.weapons[key].owned ? `${WEAPONS[key].name} ammo (+${WEAPONS[key].ammoPack})` : `${WEAPONS[key].name}`;
            }
            return { key: s.key, label, price };
          }));
          for (const s of SHOP) if (input.hit(`Digit${s.key}`)) this.buy(s);
        } else if (f.key === 'courier' && !this.active && !this.side) {
          w.hud.help('Press E to start a courier run.');
          if (input.hit('KeyE')) this.startCourier();
        }
      }
    }

    // in a cab with nothing else going on: offer taxi work
    if (!this.side && !this.active && p.vehicle && p.vehicle.spec.taxi && !p.dead) {
      w.hud.help('Press T to start taking taxi fares.');
      if (input.hit('KeyT')) this.startTaxi();
    }

    if (this.side && this.side.kind === 'taxi') {
      this.updateTaxi(dt, input, at);
    } else if (this.side) {
      const s = this.side;
      s.marker.update(dt);
      s.time -= dt;
      this.timer = s.time;
      if (s.time <= 0) { this.endSide(false, 'Out of time.'); this.timer = null; }
      else if (s.marker.inside(at.x, at.z, 1.5)) {
        w.money += s.pay;
        s.total += s.pay;
        w.audio.ui('cash');
        w.hud.notify(`Delivered! +$${s.pay}`);
        this.nextDelivery();
        if (!this.side) this.timer = null;
      }
    } else if (!this.active) this.timer = null;
  }

  /** Every marker the minimap should show. */
  blips() {
    const out = [];
    const pl = this.world.city.places;
    for (const f of this.fixed) out.push({ x: f.marker.x, z: f.marker.z, color: pl[f.key].color, label: pl[f.key].blip, kind: 'place' });
    if (this.contactMarker) out.push({ x: this.contactMarker.x, z: this.contactMarker.z, color: this.contactMarker.color, label: this.contactKey === 'nadia' ? 'N' : 'P', kind: 'contact', edge: true });
    if (this.active) {
      const c = this.active.ctx;
      for (const m of c.markers) out.push({ x: m.x, z: m.z, color: '#ffd23f', kind: 'objective', edge: true });
      for (const n of c.spawned) if (!n.dead) out.push({ x: n.pos.x, z: n.pos.z, color: '#ff4d4d', kind: 'enemy' });
      for (const a of c.arrows) if (!a.entity.dead || a.entity.spec) out.push({ x: a.entity.pos.x, z: a.entity.pos.z, color: '#ff4d4d', kind: 'target', edge: true });
      for (const p of c.pickups) if (!p.taken) out.push({ x: p.x, z: p.z, color: '#6dff8a', kind: 'objective', edge: true });
    }
    if (this.side && this.side.marker) out.push({ x: this.side.marker.x, z: this.side.marker.z, color: this.side.kind === 'taxi' ? '#ffd23f' : '#4fc3f7', kind: 'objective', edge: true });
    return out;
  }

  objective() {
    if (this.active) {
      const step = this.active.def.steps[this.active.step];
      return { title: this.active.def.title, text: this.counter || (step ? step.text : '') };
    }
    if (this.side && this.side.kind === 'taxi') {
      return { title: `Taxi  ·  ${this.side.fares} fares  ·  $${this.side.earned}`, text: this.side.stage === 'pickup' ? 'Pick up the passenger at the yellow marker.' : 'Drive the passenger to the yellow marker.' };
    }
    if (this.side) return { title: 'Courier Run', text: `Deliver parcel ${this.side.run}/3 to the blue marker.` };
    const next = this.next();
    if (next) {
      const who = next.giver === 'nadia' ? 'Nadia at the Sol y Sal truck' : 'Pearl at Spin City Laundry';
      return { title: 'Story', text: `Meet ${who} (${next.giver === 'nadia' ? 'N' : 'P'} on the map).` };
    }
    return null;
  }

  // ------------------------------------------------------------ saving
  serialize() {
    return { completed: [...this.completed], shells: [...this.shellsFound] };
  }

  restore(data) {
    this.completed = new Set(data.completed || []);
    this.shellsFound = new Set(data.shells || []);
    for (const s of this.shells) {
      if (this.shellsFound.has(s.data.shell)) s.remove();
    }
    this.world.pickups = this.world.pickups.filter((p) => !p.taken);
    this.clearContact();
  }
}

export { LaneDriver };
