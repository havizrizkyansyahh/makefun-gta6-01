// World markers and pickups: the glowing beam and ground ring that show where a mission step
// waits, the bouncing arrow over a target, and spinning pickups (sun shells, cash, ammo, health,
// armour) the player collects by walking or driving through them.
import * as THREE from '../vendor/three.module.min.js';

const beamGeo = new THREE.CylinderGeometry(1, 1, 14, 24, 1, true);
beamGeo.translate(0, 7, 0);
const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 36);
ringGeo.rotateX(Math.PI / 2);
const arrowGeo = new THREE.ConeGeometry(0.45, 0.9, 4);
arrowGeo.rotateX(Math.PI);

export class Marker {
  constructor(scene, x, z, color = '#ffd23f', radius = 2.4, y = 0) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.color = color;
    this.group = new THREE.Group();
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.scale.set(radius, 1, radius);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color }));
    ring.scale.set(radius, 1, radius);
    ring.position.y = 0.25;
    const arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color }));
    arrow.position.y = 4;
    this.arrow = arrow;
    this.group.add(beam, ring, arrow);
    this.group.position.set(x, y, z);
    scene.add(this.group);
    this.t = Math.random() * 6;
  }

  update(dt) {
    this.t += dt;
    this.arrow.position.y = 3.4 + Math.sin(this.t * 3) * 0.35;
    this.arrow.rotation.y += dt * 2;
  }

  inside(x, z, extra = 0) {
    const dx = x - this.x;
    const dz = z - this.z;
    return dx * dx + dz * dz < (this.radius + extra) * (this.radius + extra);
  }

  remove() { this.scene.remove(this.group); }
}

/** A bouncing arrow that follows an entity (a target car or person). */
export class TargetArrow {
  constructor(scene, color = '#ff4d4d') {
    this.scene = scene;
    this.mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color }));
    this.mesh.scale.setScalar(0.8);
    scene.add(this.mesh);
    this.t = 0;
  }

  follow(dt, x, y, z) {
    this.t += dt;
    this.mesh.position.set(x, y + Math.sin(this.t * 4) * 0.25, z);
    this.mesh.rotation.y += dt * 3;
  }

  remove() { this.scene.remove(this.mesh); }
}

const PICKUP_LOOK = {
  shell: { color: '#ffb3c7', emissive: '#ff6f9f', geo: () => new THREE.ConeGeometry(0.4, 0.5, 9) },
  cash: { color: '#6dff8a', emissive: '#1fbf4a', geo: () => new THREE.BoxGeometry(0.6, 0.3, 0.35) },
  ammo: { color: '#ffcf4d', emissive: '#b78100', geo: () => new THREE.BoxGeometry(0.5, 0.35, 0.35) },
  health: { color: '#ffffff', emissive: '#ff3b3b', geo: () => new THREE.BoxGeometry(0.55, 0.55, 0.2) },
  armor: { color: '#7ab8ff', emissive: '#1e5bd6', geo: () => new THREE.CylinderGeometry(0.35, 0.3, 0.5, 8) },
};

export class Pickup {
  constructor(scene, kind, x, z, y = 0, data = {}) {
    const look = PICKUP_LOOK[kind];
    this.scene = scene;
    this.kind = kind;
    this.data = data;
    this.x = x;
    this.z = z;
    this.baseY = y + 0.8;
    this.mesh = new THREE.Mesh(look.geo(), new THREE.MeshStandardMaterial({ color: look.color, emissive: look.emissive, emissiveIntensity: 0.8 }));
    this.mesh.position.set(x, this.baseY, z);
    scene.add(this.mesh);
    this.t = Math.random() * 6;
    this.taken = false;
  }

  update(dt) {
    this.t += dt;
    this.mesh.rotation.y += dt * 2.2;
    this.mesh.position.y = this.baseY + Math.sin(this.t * 2.5) * 0.15;
  }

  remove() { this.scene.remove(this.mesh); this.taken = true; }
}
