// People: a jointed body made of smooth, rounded parts (a lathe-turned torso, capsule limbs,
// a sculpted head with eyes, nose, ears and hair, hands and shoes) shared by the player,
// pedestrians, gang members and police. Each bone's parts are baked into one vertex-coloured
// mesh so a crowd stays cheap to draw. animate() drives walk, run, aim, punch, sit, hands-up
// and fall poses through the same joints. Looks carry the clothes, so Kai's outfits from
// Threadline Outfitters (caps, sun hats, beanies, jackets, chains, shades) build the same way.
import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, mat4 } from './geometry.js';

const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });

const bake = (parts) => mergeParts(parts, true);
const M = mat4;

// shared source shapes
const lathe = (pts, seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const G = {
  torso: lathe([[0.001, 0], [0.165, 0.0], [0.175, 0.1], [0.172, 0.24], [0.2, 0.4], [0.235, 0.52], [0.215, 0.6], [0.12, 0.655], [0.001, 0.665]]),
  pelvis: lathe([[0.001, -0.12], [0.15, -0.12], [0.18, -0.06], [0.178, 0.04], [0.165, 0.1], [0.001, 0.1]]),
  neck: new THREE.CylinderGeometry(0.052, 0.06, 0.12, 12),
  head: new THREE.SphereGeometry(0.118, 20, 16),
  jaw: new THREE.SphereGeometry(0.085, 16, 10),
  nose: new THREE.ConeGeometry(0.022, 0.05, 8),
  ear: new THREE.SphereGeometry(0.026, 8, 6),
  eye: new THREE.SphereGeometry(0.016, 8, 6),
  pupil: new THREE.SphereGeometry(0.009, 6, 4),
  brow: new THREE.CapsuleGeometry(0.007, 0.035, 2, 4),
  mouth: new THREE.CapsuleGeometry(0.006, 0.03, 2, 4),
  hairCap: new THREE.SphereGeometry(0.128, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
  bun: new THREE.SphereGeometry(0.06, 12, 8),
  capTop: new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
  brim: new THREE.CylinderGeometry(0.11, 0.11, 0.015, 16, 1, false, 0, Math.PI),
  upper: new THREE.CapsuleGeometry(0.058, 0.22, 4, 10),
  fore: new THREE.CapsuleGeometry(0.048, 0.22, 4, 10),
  hand: new THREE.SphereGeometry(0.052, 10, 8),
  thigh: new THREE.CapsuleGeometry(0.088, 0.3, 4, 12),
  shin: new THREE.CapsuleGeometry(0.068, 0.32, 4, 12),
  shoe: new THREE.CapsuleGeometry(0.052, 0.15, 4, 10),
  belt: new THREE.TorusGeometry(0.168, 0.018, 6, 22),
  badge: new THREE.CircleGeometry(0.03, 10),
  collar: new THREE.TorusGeometry(0.075, 0.02, 6, 16),
  skirt: lathe([[0.17, 0.08], [0.2, -0.05], [0.27, -0.42], [0.001, -0.42]]),
  lens: new THREE.CapsuleGeometry(0.022, 0.028, 2, 8),
  bag: new THREE.BoxGeometry(0.22, 0.26, 0.08),
  // outfit pieces from Threadline Outfitters
  hatBrim: new THREE.CylinderGeometry(0.22, 0.23, 0.014, 26),
  hatCrown: new THREE.CylinderGeometry(0.105, 0.12, 0.11, 20),
  beanie: new THREE.SphereGeometry(0.134, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
  chain: new THREE.TorusGeometry(0.085, 0.009, 6, 22),
  pendant: new THREE.SphereGeometry(0.018, 8, 6),
};

const weaponMat = {
  metal: new THREE.MeshStandardMaterial({ color: '#2a2c30', roughness: 0.35, metalness: 0.8 }),
  wood: new THREE.MeshStandardMaterial({ color: '#6b4128', roughness: 0.6 }),
};

/** A small gun model built from rounded parts. */
function gunModel(kind) {
  const g = new THREE.Group();
  const part = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  if (kind === 'pistol') {
    part(new THREE.BoxGeometry(0.035, 0.05, 0.2), weaponMat.metal, 0, 0.02, 0.06);
    part(new THREE.BoxGeometry(0.03, 0.1, 0.045), weaponMat.metal, 0, -0.03, -0.01, 0.25);
  } else if (kind === 'smg') {
    part(new THREE.BoxGeometry(0.045, 0.07, 0.32), weaponMat.metal, 0, 0.02, 0.1);
    part(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), weaponMat.metal, 0, 0.03, 0.3, Math.PI / 2);
    part(new THREE.BoxGeometry(0.03, 0.14, 0.04), weaponMat.metal, 0, -0.06, 0.08, 0.15);
    part(new THREE.BoxGeometry(0.03, 0.06, 0.14), weaponMat.metal, 0, 0.0, -0.1);
  } else if (kind === 'carbine') {
    part(new THREE.BoxGeometry(0.045, 0.075, 0.42), weaponMat.metal, 0, 0.02, 0.12);            // receiver
    part(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), weaponMat.metal, 0, 0.035, 0.46, Math.PI / 2); // barrel
    part(new THREE.BoxGeometry(0.035, 0.05, 0.12), weaponMat.metal, 0, 0.085, 0.08);             // optic
    part(new THREE.BoxGeometry(0.03, 0.15, 0.05), weaponMat.metal, 0, -0.07, 0.14, 0.3);         // magazine
    part(new THREE.BoxGeometry(0.035, 0.07, 0.2), weaponMat.wood, 0, -0.005, -0.18);             // stock
  } else {
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 10), weaponMat.metal, 0, 0.03, 0.22, Math.PI / 2);
    part(new THREE.CylinderGeometry(0.024, 0.024, 0.3, 10), weaponMat.wood, 0, -0.005, 0.2, Math.PI / 2);
    part(new THREE.BoxGeometry(0.04, 0.08, 0.28), weaponMat.wood, 0, -0.02, -0.13);
  }
  return g;
}

