// Visual effects: pooled sprite particles (muzzle flash, sparks, smoke, fire, dust, hits),
// bullet tracers, explosions with a light flash, and the camera shake value systems add to.
import * as THREE from '../vendor/three.module.min.js';
import { glowTexture, smokeTexture } from './textures.js';

const KINDS = {
  muzzle: { tex: 'glow', life: 0.06, size: [0.7, 0.2], color: '#ffd27a', add: true, rise: 0, spread: 0 },
  spark: { tex: 'glow', life: 0.25, size: [0.25, 0.05], color: '#ffcf6b', add: true, rise: -6, spread: 7 },
  hit: { tex: 'smoke', life: 0.45, size: [0.5, 1.1], color: '#a01818', add: false, rise: 0.4, spread: 1.4 },
  dust: { tex: 'smoke', life: 0.6, size: [0.5, 1.5], color: '#cfc4b0', add: false, rise: 0.6, spread: 1.2 },
  smoke: { tex: 'smoke', life: 2.2, size: [1.0, 3.6], color: '#4a4a4a', add: false, rise: 2.2, spread: 0.6 },
  tyre: { tex: 'smoke', life: 1.0, size: [0.8, 2.6], color: '#e8e8e8', add: false, rise: 0.8, spread: 0.6 },
  fire: { tex: 'glow', life: 0.6, size: [1.3, 0.3], color: '#ff7b25', add: true, rise: 3.0, spread: 0.8 },
  blast: { tex: 'glow', life: 0.7, size: [3, 9], color: '#ffb347', add: true, rise: 2, spread: 9 },
  cash: { tex: 'glow', life: 0.8, size: [0.5, 0.1], color: '#6dff8a', add: true, rise: 3, spread: 1.5 },
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tex = { glow: glowTexture(), smoke: smokeTexture() };
    this.pool = [];
    this.live = [];
    for (let i = 0; i < 420; i += 1) {
      const m = new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.pool.push({ sprite: s, vx: 0, vy: 0, vz: 0, life: 0, max: 1, kind: null });
    }
    this.tracers = [];
    const tmat = new THREE.LineBasicMaterial({ color: '#fff1b3', transparent: true, opacity: 0.9 });
    for (let i = 0; i < 40; i += 1) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      const line = new THREE.Line(g, tmat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.flashLight = new THREE.PointLight('#ffae5c', 0, 60, 1.6);
    scene.add(this.flashLight);
    this.flashTime = 0;
    this.shake = 0;
    this.cursor = 0;
  }

  spawn(kind, x, y, z, count = 1, vel = null) {
    const k = KINDS[kind];
    for (let n = 0; n < count; n += 1) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
      const s = p.sprite;
      s.material.map = this.tex[k.tex];
      s.material.color.set(k.color);
      s.material.blending = k.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      s.material.opacity = 1;
      s.material.rotation = Math.random() * 6.28;
      s.position.set(x, y, z);
      s.visible = true;
      p.kind = k;
      p.life = 0;
      p.max = k.life * (0.7 + Math.random() * 0.6);
      const sp = k.spread;
      p.vx = (Math.random() - 0.5) * sp + (vel ? vel.x : 0);
      p.vy = (Math.random() - 0.2) * sp * 0.6 + (vel ? vel.y || 0 : 0);
      p.vz = (Math.random() - 0.5) * sp + (vel ? vel.z : 0);
      if (!this.live.includes(p)) this.live.push(p);
    }
  }

  tracer(ax, ay, az, bx, by, bz, color = '#fff1b3') {
    const t = this.tracers.find((q) => q.life <= 0) || this.tracers[0];
    const a = t.line.geometry.attributes.position;
    a.setXYZ(0, ax, ay, az);
    a.setXYZ(1, bx, by, bz);
    a.needsUpdate = true;
    t.line.material.color.set(color);
    t.line.visible = true;
    t.life = 0.07;
  }

  explosion(x, y, z) {
    this.spawn('blast', x, y + 1, z, 26);
    this.spawn('smoke', x, y + 1.5, z, 18);
    this.spawn('spark', x, y + 1, z, 30);
    this.flashLight.position.set(x, y + 3, z);
    this.flashLight.intensity = 400;
    this.flashTime = 0.5;
    this.shake = Math.max(this.shake, 1.2);
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      const p = this.live[i];
      p.life += dt;
      const s = p.sprite;
      if (p.life >= p.max) {
        s.visible = false;
        this.live.splice(i, 1);
        continue;
      }
      const t = p.life / p.max;
      const k = p.kind;
      p.vy += (k.rise >= 0 ? k.rise * 0.4 : k.rise) * dt;
      s.position.x += p.vx * dt;
      s.position.y += p.vy * dt;
      s.position.z += p.vz * dt;
      if (s.position.y < 0.05) { s.position.y = 0.05; p.vy = Math.abs(p.vy) * 0.3; }
      const size = k.size[0] + (k.size[1] - k.size[0]) * t;
      s.scale.set(size, size, size);
      s.material.opacity = (1 - t) * (k.add ? 1 : 0.75);
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.flashLight.intensity = Math.max(0, this.flashTime / 0.5) * 400;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
}
