// Traffic signals: every inner intersection gets four signal masts (one per approach) whose red,
// amber and green lamps cycle on a timer, staggered across the grid. Traffic asks state() before
// it crosses and waits at the stop line on red; the lamps glow (and bloom) at night, and in the
// small hours the whole grid drops to flashing amber.
import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';
import { mat4 } from './geometry.js';

const CYCLE = 20;      // seconds for both directions
const GREEN = 8;       // green time per direction; then 2 s amber
const N = CITY.blocks;

export class Signals {
  constructor(scene, city) {
    this.city = city;
    this.heads = [];      // { node, axis }
    const poles = [];
    const arms = [];
    const boxes = [];
    const RH = CITY.roadHalf;
    for (const [id, n] of city.nodes.entries()) {
      if (n.i === 0 || n.j === 0 || n.i === N || n.j === N) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        // the mast stands on the near right corner of the approach, its arm reaching over the lane
        const rx = -dz;
        const rz = dx;
        const px = n.x - dx * (RH + 1.3) + rx * (RH + 1.3);
        const pz = n.z - dz * (RH + 1.3) + rz * (RH + 1.3);
        const hx = px - rx * 4.2;
        const hz = pz - rz * 4.2;
        const face = Math.atan2(-dx, -dz);
        poles.push(mat4(px, 2.9, pz));
        city.addCollider(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15, 6, 'lamp');
        arms.push(mat4((px + hx) / 2, 5.75, (pz + hz) / 2, 1, 1, 1, 0, Math.atan2(rx, rz)));
        boxes.push(mat4(hx, 5.0, hz, 1, 1, 1, 0, face));
        this.heads.push({ node: id, axis: dx !== 0 ? 'x' : 'z', x: hx, z: hz, face });
      }
    }
    const metal = new THREE.MeshStandardMaterial({ color: '#2f3338', roughness: 0.5, metalness: 0.6 });
    const inst = (geo, mat, list) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((x, i) => m.setMatrixAt(i, x));
      m.castShadow = true;
      scene.add(m);
      this.meshes.push(m);
      return m;
    };
    this.meshes = [];
    inst(new THREE.CylinderGeometry(0.09, 0.12, 5.8, 8), metal, poles);
    inst(new THREE.BoxGeometry(0.1, 0.1, 4.4), metal, arms);
    inst(new THREE.BoxGeometry(0.42, 1.25, 0.32), new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.6 }), boxes);
    // three lamp layers, coloured per instance each tick
    const lampGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.lamps = [0.38, 0, -0.38].map((dy) => {
      const list = this.heads.map((h) => mat4(h.x + Math.sin(h.face) * 0.17, 5.0 + dy, h.z + Math.cos(h.face) * 0.17));
      const m = inst(lampGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), list);
      m.castShadow = false;
      for (let i = 0; i < list.length; i += 1) m.setColorAt(i, new THREE.Color('#000000'));
      return m;
    });
    this.colors = {
      red: new THREE.Color(3.2, 0.25, 0.15), amber: new THREE.Color(3.0, 1.6, 0.1), green: new THREE.Color(0.2, 2.6, 0.9),
      off: new THREE.Color(0.06, 0.06, 0.06),
    };
    this.time = 0;
    this.tick = 0;
  }

  /** Phase offset per intersection so the grid does not change in lockstep. */
  offset(node) {
    const n = this.city.nodes[node];
    return ((n.i * 3 + n.j * 7) % 10) * 2;
  }

  /**
   * 'green' | 'amber' | 'red' for traffic moving along axis ('x' or 'z') into node; in the small
   * hours ('flash') every inner junction blinks amber and drivers slow down and go on through.
   */
  state(node, axis) {
    const n = this.city.nodes[node];
    if (n.i === 0 || n.j === 0 || n.i === N || n.j === N) return 'green';
    if (this.flashing) return 'flash';
    const t = (this.time + this.offset(node)) % CYCLE;
    const local = axis === 'x' ? t : (t + CYCLE / 2) % CYCLE;
    if (local < GREEN) return 'green';
    if (local < GREEN + 2) return 'amber';
    return 'red';
  }

  update(dt, hour = 12) {
    this.time += dt;
    this.tick -= dt;
    // between 01:30 and 05:00 the lights go to flashing amber
    this.flashing = hour > 1.5 && hour < 5;
    if (this.tick > 0) return;
    this.tick = 0.2;
    const [red, amber, green] = this.lamps;
    const blink = Math.floor(this.time * 1.6) % 2 === 0;
    this.heads.forEach((h, i) => {
      let s = this.state(h.node, h.axis);
      if (s === 'flash') s = blink ? 'amber' : 'off';
      red.setColorAt(i, s === 'red' ? this.colors.red : this.colors.off);
      amber.setColorAt(i, s === 'amber' ? this.colors.amber : this.colors.off);
      green.setColorAt(i, s === 'green' ? this.colors.green : this.colors.off);
    });
    for (const m of this.lamps) m.instanceColor.needsUpdate = true;
  }

  /** Hide the masts while Kai is indoors (nothing outside can be seen anyway). */
  setVisible(on) {
    for (const m of this.meshes) m.visible = on;
  }
}
