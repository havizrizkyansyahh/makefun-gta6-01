// Interiors: four rooms Kai can walk into through their street doors. Kai's apartment (sleep to
// save and skip ahead, change clothes at the wardrobe, raid the fridge, watch Channel 6 on the
// TV), Spin City Laundry (Pearl's laundromat, rows of tumbling machines and a back office),
// Coastline Arms (the gun counter, and a six-lane shooting range behind it) and Threadline
// Outfitters (racks, mannequins and the tailor's counter).
//
// Each room is real geometry built off the edge of the map, east beyond the hills: a floor deck
// people stand on, walls and a ceiling that the camera and bullets collide with, furniture with
// colliders, its own lamps, staff and customers. Stepping through a door moves Kai there, hides
// the city and shuts out the sun; the exit mat brings him back out onto the pavement.
import * as THREE from '../vendor/three.module.min.js';
import { MeshBuilder, col } from './geometry.js';
import { INTERIOR } from './config.js';
import { Npc } from './npc.js';
import { Human, LOOKS } from './human.js';
import { floorTexture, wallTexture, windowViewTexture, labelTexture, liveTexture } from './textures.js';
import { pottedPlant } from './trees.js';
import { DoorMarker } from './markers.js';

const furnitureMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.05, envMapIntensity: 0.55 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
const glassMat = new THREE.MeshPhysicalMaterial({ color: '#cfe6f0', roughness: 0.04, transparent: true, opacity: 0.22, envMapIntensity: 1.4, depthWrite: false });
const mirrorMat = new THREE.MeshStandardMaterial({ color: '#e8eef2', roughness: 0.02, metalness: 1, envMapIntensity: 1.6 });

/** One room: its shell, furniture, lights, people, interaction spots and floor plan. */
class Room {
  constructor(world, key, def, index) {
    this.world = world;
    this.key = key;
    this.def = def;
    this.name = def.name;
    this.ox = INTERIOR.originX + index * INTERIOR.spacing;
    this.oz = 0;
    this.w = def.w;
    this.d = def.d;
    this.h = def.h;
    this.group = new THREE.Group();
    this.group.visible = false;
    world.scene.add(this.group);
    this.mb = new MeshBuilder();
    this.glow = new MeshBuilder();
    this.solids = [];
    this.spots = [];
    this.npcs = [];
    this.anims = [];
    this.lights = def.lights;
    this.spawn = { x: 0, z: this.d / 2 - 1.8, face: Math.PI };
    this.exit = { x: 0, z: this.d / 2 - 0.9 };
    this.buildShell();
    def.furnish(this, world);
    const mesh = new THREE.Mesh(this.mb.build(), furnitureMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.group.add(new THREE.Mesh(this.glow.build(), glowMat));
    this.deck = world.city.addDeck(this.ox - this.w / 2, this.ox + this.w / 2, this.oz - this.d / 2, this.oz + this.d / 2, 0, 'interior');
    this.deck.room = key;
  }

  X(lx) { return this.ox + lx; }
  Z(lz) { return this.oz + lz; }
  /** Local room coordinates to the world. */
  at(lx, lz) { return { x: this.ox + lx, z: this.oz + lz }; }
  contains(x, z) { return Math.abs(x - this.ox) < this.w / 2 + 2 && Math.abs(z - this.oz) < this.d / 2 + 2; }

  /** Furniture: a vertex-coloured box in room coordinates; solid ones block people and shots. */
  box(lx0, y0, lz0, lx1, y1, lz1, color, solid = true, opts = {}) {
    this.mb.box(this.X(lx0), y0, this.Z(lz0), this.X(lx1), y1, this.Z(lz1), col(color), opts);
    if (solid) {
      this.world.city.addCollider(this.X(lx0), this.X(lx1), this.Z(lz0), this.Z(lz1), y1, 'furniture', y0 > 1.9 ? y0 : 0);
      if (y0 < 1.2) this.solids.push({ x0: lx0, z0: lz0, x1: lx1, z1: lz1, color });
    }
  }

  /** A lit panel (lamps, screens, signs) that does not need any light to be seen. */
  lit(lx0, y0, lz0, lx1, y1, lz1, color) {
    this.glow.box(this.X(lx0), y0, this.Z(lz0), this.X(lx1), y1, this.Z(lz1), col(color), { faces: ['px', 'nx', 'pz', 'nz', 'py', 'ny'] });
  }

  /** A flat picture (a window view, a poster, a TV screen) at room point (lx, y, lz), turned rotY. */
  plane(lx, y, lz, w, h, rotY, material) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(this.X(lx), y, this.Z(lz));
    m.rotation.y = rotY;
    this.group.add(m);
    return m;
  }

  /** Anything else (a plant, a mannequin) placed at a room point. */
  place(obj, lx, y, lz, rotY = 0) {
    obj.position.set(this.X(lx), y, this.Z(lz));
    obj.rotation.y = rotY;
    this.group.add(obj);
    return obj;
  }

  plant(lx, lz, s = 1) {
    this.place(pottedPlant(s), lx, 0, lz, Math.random() * 6);
    this.world.city.addCollider(this.X(lx) - 0.3 * s, this.X(lx) + 0.3 * s, this.Z(lz) - 0.3 * s, this.Z(lz) + 0.3 * s, 0.6 * s, 'furniture');
  }