export const SKINS = ['#f1c9a5', '#e0ac85', '#c68b62', '#a26a45', '#7a4a2e', '#f6d8bf', '#5c3420'];
export const SHIRTS = ['#e85d5d', '#3fb8ad', '#f2d15c', '#f4f4f0', '#1e5560', '#f2923a', '#6a4c93', '#f2a7b7', '#7fb83d', '#3a7bd5', '#bfa98a'];
export const PANTS = ['#2b2d42', '#3d405b', '#c9b79c', '#1d3557', '#6d6875', '#e8e4da', '#5a3e2b', '#4a6a8a'];
export const HAIRS = ['#1b1712', '#3b2416', '#6e4424', '#c9a25e', '#2b2b2b', '#8a4a2a', '#d8d2c8'];

export class Human {
  /** look = { skin, shirt, pants, hair, shoes, cap, badge, bun, sleeves } */
  constructor(look) {
    this.look = look;
    const L = look;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const mesh = (parts, parent) => {
      const m = new THREE.Mesh(bake(parts), skinMat);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);
    mesh([{ geo: G.pelvis, color: L.pants, matrix: M(0, 0, 0, 1, 1, 0.72) },
      ...(L.skirt ? [{ geo: G.skirt, color: L.skirt, matrix: M(0, 0, 0, 1, 1, 0.8) }] : []),
      ...(L.bag ? [{ geo: G.bag, color: L.bag, matrix: M(0.2, -0.12, 0.02, 1, 1, 1, 0, 0, 0.1) }] : []),
      ...(L.belt !== false ? [{ geo: G.belt, color: L.belt || '#2a2420', matrix: M(0, 0.07, 0, 1.02, 1, 0.74, Math.PI / 2) }] : [])], hips);
    const chest = new THREE.Group();
    chest.position.y = 0.08;
    hips.add(chest);
    const chestParts = [
      { geo: G.torso, color: L.shirt, matrix: M(0, 0, 0, 1, 1, 0.62) },
      { geo: G.collar, color: L.shirt, matrix: M(0, 0.64, 0, 1, 1, 1, Math.PI / 2) },
    ];
    if (L.badge) chestParts.push({ geo: G.badge, color: '#ffd54a', matrix: M(0.1, 0.46, 0.125, 1, 1, 1, -0.1) });
    if (L.jacket) chestParts.push({ geo: G.torso, color: L.jacket, matrix: M(0, 0.02, -0.004, 1.06, 0.98, 0.66) });
    if (L.chain) {
      chestParts.push({ geo: G.chain, color: '#e8c25a', matrix: M(0, 0.585, 0.035, 1, 1.25, 1, Math.PI / 2 - 0.35) });
      chestParts.push({ geo: G.pendant, color: '#f2d27a', matrix: M(0, 0.5, 0.118) });
    }
    mesh(chestParts, chest);
    const neck = new THREE.Group();
    neck.position.y = 0.64;
    chest.add(neck);
    const face = [
      { geo: G.neck, color: L.skin, matrix: M(0, 0.04, 0) },
      { geo: G.head, color: L.skin, matrix: M(0, 0.2, 0, 0.9, 1.06, 0.98) },
      { geo: G.jaw, color: L.skin, matrix: M(0, 0.13, 0.025, 0.95, 0.8, 0.9) },
      { geo: G.nose, color: L.skin, matrix: M(0, 0.19, 0.118, 1, 1, 1, Math.PI / 2 - 0.3) },
      { geo: G.ear, color: L.skin, matrix: M(0.105, 0.19, 0, 0.5, 1, 0.8) },
      { geo: G.ear, color: L.skin, matrix: M(-0.105, 0.19, 0, 0.5, 1, 0.8) },
      { geo: G.eye, color: '#f4f1ea', matrix: M(0.04, 0.215, 0.098, 1, 0.8, 0.6) },
      { geo: G.eye, color: '#f4f1ea', matrix: M(-0.04, 0.215, 0.098, 1, 0.8, 0.6) },
      { geo: G.pupil, color: '#2a1d14', matrix: M(0.04, 0.215, 0.106) },
      { geo: G.pupil, color: '#2a1d14', matrix: M(-0.04, 0.215, 0.106) },
      { geo: G.brow, color: L.hair, matrix: M(0.042, 0.245, 0.104, 1, 1, 1, 0, 0, Math.PI / 2 + 0.1) },
      { geo: G.brow, color: L.hair, matrix: M(-0.042, 0.245, 0.104, 1, 1, 1, 0, 0, Math.PI / 2 - 0.1) },
      { geo: G.mouth, color: '#7a3d35', matrix: M(0, 0.135, 0.105, 1, 1, 1, 0, 0, Math.PI / 2) },
    ];
    if (L.glasses) {
      face.push({ geo: G.lens, color: '#111418', matrix: M(0.04, 0.215, 0.112, 1, 1, 0.6, 0, 0, Math.PI / 2) });
      face.push({ geo: G.lens, color: '#111418', matrix: M(-0.04, 0.215, 0.112, 1, 1, 0.6, 0, 0, Math.PI / 2) });
    }
    if (L.cap) {
      face.push({ geo: G.capTop, color: L.cap, matrix: M(0, 0.25, -0.005, 0.96, 0.8, 1) });
      face.push({ geo: G.brim, color: L.cap, matrix: M(0, 0.262, 0.09, 1, 1, 1.25, 0, -Math.PI / 2) });
    } else if (L.sunhat) {
      // a wide-brimmed straw hat over short hair
      face.push({ geo: G.hairCap, color: L.hair, matrix: M(0, 0.19, -0.008, 0.92, 0.9, 0.98, -0.25) });
      face.push({ geo: G.hatBrim, color: L.sunhat, matrix: M(0, 0.275, 0, 1, 1, 1, -0.05) });
      face.push({ geo: G.hatCrown, color: L.sunhat, matrix: M(0, 0.335, -0.004) });
      face.push({ geo: G.hatCrown, color: L.hatBand || '#2a2420', matrix: M(0, 0.3, -0.004, 1.03, 0.22, 1.03) });
    } else if (L.beanie) {
      face.push({ geo: G.beanie, color: L.beanie, matrix: M(0, 0.205, -0.01, 0.96, 1.05, 1.0, -0.12) });
    } else if (!L.bald) {
      face.push({ geo: G.hairCap, color: L.hair, matrix: M(0, 0.2, -0.008, 0.94, 1.0, 1.0, -0.25) });
      if (L.bun) face.push({ geo: G.bun, color: L.hair, matrix: M(0, 0.3, -0.1) });
      if (L.long) face.push({ geo: G.hairCap, color: L.hair, matrix: M(0, 0.12, -0.03, 0.98, 1.4, 0.95, -0.7) });
    }
    mesh(face, neck);

    const limb = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.235, 0.54, 0);
      chest.add(shoulder);
      const sleeve = L.sleeves === 'long' ? L.shirt : L.skin;
      mesh([
        { geo: G.upper, color: L.shirt, matrix: M(0, -0.12, 0, 1.08, 0.62, 1.08) },
        { geo: G.upper, color: sleeve, matrix: M(0, -0.2, 0) },
      ], shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -0.33;
      shoulder.add(elbow);
      mesh([
        { geo: G.fore, color: L.sleeves === 'long' ? L.shirt : L.skin, matrix: M(0, -0.13, 0) },
        { geo: G.hand, color: L.skin, matrix: M(0, -0.31, 0.01, 0.8, 1.15, 1) },
      ], elbow);
      const hip = new THREE.Group();
      hip.position.set(side * 0.095, -0.06, 0);
      hips.add(hip);
      // a skirt or dress shows bare legs; shorts stop above the knee
      mesh([{ geo: G.thigh, color: L.skirt ? L.skin : L.pants, matrix: M(0, -0.21, 0) }], hip);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      mesh([
        { geo: G.shin, color: L.skirt || L.shorts ? L.skin : L.pants, matrix: M(0, -0.2, 0) },
        { geo: G.shoe, color: L.shoes || '#222222', matrix: M(0, -0.43, 0.05, 1.1, 1, 0.75, Math.PI / 2) },
      ], knee);
      return { shoulder, elbow, hip, knee };
    };
    this.L = limb(1);
    this.R = limb(-1);
    this.root = root;
    this.body = body;
    this.hips = hips;
    this.chest = chest;
    this.neck = neck;
    this.phase = Math.random() * 6;
    this.weaponMesh = null;
    this.weaponKind = null;
    this.fall = 0;
  }

  /** Put a weapon model in the right hand (null for fists). */
  setWeapon(kind) {
    if (this.weaponMesh) this.R.elbow.remove(this.weaponMesh);
    this.weaponMesh = null;
    this.weaponKind = kind && kind !== 'fist' ? kind : null;
    if (!this.weaponKind) return;
    const m = gunModel(kind);
    m.position.set(0, -0.33, 0.03);
    m.rotation.x = Math.PI / 2; // barrel along the forearm, grip down when the arm is raised
    this.R.elbow.add(m);
    this.weaponMesh = m;
  }

  /**
   * Pose for this frame. speed in m/s; state: 'idle'|'move'|'aim'|'punch'|'sit'|'dead'|'air'|'hands'.
   * aimPitch tilts the arms when aiming; t is 0..1 progress for one-shot moves.
   */
  animate(dt, speed, state, aimPitch = 0, t = 0) {
    const L = this.L;
    const R = this.R;
    const reset = (j) => { j.shoulder.rotation.set(0, 0, 0); j.elbow.rotation.set(0, 0, 0); j.hip.rotation.set(0, 0, 0); j.knee.rotation.set(0, 0, 0); };
    reset(L); reset(R);
    this.chest.rotation.set(0, 0, 0);
    this.hips.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    // arms hang slightly away from the body
    L.shoulder.rotation.z = 0.08;
    R.shoulder.rotation.z = -0.08;
    L.elbow.rotation.x = R.elbow.rotation.x = -0.12;

    if (state === 'dead') {
      // a loose, ragdoll-like sprawl: every body lands a little differently, and a hard
      // knock (speed = tumble rate) rolls it over before it settles
      if (!this.sprawl) this.sprawl = Array.from({ length: 10 }, () => Math.random() * 2 - 1);
      const r = this.sprawl;
      this.fall = Math.min(1, this.fall + dt * (3 + speed * 0.5));
      this.roll = (this.roll || 0) + speed * dt;
      const f = this.fall;
      this.body.rotation.set(-f * Math.PI / 2 - this.roll, r[0] * 0.4 * f, r[1] * 0.35 * f);
      this.body.position.y = f * 0.16;
      this.body.position.z = -f * 0.25;
      L.shoulder.rotation.set(r[2] * 1.2 * f, 0, f * (1.0 + r[3] * 0.8));
      R.shoulder.rotation.set(r[4] * 1.2 * f, 0, -f * (1.0 + r[5] * 0.8));
      L.elbow.rotation.x = -f * (0.4 + Math.abs(r[6]) * 1.2);
      R.elbow.rotation.x = -f * (0.3 + Math.abs(r[7]) * 1.0);
      L.hip.rotation.set(-f * (0.1 + r[8] * 0.4), 0, f * 0.15);
      R.hip.rotation.set(-f * (0.1 - r[8] * 0.3), 0, -f * (0.1 + Math.abs(r[9]) * 0.3));
      L.knee.rotation.x = f * Math.abs(r[9]) * 1.2;
      R.knee.rotation.x = f * (0.3 + Math.abs(r[3]) * 0.9);
      this.neck.rotation.set(r[1] * 0.3 * f, f * 0.6 * r[0], 0);
      return;
    }
    this.sprawl = null;
    this.roll = 0;
    this.fall = 0;
    if (state === 'sit') {
      L.hip.rotation.x = R.hip.rotation.x = -1.45;
      L.knee.rotation.x = R.knee.rotation.x = 1.4;
      L.shoulder.rotation.x = R.shoulder.rotation.x = -0.9;
      L.elbow.rotation.x = R.elbow.rotation.x = -0.4;
      this.body.position.y = -0.38;
      return;
    }
    if (state === 'ride') {
      // astride a motorbike: knees up, leaning over the tank, hands on the bars
      L.hip.rotation.set(-1.25, 0, 0.18); R.hip.rotation.set(-1.25, 0, -0.18);
      L.knee.rotation.x = R.knee.rotation.x = 1.55;
      this.chest.rotation.x = 0.42;
      L.shoulder.rotation.set(-1.05, 0, -0.12); R.shoulder.rotation.set(-1.05, 0, 0.12);
      L.elbow.rotation.x = R.elbow.rotation.x = -0.35;
      this.neck.rotation.x = -0.35;
      this.body.position.y = -0.47;
      return;
    }
    if (state === 'hands') {
      L.shoulder.rotation.z = 2.7; R.shoulder.rotation.z = -2.7;
      L.elbow.rotation.z = 0.5; R.elbow.rotation.z = -0.5;
      this.neck.rotation.x = 0.2;
      return;
    }

    const moving = speed > 0.3;
    const run = speed > 5.5;
    this.phase += dt * (moving ? 2.2 + speed * 1.25 : 1.5);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    if (state === 'air') {
      L.hip.rotation.x = -0.7; R.hip.rotation.x = 0.3;
      L.knee.rotation.x = 1.0; R.knee.rotation.x = 0.5;
      L.shoulder.rotation.z = 0.7; R.shoulder.rotation.z = -0.7;
    } else if (moving) {
      const amp = run ? 0.95 : 0.55;
      L.hip.rotation.x = s * amp;
      R.hip.rotation.x = -s * amp;
      L.knee.rotation.x = Math.max(0, -c) * amp * 1.5 + 0.05;
      R.knee.rotation.x = Math.max(0, c) * amp * 1.5 + 0.05;
      L.shoulder.rotation.x = -s * amp * 0.85;
      R.shoulder.rotation.x = s * amp * 0.85;
      L.elbow.rotation.x = R.elbow.rotation.x = run ? -1.25 : -0.3;
      this.body.position.y = Math.abs(s) * (run ? 0.07 : 0.03);
      this.chest.rotation.x = run ? 0.16 : 0.03;
      this.chest.rotation.y = s * (run ? 0.18 : 0.08);
      this.hips.rotation.y = -s * (run ? 0.12 : 0.06);
    } else {
      // idle breathing and a small weight shift
      this.chest.rotation.x = Math.sin(this.phase * 0.5) * 0.02;
      this.hips.rotation.z = Math.sin(this.phase * 0.25) * 0.02;
    }

    if (state === 'aim') {
      // right arm straight down the sights, left arm swung inward to support the weapon
      R.shoulder.rotation.set(-Math.PI / 2 - aimPitch, 0, 0.12);
      R.elbow.rotation.set(0, 0, 0);
      this.neck.rotation.x = aimPitch * 0.5;
      this.chest.rotation.y = 0.12;
      if (this.weaponKind && this.weaponKind !== 'pistol') {
        L.shoulder.rotation.set(-Math.PI / 2 - aimPitch + 0.12, 0, -0.55);
        L.elbow.rotation.set(-0.45, 0, 0);
      } else {
        L.shoulder.rotation.set(-Math.PI / 2 - aimPitch + 0.08, 0, -0.42);
        L.elbow.rotation.set(-0.15, 0, 0);
      }
    } else if (state === 'punch') {
      const k = Math.sin(Math.min(1, t) * Math.PI);
      R.shoulder.rotation.set(-1.5 * k - 0.3, 0, 0);
      R.elbow.rotation.x = -1.3 * (1 - k);
      L.shoulder.rotation.set(-0.9, 0, 0.2);
      L.elbow.rotation.x = -1.9;
      this.chest.rotation.y = -0.45 * k;
    }
  }
}

