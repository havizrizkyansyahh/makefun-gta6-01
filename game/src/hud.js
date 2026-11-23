// The heads-up display, drawn with plain DOM over the canvas: cash, wanted stars, weapon and
// ammo, clock, the rotating minimap with health and armour bars, the mission objective and
// timer, subtitles, help prompts, the gun counter's list, the shop and workshop screens,
// pop-up notices, district / vehicle / radio names, the speedometer, big mission and WASTED
// titles, the damage vignette, the door fade and the crosshair. Indoors the minimap turns into
// the room's floor plan.
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
    e.panel = $('div', 'hud-panel', root);
    e.fade = $('div', 'hud-fade', root);
    e.notes = $('div', 'hud-notes', root);
    e.big = $('div', 'hud-big', root);
    e.bigT = $('div', 'b-title', e.big);
    e.bigS = $('div', 'b-sub', e.big);
    const br = e.br = $('div', 'hud-br', root);
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
    this.panelSpec = null;
  }

  help(text) { this.helpText = text; }
  shop(items, title = 'COASTLINE ARMS') { this.shopItems = items; this.shopTitle = title; }

  /**
   * A shop or workshop screen for this frame: { title, color, subtitle, tabs, tab, rows: [{
   * label, value, right, sel, dim, good, swatch }], foot }. Redrawn only when it changes.
   */
  panel(spec) { this.panelSpec = spec; }

  /** A quick dip to black and back (walking through a door, sleeping). */
  fade(ms = 380) {
    const f = this.el.fade;
    f.style.transition = 'none';
    f.style.opacity = '1';
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`;
    f.style.opacity = '0';
  }

  drawPanel() {
    const e = this.el;
    const s = this.panelSpec;
    if (!s) {
      if (this.lastPanel) { e.panel.style.display = 'none'; this.lastPanel = ''; }
      return;
    }
    const tabs = s.tabs ? `<div class="p-tabs">${s.tabs.map((t, i) => `<span class="${i === s.tab ? 'on' : ''}">${t}</span>`).join('')}</div>` : '';
    const rows = s.rows.map((r) => `<div class="p-row${r.sel ? ' sel' : ''}${r.dim ? ' dim' : ''}${r.good ? ' good' : ''}">${r.swatch ? `<i style="background:${r.swatch}"></i>` : ''}<span>${r.label}</span>${r.value ? `<b>${r.value}</b>` : ''}<em>${r.right || ''}</em></div>`).join('');
    const html = `<div class="p-title" style="color:${s.color}">${s.title}</div>${s.subtitle ? `<div class="p-sub">${s.subtitle}</div>` : ''}${tabs}<div class="p-rows">${rows}</div><div class="p-foot">${s.foot || ''}</div>`;
    if (html === this.lastPanel) return;
    this.lastPanel = html;
    e.panel.style.display = 'block';
    e.panel.style.borderTopColor = s.color;
    e.panel.innerHTML = html;
  }

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
    let t = w.missions.timer;
    if (t === null || t === undefined) t = w.activities.timer();
    if (t === null || t === undefined) t = w.garage.timer();
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

    let help = w.ui ? null : this.helpText;
    if (!help && !p.vehicle && !p.dead && !w.ui) {
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
      const html = `<div class="s-title">${this.shopTitle}</div>${this.shopItems.map((i) => `<div class="s-row${w.money < i.price ? ' poor' : ''}"><kbd>${i.key}</kbd><span>${i.label}</span><em>$${i.price.toLocaleString('en-US')}</em></div>`).join('')}<div class="s-foot">Press a number to buy</div>`;
      if (html !== this.lastShop) { e.shop.innerHTML = html; this.lastShop = html; }
    } else { e.shop.style.display = 'none'; this.lastShop = ''; }
    this.drawPanel();
    // a shop screen owns the right-hand side: the speedometer and the radio name step aside
    e.br.style.visibility = w.ui ? 'hidden' : '';
    this.weapons.panel.style.visibility = w.ui ? 'hidden' : '';

    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) e.big.classList.remove('on'); }
    if (this.popT > 0) { this.popT -= dt; if (this.popT <= 0) e.popup.classList.remove('on'); }
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) e.radio.classList.remove('on'); }

    if (p.vehicle) {
      e.speed.style.display = '';
      const kmh = Math.round(Math.abs(p.vehicle.forward) * 3.6);
      const hp = Math.round(p.vehicle.health);
      e.speed.innerHTML = `<b>${kmh}</b><span>km/h</span><div class="v-hp"><i style="width:${hp}%;background:${hp < 30 ? '#ff5252' : '#ffd23f'}"></i></div>`;
    } else e.speed.style.display = 'none';

    e.cross.style.display = !p.dead && !w.ui && p.current !== 'fist' && (!p.vehicle || p.aiming) ? '' : 'none';
    e.cross.classList.toggle('aim', p.aiming);
    e.vignette.style.opacity = Math.min(1, p.hurtFlash * 2.5 + (p.health < 25 ? 0.35 + Math.sin(w.time * 5) * 0.15 : 0));
    this.drawMinimap();
  }

  /** Map coordinates (canvas pixels of the city picture) for a world point. */
  mapPoint(x, z) {
    const mm = this.world.city.minimap;
    return [(x + CITY.bounds) * mm.scale, (z + CITY.bounds) * mm.scale];
  }

  /** Indoors the minimap becomes the room's floor plan: walls, furniture, people, the way out. */
  drawRoomPlan(room) {
    const w = this.world;
    const g = this.el.mapCtx;
    const S = this.el.map.width;
    const R = S / 2;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(R, R, R - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#141a2a';
    g.fillRect(0, 0, S, S);
    const k = (S * 0.7) / Math.max(room.w, room.d);
    const P = (lx, lz) => [R + lx * k, R + lz * k];
    const [x0, z0] = P(-room.w / 2, -room.d / 2);
    g.fillStyle = '#3a4258';
    g.fillRect(x0, z0, room.w * k, room.d * k);
    g.strokeStyle = room.def.color;
    g.lineWidth = 3;
    g.strokeRect(x0, z0, room.w * k, room.d * k);
    g.fillStyle = 'rgba(200,210,230,0.45)';
    for (const s of room.solids) {
      const [a, b] = P(s.x0, s.z0);
      g.fillRect(a, b, (s.x1 - s.x0) * k, (s.z1 - s.z0) * k);
    }
    // the door
    const [ex, ez] = P(room.exit.x, room.exit.z);
    g.fillStyle = '#3dff8b';
    g.fillRect(ex - 8, ez + 4, 16, 5);
    // things to do in here
    for (const s of room.spots) {
      const [a, b] = P(s.x, s.z);
      g.beginPath(); g.arc(a, b, 4, 0, Math.PI * 2);
      g.fillStyle = '#ffd23f';
      g.fill();
    }
    for (const n of w.npcs) {
      if (n.dead || !room.contains(n.pos.x, n.pos.z)) continue;
      const [a, b] = P(n.pos.x - room.ox, n.pos.z - room.oz);
      g.beginPath(); g.arc(a, b, 3.5, 0, Math.PI * 2);
      g.fillStyle = n.role === 'saint' ? '#ff4d4d' : n.invulnerable ? '#7ff7e6' : '#cfd6e0';
      g.fill();
    }
    for (const b of w.missions.blips()) {
      if (b.kind !== 'objective' || !room.contains(b.x, b.z)) continue;
      const [a, c] = P(b.x - room.ox, b.z - room.oz);
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2;
      g.beginPath(); g.arc(a, c, 7 + Math.sin(w.time * 5) * 2, 0, Math.PI * 2); g.stroke();
    }
    const p = w.player;
    const [px, pz] = P(p.pos.x - room.ox, p.pos.z - room.oz);
    g.translate(px, pz);
    g.rotate(-p.heading + Math.PI);
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
    g.fillStyle = '#ffffff';
    g.fill();
    g.restore();
    g.fillStyle = '#ffffff';
    g.font = 'bold 12px "Avenir Next", sans-serif';
    g.textAlign = 'center';
    g.fillText(room.name.toUpperCase(), R, S - 26);
  }

  drawMinimap() {
    const w = this.world;
    if (w.interior) { this.drawRoomPlan(w.interior); return; }
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
    // GPS route to the waypoint, drawn in map space so it turns with the map
    const wp = w.waypoint;
    if (wp && wp.route.length > 1) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [width, color] of [[14, 'rgba(10,14,30,0.8)'], [8, '#c77dff']]) {
        g.lineWidth = width / zoom;
        g.strokeStyle = color;
        g.beginPath();
        wp.route.forEach((pt, i) => { const [mx, mz] = this.mapPoint(pt.x, pt.z); if (i) g.lineTo(mx, mz); else g.moveTo(mx, mz); });
        g.stroke();
      }
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
    const dot = (x, z, color, size = 5, edge = false, label = null, icon = null) => {
      let [sx, sz] = toScreen(x, z);
      const dx = sx - R;
      const dz = sz - R;
      const d = Math.hypot(dx, dz);
      if (d > R - 10) {
        if (!edge) return;
        sx = R + (dx / d) * (R - 10);
        sz = R + (dz / d) * (R - 10);
      }
      if (icon && this.icons && this.icons[icon]) {
        const s2 = size * 3.6;
        g.drawImage(this.icons[icon], sx - s2 / 2, sz - s2 / 2, s2, s2);
        return;
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
    const blips = w.missions.blips();
    if (wp) blips.push({ x: wp.x, z: wp.z, color: '#c77dff', kind: 'waypoint', icon: 'waypoint', edge: true });
    for (const b of blips) {
      const size = b.kind === 'enemy' ? 4 : b.kind === 'contact' || b.kind === 'target' ? 8 : b.minor ? 5 : 6.5;
      dot(b.x, b.z, b.color, size, !!b.edge, b.label || null, b.icon || null);
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

  /** Portraits and pictograms (portraits.js), and their data URLs for HTML cards. */
  setIcons(icons) {
    this.icons = icons;
    this.iconURLs = {};
  }

  iconURL(key) {
    if (!this.icons || !this.icons[key]) return '';
    if (!this.iconURLs[key]) this.iconURLs[key] = this.icons[key].toDataURL();
    return this.iconURLs[key];
  }


}
