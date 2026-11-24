// Street events: small things that happen on the pavements of Solmara Bay while Kai is out and
// about, between missions. One at a time, a minute or two apart, somewhere a block or so away:
//  - Bag snatch: a thief runs off with a tourist's bag. Knock him down, grab the bag, bring it back.
//  - Car fire: a crashed sedan is burning with the driver stuck inside. Get to the door (E) before
//    the tank goes.
//  - Spilled van: a payroll van has rolled at the kerb and its cash is all over the road. Take it;
//    it is still theft, and somebody will call it in.
//  - Busker: a street musician on the corner. Tip them (E) and they play you something.
//  - Lost dog: a frightened pup at the kerb. Walk it home (it follows you) for a reward.
// Each shows on the minimap with a pulsing badge and ends on its own if Kai ignores it.
import * as THREE from '../vendor/three.module.min.js';
import { Npc } from './npc.js';
import { Vehicle } from './vehicles.js';
import { Pickup, Marker } from './markers.js';
import { LOOKS } from './human.js';
import { dollars } from './rng.js';

const KINDS = ['snatch', 'fire', 'van', 'busker', 'dog'];
const GAP = [55, 110];   // seconds between events
const TITLES = {
  snatch: 'Bag snatch', fire: 'Car fire', van: 'Spilled payroll van', busker: 'Busker', dog: 'Lost dog',
};
const BUSKER_TUNES = [
  [392, 440, 494, 523, 494, 440, 392, 330],
  [262, 330, 392, 523, 392, 330, 262, 196],
  [440, 523, 587, 659, 587, 523, 440, 523],
];

export class StreetEvents {
  constructor(world) {
    this.world = world;
    this.active = null;
    this.cool = 35;
    this.helped = 0;
    this.tips = 0;
    this.last = null;
  }

  quiet() {
    const w = this.world;
    return !w.missions.active && !w.missions.side && !(w.turf && (w.turf.war || (w.turf.attack && w.turf.attack.fighting)))
      && !w.interior && !w.player.dead && w.police.stars === 0 && !w.ui;
  }

  update(dt, input) {
    const w = this.world;
    if (this.active) {
      const e = this.active;
      e.t += dt;
      if (e.marker) e.marker.update(dt);
      const at = w.mapPos();
      const far = Math.hypot(at.x - e.x, at.z - e.z) > 280;
      if (far || e.t > e.limit) { this.end(null, far ? '' : e.timeoutText); return; }
      this[`update_${e.kind}`](dt, input, e);
      return;
    }
    // nothing happens on the streets while the title screen flies over them
    if (!this.quiet() || !w.hud.visible) return;
    this.cool -= dt;
    if (this.cool > 0) return;
    this.cool = w.rng.range(GAP[0], GAP[1]);
    this.start(this.pickKind());
  }

  pickKind() {
    const w = this.world;
    const night = w.sky && w.sky.night > 0.5;
    const options = KINDS.filter((k) => k !== this.last && !(k === 'busker' && night));
    return w.rng.pick(options);
  }

  start(kind) {
    const w = this.world;
    const pt = w.missions.kerbPoint(70, 140);
    if (!pt) return;
    const e = { kind, x: pt.x, z: pt.z, t: 0, limit: 120, people: [], cars: [], pickups: [], marker: null, stage: 0, timeoutText: '' };
    this.active = e;
    this.last = kind;
    this[`start_${kind}`](e);
    w.hud.notify(`Nearby: ${TITLES[kind]}. ${e.hint || ''}`);
    w.audio.ui('target');
  }

  /** Tidy everything the event put in the world and (maybe) pay out. */
  end(reward, text = '') {
    const w = this.world;
    const e = this.active;
    if (!e) return;
    this.active = null;
    if (e.marker) e.marker.remove();
    for (const n of e.people) n.persistent = false;
    for (const v of e.cars) if (v !== w.player.vehicle && !v.dead) v.kind = 'abandoned';
    for (const k of e.pickups) {
      if (!k.taken) k.remove();
      const i = w.pickups.indexOf(k);
      if (i >= 0) w.pickups.splice(i, 1);
    }
    if (e.dog) { w.scene.remove(e.dog.root); e.dog = null; }
    if (reward) {
      w.money += reward;
      this.helped += 1;
      w.stats.goodDeeds = this.helped;
      w.audio.ui('cash');
      w.hud.popup(`+${dollars(reward)}`, '#6dff8a');
    }
    if (text) w.hud.notify(text);
  }

  npc(role, x, z, opts = {}) {
    const w = this.world;
    const n = new Npc(w, role, x, z, { persistent: true, state: 'stand', ...opts });
    if (role !== 'saint') { n.weapon = null; n.human.setWeapon(null); }
    w.npcs.push(n);
    this.active.people.push(n);
    return n;
  }

