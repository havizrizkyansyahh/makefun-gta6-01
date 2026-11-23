// Side activities beyond the courier runs, taxi fares and the Bayside Run:
//
// The Coastline Arms range. Step into booth 4 behind the gun shop, pay the range officer and
// for forty seconds boards pop up down six lanes at three distances. Orange boards score by the
// ring hit (and score more at the far line, and for a quick shot); blue "hostage" boards cost
// points. Medals pay out, and the best score is kept.
//
// The Buoy Run. Bring any boat to the orange start beam off the end of the pier and press E: a
// timed lap around nine channel buoys out in the bay and back, with medal times.
//
// Sol y Sal deliveries (deliveries.js): taco orders on Nadia's bike, before the food goes cold.
import * as THREE from '../vendor/three.module.min.js';
import { Marker } from './markers.js';
import { Buoy } from './boats.js';
import { rayDisc, WEAPONS } from './combat.js';
import { RANGE, BUOY_RUN } from './config.js';
import { PIER } from './city.js';
import { formatTime, dollars } from './rng.js';
import { Deliveries } from './deliveries.js';

/** Paint a target face: concentric rings, or the blue no-shoot board. */
function targetFace(friendly) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (friendly) {
    g.fillStyle = '#2f6fb0';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(64, 46, 18, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(64, 104, 34, 30, 0, Math.PI, 0); g.fill();
    g.strokeStyle = '#ffd23f';
    g.lineWidth = 8;
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
  } else {
    const rings = [[64, '#f4f1ea'], [52, '#ff7043'], [38, '#f4f1ea'], [26, '#ff7043'], [12, '#1d1f2b']];
    for (const [r, cc] of rings) { g.fillStyle = cc; g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const BOARD_R = 0.42;
const BOARD_Y = 1.35;

export class ShootingRange {
  constructor(world) {
    this.world = world;
    this.room = world.interiors.get('gunshop');
    this.best = 0;
    this.medal = null;
    this.active = null;
    this.targets = [];
    const room = this.room;
    const boardGeo = new THREE.CylinderGeometry(BOARD_R, BOARD_R, 0.04, 28);
    boardGeo.rotateX(Math.PI / 2);
    const postGeo = new THREE.BoxGeometry(0.06, BOARD_Y, 0.06);
    postGeo.translate(0, BOARD_Y / 2, 0);
    const edge = new THREE.MeshStandardMaterial({ color: '#c9b79c', roughness: 0.8 });
    const post = new THREE.MeshStandardMaterial({ color: '#3a3d42', roughness: 0.6, metalness: 0.4 });
    const faces = { foe: new THREE.MeshStandardMaterial({ map: targetFace(false), roughness: 0.85 }), friend: new THREE.MeshStandardMaterial({ map: targetFace(true), roughness: 0.85 }) };
    for (let lane = 0; lane < 6; lane += 1) {
      const lx = -7 + (lane + 0.5) * (14 / 6);
      for (const [k, lz] of [[0, -5.5], [1, -9.5], [2, -14]]) {
        const pivot = new THREE.Group();
        const board = new THREE.Mesh(boardGeo, [edge, faces.foe, faces.foe]);
        board.position.y = BOARD_Y;
        board.castShadow = true;
        const stand = new THREE.Mesh(postGeo, post);
        pivot.add(board, stand);
        room.place(pivot, lx, 0, lz);
        pivot.rotation.x = -Math.PI / 2;
        this.targets.push({ pivot, board, faces, lane, row: k, x: room.X(lx), z: room.Z(lz), up: 0, want: 0, life: 0, friendly: false, raisedAt: 0 });
      }
    }
  }

  prompt() {
    const w = this.world;
    if (this.active) return null;
    if (w.missions.busy()) return 'The range is closed while you are on a job.';
    if (w.player.current === 'fist') return 'Draw a gun first (Q, 1-5 or the wheel), then press E to shoot the range';
    return `Press E to start a range session (${dollars(RANGE.fee)})${this.best ? ` · best ${this.best}` : ''}`;
  }

  start() {
    const w = this.world;
    const p = w.player;
    if (this.active || w.missions.busy() || p.current === 'fist') return;
    if (w.money < RANGE.fee) { w.hud.notify('Not enough cash for a session.'); return; }
    w.money -= RANGE.fee;
    // the range officer tops the magazine up and hands over two more
    const spec = WEAPONS[p.current];
    p.weapons[p.current].ammo += spec.mag * 2;
    p.reload(true);
    this.active = { time: RANGE.seconds, score: 0, hits: 0, shots: 0, foul: 0, next: 1.2, t: 0, streak: 0 };
    for (const t of this.targets) { t.want = 0; t.life = 0; }
    this.room.rangeLight.color.set('#ff3b3b');
    w.hud.bigText('RANGE IS HOT', 'Orange boards score. Leave the blue ones alone.', 2.5, '#ff7043');
    w.audio.ui('buzzer');
  }

  finish(reason = null) {
    const w = this.world;
    const s = this.active;
    this.active = null;
    for (const t of this.targets) t.want = 0;
    this.room.rangeLight.color.set('#3dff8b');
    w.audio.ui('buzzer');
    if (reason) { w.hud.notify(reason); return; }
    const medal = RANGE.medals.find((m) => s.score >= m.score);
    const accuracy = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const record = s.score > this.best;
    if (record) this.best = s.score;
    if (medal) {
      const better = !this.medal || RANGE.medals.indexOf(medal) < RANGE.medals.findIndex((m) => m.name === this.medal);
      if (better) this.medal = medal.name;
      w.money += medal.prize;
      w.hud.bigText(`${medal.name.toUpperCase()} MEDAL`, `Score ${s.score} · ${accuracy}% accuracy · +${dollars(medal.prize)}${record ? ' · new best' : ''}`, 5, medal.color);
      w.audio.ui('pass');
    } else {
      w.hud.bigText('NO MEDAL', `Score ${s.score} · ${accuracy}% accuracy · bronze needs ${RANGE.medals[2].score}`, 4.5, '#ffffff');
      w.audio.ui('fail');
    }
    w.stats.rangeBest = this.best;
  }

  update(dt) {
    const w = this.world;
    const s = this.active;
    for (const t of this.targets) {
      t.up += Math.sign(t.want - t.up) * Math.min(Math.abs(t.want - t.up), dt * 6);
      t.pivot.rotation.x = -Math.PI / 2 * (1 - t.up);
      if (t.want > 0) {
        t.life -= dt;
        if (t.life <= 0) {
          t.want = 0;
          if (s && !t.friendly) s.streak = 0;
        }
      }
    }
    if (!s) return;
    if (w.interior !== this.room || w.player.dead) { this.finish('Range session abandoned.'); return; }
    s.t += dt;
    s.time -= dt;
    if (s.time <= 0) { this.finish(); return; }
    s.next -= dt;
    if (s.next <= 0) {
      // pop one or two boards; they stay up for less time as the session goes on
      const idle = this.targets.filter((t) => t.want === 0 && t.up < 0.05);
      const n = Math.random() < 0.35 ? 2 : 1;
      for (let k = 0; k < n && idle.length; k += 1) {
        const t = idle.splice(Math.floor(Math.random() * idle.length), 1)[0];
        t.friendly = Math.random() < 0.2;
        const mat = t.friendly ? t.faces.friend : t.faces.foe;
        t.board.material = [t.board.material[0], mat, mat];
        t.want = 1;
        t.life = 2.6 - (s.t / RANGE.seconds) * 1.1 + t.row * 0.3;
        t.raisedAt = s.t;
      }
      s.next = 0.75 + Math.random() * 0.6 - (s.t / RANGE.seconds) * 0.3;
    }
  }

  /** A shot down the range: the first raised board in its path takes it. Returns { t } or null. */
  onShot(ox, oy, oz, dx, dy, dz, wallT) {
    const s = this.active;
    if (!s) return null;
    if (this.world.interior !== this.room) return null;
    s.shots += 1;
    let best = null;
    for (const t of this.targets) {
      if (t.up < 0.85 || t.want === 0) continue;
      const hit = rayDisc(ox, oy, oz, dx, dy, dz, t.x, BOARD_Y, t.z, BOARD_R);
      if (hit && hit.t < wallT + 0.05 && (!best || hit.t < best.hit.t)) best = { t, hit };
    }
    if (!best) { s.streak = 0; return null; }
    const { t, hit } = best;
    const w = this.world;
    t.want = 0;
    t.life = 0;
    w.fx.spawn('chip', t.x, BOARD_Y, t.z + 0.05, 6);
    if (t.friendly) {
      s.score = Math.max(0, s.score - 20);
      s.foul += 1;
      s.streak = 0;
      w.audio.ui('miss');
      w.hud.notify('Hostage board! -20');
      return { t: hit.t };
    }
    const r = hit.d / BOARD_R;
    let pts = r < 0.2 ? 10 : r < 0.42 ? 7 : r < 0.62 ? 5 : 3;
    if (t.row === 2) pts = Math.round(pts * 1.5);
    if (s.t - t.raisedAt < 0.7) pts += 3;
    s.streak += 1;
    if (s.streak >= 5) pts += 2;
    s.score += pts;
    s.hits += 1;
    w.audio.ui('target');
    return { t: hit.t };
  }

  objective() {
    const s = this.active;
    if (!s) return null;
    const next = RANGE.medals.slice().reverse().find((m) => s.score < m.score);
    return { title: `Coastline Arms range · score ${s.score}`, text: next ? `${next.score - s.score} more for ${next.name.toLowerCase()}.${s.streak >= 3 ? `  Streak ${s.streak}!` : ''}` : 'Gold pace. Keep it up.' };
  }

  timer() { return this.active ? this.active.time : null; }
}

/** The Buoy Run course: offsets from the end of the pier, out round the bay and back. */
const COURSE = [[70, 40], [140, 120], [92, 232], [-20, 300], [-150, 252], [-232, 150], [-170, 62], [-80, 30], [22, 14]];

export class BuoyRun {
  constructor(world) {
    this.world = world;
    const st = world.city.places.buoyRun;
    this.start = st;
    this.marker = new Marker(world.scene, st.x, st.z, '#ff9f1c', 3.4, 0);
    this.buoys = COURSE.map(([dx, dz], i) => new Buoy(world.scene, PIER.x + dx, PIER.z1 + dz, i === COURSE.length - 1 ? '#3dff8b' : '#ff6b35'));
    this.active = null;
    this.best = Infinity;
    this.medal = null;
  }

  begin() {
    const w = this.world;
    this.active = { next: 0, time: 0, countdown: 3.5, outOfBoat: 0 };
    this.buoys.forEach((b, i) => b.setActive(i === 0));
    w.hud.bigText('BUOY RUN', `Round all ${COURSE.length} buoys${Number.isFinite(this.best) ? `  ·  best ${formatTime(this.best)}` : ''}`, 2, '#3fb6c9');
  }

  end(ok, reason) {
    const w = this.world;
    const s = this.active;
    this.active = null;
    for (const b of this.buoys) b.setActive(false);
    if (!ok) { w.hud.bigText('BUOY RUN OVER', reason, 3, '#ff5252'); w.audio.ui('fail'); return; }
    const record = s.time < this.best;
    if (record) this.best = s.time;
    const medal = BUOY_RUN.medals.find((m) => s.time <= m.time);
    if (medal) {
      const better = !this.medal || BUOY_RUN.medals.indexOf(medal) < BUOY_RUN.medals.findIndex((m) => m.name === this.medal);
      if (better) this.medal = medal.name;
      w.money += medal.prize;
      w.hud.bigText(`${medal.name.toUpperCase()} · ${formatTime(s.time)}`, `Buoy Run  +${dollars(medal.prize)}${record ? '  ·  new best' : ''}`, 4.5, medal.color);
      w.audio.ui('pass');
    } else {
      w.hud.bigText(formatTime(s.time), `Buoy Run · bronze is ${formatTime(BUOY_RUN.medals[2].time)}${record ? '  ·  new best' : ''}`, 4, '#ffffff');
      w.audio.ui('cash');
    }
    w.stats.buoyBest = this.best;
  }

  update(dt, input) {
    const w = this.world;
    const p = w.player;
    const t = w.time;
    for (const b of this.buoys) b.update(t);
    this.marker.update(dt);
    const v = p.vehicle;
    const s = this.active;
    if (!s) {
      if (!v || v.spec.body !== 'boat' || w.ui || !this.marker.inside(v.pos.x, v.pos.z, 2)) return;
      if (w.missions.busy()) { w.hud.help('Finish what you are doing first.'); return; }
      w.hud.help(`Press E to start the Buoy Run${Number.isFinite(this.best) ? ` (best ${formatTime(this.best)})` : ''}`);
      if (input.hit('KeyE')) { input.consume('KeyE'); this.begin(); }
      return;
    }
    if (s.countdown > 0) {
      const before = Math.ceil(s.countdown);
      s.countdown -= dt;
      const after = Math.ceil(s.countdown);
      if (v) { v.vel.x *= 0.6; v.vel.z *= 0.6; }
      if (after !== before) {
        w.hud.bigText(after > 0 ? String(after) : 'GO!', '', 0.9, after > 0 ? '#ffffff' : '#3dff8b');
        w.audio.ui(after > 0 ? 'move' : 'select');
      }
      return;
    }
    s.time += dt;
    if (!v || v.spec.body !== 'boat' || v.dead) {
      s.outOfBoat += dt;
      if (s.outOfBoat > 6 || (v && v.dead)) { this.end(false, 'You left the boat.'); return; }
      return;
    }
    s.outOfBoat = 0;
    const b = this.buoys[s.next];
    if (Math.hypot(v.pos.x - b.x, v.pos.z - b.z) < 11) {
      b.setActive(false);
      s.next += 1;
      w.audio.ui('pickup');
      w.fx.spawn('splash', b.x, 0.4, b.z, 8);
      if (s.next >= this.buoys.length) { this.end(true); return; }
      this.buoys[s.next].setActive(true);
    }
  }

  objective() {
    const s = this.active;
    if (!s) return null;
    if (s.countdown > 0) return { title: 'Buoy Run', text: 'Engines ready...' };
    return { title: `Buoy Run · buoy ${s.next + 1}/${this.buoys.length}`, text: s.next === this.buoys.length - 1 ? 'Round the green buoy to finish!' : 'Steer for the lit buoy.' };
  }

  timer() { return this.active && this.active.countdown <= 0 ? this.active.time : null; }

  blips() {
    const out = [{ x: this.start.x, z: this.start.z, color: '#3fb6c9', kind: 'place', icon: 'buoy', title: 'Buoy Run', desc: 'Boat time trial: bring a boat to the beam off the pier and press E.' }];
    if (this.active) {
      const b = this.buoys[this.active.next];
      if (b) out.push({ x: b.x, z: b.z, color: '#ff6b35', kind: 'objective', edge: true, icon: 'buoy', title: 'Next buoy', desc: 'Buoy Run' });
    }
    return out;
  }
}

/** The side activities together: one update, one shot hook, one objective, one save. */
export class Activities {
  constructor(world) {
    this.world = world;
    this.range = new ShootingRange(world);
    this.buoys = new BuoyRun(world);
    this.tacos = new Deliveries(world);
  }

  busy() { return !!(this.range.active || this.buoys.active || this.tacos.active); }

  update(dt, input) {
    this.range.update(dt, input);
    this.buoys.update(dt, input);
    this.tacos.update(dt, input);
  }

  onShot(ox, oy, oz, dx, dy, dz, wallT) { return this.range.onShot(ox, oy, oz, dx, dy, dz, wallT); }

  objective() { return this.range.objective() || this.buoys.objective() || this.tacos.objective(); }

  timer() {
    const r = this.range.timer();
    return r !== null ? r : this.buoys.timer();
  }

  blips() {
    const room = this.range.room;
    return [
      ...this.buoys.blips(),
      ...this.tacos.blips(),
      { x: room.door.x + 1.5, z: room.door.z, color: '#ff7043', kind: 'place', minor: true, icon: 'target', title: 'Coastline Arms range', desc: `Six lanes behind the gun shop. Best score ${this.range.best || '-'}.` },
    ];
  }

  onPlayerDown() {
    if (this.range.active) this.range.finish('Range session over.');
    if (this.buoys.active) this.buoys.end(false, 'Buoy Run over.');
    this.tacos.onPlayerDown();
  }

  serialize() {
    return {
      range: { best: this.range.best, medal: this.range.medal },
      buoys: { best: Number.isFinite(this.buoys.best) ? this.buoys.best : null, medal: this.buoys.medal },
      tacos: this.tacos.serialize(),
    };
  }

  restore(data) {
    if (!data) return;
    this.tacos.restore(data.tacos);
    if (data.range) { this.range.best = data.range.best || 0; this.range.medal = data.range.medal || null; }
    if (data.buoys) { this.buoys.best = data.buoys.best ?? Infinity; this.buoys.medal = data.buoys.medal || null; }
  }
}
