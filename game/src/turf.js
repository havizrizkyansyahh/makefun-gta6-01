// Gang turf: who runs each of Solmara Bay's six districts, and the wars that change it.
//
// Four street crews hold the city when the story starts: the Saltline Vipers on the Harbor Flats
// docks, the Neon Coyotes in Little Marisco, the Hillside Rooks up in Verde Hills, and the Glass
// Saints across Midtown and Corvel Heights. Palmline Beach, where Nadia parks her truck, is the
// only street Kai's own people (the Sol y Sal crew) can call theirs.
//
// Every rival district has a corner crew hanging out on one of its blocks. Kill one of them on
// their own streets and the district goes to war: three waves of that gang come running from
// the side streets, each bigger than the last, and the turf is Kai's if he is still standing
// when the last one drops. Run more than a block and a half from the fight and the war is lost.
// Taken districts pay a cut every morning at eight, show in Kai's colours on the city map, and
// get his own crew on the corner instead. Now and then a rival tries to win a district back:
// Kai has a few minutes to get there and hold the corner through two waves, or it flips.
import { Npc } from './npc.js';
import { Vehicle } from './vehicles.js';
import { Marker } from './markers.js';
import { DISTRICTS } from './city.js';
import { dollars } from './rng.js';

/** The crews. Looks are full Human looks; `car` is what their members drive to a fight. */
export const GANGS = {
  sol: {
    name: 'Sol y Sal crew', short: 'SOL Y SAL', color: '#ffb000',
    look: { skin: '#a26a45', shirt: '#ffb000', pants: '#2e3142', hair: '#141210', shoes: '#f4f4f4', cap: '#2a9d8f', belt: '#1a1a1a' },
    car: 'bayrunner', paint: '#ffb000',
  },
  vipers: {
    name: 'Saltline Vipers', short: 'VIPERS', color: '#36c98e',
    look: { skin: '#c68b62', shirt: '#1e6b4f', pants: '#2b2d42', hair: '#1b1712', shoes: '#36c98e', beanie: '#36c98e', sleeves: 'long', belt: '#111111' },
    car: 'halden', paint: '#1e6b4f', weapons: ['pistol', 'pistol', 'shotgun'],
  },
  coyotes: {
    name: 'Neon Coyotes', short: 'COYOTES', color: '#ff4fd8',
    look: { skin: '#e0ac85', shirt: '#ff4fd8', pants: '#1b1b1f', hair: '#2b2b2b', shoes: '#111111', jacket: '#1b1b1f', chain: true, belt: '#ff4fd8' },
    car: 'ardent', paint: '#ff4fd8', weapons: ['smg', 'pistol', 'smg'],
  },
  rooks: {
    name: 'Hillside Rooks', short: 'ROOKS', color: '#8f6bff',
    look: { skin: '#7a4a2e', shirt: '#3d2a6a', pants: '#c9b79c', hair: '#111111', shoes: '#8f6bff', cap: '#8f6bff', glasses: true, belt: '#2a2420' },
    car: 'corso', paint: '#3d2a6a', weapons: ['pistol', 'carbine', 'pistol'],
  },
  saints: {
    name: 'Glass Saints', short: 'SAINTS', color: '#bde0fe',
    look: null, // the story's own Glass Saints look
    car: 'halcyon', paint: '#e9f1f7', weapons: ['pistol', 'smg'],
  },
};

const START_OWNERS = { palmline: 'sol', harbor: 'vipers', marisco: 'coyotes', verde: 'rooks', midtown: 'saints', corvel: 'saints' };

/** What a district pays Kai each morning once it is his. */
const DISTRICT_TAKE = { palmline: 150, harbor: 420, marisco: 380, verde: 300, midtown: 520, corvel: 600 };

const WAR = {
  waves: 3,
  baseSize: 3,        // members in the first wave; each wave brings one more
  leash: 140,         // how far from the corner Kai can stray before the war is lost
  leashTime: 9,       // seconds outside the leash before it counts as running away
  breather: 6,        // seconds between waves
  reward: 900,
  defendWaves: 2,
  defendTime: 180,    // seconds to reach a district under attack
  attackEvery: [360, 600], // seconds between rival attempts on Kai's turf
};

