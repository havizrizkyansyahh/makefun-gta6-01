// The Undertow: a basement nightclub on the Little Marisco waterfront, the fifth door in the city
// Kai can walk through. A lit dance floor that pulses with the music, a crowd that dances to it,
// a DJ booth with an LED wall, a long bar and a roped-off VIP lounge where the owner, Mara Quell,
// holds court.
//
// Three things to do inside:
//  - the bar: three house drinks, each with its own effect (a little health back, a few minutes
//    of slow-motion focus for the next fight, or a hazy, colour-shifting walk home);
//  - the decks: a 45-second DJ set played on the arrow keys, notes falling to a hit line in four
//    lanes; the crowd's hype follows the combo and the tips follow the score;
//  - the VIP lounge: buy into the club, after which The Undertow pays a cut every night and the
//    VIP bar is free.
import * as THREE from '../vendor/three.module.min.js';
import { Human, LOOKS } from './human.js';
import { labelTexture, liveTexture } from './textures.js';
import { dollars } from './rng.js';

export const CLUB = {
  buyIn: 6500,
  nightly: 650,        // paid at 02:00 once Kai owns a share
  setSeconds: 45,
  bpm: 122,
  fall: 1.5,           // seconds a note takes from the top of a lane to the hit line
  perfect: 0.07,
  good: 0.15,
};

const DRINKS = [
  { key: 'spritz', name: 'Saltwater Spritz', price: 25, text: 'Bitter orange and sea salt. +25 health.' },
  { key: 'focus', name: 'Lighthouse Black', price: 60, text: 'Espresso and dark rum. Aim steadier for two minutes.' },
  { key: 'haze', name: 'Undertow Haze', price: 40, text: 'The house special. The city looks different for a while.' },
];

const MARA = { skin: '#e0ac85', shirt: '#1b1b1f', pants: '#1b1b1f', hair: '#c9a25e', shoes: '#ff3df0', jacket: '#3a1f4a', sleeves: 'long', long: true, chain: true, belt: false };
const DJ = { skin: '#5c3420', shirt: '#ff3df0', pants: '#1b1b1f', hair: '#111111', shoes: '#f4f4f4', cap: '#1b1b1f', glasses: true, belt: '#111111' };
const BARTENDER = { skin: '#c68b62', shirt: '#f4f4f0', pants: '#1b1b1f', hair: '#2b2b2b', shoes: '#111111', jacket: '#2a1f3a', bald: true, belt: '#111111' };
const DANCER_SHIRTS = ['#ff3df0', '#3df0ff', '#ffe14d', '#7cff6b', '#ff7a3d', '#b48cff', '#f4f4f0', '#ff4d6d'];
const DANCER_SKINS = ['#f1c9a5', '#e0ac85', '#c68b62', '#a26a45', '#7a4a2e', '#5c3420'];