  /**
   * An interaction spot: standing within r of (lx, lz) shows text(world) as a prompt and E runs
   * act(world). during(world, input) runs every frame while Kai stands there (the gun counter).
   */
  spot(lx, lz, r, text, act, during = null) {
    this.spots.push({ x: lx, z: lz, r, text, act, during });
  }

  /** Staff (invulnerable, standing) and customers (browsing the given area). */
  person(look, lx, lz, face, opts = {}) {
    const w = this.world;
    const p = this.at(lx, lz);
    const n = new Npc(w, opts.role || 'contact', p.x, p.z, {
      look, state: opts.area ? 'browse' : 'stand', heading: face, persistent: true, invulnerable: !opts.area, interior: this.key,
      area: opts.area ? { x0: this.X(opts.area[0]), z0: this.Z(opts.area[1]), x1: this.X(opts.area[2]), z1: this.Z(opts.area[3]) } : null,
    });
    n.weapon = null;
    n.human.setWeapon(null);
    w.npcs.push(n);
    this.npcs.push(n);
    return n;
  }

  buildShell() {
    const { w, d, h } = this;
    const def = this.def;
    const floor = floorTexture(def.floor);
    const tile = def.floor === 'wood' ? 1.3 : def.floor === 'tile' ? 2.4 : 2;
    floor.map.repeat.set(w / tile, d / tile);
    floor.normal.repeat.copy(floor.map.repeat);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: floor.map, normalMap: floor.normal, roughness: def.floor === 'tile' ? 0.35 : 0.75, envMapIntensity: def.floor === 'tile' ? 0.9 : 0.4 }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.set(this.ox, 0.001, this.oz);
    fl.receiveShadow = true;
    this.group.add(fl);
    // walls: textured slabs just outside the floor's edges, tinted per room
    const tex = wallTexture(def.wall);
    tex.map.repeat.set(1, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, color: def.wallColor, roughness: 0.85, envMapIntensity: 0.4 });
    const wb = new MeshBuilder();
    const t = 0.3;
    const white = col('#ffffff');
    const x0 = this.ox - w / 2;
    const x1 = this.ox + w / 2;
    const z0 = this.oz - d / 2;
    const z1 = this.oz + d / 2;
    wb.box(x0 - t, 0, z0 - t, x1 + t, h, z0, white, { tile: [4, h] });
    wb.box(x0 - t, 0, z1, x1 + t, h, z1 + t, white, { tile: [4, h] });
    wb.box(x0 - t, 0, z0, x0, h, z1, white, { tile: [4, h] });
    wb.box(x1, 0, z0, x1 + t, h, z1, white, { tile: [4, h] });
    const walls = new THREE.Mesh(wb.build(), wallMat);
    walls.receiveShadow = true;
    this.group.add(walls);
    const city = this.world.city;
    city.addCollider(x0 - 1, x1 + 1, z0 - 1, z0, h + 1, 'wall');
    city.addCollider(x0 - 1, x1 + 1, z1, z1 + 1, h + 1, 'wall');
    city.addCollider(x0 - 1, x0, z0, z1, h + 1, 'wall');
    city.addCollider(x1, x1 + 1, z0, z1, h + 1, 'wall');
    // ceiling: a slab the camera stops under, with lit panels
    this.box(-w / 2, h, -d / 2, w / 2, h + 0.3, d / 2, def.ceiling || '#f2efe8', false, { faces: ['ny'] });
    city.addCollider(x0, x1, z0, z1, h + 0.5, 'ceiling', h - 0.05);
    for (const [lx, lz] of this.lights) this.lit(lx - 0.7, h - 0.06, lz - 0.35, lx + 0.7, h - 0.01, lz + 0.35, '#fff6e0');
    // the way out: a door in the south wall with an exit sign over it
    this.box(-0.75, 0, d / 2 - 0.08, 0.75, 2.3, d / 2, def.doorColor || '#5a3e2b', false);
    this.box(-0.85, 2.3, d / 2 - 0.1, 0.85, 2.42, d / 2, '#e8e2d4', false);
    this.box(-0.85, 0, d / 2 - 0.1, -0.75, 2.42, d / 2, '#e8e2d4', false);
    this.box(0.75, 0, d / 2 - 0.1, 0.85, 2.42, d / 2, '#e8e2d4', false);
    this.lit(-0.3, 2.62, d / 2 - 0.12, 0.3, 2.84, d / 2 - 0.05, '#3dff8b');
    this.box(-0.9, 0.002, d / 2 - 1.5, 0.9, 0.02, d / 2 - 0.3, '#3a3430', false, { faces: ['py'] }); // door mat
  }

  update(dt, t) {
    for (const a of this.anims) a(dt, t);
  }
}

// ------------------------------------------------------------------ the rooms

/** Headlines for the apartment TV: the city's news follows the story. */
function headlines(w) {
  const done = (id) => w.missions.completed.has(id);
  const list = ['HEAT WAVE: SOLMARA BAY HITS 34°C', 'MARLIN CAB DRIVERS THREATEN STRIKE', 'PALMLINE STALL OWNERS "TOO AFRAID TO TALK"'];
  if (done('broken-glass')) list.unshift('CHOP SHOP GUTTED IN LITTLE MARISCO: NO ARRESTS');
  if (done('tide-money')) list.unshift('ARMOURED VAN BLAST ON THE BOULEVARD');
  if (done('glass-houses')) list.unshift('GLASS SAINTS BOSS HALO CALDER DEAD IN PLAZA SHOOT-OUT');
  if (done('paper-trail')) list.unshift('LEDGER RUMOURS ROCK THE SBPD');
  if (done('dry-cleaning')) list.unshift('SHOTS AT A LAUNDROMAT: SERGEANT VEY MISSING');
  if (done('low-tide')) list.unshift('CAPTAIN HOLLIS ARRESTED AT SEA; HARBOUR BOARD UNDER INQUIRY');
  return list.slice(0, 4);
}

