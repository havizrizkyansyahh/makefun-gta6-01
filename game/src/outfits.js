// Kai's clothes. Threadline Outfitters stocks seven kinds of thing (tops, jackets, trousers,
// shoes, hats, eyewear, jewellery); Kai buys pieces there and can change into anything he owns
// at the wardrobe in his apartment. Browsing is a try-on: every piece the cursor lands on goes
// straight onto Kai while the camera swings round in front of him like a mirror, and leaving
// without buying puts his own clothes back on.
import { LOOKS } from './human.js';
import { dollars } from './rng.js';

export const SLOTS = [
  { key: 'top', name: 'Tops' },
  { key: 'jacket', name: 'Jackets' },
  { key: 'legs', name: 'Trousers' },
  { key: 'shoes', name: 'Shoes' },
  { key: 'head', name: 'Hats' },
  { key: 'eyes', name: 'Eyewear' },
  { key: 'neck', name: 'Jewellery' },
];

/** What each piece changes on the look; the first piece of each slot is what Kai came home in. */
export const CATALOG = {
  top: [
    { id: 'tee-lagoon', name: 'Lagoon tee', price: 0, set: { shirt: '#2a9d8f', sleeves: 'short' } },
    { id: 'tee-sunset', name: 'Sunset tee', price: 45, set: { shirt: '#f2923a', sleeves: 'short' } },
    { id: 'tee-chalk', name: 'Chalk tee', price: 45, set: { shirt: '#f4f4f0', sleeves: 'short' } },
    { id: 'tee-coral', name: 'Coral tee', price: 55, set: { shirt: '#e85d5d', sleeves: 'short' } },
    { id: 'tank-lime', name: 'Lime tank', price: 35, set: { shirt: '#90be6d', sleeves: 'short' } },
    { id: 'polo-ink', name: 'Ink polo', price: 90, set: { shirt: '#1d3557', sleeves: 'short' } },
    { id: 'shirt-harbor', name: 'Harbor work shirt', price: 120, set: { shirt: '#4a6a8a', sleeves: 'long' } },
    { id: 'shirt-orchid', name: 'Orchid silk shirt', price: 260, set: { shirt: '#9b5de5', sleeves: 'long' } },
  ],
  jacket: [
    { id: 'jacket-none', name: 'No jacket', price: 0, set: { jacket: null } },
    { id: 'bomber-olive', name: 'Olive bomber', price: 340, set: { jacket: '#556b2f' } },
    { id: 'denim', name: 'Denim jacket', price: 280, set: { jacket: '#3d5a80' } },
    { id: 'windbreaker', name: 'Pink windbreaker', price: 230, set: { jacket: '#ff5fa2' } },
    { id: 'blazer-linen', name: 'Cream linen blazer', price: 520, set: { jacket: '#e9dcc0' } },
    { id: 'leather-night', name: 'Night leather', price: 690, set: { jacket: '#2b2118' } },
  ],
  legs: [
    { id: 'jeans-charcoal', name: 'Charcoal jeans', price: 0, set: { pants: '#2e3142', shorts: false } },
    { id: 'chinos-sand', name: 'Sand chinos', price: 110, set: { pants: '#c9b79c', shorts: false } },
    { id: 'linen-white', name: 'White linen trousers', price: 150, set: { pants: '#e8e4da', shorts: false } },
    { id: 'slacks-black', name: 'Black slacks', price: 160, set: { pants: '#1b1b1f', shorts: false } },
    { id: 'shorts-cargo', name: 'Cargo shorts', price: 85, set: { pants: '#6d6875', shorts: true } },
    { id: 'shorts-board', name: 'Board shorts', price: 70, set: { pants: '#2ec4b6', shorts: true } },
  ],
  shoes: [
    { id: 'sneakers-white', name: 'White sneakers', price: 0, set: { shoes: '#f4f4f4' } },
    { id: 'hightops-red', name: 'Red high-tops', price: 120, set: { shoes: '#b33a2b' } },
    { id: 'runners-teal', name: 'Teal runners', price: 140, set: { shoes: '#2ec4b6' } },
    { id: 'loafers-tan', name: 'Tan loafers', price: 180, set: { shoes: '#8b5a2b' } },
    { id: 'boots-black', name: 'Black boots', price: 210, set: { shoes: '#111111' } },
  ],
  head: [
    { id: 'hat-none', name: 'Bare head', price: 0, set: {} },
    { id: 'cap-teal', name: 'Teal cap', price: 50, set: { cap: '#2ec4b6' } },
    { id: 'cap-sunburst', name: 'Sunburst cap', price: 55, set: { cap: '#ffb703' } },
    { id: 'cap-black', name: 'Black cap', price: 50, set: { cap: '#111111' } },
    { id: 'beanie-navy', name: 'Navy beanie', price: 60, set: { beanie: '#3d405b' } },
    { id: 'sunhat-straw', name: 'Straw sun hat', price: 140, set: { sunhat: '#e9d8a6' } },
  ],
  eyes: [
    { id: 'eyes-none', name: 'No glasses', price: 0, set: { glasses: false } },
    { id: 'shades', name: 'Shades', price: 95, set: { glasses: true } },
  ],
  neck: [
    { id: 'neck-none', name: 'Nothing', price: 0, set: { chain: false } },
    { id: 'chain-gold', name: 'Gold chain', price: 450, set: { chain: true } },
  ],
};

