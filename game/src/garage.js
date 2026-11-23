// Torque & Tide Customs, Ines Okafor's workshop on the parking lot by Kai's apartment. Drive a
// car into the bay and press E: the car goes up on the turntable view and Ines can repair it,
// respray it, fit engine, brake and armour upgrades, underglow, window tint and new rims, and
// keep it as Kai's own car (it waits outside the apartment after loading a save, and the bay
// brings it back if it is ever wrecked). On foot, Ines hands out repo jobs: a car whose owner
// stopped paying, parked somewhere across the city, to be brought back before the clock runs
// out, paid by how much of it is left.
import { Marker, TargetArrow } from './markers.js';
import { Vehicle, MODELS, PAINTS, NEONS, RIMS, TINTS, defaultMods } from './vehicles.js';
import { GARAGE } from './config.js';
import { Npc } from './npc.js';
import { LOOKS } from './human.js';
import { dollars } from './rng.js';

const LEVELS = ['Stock', 'Street', 'Sport', 'Race'];
const REPO_MODELS = ['ardent', 'bayrunner', 'halden', 'corso', 'brisa', 'halcyon', 'ardent', 'bayrunner'];
const REPO_LINES = [
  'Owner skipped six payments and changed his number.',
  'A dentist in Verde Hills thinks she can outrun a finance company.',
  'Lent to a cousin, sold by the cousin. Bring it home.',
  'The dealer wants it back before the paint fades.',
];

export class Garage {
  constructor(world) {
    this.world = world;
    const g = world.city.places.garage;
    this.place = g;
    const s = g.shed;
    this.bayPos = { x: g.x + 4, z: s.z0 + 10.5 };
    this.bay = new Marker(world.scene, this.bayPos.x, this.bayPos.z, g.color, 3.0, world.city.groundHeight(this.bayPos.x, this.bayPos.z));
    this.ines = new Npc(world, 'contact', s.x0 + 13.5, s.z0 + 2.1, { look: LOOKS.ines, state: 'stand', invulnerable: true, persistent: true, heading: 0 });
    this.ines.weapon = null;
    this.ines.human.setWeapon(null);
    world.npcs.push(this.ines);
    this.personal = null;
    this.personalCar = null;
    this.repo = null;
    this.repos = 0;
    this.repoCool = 0;
  }

  // ------------------------------------------------------------ Kai's own car
  /** Park Kai's own car (as kept in the garage) at a spot, and remember it. */
  spawnPersonal(x, z, heading) {
    const w = this.world;
    if (!this.personal || !MODELS[this.personal.model]) return null;
    if (this.personalCar && !this.personalCar.dead) return this.personalCar;
    const v = new Vehicle(w.scene, this.personal.model, this.personal.color, x, z, heading);
    v.y = w.city.groundHeight(x, z);
    v.applyMods(this.personal.mods);
    v.kind = 'personal';
    w.vehicles.push(v);
    this.personalCar = v;
    return v;
  }

  /** Remember this car as Kai's own, mods and all. */
  keep(v) {
    this.personal = { model: v.key, color: v.color, mods: { ...v.mods } };
    if (this.personalCar && this.personalCar !== v && !this.personalCar.dead) this.personalCar.kind = 'abandoned';
    this.personalCar = v;
    v.kind = 'personal';
  }