/** The room definition the interiors module builds (see interiors.js for the Room helpers). */
export const CLUB_DEF = {
  name: 'The Undertow', color: '#ff3df0', place: 'club', icon: 'note',
  desc: 'Nightclub: drinks at the bar, a DJ set on the decks, the VIP lounge.',
  w: 24, d: 20, h: 5.6, floor: 'tile', wall: 'paint', wallColor: '#3a2f4f', doorColor: '#ff3df0', ceiling: '#141018',
  lightColor: '#ff9df5',
  lights: [[-7, -3], [1, -1], [8, -4]],
  furnish(r, w) {
    const club = w.club;
    const H = r.h;
    // ---- the dance floor: 9 x 7 tiles that light up to the beat
    const cols = 9;
    const rows = 7;
    const tileGeo = new THREE.BoxGeometry(0.94, 0.04, 0.94);
    const tileMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const tiles = new THREE.InstancedMesh(tileGeo, tileMat, cols * rows);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        m4.makeTranslation(i - (cols - 1) / 2, 0.02, j - (rows - 1) / 2);
        tiles.setMatrixAt(i * rows + j, m4);
        tiles.setColorAt(i * rows + j, new THREE.Color('#222'));
      }
    }
    r.place(tiles, 1, 0, -1.5);
    r.box(-3.6, 0, -5.1, 5.6, 0.015, 2.1, '#0c0a10', false, { faces: ['py'] });
    // ---- the DJ booth on its riser against the north wall, with the LED wall behind it
    r.box(-3, 0, -9.95, 5, 0.7, -7.2, '#1b1724');
    r.box(-1.2, 0.7, -8.2, 3.2, 1.75, -7.5, '#2a2436');
    r.lit(-1.1, 1.75, -8.15, 3.1, 1.8, -7.55, '#ff3df0');
    r.box(-0.6, 1.8, -8.0, 0.4, 1.86, -7.6, '#111');   // two turntables and a mixer
    r.box(1.6, 1.8, -8.0, 2.6, 1.86, -7.6, '#111');
    r.box(0.7, 1.8, -8.0, 1.3, 1.9, -7.7, '#333');
    for (const x of [-5.2, 6.2]) {
      r.box(x - 0.9, 0, -9.6, x + 0.9, 3.2, -8.1, '#0e0e12');
      for (const y of [0.9, 2.3]) r.lit(x - 0.5, y - 0.45, -8.08, x + 0.5, y + 0.45, -8.05, '#1d1d28');
    }
    const led = liveTexture(512, 192);
    r.plane(1, 3.4, -9.9, 9, 3.2, 0, new THREE.MeshBasicMaterial({ map: led.texture }));
    r.plane(1, H - 0.55, -9.88, 5, 0.7, 0, new THREE.MeshBasicMaterial({ map: labelTexture('THE UNDERTOW', { bg: '#0c0a10', fg: '#ff3df0', border: '#3df0ff' }) }));
    r.person(DJ, 1, -8.8, 0);
    // ---- the bar along the west wall
    r.box(-11.9, 0, -7, -9.4, 1.1, 3, '#2a1f3a');
    r.box(-11.95, 1.1, -7.05, -9.3, 1.16, 3.05, '#c9a25e', false);
    r.lit(-9.42, 0.15, -7, -9.38, 0.22, 3, '#ff3df0');
    for (let k = 0; k < 3; k += 1) {
      const y = 1.6 + k * 0.6;
      r.box(-11.95, y, -6.5, -11.55, y + 0.05, 2.5, '#5a3e2b', false);
      for (let z = -6.3; z < 2.4; z += 0.32) {
        const c = ['#3df0ff', '#ffe14d', '#7cff6b', '#ff7a3d', '#b48cff'][Math.floor(Math.abs(Math.sin(z * 7.1 + k)) * 5)];
        r.lit(-11.85, y + 0.05, z - 0.06, -11.72, y + 0.38, z + 0.06, c);
      }
    }
    for (let z = -5.5; z <= 2; z += 1.5) {
      r.box(-8.9, 0, z - 0.25, -8.4, 0.8, z + 0.25, '#1b1724', true);
      r.box(-8.95, 0.8, z - 0.3, -8.35, 0.86, z + 0.3, '#ff3df0', false);
    }
    r.person(BARTENDER, -10.6, -1.5, Math.PI / 2);
    r.plane(-11.96, 3.9, -2, 4.5, 0.8, Math.PI / 2, new THREE.MeshBasicMaterial({ map: labelTexture('BAR', { bg: '#0c0a10', fg: '#ffe14d', sub: 'spritz · lighthouse · haze', w: 512, h: 128 }) }));
    r.spot(-8.6, -1.5, 1.3, (wld) => wld.club.barPrompt(), (wld) => wld.club.openBar());
    // ---- the VIP lounge in the north-east corner, raised and roped off
    r.box(7, 0, -9.95, 11.95, 0.35, -2.5, '#1b1724');
    r.box(11.2, 0.35, -9.5, 11.9, 1.2, -3, '#5a1f4a');
    r.box(7.4, 0.35, -9.9, 11.9, 1.2, -9.2, '#5a1f4a');
    r.box(8.6, 0.35, -7.2, 10, 0.8, -5.2, '#c9a25e');
    for (let z = -2.6; z > -9.8; z -= 1.8) r.box(6.95, 0.35, z - 0.06, 7.07, 1.3, z + 0.06, '#c9a25e', false);
    r.box(6.98, 1.0, -9.8, 7.04, 1.05, -2.6, '#b3122e', false);
    r.plane(11.94, 3.2, -6.2, 3.4, 0.7, -Math.PI / 2, new THREE.MeshBasicMaterial({ map: labelTexture('VIP', { bg: '#0c0a10', fg: '#c9a25e', border: '#c9a25e', w: 256, h: 96 }) }));
    const mara = r.person(MARA, 10.2, -4.2, -Math.PI / 2 - 0.4);
    mara.y = 0.35;
    r.spot(8.0, -3.4, 1.4, (wld) => wld.club.vipPrompt(), (wld) => wld.club.vip());
    // ---- tables and stools by the entrance
    for (const [x, z] of [[-6, 6], [-2.5, 6.8], [6, 6], [9.5, 3]]) {
      r.box(x - 0.45, 0, z - 0.45, x + 0.45, 1.05, z + 0.45, '#2a2436');
      r.lit(x - 0.47, 1.05, z - 0.47, x + 0.47, 1.08, z + 0.47, '#3df0ff');
      for (const a of [0, 2.1, 4.2]) r.box(x + Math.cos(a) * 0.9 - 0.2, 0, z + Math.sin(a) * 0.9 - 0.2, x + Math.cos(a) * 0.9 + 0.2, 0.75, z + Math.sin(a) * 0.9 + 0.2, '#111', false);
    }
    r.plant(-10.8, 8.4, 1.1);
    r.plant(10.8, 8.4, 1.1);
    // the decks: step up beside the DJ and take over
    r.spot(-1.8, -6.6, 1.2, (wld) => wld.club.deckPrompt(), (wld) => wld.club.startSet());
    // ---- the crowd
    const dancers = [];
    for (let k = 0; k < 14; k += 1) {
      const look = {
        ...LOOKS.kai,
        skin: DANCER_SKINS[k % DANCER_SKINS.length],
        shirt: DANCER_SHIRTS[(k * 3) % DANCER_SHIRTS.length],
        pants: ['#1b1b1f', '#2b2d42', '#e8e4da', '#3d405b'][k % 4],
        hair: ['#1b1712', '#c9a25e', '#2b2b2b', '#8a4a2a'][k % 4],
        bun: k % 3 === 0, glasses: k % 5 === 0, shorts: k % 7 === 3,
      };
      const h = new Human(look);
      const x = -2.8 + (k % 5) * 1.9 + Math.sin(k * 4.7) * 0.4;
      const z = -4.4 + Math.floor(k / 5) * 1.9 + Math.cos(k * 2.3) * 0.4;
      r.place(h.root, x, 0.04, z, Math.atan2(1 - x, -8 - z) + Math.sin(k) * 0.6);
      h.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      dancers.push({ h, x, z, phase: k * 0.77, style: k % 4, face: h.root.rotation.y });
    }
    // ---- two sweeping beams from the ceiling
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ff3df0', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beams = [-4, 6].map((x, i) => {
      const geo = new THREE.ConeGeometry(1.4, H - 0.3, 20, 1, true);
      geo.translate(0, -(H - 0.3) / 2, 0);
      const m = new THREE.Mesh(geo, i ? beamMat.clone() : beamMat);
      r.place(m, x, H - 0.1, -2);
      return m;
    });
    beams[1].material.color.set('#3df0ff');

    // ---- one animation for the whole room, locked to the club's beat
    const color = new THREE.Color();
    let ledT = 0;
    r.anims.push((dt) => {
      const beat = club.beat();
      const hype = club.hype;
      const pulse = Math.pow(1 - (beat % 1), 3);
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const wave = Math.sin(i * 0.9 + j * 0.6 - beat * Math.PI * 0.5);
          const on = (i + j + Math.floor(beat)) % 3 === 0;
          const hue = (0.83 + Math.floor(beat / 4) * 0.13 + i * 0.02) % 1;
          color.setHSL(hue, 0.95, on ? 0.25 + pulse * 0.35 * (0.6 + hype * 0.4) : 0.06 + Math.max(0, wave) * 0.08);
          tiles.setColorAt(i * rows + j, color);
        }
      }
      tiles.instanceColor.needsUpdate = true;
      for (const d of dancers) {
        const b = beat + d.phase;
        const s = Math.sin(b * Math.PI);
        d.h.animate(dt, 0, 'idle');
        const L = d.h.L;
        const R = d.h.R;
        const energy = 0.5 + hype * 0.7;
        if (d.style === 0) { L.shoulder.rotation.x = -2.6 * energy + s * 0.3; R.shoulder.rotation.x = -2.6 * energy - s * 0.3; }
        else if (d.style === 1) { L.shoulder.rotation.z = 0.6 + s * 0.6 * energy; R.shoulder.rotation.z = -0.6 + s * 0.6 * energy; L.elbow.rotation.x = R.elbow.rotation.x = -1.4; }
        else if (d.style === 2) { R.shoulder.rotation.x = -1.6 - Math.abs(s) * 1.2 * energy; L.elbow.rotation.x = -1.8; L.shoulder.rotation.x = -0.6; }
        else { L.shoulder.rotation.x = s * 1.1 * energy; R.shoulder.rotation.x = -s * 1.1 * energy; }
        L.knee.rotation.x = R.knee.rotation.x = Math.abs(s) * 0.35 * energy;
        L.hip.rotation.x = R.hip.rotation.x = -Math.abs(s) * 0.2 * energy;
        d.h.body.position.y = -Math.abs(s) * 0.08 * energy;
        d.h.chest.rotation.y = Math.sin(b * Math.PI * 0.5) * 0.3;
        d.h.root.rotation.y = d.face + Math.sin(b * 0.25) * 0.5;
        d.h.root.position.y = 0.04 + pulse * 0.06 * hype;
      }
      const t = club.time;
      beams[0].rotation.set(Math.sin(t * 0.7) * 0.5, 0, Math.cos(t * 0.5) * 0.45);
      beams[1].rotation.set(Math.cos(t * 0.6) * 0.5, 0, Math.sin(t * 0.8) * 0.45);
      for (const b of beams) b.material.opacity = 0.06 + pulse * 0.12 * (0.5 + hype);
      // the LED wall: bars of an equaliser, redrawn ten times a second
      ledT -= dt;
      if (ledT <= 0) {
        ledT = 0.1;
        const g = led.ctx;
        g.fillStyle = '#05040a';
        g.fillRect(0, 0, 512, 192);
        for (let k = 0; k < 32; k += 1) {
          const hgt = (0.2 + Math.abs(Math.sin(k * 0.7 + beat * 1.3)) * 0.5 + pulse * 0.3 * Math.abs(Math.cos(k))) * 180 * (0.6 + hype * 0.4);
          const grad = g.createLinearGradient(0, 192, 0, 192 - hgt);
          grad.addColorStop(0, '#ff3df0');
          grad.addColorStop(1, '#3df0ff');
          g.fillStyle = grad;
          g.fillRect(k * 16 + 2, 192 - hgt, 12, hgt);
        }
        if (club.set) {
          g.font = 'bold 40px "Avenir Next Condensed", sans-serif';
          g.fillStyle = '#ffffff';
          g.textAlign = 'center';
          g.fillText(`DJ KAI · ${club.set.score}`, 256, 52);
        }
        led.texture.needsUpdate = true;
      }
    });
  },
};