const BASE = { ...LOOKS.kai, cap: null, sunhat: null, beanie: null, jacket: null, glasses: false, chain: false, shorts: false };

export class Outfits {
  constructor(world) {
    this.world = world;
    this.owned = new Set();
    this.equipped = {};
    for (const s of SLOTS) {
      for (const item of CATALOG[s.key]) if (item.price === 0) this.owned.add(item.id);
      this.equipped[s.key] = CATALOG[s.key][0].id;
    }
  }

  item(slot, id) { return CATALOG[slot].find((i) => i.id === id) || CATALOG[slot][0]; }

  /** The look a set of equipped pieces adds up to. */
  look(eq = this.equipped) {
    const look = { ...BASE };
    for (const s of SLOTS) Object.assign(look, this.item(s.key, eq[s.key]).set);
    return look;
  }

  /** Dress Kai in what he has equipped. */
  apply() { this.world.player.setLook(this.look()); }

  /** Pieces owned beyond the clothes Kai came home in. */
  count() {
    let n = 0;
    for (const s of SLOTS) for (const i of CATALOG[s.key]) if (i.price > 0 && this.owned.has(i.id)) n += 1;
    return n;
  }

  total() {
    let n = 0;
    for (const s of SLOTS) n += CATALOG[s.key].filter((i) => i.price > 0).length;
    return n;
  }

  openStore() { this.world.openUi(new OutfitPanel(this, 'store')); }
  openWardrobe() { this.world.openUi(new OutfitPanel(this, 'wardrobe')); }

  serialize() { return { owned: [...this.owned], equipped: { ...this.equipped } }; }

  restore(data) {
    if (!data) return;
    for (const id of data.owned || []) this.owned.add(id);
    for (const s of SLOTS) {
      const id = data.equipped && data.equipped[s.key];
      if (id && this.owned.has(id)) this.equipped[s.key] = id;
    }
    this.apply();
  }
}

/**
 * The store and wardrobe screen: A / D picks the kind of piece, W / S the piece itself (tried on
 * at once), Enter buys or wears it, E or Backspace walks away.
 */
