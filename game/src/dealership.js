// Brightwater Motors: a car dealership on the parking lot block in Harbor Flats. Eight cars on the
// forecourt under bunting, each with a price board, a glass sales office at the back and Teo
// Varga, who sells them. Walk up to a car and press E to look it over: buy it in the paint you
// like (it becomes Kai's own car, waiting outside his apartment after a load), or take it for a
// sixty-second test drive and bring it back to the lot. Drive one off the lot without asking and
// Teo calls it in as stolen.
//
// Sold cars leave gaps; the yard restocks them the next time Kai is far enough away not to
// watch it happen.
import * as THREE from '../vendor/three.module.min.js';
import { Vehicle, MODELS } from './vehicles.js';
import { Npc } from './npc.js';
import { Marker } from './markers.js';
import { roadLine } from './city.js';
import { CITY } from './config.js';
import { labelTexture } from './textures.js';
import { dollars } from './rng.js';

const PRICES = { brisa: 6200, sprint: 5400, corso: 8800, pelican: 9000, halden: 11200, bayrunner: 14500, ardent: 18500, halcyon: 42000 };
const STOCK = ['halcyon', 'ardent', 'bayrunner', 'halden', 'corso', 'brisa', 'pelican', 'sprint'];
const PAINT_CHOICES = [
  ['Lot colour', null], ['Harbor White', '#f4f4f0'], ['Night Black', '#111111'], ['Signal Red', '#e63946'],
  ['Lagoon Teal', '#2ec4b6'], ['Sunset Orange', '#fb8500'], ['Deep Blue', '#1d3557'], ['Mango', '#ffb703'],
];
const TEST_SECONDS = 60;
const TEO = { skin: '#d9a47a', shirt: '#f4f4f0', pants: '#2b2d42', hair: '#3b2416', shoes: '#5a3e2b', jacket: '#1d3557', sleeves: 'long', belt: '#111111' };
const PITCHES = {
  brisa: 'Parks anywhere, starts every time. Perfect for a first car.',
  sprint: 'Two wheels, no traffic. Helmet not included.',
  corso: 'Room for four and the shopping. Quiet on the boulevard.',
  pelican: 'Carries a sofa, a band or a very large fish.',
  halden: 'Takes the Verde Hills tracks like they are paved.',
  bayrunner: 'Seventy years of thunder. Mind the rear end in the wet.',
  ardent: 'The car every kid on Palmline has a poster of.',
  halcyon: 'Fastest thing on four wheels in the bay. I will need a deposit.',
};

/** Block (bx, bz)'s inner lot rectangle, inside the sidewalk. */
function lotOf(bx, bz) {
  const RH = CITY.roadHalf;
  return {
    x0: roadLine(bx) + RH + CITY.walk, x1: roadLine(bx + 1) - RH - CITY.walk,
    z0: roadLine(bz) + RH + CITY.walk, z1: roadLine(bz + 1) - RH - CITY.walk,
  };
}

