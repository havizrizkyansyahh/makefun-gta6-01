// Tyre marks: whenever a car slides, brakes hard or spins its wheels, dark rubber strips are laid
// on the road behind its rear wheels. A ring buffer of instanced quads keeps the newest 1600
// pieces, so the streets slowly collect the history of every chase. Boats leave none.
import * as THREE from '../vendor/three.module.min.js';

const COUNT = 1600;

export class SkidMarks {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(0.26, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#15161a', transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < COUNT; i += 1) this.mesh.setMatrixAt(i, zero);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.cursor = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /** Lay one strip from a to b on the ground. */
  strip(ax, az, bx, bz, y) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
    this.m.compose(new THREE.Vector3((ax + bx) / 2, y + 0.03, (az + bz) / 2), this.q, new THREE.Vector3(1, 1, len + 0.05));
    this.mesh.setMatrixAt(this.cursor, this.m);
    this.cursor = (this.cursor + 1) % COUNT;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Wipe the streets clean (a new game). */
  clear() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < COUNT; i += 1) this.mesh.setMatrixAt(i, zero);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cursor = 0;
  }

  update(vehicles, city) {
    for (const v of vehicles) {
      // boats leave a wake, not rubber
      if (v.spec.body === 'boat') continue;
      const sliding = !v.dead && v.speed > 4 && (v.skid > 0.45 || (v.input.handbrake && v.speed > 6) || (v.input.throttle < -0.5 && v.forward > 9));
      if (!sliding) { v.skidLast = null; continue; }
      const bike = v.spec.body === 'bike';
      const back = v.halfLen * 0.62;
      const side = bike ? [0] : [v.spec.wid / 2 - 0.28, -(v.spec.wid / 2 - 0.28)];
      const c = Math.cos(v.heading);
      const s = Math.sin(v.heading);
      const pts = side.map((o) => ({ x: v.pos.x - v.fx * back + c * o, z: v.pos.z - v.fz * back - s * o }));
      if (v.skidLast) {
        pts.forEach((p, i) => {
          const l = v.skidLast[i];
          if (Math.hypot(p.x - l.x, p.z - l.z) > 0.35) {
            this.strip(l.x, l.z, p.x, p.z, city.groundHeight(p.x, p.z));
            v.skidLast[i] = p;
          }
        });
      } else v.skidLast = pts;
    }
  }
}