  // ------------------------------------------------------------ repo jobs
  startRepo() {
    const w = this.world;
    const pt = w.missions.kerbPoint(260, 480);
    const model = w.rng.pick(REPO_MODELS);
    const color = w.rng.pick(MODELS[model].colors);
    const loop = w.city.loops.find((l) => Math.abs(l.x0 - pt.x) < 0.1 || Math.abs(l.x1 - pt.x) < 0.1);
    const out = loop && Math.abs(loop.x0 - pt.x) < 0.1 ? -1 : 1;
    // nose along the kerb, half a car out from the walkway
    const car = new Vehicle(w.scene, model, color, pt.x + out * 0.6, pt.z, w.rng.chance(0.5) ? 0 : Math.PI);
    car.y = w.city.groundHeight(car.pos.x, car.pos.z);
    car.kind = 'mission';
    car.mission = true;
    w.vehicles.push(car);
    const arrow = new TargetArrow(w.scene, '#ffa94d');
    const limit = Math.round(pt.d / 8 + 75);
    this.repo = { car, arrow, time: limit, limit, alarm: w.rng.chance(0.45), touched: false, dist: pt.d };
    w.hud.bigText('REPO JOB', `Ines: "${w.rng.pick(REPO_LINES)}"`, 3.5, '#ffa94d');
    w.hud.notify(`Find the ${car.spec.name} and bring it to Torque & Tide.`);
    w.audio.ui('select');
  }

  endRepo(ok, msg) {
    const w = this.world;
    const r = this.repo;
    if (!r) return;
    r.arrow.remove();
    if (!ok) {
      r.car.mission = null;
      r.car.kind = r.car === w.player.vehicle ? 'player' : 'abandoned';
      w.hud.bigText('REPO FAILED', msg, 3.5, '#ff5252');
      w.audio.ui('fail');
    }
    this.repo = null;
    this.repoCool = 3;
  }

  deliverRepo() {
    const w = this.world;
    const r = this.repo;
    const v = r.car;
    const pay = Math.round(GARAGE.repoBase + r.dist * 1.2 + (r.time / r.limit) * 400) * Math.max(0.2, v.health / 100);
    const total = Math.round(pay);
    w.player.exitVehicle();
    v.remove();
    w.vehicles.splice(w.vehicles.indexOf(v), 1);
    w.money += total;
    this.repos += 1;
    w.stats.repos = this.repos;
    this.endRepo(true);
    w.hud.bigText('REPO DONE', `${v.spec.name} back with the bank  +${dollars(total)}${v.health < 60 ? ' (minus the damage)' : ''}`, 4, '#ffa94d');
    w.audio.ui('pass');
  }