  near(x, z, r) {
    const p = this.world.player;
    const at = this.world.where();
    void p;
    return Math.hypot(at.x - x, at.z - z) < r;
  }

  // ------------------------------------------------------------ bag snatch
  start_snatch(e) {
    const w = this.world;
    e.hint = 'Stop the thief and return the bag.';
    e.victim = this.npc('civ', e.x, e.z, { look: { ...LOOKS.clerk, shirt: '#ffe14d', sunhat: '#e9d8a6' }, invulnerable: true });
    e.thief = this.npc('civ', e.x + 2, e.z + 1, { look: { ...LOOKS.kai, shirt: '#2b2b2b', pants: '#2b2b2b', beanie: '#111111', skin: '#c68b62' }, health: 40, state: 'flee' });
    e.thief.walkSpeed = 2.2;
    e.fullHealth = e.thief.health;
    e.limit = 100;
    e.timeoutText = 'The thief got away.';
  }

  update_snatch(dt, input, e) {
    const w = this.world;
    const th = e.thief;
    if (e.stage === 0) {
      // keep running away from Kai for as long as he is chasing
      if (!th.dead && th.health >= e.fullHealth) {
        th.state = 'flee';
        th.timer = 5;
        th.threat = w.where();
      }
      if (th.dead || th.health < e.fullHealth) {
        e.stage = 1;
        const bag = new Pickup(w.scene, 'cash', th.pos.x + 0.6, th.pos.z, th.y, { amount: 0, mission: true });
        w.pickups.push(bag);
        e.pickups.push(bag);
        e.bag = bag;
        if (!th.dead) { th.state = 'cower'; th.timer = 6; }
        w.hud.notify('He dropped the bag. Pick it up.');
      }
      e.x = th.pos.x;
      e.z = th.pos.z;
      return;
    }
    if (e.stage === 1) {
      e.x = e.bag.x;
      e.z = e.bag.z;
      if (e.bag.taken) {
        e.stage = 2;
        e.marker = new Marker(w.scene, e.victim.pos.x, e.victim.pos.z, '#6dff8a', 1.6, e.victim.y);
        e.x = e.victim.pos.x;
        e.z = e.victim.pos.z;
        w.hud.notify('Got the bag. Take it back to its owner (green marker).');
      }
      return;
    }
    if (this.near(e.victim.pos.x, e.victim.pos.z, 2.6) && !w.player.vehicle) {
      this.end(w.rng.int(120, 220), '"My passport is in there! Thank you, thank you."');
    }
    void input;
  }

  // ------------------------------------------------------------ car fire
  start_fire(e) {
    const w = this.world;
    e.hint = 'Pull the driver out before it blows.';
    const v = new Vehicle(w.scene, 'corso', w.rng.pick(['#3d5a80', '#8d99ae', '#ee6c4d']), e.x + 3.5, e.z, Math.PI / 2 + w.rng.range(-0.4, 0.4));
    v.y = w.city.groundHeight(v.pos.x, v.pos.z);
    v.kind = 'prop';
    v.damage(80);
    w.vehicles.push(v);
    e.cars.push(v);
    e.car = v;
    e.fuse = 35;
    e.limit = 60;
    e.timeoutText = '';
  }

  update_fire(dt, input, e) {
    const w = this.world;
    const v = e.car;
    if (v.dead) { this.end(null, 'Too late.'); return; }
    e.fuse -= dt;
    // the fire grows as the fuse burns down
    const heat = 1 - e.fuse / 35;
    if (Math.random() < dt * (10 + heat * 30)) w.fx.spawn('fire', v.pos.x + v.fx * (v.halfLen - 0.6), v.y + 1.0, v.pos.z + v.fz * (v.halfLen - 0.6));
    if (Math.random() < dt * 8) w.fx.spawn('smoke', v.pos.x, v.y + 1.6, v.pos.z);
    if (e.fuse <= 0) {
      w.explode(v);
      this.end(null, e.stage ? '' : 'Nobody got to the driver in time.');
      return;
    }
    if (e.stage === 0 && !w.player.vehicle && this.near(v.pos.x, v.pos.z, 3.4)) {
      w.hud.help(`Press E to pull the driver out (${Math.ceil(e.fuse)}s)`);
      if (input.hit('KeyE')) {
        input.consume('KeyE');
        e.stage = 1;
        const side = { x: v.pos.x - Math.cos(v.heading) * 2.4, z: v.pos.z + Math.sin(v.heading) * 2.4 };
        const n = this.npc('civ', side.x, side.z, { state: 'flee' });
        n.threat = { x: v.pos.x, z: v.pos.z };
        n.timer = 10;
        w.audio.punch();
        w.hud.notify('Out! Now get clear of it.');
        e.fuse = Math.min(e.fuse, 6);
        e.paid = w.rng.int(250, 400);
      }
    } else if (e.stage === 0) w.hud.help(this.near(v.pos.x, v.pos.z, 30) ? `Someone is trapped in that car! ${Math.ceil(e.fuse)}s` : null);
    if (e.stage === 1 && !this.near(v.pos.x, v.pos.z, 9)) {
      const pay = e.paid;
      e.paid = 0;
      if (pay) { w.money += pay; this.helped += 1; w.stats.goodDeeds = this.helped; w.audio.ui('cash'); w.hud.bigText('HERO', `Pulled a driver from a burning car · +${dollars(pay)}`, 3.5, '#6dff8a'); }
    }
  }