const DEFS = {
  apartment: {
    name: "Kai's apartment", color: '#52d273', place: 'safehouse', icon: 'house',
    desc: 'Sleep to save, change clothes, raid the fridge, catch the news.',
    w: 16, d: 12, h: 4.0, floor: 'wood', wall: 'paint', wallColor: '#efe3cf', doorColor: '#2a9d8f',
    lights: [[-4, -2], [3.5, 0], [0, 3.5]],
    furnish(r, w) {
      // bed with headboard, mattress, blanket and pillows
      r.box(-7.8, 0, -5.9, -4.6, 0.42, -3.4, '#6b4128');
      r.box(-7.7, 0.42, -5.8, -4.7, 0.62, -3.5, '#f4f1ea', false);
      r.box(-7.72, 0.62, -5.0, -4.68, 0.68, -3.48, '#2a9d8f', false);
      r.box(-7.6, 0.62, -5.75, -6.3, 0.78, -5.25, '#ffffff', false);
      r.box(-6.1, 0.62, -5.75, -4.8, 0.78, -5.25, '#ffffff', false);
      r.box(-7.9, 0, -5.98, -4.5, 1.25, -5.85, '#5a3420', false);
      // nightstand and lamp
      r.box(-4.4, 0, -5.9, -3.8, 0.55, -5.3, '#7a5032');
      r.box(-4.2, 0.55, -5.7, -4.0, 0.85, -5.5, '#d8d2c6', false);
      r.lit(-4.3, 0.85, -5.8, -3.9, 1.1, -5.4, '#ffd9a0');
      // wardrobe
      r.box(-7.95, 0, -1.2, -7.1, 2.3, 1.6, '#8a5a3a');
      r.box(-7.1, 0.1, 0.18, -7.08, 2.2, 0.22, '#5a3420', false);
      r.box(-7.08, 1.0, -0.2, -7.04, 1.4, -0.12, '#d4af37', false);
      r.box(-7.08, 1.0, 0.52, -7.04, 1.4, 0.6, '#d4af37', false);
      // kitchen run: base cabinets, worktop, hob, sink, wall cabinets and the fridge
      r.box(1.5, 0, -5.95, 6.6, 0.88, -5.3, '#f4f4f0');
      r.box(1.45, 0.88, -5.98, 6.65, 0.94, -5.22, '#3a3d42', false);
      r.box(2.0, 0.94, -5.8, 2.9, 0.96, -5.4, '#1a1a1a', false);
      r.box(4.0, 0.9, -5.8, 4.8, 0.95, -5.4, '#9aa2ab', false);
      r.box(1.5, 1.7, -5.98, 6.6, 2.5, -5.6, '#f4f4f0', false);
      r.box(6.7, 0, -5.95, 7.9, 2.0, -5.1, '#dfe6ec');
      r.box(6.72, 1.1, -5.1, 6.78, 1.6, -5.06, '#9aa2ab', false);
      // dining table and two stools
      r.box(2.4, 0, -3.6, 4.0, 0.76, -2.6, '#a77b52');
      r.box(2.0, 0, -3.3, 2.35, 0.48, -2.95, '#2a2c30');
      r.box(4.05, 0, -3.3, 4.4, 0.48, -2.95, '#2a2c30');
      // living corner: sofa facing the TV on the east wall, coffee table on a rug
      r.box(2.7, 0, -0.2, 3.7, 0.45, 2.8, '#3d5a80');
      r.box(2.7, 0.45, -0.2, 3.0, 1.0, 2.8, '#33506f', false);
      r.box(3.0, 0.45, -0.2, 3.7, 0.65, 0.05, '#33506f', false);
      r.box(3.0, 0.45, 2.55, 3.7, 0.65, 2.8, '#33506f', false);
      r.box(4.3, 0.001, -0.4, 6.8, 0.012, 3.0, '#c9a25e', false, { faces: ['py'] });
      r.box(4.8, 0, 0.6, 6.0, 0.42, 1.9, '#6b4128');
      r.box(7.3, 0, 0.0, 7.95, 0.55, 2.6, '#2a2c30');
      r.box(7.82, 0.9, 0.25, 7.92, 2.05, 2.35, '#111111', false);
      const tv = liveTexture(320, 180);
      const screen = r.plane(7.8, 1.47, 1.3, 1.95, 1.05, -Math.PI / 2, new THREE.MeshBasicMaterial({ map: tv.texture }));
      r.tv = { ...tv, on: true, t: 0, mesh: screen };
      // a window over the bay, framed, with sill
      const view = new THREE.MeshBasicMaterial({ map: windowViewTexture(17.5) });
      r.plane(-1.4, 1.9, -5.99, 3.4, 1.7, 0, view);
      r.box(-3.2, 0.98, -5.99, 0.4, 1.06, -5.75, '#f4efe6', false);
      r.box(-3.2, 2.75, -5.99, 0.4, 2.85, -5.9, '#f4efe6', false);
      r.box(-1.45, 1.05, -5.99, -1.35, 2.75, -5.92, '#f4efe6', false);
      // a poster from Nadia's truck and a framed photo
      r.plane(-7.98, 1.9, 3.2, 1.2, 1.6, Math.PI / 2, new THREE.MeshStandardMaterial({ map: labelTexture('SOL Y SAL', { bg: '#ff9f1c', fg: '#1d1f2b', sub: 'tacos on the sand', w: 256, h: 340, font: 'bold 44px' }) }));
      r.plane(0.5, 1.8, 5.98, 1.0, 0.7, Math.PI, new THREE.MeshStandardMaterial({ map: labelTexture('NORTHERN STAR', { bg: '#1d3557', fg: '#bde0fe', sub: 'six years on the boats', w: 256, h: 180, font: 'bold 32px' }) }));
      r.plant(-7.3, 5.3, 1.1);
      r.plant(7.3, 5.3, 0.9);
      r.plant(0.9, -5.5, 0.7);
      r.spot(-6.2, -3.0, 1.2, () => 'Press E to sleep: save and rest six hours', (wld) => wld.interiors.sleep());
      r.spot(-6.6, 0.2, 1.1, () => 'Press E to change clothes', (wld) => wld.outfits.openWardrobe());
      r.spot(7.0, -4.5, 1.1, (wld) => (wld.player.health >= 100 ? 'The fridge: nothing you need right now.' : 'Press E to grab something from the fridge (+35 health)'), (wld) => {
        if (wld.player.health >= 100) return;
        wld.player.health = Math.min(100, wld.player.health + 35);
        wld.audio.ui('pickup');
        wld.hud.notify('Leftover tacos from Nadia. +35 health.');
      });
      r.spot(4.4, 1.3, 1.3, () => (r.tv.on ? 'Press E to switch the TV off' : 'Press E to switch on Channel 6'), () => { r.tv.on = !r.tv.on; w.audio.ui('move'); });
      r.anims.push((dt) => {
        const tvs = r.tv;
        tvs.t += dt;
        if (!r.group.visible) return;
        const g = tvs.ctx;
        if (!tvs.on) { g.fillStyle = '#050608'; g.fillRect(0, 0, 320, 180); tvs.texture.needsUpdate = true; return; }
        const grad = g.createLinearGradient(0, 0, 320, 180);
        grad.addColorStop(0, '#16203a');
        grad.addColorStop(1, '#2c4a7a');
        g.fillStyle = grad;
        g.fillRect(0, 0, 320, 180);
        g.fillStyle = '#ff7a1a';
        g.fillRect(0, 0, 320, 30);
        g.fillStyle = '#ffffff';
        g.font = 'bold 18px "Avenir Next", sans-serif';
        g.textAlign = 'left';
        g.fillText('CHANNEL 6 · BAY NEWS', 10, 21);
        const lines = headlines(w);
        const k = Math.floor(tvs.t / 4) % lines.length;
        g.font = 'bold 15px "Avenir Next", sans-serif';
        g.fillStyle = '#ffffff';
        const words = lines[k].split(' ');
        let line = '';
        let y = 70;
        for (const word of words) {
          if (g.measureText(`${line}${word} `).width > 290) { g.fillText(line, 14, y); line = ''; y += 22; }
          line += `${word} `;
        }
        g.fillText(line, 14, y);
        g.fillStyle = 'rgba(255,255,255,0.15)';
        g.fillRect(0, 150, 320, 30);
        g.fillStyle = '#ffd27a';
        g.font = '14px "Avenir Next", sans-serif';
        const ticker = `${lines.join('   ·   ')}   ·   `;
        const tw = g.measureText(ticker).width;
        const off = (tvs.t * 60) % tw;
        g.fillText(ticker, 10 - off, 170);
        g.fillText(ticker, 10 - off + tw, 170);
        // scanlines
        g.fillStyle = 'rgba(0,0,0,0.12)';
        for (let s = 0; s < 180; s += 3) g.fillRect(0, s, 320, 1);
        tvs.texture.needsUpdate = true;
      });
    },
  },

  laundry: {
    name: 'Spin City Laundry', color: '#ff5fa2', place: 'laundryDoor', icon: 'laundry',
    desc: "Auntie Pearl's laundromat. A soda machine, and a back office nobody is meant to see.",
    w: 22, d: 15, h: 4.2, floor: 'tile', wall: 'paint', wallColor: '#d6f0ee', doorColor: '#ff5fa2',
    lights: [[-5, -3], [2, 2], [8, -4]],
    furnish(r) {
      const drums = [];
      const tumble = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = '#1d2a33';
        g.fillRect(0, 0, 64, 64);
        for (const [x, y, rr, cc] of [[22, 40, 14, '#e85d5d'], [40, 26, 12, '#f2d15c'], [30, 18, 9, '#3a7bd5'], [44, 44, 10, '#f4f4f0']]) { g.fillStyle = cc; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill(); }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshStandardMaterial({ map: t, roughness: 0.2, envMapIntensity: 1.2 });
      })();
      const drumGeo = new THREE.CircleGeometry(0.26, 24);
      /** A front-loading washer (or a dryer stacked on one) at (x, z) facing +z or -z. */
      const machine = (x, z, facing, stacked) => {
        const zf = facing > 0 ? z + 0.4 : z - 0.4;
        r.box(x - 0.4, 0, z - 0.4, x + 0.4, 0.95, z + 0.4, '#f4f4f0');
        r.mb.disc(r.X(x), 0.5, r.Z(zf + facing * 0.005), 0.31, facing > 0 ? 'z' : '-z', col('#9aa2ab'));
        const drum = new THREE.Mesh(drumGeo, tumble);
        r.place(drum, x, 0.5, zf + facing * 0.012, facing > 0 ? 0 : Math.PI);
        drums.push({ mesh: drum, speed: 2 + Math.random() * 4, on: Math.random() < 0.7 });
        r.box(x - 0.38, 0.82, zf - 0.01 * facing, x + 0.38, 0.92, zf + 0.01 * facing, '#2a2c30', false);
        if (stacked) {
          r.box(x - 0.4, 0.95, z - 0.4, x + 0.4, 1.85, z + 0.4, '#cfd6dc', false);
          r.mb.disc(r.X(x), 1.4, r.Z(zf + facing * 0.005), 0.28, facing > 0 ? 'z' : '-z', col('#1d2a33'));
        }
      };
      for (let x = -9.5; x <= 4.5; x += 0.9) machine(x, -7.0, 1, true);
      for (let x = -8; x <= 2.8; x += 0.9) { machine(x, -0.8, 1, false); machine(x, -1.6, -1, false); }
      r.box(-8.5, 0.95, -2.0, 3.3, 1.0, -0.4, '#3fb6c9', false);
      // folding table and laundry baskets
      r.box(-10.9, 0, 1.0, -9.6, 0.9, 5.2, '#e8e2d4');
      for (const [z, c] of [[1.6, '#3a7bd5'], [3.2, '#ff5fa2'], [4.5, '#f2d15c']]) r.box(-10.7, 0.9, z - 0.35, -10.0, 1.2, z + 0.35, c, false);
      // seats along the front window
      for (let x = -9; x <= -3; x += 1.0) { r.box(x - 0.4, 0, 6.6, x + 0.4, 0.46, 7.2, '#ff5fa2'); r.box(x - 0.4, 0.46, 7.05, x + 0.4, 0.95, 7.2, '#ff5fa2', false); }
      // counter with the till, the clerk behind it
      r.box(5.5, 0, 3.1, 10.8, 1.05, 3.9, '#ff5fa2');
      r.box(5.45, 1.05, 3.05, 10.85, 1.1, 3.95, '#f4f4f0', false);
      r.box(8.6, 1.1, 3.3, 9.2, 1.4, 3.7, '#2a2c30', false);
      r.lit(8.65, 1.25, 3.71, 9.15, 1.38, 3.72, '#3dff8b');
      r.person(LOOKS.clerk, 8.0, 2.3, 0);
      // the soda machine
      r.box(10.2, 0, 5.0, 10.95, 1.95, 6.2, '#c0392b');
      r.lit(10.18, 0.9, 5.15, 10.2, 1.8, 6.05, '#ffe2b0');
      // partition to the back office with a doorway, and the office: desk, cabinets, a safe
      r.box(5.85, 0, -7.5, 6.15, h(r), -3.7, '#d6f0ee');
      r.box(5.85, 0, -2.3, 6.15, h(r), -1.0, '#d6f0ee');
      r.box(5.85, 2.4, -3.7, 6.15, h(r), -2.3, '#d6f0ee');
      r.box(6.15, 0, -1.0, 11, h(r), -0.7, '#d6f0ee');
      r.box(8.0, 0, -6.0, 10.2, 0.78, -4.9, '#6b4128');
      r.box(8.3, 0.78, -5.8, 8.9, 1.15, -5.7, '#2a2c30', false);
      r.box(10.3, 0, -7.4, 10.95, 1.4, -5.6, '#8a96a3');
      r.box(6.3, 0, -7.4, 7.2, 1.0, -6.5, '#3a3d42');
      r.lit(6.3, 1.4, -7.45, 7.2, 1.42, -7.44, '#ffd27a');
      r.plane(-1, 2.9, -7.48, 3.6, 0.9, 0, new THREE.MeshBasicMaterial({ map: labelTexture('SPIN CITY', { bg: '#ff5fa2', fg: '#ffffff', sub: 'we get things clean', w: 512, h: 128 }) }));
      r.plant(-10.4, 6.6, 1.0);
      r.plant(4.8, 6.6, 0.8);
      r.person({ ...LOOKS.nadia, shirt: '#3fb8ad', skin: '#e0ac85', hair: '#6e4424' }, -6, 3, 0, { role: 'civ', area: [-9, 1.5, 3, 5.8] });
      r.person({ ...LOOKS.kai, shirt: '#f2d15c', cap: '#1d3557', skin: '#c68b62' }, 1, 4, 0, { role: 'civ', area: [-8, 1.5, 4, 5.8] });
      r.spot(9.6, 5.6, 1.1, (wld) => (wld.money >= 5 ? 'Press E: Fizz soda, $5 (+15 health)' : 'Fizz soda: $5'), (wld) => {
        if (wld.money < 5) { wld.hud.notify('Not enough cash.'); return; }
        wld.money -= 5;
        wld.player.health = Math.min(100, wld.player.health + 15);
        wld.audio.ui('register');
        wld.hud.notify('Fizz! +15 health.');
      });
      r.anims.push((dt) => {
        if (!r.group.visible) return;
        for (const dr of drums) if (dr.on) dr.mesh.rotation.z += dr.speed * dt;
      });
    },
  },

  gunshop: {
    name: 'Coastline Arms', color: '#ff7043', place: 'gunshop', icon: 'gun',
    desc: 'The gun counter up front, a six-lane range out back.',
    w: 14, d: 34, h: 4.6, floor: 'concrete', wall: 'brick', wallColor: '#d8cfc4', doorColor: '#3a3d42', ceiling: '#3a3d42',
    lights: [[0, 12], [0, -2], [0, -12]],
    furnish(r, w) {
      // the counter, glass display cases and the gun wall behind
      r.box(-5, 0, 8.0, 3, 1.0, 8.9, '#3a3d42');
      const top = new THREE.Mesh(new THREE.BoxGeometry(8, 0.04, 0.9), glassMat);
      r.place(top, -1, 1.02, 8.45);
      r.lit(-4.8, 0.5, 8.91, 2.8, 0.54, 8.92, '#ffb347');
      r.box(-6.95, 0, 10, -6.0, 0.95, 15.5, '#3a3d42');
      r.place(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 5.5), glassMat), -6.475, 0.97, 12.75);
      r.box(-7.0, 0, 3.9, 3, h(r), 4.2, '#d8cfc4');                      // partition to the range
      r.box(-6.6, 1.2, 4.2, 2.6, 3.2, 4.28, '#6b4128', false);            // pegboard
      for (let k = 0; k < 6; k += 1) {
        const x = -6 + k * 1.4;
        r.box(x - 0.5, 2.6 - (k % 2) * 0.6, 4.28, x + 0.5, 2.72 - (k % 2) * 0.6, 4.34, '#1a1c20', false);
        r.box(x - 0.4, 1.7 + (k % 2) * 0.3, 4.28, x + 0.1, 1.82 + (k % 2) * 0.3, 4.34, '#2a2c30', false);
      }
      r.plane(-2, 3.7, 4.32, 4.4, 0.7, 0, new THREE.MeshBasicMaterial({ map: labelTexture('COASTLINE ARMS', { bg: '#1d1f2b', fg: '#ff7043', border: '#ff7043' }) }));
      r.person(LOOKS.gunsmith, -1, 6.9, 0);
      // the range: booths with dividers, a bench line, lanes, the backstop
      for (let k = 0; k <= 6; k += 1) {
        const x = -7 + k * (14 / 6);
        r.box(x - 0.06, 0, -0.6, x + 0.06, 2.2, 1.6, '#5a5e66');
      }
      r.box(-7, 0, -0.65, 7, 1.15, -0.25, '#4a4038');
      r.box(-7, 1.15, -0.7, 7, 1.2, -0.2, '#8a7a6a', false);
      r.box(-7, 0, -17, 7, h(r), -16.4, '#2a2420');
      for (let k = 1; k < 6; k += 1) {
        const x = -7 + k * (14 / 6);
        r.box(x - 0.04, 0.002, -16.4, x + 0.04, 0.012, -0.7, '#ffd23f', false, { faces: ['py'] });
      }
      // lane numbers over each booth, facing the shooters
      for (let k = 0; k < 6; k += 1) {
        const x = -7 + (k + 0.5) * (14 / 6);
        r.plane(x, 2.55, -0.72, 0.7, 0.35, 0, new THREE.MeshBasicMaterial({ map: labelTexture(String(k + 1), { bg: '#ff7043', fg: '#1d1f2b', w: 128, h: 64, font: 'bold 44px' }) }));
      }
      // baffles hanging over the lanes
      for (let z = -3; z > -16; z -= 4) r.box(-7, h(r) - 0.6, z - 0.15, 7, h(r) - 0.05, z + 0.15, '#2a2c30', false);
      r.plane(-1.5, 3.4, -0.75, 5, 0.6, 0, new THREE.MeshBasicMaterial({ map: labelTexture('RANGE IS HOT WHEN THE LIGHT IS RED', { bg: '#1d1f2b', fg: '#ffd27a', w: 1024, h: 96, font: 'bold 44px' }) }));
      r.rangeLight = new THREE.MeshBasicMaterial({ color: '#3dff8b' });
      r.place(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), r.rangeLight), 2.6, 3.4, -0.75);
      r.plant(6.3, 16.2, 0.9);
      r.spot(-1, 9.7, 1.4, () => null, () => {}, (wld, input) => wld.missions.serveCounter(input));
      // booth 4 is where the range officer starts a session
      r.booth = { x: -7 + 3.5 * (14 / 6), z: 0.7 };
      r.spot(r.booth.x, r.booth.z, 1.0, (wld) => wld.activities.range.prompt(), (wld) => wld.activities.range.start());
      void w;
    },
  },

  boutique: {
    name: 'Threadline Outfitters', color: '#c77dff', place: 'boutique', icon: 'shirt',
    desc: 'Tops, jackets, trousers, shoes, hats and the right shades.',
    w: 18, d: 14, h: 4.4, floor: 'carpet', wall: 'paint', wallColor: '#f6eef4', doorColor: '#6a4c93',
    lights: [[-4, -2], [3, -2], [0, 4]],
    furnish(r, w) {
      const palette = ['#e85d5d', '#3fb8ad', '#f2d15c', '#f4f4f0', '#1e5560', '#f2923a', '#6a4c93', '#f2a7b7', '#7fb83d', '#3a7bd5', '#2b2118', '#556b2f'];
      // clothes rails with garments hanging on them
      for (const [z, x0, x1] of [[-3.2, -7, -1], [0, -7, -1], [-3.2, 1, 5]]) {
        for (const x of [x0, x1]) r.box(x - 0.04, 0, z - 0.04, x + 0.04, 1.7, z + 0.04, '#9aa2ab', false);
        r.box(x0, 1.66, z - 0.03, x1, 1.7, z + 0.03, '#c0c6cc', false);
        r.solids.push({ x0, z0: z - 0.4, x1, z1: z + 0.4, color: '#9aa2ab' });
        w.city.addCollider(r.X(x0), r.X(x1), r.Z(z - 0.35), r.Z(z + 0.35), 1.7, 'furniture');
        for (let x = x0 + 0.25; x < x1 - 0.1; x += 0.22) {
          const c = palette[Math.floor(Math.abs(Math.sin(x * 12.9 + z * 3.1)) * palette.length)];
          r.box(x - 0.03, 0.8, z - 0.3, x + 0.03, 1.62, z + 0.3, c, false);
        }
      }
      // wall shelves of folded clothes
      for (let k = 0; k < 4; k += 1) {
        const y = 0.6 + k * 0.55;
        r.box(-8.9, y, -6.95, 0, y + 0.04, -6.45, '#e8e2d4', false);
        for (let x = -8.6; x < -0.4; x += 0.7) r.box(x, y + 0.04, -6.9, x + 0.5, y + 0.2, -6.5, palette[(Math.floor(x * 3) + k * 5 + 99) % palette.length], false);
      }
      r.solids.push({ x0: -9, z0: -7, x1: 0, z1: -6.4, color: '#e8e2d4' });
      w.city.addCollider(r.X(-9), r.X(0), r.Z(-7), r.Z(-6.4), 2.8, 'furniture');
      // mannequins on plinths by the front window, dressed in this season's looks
      const looks = [
        { ...LOOKS.kai, skin: '#d8d2c8', shirt: '#f4f4f0', jacket: '#556b2f', pants: '#c9b79c', hair: '#d8d2c8', bald: true, glasses: true },
        { ...LOOKS.kai, skin: '#d8d2c8', shirt: '#ff5fa2', pants: '#e8e4da', hair: '#d8d2c8', bald: true, sunhat: '#e9d8a6', shorts: true },
        { ...LOOKS.kai, skin: '#d8d2c8', shirt: '#1b1b1f', jacket: '#2b2118', pants: '#1b1b1f', hair: '#d8d2c8', bald: true, chain: true, beanie: '#3d405b' },
      ];
      looks.forEach((look, k) => {
        const x = -7 + k * 2.2;
        r.box(x - 0.45, 0, 5.4, x + 0.45, 0.25, 6.3, '#2a2c30');
        const m = new Human(look);
        m.animate(0, 0, 'idle');
        m.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        r.place(m.root, x, 0.25, 5.85, Math.PI + 0.2 - k * 0.2);
      });
      // the mirror and the tailor's counter
      r.box(8.85, 0.3, -2.6, 8.98, 2.6, 0.6, '#6a4c93', false);
      r.plane(8.84, 1.45, -1.0, 2.9, 2.1, -Math.PI / 2, mirrorMat);
      r.box(3.8, 0, -5.9, 8.5, 1.0, -5.0, '#6a4c93');
      r.box(3.75, 1.0, -5.95, 8.55, 1.05, -4.95, '#e8e2d4', false);
      r.person(LOOKS.tailor, 6.2, -6.4, 0);
      // two changing booths with curtains
      for (const z of [1.5, 3.5]) {
        r.box(-8.95, 0, z - 0.9, -7.4, 2.4, z - 0.85, '#e8e2d4');
        r.box(-7.45, 0.3, z - 0.85, -7.4, 2.3, z + 0.85, '#c77dff', false);
      }
      r.plane(0, 3.3, -6.98, 5.5, 0.9, 0, new THREE.MeshBasicMaterial({ map: labelTexture('THREADLINE', { bg: '#1d1f2b', fg: '#c77dff', sub: 'outfitters · since 1987', w: 512, h: 128 }) }));
      r.plant(8.2, 6.2, 1.0);
      r.plant(-8.4, 6.4, 0.8);
      r.person({ ...LOOKS.nadia, shirt: '#f2a7b7', skirt: '#1d3557', skin: '#f1c9a5', hair: '#c9a25e' }, -3, 2, 0, { role: 'civ', area: [-6, 1, 5, 4.5] });
      r.person({ ...LOOKS.kai, shirt: '#3a7bd5', glasses: true, skin: '#7a4a2e' }, 3, 3, 0, { role: 'civ', area: [-6, 1, 6, 4.5] });
      r.spot(6.2, -4.0, 1.4, () => "Press E to browse Threadline's stock", (wld) => wld.outfits.openStore());
    },
  },
};

