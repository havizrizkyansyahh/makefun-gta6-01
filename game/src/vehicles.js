// Vehicles of Solmara Bay: the models (built from boxes, with spinning and steering wheels,
// head, tail and police lights) and the arcade driving model every car shares, whether the
// player, a traffic driver or a police officer is at the wheel. Also car-to-car collisions.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, wrapAngle } from './rng.js';

/** The city's own makes. len/wid/hgt in metres; power m/s^2, top m/s, grip, turn rad/s. */
export const MODELS = {
  ardent: { name: 'Ardent GT', body: 'coupe', len: 4.5, wid: 1.95, hgt: 1.15, power: 17, top: 56, grip: 7.5, turn: 2.2, mass: 1.2, colors: ['#e63946', '#ffb703', '#2ec4b6', '#f1faee', '#111111'] },
  brisa: { name: 'Brisa Hatch', body: 'hatch', len: 3.9, wid: 1.8, hgt: 1.45, power: 11, top: 40, grip: 6.5, turn: 2.4, mass: 0.9, colors: ['#90be6d', '#f9c74f', '#577590', '#f94144', '#ffffff', '#c77dff'] },
  marlin: { name: 'Marlin Cab', body: 'sedan', len: 4.7, wid: 1.9, hgt: 1.45, power: 12, top: 44, grip: 6.4, turn: 2.0, mass: 1.15, colors: ['#ffd23f'], taxi: true },
  corso: { name: 'Bayliner Sedan', body: 'sedan', len: 4.8, wid: 1.92, hgt: 1.42, power: 12.5, top: 45, grip: 6.4, turn: 2.0, mass: 1.2, colors: ['#3d5a80', '#98c1d9', '#ee6c4d', '#e0fbfc', '#293241', '#8d99ae'] },
  pelican: { name: 'Pelican Van', body: 'van', len: 5.3, wid: 2.1, hgt: 2.3, power: 9, top: 34, grip: 5.6, turn: 1.7, mass: 1.8, colors: ['#ffffff', '#f4a261', '#2a9d8f', '#e9c46a'] },
  halden: { name: 'Halden Ranger', body: 'pickup', len: 5.2, wid: 2.05, hgt: 1.7, power: 12, top: 42, grip: 6.0, turn: 1.8, mass: 1.6, colors: ['#bc4749', '#386641', '#6a994e', '#264653', '#f2e8cf'] },
  bayrunner: { name: 'Bayrunner 70', body: 'muscle', len: 4.9, wid: 2.0, hgt: 1.25, power: 16, top: 52, grip: 6.2, turn: 2.0, mass: 1.35, colors: ['#fb8500', '#219ebc', '#8338ec', '#000000'] },
  cruiser: { name: 'SBPD Interceptor', body: 'sedan', len: 4.9, wid: 1.95, hgt: 1.42, power: 16, top: 54, grip: 7.2, turn: 2.1, mass: 1.35, colors: ['#f4f4f4'], police: true },
  halcyon: { name: 'Halcyon GT-R', body: 'coupe', len: 4.6, wid: 2.0, hgt: 1.1, power: 21, top: 64, grip: 8.2, turn: 2.35, mass: 1.25, colors: ['#bde0fe'] },
};

export const TRAFFIC_MIX = ['brisa', 'brisa', 'corso', 'corso', 'corso', 'marlin', 'pelican', 'halden', 'bayrunner', 'ardent'];

const box = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
wheelGeo.rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 8);
hubGeo.rotateZ(Math.PI / 2);
const shared = {
  glass: new THREE.MeshStandardMaterial({ color: '#1d2a38', roughness: 0.15, metalness: 0.6 }),
  tyre: new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.9 }),
  hub: new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.3, metalness: 0.8 }),
  trim: new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.7 }),
  charred: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 1 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.2, metalness: 0.9 }),
  checker: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 }),
};