/** The club's state: the beat everyone dances to, the bar, the decks and Kai's share. */
export class Nightclub {
  constructor(world) {
    this.world = world;
    this.time = 0;
    this.hype = 0.4;
    this.owned = false;
    this.best = 0;
    this.sets = 0;
    this.drinks = 0;
    this.set = null;
    this.focus = 0;      // seconds of Lighthouse Black left
    this.haze = 0;       // seconds of Undertow Haze left
    this.lastHour = world.hour;
    this.canvas = document.getElementById('game');
  }

  /** Beats since the club opened (at CLUB.bpm); the floor, dancers and notes all read this. */
  beat() { return (this.time * CLUB.bpm) / 60; }

  inside() { return this.world.interior && this.world.interior.key === 'club'; }

  // ------------------------------------------------------------ the bar
  barPrompt() { return this.owned ? 'Press E for a drink (on the house)' : 'Press E for a drink'; }

  openBar() {
    this.world.openUi(new BarPanel(this));
  }

  serve(drink) {
    const w = this.world;
    const price = this.owned ? 0 : drink.price;
    if (price > w.money) { w.hud.notify('Not enough cash.'); w.audio.ui('fail'); return false; }
    w.money -= price;
    this.drinks += 1;
    w.audio.ui('register');
    if (drink.key === 'spritz') w.player.health = Math.min(100, w.player.health + 25);
    if (drink.key === 'focus') this.focus = 120;
    if (drink.key === 'haze') this.haze = 75;
    w.hud.notify(`${drink.name}${price ? `  -${dollars(price)}` : ''}`);
    return true;
  }