/** A random civilian look from the city palette, using rng for repeatable crowds. */
export function civilianLook(rng) {
  const female = rng.chance(0.5);
  const outfit = rng.next();
  return {
    skin: rng.pick(SKINS),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    skirt: female && outfit < 0.4 ? rng.pick(['#e85d5d', '#2a9d8f', '#f2d15c', '#1d3557', '#f2a7b7', '#f4f0e6']) : null,
    shorts: outfit > 0.65 && rng.chance(0.6),
    jacket: outfit > 0.85 ? rng.pick(['#3d405b', '#6d6875', '#8a5a3a', '#1d3557']) : null,
    glasses: rng.chance(0.3),
    bag: female && rng.chance(0.35) ? rng.pick(['#8a5a3a', '#111111', '#c9a25e', '#b33a2b']) : null,
    hair: rng.pick(HAIRS),
    shoes: rng.pick(['#222222', '#f4f4f4', '#8b5a2b', '#b33a2b', '#3a4a6a']),
    cap: !female && rng.chance(0.22) ? rng.pick(['#e85d5d', '#1d3557', '#f2d15c', '#f4f4f0']) : null,
    bun: female && rng.chance(0.4),
    long: female && rng.chance(0.5),
    sleeves: rng.chance(0.3) ? 'long' : 'short',
    belt: rng.chance(0.6) ? '#2a2420' : false,
  };
}