export class Dealership {
  constructor(world) {
    this.world = world;
    const lot = lotOf(1, 3);
    this.lot = lot;
    this.color = '#4fd1ff';
    this.name = 'Brightwater Motors';
    // the yard takes the whole parking block: no random parked cars on it
    world.city.parking = world.city.parking.filter((p) => !(p.x > lot.x0 - 2 && p.x < lot.x1 + 2 && p.z > lot.z0 - 2 && p.z < lot.z1 + 2));
    this.slots = [];
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < 4; k += 1) {
        this.slots.push({ x: lot.x0 + 12 + k * 15, z: lot.z0 + 12 + row * 20, heading: row ? Math.PI : 0, car: null, board: null });
      }
    }
    this.office = { x0: lot.x1 - 22, x1: lot.x1 - 6, z0: lot.z1 - 14, z1: lot.z1 - 4 };
    this.entry = { x: lot.x1 + 1, z: (lot.z0 + lot.z1) / 2 };
    this.sold = 0;
    this.testDrive = null;
    this.restockCool = 0;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.buildYard();
    STOCK.forEach((model, i) => this.stockSlot(this.slots[i], model));
    const o = this.office;
    this.teo = new Npc(world, 'contact', (o.x0 + o.x1) / 2, o.z0 - 1.4, { look: TEO, state: 'stand', invulnerable: true, persistent: true, heading: Math.PI });
    this.teo.weapon = null;
    this.teo.human.setWeapon(null);
    world.npcs.push(this.teo);
  }

  // ------------------------------------------------------------ the yard
  buildYard() {
    const w = this.world;
    const lot = this.lot;
    const o = this.office;
    const y = CITY.curb;
    const add = (geo, mat, x, yy, z, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, yy, z);
      m.rotation.y = ry;
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: '#9aa2ab', roughness: 0.35, metalness: 0.7 });
    const blue = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.5, emissive: this.color, emissiveIntensity: 0.25 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe6f0', roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
    // polished forecourt pads under each car
    for (const s of this.slots) {
      const pad = add(new THREE.BoxGeometry(6.4, 0.06, 9), new THREE.MeshStandardMaterial({ color: '#d7dde3', roughness: 0.25, metalness: 0.1 }), s.x, y + 0.03, s.z);
      pad.castShadow = false;
    }
    // the sales office: a glass box with a white roof and a blue fascia
    const ow = o.x1 - o.x0;
    const od = o.z1 - o.z0;
    const cx = (o.x0 + o.x1) / 2;
    const cz = (o.z0 + o.z1) / 2;
    add(new THREE.BoxGeometry(ow, 0.3, od), white, cx, y + 0.15, cz);
    add(new THREE.BoxGeometry(ow + 1.2, 0.5, od + 1.2), white, cx, y + 4.0, cz);
    add(new THREE.BoxGeometry(ow + 1.25, 0.6, 0.2), blue, cx, y + 3.5, o.z0 - 0.62);
    const panes = add(new THREE.BoxGeometry(ow - 0.2, 3.4, od - 0.2), glass, cx, y + 2.0, cz);
    panes.castShadow = false;
    for (const [px, pz] of [[o.x0, o.z0], [o.x1, o.z0], [o.x0, o.z1], [o.x1, o.z1]]) add(new THREE.BoxGeometry(0.25, 3.8, 0.25), steel, px, y + 1.9, pz);
    // a desk and two chairs seen through the glass
    add(new THREE.BoxGeometry(3, 0.9, 1.2), new THREE.MeshStandardMaterial({ color: '#5a3e2b' }), cx, y + 0.75, cz);
    for (const dx of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.6, 0.9, 0.6), new THREE.MeshStandardMaterial({ color: '#1d3557' }), cx + dx, y + 0.6, cz - 1.3);
    w.city.addCollider(o.x0, o.x1, o.z0, o.z1, 4.3, 'building');
    // the tall sign on the road side, facing the traffic
    const signTex = labelTexture('BRIGHTWATER MOTORS', { bg: '#0f1a2b', fg: this.color, sub: 'new · used · no questions asked', w: 1024, h: 256, font: 'bold 92px' });
    const sx = lot.x1 + 1.5;
    const sz = lot.z0 + 4;
    add(new THREE.CylinderGeometry(0.22, 0.22, 9, 12), steel, sx, y + 4.5, sz);
    const sign = add(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }), sx, y + 9.6, sz, Math.PI / 2);
    sign.castShadow = false;
    w.city.addCollider(sx - 0.3, sx + 0.3, sz - 0.3, sz + 0.3, 9, 'pole');
    // bunting: strings of little flags between poles along the road edge
    const flagColors = ['#e63946', '#ffb703', '#2ec4b6', '#4fd1ff', '#f4f4f0'];
    const poles = [lot.z0 + 14, lot.z0 + 34, lot.z0 + 54];
    for (const pz of poles) {
      add(new THREE.CylinderGeometry(0.08, 0.08, 6, 8), steel, lot.x1 + 0.6, y + 3, pz);
      w.city.addCollider(lot.x1 + 0.4, lot.x1 + 0.8, pz - 0.2, pz + 0.2, 6, 'pole');
    }
    const flagGeo = new THREE.ConeGeometry(0.28, 0.6, 3);
    flagGeo.rotateX(Math.PI);
    const rope = new THREE.MeshBasicMaterial({ color: '#2a2c30' });
    for (let k = 0; k < poles.length - 1; k += 1) {
      // the cord itself, as a few short straight pieces following the sag
      for (let f = 0; f < 14; f += 1) {
        const t0 = f / 14;
        const t1 = (f + 1) / 14;
        const za = poles[k] + (poles[k + 1] - poles[k]) * t0;
        const zb = poles[k] + (poles[k + 1] - poles[k]) * t1;
        const ya = y + 5.9 - Math.sin(t0 * Math.PI) * 1.1;
        const yb = y + 5.9 - Math.sin(t1 * Math.PI) * 1.1;
        const len = Math.hypot(zb - za, yb - ya);
        const seg = add(new THREE.CylinderGeometry(0.02, 0.02, len, 4), rope, lot.x1 + 0.6, (ya + yb) / 2, (za + zb) / 2);
        seg.rotation.x = Math.PI / 2 - Math.atan2(yb - ya, zb - za);
        seg.castShadow = false;
      }
      for (let f = 1; f < 14; f += 1) {
        const t = f / 14;
        const pz = poles[k] + (poles[k + 1] - poles[k]) * t;
        const sag = Math.sin(t * Math.PI) * 1.1;
        add(flagGeo, new THREE.MeshStandardMaterial({ color: flagColors[f % flagColors.length], side: THREE.DoubleSide }), lot.x1 + 0.6, y + 5.6 - sag, pz).castShadow = false;
      }
    }
    // the yard's return marker, where test drives end
    this.returnSpot = { x: lot.x1 - 10, z: (lot.z0 + lot.z1) / 2 - 2 };
  }

  /** Price boards stand on a little post at the nose of each car. */
  board(slot, model) {
    if (slot.board) { this.group.remove(slot.board); slot.board.material.map.dispose(); }
    const spec = MODELS[model];
    const tex = labelTexture(dollars(PRICES[model]), { bg: '#0f1a2b', fg: '#ffffff', sub: spec.name, w: 256, h: 128, font: 'bold 52px', border: this.color });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    const front = slot.heading === 0 ? 1 : -1;
    m.position.set(slot.x + 2.6, CITY.curb + 1.2, slot.z + front * 3.6);
    m.rotation.y = slot.heading;
    this.group.add(m);
    slot.board = m;
  }

  stockSlot(slot, model) {
    const w = this.world;
    const spec = MODELS[model];
    if (!spec) return;
    const v = new Vehicle(w.scene, model, w.rng.pick(spec.colors), slot.x, slot.z, slot.heading);
    v.y = w.city.groundHeight(slot.x, slot.z);
    v.kind = 'prop';
    v.forSale = model;
    v.price = PRICES[model];
    w.vehicles.push(v);
    slot.car = v;
    slot.model = model;
    this.board(slot, model);
  }

  onLot(x, z, pad = 0) {
    const l = this.lot;
    return x > l.x0 - pad && x < l.x1 + pad && z > l.z0 - pad && z < l.z1 + pad;
  }

  // ------------------------------------------------------------ selling
  /** Hand the car over: it leaves the yard as Kai's own. */
  sell(slot, paint) {
    const w = this.world;
    const v = slot.car;
    const price = PRICES[slot.model];
    if (w.money < price) { w.hud.notify(`Teo: "That one is ${dollars(price)}. Come back when the bank agrees."`); w.audio.ui('fail'); return false; }
    w.money -= price;
    if (paint) v.applyMods({ ...v.mods, color: paint });
    v.forSale = null;
    w.garage.keep(v);
    slot.car = null;
    if (slot.board) { this.group.remove(slot.board); slot.board = null; }
    this.sold += 1;
    w.stats.carsBought = (w.stats.carsBought || 0) + 1;
    w.audio.ui('cash');
    w.hud.bigText('SOLD', `The ${v.spec.name} is yours · -${dollars(price)}`, 4, this.color);
    w.hud.notify('Teo: "Keys are in it. She will be outside your place whenever you need her."');
    w.autosave();
    return true;
  }

  startTest(slot) {
    const w = this.world;
    const v = slot.car;
    this.testDrive = { slot, v, t: TEST_SECONDS, started: false, marker: null };
    w.hud.notify(`Teo: "Sixty seconds, then she comes back to the lot. Do not make me call anyone."`);
    w.audio.ui('select');
  }

  updateTest(dt) {
    const w = this.world;
    const td = this.testDrive;
    const p = w.player;
    const v = td.v;
    if (!td.started) {
      if (p.vehicle === v) {
        td.started = true;
        td.marker = new Marker(w.scene, this.returnSpot.x, this.returnSpot.z, this.color, 3, w.city.groundHeight(this.returnSpot.x, this.returnSpot.z));
        w.hud.popup('TEST DRIVE', this.color);
      }
      return;
    }
    td.t -= dt;
    if (td.marker) td.marker.update(dt);
    const back = Math.hypot(v.pos.x - this.returnSpot.x, v.pos.z - this.returnSpot.z) < 6;
    if (back && v.speed < 2 && (p.vehicle === v || p.vehicle === null)) {
      this.endTest(true);
      return;
    }
    if (v.dead) { this.endTest(false, 'Teo: "You WRECKED it? That is coming out of somebody."'); return; }
    if (td.t <= 0) { this.endTest(false, 'Teo has reported the car stolen.'); return; }
    if (p.vehicle === v) w.hud.help(`Test drive: ${Math.ceil(td.t)}s · bring it back to the Brightwater lot`);
  }

  endTest(ok, msg = '') {
    const w = this.world;
    const td = this.testDrive;
    if (td.marker) td.marker.remove();
    this.testDrive = null;
    const slot = td.slot;
    if (ok) {
      if (w.player.vehicle === td.v) w.player.exitVehicle();
      // park it back on its pad, a little dusty but none the worse
      td.v.pos.x = slot.x;
      td.v.pos.z = slot.z;
      td.v.heading = slot.heading;
      td.v.vel.x = td.v.vel.z = 0;
      td.v.kind = 'prop';
      const dents = Math.round(100 - td.v.health);
      if (dents > 5) {
        const bill = dents * 12;
        w.money = Math.max(0, w.money - bill);
        w.hud.notify(`Teo: "Those dents are yours." -${dollars(bill)}`);
      } else w.hud.notify('Teo: "Smooth. So, are we doing paperwork?"');
      w.audio.ui('pass');
      return;
    }
    // gone: it is a stolen car now, and the yard is a car short
    td.v.forSale = null;
    td.v.kind = 'abandoned';
    slot.car = null;
    if (slot.board) { this.group.remove(slot.board); slot.board = null; }
    if (msg) w.hud.notify(msg);
    if (!td.v.dead) w.police.set(Math.max(w.police.stars, 2));
  }

  /** Someone drove a display car off without asking: that is a theft. */
  checkTheft() {
    const w = this.world;
    const v = w.player.vehicle;
    if (!v || !v.forSale) return;
    if (this.testDrive && this.testDrive.v === v) return;
    if (this.onLot(v.pos.x, v.pos.z, -2)) {
      w.hud.help('This car is for sale. Get out and press E beside it to buy or test drive.');
      return;
    }
    const slot = this.slots.find((s) => s.car === v);
    if (slot) { slot.car = null; if (slot.board) { this.group.remove(slot.board); slot.board = null; } }
    v.forSale = null;
    v.kind = 'abandoned';
    w.hud.notify('Teo: "HEY! That is not a test drive!"');
    w.police.set(Math.max(w.police.stars, 2));
  }

  restock(dt) {
    const w = this.world;
    this.restockCool -= dt;
    if (this.restockCool > 0) return;
    this.restockCool = 5;
    const at = w.mapPos();
    if (Math.hypot(at.x - this.entry.x, at.z - this.entry.z) < 160) return;
    const onLot = new Set(this.slots.map((s) => s.car && s.model).filter(Boolean));
    for (const s of this.slots) {
      if (s.car) continue;
      // a model not already on show, or anything if the yard is full of duplicates
      const model = STOCK.find((m) => !onLot.has(m)) || w.rng.pick(STOCK);
      onLot.add(model);
      this.stockSlot(s, model);
    }
  }

  update(dt, input) {
    const w = this.world;
    const p = w.player;
    if (this.testDrive) this.updateTest(dt);
    this.checkTheft();
    this.restock(dt);
    if (w.ui || w.interior || p.vehicle || p.dead) return;
    if (!this.onLot(p.pos.x, p.pos.z, 4)) return;
    let best = null;
    let bestD = 3.6;
    for (const s of this.slots) {
      if (!s.car || s.car.dead) continue;
      const d = Math.hypot(s.car.pos.x - p.pos.x, s.car.pos.z - p.pos.z);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best) {
      const o = this.office;
      if (Math.hypot(p.pos.x - (o.x0 + o.x1) / 2, p.pos.z - (o.z0 - 1.4)) < 3) w.hud.help('Teo: "Have a look around. Every car has its price on the board."');
      return;
    }
    if (w.police.stars > 0) { w.hud.help('Teo will not sell to someone the police are chasing.'); return; }
    w.hud.help(`Press E to look at the ${best.car.spec.name} (${dollars(PRICES[best.model])})`);
    if (input.hit('KeyE')) { input.consume('KeyE'); w.openUi(new DealerPanel(this, best)); }
  }

  // ------------------------------------------------------------ maps and saving
  blips() {
    return [{
      x: this.entry.x - 6, z: this.entry.z, color: this.color, kind: 'place', icon: 'car', title: this.name,
      desc: `Car dealership: ${this.slots.filter((s) => s.car).length} cars on the lot, from ${dollars(Math.min(...Object.values(PRICES)))}. Test drives free.`,
    }];
  }

  serialize() { return { sold: this.sold }; }

  restore(data) {
    if (!data) return;
    this.sold = data.sold || 0;
  }
}

