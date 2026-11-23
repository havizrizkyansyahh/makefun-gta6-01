// Boats: the Marisol 22 speedboat. A boat is a Vehicle whose model and physics live here: a
// planing hull that pushes through the water with little grip, rides the same swell the sea
// shader draws (heave, pitch and roll), throws a white wake, stays off the beach and the pier,
// and can only be left near the shore or alongside the pier.
import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, mat4 } from './geometry.js';
import { COAST_Z, PIER } from './city.js';
import { clamp, damp, wrapAngle } from './rng.js';

/** Height of the swell at (x, z), the same waves the sea shader draws. */
export function waveHeight(x, z, t) {
  return -0.35 + Math.sin(x * 0.08 + t * 1.3) * 0.25 + Math.sin(z * 0.11 - t * 0.9) * 0.2;
}

let hullCache = null;

/** Hull, deck, console and outboard of the Marisol 22, facing +z. */
export function buildBoatModel(spec, color) {
  if (!hullCache) {
    const L = spec.len;
    const W = spec.wid;
    // top view of the hull: square stern, flared sides, pointed bow
    const s = new THREE.Shape();
    s.moveTo(-W / 2, -L / 2);
    s.lineTo(W / 2, -L / 2);
    s.quadraticCurveTo(W / 2 + 0.05, L * 0.15, W * 0.28, L * 0.38);
    s.quadraticCurveTo(0.1, L / 2, 0, L / 2 + 0.05);
    s.quadraticCurveTo(-0.1, L / 2, -W * 0.28, L * 0.38);
    s.quadraticCurveTo(-W / 2 - 0.05, L * 0.15, -W / 2, -L / 2);
    const hull = new THREE.ExtrudeGeometry(s, { depth: 0.85, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 14 });
    hull.rotateX(Math.PI / 2);
    hull.translate(0, 0.95, 0);
    hull.computeVertexNormals();
    const deck = new THREE.ShapeGeometry(s, 14);
    deck.rotateX(Math.PI / 2);
    deck.scale(0.9, 1, 0.92);
    deck.translate(0, 0.97, 0);
    const fittings = mergeParts([
      { geo: new THREE.BoxGeometry(0.9, 0.85, 0.7), color: '#f4f4f0', matrix: mat4(0.25, 1.4, 0.2) },        // console
      { geo: new THREE.BoxGeometry(0.5, 0.9, 0.55), color: '#2a2c30', matrix: mat4(0, 0.9, -L / 2 - 0.2) },  // outboard
      { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), color: '#2a2c30', matrix: mat4(0, 0.4, -L / 2 - 0.25) },
      { geo: new THREE.BoxGeometry(W * 0.75, 0.35, 0.6), color: '#e8e2d4', matrix: mat4(0, 1.15, -L * 0.3) }, // rear bench
      { geo: new THREE.CylinderGeometry(0.025, 0.025, L * 0.55, 6), color: '#d8dde2', matrix: mat4(W * 0.42, 1.35, L * 0.1, 1, 1, 1, Math.PI / 2) },
      { geo: new THREE.CylinderGeometry(0.025, 0.025, L * 0.55, 6), color: '#d8dde2', matrix: mat4(-W * 0.42, 1.35, L * 0.1, 1, 1, 1, Math.PI / 2) },
    ], true);
    const screen = new THREE.BoxGeometry(1.0, 0.45, 0.05);
    screen.rotateX(-0.45);
    screen.translate(0.25, 1.98, 0.5);
    hullCache = { hull, deck, fittings, screen };
  }
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 });
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; body.add(m); return m; };
  const paintMesh = add(hullCache.hull, paint);
  add(hullCache.deck, new THREE.MeshStandardMaterial({ color: '#b68b5e', roughness: 0.7 }));
  add(hullCache.fittings, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }));
  const glassMesh = add(hullCache.screen, new THREE.MeshPhysicalMaterial({ color: '#9fc4d8', roughness: 0.05, transparent: true, opacity: 0.45 }));
  const head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3c4', emissiveIntensity: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff2020', emissiveIntensity: 0.4 });
  const nav = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), head);
  nav.position.set(0, 1.25, spec.len / 2 - 0.3);
  body.add(nav);
  const stern = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tail);
  stern.position.set(0, 1.9, -spec.len / 2 + 0.3);
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