const LINES = {
  start: ['You just started something.', 'They will be back with friends.', 'Every corner in this district is watching now.'],
  win: ['The corner is ours.', 'Word travels fast in this city.', 'New flags on old streets.'],
  lose: ['Not today.', 'They kept their streets.', 'You walked away from the fight.'],
};

export class Turf {
  constructor(world) {
    this.world = world;
    this.owners = { ...START_OWNERS };
    this.taken = 0;
    this.defended = 0;
    this.lost = 0;
    this.pending = 0;          // income owed, paid at eight in the morning
    this.lastHour = world.hour;
    this.corners = {};         // district key -> corner spot (a sidewalk point on one of its blocks)
    this.crews = {};           // district key -> the NPCs hanging out on that corner right now
    this.cars = {};            // district key -> the gang's parked car at that corner
    this.war = null;
    this.attack = null;
    this.attackCool = world.rng.range(WAR.attackEvery[0], WAR.attackEvery[1]);
    this.pickCorners();
    this.buildHud();
  }

  // ------------------------------------------------------------ setup
  /** One corner per district: a sidewalk point in the middle of one of its blocks' edges. */
  pickCorners() {
    const w = this.world;
    const byDistrict = {};
    for (const l of w.city.loops) {
      const key = w.city.districtAt((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2);
      (byDistrict[key] = byDistrict[key] || []).push(l);
    }
    const avoid = Object.values(w.city.places).filter((p) => p && typeof p.x === 'number');
    for (const [key, loops] of Object.entries(byDistrict)) {
      // the corner furthest from any story place, so a crew never stands in a shop doorway
      let best = null;
      let bestScore = -1;
      for (const l of loops) {
        const options = [
          { x: (l.x0 + l.x1) / 2, z: l.z0, face: Math.PI },
          { x: l.x1, z: (l.z0 + l.z1) / 2, face: Math.PI / 2 },
          { x: (l.x0 + l.x1) / 2, z: l.z1, face: 0 },
          { x: l.x0, z: (l.z0 + l.z1) / 2, face: -Math.PI / 2 },
        ];
        for (const o of options) {
          let near = Infinity;
          for (const p of avoid) near = Math.min(near, Math.hypot(p.x - o.x, p.z - o.z));
          const score = Math.min(near, 90) + w.rng.range(0, 10);
          if (score > bestScore) { bestScore = score; best = { ...o, loop: l }; }
        }
      }
      if (best) this.corners[key] = best;
    }
  }

  buildHud() {
    const root = document.getElementById('hud');
    const el = document.createElement('div');
    el.className = 'turf-bar';
    el.style.cssText = 'position:absolute;top:18px;left:50%;transform:translateX(-50%);min-width:300px;padding:8px 16px 10px;'
      + 'background:rgba(12,14,24,.72);border-radius:10px;border-top:3px solid #ffb000;font:600 14px "Avenir Next","Segoe UI",sans-serif;'
      + 'color:#fff;text-align:center;display:none;letter-spacing:.04em';
    el.innerHTML = '<div class="tb-title" style="font:italic 900 18px \'Avenir Next Condensed\',Futura,sans-serif;letter-spacing:.08em"></div>'
      + '<div class="tb-sub" style="opacity:.85;margin:2px 0 6px"></div>'
      + '<div style="height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden"><i class="tb-fill" style="display:block;height:100%;width:0"></i></div>';
    if (root) root.appendChild(el);
    this.el = el;
    this.elTitle = el.querySelector('.tb-title');
    this.elSub = el.querySelector('.tb-sub');
    this.elFill = el.querySelector('.tb-fill');
    this.lastBar = '';
  }

  gangOf(district) { return GANGS[this.owners[district]]; }
  mine(district) { return this.owners[district] === 'sol'; }
  ownedCount() { return Object.values(this.owners).filter((g) => g === 'sol').length; }
  dailyTake() {
    return Object.entries(this.owners).reduce((s, [d, g]) => s + (g === 'sol' ? DISTRICT_TAKE[d] || 0 : 0), 0);
  }

  // ------------------------------------------------------------ people
  /** A gang member standing at (x, z), or arriving to fight when `fight` is set. */
  member(gangKey, x, z, fight, district) {
    const w = this.world;
    const g = GANGS[gangKey];
    const friendly = gangKey === 'sol';
    const weapon = friendly ? null : w.rng.pick(g.weapons || ['pistol']);
    const n = new Npc(w, friendly ? 'contact' : 'saint', x, z, {
      look: g.look || undefined,
      state: fight ? 'combat' : friendly ? 'stand' : 'guard',
      weapon,
      persistent: true,
      invulnerable: friendly,
      health: 70 + (fight ? this.waveIndex() * 10 : 0),
      accuracy: 0.75,
      alertRange: fight ? 60 : 7.5,
      heading: w.rng.range(-Math.PI, Math.PI),
    });
    if (friendly) { n.weapon = null; n.human.setWeapon(null); }
    n.gang = gangKey;
    n.turf = district;
    w.npcs.push(n);
    return n;
  }

  waveIndex() { return this.war ? this.war.wave : 0; }

  /** Put the right crew on a district's corner (and their car at the kerb). */
  spawnCrew(district) {
    const w = this.world;
    const c = this.corners[district];
    if (!c) return;
    const gangKey = this.owners[district];
    const list = [];
    const count = gangKey === 'sol' ? 2 : 3 + (district === 'corvel' || district === 'midtown' ? 1 : 0);
    // stand in a loose huddle a step back from the kerb, facing each other
    const bx = -Math.sin(c.face) * 1.5;
    const bz = -Math.cos(c.face) * 1.5;
    for (let k = 0; k < count; k += 1) {
      const a = (k / count) * Math.PI * 2;
      const n = this.member(gangKey, c.x + bx + Math.cos(a) * 1.2, c.z + bz + Math.sin(a) * 1.2, false, district);
      n.heading = Math.atan2(c.x + bx - n.pos.x, c.z + bz - n.pos.z);
      list.push(n);
    }
    this.crews[district] = list;
    // their ride, parked at the kerb beside them
    const g = GANGS[gangKey];
    const rx = c.x + Math.sin(c.face) * 3.6 + Math.cos(c.face) * 6;
    const rz = c.z + Math.cos(c.face) * 3.6 - Math.sin(c.face) * 6;
    const v = new Vehicle(w.scene, g.car, g.paint, rx, rz, c.face + Math.PI / 2);
    v.y = w.city.groundHeight(rx, rz);
    v.kind = 'parked';
    v.gangCar = gangKey;
    w.vehicles.push(v);
    this.cars[district] = v;
  }

  /** Take a corner crew off the street (far away, or swapped for the new owners). */
  clearCrew(district) {
    const w = this.world;
    const list = this.crews[district];
    if (list) {
      for (const n of list) {
        if (n.dead) { n.persistent = false; continue; } // bodies are tidied up by the traffic sweep
        n.remove();
        const i = w.npcs.indexOf(n);
        if (i >= 0) w.npcs.splice(i, 1);
      }
    }
    delete this.crews[district];
    const v = this.cars[district];
    if (v && v !== w.player.vehicle && !v.dead && v.kind === 'parked') {
      v.remove();
      const i = w.vehicles.indexOf(v);
      if (i >= 0) w.vehicles.splice(i, 1);
    } else if (v) v.kind = 'abandoned';
    delete this.cars[district];
  }

  /** Corner crews only exist near Kai; ones he has wiped out stay gone until he leaves. */
  manageCrews() {
    const w = this.world;
    const at = w.mapPos();
    for (const [district, c] of Object.entries(this.corners)) {
      const d = Math.hypot(c.x - at.x, c.z - at.z);
      const here = this.crews[district];
      if (!here && d < 150 && !w.interior && !this.busy(district)) this.spawnCrew(district);
      else if (here && d > 210) this.clearCrew(district);
    }
  }

  busy(district) {
    return (this.war && this.war.district === district) || (this.attack && this.attack.district === district && this.attack.fighting);
  }

  // ------------------------------------------------------------ wars
  /** Called by the world whenever an NPC dies. */
  onKilled(npc) {
    if (!npc.gang || npc.gang === 'sol') return;
    const w = this.world;
    if (this.war && this.war.members.includes(npc)) return;
    if (this.attack && this.attack.fighting && this.attack.members.includes(npc)) return;
    const district = npc.turf;
    if (!district || this.owners[district] !== npc.gang) return;
    if (this.war || w.missions.active) return;
    if (this.attack && this.attack.fighting) return;
    this.startWar(district);
  }

  startWar(district) {
    const w = this.world;
    const c = this.corners[district];
    const gangKey = this.owners[district];
    const g = GANGS[gangKey];
    // the corner crew already in the fight counts as wave zero: they all join in at once
    const members = (this.crews[district] || []).filter((n) => !n.dead);
    for (const n of members) { n.state = 'combat'; n.alertRange = 60; }
    this.war = {
      district, gang: gangKey, x: c.x, z: c.z, wave: 0, members, breather: 2.5, away: 0,
      marker: new Marker(w.scene, c.x, c.z, g.color, 2.4, w.city.groundHeight(c.x, c.z)),
      killed: 0,
    };
    w.hud.bigText('TURF WAR', `${g.name} · ${DISTRICTS[district].name}`, 3.5, g.color);
    w.hud.notify(w.rng.pick(LINES.start));
    w.audio.ui('select');
  }

  /** Bring a wave of gang members in from around the corner, out of Kai's sight if possible. */
  spawnWave(state, gangKey, size, cx, cz) {
    const w = this.world;
    const out = [];
    const at = w.where();
    // arrive in a car: park it on the nearest road node a little way off, the crew piles out
    let best = null;
    for (let tries = 0; tries < 24; tries += 1) {
      const a = w.rng.range(-Math.PI, Math.PI);
      const r = w.rng.range(32, 48);
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const node = w.city.nodes[w.city.nearestNode(x, z)];
      const d = Math.hypot(node.x - at.x, node.z - at.z);
      if (d < 22) continue;
      const seen = w.isVisible(node.x, 1.2, node.z, 60);
      if (!best || (!seen && best.seen) || (seen === best.seen && d > best.d)) best = { x: node.x, z: node.z, d, seen };
      if (!seen) break;
    }
    if (!best) best = { x: cx + 40, z: cz };
    const g = GANGS[gangKey];
    const heading = Math.atan2(cx - best.x, cz - best.z);
    const v = new Vehicle(w.scene, g.car, g.paint, best.x, best.z, heading);
    v.y = w.city.groundHeight(best.x, best.z);
    v.kind = 'abandoned';
    v.gangCar = gangKey;
    w.vehicles.push(v);
    state.cars = state.cars || [];
    state.cars.push(v);
    for (let k = 0; k < size; k += 1) {
      const side = k % 2 ? 1 : -1;
      const back = Math.floor(k / 2) * 1.4;
      const x = best.x + Math.cos(heading) * side * 2.2 - Math.sin(heading) * back;
      const z = best.z - Math.sin(heading) * side * 2.2 - Math.cos(heading) * back;
      const n = this.member(gangKey, x, z, true, state.district);
      n.heading = heading;
      out.push(n);
    }
    w.audio.ui('door');
    return out;
  }

  updateWar(dt) {
    const w = this.world;
    const war = this.war;
    const p = w.player;
    war.marker.update(dt);
    if (p.dead) { this.endWar(false, 'Kai went down. The war is over.'); return; }
    const at = w.where();
    const d = Math.hypot(at.x - war.x, at.z - war.z);
    if (d > WAR.leash || w.interior) {
      war.away += dt;
      w.hud.help(`Get back to the fight! ${Math.max(0, Math.ceil(WAR.leashTime - war.away))}s`);
      if (war.away > WAR.leashTime) { this.endWar(false, 'You ran from the fight.'); return; }
    } else war.away = Math.max(0, war.away - dt * 2);
    const alive = war.members.filter((n) => !n.dead);
    war.killed = war.members.length - alive.length;
    if (alive.length === 0) {
      if (war.wave >= WAR.waves) { this.endWar(true); return; }
      war.breather -= dt;
      if (war.breather <= 0) {
        war.wave += 1;
        const size = WAR.baseSize + war.wave - 1 + (w.difficulty > 1 ? 1 : 0);
        war.members.push(...this.spawnWave(war, war.gang, size, war.x, war.z));
        war.breather = WAR.breather;
        w.hud.popup(`WAVE ${war.wave} / ${WAR.waves}`, GANGS[war.gang].color);
      }
    }
    // a wave that has been standing about for long enough to bore everyone comes looking
    for (const n of alive) if (n.state !== 'combat' && Math.hypot(n.pos.x - at.x, n.pos.z - at.z) < 70) n.state = 'combat';
  }

  endWar(won, why = '') {
    const w = this.world;
    const war = this.war;
    if (!war) return;
    war.marker.remove();
    this.release(war);
    const g = GANGS[war.gang];
    const name = DISTRICTS[war.district].name;
    this.war = null;
    if (won) {
      this.owners[war.district] = 'sol';
      this.taken += 1;
      const prize = WAR.reward + war.wave * 150;
      w.money += prize;
      w.stats.turf = (w.stats.turf || 0) + 1;
      this.clearCrew(war.district);
      w.hud.bigText('TURF TAKEN', `${name} is Sol y Sal ground now · +${dollars(prize)}`, 5, GANGS.sol.color);
      w.hud.notify(`${w.rng.pick(LINES.win)} ${name} pays ${dollars(DISTRICT_TAKE[war.district])} every morning.`);
      w.audio.ui('cash');
      if (this.ownedCount() === Object.keys(this.owners).length) {
        setTimeout(() => w.hud.bigText('THE WHOLE BAY', 'Every district in Solmara Bay answers to Sol y Sal', 5, '#ffd27a'), 5200);
      }
      w.autosave();
    } else {
      w.hud.bigText('WAR LOST', `${g.name} keep ${name}`, 3.5, '#ff4d4d', true);
      w.hud.notify(why || w.rng.pick(LINES.lose));
      w.audio.ui('fail');
      this.clearCrew(war.district);
    }
  }

  /** Survivors of a fight drift off; cars are left where they stopped. */
  release(state) {
    const w = this.world;
    for (const n of state.members) {
      n.persistent = false;
      if (!n.dead && w.interior) { n.remove(); const i = w.npcs.indexOf(n); if (i >= 0) w.npcs.splice(i, 1); }
    }
    for (const v of state.cars || []) if (v !== w.player.vehicle) v.kind = 'abandoned';
  }

  // ------------------------------------------------------------ rivals hitting back
  maybeAttack(dt) {
    const w = this.world;
    if (this.attack || this.war || w.missions.active || w.player.dead || !w.hud.visible) return;
    const mine = Object.keys(this.owners).filter((d) => this.owners[d] === 'sol' && d !== 'palmline');
    if (!mine.length) return;
    this.attackCool -= dt;
    if (this.attackCool > 0) return;
    this.attackCool = w.rng.range(WAR.attackEvery[0], WAR.attackEvery[1]);
    const district = w.rng.pick(mine);
    // the attacker is whoever held it last, or any rival still on the board
    const rivals = Object.keys(GANGS).filter((g) => g !== 'sol' && Object.values(this.owners).includes(g));
    const gangKey = this.formerOwner(district, rivals);
    const c = this.corners[district];
    this.attack = {
      district, gang: gangKey, x: c.x, z: c.z, time: WAR.defendTime, fighting: false, wave: 0, members: [], breather: 1.5,
      marker: new Marker(w.scene, c.x, c.z, GANGS[gangKey].color, 2.4, w.city.groundHeight(c.x, c.z)),
    };
    const g = GANGS[gangKey];
    w.hud.bigText('TURF UNDER ATTACK', `${g.name} are moving on ${DISTRICTS[district].name}`, 4, g.color);
    w.hud.notify(`Get to the corner in ${DISTRICTS[district].name} before they take it.`);
    w.audio.ui('fail');
  }

  formerOwner(district, rivals) {
    const start = START_OWNERS[district];
    if (start !== 'sol' && rivals.includes(start)) return start;
    return rivals.length ? this.world.rng.pick(rivals) : 'saints';
  }

  updateAttack(dt) {
    const w = this.world;
    const a = this.attack;
    a.marker.update(dt);
    const at = w.where();
    const d = Math.hypot(at.x - a.x, at.z - a.z);
    if (!a.fighting) {
      a.time -= dt;
      if (a.time <= 0) { this.endAttack(false, 'Nobody held the corner.'); return; }
      if (d < 45 && !w.interior) {
        a.fighting = true;
        this.clearCrew(a.district);
        w.hud.popup('HOLD THE CORNER', GANGS[a.gang].color);
      }
      return;
    }
    if (w.player.dead) { this.endAttack(false, 'Kai went down defending the corner.'); return; }
    if (d > WAR.leash) { this.endAttack(false, 'You left the corner undefended.'); return; }
    const alive = a.members.filter((n) => !n.dead);
    if (alive.length) return;
    if (a.wave >= WAR.defendWaves) { this.endAttack(true); return; }
    a.breather -= dt;
    if (a.breather > 0) return;
    a.wave += 1;
    a.members.push(...this.spawnWave(a, a.gang, WAR.baseSize + a.wave, a.x, a.z));
    a.breather = WAR.breather;
    w.hud.popup(`WAVE ${a.wave} / ${WAR.defendWaves}`, GANGS[a.gang].color);
  }

  endAttack(held, why = '') {
    const w = this.world;
    const a = this.attack;
    if (!a) return;
    a.marker.remove();
    this.release(a);
    this.attack = null;
    const name = DISTRICTS[a.district].name;
    if (held) {
      this.defended += 1;
      const prize = 500;
      w.money += prize;
      w.hud.bigText('TURF HELD', `${name} stays Sol y Sal · +${dollars(prize)}`, 4, GANGS.sol.color);
      w.audio.ui('cash');
    } else {
      this.lost += 1;
      this.owners[a.district] = a.gang;
      this.clearCrew(a.district);
      w.hud.bigText('TURF LOST', `${GANGS[a.gang].name} took ${name} back`, 4, '#ff4d4d', true);
      if (why) w.hud.notify(why);
      w.audio.ui('fail');
    }
  }

  // ------------------------------------------------------------ income
  payday() {
    const w = this.world;
    const prev = this.lastHour;
    const now = w.hour;
    this.lastHour = now;
    // the clock wrapped past 08:00 (or jumped over it while Kai slept)
    const crossed = (prev < 8 && now >= 8) || (prev > now && (prev < 8 || now >= 8));
    if (!crossed) return;
    const take = this.dailyTake();
    if (take <= 0) return;
    w.money += take;
    w.hud.notify(`Your turf paid ${dollars(take)} this morning (${this.ownedCount()} districts).`);
    w.audio.ui('cash');
  }

  // ------------------------------------------------------------ the step
  update(dt) {
    const w = this.world;
    this.payday();
    this.manageCrews();
    if (this.war) this.updateWar(dt);
    if (this.attack) this.updateAttack(dt);
    else this.maybeAttack(dt);
    // a hint the first time Kai wanders onto rival ground
    if (!this.war && !w.interior && !w.player.dead) {
      const at = w.where();
      const here = w.city.districtAt(at.x, at.z);
      if (here !== this.lastHere) {
        this.lastHere = here;
        this.seen = this.seen || new Set();
        const g = this.gangOf(here);
        const first = !this.seen.has(`${here}:${this.owners[here]}`);
        if (here) this.seen.add(`${here}:${this.owners[here]}`);
        if (g && here && first && w.hud.visible) w.hud.notify(this.mine(here) ? `${DISTRICTS[here].name}: your turf.` : `${DISTRICTS[here].name} is ${g.name} turf.`);
      }
    }
    this.drawBar();
  }

  drawBar() {
    const w = this.world;
    let spec = null;
    if (this.war) {
      const war = this.war;
      const g = GANGS[war.gang];
      const alive = war.members.filter((n) => !n.dead).length;
      const sub = war.wave === 0 ? `Corner crew · ${alive} left` : alive ? `Wave ${war.wave} / ${WAR.waves} · ${alive} left` : war.wave >= WAR.waves ? 'Clear!' : 'More are coming...';
      spec = { color: g.color, title: `TURF WAR · ${DISTRICTS[war.district].name.toUpperCase()}`, sub, fill: (war.wave + (alive ? 0 : 1)) / (WAR.waves + 1) };
    } else if (this.attack) {
      const a = this.attack;
      const g = GANGS[a.gang];
      if (a.fighting) {
        const alive = a.members.filter((n) => !n.dead).length;
        spec = { color: g.color, title: `DEFEND ${DISTRICTS[a.district].name.toUpperCase()}`, sub: `${g.name} · wave ${Math.max(1, a.wave)} / ${WAR.defendWaves} · ${alive} left`, fill: a.wave / WAR.defendWaves };
      } else {
        const m = Math.floor(a.time / 60);
        const s = String(Math.floor(a.time % 60)).padStart(2, '0');
        spec = { color: g.color, title: `${g.short} ATTACKING ${DISTRICTS[a.district].name.toUpperCase()}`, sub: `Reach the corner · ${m}:${s}`, fill: a.time / WAR.defendTime };
      }
    }
    const key = spec ? JSON.stringify(spec) : '';
    if (key === this.lastBar) return;
    this.lastBar = key;
    if (!this.el) return;
    if (!spec || w.ui) { this.el.style.display = 'none'; return; }
    this.el.style.display = 'block';
    this.el.style.borderTopColor = spec.color;
    this.elTitle.textContent = spec.title;
    this.elTitle.style.color = spec.color;
    this.elSub.textContent = spec.sub;
    this.elFill.style.width = `${Math.round(Math.max(0, Math.min(1, spec.fill)) * 100)}%`;
    this.elFill.style.background = spec.color;
  }

  // ------------------------------------------------------------ maps
  blips() {
    const out = [];
    for (const [district, c] of Object.entries(this.corners)) {
      const g = this.gangOf(district);
      if (!g) continue;
      const mine = this.mine(district);
      out.push({
        x: c.x, z: c.z, color: g.color, kind: 'place', icon: mine ? 'crown' : 'turf', minor: true,
        title: mine ? `Sol y Sal corner · ${DISTRICTS[district].name}` : `${g.name} corner`,
        desc: mine ? `Your crew. Pays ${dollars(DISTRICT_TAKE[district])} every morning.` : `Kill one of them here to start a turf war for ${DISTRICTS[district].name}.`,
      });
    }
    for (const s of [this.war, this.attack]) {
      if (!s) continue;
      out.push({ x: s.x, z: s.z, color: GANGS[s.gang].color, kind: 'objective', edge: true, icon: 'objective', title: s === this.war ? 'Turf war' : 'Turf under attack', desc: `${GANGS[s.gang].name} · ${DISTRICTS[s.district].name}` });
      for (const n of s.members) {
        if (n.dead) continue;
        out.push({ x: n.pos.x, z: n.pos.z, color: GANGS[s.gang].color, kind: 'enemy', title: GANGS[s.gang].name, desc: 'Armed and hostile.' });
      }
    }
    return out;
  }

  /** Tint every block of the city map in the colours of the crew that runs it. */
  drawMap(g, view) {
    const w = this.world;
    g.save();
    for (const l of w.city.loops) {
      const key = w.city.districtAt((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2);
      const gang = this.gangOf(key);
      if (!gang) continue;
      const [ax, ay] = view.toScreen(l.x0 - 3, l.z0 - 3);
      const [bx, by] = view.toScreen(l.x1 + 3, l.z1 + 3);
      g.globalAlpha = this.mine(key) ? 0.26 : 0.14;
      g.fillStyle = gang.color;
      g.fillRect(ax, ay, bx - ax, by - ay);
      if ((this.war && this.war.district === key) || (this.attack && this.attack.district === key)) {
        g.globalAlpha = 0.5 + Math.sin(performance.now() / 180) * 0.3;
        g.strokeStyle = gang.color;
        g.lineWidth = 3;
        g.strokeRect(ax, ay, bx - ax, by - ay);
      }
    }
    g.restore();
  }

  /** A short legend for the pause screen: who holds what. */
  summary() {
    return Object.entries(this.owners).map(([d, gk]) => ({ district: DISTRICTS[d].name, gang: GANGS[gk].name, color: GANGS[gk].color, mine: gk === 'sol' }));
  }

  // ------------------------------------------------------------ saving
  serialize() {
    return { owners: this.owners, taken: this.taken, defended: this.defended, lost: this.lost };
  }

  restore(data) {
    if (!data) return;
    for (const k of Object.keys(START_OWNERS)) {
      if (data.owners && GANGS[data.owners[k]]) this.owners[k] = data.owners[k];
    }
    this.taken = data.taken || 0;
    this.defended = data.defended || 0;
    this.lost = data.lost || 0;
    for (const d of Object.keys(this.crews)) this.clearCrew(d);
  }
}