/** Looking a car over: stats, a paint choice, buy or test drive. */
class DealerPanel {
  constructor(dealer, slot) {
    this.d = dealer;
    this.w = dealer.world;
    this.slot = slot;
    this.row = 0;
    this.paint = 0;
    const v = slot.car;
    this.original = v.color;
    const rig = this.w.rig;
    rig.orbitYaw = v.heading + Math.PI * 0.7;
    rig.orbitPitch = 0.22;
    rig.override = (dt, input, r) => r.orbit(dt, input, v.pos.x, v.y, v.pos.z, 7 + v.spec.len * 0.5, 1.4, 0.15, 2.4);
    this.w.audio.ui('select');
  }

  rows() {
    const v = this.slot.car;
    const price = PRICES[this.slot.model];
    return [
      { key: 'paint', label: 'Paint', value: `‹ ${PAINT_CHOICES[this.paint][0]} ›`, right: this.paint ? '+ FREE' : '', swatch: PAINT_CHOICES[this.paint][1] || v.color },
      { key: 'buy', label: 'Buy it', value: dollars(price), right: this.w.money >= price ? '' : 'SHORT', dim: this.w.money < price },
      { key: 'test', label: 'Test drive', value: `${TEST_SECONDS} seconds`, right: 'FREE', dim: !!this.d.testDrive },
      { key: 'leave', label: 'Walk away', value: '', right: '' },
    ];
  }