class OutfitPanel {
  constructor(outfits, mode) {
    this.o = outfits;
    this.w = outfits.world;
    this.mode = mode;
    this.slot = 0;
    this.preview = { ...outfits.equipped };
    this.index = this.indexOf(this.preview[SLOTS[0].key]);
    const p = this.w.player;
    const rig = this.w.rig;
    // turn Kai to face the middle of the room, so the "mirror" camera has space in front of him
    const room = this.w.interior;
    if (room) {
      p.heading = Math.atan2(room.ox - p.pos.x, room.oz - p.pos.z);
      p.sync();
    }
    rig.orbitYaw = p.heading + Math.PI;
    rig.orbitPitch = 0.12;
    rig.override = (dt, input, r) => r.orbit(dt, input, p.pos.x, p.y, p.pos.z, 2.9, 1.2, 0, 0.75);
    this.w.audio.ui('select');
  }

  items() {
    const list = CATALOG[SLOTS[this.slot].key];
    return this.mode === 'wardrobe' ? list.filter((i) => this.o.owned.has(i.id)) : list;
  }

  indexOf(id) { return Math.max(0, this.items().findIndex((i) => i.id === id)); }

  tryOn() {
    const item = this.items()[this.index];
    if (!item) return;
    this.preview[SLOTS[this.slot].key] = item.id;
    this.w.player.setLook(this.o.look(this.preview));
  }

  update(dt, input) {
    const w = this.w;
    const n = this.items().length;
    if (input.hitAny('KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight')) {
      const step = input.hitAny('KeyA', 'ArrowLeft') ? -1 : 1;
      this.slot = (this.slot + step + SLOTS.length) % SLOTS.length;
      this.index = this.indexOf(this.preview[SLOTS[this.slot].key]);
      w.audio.ui('move');
    }
    if (input.hitAny('KeyW', 'ArrowUp', 'KeyS', 'ArrowDown') && n > 0) {
      const step = input.hitAny('KeyW', 'ArrowUp') ? -1 : 1;
      this.index = (this.index + step + n) % n;
      this.tryOn();
      w.audio.ui('move');
    }
    if (input.hitAny('Enter', 'Space')) this.choose();
    if (input.hitAny('KeyE', 'Backspace')) { input.consume('KeyE'); this.close(); return; }
    this.draw();
  }

  choose() {
    const w = this.w;
    const slot = SLOTS[this.slot].key;
    const item = this.items()[this.index];
    if (!item) return;
    if (!this.o.owned.has(item.id)) {
      if (w.money < item.price) { w.hud.notify('Not enough cash.'); w.audio.ui('fail'); return; }
      w.money -= item.price;
      this.o.owned.add(item.id);
      w.audio.ui('register');
      w.hud.notify(`Bought: ${item.name} (${dollars(item.price)})`);
      w.stats.clothes = (w.stats.clothes || 0) + 1;
    } else w.audio.ui('select');
    this.o.equipped[slot] = item.id;
    this.preview[slot] = item.id;
  }

  close() {
    const w = this.w;
    // anything tried on but not bought comes off again
    this.o.apply();
    w.rig.endOrbit();
    w.ui = null;
    w.audio.ui('move');
  }

  draw() {
    const w = this.w;
    const slot = SLOTS[this.slot].key;
    const rows = this.items().map((item, i) => {
      const owned = this.o.owned.has(item.id);
      const worn = this.o.equipped[slot] === item.id;
      let right = worn ? 'WEARING' : owned ? 'OWNED' : dollars(item.price);
      if (this.mode === 'wardrobe') right = worn ? 'WEARING' : '';
      return { label: item.name, right, sel: i === this.index, dim: !owned && w.money < item.price, good: worn };
    });
    w.hud.panel({
      title: this.mode === 'store' ? 'THREADLINE OUTFITTERS' : "KAI'S WARDROBE",
      color: '#c77dff',
      tabs: SLOTS.map((s) => s.name),
      tab: this.slot,
      rows,
      foot: this.mode === 'store'
        ? `A / D: section · W / S: try on · Enter: buy or wear · E: leave · ${this.o.count()}/${this.o.total()} pieces owned`
        : 'A / D: section · W / S: try on · Enter: wear · E: done',
    });
  }
}