  updateRepo(dt) {
    const w = this.world;
    const r = this.repo;
    if (!r) return;
    const v = r.car;
    r.arrow.follow(dt, v.pos.x, v.y + v.spec.hgt + 1.6, v.pos.z);
    r.time -= dt;
    if (v.dead || v.health <= 0) { this.endRepo(false, 'The car is a write-off.'); return; }
    if (r.time <= 0) { this.endRepo(false, 'Out of time: the owner reported it stolen.'); return; }
    if (!r.touched && w.player.vehicle === v) {
      r.touched = true;
      if (r.alarm) {
        w.police.report('jack', v.pos.x, v.pos.z, true);
        w.audio.horn();
        w.hud.notify('The alarm went off! Lose the cops before the garage.');
      }
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt, input) {
    const w = this.world;
    const p = w.player;
    this.bay.update(dt);
    this.repoCool -= dt;
    this.updateRepo(dt);
    if (this.personalCar && this.personalCar.dead) {
      this.personalCar = null;
      w.hud.notify('Your car was wrecked. Ines can bring it back at Torque & Tide.');
    }
    if (w.ui || p.dead || w.interior) return;
    const v = p.vehicle;
    if (v) {
      if (v.spec.body === 'boat' || !this.bay.inside(v.pos.x, v.pos.z, 0.6)) return;
      if (this.repo && v === this.repo.car) {
        if (w.police.stars > 0) { w.hud.help('Ines will not take a hot car: lose the cops first.'); return; }
        if (v.speed < 4) this.deliverRepo();
        return;
      }
      if (w.police.stars > 0) { w.hud.help('Ines keeps the shutter down while the cops are on you.'); return; }
      if (v.kind === 'police' || v.mission) { w.hud.help('Ines will not touch this one.'); return; }
      w.hud.help('Press E to open Torque & Tide Customs');
      if (input.hit('KeyE') && v.speed < 4) { input.consume('KeyE'); w.openUi(new GaragePanel(this, v)); }
      return;
    }
    // on foot: Ines's repo board, and Kai's own car brought round
    if (Math.hypot(p.pos.x - this.ines.pos.x, p.pos.z - this.ines.pos.z) < 2.4) {
      if (this.repo) w.hud.help(`Ines: "The ${this.repo.car.spec.name} is not going to drive itself here."`);
      else if (w.missions.busy()) w.hud.help('Ines: "Finish what you are doing first."');
      else {
        w.hud.help(`Press E for a repo job from Ines (${this.repos} done)`);
        if (input.hit('KeyE') && this.repoCool <= 0) { input.consume('KeyE'); this.startRepo(); }
      }
    } else if (this.personal && !this.personalCar && this.bay.inside(p.pos.x, p.pos.z, 0.2)) {
      w.hud.help(`Press E to have Ines bring your ${MODELS[this.personal.model].name} round`);
      if (input.hit('KeyE')) {
        input.consume('KeyE');
        const g = this.place;
        this.spawnPersonal(this.bayPos.x - 8, this.bayPos.z + 2, 0);
        w.audio.ui('wrench');
        w.hud.notify('Ines: "Good as new. Try not to do that again."');
        void g;
      }
    }
  }

  blips() {
    const out = [{ x: this.bayPos.x, z: this.bayPos.z, color: this.place.color, kind: 'place', icon: 'wrench', title: 'Torque & Tide Customs', desc: 'Drive in for repairs, respray, upgrades and neon. Ines has repo jobs on foot.' }];
    if (this.repo) {
      const v = this.repo.car;
      out.push({ x: v.pos.x, z: v.pos.z, color: '#ffa94d', kind: 'target', edge: true, title: `Repo: ${v.spec.name}`, desc: 'Bring it to the Torque & Tide bay.' });
    }
    if (this.personalCar && !this.personalCar.dead && this.personalCar !== this.world.player.vehicle) {
      const v = this.personalCar;
      out.push({ x: v.pos.x, z: v.pos.z, color: '#7ff7e6', kind: 'place', minor: true, title: `Your ${v.spec.name}`, desc: 'Kai\'s own car.' });
    }
    return out;
  }

  objective() {
    if (!this.repo) return null;
    const v = this.repo.car;
    const inIt = this.world.player.vehicle === v;
    return { title: `Repo job · ${v.spec.name}`, text: inIt ? 'Drive it into the Torque & Tide bay.' : 'Find the car (orange arrow) and take it.' };
  }

  timer() { return this.repo ? this.repo.time : null; }

  serialize() { return { personal: this.personal, repos: this.repos }; }

  restore(data) {
    if (!data) return;
    this.personal = data.personal || null;
    this.repos = data.repos || 0;
  }
}

/**
 * The workshop screen. W / S picks a line, A / D picks an option (shown on the car at once),
 * Enter pays for it, E or Backspace drives out. Anything previewed but not paid for comes off.
 */
class GaragePanel {
  constructor(garage, v) {
    this.g = garage;
    this.w = garage.world;
    this.v = v;
    this.row = 0;
    this.fitted = { ...defaultMods(), ...v.mods };
    this.choice = {
      color: Math.max(0, PAINTS.findIndex(([, c]) => c === v.color)),
      engine: this.fitted.engine,
      brakes: this.fitted.brakes,
      armor: this.fitted.armor,
      neon: Math.max(0, NEONS.findIndex(([, c]) => c === this.fitted.neon)),
      tint: this.fitted.tint,
      rims: Math.max(0, RIMS.findIndex(([, c]) => c === this.fitted.rims)),
    };
    const rig = this.w.rig;
    rig.orbitYaw = v.heading + Math.PI * 0.75;
    rig.orbitPitch = 0.28;
    rig.override = (dt, input, r) => r.orbit(dt, input, v.pos.x, v.y, v.pos.z, 7.5 + v.spec.len * 0.5, 1.6, 0.2, 2.6);
    garage.bay.group.visible = false;
    this.w.audio.ui('wrench');
    this.w.hud.popup('TORQUE & TIDE', this.g.place.color);
  }