export const LOOKS = {
  kai: { skin: '#a26a45', shirt: '#2a9d8f', pants: '#2e3142', hair: '#141210', shoes: '#f4f4f4', jacket: null, belt: '#1a1a1a' },
  cop: { skin: '#d9a47a', shirt: '#2f4f8f', pants: '#1c2541', hair: '#2b2b2b', shoes: '#111111', cap: '#1c2541', badge: true, sleeves: 'long', belt: '#111111' },
  saint: { skin: '#7a4a2e', shirt: '#e9f1f7', pants: '#8a96a3', hair: '#111111', shoes: '#ffffff', cap: '#bde0fe', belt: '#c0c8d0' },
  nadia: { skin: '#a26a45', shirt: '#f2923a', pants: '#3d405b', hair: '#1b1712', shoes: '#b33a2b', bun: true, belt: false },
  pearl: { skin: '#5c3420', shirt: '#9b5de5', pants: '#f4f0e6', hair: '#d8d2c8', shoes: '#6a4c93', bun: true, sleeves: 'long', belt: false },
  calder: { skin: '#f1c9a5', shirt: '#f8f9fa', pants: '#f8f9fa', hair: '#c9a25e', shoes: '#ced4da', jacket: '#e9ecef', sleeves: 'long' },
  // the harbour board's people and the shopkeepers
  hollis: { skin: '#e0ac85', shirt: '#dfe6f0', pants: '#1c2541', hair: '#d8d2c8', shoes: '#111111', jacket: '#1c2541', badge: true, sleeves: 'long', glasses: true, belt: '#111111' },
  vey: { skin: '#c68b62', shirt: '#3a4a6a', pants: '#2b2d42', hair: '#2b2b2b', shoes: '#111111', jacket: '#5a3e2b', sleeves: 'long', bald: true },
  dock: { skin: '#a26a45', shirt: '#f2923a', pants: '#3d405b', hair: '#1b1712', shoes: '#5a3e2b', beanie: '#1d3557', sleeves: 'long', belt: '#2a2420' },
  ines: { skin: '#7a4a2e', shirt: '#3a7bd5', pants: '#3a7bd5', hair: '#1b1712', shoes: '#111111', bun: true, sleeves: 'long', belt: '#2a2420' },
  tailor: { skin: '#f1c9a5', shirt: '#f4f0e6', pants: '#2b2d42', hair: '#8a4a2a', shoes: '#8b5a2b', jacket: '#6a4c93', glasses: true, long: true, bun: false, sleeves: 'long', belt: false },
  gunsmith: { skin: '#d9a47a', shirt: '#4a6a3a', pants: '#5a3e2b', hair: '#6e4424', shoes: '#3a2a1a', cap: '#3d405b', belt: '#2a2420' },
  clerk: { skin: '#e0ac85', shirt: '#ff5fa2', pants: '#e8e4da', hair: '#c9a25e', shoes: '#f4f4f4', bun: true, belt: false },
};