  // ------------------------------------------------------------ the decks
  deckPrompt() {
    return this.best ? `Press E to take the decks (best set: ${this.best})` : 'Press E to take the decks';
  }

  startSet() {
    if (this.set) return;
    this.world.openUi(new DjSet(this));
  }

  // ------------------------------------------------------------ the VIP lounge
  vipPrompt() {
    if (this.owned) return 'Press E to talk to Mara';
    return `Press E to talk to Mara Quell (buy in: ${dollars(CLUB.buyIn)})`;
  }

  vip() {
    const w = this.world;
    if (this.owned) {
      w.hud.notify(w.rng.pick([
        'Mara: "Busy night. The harbour crowd tips better than the hill crowd."',
        'Mara: "Your cut goes out at two. Try not to get shot before then."',
        'Mara: "If the Coyotes come round again, I am sending them to you."',
      ]));
      return;
    }
    if (w.money < CLUB.buyIn) {
      w.hud.notify(`Mara: "Come back with ${dollars(CLUB.buyIn)}. I do not take IOUs from Morenos."`);
      w.audio.ui('fail');
      return;
    }
    w.money -= CLUB.buyIn;
    this.owned = true;
    w.audio.ui('cash');
    w.hud.bigText('THE UNDERTOW', `You own a share. ${dollars(CLUB.nightly)} every night, drinks on the house.`, 5, '#ff3df0');
    w.autosave();
  }