  update(dt, input) {
    const w = this.w;
    const v = this.slot.car;
    if (!v) { this.close(); return; }
    const rows = this.rows();
    if (input.hitAny('KeyW', 'ArrowUp')) { this.row = (this.row - 1 + rows.length) % rows.length; w.audio.ui('move'); }
    if (input.hitAny('KeyS', 'ArrowDown')) { this.row = (this.row + 1) % rows.length; w.audio.ui('move'); }
    if (rows[this.row].key === 'paint' && input.hitAny('KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight')) {
      const step = input.hitAny('KeyA', 'ArrowLeft') ? -1 : 1;
      this.paint = (this.paint + step + PAINT_CHOICES.length) % PAINT_CHOICES.length;
      v.applyMods({ ...v.mods, color: PAINT_CHOICES[this.paint][1] || this.original });
      w.audio.ui('move');
    }
    if (input.hitAny('Enter', 'Space')) {
      const key = rows[this.row].key;
      if (key === 'buy') {
        if (this.d.sell(this.slot, PAINT_CHOICES[this.paint][1])) { this.close(true); return; }
      } else if (key === 'test') {
        if (!this.d.testDrive) { this.d.startTest(this.slot); this.close(); return; }
      } else if (key === 'leave') { this.close(); return; }
    }
    if (input.hitAny('KeyE', 'Backspace')) { input.consume('KeyE'); this.close(); return; }
    const t = v.tune || { top: 1, grip: 1 };
    w.hud.panel({
      title: 'BRIGHTWATER MOTORS',
      color: this.d.color,
      subtitle: `${v.spec.name} · ${Math.round(v.spec.top * (t.top || 1) * 3.6)} km/h · ${PITCHES[this.slot.model] || ''}`,
      rows: rows.map((r, i) => ({ ...r, sel: i === this.row })),
      foot: 'W / S: choose · A / D: paint · Enter: confirm · E: walk away · drag to look around',
    });
  }

  close(bought = false) {
    const w = this.w;
    const v = this.slot.car;
    if (v && !bought) v.applyMods({ ...v.mods, color: this.original });
    w.rig.endOrbit();
    w.ui = null;
    w.audio.ui('move');
  }
}
