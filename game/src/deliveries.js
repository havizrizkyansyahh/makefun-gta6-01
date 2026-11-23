// Sol y Sal deliveries: Nadia's food truck takes orders by phone, and Kai runs them across the
// city on the truck's orange Sprint 250. A shift is three orders. Each one is a customer waiting
// at a kerb somewhere; the food cools from the moment it leaves the grill, and every knock the
// bike takes spills a little salsa. Hot food pays well and tips; cold food is a refund. Walk up
// to the truck and press E to start a shift (after Kai's first job for Nadia).
import { Marker } from './markers.js';
import { Npc } from './npc.js';
import { Vehicle } from './vehicles.js';
import { dollars } from './rng.js';

const ORDERS = [
  'two fish tacos, extra lime', 'the Sunset bowl, no onions', 'four carnitas and a horchata', 'a family tray for a birthday',
  'shrimp tacos for a film crew', 'one of everything, apparently', 'a veggie burrito and two churros', 'the spicy one. The really spicy one.',
];
const SHIFT = 3;

export class Deliveries {
  constructor(world) {
    this.world = world;
    this.active = null;
    this.best = 0;
    this.shifts = 0;
    this.bike = null;
  }

  /** The orange Sol y Sal bike by the truck (fetched again if it has gone missing). */
  ensureBike() {
    const w = this.world;
    const n = w.city.places.nadia;
    if (this.bike && !this.bike.dead && w.vehicles.includes(this.bike)) return this.bike;
    const b = new Vehicle(w.scene, 'sprint', '#ff9f1c', n.x - 9, n.z - 4, -Math.PI / 2);
    b.kind = 'parked';
    w.vehicles.push(b);
    this.bike = b;
    return b;
  }

  start() {
    const w = this.world;
    this.ensureBike();
    this.active = { done: 0, earned: 0, order: null, cold: 0 };
    w.hud.bigText('SOL Y SAL', 'Three orders. Keep them hot, keep them upright.', 3, '#ff9f1c');
    w.audio.ui('select');
    this.nextOrder();
  }

  nextOrder() {
    const w = this.world;
    const s = this.active;
    this.clearOrder();
    if (s.done >= SHIFT) { this.finish(); return; }
    const pt = w.missions.kerbPoint(150, 420);
    const customer = new Npc(w, 'civ', pt.x, pt.z, { state: 'stand', persistent: true });
    w.npcs.push(customer);
    const marker = new Marker(w.scene, pt.x, pt.z, '#ff9f1c', 2.6, w.city.groundHeight(pt.x, pt.z));
    // the food stays hot for roughly the time a fair ride takes, plus a little slack
    const life = pt.d / 8 + 30;
    s.order = { x: pt.x, z: pt.z, dist: pt.d, heat: 100, rate: 100 / life, customer, marker, what: w.rng.pick(ORDERS), lastHealth: null };
    w.hud.notify(`Order ${s.done + 1}/${SHIFT}: ${s.order.what}.`);
  }

  clearOrder() {
    const o = this.active && this.active.order;
    if (!o) return;
    o.marker.remove();
    o.customer.persistent = false;
    o.customer.state = 'idle';
    o.customer.timer = 2;
    this.active.order = null;
  }

  finish(reason = null) {
    const w = this.world;
    const s = this.active;
    this.clearOrder();
    this.active = null;
    if (reason) { w.hud.bigText('SHIFT OVER', reason, 3, '#ff5252'); w.audio.ui('fail'); return; }
    this.shifts += 1;
    this.best = Math.max(this.best, s.earned);
    const bonus = s.cold === 0 ? 250 : 0;
    w.money += bonus;
    w.hud.bigText('SHIFT DONE', `Sol y Sal  +${dollars(s.earned + bonus)}${bonus ? '  ·  every order hot' : ''}`, 4, '#ff9f1c');
    w.audio.ui('pass');
    w.stats.tacos = (w.stats.tacos || 0) + SHIFT - s.cold;
  }

  update(dt, input) {
    const w = this.world;
    const p = w.player;
    const s = this.active;
    if (!s) {
      if (p.vehicle || p.dead || w.ui || w.interior) return;
      if (!w.missions.completed.has('salt-air') || w.missions.truck.hidden) return;
      const t = w.missions.truck;
      if (Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) > 4.5) return;
      if (w.missions.busy()) return;
      w.hud.help(`Press E to run taco orders for Nadia${this.best ? ` (best shift ${dollars(this.best)})` : ''}`);
      if (input.hit('KeyE')) { input.consume('KeyE'); this.start(); }
      return;
    }
    const o = s.order;
    if (!o) return;
    o.marker.update(dt);
    o.heat -= o.rate * dt;
    // knocks spill the salsa: any damage the ride takes costs heat
    const v = p.vehicle;
    if (v) {
      if (o.lastHealth !== null && v.health < o.lastHealth - 0.5) {
        o.heat -= (o.lastHealth - v.health) * 2;
        w.hud.notify('Careful! That was the salsa.');
      }
      o.lastHealth = v.health;
    } else o.lastHealth = null;
    if (o.heat <= 0) {
      s.cold += 1;
      s.done += 1;
      w.hud.notify(`Cold tacos: the customer wants a refund. ${s.done}/${SHIFT}`);
      w.audio.ui('fail');
      this.nextOrder();
      return;
    }
    const at = p.where();
    const slow = !v || v.speed < 4;
    if (slow && o.marker.inside(at.x, at.z, 1.5)) {
      const pay = Math.round((45 + o.dist * 0.45) * (0.4 + o.heat / 100 * 0.6));
      const tip = o.heat > 60 ? Math.round(o.heat * 0.6) : 0;
      w.money += pay + tip;
      s.earned += pay + tip;
      s.done += 1;
      w.audio.ui('cash');
      w.hud.notify(`Delivered ${Math.round(o.heat)}% hot: +${dollars(pay)}${tip ? ` and a ${dollars(tip)} tip` : ''}`);
      this.nextOrder();
    }
  }

  onPlayerDown() { if (this.active) this.finish('The orders went cold.'); }

  objective() {
    const s = this.active;
    if (!s || !s.order) return null;
    const heat = Math.max(0, Math.round(s.order.heat));
    return { title: `Sol y Sal · order ${s.done + 1}/${SHIFT} · ${dollars(s.earned)}`, text: `Deliver ${s.order.what} to the orange marker. Heat ${heat}%${heat < 35 ? ': hurry!' : ''}` };
  }

  blips() {
    const out = [];
    const w = this.world;
    if (w.missions.completed.has('salt-air') && !this.active) {
      const t = w.missions.truck;
      out.push({ x: t.pos.x + 2, z: t.pos.z + 2, color: '#ff9f1c', kind: 'place', minor: true, icon: 'nadia', title: 'Sol y Sal deliveries', desc: 'Nadia\'s truck: walk up and press E to run taco orders on the bike.' });
    }
    if (this.active && this.active.order) {
      const o = this.active.order;
      out.push({ x: o.x, z: o.z, color: '#ff9f1c', kind: 'objective', edge: true, icon: 'objective', title: 'Taco order', desc: o.what });
    }
    return out;
  }

  serialize() { return { best: this.best, shifts: this.shifts }; }

  restore(data) {
    if (!data) return;
    this.best = data.best || 0;
    this.shifts = data.shifts || 0;
  }
}