  // ------------------------------------------------------------ every frame
  update(dt) {
    const w = this.world;
    this.time += dt;
    // without Kai on the decks the hype settles back to an ordinary Tuesday
    if (!this.set) this.hype += (0.45 - this.hype) * Math.min(1, dt * 0.3);
    // nightly cut at 02:00
    const prev = this.lastHour;
    this.lastHour = w.hour;
    if (this.owned && ((prev < 2 && w.hour >= 2) || (prev > w.hour && w.hour >= 2))) {
      w.money += CLUB.nightly;
      w.hud.notify(`The Undertow paid your cut: +${dollars(CLUB.nightly)}`);
      w.audio.ui('cash');
    }
    if (this.focus > 0) this.focus -= dt;
    if (this.haze > 0) this.haze = Math.max(0, this.haze - dt);
    this.applyHaze();
  }

  /** The haze: the whole picture drifts through the colours, then settles. */
  applyHaze() {
    const c = this.canvas;
    if (!c) return;
    if (this.haze <= 0) {
      if (this.hazeOn) { c.style.filter = ''; this.hazeOn = false; }
      return;
    }
    this.hazeOn = true;
    const k = Math.min(1, this.haze / 10);
    const hue = Math.sin(this.time * 0.6) * 70 * k;
    const blur = (0.6 + Math.sin(this.time * 1.7) * 0.4) * k;
    c.style.filter = `hue-rotate(${hue.toFixed(1)}deg) saturate(${(1 + 0.6 * k).toFixed(2)}) blur(${blur.toFixed(2)}px)`;
  }