function addBox(parent, material, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(box, material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Build the model for a make, facing +z. Returns the parts the simulation animates. */
function buildModel(spec, color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.35 });
  const L = spec.len;
  const W = spec.wid;
  const H = spec.hgt;
  const base = 0.32;
  const deck = H * 0.45;
  addBox(body, paint, W, deck, L, 0, base + deck / 2, 0);
  addBox(body, shared.trim, W + 0.04, 0.16, 0.25, 0, base + 0.08, L / 2 - 0.05);
  addBox(body, shared.trim, W + 0.04, 0.16, 0.25, 0, base + 0.08, -L / 2 + 0.05);
  const top = base + deck;
  let cabinLen = L * 0.48;
  let cabinZ = -L * 0.05;
  let cabinH = H - deck - 0.05;
  if (spec.body === 'coupe') { cabinLen = L * 0.4; cabinZ = -L * 0.08; }
  if (spec.body === 'hatch') { cabinLen = L * 0.58; cabinZ = -L * 0.12; }
  if (spec.body === 'muscle') { cabinLen = L * 0.38; cabinZ = -L * 0.1; }
  if (spec.body === 'van') { cabinLen = L * 0.8; cabinZ = -L * 0.08; }
  if (spec.body === 'pickup') { cabinLen = L * 0.34; cabinZ = L * 0.08; }
  // glass house, then a painted roof slab
  addBox(body, shared.glass, W * 0.86, cabinH * 0.8, cabinLen, 0, top + cabinH * 0.4, cabinZ);
  addBox(body, paint, W * 0.88, 0.09, cabinLen * 0.86, 0, top + cabinH * 0.82, cabinZ - cabinLen * 0.03);
  if (spec.body === 'van') addBox(body, paint, W * 0.9, cabinH * 0.62, cabinLen * 0.7, 0, top + cabinH * 0.42, cabinZ - cabinLen * 0.14);
  if (spec.body === 'pickup') {
    addBox(body, paint, 0.08, 0.4, L * 0.42, W / 2 - 0.04, top + 0.2, -L * 0.25);
    addBox(body, paint, 0.08, 0.4, L * 0.42, -W / 2 + 0.04, top + 0.2, -L * 0.25);
    addBox(body, paint, W, 0.4, 0.08, 0, top + 0.2, -L / 2 + 0.04);
  }
  if (spec.body === 'muscle' || spec.body === 'coupe') {
    addBox(body, shared.trim, W * 0.9, 0.06, 0.32, 0, top + 0.12, -L / 2 + 0.2); // spoiler
  }
  if (spec.body === 'muscle') addBox(body, shared.trim, 0.5, 0.12, 0.9, 0, top + 0.05, L * 0.28); // hood scoop

  // lights
  const head = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c4', emissiveIntensity: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: '#8b0000', emissive: '#ff2020', emissiveIntensity: 0.4 });
  for (const s of [-1, 1]) {
    addBox(body, head, 0.42, 0.14, 0.06, s * (W / 2 - 0.3), base + deck * 0.7, L / 2 + 0.01);
    addBox(body, tail, 0.42, 0.14, 0.06, s * (W / 2 - 0.3), base + deck * 0.7, -L / 2 - 0.01);
  }
  let sirens = null;
  if (spec.police) {
    // dark lower doors and hood stripe, roof light bar
    const navy = new THREE.MeshStandardMaterial({ color: '#1c2541', roughness: 0.5 });
    addBox(body, navy, W + 0.02, deck * 0.55, L * 0.45, 0, base + deck * 0.3, -L * 0.03);
    const red = new THREE.MeshStandardMaterial({ color: '#550000', emissive: '#ff1a1a', emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: '#000855', emissive: '#2a5bff', emissiveIntensity: 0 });
    const roofY = top + cabinH * 0.9;
    addBox(body, shared.trim, W * 0.7, 0.08, 0.32, 0, roofY, cabinZ);
    addBox(body, red, W * 0.32, 0.14, 0.28, -W * 0.18, roofY + 0.1, cabinZ);
    addBox(body, blue, W * 0.32, 0.14, 0.28, W * 0.18, roofY + 0.1, cabinZ);
    sirens = { red, blue };
  }
  if (spec.taxi) {
    addBox(body, shared.checker, W * 0.9, 0.12, L * 0.9, 0, base + deck * 0.35, 0).scale.x = W + 0.03;
    const sign = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe08a', emissiveIntensity: 0.4 });
    addBox(body, sign, 0.7, 0.22, 0.3, 0, top + cabinH * 0.95, cabinZ);
  }

  // wheels: front pair on steering pivots
  const wheels = [];
  const wz = L / 2 - 0.85;
  const wx = W / 2 - 0.02;
  for (const [x, z, front] of [[wx, wz, true], [-wx, wz, true], [wx, -wz, false], [-wx, -wz, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const spin = new THREE.Group();
    const t = new THREE.Mesh(wheelGeo, shared.tyre);
    t.castShadow = true;
    const h = new THREE.Mesh(hubGeo, shared.hub);
    spin.add(t, h);
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  // simple driver silhouette, shown when someone is at the wheel
  const driver = new THREE.Group();
  addBox(driver, new THREE.MeshStandardMaterial({ color: '#333a44' }), 0.4, 0.36, 0.24, 0, 0, 0);
  addBox(driver, new THREE.MeshStandardMaterial({ color: '#c08a62' }), 0.2, 0.2, 0.2, 0, 0.3, 0);
  driver.position.set(W * 0.22, top + Math.min(0.12, cabinH * 0.8 - 0.5), cabinZ + cabinLen * 0.1);
  driver.visible = false;
  body.add(driver);
  return { root, body, wheels, paint, head, tail, sirens, driver };
}

let nextId = 1;

export class Vehicle {
  constructor(scene, modelKey, color, x, z, heading) {
    this.id = nextId++;
    this.key = modelKey;
    this.spec = MODELS[modelKey];
    this.color = color || this.spec.colors[0];
    this.parts = buildModel(this.spec, this.color);
    this.mesh = this.parts.root;
    scene.add(this.mesh);
    this.scene = scene;
    this.pos = { x, z };
    this.y = 0;
    this.heading = heading;
    this.vel = { x: 0, z: 0 };
    this.forward = 0;
    this.lateral = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.health = 100;
    this.dead = false;
    this.burn = 0;
    this.driver = null;       // 'player' | an npc | null
    this.ai = null;           // a controller that fills this.input
    this.siren = false;
    this.horn = 0;
    this.radius = this.spec.wid / 2 + 0.05;
    this.halfLen = this.spec.len / 2;
    this.lastImpact = 0;
    this.skid = 0;
    this.sync();
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }

  /** The two collision circle centres along the body. */
  circles() {
    const o = this.halfLen - this.radius;
    return [
      { x: this.pos.x + this.fx * o, z: this.pos.z + this.fz * o },
      { x: this.pos.x - this.fx * o, z: this.pos.z - this.fz * o },
    ];
  }

  update(dt, city, events) {
    const s = this.spec;
    const inp = this.dead ? { throttle: 0, steer: 0, handbrake: true } : this.input;
    const fx = this.fx;
    const fz = this.fz;
    const rx = -fz;
    const rz = fx;
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vR = this.vel.x * rx + this.vel.z * rz;
    const healthFactor = this.health < 25 ? 0.65 : 1;

    // engine, brakes and reverse
    if (inp.throttle > 0) {
      if (vF < -0.5) vF += 26 * inp.throttle * dt;
      else vF += s.power * healthFactor * inp.throttle * Math.max(0, 1 - vF / s.top) * dt;
    } else if (inp.throttle < 0) {
      if (vF > 0.5) vF += 26 * inp.throttle * dt;
      else if (vF > -14) vF += s.power * 0.55 * inp.throttle * dt;
    } else {
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), 2.2 * dt);
    }
    vF -= vF * Math.abs(vF) * 0.0011 * dt;
    if (inp.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 9 * dt);

    // grip: the handbrake lets the tail slide out
    const grip = inp.handbrake ? 1.4 : s.grip;
    const before = vR;
    vR *= Math.exp(-grip * dt);
    this.skid = Math.abs(before) > 4 || (inp.handbrake && Math.abs(vF) > 8) ? Math.min(1, Math.abs(before) / 10 + 0.3) : 0;

    // steering: tighter at low speed, calmer at high speed
    this.steer = damp(this.steer, inp.steer, 9, dt);
    const speedTurn = clamp(vF / 5, -1, 1) / (1 + Math.abs(vF) / 38);
    let yaw = this.steer * s.turn * speedTurn;
    if (inp.handbrake && Math.abs(vF) > 6) yaw *= 1.55;
    this.yawRate = yaw;
    this.heading = wrapAngle(this.heading + yaw * dt);

    const nfx = Math.sin(this.heading);
    const nfz = Math.cos(this.heading);
    this.vel.x = nfx * vF + -nfz * vR;
    this.vel.z = nfz * vF + nfx * vR;
    this.forward = vF;
    this.lateral = vR;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // buildings and props
    const cs = this.circles();
    let nx = 0; let nz = 0; let touched = false;
    for (const c of cs) {
      const bx = c.x; const bz = c.z;
      const hit = city.pushCircle(c, this.radius, this.y);
      if (hit) {
        touched = true;
        nx += hit.x; nz += hit.z;
      }
      this.pos.x += (c.x - bx) * 0.5;
      this.pos.z += (c.z - bz) * 0.5;
    }
    if (touched) {
      const d = Math.hypot(nx, nz) || 1;
      nx /= d; nz /= d;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= 1.35 * vn * nx;
        this.vel.z -= 1.35 * vn * nz;
        this.vel.x *= 0.82;
        this.vel.z *= 0.82;
        const impact = -vn;
        if (impact > 5) {
          this.damage((impact - 5) * 2.4);
          if (events) events.push({ type: 'crash', vehicle: this, impact });
        }
      }
    }

    // height follows curbs and the pier
    const gy = city.groundHeight(this.pos.x, this.pos.z);
    this.y = damp(this.y, gy, 14, dt);

    if (this.health <= 0 && !this.dead) {
      this.burn += dt;
    }
    this.sync(dt);
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount * (1 - (this.armor || 0)));
    if (this.driver === null && !this.ai) this.kind = this.kind === 'parked' ? 'abandoned' : this.kind;
  }

  /** Called by the world when a burning wreck goes up. */
  explode() {
    this.dead = true;
    this.health = 0;
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material !== shared.tyre) o.material = shared.charred;
    });
    this.parts.driver.visible = false;
  }

  sync(dt = 0) {
    const p = this.parts;
    this.mesh.position.set(this.pos.x, this.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    // body roll and pitch sell the weight
    p.body.rotation.z = damp(p.body.rotation.z, clamp(-this.lateral * 0.02 - this.yawRate * this.forward * 0.004, -0.09, 0.09), 8, dt || 1);
    p.body.rotation.x = damp(p.body.rotation.x, clamp(-this.input.throttle * 0.02, -0.03, 0.03), 6, dt || 1);
    for (const w of p.wheels) {
      w.spin.rotation.x += (this.forward * (dt || 0)) / 0.36;
      if (w.front) w.pivot.rotation.y = this.steer * 0.5;
    }
    p.driver.visible = !this.dead && this.driver !== null && this.driver !== 'player';
  }

  /** Night headlights, brake lights and the police light bar. */
  lights(time, night) {
    const p = this.parts;
    if (this.dead) return;
    p.head.emissiveIntensity = 0.3 + night * 2.5;
    const braking = this.input.throttle < 0 && this.forward > 0.5;
    p.tail.emissiveIntensity = braking ? 2.5 : 0.4 + night * 0.8;
    if (p.sirens) {
      const on = this.siren;
      const phase = Math.floor(time * 6) % 2;
      p.sirens.red.emissiveIntensity = on && phase === 0 ? 4 : 0;
      p.sirens.blue.emissiveIntensity = on && phase === 1 ? 4 : 0;
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.isMesh && o.material && !Object.values(shared).includes(o.material) && o.material.dispose) o.material.dispose();
    });
  }
}

