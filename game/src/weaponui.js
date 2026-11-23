// Weapon UI: silhouettes of each gun painted on canvases, the weapon panel (icon, name, rounds in
// the magazine as big digits and a bar, reserve ammo), a slot strip that flashes up when you
// switch, and the weapon wheel: hold Tab, time slows, point at a weapon with the mouse (or press
// 1-5), let go to draw it. The wheel lays out however many weapons the arsenal has, evenly.
import { WEAPONS, WEAPON_ORDER } from './combat.js';

const ICON_W = 200;
const ICON_H = 90;

/** A white silhouette of a weapon (or a fist) as a data URL. */
export function weaponIcon(key) {
  const c = document.createElement('canvas');
  c.width = ICON_W;
  c.height = ICON_H;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  const poly = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.closePath(); g.fill(); };
  const round = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  if (key === 'fist') {
    round(62, 26, 70, 44, 14);                       // back of the hand
    for (let k = 0; k < 4; k += 1) round(70 + k * 16, 14, 15, 24, 7); // knuckles
    round(48, 40, 26, 18, 8);                        // thumb
    round(118, 58, 22, 26, 6);                       // wrist
  } else if (key === 'pistol') {
    round(40, 22, 112, 20, 4);                       // slide
    poly([[150, 26], [160, 26], [160, 38], [150, 38]]);
    poly([[56, 40], [96, 40], [86, 80], [58, 80], [52, 74]]); // grip
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(96, 42); g.quadraticCurveTo(110, 62, 92, 60); g.stroke(); // trigger guard
  } else if (key === 'smg') {
    round(46, 26, 104, 24, 4);                       // receiver
    round(148, 32, 36, 9, 3);                        // barrel
    poly([[72, 48], [88, 48], [96, 84], [80, 86]]);  // magazine
    poly([[50, 48], [64, 48], [60, 72], [46, 72]]);  // grip
    poly([[46, 30], [16, 34], [12, 52], [20, 52], [24, 42], [46, 42]]); // folding stock
  } else if (key === 'carbine') {
    round(52, 30, 92, 16, 3);                        // receiver
    round(142, 34, 50, 7, 2);                        // barrel
    round(150, 26, 20, 6, 2);                        // front sight block
    round(70, 20, 50, 8, 3);                         // optic
    poly([[96, 44], [110, 44], [116, 76], [102, 78]]); // curved magazine
    poly([[66, 44], [80, 44], [74, 70], [60, 70]]);  // pistol grip
    poly([[54, 32], [14, 34], [8, 58], [20, 58], [26, 46], [54, 44]]); // stock
  } else {
    round(30, 30, 160, 10, 3);                       // barrel
    round(84, 40, 60, 11, 4);                        // pump
    poly([[40, 34], [80, 34], [80, 50], [58, 50], [46, 70], [8, 78], [6, 62], [36, 50]]); // stock and grip
  }
  return c.toDataURL();
}