  /** Lighthouse Black steadies the hands: the player module reads this for spread. */
  aimSteady() { return this.focus > 0 ? 0.55 : 1; }

  serialize() { return { owned: this.owned, best: this.best, sets: this.sets, drinks: this.drinks }; }

  restore(data) {
    if (!data) return;
    this.owned = !!data.owned;
    this.best = data.best || 0;
    this.sets = data.sets || 0;
    this.drinks = data.drinks || 0;
  }
}

/** The bar menu: W / S to pick, Enter to buy, E to step away. */
class BarPanel {
  constructor(club) {
    this.club = club;
    this.w = club.world;
    this.row = 0;
    this.w.audio.ui('select');
  }

  update(dt, input) {
    const w = this.w;
    const n = DRINKS.length + 1;
    if (input.hitAny('KeyW', 'ArrowUp')) { this.row = (this.row - 1 + n) % n; w.audio.ui('move'); }
    if (input.hitAny('KeyS', 'ArrowDown')) { this.row = (this.row + 1) % n; w.audio.ui('move'); }
    if (input.hitAny('Enter', 'Space')) {
      if (this.row === DRINKS.length) { this.close(); return; }
      this.club.serve(DRINKS[this.row]);
    }
    if (input.hitAny('KeyE', 'Backspace')) { input.consume('KeyE'); this.close(); return; }
    const free = this.club.owned;
    w.hud.panel({
      title: 'THE UNDERTOW · BAR',
      color: '#ffe14d',
      subtitle: free ? 'Part-owner: everything is on the house.' : `Cash: ${dollars(w.money)}`,
      rows: [
        ...DRINKS.map((d, i) => ({ label: d.name, value: d.text, right: free ? 'FREE' : dollars(d.price), sel: i === this.row, dim: !free && d.price > w.money })),
        { label: 'Step away', value: '', right: '', sel: this.row === DRINKS.length },
      ],
      foot: 'W / S: choose · Enter: order · E: step away',
    });
  }

  close() {
    this.w.ui = null;
    this.w.audio.ui('move');
  }
}

/**
 * A DJ set: four lanes (← ↓ ↑ →, or D F J K), notes falling in time with the club's beat to a
 * hit line. Perfect and good hits build a combo that drives the crowd's hype; misses break it.
 */
class DjSet {
  constructor(club) {
    this.club = club;
    this.w = club.world;
    club.set = this;
    this.t = -2.0;     // a two-second count-in before the first note
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = { perfect: 0, good: 0, miss: 0 };
    this.notes = this.compose();
    this.flash = [0, 0, 0, 0];
    this.verdict = null;
    this.verdictT = 0;
    this.done = false;
    this.buildDom();
    this.w.audio.ui('select');
    this.w.hud.popup('DJ KAI ON THE DECKS', '#ff3df0');
  }

  /** A pattern that gets busier through the set: quarter notes, then eighths, then chords. */
  compose() {
    const rng = this.w.rng;
    const spb = 60 / CLUB.bpm;
    const notes = [];
    const total = Math.floor(CLUB.setSeconds / spb);
    let lastLane = 0;
    for (let b = 0; b < total; b += 1) {
      const t = b * spb;
      const phase = b / total;
      const lane = (lastLane + rng.int(1, 3)) % 4;
      lastLane = lane;
      if (b % 16 === 15 && phase > 0.15) continue; // breathe at the end of each phrase
      notes.push({ t, lane, state: 0 });
      if (phase > 0.35 && rng.chance(0.45)) notes.push({ t: t + spb / 2, lane: (lane + 2) % 4, state: 0 });
      if (phase > 0.7 && b % 4 === 0) notes.push({ t, lane: (lane + 1) % 4, state: 0 });
    }
    return notes;
  }

