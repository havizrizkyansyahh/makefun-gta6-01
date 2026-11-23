// Boats: the Marisol 22 speedboat and the Tidecaller 40 motor yacht. A boat is a Vehicle whose
// model and physics live here: a planing hull that pushes through the water with little grip,
// rides the same swell the sea shader draws (heave, pitch and roll), throws a white wake, stays
// off the beach and the pier, and can only be left near the shore, alongside the pier or onto a
// deck. Also the channel buoys of the Buoy Run and the pilot that drives boats nobody is in.
import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, mat4 } from './geometry.js';
import { COAST_Z, PIER } from './city.js';
import { clamp, damp, wrapAngle } from './rng.js';

/** Height of the swell at (x, z), the same waves the sea shader draws. */
export function waveHeight(x, z, t) {
  return -0.35 + Math.sin(x * 0.08 + t * 1.3) * 0.25 + Math.sin(z * 0.11 - t * 0.9) * 0.2;
}

const hulls = new Map();

/**
 * The Tidecaller's superstructure, merged with vertex colours: a saloon cabin with a dark window
 * band, a flybridge with its rail and helm, a radar mast, deck rails, a hull stripe and the swim
 * platform at the stern.
 */
function yachtFittings(L, W, deckY) {
  const parts = [];
  const add = (geo, color, m) => parts.push({ geo, color, matrix: m });
  const cabinW = W * 0.66;
  add(new THREE.BoxGeometry(cabinW, 2.0, 4.2), '#f4f4f0', mat4(0, deckY + 1.0, 0.5));             // saloon
  add(new THREE.BoxGeometry(cabinW * 0.94, 0.12, 4.6), '#e4e2dc', mat4(0, deckY + 2.06, 0.4));     // saloon roof
  add(new THREE.BoxGeometry(cabinW * 0.8, 0.9, 2.4), '#f4f4f0', mat4(0, deckY + 2.55, -0.1));     // flybridge
  add(new THREE.BoxGeometry(0.5, 0.55, 0.4), '#2a2c30', mat4(0.3, deckY + 3.25, 0.6));             // helm console
  add(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 8), '#d8dde2', mat4(0, deckY + 3.8, -0.6));      // radar mast
  add(new THREE.BoxGeometry(1.1, 0.08, 0.2), '#2a2c30', mat4(0, deckY + 4.55, -0.6));              // radar arm
  add(new THREE.BoxGeometry(W * 0.98, 0.18, L * 0.86), '#1d3557', mat4(0, deckY - 0.35, -0.2));    // hull stripe
  add(new THREE.BoxGeometry(W * 0.9, 0.12, 1.0), '#b68b5e', mat4(0, deckY - 0.75, -L / 2 - 0.4));  // swim platform
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, L * 0.82, 6), '#d8dde2', mat4(s * (W / 2 - 0.12), deckY + 0.95, -0.3, 1, 1, 1, Math.PI / 2));
    for (let z = -L / 2 + 1; z < L / 2 - 1.5; z += 1.6) add(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), '#d8dde2', mat4(s * (W / 2 - 0.12), deckY + 0.48, z));
    add(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), '#d8dde2', mat4(s * cabinW * 0.4, deckY + 3.25, -0.1, 1, 1, 1, Math.PI / 2));
  }
  // aft deck seating
  add(new THREE.BoxGeometry(W * 0.7, 0.45, 0.6), '#e8e2d4', mat4(0, deckY + 0.22, -L / 2 + 1.0));
  return mergeParts(parts, true);
}

/** The Tidecaller's window band: tinted glass all round the saloon. */
function yachtWindows(W, deckY) {
  const g = new THREE.BoxGeometry(W * 0.672, 0.6, 4.1);
  g.translate(0, deckY + 1.35, 0.5);
  return g;
}