const h = (r) => r.h;

export class Interiors {
  constructor(world) {
    this.world = world;
    this.rooms = {};
    this.current = null;
    this.doors = [];
    this.t = 0;
    Object.entries(DEFS).forEach(([key, def], i) => { this.rooms[key] = new Room(world, key, def, i); });
    // a few lamps that move into whichever room Kai is in (the light count never changes, so no
    // material has to recompile on the way through a door)
    this.lamps = [0, 1, 2].map(() => {
      const l = new THREE.PointLight('#fff1dc', 0, 22, 1.4);
      world.scene.add(l);
      return l;
    });
    for (const room of Object.values(this.rooms)) {
      const p = world.city.places[room.def.place];
      const y = world.city.groundHeight(p.x, p.z);
      const marker = new DoorMarker(world.scene, p.x, p.z, room.def.color, y, p.face || 0);
      room.door = { x: p.x, z: p.z, face: p.face || 0 };
      this.doors.push({ room, marker });
    }
  }

  get(key) { return this.rooms[key]; }

  /** The room a world point is in, if any. */
  roomAt(x, z) {
    if (x < INTERIOR.originX - 60) return null;
    return Object.values(this.rooms).find((r) => r.contains(x, z)) || null;
  }

  /** Where a world point shows on the city map: a point inside a room shows at its door. */
  toMap(x, z) {
    const r = this.roomAt(x, z);
    return r ? { x: r.door.x, z: r.door.z } : { x, z };
  }

