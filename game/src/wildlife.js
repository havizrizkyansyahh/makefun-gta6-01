// Life over the water: a few flocks of gulls wheel above the beach, the pier and the harbour,
// flapping and gliding, crying now and then when Kai is near; and once the story is over,
// fireworks go up over the bay on clear nights, whistle, burst and crackle across the sea.
import * as THREE from '../vendor/three.module.min.js';
import { COAST_Z, PIER } from './city.js';
import { makeRng } from './rng.js';

const bodyGeo = new THREE.SphereGeometry(1, 10, 8);
bodyGeo.scale(0.11, 0.1, 0.34);
const headGeo = new THREE.SphereGeometry(0.075, 8, 6);
headGeo.translate(0, 0.06, 0.3);
const beakGeo = new THREE.ConeGeometry(0.022, 0.09, 6);
beakGeo.rotateX(Math.PI / 2);
beakGeo.translate(0, 0.05, 0.41);
const tailGeo = new THREE.BoxGeometry(0.16, 0.02, 0.14);
tailGeo.translate(0, 0, -0.36);
// a wing hinged at the body's side, tapering to a dark tip
const wingGeo = new THREE.BufferGeometry();
wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, 0, 0, -0.1, 0.42, 0, -0.06, 0.42, 0, -0.06, 0.62, 0, -0.16, 0, 0, 0.12, 0.42, 0, -0.06, 0.62, 0, -0.16, 0.5, 0, 0.02], 3));
wingGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 0.9, 0.92, 0.95, 0.75, 0.78, 0.82, 0.75, 0.78, 0.82, 0.12, 0.12, 0.14, 1, 1, 1, 0.75, 0.78, 0.82, 0.12, 0.12, 0.14, 0.4, 0.42, 0.45], 3));
wingGeo.computeVertexNormals();

const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.8 });
const grey = new THREE.MeshStandardMaterial({ color: '#aab2ba', roughness: 0.8 });
const beakMat = new THREE.MeshStandardMaterial({ color: '#f2b13a', roughness: 0.6 });
const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });

function makeGull() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bodyGeo, white), new THREE.Mesh(headGeo, white), new THREE.Mesh(beakGeo, beakMat), new THREE.Mesh(tailGeo, grey));
  const left = new THREE.Mesh(wingGeo, wingMat);
  const right = new THREE.Mesh(wingGeo, wingMat);
  right.scale.x = -1;
  g.add(left, right);
  g.scale.setScalar(1.6);
  return { group: g, left, right };
}

const FIREWORK_COLORS = [['#ff2d95', '#ffd23f'], ['#2de2ff', '#ffffff'], ['#b14dff', '#ff9f1c'], ['#3dff8b', '#2de2ff'], ['#ffd23f', '#ff5f3d']];

export class Wildlife {
  constructor(world) {
    this.world = world;
    const rng = makeRng(611);
    this.group = new THREE.Group();
    world.scene.add(this.group);
    // flocks circle over the pier, two stretches of beach and the harbour mouth
    const centres = [
      { x: PIER.x, z: PIER.z1 - 10, r: 22, h: 16 },
      { x: PIER.x - 180, z: COAST_Z - 10, r: 30, h: 13 },
      { x: PIER.x + 220, z: COAST_Z + 10, r: 26, h: 18 },
      { x: -380, z: COAST_Z + 30, r: 34, h: 20 },
    ];
    this.gulls = [];
    for (const c of centres) {
      for (let k = 0; k < 4; k += 1) {
        const m = makeGull();
        this.group.add(m.group);
        this.gulls.push({
          ...m, cx: c.x + rng.range(-8, 8), cz: c.z + rng.range(-8, 8), r: c.r * rng.range(0.6, 1.2), h: c.h + rng.range(-4, 5),
          a: rng.range(0, Math.PI * 2), speed: rng.range(7, 10) * (rng.chance(0.5) ? 1 : -1), flap: rng.range(0, 6), glide: 0,
        });
      }
    }
    this.cry = 3;
    this.fireworks = [];
    this.fwTimer = 2;
  }

  update(dt) {
    const w = this.world;
    const indoor = !!w.interior;
    this.group.visible = !indoor;
    if (indoor) return;
    const t = w.time;
    const at = w.where();
    let nearest = Infinity;
    for (const g of this.gulls) {
      g.a += (g.speed / g.r) * dt;
      const x = g.cx + Math.cos(g.a) * g.r;
      const z = g.cz + Math.sin(g.a) * g.r;
      const y = g.h + Math.sin(t * 0.7 + g.flap) * 1.5;
      g.group.position.set(x, y, z);
      // face along the circle, banking into it
      const tx = -Math.sin(g.a) * Math.sign(g.speed);
      const tz = Math.cos(g.a) * Math.sign(g.speed);
      g.group.rotation.set(0, Math.atan2(tx, tz), -0.35 * Math.sign(g.speed));
      // flap for a while, then hold the wings out and glide
      g.glide -= dt;
      if (g.glide < -2.5) g.glide = 1.5 + Math.random() * 2;
      const beat = g.glide > 0 ? 0.08 : Math.sin(t * 11 + g.flap) * 0.65;
      g.left.rotation.z = beat;
      g.right.rotation.z = -beat;
      nearest = Math.min(nearest, Math.hypot(x - at.x, z - at.z));
    }
    this.cry -= dt;
    if (this.cry <= 0) {
      this.cry = 4 + Math.random() * 9;
      if (nearest < 90) w.audio.gull(nearest);
    }
    this.updateFireworks(dt, at);
  }

  /** After the story's end, on clear nights, a show over the bay now and then. */
  updateFireworks(dt, at) {
    const w = this.world;
    for (let i = this.fireworks.length - 1; i >= 0; i -= 1) {
      const f = this.fireworks[i];
      f.t -= dt;
      // the rocket's trail on the way up
      if (f.t > 0) {
        const k = 1 - f.t / 1.0;
        w.fx.spawn('ember', f.x, 2 + k * f.y, f.z, 1, { x: 0, y: -1, z: 0 }, '#ffe2b0');
      } else {
        w.fx.burst(f.x, f.y, f.z, f.colors);
        this.fireworks.splice(i, 1);
      }
    }
    const show = w.missions.completed.has('low-tide') && w.sky.night > 0.65 && w.weather.rain < 0.2;
    if (!show) return;
    this.fwTimer -= dt;
    if (this.fwTimer > 0) return;
    this.fwTimer = 0.6 + Math.random() * 2.2;
    const x = PIER.x + (Math.random() - 0.5) * 260;
    const z = COAST_Z + 90 + Math.random() * 140;
    const y = 45 + Math.random() * 35;
    this.fireworks.push({ x, y, z, t: 1.0, colors: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)] });
    w.audio.firework(Math.hypot(x - at.x, z - at.z));
  }
}