/** Hull, deck and fittings of a boat make (the Marisol 22 or the Tidecaller 40), facing +z. */
export function buildBoatModel(spec, color) {
  let hullCache = hulls.get(spec.name);
  if (!hullCache) {
    const L = spec.len;
    const W = spec.wid;
    const deckY = spec.deck || 0.97;
    const depth = spec.yacht ? 1.45 : 0.85;
    // top view of the hull: square stern, flared sides, pointed bow
    const s = new THREE.Shape();
    s.moveTo(-W / 2, -L / 2);
    s.lineTo(W / 2, -L / 2);
    s.quadraticCurveTo(W / 2 + 0.05, L * 0.15, W * 0.28, L * 0.38);
    s.quadraticCurveTo(0.1, L / 2, 0, L / 2 + 0.05);
    s.quadraticCurveTo(-0.1, L / 2, -W * 0.28, L * 0.38);
    s.quadraticCurveTo(-W / 2 - 0.05, L * 0.15, -W / 2, -L / 2);
    const hull = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 14 });
    hull.rotateX(Math.PI / 2);
    hull.translate(0, deckY - 0.02, 0);
    hull.computeVertexNormals();
    const deck = new THREE.ShapeGeometry(s, 14);
    deck.rotateX(Math.PI / 2);
    deck.scale(0.9, 1, 0.92);
    deck.translate(0, deckY, 0);
    const fittings = spec.yacht ? yachtFittings(L, W, deckY) : mergeParts([
      { geo: new THREE.BoxGeometry(0.9, 0.85, 0.7), color: '#f4f4f0', matrix: mat4(0.25, 1.4, 0.2) },        // console
      { geo: new THREE.BoxGeometry(0.5, 0.9, 0.55), color: '#2a2c30', matrix: mat4(0, 0.9, -L / 2 - 0.2) },  // outboard
      { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), color: '#2a2c30', matrix: mat4(0, 0.4, -L / 2 - 0.25) },
      { geo: new THREE.BoxGeometry(W * 0.75, 0.35, 0.6), color: '#e8e2d4', matrix: mat4(0, 1.15, -L * 0.3) }, // rear bench
      { geo: new THREE.CylinderGeometry(0.025, 0.025, L * 0.55, 6), color: '#d8dde2', matrix: mat4(W * 0.42, 1.35, L * 0.1, 1, 1, 1, Math.PI / 2) },
      { geo: new THREE.CylinderGeometry(0.025, 0.025, L * 0.55, 6), color: '#d8dde2', matrix: mat4(-W * 0.42, 1.35, L * 0.1, 1, 1, 1, Math.PI / 2) },
    ], true);
    let screen = new THREE.BoxGeometry(1.0, 0.45, 0.05);
    screen.rotateX(-0.45);
    screen.translate(0.25, 1.98, 0.5);
    if (spec.yacht) screen = yachtWindows(W, deckY);
    hullCache = { hull, deck, fittings, screen };
    hulls.set(spec.name, hullCache);
  }
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; body.add(m); return m; };
  const paintMesh = add(hullCache.hull, paint);
  add(hullCache.deck, new THREE.MeshStandardMaterial({ color: '#b68b5e', roughness: 0.7 }));
  add(hullCache.fittings, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }));
  const glassMesh = add(hullCache.screen, spec.yacht
    ? new THREE.MeshPhysicalMaterial({ color: '#16222e', roughness: 0.04, metalness: 0.4, clearcoat: 1, envMapIntensity: 1.6 })
    : new THREE.MeshPhysicalMaterial({ color: '#9fc4d8', roughness: 0.05, transparent: true, opacity: 0.45 }));
  const head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3c4', emissiveIntensity: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff2020', emissiveIntensity: 0.4 });
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), head);
  nav.position.set(0, (spec.deck || 0.97) + 0.3, spec.len / 2 - 0.3);
  body.add(nav);
  const stern = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tail);
  stern.position.set(0, spec.yacht ? (spec.deck || 0.97) + 4.7 : 1.9, spec.yacht ? -0.6 : -spec.len / 2 + 0.3);
  body.add(stern);
  const driver = new THREE.Group();
  driver.visible = false;
  body.add(driver);
  return { root, body, wheels: [], paint, head, tail, sirens: null, driver, paintMesh, glassMesh };
}

