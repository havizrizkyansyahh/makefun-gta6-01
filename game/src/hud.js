// The heads-up display, drawn with plain DOM over the canvas: cash, wanted stars, weapon and
// ammo, clock, the rotating minimap with health and armour bars, the mission objective and
// timer, subtitles, help prompts, the gun shop list, pop-up notices, district / vehicle / radio
// names, the speedometer, big mission and WASTED titles, the damage vignette and the crosshair.
// It also paints the full-screen city map for the pause menu.
import { WeaponHud } from './weaponui.js';
import { DISTRICTS } from './city.js';
import { CITY } from './config.js';

const $ = (tag, cls, parent, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = '';
    this.el = {};
    const e = this.el;
    e.vignette = $('div', 'hud-vignette', root);
    e.cross = $('div', 'hud-cross', root);
    const tr = $('div', 'hud-tr', root);
    e.clock = $('div', 'hud-clock', tr);
    e.stars = $('div', 'hud-stars', tr);
    e.starList = [];
    for (let i = 0; i < 5; i += 1) e.starList.push($('span', 'star', e.stars, '&#9733;'));
    e.money = $('div', 'hud-money', tr);
    this.weapons = new WeaponHud(tr, root);

    const bl = $('div', 'hud-bl', root);
    e.mapWrap = $('div', 'hud-map', bl);
    e.map = $('canvas', '', e.mapWrap);
    e.map.width = e.map.height = 236;
    e.mapCtx = e.map.getContext('2d');
    const bars = $('div', 'hud-bars', bl);
    e.hp = $('div', 'bar hp', bars, '<i></i>');
    e.ar = $('div', 'bar ar', bars, '<i></i>');

    e.obj = $('div', 'hud-obj', root);
    e.objTitle = $('div', 'o-title', e.obj);
    e.objText = $('div', 'o-text', e.obj);
    e.timer = $('div', 'hud-timer', root);
    e.sub = $('div', 'hud-sub', root);
    e.help = $('div', 'hud-help', root);
    e.shop = $('div', 'hud-shop', root);
    e.notes = $('div', 'hud-notes', root);
    e.big = $('div', 'hud-big', root);
    e.bigT = $('div', 'b-title', e.big);
    e.bigS = $('div', 'b-sub', e.big);
    const br = $('div', 'hud-br', root);
    e.popup = $('div', 'hud-popup', br);
    e.radio = $('div', 'hud-radio', br);
    e.speed = $('div', 'hud-speed', br);

    this.popT = 0;
    this.radioT = 0;
    this.bigT = 0;
    this.helpText = null;
    this.shopItems = null;
    this.world = null;
    this.visible = true;
  }

  attach(world) { this.world = world; }

  show(on) {
    this.visible = on;
    this.root.style.display = on ? '' : 'none';
  }

  frameStart() {
    this.helpText = null;
    this.shopItems = null;
  }

  help(text) { this.helpText = text; }
  shop(items) { this.shopItems = items; }

  notify(text) {
    const n = $('div', 'note', this.el.notes, text);
    setTimeout(() => n.classList.add('out'), 3200);
    setTimeout(() => n.remove(), 3800);
    while (this.el.notes.children.length > 4) this.el.notes.firstChild.remove();
  }

  bigText(title, sub = '', time = 3, color = '#ffffff', grim = false) {
    this.el.bigT.textContent = title;
    this.el.bigT.style.color = color;
    this.el.bigS.textContent = sub;
    this.el.big.classList.toggle('grim', grim);
    this.el.big.classList.add('on');
    this.bigT = time;
  }

  district(key) {
    const d = DISTRICTS[key];
    this.popup.call(this, d.name, d.color);
  }

  vehicleName(name) { this.popup(name, '#ffffff'); }

  popup(text, color) {
    this.el.popup.textContent = text;
    this.el.popup.style.color = color;
    this.el.popup.classList.add('on');
    this.popT = 3;
  }

  radio(st) {
    this.el.radio.innerHTML = st ? `<b>${st.name}</b><span>${st.tag}</span>` : '<b>RADIO OFF</b>';
    this.el.radio.classList.add('on');
    this.radioT = 3;
  }

  weaponChanged() { this.weapons.stripT = 2.5; }

  update(dt) {
    const w = this.world;
    const p = w.player;
    const e = this.el;
    if (!this.visible) return;
    e.money.textContent = `$${Math.floor(w.money).toLocaleString('en-US').padStart(8, '0')}`;
    const h = Math.floor(w.hour);
    const m = Math.floor((w.hour % 1) * 60);
    e.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const stars = w.police.stars;
    const blink = w.police.stars > 0 && !w.police.seen && Math.floor(w.time * 3) % 2 === 0;
    e.starList.forEach((s, i) => {
      s.classList.toggle('on', i < stars);
      s.classList.toggle('blink', i < stars && (blink || w.police.flash > 0));
    });
    this.weapons.update(p, dt);
    e.hp.firstChild.style.width = `${Math.max(0, p.health)}%`;
    e.hp.classList.toggle('low', p.health < 30);
    e.ar.firstChild.style.width = `${Math.max(0, p.armor)}%`;
    e.ar.style.opacity = p.armor > 0 ? 1 : 0.35;

    const obj = w.missions.objective();
    e.obj.style.display = obj ? '' : 'none';
    if (obj) {
      e.objTitle.textContent = obj.title;
      e.objText.textContent = obj.text;
    }
    const t = w.missions.timer;
    e.timer.style.display = t !== null && t !== undefined ? '' : 'none';
    if (t !== null && t !== undefined) {
      const s = Math.max(0, Math.ceil(t));
      e.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      e.timer.classList.toggle('low', s < 10);
    }
    const line = w.missions.lines[0];
    if (line) {
      e.sub.style.display = '';
      e.sub.innerHTML = `<b style="color:${line.who.color}">${line.who.name}</b> ${line.text}`;
    } else e.sub.style.display = 'none';

    let help = this.helpText;
    if (!help && !p.vehicle && !p.dead) {
      for (const v of w.vehicles) {
        if (!v.dead && !v.locked && Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z) < 4.2) {
          help = v.driver ? `Press F to steal the ${v.spec.name}` : `Press F to get in the ${v.spec.name}`;
          break;
        }
      }
    }
    e.help.style.display = help ? '' : 'none';
    if (help) e.help.textContent = help;
    if (this.shopItems) {
      e.shop.style.display = '';
      e.shop.innerHTML = `<div class="s-title">COASTLINE ARMS</div>${this.shopItems.map((i) => `<div class="s-row${w.money < i.price ? ' poor' : ''}"><kbd>${i.key}</kbd><span>${i.label}</span><em>$${i.price}</em></div>`).join('')}<div class="s-foot">Press a number to buy</div>`;
    } else e.shop.style.display = 'none';

    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) e.big.classList.remove('on'); }
    if (this.popT > 0) { this.popT -= dt; if (this.popT <= 0) e.popup.classList.remove('on'); }
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) e.radio.classList.remove('on'); }

    if (p.vehicle) {
      e.speed.style.display = '';
      const kmh = Math.round(Math.abs(p.vehicle.forward) * 3.6);
      const hp = Math.round(p.vehicle.health);
      e.speed.innerHTML = `<b>${kmh}</b><span>km/h</span><div class="v-hp"><i style="width:${hp}%;background:${hp < 30 ? '#ff5252' : '#ffd23f'}"></i></div>`;
    } else e.speed.style.display = 'none';

    e.cross.style.display = !p.dead && p.current !== 'fist' && (!p.vehicle || p.aiming) ? '' : 'none';
    e.cross.classList.toggle('aim', p.aiming);
    e.vignette.style.opacity = Math.min(1, p.hurtFlash * 2.5 + (p.health < 25 ? 0.35 + Math.sin(w.time * 5) * 0.15 : 0));
    this.drawMinimap();
  }

  /** Map coordinates (canvas pixels of the city picture) for a world point. */
  mapPoint(x, z) {
    const mm = this.world.city.minimap;
    return [(x + CITY.bounds) * mm.scale, (z + CITY.bounds) * mm.scale];
  }

  drawMinimap() {
    const w = this.world;
    const g = this.el.mapCtx;
    const S = this.el.map.width;
    const R = S / 2;
    const mm = w.city.minimap;
    const at = w.where();
    const speed = w.player.vehicle ? w.player.vehicle.speed : 0;
    const range = 120 + Math.min(110, speed * 3);    // world metres from centre to edge
    const zoom = R / (range * mm.scale);
    const yaw = w.rig.yaw;
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#2a8fb8';
    g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(rot);
    g.scale(zoom, zoom);
    const [px, pz] = this.mapPoint(at.x, at.z);
    g.translate(-px, -pz);
    g.imageSmoothingEnabled = true;
    g.drawImage(mm.canvas, 0, 0);
    // police search area
    const pol = w.police;
    if (pol.stars > 0 && !pol.seen) {
      const [sx, sz] = this.mapPoint(pol.lastSeen.x, pol.lastSeen.z);
      g.beginPath();
      g.arc(sx, sz, 90 * mm.scale * (1 + pol.stars * 0.3), 0, Math.PI * 2);
      g.fillStyle = Math.floor(w.time * 2) % 2 ? 'rgba(255,60,60,0.22)' : 'rgba(80,120,255,0.22)';
      g.fill();
    }
    g.restore();

    const toScreen = (x, z) => {
      const [mx, mz] = this.mapPoint(x, z);
      const dx = (mx - px) * zoom;
      const dz = (mz - pz) * zoom;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      return [R + dx * c - dz * s, R + dx * s + dz * c];
    };
    const dot = (x, z, color, size = 5, edge = false, label = null) => {
      let [sx, sz] = toScreen(x, z);
      const dx = sx - R;
      const dz = sz - R;
      const d = Math.hypot(dx, dz);
      if (d > R - 10) {
        if (!edge) return;
        sx = R + (dx / d) * (R - 10);
        sz = R + (dz / d) * (R - 10);
      }
      g.beginPath();
      g.arc(sx, sz, size, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.stroke();
      if (label) {
        g.fillStyle = '#111';
        g.font = 'bold 9px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, sx, sz + 0.5);
      }
    };
    for (const b of w.missions.blips()) {
      dot(b.x, b.z, b.color, b.kind === 'enemy' ? 4 : b.kind === 'place' ? 6.5 : 7, !!b.edge, b.label || null);
    }
    for (const v of w.vehicles) {
      if (v.kind === 'police' && !v.dead) dot(v.pos.x, v.pos.z, Math.floor(w.time * 4) % 2 ? '#ff3b3b' : '#3b6bff', 4.5, w.police.stars > 0);
    }
    for (const n of w.npcs) if (n.role === 'cop' && !n.dead) dot(n.pos.x, n.pos.z, '#7aa2ff', 3);
    // player arrow
    const heading = w.player.vehicle ? w.player.vehicle.heading : w.player.heading;
    const a = Math.atan2(Math.cos(heading), Math.sin(heading)) + rot;
    g.save();
    g.translate(R, R);
    g.rotate(a + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.strokeStyle = '#111';
    g.lineWidth = 2;
    g.stroke();
    g.restore();
    // north marker on the rim
    const nAng = rot - Math.PI / 2;
    g.fillStyle = '#ffffff';
    g.font = 'bold 13px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', R + Math.cos(nAng) * (R - 13), R + Math.sin(nAng) * (R - 13));
  }

  /** The whole-city map for the pause menu: districts, every blip, the player, north and scale. */
  drawBigMap(canvas) {
    const w = this.world;
    const g = canvas.getContext('2d');
    const mm = w.city.minimap;
    const S = canvas.width;
    const k = S / mm.size;
    g.imageSmoothingQuality = 'high';
    g.drawImage(mm.canvas, 0, 0, S, S);
    const P = (x, z) => { const [a, b] = this.mapPoint(x, z); return [a * k, b * k]; };
    // district names over the middle of their blocks
    const sums = {};
    for (const l of w.city.loops) {
      const d = DISTRICTS[w.city.districtAt((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2)];
      const s = sums[d.name] || (sums[d.name] = { x: 0, z: 0, n: 0, color: d.color });
      s.x += (l.x0 + l.x1) / 2; s.z += (l.z0 + l.z1) / 2; s.n += 1;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [name, s] of Object.entries(sums)) {
      const [a, b] = P(s.x / s.n, s.z / s.n + (name === 'Palmline Beach' ? 40 : 0));
      g.font = `italic 900 ${Math.round(S * 0.03)}px "Avenir Next Condensed", "Futura", sans-serif`;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(10,14,30,0.75)';
      g.strokeText(name.toUpperCase(), a, b);
      g.fillStyle = s.color;
      g.fillText(name.toUpperCase(), a, b);
    }
    // the bay itself
    g.font = `italic 700 ${Math.round(S * 0.026)}px "Avenir Next", sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('S O L M A R A   B A Y', S * 0.5, S * 0.93);
    // police
    for (const v of w.vehicles) {
      if (v.kind !== 'police' || v.dead) continue;
      const [a, b] = P(v.pos.x, v.pos.z);
      g.fillStyle = '#ff3b3b';
      g.beginPath(); g.arc(a, b, 5, 0, Math.PI * 2); g.fill();
    }
    // blips: places, contacts, objectives, enemies
    for (const bl of w.missions.blips()) {
      const [a, b] = P(bl.x, bl.z);
      const r = bl.kind === 'enemy' ? 5 : bl.kind === 'objective' ? 11 : 12;
      g.beginPath(); g.arc(a, b, r + 2.5, 0, Math.PI * 2); g.fillStyle = 'rgba(10,14,30,0.85)'; g.fill();
      g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.fillStyle = bl.color; g.fill();
      if (bl.kind === 'objective') {
        g.strokeStyle = bl.color; g.lineWidth = 3;
        g.beginPath(); g.arc(a, b, r + 8, 0, Math.PI * 2); g.stroke();
      }
      if (bl.label) { g.fillStyle = '#111'; g.font = `bold ${Math.round(r * 1.2)}px sans-serif`; g.fillText(bl.label, a, b + 1); }
    }
    // Sun Shells still to find, as faint pink dots
    for (const s of w.missions.shells) {
      if (s.taken) continue;
      const [a, b] = P(s.x, s.z);
      g.fillStyle = 'rgba(255,150,190,0.8)';
      g.beginPath(); g.arc(a, b, 3.5, 0, Math.PI * 2); g.fill();
    }
    // the player: a white arrow pointing the way Kai faces
    const at = w.where();
    const heading = w.player.vehicle ? w.player.vehicle.heading : w.player.heading;
    const [a, c] = P(at.x, at.z);
    g.save();
    g.translate(a, c);
    g.rotate(Math.atan2(Math.cos(heading), Math.sin(heading)) + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath();
    g.fillStyle = '#ffffff'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#111'; g.stroke();
    g.restore();
    // north arrow and scale bar
    g.fillStyle = 'rgba(10,14,30,0.7)';
    g.fillRect(S - 70, 16, 54, 64);
    g.fillStyle = '#fff';
    g.font = 'bold 20px sans-serif';
    g.fillText('N', S - 43, 66);
    g.beginPath(); g.moveTo(S - 43, 22); g.lineTo(S - 33, 48); g.lineTo(S - 53, 48); g.closePath(); g.fill();
    const m200 = 200 * mm.scale * k;
    g.fillStyle = 'rgba(10,14,30,0.7)';
    g.fillRect(16, S - 46, m200 + 24, 30);
    g.fillStyle = '#fff';
    g.fillRect(28, S - 26, m200, 4);
    g.font = 'bold 13px sans-serif';
    g.fillText('200 m', 28 + m200 / 2, S - 36);
  }

}