  // ------------------------------------------------------------ spilled van
  start_van(e) {
    const w = this.world;
    e.hint = 'Free money... or is it?';
    const v = new Vehicle(w.scene, 'pelican', '#f4f4f0', e.x + 3.5, e.z, w.rng.range(-Math.PI, Math.PI));
    v.y = w.city.groundHeight(v.pos.x, v.pos.z);
    v.kind = 'prop';
    v.damage(70);
    w.vehicles.push(v);
    e.cars.push(v);
    for (let k = 0; k < 6; k += 1) {
      const a = (k / 6) * Math.PI * 2 + w.rng.range(-0.3, 0.3);
      const r = w.rng.range(2.5, 6);
      const x = v.pos.x + Math.cos(a) * r;
      const z = v.pos.z + Math.sin(a) * r;
      const pile = new Pickup(w.scene, 'cash', x, z, w.city.groundHeight(x, z), { amount: w.rng.int(60, 150) });
      w.pickups.push(pile);
      e.pickups.push(pile);
    }
    // the shaken driver stands by the van, phone out
    e.driver = this.npc('civ', v.pos.x - 2, v.pos.z - 2, { look: { ...LOOKS.dock, shirt: '#1d3557', beanie: null, cap: '#1d3557' }, invulnerable: true });
    e.limit = 80;
    e.timeoutText = 'A recovery truck cleared the payroll van away.';
  }

  update_van(dt, input, e) {
    const w = this.world;
    const taken = e.pickups.filter((k) => k.taken).length;
    if (taken > 0 && !e.reported) {
      e.reported = true;
      e.driver.state = 'stand';
      w.hud.notify('The driver is on the phone to the police.');
      e.callIn = 4;
    }
    if (e.callIn !== undefined && e.callIn > 0) {
      e.callIn -= dt;
      if (e.callIn <= 0) w.police.set(Math.max(w.police.stars, 1));
    }
    if (taken === e.pickups.length) this.end(null, 'Every note picked up.');
    void input;
  }

  // ------------------------------------------------------------ busker
  start_busker(e) {
    e.hint = 'Tip them for a song.';
    e.player = this.npc('civ', e.x, e.z, {
      look: { ...LOOKS.kai, shirt: '#f2923a', pants: '#5a3e2b', hair: '#8a4a2a', sunhat: '#c9a25e', skin: '#e0ac85' }, invulnerable: true,
    });
    e.limit = 150;
    e.tips = 0;
    e.timeoutText = '';
  }

  update_busker(dt, input, e) {
    const w = this.world;
    const n = e.player;
    // strum: a little arm movement while they play
    n.human.R.shoulder.rotation.x = -0.9 + Math.sin(w.time * 9) * 0.25;
    n.human.L.shoulder.rotation.x = -1.2;
    if (e.song) {
      e.song.t -= dt;
      if (e.song.t <= 0) {
        const tune = e.song.tune;
        const a = w.audio;
        if (e.song.i < tune.length) {
          if (a.ctx && this.near(n.pos.x, n.pos.z, 25)) a.tone({ freq: tune[e.song.i], type: 'triangle', peak: 0.12, decay: 0.3 });
          e.song.i += 1;
          e.song.t = 0.22;
        } else e.song = null;
      }
    }
    if (w.player.vehicle || !this.near(n.pos.x, n.pos.z, 2.4)) return;
    if (w.money < 10) { w.hud.help('The busker nods at you. (No cash to tip.)'); return; }
    w.hud.help('Press E to tip the busker $10');
    if (input.hit('KeyE')) {
      input.consume('KeyE');
      w.money -= 10;
      e.tips += 1;
      this.tips += 1;
      w.audio.ui('register');
      e.song = { tune: w.rng.pick(BUSKER_TUNES), i: 0, t: 0.1 };
      // generous listeners get something back: a tip about a stash, or simply some luck
      if (this.tips % 5 === 0) {
        const give = w.rng.int(150, 300);
        w.money += give;
        w.hud.notify(`The busker grins: "You are a regular now." They slip you ${dollars(give)} from the hat.`);
      } else w.hud.notify(w.rng.pick(['"This one is for the night shift."', '"Gracias, friend."', '"Requests cost extra. Kidding."']));
    }
  }