/** One physics step for a boat (called from Vehicle.update). */
export function boatPhysics(v, dt, world) {
  const s = v.spec;
  const inp = v.dead ? { throttle: 0, steer: 0, handbrake: false } : v.input;
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  let vF = v.vel.x * fx + v.vel.z * fz;
  let vR = v.vel.x * -fz + v.vel.z * fx;
  if (inp.throttle > 0) vF += s.power * inp.throttle * Math.max(0, 1 - vF / s.top) * dt;
  else if (inp.throttle < 0) vF += (vF > 0 ? 10 : s.power * 0.4) * inp.throttle * dt;
  vF -= vF * 0.35 * dt;                      // water drag
  vR *= Math.exp(-s.grip * dt);              // the hull carves, but slides
  v.steer = damp(v.steer, inp.steer, 5, dt);
  v.yawRate = v.steer * s.turn * clamp(vF / 6, -1, 1);
  v.heading = wrapAngle(v.heading + v.yawRate * dt);
  const nfx = Math.sin(v.heading);
  const nfz = Math.cos(v.heading);
  v.vel.x = nfx * vF - nfz * vR;
  v.vel.z = nfz * vF + nfx * vR;
  v.forward = vF;
  v.lateral = vR;
  v.pos.x += v.vel.x * dt;
  v.pos.z += v.vel.z * dt;

  // keep to open water: off the sand and clear of the pier
  const minZ = COAST_Z + 4 + v.halfLen * 0.6;
  let bump = 0;
  if (v.pos.z < minZ) { bump = Math.max(bump, -v.vel.z); v.pos.z = minZ; v.vel.z = Math.max(0, v.vel.z) * 0.3; }
  if (v.pos.z > COAST_Z + 700) { v.pos.z = COAST_Z + 700; v.vel.z = Math.min(0, v.vel.z); }
  v.pos.x = clamp(v.pos.x, -1100, 1100);
  const px = PIER.half + v.spec.wid / 2 + 0.6;
  if (Math.abs(v.pos.x - PIER.x) < px && v.pos.z < PIER.z1 + v.halfLen * 0.5) {
    const side = Math.sign(v.pos.x - PIER.x) || 1;
    const intoEnd = PIER.z1 + v.halfLen * 0.5 - v.pos.z;
    const intoSide = px - Math.abs(v.pos.x - PIER.x);
    if (intoEnd < intoSide) { v.pos.z = PIER.z1 + v.halfLen * 0.5; bump = Math.max(bump, -v.vel.z); v.vel.z = Math.abs(v.vel.z) * 0.3; } else { v.pos.x = PIER.x + side * px; bump = Math.max(bump, Math.abs(v.vel.x)); v.vel.x = side * Math.abs(v.vel.x) * 0.3; }
  }
  // floating barges are solid too
  for (const f of world.city.platforms) {
    const m = v.spec.wid / 2 + 0.4;
    const ix = Math.min(v.pos.x - (f.x0 - m), f.x1 + m - v.pos.x);
    const iz = Math.min(v.pos.z - (f.z0 - m), f.z1 + m - v.pos.z);
    if (ix <= 0 || iz <= 0) continue;
    if (ix < iz) {
      const side = v.pos.x < (f.x0 + f.x1) / 2 ? -1 : 1;
      v.pos.x += side * ix;
      bump = Math.max(bump, Math.abs(v.vel.x));
      v.vel.x = side * Math.abs(v.vel.x) * 0.3;
    } else {
      const side = v.pos.z < (f.z0 + f.z1) / 2 ? -1 : 1;
      v.pos.z += side * iz;
      bump = Math.max(bump, Math.abs(v.vel.z));
      v.vel.z = side * Math.abs(v.vel.z) * 0.3;
    }
  }
  if (bump > 6) v.damage((bump - 6) * 2);

  // ride the swell: heave, pitch with speed and the waves, roll into turns
  const t = world.time;
  const h = waveHeight(v.pos.x, v.pos.z, t);
  const hb = waveHeight(v.pos.x + nfx * 2, v.pos.z + nfz * 2, t);
  v.y = damp(v.y, h - 0.25, 6, dt);
  const b = v.parts.body;
  b.rotation.x = damp(b.rotation.x, -(hb - h) * 0.25 - Math.min(0.12, Math.max(0, vF) * 0.006), 4, dt);
  b.rotation.z = damp(b.rotation.z, clamp(-v.yawRate * vF * 0.01, -0.2, 0.2), 4, dt);
  v.skid = 0;
  // wake: white water off the stern
  if (Math.abs(vF) > 3 && Math.random() < dt * (10 + Math.abs(vF))) {
    world.fx.spawn('tyre', v.pos.x - nfx * v.halfLen, v.y + 0.3, v.pos.z - nfz * v.halfLen);
  }
  if (v.health <= 0 && !v.dead) v.burn += dt;
  v.mesh.position.set(v.pos.x, v.y, v.pos.z);
  v.mesh.rotation.y = v.heading;
}

/** Close enough to dry land (or the pier) to step off? */
export function nearShore(x, z) {
  if (z < COAST_Z + 9) return true;
  return Math.abs(x - PIER.x) < PIER.half + 4.5 && z < PIER.z1 + 4;
}

