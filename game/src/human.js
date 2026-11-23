// People: a jointed low-poly body (hips, torso, head, two-part arms and legs) shared by the
// player, pedestrians, gang members and police, with outfits, a held weapon, and the walk, run,
// aim, punch, sit and fall poses driven by one animate() call a frame.
import * as THREE from '../vendor/three.module.min.js';

const geo = {
  torso: new THREE.BoxGeometry(0.5, 0.62, 0.28),
  hips: new THREE.BoxGeometry(0.46, 0.22, 0.26),
  head: new THREE.BoxGeometry(0.26, 0.3, 0.28),
  hair: new THREE.BoxGeometry(0.28, 0.1, 0.3),
  cap: new THREE.BoxGeometry(0.3, 0.08, 0.36),
  upper: new THREE.BoxGeometry(0.15, 0.36, 0.16),
  lower: new THREE.BoxGeometry(0.13, 0.34, 0.14),
  thigh: new THREE.BoxGeometry(0.19, 0.44, 0.2),
  shin: new THREE.BoxGeometry(0.16, 0.44, 0.17),
  shoe: new THREE.BoxGeometry(0.17, 0.09, 0.28),
  pistol: new THREE.BoxGeometry(0.06, 0.12, 0.26),
  smg: new THREE.BoxGeometry(0.07, 0.16, 0.5),
  shotgun: new THREE.BoxGeometry(0.07, 0.1, 0.8),
  badge: new THREE.BoxGeometry(0.08, 0.08, 0.02),
};
for (const k of ['upper', 'lower', 'thigh', 'shin']) geo[k].translate(0, -geo[k].parameters.height / 2, 0);
geo.shoe.translate(0, -0.04, 0.05);

const materials = new Map();
function mat(color) {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    materials.set(color, m);
  }
  return m;
}

export const SKINS = ['#f1c9a5', '#d9a47a', '#b97c55', '#8d5a3b', '#6b4029', '#f5d7bd'];
export const SHIRTS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ffffff', '#1a535c', '#ff9f1c', '#6a4c93', '#f7b2bd', '#8ac926', '#3a86ff'];
export const PANTS = ['#2b2d42', '#3d405b', '#c9b79c', '#1d3557', '#6d6875', '#ffffff', '#5a3e2b'];
export const HAIRS = ['#1b1b1b', '#3b2416', '#7a4a24', '#d9b26f', '#2b2b2b', '#a0522d'];

/**
 * Build a person. look = { skin, shirt, pants, hair, shoes, cap, badge }.
 * Returns a Human with .root (put it in the scene) and pose helpers.
 */