  enter(key, opts = {}) {
    const w = this.world;
    const p = w.player;
    const room = this.rooms[key];
    if (!room || p.vehicle) return;
    if (this.current) this.exit(true);
    this.current = room;
    w.interior = room;
    room.group.visible = true;
    w.city.group.visible = false;
    w.signals.setVisible(false);
    const s = opts.at || room.spawn;
    p.place(room.ox + s.x, room.oz + s.z, s.face ?? Math.PI);
    p.vel.x = 0;
    p.vel.z = 0;
    w.rig.snap(s.face ?? Math.PI, 0.1);
    w.sky.indoor = true;
    room.lights.forEach(([lx, lz], i) => {
      const l = this.lamps[i];
      if (!l) return;
      l.position.set(room.X(lx), room.h - 0.5, room.Z(lz));
      l.color.set(room.def.lightColor || '#fff1dc');
      l.intensity = 26;
    });
    w.audio.indoor(true);
    w.audio.tune(3);
    if (!opts.silent) {
      w.hud.fade();
      w.hud.popup(room.name, room.def.color);
      w.audio.ui('door');
    }
    w.stats.visits = (w.stats.visits || 0) + 1;
  }

  exit(silent = false) {
    const w = this.world;
    const room = this.current;
    if (!room) return;
    if (w.ui) w.closeUi();
    room.group.visible = false;
    w.city.group.visible = true;
    w.signals.setVisible(true);
    this.current = null;
    w.interior = null;
    w.sky.indoor = false;
    for (const l of this.lamps) l.intensity = 0;
    w.audio.indoor(false);
    w.audio.tune(-1);
    const d = room.door;
    const p = w.player;
    p.place(d.x + Math.sin(d.face) * 1.6, d.z + Math.cos(d.face) * 1.6, d.face);
    w.rig.snap(d.face, 0.15);
    if (!silent) { w.hud.fade(); w.audio.ui('door'); }
  }