  buildDom() {
    const root = document.getElementById('hud');
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;right:36px;top:50%;transform:translateY(-42%);width:300px;height:420px;'
      + 'background:linear-gradient(180deg,rgba(10,6,20,.2),rgba(10,6,20,.85));border-radius:14px;border:2px solid rgba(255,61,240,.6);overflow:hidden';
    const lanes = ['←', '↓', '↑', '→'];
    const colors = ['#ff3df0', '#3df0ff', '#7cff6b', '#ffe14d'];
    this.colors = colors;
    let html = '';
    for (let k = 0; k < 4; k += 1) {
      html += `<div style="position:absolute;left:${k * 75}px;top:0;width:75px;height:100%;border-right:1px solid rgba(255,255,255,.08)"></div>`;
      html += `<div class="dj-key" style="position:absolute;left:${k * 75 + 10}px;top:350px;width:55px;height:44px;border-radius:10px;border:3px solid ${colors[k]};`
        + `color:${colors[k]};font:900 26px sans-serif;display:flex;align-items:center;justify-content:center">${lanes[k]}</div>`;
    }
    html += '<div class="dj-score" style="position:absolute;top:10px;left:0;right:0;text-align:center;font:italic 900 22px \'Avenir Next Condensed\',Futura,sans-serif;color:#fff"></div>';
    html += '<div class="dj-verdict" style="position:absolute;top:300px;left:0;right:0;text-align:center;font:italic 900 24px \'Avenir Next Condensed\',Futura,sans-serif"></div>';
    html += '<div style="position:absolute;bottom:4px;left:0;right:0;text-align:center;font:600 11px sans-serif;color:rgba(255,255,255,.6)">← ↓ ↑ → or D F J K · E: leave the decks</div>';
    el.innerHTML = html;
    this.noteLayer = document.createElement('div');
    el.appendChild(this.noteLayer);
    if (root) root.appendChild(el);
    this.el = el;
    this.keys = [...el.querySelectorAll('.dj-key')];
    this.scoreEl = el.querySelector('.dj-score');
    this.verdictEl = el.querySelector('.dj-verdict');
    this.pool = [];
  }

  laneHit(input, k) {
    const codes = [['ArrowLeft', 'KeyD'], ['ArrowDown', 'KeyF'], ['ArrowUp', 'KeyJ'], ['ArrowRight', 'KeyK']][k];
    return input.hitAny(...codes);
  }

  judge(k) {
    // the closest unplayed note in this lane
    let best = null;
    let bestD = Infinity;
    for (const n of this.notes) {
      if (n.state || n.lane !== k) continue;
      const d = Math.abs(n.t - this.t);
      if (d < bestD) { bestD = d; best = n; }
      if (n.t > this.t + CLUB.good) break;
    }
    this.flash[k] = 0.15;
    if (!best || bestD > CLUB.good) {
      // a stray press costs the combo but not points
      this.combo = 0;
      this.say('OFF BEAT', '#ff4d6d');
      return;
    }
    best.state = 1;
    const perfect = bestD <= CLUB.perfect;
    this.combo += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const mult = 1 + Math.min(4, Math.floor(this.combo / 10));
    this.score += (perfect ? 30 : 15) * mult;
    this.hits[perfect ? 'perfect' : 'good'] += 1;
    this.say(perfect ? 'PERFECT' : 'GOOD', perfect ? '#7cff6b' : '#3df0ff');
    // a little blip in the right pitch for the lane, on top of whatever the club is playing
    const a = this.w.audio;
    if (a.ctx) a.tone({ freq: [262, 330, 392, 523][k] * (perfect ? 2 : 1), type: 'square', peak: 0.08, decay: 0.12 });
  }

  say(text, color) {
    this.verdict = text;
    this.verdictT = 0.45;
    this.verdictEl.textContent = text;
    this.verdictEl.style.color = color;
  }

