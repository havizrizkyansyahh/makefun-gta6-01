// The interactive city map in the pause menu. Scroll to zoom, drag to pan, hover a marker for its
// card (the character's portrait or the place's badge, a description and the distance), click a
// marker to zoom to it or anywhere else to drop a waypoint (right-click clears it). The GPS route
// to the waypoint is drawn along the streets, here and on the minimap.
import { DISTRICTS } from './city.js';
import { CITY } from './config.js';

export class MapView {
  constructor(world, canvas, card) {
    this.world = world;
    this.canvas = canvas;
    this.card = card;
    this.g = canvas.getContext('2d');
    this.zoom = 1;
    const at = world.where();
    this.cx = 0;
    this.cz = 0;
    this.focus(at.x * 0.3, at.z * 0.3, 1);
    this.hover = null;
    this.drag = null;
    this.mouse = null;
    this.t = 0;
    this.bind();
    const loop = () => {
      if (!this.canvas.isConnected) return;
      this.t += 1 / 60;
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ view maths
  get span() { return (CITY.bounds * 2) / this.zoom; }

  /** World point to canvas pixel. */
  toScreen(x, z) {
    const S = this.canvas.width;
    return [((x - this.cx) / this.span + 0.5) * S, ((z - this.cz) / this.span + 0.5) * S];
  }

  /** Canvas pixel to world point. */
  toWorld(px, py) {
    const S = this.canvas.width;
    return [(px / S - 0.5) * this.span + this.cx, (py / S - 0.5) * this.span + this.cz];
  }

  clampView() {
    const B = CITY.bounds;
    const half = this.span / 2;
    this.cx = Math.max(-B + half, Math.min(B - half, this.cx));
    this.cz = Math.max(-B + half, Math.min(B - half, this.cz));
  }

  focus(x, z, zoom) {
    this.zoom = Math.max(1, Math.min(5, zoom));
    this.cx = x;
    this.cz = z;
    this.clampView();
  }

  zoomAt(px, py, factor) {
    const [wx, wz] = this.toWorld(px, py);
    this.zoom = Math.max(1, Math.min(5, this.zoom * factor));
    const [nx, nz] = this.toWorld(px, py);
    this.cx += wx - nx;
    this.cz += wz - nz;
    this.clampView();
  }

  // ------------------------------------------------------------ input
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.canvas.width, ((e.clientY - r.top) / r.height) * this.canvas.height];
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [x, y] = this.local(e);
      this.zoomAt(x, y, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
    c.addEventListener('mousedown', (e) => {
      const [x, y] = this.local(e);
      this.drag = { x, y, cx: this.cx, cz: this.cz, moved: 0 };
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.drag || !this.canvas.isConnected) { this.drag = null; return; }
      const d = this.drag;
      this.drag = null;
      if (d.moved > 6) return;
      if (e.button === 2) { this.world.clearWaypoint(); return; }
      if (this.hover) this.focus(this.hover.x, this.hover.z, Math.max(this.zoom, 2.6));
      else {
        const [x, y] = this.local(e);
        const [wx, wz] = this.toWorld(x, y);
        this.world.setWaypoint(wx, wz);
        this.world.audio.ui('select');
      }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousemove', (e) => {
      const [x, y] = this.local(e);
      this.mouse = { x, y };
      if (this.drag) {
        const S = this.canvas.width;
        this.drag.moved = Math.max(this.drag.moved, Math.hypot(x - this.drag.x, y - this.drag.y));
        this.cx = this.drag.cx - ((x - this.drag.x) / S) * this.span;
        this.cz = this.drag.cz - ((y - this.drag.y) / S) * this.span;
        this.clampView();
      }
    });
    c.addEventListener('mouseleave', () => { this.mouse = null; });
  }