  lines() {
    const v = this.v;
    const c = this.choice;
    const f = this.fitted;
    const bike = v.spec.body === 'bike';
    const damage = Math.round(100 - v.health);
    const lvl = (key, prices) => ({
      key, label: { engine: 'Engine', brakes: 'Brakes & tyres', armor: 'Armour plating' }[key],
      value: LEVELS[c[key]],
      price: c[key] > f[key] ? prices[c[key]] : 0,
      state: c[key] === f[key] ? 'FITTED' : c[key] < f[key] ? 'REFIT' : null,
      options: 4,
    });
    const list = [
      { key: 'repair', label: 'Repair', value: damage > 0 ? `${damage}% damage` : 'No damage', price: damage > 0 ? damage * GARAGE.repairPerPoint : 0, state: damage > 0 ? null : 'OK' },
      { key: 'color', label: 'Respray', value: PAINTS[c.color][0], price: PAINTS[c.color][1] === v.color ? 0 : GARAGE.respray, state: PAINTS[c.color][1] === v.color ? 'CURRENT' : null, options: PAINTS.length, swatch: PAINTS[c.color][1] },
      lvl('engine', GARAGE.engine),
      lvl('brakes', GARAGE.brakes),
      lvl('armor', GARAGE.armor),
    ];
    if (!bike) {
      list.push(
        { key: 'neon', label: 'Underglow', value: NEONS[c.neon][0], price: NEONS[c.neon][1] === f.neon ? 0 : NEONS[c.neon][1] ? GARAGE.neon : 0, state: NEONS[c.neon][1] === f.neon ? 'FITTED' : null, options: NEONS.length, swatch: NEONS[c.neon][1] },
        { key: 'tint', label: 'Window tint', value: TINTS[c.tint], price: c.tint === f.tint ? 0 : c.tint ? GARAGE.tint : 0, state: c.tint === f.tint ? 'FITTED' : null, options: TINTS.length },
        { key: 'rims', label: 'Rims', value: RIMS[c.rims][0], price: RIMS[c.rims][1] === f.rims ? 0 : GARAGE.rims, state: RIMS[c.rims][1] === f.rims ? 'FITTED' : null, options: RIMS.length, swatch: RIMS[c.rims][1] || '#e4e8ee' },
      );
    }
    const mine = this.g.personalCar === v;
    list.push({ key: 'keep', label: mine ? 'Your car' : 'Keep as your car', value: mine ? 'Saved with every mod' : 'Free', price: 0, state: mine ? 'YOURS' : null });
    list.push({ key: 'leave', label: 'Drive out', value: '', price: 0, state: null });
    return list;
  }

  /** Put the chosen (not yet paid for) options on the car so they can be seen. */
  preview() {
    const c = this.choice;
    this.v.applyMods({
      ...this.fitted,
      engine: this.fitted.engine, brakes: this.fitted.brakes, armor: this.fitted.armor,
      color: PAINTS[c.color][1],
      neon: NEONS[c.neon][1],
      tint: c.tint,
      rims: RIMS[c.rims][1],
    });
  }

  update(dt, input) {
    const w = this.w;
    const v = this.v;
    // the car sits on the turntable with the handbrake on
    v.vel.x *= 0.8;
    v.vel.z *= 0.8;
    v.input.throttle = 0;
    v.input.steer = 0;
    v.input.handbrake = true;
    const lines = this.lines();
    if (input.hitAny('KeyW', 'ArrowUp')) { this.row = (this.row - 1 + lines.length) % lines.length; w.audio.ui('move'); }
    if (input.hitAny('KeyS', 'ArrowDown')) { this.row = (this.row + 1) % lines.length; w.audio.ui('move'); }
    const line = lines[Math.min(this.row, lines.length - 1)];
    if (line.options && input.hitAny('KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight')) {
      const step = input.hitAny('KeyA', 'ArrowLeft') ? -1 : 1;
      this.choice[line.key] = (this.choice[line.key] + step + line.options) % line.options;
      this.preview();
      w.audio.ui('move');
    }
    if (input.hitAny('Enter', 'Space')) this.buy(line);
    if (input.hitAny('KeyE', 'Backspace')) { input.consume('KeyE'); this.close(); return; }
    this.draw(lines);
  }