  update(dt, input) {
    const w = this.w;
    const club = this.club;
    if (input.hitAny('KeyE', 'Backspace')) { input.consume('KeyE'); this.finish(true); return; }
    if (this.done) return;
    this.t += dt;
    for (let k = 0; k < 4; k += 1) if (this.laneHit(input, k) && this.t > -0.5) this.judge(k);
    // notes that slipped past the line are misses
    for (const n of this.notes) {
      if (n.state === 0 && n.t < this.t - CLUB.good) {
        n.state = 2;
        this.hits.miss += 1;
        this.combo = 0;
        this.say('MISS', '#ff4d6d');
      }
    }
    // hype chases the combo: a long run brings the whole floor up
    const target = Math.min(1, 0.35 + this.combo / 30);
    club.hype += (target - club.hype) * Math.min(1, dt * 1.5);
    if (this.t > CLUB.setSeconds + 1) { this.finish(false); return; }
    this.draw(dt);
    void w;
  }

  draw(dt) {
    // reuse a pool of note divs rather than building new ones every frame
    let used = 0;
    for (const n of this.notes) {
      if (n.state) continue;
      const ahead = n.t - this.t;
      if (ahead > CLUB.fall) break;
      if (ahead < -CLUB.good) continue;
      let d = this.pool[used];
      if (!d) {
        d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:55px;height:18px;border-radius:9px;box-shadow:0 0 12px currentColor';
        this.noteLayer.appendChild(d);
        this.pool.push(d);
      }
      used += 1;
      const y = 350 + 13 - (ahead / CLUB.fall) * 350;
      d.style.display = 'block';
      d.style.left = `${n.lane * 75 + 10}px`;
      d.style.top = `${y}px`;
      d.style.background = this.colors[n.lane];
      d.style.color = this.colors[n.lane];
    }
    for (let k = used; k < this.pool.length; k += 1) this.pool[k].style.display = 'none';
    for (let k = 0; k < 4; k += 1) {
      this.flash[k] = Math.max(0, this.flash[k] - dt);
      this.keys[k].style.background = this.flash[k] > 0 ? this.colors[k] : 'transparent';
      this.keys[k].style.color = this.flash[k] > 0 ? '#0c0a10' : this.colors[k];
    }
    this.verdictT -= dt;
    if (this.verdictT <= 0) this.verdictEl.textContent = '';
    const left = Math.max(0, Math.ceil(CLUB.setSeconds - Math.max(0, this.t)));
    this.scoreEl.textContent = this.t < 0 ? `GET READY · ${Math.ceil(-this.t)}` : `${this.score}  ·  x${this.combo}  ·  ${left}s`;
  }

  finish(walkedOff) {
    const w = this.w;
    const club = this.club;
    this.done = true;
    const played = this.hits.perfect + this.hits.good + this.hits.miss;
    const acc = played ? (this.hits.perfect + this.hits.good) / played : 0;
    const tips = walkedOff ? Math.round(this.score / 40) : Math.round(this.score / 12 + this.maxCombo * 4);
    if (tips > 0) w.money += tips;
    if (!walkedOff) club.sets += 1;
    const record = !walkedOff && this.score > club.best;
    if (record) club.best = this.score;
    const grade = acc > 0.92 ? 'S' : acc > 0.8 ? 'A' : acc > 0.65 ? 'B' : acc > 0.45 ? 'C' : 'D';
    if (walkedOff) w.hud.notify(`You left the decks early. Tips: ${dollars(tips)}`);
    else w.hud.bigText(`SET GRADE ${grade}`, `${this.score} points · best combo ${this.maxCombo} · ${Math.round(acc * 100)}% · tips ${dollars(tips)}${record ? ' · NEW BEST' : ''}`, 5, '#ff3df0');
    w.audio.ui(tips > 0 ? 'cash' : 'fail');
    w.stats.djSets = club.sets;
    this.close();
  }

  close() {
    if (this.el) this.el.remove();
    this.el = null;
    this.club.set = null;
    if (this.w.ui === this) this.w.ui = null;
  }
}