  /** The blip nearest the mouse, within reach of its icon. */
  pick(blips) {
    if (!this.mouse) return null;
    let best = null;
    let bd = 26;
    for (const b of blips) {
      const [x, y] = this.toScreen(b.x, b.z);
      const d = Math.hypot(x - this.mouse.x, y - this.mouse.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ------------------------------------------------------------ drawing
  draw() {
    const w = this.world;
    const g = this.g;
    const S = this.canvas.width;
    const mm = w.city.minimap;
    const icons = w.hud.icons || {};
    // the map picture, cropped to the view
    const k = mm.scale;
    const sx = (this.cx - this.span / 2 + CITY.bounds) * k;
    const sy = (this.cz - this.span / 2 + CITY.bounds) * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(mm.canvas, sx, sy, this.span * k, this.span * k, 0, 0, S, S);
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // district names, while zoomed out
    if (this.zoom < 2.4) {
      const sums = {};
      for (const l of w.city.loops) {
        const d = DISTRICTS[w.city.districtAt((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2)];
        const s = sums[d.name] || (sums[d.name] = { x: 0, z: 0, n: 0, color: d.color });
        s.x += (l.x0 + l.x1) / 2; s.z += (l.z0 + l.z1) / 2; s.n += 1;
      }
      g.globalAlpha = Math.min(1, 2.4 - this.zoom);
      for (const [name, s] of Object.entries(sums)) {
        const [a, b] = this.toScreen(s.x / s.n, s.z / s.n + (name === 'Palmline Beach' ? 40 : 0));
        g.font = `italic 900 ${Math.round(S * 0.03 * Math.min(1.5, this.zoom))}px "Avenir Next Condensed", "Futura", sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(10,14,30,0.75)';
        g.strokeText(name.toUpperCase(), a, b);
        g.fillStyle = s.color;
        g.fillText(name.toUpperCase(), a, b);
      }
      g.globalAlpha = 1;
    }

    // GPS route to the waypoint
    const wp = w.waypoint;
    if (wp && wp.route && wp.route.length > 1) {
      g.lineJoin = 'round';
      g.lineCap = 'round';
      for (const [width, color] of [[11, 'rgba(10,14,30,0.8)'], [6, '#c77dff']]) {
        g.lineWidth = width;
        g.strokeStyle = color;
        g.beginPath();
        wp.route.forEach((p, i) => { const [a, b] = this.toScreen(p.x, p.z); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
        g.stroke();
      }
    }

    // police, Sun Shells
    for (const v of w.vehicles) {
      if (v.kind !== 'police' || v.dead) continue;
      const [a, b] = this.toScreen(v.pos.x, v.pos.z);
      g.fillStyle = Math.floor(this.t * 4) % 2 ? '#ff3b3b' : '#3b6bff';
      g.beginPath(); g.arc(a, b, 6, 0, Math.PI * 2); g.fill();
    }
    for (const s of w.missions.shells) {
      if (s.taken) continue;
      const [a, b] = this.toScreen(s.x, s.z);
      g.fillStyle = 'rgba(255,150,190,0.9)';
      g.beginPath(); g.arc(a, b, 4, 0, Math.PI * 2); g.fill();
    }

    // markers: portraits for people, badges for places
    const blips = w.missions.blips();
    if (wp) blips.push({ x: wp.x, z: wp.z, color: '#c77dff', kind: 'waypoint', icon: 'waypoint', title: 'Waypoint', desc: 'Your GPS route leads here. Right-click to clear it.' });
    this.hover = this.pick(blips);
    const scale = Math.min(1.5, 0.85 + this.zoom * 0.15);
    for (const bl of blips) {
      const [a, b] = this.toScreen(bl.x, bl.z);
      if (a < -40 || b < -40 || a > S + 40 || b > S + 40) continue;
      const icon = bl.icon && icons[bl.icon];
      const hovered = bl === this.hover;
      if (bl.kind === 'objective' || bl.kind === 'waypoint') {
        const pulse = 18 + Math.sin(this.t * 4) * 5;
        g.strokeStyle = bl.color;
        g.lineWidth = 3;
        g.beginPath(); g.arc(a, b, pulse * scale + 10, 0, Math.PI * 2); g.stroke();
      }
      if (icon) {
        const size = (bl.kind === 'contact' || bl.kind === 'target' ? 50 : bl.minor ? 30 : 38) * scale * (hovered ? 1.25 : 1);
        g.drawImage(icon, a - size / 2, b - size / 2, size, size);
      } else {
        g.beginPath(); g.arc(a, b, 7 * scale, 0, Math.PI * 2); g.fillStyle = 'rgba(10,14,30,0.85)'; g.fill();
        g.beginPath(); g.arc(a, b, 5 * scale, 0, Math.PI * 2); g.fillStyle = bl.color; g.fill();
      }
    }

    // Kai: his portrait, with a pointer for the way he faces
    const at = w.where();
    const heading = w.player.vehicle ? w.player.vehicle.heading : w.player.heading;
    const [a, c] = this.toScreen(at.x, at.z);
    const ang = Math.atan2(Math.cos(heading), Math.sin(heading));
    g.save();
    g.translate(a, c);
    g.rotate(ang);
    g.beginPath(); g.moveTo(40 * scale, 0); g.lineTo(22 * scale, -11 * scale); g.lineTo(22 * scale, 11 * scale); g.closePath();
    g.fillStyle = '#ffffff'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#111'; g.stroke();
    g.restore();
    if (icons.kai) {
      const size = 54 * scale;
      g.drawImage(icons.kai, a - size / 2, c - size / 2, size, size);
    }

    // north and scale
    g.fillStyle = 'rgba(10,14,30,0.7)';
    g.fillRect(S - 70, 16, 54, 64);
    g.fillStyle = '#fff';
    g.font = 'bold 20px sans-serif';
    g.fillText('N', S - 43, 66);
    g.beginPath(); g.moveTo(S - 43, 22); g.lineTo(S - 33, 48); g.lineTo(S - 53, 48); g.closePath(); g.fill();
    const m100 = (100 / this.span) * S;
    g.fillStyle = 'rgba(10,14,30,0.7)';
    g.fillRect(16, S - 46, m100 + 24, 30);
    g.fillStyle = '#fff';
    g.fillRect(28, S - 26, m100, 4);
    g.font = 'bold 13px sans-serif';
    g.fillText('100 m', 28 + m100 / 2, S - 36);

    this.updateCard(this.hover);
  }

  /** The info card next to the hovered marker. */
  updateCard(bl) {
    const card = this.card;
    if (!bl || this.drag) { card.style.display = 'none'; this.cardFor = null; return; }
    const [a, b] = this.toScreen(bl.x, bl.z);
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / this.canvas.width;
    card.style.display = 'flex';
    card.style.left = `${Math.min(rect.width - 330, a * k + 26)}px`;
    card.style.top = `${Math.max(8, b * k - 50)}px`;
    if (this.cardFor === bl.title) return;
    this.cardFor = bl.title;
    const at = this.world.where();
    const d = Math.round(Math.hypot(bl.x - at.x, bl.z - at.z));
    const url = bl.icon && this.world.hud.iconURL(bl.icon);
    card.innerHTML = `${url ? `<img src="${url}">` : `<i style="background:${bl.color}"></i>`}<div><b>${bl.title || ''}</b><span>${bl.desc || ''}</span><em>${d} m away · click to zoom</em></div>`;
  }
}