  buy(line) {
    const w = this.w;
    const v = this.v;
    if (line.key === 'leave') { this.close(); return; }
    if (line.key === 'keep') {
      if (this.g.personalCar === v) return;
      this.g.keep(v);
      w.audio.ui('select');
      w.hud.notify(`The ${v.spec.name} is yours now: it will wait outside your apartment.`);
      return;
    }
    if (line.state && line.state !== 'REFIT') return;
    if (line.price > w.money) { w.hud.notify('Not enough cash.'); w.audio.ui('fail'); return; }
    w.money -= line.price;
    const c = this.choice;
    const f = this.fitted;
    if (line.key === 'repair') {
      v.repair();
      w.audio.ui('wrench');
      w.fx.spawn('spark', v.pos.x, v.y + 0.8, v.pos.z, 14);
    } else if (line.key === 'color') {
      f.color = PAINTS[c.color][1];
      w.audio.ui('spray');
      w.fx.spawn('spray', v.pos.x, v.y + 1, v.pos.z, 26, null, f.color);
    } else if (line.key === 'neon') {
      f.neon = NEONS[c.neon][1];
      w.audio.ui('wrench');
    } else if (line.key === 'rims') {
      f.rims = RIMS[c.rims][1];
      w.audio.ui('wrench');
    } else if (line.key === 'tint') {
      f.tint = c.tint;
      w.audio.ui('spray');
    } else {
      f[line.key] = c[line.key];
      w.audio.ui('wrench');
      w.fx.spawn('spark', v.pos.x + v.fx * v.halfLen, v.y + 0.6, v.pos.z + v.fz * v.halfLen, 10);
    }
    v.applyMods({ ...f });
    this.preview();
    if (this.g.personalCar === v) this.g.keep(v);
    if (line.price) w.hud.notify(`${line.label}: ${line.value}  -${dollars(line.price)}`);
    w.stats.mods = (w.stats.mods || 0) + 1;
  }

  close() {
    const w = this.w;
    this.v.applyMods({ ...this.fitted });
    if (this.g.personalCar === this.v) this.g.keep(this.v);
    this.v.input.handbrake = false;
    this.g.bay.group.visible = true;
    w.rig.endOrbit();
    w.rig.snap(this.v.heading + Math.PI, 0.2);
    w.ui = null;
    w.audio.ui('move');
  }

  draw(lines) {
    const w = this.w;
    const v = this.v;
    const t = v.tune;
    w.hud.panel({
      title: 'TORQUE & TIDE CUSTOMS',
      color: this.g.place.color,
      subtitle: `${v.spec.name} · ${Math.round(v.spec.top * t.top * 3.6)} km/h top · grip ${Math.round(t.grip * 100)}% · armour ${Math.round((v.armor || 0) * 100)}%`,
      rows: lines.map((l, i) => ({
        label: l.label,
        value: l.options ? `‹ ${l.value} ›` : l.value,
        right: l.state || (l.price ? dollars(l.price) : l.key === 'leave' || l.key === 'keep' ? '' : 'FREE'),
        sel: i === this.row,
        dim: l.price > w.money,
        good: l.state === 'FITTED' || l.state === 'YOURS' || l.state === 'CURRENT' || l.state === 'OK',
        swatch: l.swatch,
      })),
      foot: 'W / S: choose · A / D: option · Enter: buy · E: drive out · drag the mouse to look around',
    });
  }
}