const buoyGeo = {
  float: new THREE.CylinderGeometry(0.55, 0.7, 1.1, 16),
  band: new THREE.CylinderGeometry(0.57, 0.6, 0.22, 16),
  cage: new THREE.ConeGeometry(0.42, 1.2, 4, 1, true),
  lamp: new THREE.SphereGeometry(0.18, 12, 8),
  ring: new THREE.TorusGeometry(5.5, 0.12, 6, 40),
};

/**
 * A channel buoy for the Buoy Run: a float that rides the swell, a striped band, a lattice top
 * and a lamp. A lit ring floats around the one the player is heading for.
 */
export class Buoy {
  constructor(scene, x, z, color = '#ff6b35') {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.group = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.5, metalness: 0.5, wireframe: true });
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: color, emissiveIntensity: 0.6 });
    const f = new THREE.Mesh(buoyGeo.float, paint);
    f.position.y = 0.3;
    const b = new THREE.Mesh(buoyGeo.band, white);
    b.position.y = 0.55;
    const c = new THREE.Mesh(buoyGeo.cage, dark);
    c.position.y = 1.45;
    const l = new THREE.Mesh(buoyGeo.lamp, this.lampMat);
    l.position.y = 2.1;
    for (const m of [f, b, c]) m.castShadow = true;
    this.group.add(f, b, c, l);
    this.ring = new THREE.Mesh(buoyGeo.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    this.phase = Math.random() * 6;
  }

  /** Highlight this buoy as the next one to round. */
  setActive(on) {
    this.ring.visible = on;
    this.lampMat.emissiveIntensity = on ? 3.2 : 0.6;
  }

  update(t) {
    const h = waveHeight(this.x, this.z, t);
    this.group.position.y = h + 0.1;
    this.group.rotation.z = Math.sin(t * 1.1 + this.phase) * 0.08;
    this.group.rotation.x = Math.cos(t * 0.9 + this.phase) * 0.06;
    this.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
  }

  remove() { this.scene.remove(this.group); }
}

/**
 * Drives a boat without a player at the helm: along a list of waypoints out to sea ('path',
 * Captain Hollis's yacht running for open water) or straight at the player's boat to ram it
 * ('ram', his escorts). Fills the boat's input like LaneDriver does for cars.
 */
export class BoatPilot {
  constructor(world, boat, opts = {}) {
    this.world = world;
    this.v = boat;
    this.mode = opts.mode || 'path';
    this.path = opts.path || [];
    this.i = 0;
    this.cruise = opts.cruise ?? 0.85;
    this.hold = false;
    this.done = false;
    this.backoff = 0;
  }

  update(dt) {
    const v = this.v;
    if (v.dead || this.hold) { v.input.throttle = 0; v.input.steer = 0; return; }
    let tx;
    let tz;
    let throttle = this.cruise;
    if (this.mode === 'ram') {
      const p = this.world.player;
      const t = p.vehicle || p;
      const lead = t.vel ? 0.7 : 0;
      tx = t.pos.x + (t.vel ? t.vel.x * lead : 0);
      tz = t.pos.z + (t.vel ? t.vel.z * lead : 0);
      const d = Math.hypot(tx - v.pos.x, tz - v.pos.z);
      // after a hit, peel off for a moment and come round again
      if (this.backoff > 0) {
        this.backoff -= dt;
        tx = v.pos.x + (v.pos.x - t.pos.x);
        tz = v.pos.z + (v.pos.z - t.pos.z);
      } else if (d < 5) this.backoff = 2.2;
      throttle = d > 30 ? 1 : 0.85;
    } else {
      const wp = this.path[this.i];
      if (!wp) { this.done = true; v.input.throttle = 0.4; v.input.steer = 0; return; }
      tx = wp.x;
      tz = wp.z;
      if (Math.hypot(tx - v.pos.x, tz - v.pos.z) < 20) this.i += 1;
    }
    // never steer onto the beach: aim back out when too close to the shore
    if (v.pos.z < COAST_Z + 30) tz = Math.max(tz, COAST_Z + 60);
    const desired = Math.atan2(tx - v.pos.x, tz - v.pos.z);
    const diff = wrapAngle(desired - v.heading);
    v.input.steer = clamp(diff * 2, -1, 1);
    v.input.throttle = Math.abs(diff) > 1.6 ? throttle * 0.5 : throttle;
    v.input.handbrake = false;
  }
}