  // ------------------------------------------------------------ lost dog
  start_dog(e) {
    const w = this.world;
    e.hint = 'Find the owner; the dog will follow you.';
    e.dog = makeDog(w);
    e.dog.pos = { x: e.x, z: e.z };
    e.dog.root.position.set(e.x, w.city.groundHeight(e.x, e.z), e.z);
    w.scene.add(e.dog.root);
    // the owner is a few blocks away
    const home = w.missions.kerbPoint(120, 220);
    e.home = home || { x: e.x + 150, z: e.z };
    e.limit = 180;
    e.timeoutText = 'The dog wandered off on its own.';
  }

  update_dog(dt, input, e) {
    const w = this.world;
    const d = e.dog;
    const at = w.where();
    const dist = Math.hypot(at.x - d.pos.x, at.z - d.pos.z);
    if (e.stage === 0) {
      e.x = d.pos.x;
      e.z = d.pos.z;
      if (dist < 3 && !w.player.vehicle) {
        e.stage = 1;
        e.owner = this.npc('civ', e.home.x, e.home.z, { look: { ...LOOKS.pearl, shirt: '#3fb8ad', hair: '#1b1712', skin: '#c68b62' }, invulnerable: true });
        e.marker = new Marker(w.scene, e.home.x, e.home.z, '#6dff8a', 1.6, w.city.groundHeight(e.home.x, e.home.z));
        w.hud.notify('The dog has a tag: "If found, ask for Rosa." Walk it to the green marker.');
        w.audio.ui('pickup');
      }
    }
    if (e.stage === 1) {
      e.x = e.home.x;
      e.z = e.home.z;
      if (dist > 3.5 && dist < 40) {
        const sp = Math.min(8, dist * 1.2);
        d.pos.x += ((at.x - d.pos.x) / dist) * sp * dt;
        d.pos.z += ((at.z - d.pos.z) / dist) * sp * dt;
        d.run = sp;
      } else d.run = 0;
      if (dist > 60) { this.end(null, 'You lost the dog.'); return; }
      w.city.pushCircle(d.pos, 0.3, 0);
      if (Math.hypot(d.pos.x - e.home.x, d.pos.z - e.home.z) < 4) {
        this.end(w.rng.int(180, 320), 'Rosa: "Pimienta! Where have you been?"');
        return;
      }
    }
    animateDog(d, dt, w);
    void input;
  }

  // ------------------------------------------------------------ maps
  blips() {
    const e = this.active;
    if (!e) return [];
    return [{ x: e.x, z: e.z, color: '#6dff8a', kind: 'objective', edge: true, icon: 'alert', title: TITLES[e.kind], desc: e.hint || '' }];
  }

  serialize() { return { helped: this.helped, tips: this.tips }; }

  restore(data) {
    if (!data) return;
    this.helped = data.helped || 0;
    this.tips = data.tips || 0;
  }
}

// ------------------------------------------------------------ a small dog, built from boxes

function makeDog(w) {
  const fur = new THREE.MeshStandardMaterial({ color: w.rng.pick(['#c58b4e', '#3a2a1a', '#e8d8c0', '#8a6a4a']), roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.8 });
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.7), fur);
  body.position.y = 0.42;
  root.add(body);
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.4);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.26), fur);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.16), fur);
  snout.position.set(0, -0.04, 0.18);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.04), dark);
  nose.position.set(0, -0.01, 0.27);
  head.add(skull, snout, nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.08), dark);
    ear.position.set(s * 0.1, 0.14, -0.02);
    ear.rotation.z = s * 0.3;
    head.add(ear);
  }
  root.add(head);
  const legs = [];
  for (const [x, z] of [[-0.11, 0.26], [0.11, 0.26], [-0.11, -0.26], [0.11, -0.26]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.32, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), fur);
    m.position.y = -0.16;
    leg.add(m);
    root.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), fur);
  tail.position.set(0, 0.55, -0.45);
  tail.rotation.x = -0.6;
  root.add(tail);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, head, legs, tail, run: 0, phase: 0, heading: 0 };
}

function animateDog(d, dt, w) {
  d.phase += dt * (4 + d.run * 2);
  const swing = d.run > 0.2 ? 0.7 : 0.05;
  d.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(d.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * swing; });
  d.tail.rotation.y = Math.sin(d.phase * 3) * 0.6;
  d.head.rotation.x = Math.sin(d.phase * 0.5) * 0.1;
  const at = w.where();
  const want = Math.atan2(at.x - d.pos.x, at.z - d.pos.z);
  let diff = want - d.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  d.heading += diff * Math.min(1, dt * 6);
  d.root.rotation.y = d.heading;
  d.root.position.set(d.pos.x, w.city.groundHeight(d.pos.x, d.pos.z), d.pos.z);
}