const el = (tag, cls, parent, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

// wheel layout: fists at the top, then clockwise round the ring in arsenal order
const WHEEL_ANGLES = Object.fromEntries(WEAPON_ORDER.map((k, i) => [k, -Math.PI / 2 + (i / WEAPON_ORDER.length) * Math.PI * 2]));

export class WeaponHud {
  constructor(panelParent, root) {
    this.icons = {};
    for (const k of WEAPON_ORDER) this.icons[k] = weaponIcon(k);
    // panel
    this.panel = el('div', 'wpn', panelParent);
    this.icon = el('img', 'wpn-icon', this.panel);
    const info = el('div', 'wpn-info', this.panel);
    this.name = el('div', 'wpn-name', info);
    const ammo = el('div', 'wpn-ammo', info);
    this.clip = el('span', 'wpn-clip', ammo);
    this.reserve = el('span', 'wpn-reserve', ammo);
    this.bar = el('div', 'wpn-bar', info, '<i></i>');
    // slot strip
    this.strip = el('div', 'wpn-strip', panelParent);
    this.slots = WEAPON_ORDER.map((k, i) => {
      const s = el('div', 'wpn-slot', this.strip, `<kbd>${i + 1}</kbd>`);
      const img = el('img', '', s);
      img.src = this.icons[k];
      return s;
    });
    // wheel
    this.wheel = el('div', 'wpn-wheel', root);
    el('div', 'wheel-ring', this.wheel);
    this.wheelItems = {};
    for (const k of WEAPON_ORDER) {
      const a = WHEEL_ANGLES[k];
      const item = el('div', 'wheel-item', this.wheel);
      item.style.left = `${50 + Math.cos(a) * 31}%`;
      item.style.top = `${50 + Math.sin(a) * 31}%`;
      const img = el('img', '', item);
      img.src = this.icons[k];
      el('div', 'wheel-name', item, WEAPONS[k].name);
      el('div', 'wheel-ammo', item);
      this.wheelItems[k] = item;
    }
    this.centre = el('div', 'wheel-centre', this.wheel);
    this.open = false;
    this.pointer = { x: 0, y: 0 };
    this.choice = null;
    this.stripT = 0;
    this.lastKey = null;
  }

  /** Show the wheel; returns nothing until it is closed. */
  openWheel(player) {
    this.open = true;
    this.pointer.x = 0;
    this.pointer.y = 0;
    this.choice = player.current;
    this.wheel.classList.add('on');
  }

  /** Move the wheel's pointer with the mouse; the sector it points into is the choice. */
  point(dx, dy, player) {
    this.pointer.x += dx;
    this.pointer.y += dy;
    const len = Math.hypot(this.pointer.x, this.pointer.y);
    if (len > 120) { this.pointer.x *= 120 / len; this.pointer.y *= 120 / len; }
    if (len < 25) return;
    const a = Math.atan2(this.pointer.y, this.pointer.x);
    let best = null;
    let bd = Infinity;
    for (const k of WEAPON_ORDER) {
      if (!player.weapons[k].owned) continue;
      const d = Math.abs(Math.atan2(Math.sin(a - WHEEL_ANGLES[k]), Math.cos(a - WHEEL_ANGLES[k])));
      if (d < bd) { bd = d; best = k; }
    }
    if (best) this.choice = best;
  }

  /** Hide the wheel and return the weapon chosen. */
  closeWheel() {
    this.open = false;
    this.wheel.classList.remove('on');
    return this.choice;
  }

  update(player, dt) {
    const key = player.current;
    const spec = WEAPONS[key];
    const ws = player.weapons[key];
    if (key !== this.lastKey) {
      this.icon.src = this.icons[key];
      this.name.textContent = spec.name;
      this.lastKey = key;
      this.stripT = 2.5;
      this.panel.classList.remove('pop');
      void this.panel.offsetWidth;
      this.panel.classList.add('pop');
    }
    if (spec.melee) {
      this.clip.textContent = '';
      this.reserve.textContent = 'MELEE';
      this.bar.firstChild.style.width = '0%';
    } else {
      this.clip.textContent = player.reloadT > 0 ? '--' : String(ws.clip);
      this.reserve.textContent = player.reloadT > 0 ? 'RELOADING' : `/ ${ws.ammo}`;
      const frac = player.reloadT > 0 ? 1 - player.reloadT / 1.1 : ws.clip / spec.mag;
      this.bar.firstChild.style.width = `${Math.round(frac * 100)}%`;
      this.panel.classList.toggle('low', ws.clip <= Math.ceil(spec.mag * 0.25) && player.reloadT <= 0);
    }
    this.stripT -= dt;
    this.strip.classList.toggle('on', this.stripT > 0 || this.open);
    WEAPON_ORDER.forEach((k, i) => {
      const s = this.slots[i];
      s.classList.toggle('owned', player.weapons[k].owned);
      s.classList.toggle('current', k === key);
    });
    if (this.open) {
      for (const k of WEAPON_ORDER) {
        const it = this.wheelItems[k];
        const owned = player.weapons[k].owned;
        it.classList.toggle('owned', owned);
        it.classList.toggle('sel', k === this.choice);
        it.lastChild.textContent = !owned ? 'locked' : WEAPONS[k].melee ? '' : `${player.weapons[k].clip} / ${player.weapons[k].ammo}`;
      }
      this.centre.textContent = WEAPONS[this.choice].name;
    }
  }
}