export class Human {
  constructor(look) {
    this.look = look;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const part = (g, color, parent, x, y, z) => {
      const m = new THREE.Mesh(g, mat(color));
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const hips = new THREE.Group();
    hips.position.y = 0.98;
    body.add(hips);
    part(geo.hips, look.pants, hips, 0, 0, 0);
    const chest = new THREE.Group();
    chest.position.y = 0.1;
    hips.add(chest);
    part(geo.torso, look.shirt, chest, 0, 0.32, 0);
    if (look.badge) part(geo.badge, '#ffd54a', chest, 0.12, 0.48, 0.15);
    const neck = new THREE.Group();
    neck.position.y = 0.64;
    chest.add(neck);
    const head = part(geo.head, look.skin, neck, 0, 0.15, 0);
    part(geo.hair, look.hair, head, 0, 0.17, -0.01);
    if (look.cap) part(geo.cap, look.cap, head, 0, 0.2, 0.04);
    // simple face: two eyes
    part(new THREE.BoxGeometry(0.04, 0.03, 0.01), '#1b1b1b', head, -0.06, 0.03, 0.145);
    part(new THREE.BoxGeometry(0.04, 0.03, 0.01), '#1b1b1b', head, 0.06, 0.03, 0.145);

    const limb = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.33, 0.58, 0);
      chest.add(shoulder);
      part(geo.upper, look.shirt, shoulder, 0, 0, 0);
      const elbow = new THREE.Group();
      elbow.position.y = -0.36;
      shoulder.add(elbow);
      part(geo.lower, look.skin, elbow, 0, 0, 0);
      const hip = new THREE.Group();
      hip.position.set(side * 0.12, -0.08, 0);
      hips.add(hip);
      part(geo.thigh, look.pants, hip, 0, 0, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      part(geo.shin, look.pants, knee, 0, 0, 0);
      part(geo.shoe, look.shoes || '#222222', knee, 0, -0.44, 0);
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
    this.fall = 0;
  }

  /** Put a weapon model in the right hand (null for fists). */
  setWeapon(kind) {
    if (this.weaponMesh) this.R.elbow.remove(this.weaponMesh);
    this.weaponMesh = null;
    if (!kind || kind === 'fist') return;
    const g = geo[kind] || geo.pistol;
    const m = new THREE.Mesh(g, mat(kind === 'shotgun' ? '#5b3a29' : '#2a2c30'));
    m.position.set(0, -0.36, g.parameters.depth * 0.35);
    m.castShadow = true;
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
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);

    if (state === 'dead') {
      this.fall = Math.min(1, this.fall + dt * 3);
      const f = this.fall;
      this.body.rotation.x = -f * Math.PI / 2;
      this.body.position.y = f * 0.2;
      this.body.position.z = -f * 0.3;
      L.shoulder.rotation.z = f * 1.2; R.shoulder.rotation.z = -f * 1.3;
      L.hip.rotation.x = -f * 0.2; R.knee.rotation.x = f * 0.5;
      return;
    }
    this.fall = 0;
    if (state === 'sit') {
      L.hip.rotation.x = R.hip.rotation.x = -1.45;
      L.knee.rotation.x = R.knee.rotation.x = 1.4;
      L.shoulder.rotation.x = R.shoulder.rotation.x = -0.9;
      L.elbow.rotation.x = R.elbow.rotation.x = -0.4;
      this.body.position.y = -0.38;
      return;
    }
    if (state === 'hands') {
      // hands up: surrendering or cheering
      L.shoulder.rotation.z = 2.7; R.shoulder.rotation.z = -2.7;
      L.elbow.rotation.z = 0.4; R.elbow.rotation.z = -0.4;
      return;
    }

    const moving = speed > 0.3;
    const run = speed > 5.5;
    this.phase += dt * (moving ? 2.2 + speed * 1.25 : 1.5);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    if (state === 'air') {
      L.hip.rotation.x = -0.6; R.hip.rotation.x = 0.3;
      L.knee.rotation.x = 0.9; R.knee.rotation.x = 0.4;
      L.shoulder.rotation.z = 0.6; R.shoulder.rotation.z = -0.6;
    } else if (moving) {
      const amp = run ? 0.95 : 0.6;
      L.hip.rotation.x = s * amp;
      R.hip.rotation.x = -s * amp;
      L.knee.rotation.x = Math.max(0, -c) * amp * 1.4;
      R.knee.rotation.x = Math.max(0, c) * amp * 1.4;
      L.shoulder.rotation.x = -s * amp * 0.9;
      R.shoulder.rotation.x = s * amp * 0.9;
      L.elbow.rotation.x = R.elbow.rotation.x = run ? -1.1 : -0.35;
      this.body.position.y = Math.abs(s) * (run ? 0.09 : 0.04);
      this.chest.rotation.x = run ? 0.18 : 0.04;
    } else {
      this.chest.rotation.x = Math.sin(this.phase * 0.5) * 0.015;
      L.shoulder.rotation.z = 0.06; R.shoulder.rotation.z = -0.06;
    }

    if (state === 'aim') {
      R.shoulder.rotation.set(-Math.PI / 2 - aimPitch, 0, 0);
      R.elbow.rotation.set(0, 0, 0);
      if (this.weaponMesh && this.weaponMesh.geometry !== geo.pistol) {
        L.shoulder.rotation.set(-Math.PI / 2 - aimPitch, 0.6, 0);
        L.elbow.rotation.set(-0.3, 0, 0);
      }
    } else if (state === 'punch') {
      const k = Math.sin(Math.min(1, t) * Math.PI);
      R.shoulder.rotation.set(-1.5 * k - 0.2, 0, 0);
      R.elbow.rotation.x = -1.2 * (1 - k);
      L.shoulder.rotation.set(-0.8, 0, 0);
      L.elbow.rotation.x = -1.8;
      this.chest.rotation.y = -0.4 * k;
    }
  }
}

/** A random civilian look from the city palette, using rng for repeatable crowds. */
export function civilianLook(rng) {
  return {
    skin: rng.pick(SKINS),
    shirt: rng.pick(SHIRTS),
    pants: rng.pick(PANTS),
    hair: rng.pick(HAIRS),
    shoes: rng.pick(['#222222', '#ffffff', '#8b5a2b', '#c0392b']),
    cap: rng.chance(0.2) ? rng.pick(['#ff6b6b', '#1d3557', '#ffe66d', '#ffffff']) : null,
  };
}

export const LOOKS = {
  kai: { skin: '#b97c55', shirt: '#2ec4b6', pants: '#33364a', hair: '#141414', shoes: '#f4f4f4' },
  cop: { skin: '#d9a47a', shirt: '#2f4f8f', pants: '#1c2541', hair: '#2b2b2b', shoes: '#111111', cap: '#1c2541', badge: true },
  saint: { skin: '#8d5a3b', shirt: '#e9f1f7', pants: '#9aa5b1', hair: '#111111', shoes: '#ffffff', cap: '#bde0fe' },
  nadia: { skin: '#b97c55', shirt: '#ff9f1c', pants: '#3d405b', hair: '#1b1b1b', shoes: '#c0392b' },
  pearl: { skin: '#6b4029', shirt: '#c77dff', pants: '#ffffff', hair: '#d9d9d9', shoes: '#6a4c93' },
  calder: { skin: '#f1c9a5', shirt: '#f8f9fa', pants: '#f8f9fa', hair: '#d9b26f', shoes: '#ced4da', cap: null },
};