  /** The bed: save, rest six hours, wake up healed. */
  sleep() {
    const w = this.world;
    w.hour = (w.hour + 6) % 24;
    w.player.health = 100;
    const ok = w.save();
    w.hud.fade(900);
    w.hud.bigText('RESTED', ok ? 'Game saved. Six hours later...' : 'Six hours later (saving is blocked in this browser)', 3.5, '#52d273');
    w.audio.ui('select');
  }

  update(dt, input) {
    const w = this.world;
    const p = w.player;
    this.t += dt;
    for (const d of this.doors) d.marker.update(dt);
    const room = this.current;
    if (!room) {
      if (p.vehicle || p.dead || w.ui) return;
      for (const d of this.doors) {
        if (!d.marker.inside(p.pos.x, p.pos.z, 0.3)) continue;
        if (w.police.stars > 0) { w.hud.help('Lose the cops first: nobody opens up to a wanted man.'); continue; }
        w.hud.help(`Press E to go into ${d.room.name}`);
        if (input.hit('KeyE')) { input.consume('KeyE'); this.enter(d.room.key); }
      }
      return;
    }
    room.update(dt, this.t);
    if (w.ui || p.dead) return;
    const lx = p.pos.x - room.ox;
    const lz = p.pos.z - room.oz;
    if (Math.hypot(lx - room.exit.x, lz - room.exit.z) < 1.1) {
      w.hud.help('Press E to go back outside');
      if (input.hit('KeyE')) { input.consume('KeyE'); this.exit(); }
      return;
    }
    for (const s of room.spots) {
      if (Math.hypot(lx - s.x, lz - s.z) > s.r) continue;
      if (s.during) s.during(w, input);
      const text = s.text(w);
      if (text) w.hud.help(text);
      if (text && input.hit('KeyE')) { input.consume('KeyE'); s.act(w, input); }
      break;
    }
  }

  /** Door badges for the minimap and the city map. */
  blips() {
    return this.doors.map(({ room }) => ({
      x: room.door.x, z: room.door.z, color: room.def.color, kind: 'place', icon: room.def.icon, title: room.name, desc: room.def.desc, door: true,
    }));
  }
}