/**
 * Push overlapping cars apart and trade momentum along the contact, so crashes shove and spin.
 * Returns the impacts for sound and damage handling.
 */
export function collideVehicles(list, events) {
  for (let a = 0; a < list.length; a += 1) {
    const A = list[a];
    for (let b = a + 1; b < list.length; b += 1) {
      const B = list[b];
      const dx0 = B.pos.x - A.pos.x;
      const dz0 = B.pos.z - A.pos.z;
      const reach = A.halfLen + B.halfLen;
      if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
      const ca = A.circles();
      const cb = B.circles();
      for (const p of ca) {
        for (const q of cb) {
          let dx = q.x - p.x;
          let dz = q.z - p.z;
          const r = A.radius + B.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2) || 0.01;
          dx /= d; dz /= d;
          const overlap = r - d;
          const ma = A.spec.mass * (A.driver === null && !A.ai ? 2.2 : 1);
          const mb = B.spec.mass * (B.driver === null && !B.ai ? 2.2 : 1);
          const ta = mb / (ma + mb);
          A.pos.x -= dx * overlap * ta; A.pos.z -= dz * overlap * ta;
          B.pos.x += dx * overlap * (1 - ta); B.pos.z += dz * overlap * (1 - ta);
          const rel = (B.vel.x - A.vel.x) * dx + (B.vel.z - A.vel.z) * dz;
          if (rel < 0) {
            const j = (-(1.25) * rel) / (1 / ma + 1 / mb);
            A.vel.x -= (j / ma) * dx; A.vel.z -= (j / ma) * dz;
            B.vel.x += (j / mb) * dx; B.vel.z += (j / mb) * dz;
            // a glancing blow twists both cars a little
            A.heading += (Math.random() - 0.5) * Math.min(0.25, -rel * 0.012);
            B.heading += (Math.random() - 0.5) * Math.min(0.25, -rel * 0.012);
            const impact = -rel;
            if (impact > 4) {
              A.damage((impact - 4) * 1.6);
              B.damage((impact - 4) * 1.6);
              events.push({ type: 'carhit', a: A, b: B, impact, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
            }
          }
        }
      }
    }
  }
}
