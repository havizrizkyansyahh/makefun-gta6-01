// The third-person camera: an over-the-shoulder orbit on foot that tightens when aiming, a chase
// camera in cars that swings back behind the bonnet when the mouse lets go and widens with speed,
// collision with buildings so walls never hide Kai, recoil kick and shake.
import * as THREE from '../vendor/three.module.min.js';
import { CAMERA } from './config.js';
import { clamp, damp, wrapAngle } from './rng.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = 0.18;
    this.dist = CAMERA.footDistance;
    this.dir = new THREE.Vector3(0, 0, 1);
    this.idle = 10;
    this.recoil = 0;
    this.fov = CAMERA.fov;
    this.sensitivity = CAMERA.sensitivity;
    this.invertY = false;
    this.pivot = new THREE.Vector3();
  }

  kick(a) { this.recoil += a; }

  /** Snap behind a heading (after respawn, entering a car). */
  snap(heading, pitch = 0.18) {
    this.yaw = heading;
    this.pitch = pitch;
  }

  update(dt, world, input) {
    const p = world.player;
    const v = p.vehicle;
    const mdx = input.mouseDX;
    const mdy = input.mouseDY * (this.invertY ? -1 : 1);
    this.yaw -= mdx * this.sensitivity;
    this.pitch = clamp(this.pitch + mdy * this.sensitivity, -0.6, 1.2);
    if (Math.abs(mdx) + Math.abs(mdy) > 0.5) this.idle = 0;
    else this.idle += dt;
    this.pitch -= this.recoil;
    this.recoil = damp(this.recoil, 0, 18, dt);

    let wantDist;
    let wantFov = CAMERA.fov;
    let height;
    let side = 0;
    if (v) {
      const speed = Math.max(0, v.forward);
      // swing back behind the car once the mouse has been still for a moment
      if (this.idle > 1.2 && v.speed > 2) {
        const behind = v.forward < -2 ? v.heading + Math.PI : v.heading;
        this.yaw += wrapAngle(behind - this.yaw) * Math.min(1, dt * 2.6);
        this.pitch = damp(this.pitch, 0.2, 2, dt);
      }
      wantDist = CAMERA.carDistance + v.spec.len * 0.35 + speed * 0.06;
      wantFov = CAMERA.fov + Math.min(14, speed * 0.3);
      height = v.y + v.spec.hgt + 0.6;
      this.pivot.set(v.pos.x, height, v.pos.z);
    } else {
      const aim = p.aiming;
      wantDist = aim ? CAMERA.aimDistance : CAMERA.footDistance;
      wantFov = aim ? CAMERA.fov - 14 : CAMERA.fov;
      side = aim ? 0.75 : 0.55;
      height = p.y + CAMERA.footHeight;
      const rx = -Math.cos(this.yaw);
      const rz = Math.sin(this.yaw);
      this.pivot.set(p.pos.x + rx * side, height, p.pos.z + rz * side);
    }
    this.dist = damp(this.dist, wantDist, 7, dt);
    this.fov = damp(this.fov, wantFov, 6, dt);

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // pull in when a building is between the pivot and the camera
    let d = this.dist;
    const hit = world.city.rayCast(this.pivot.x, this.pivot.y, this.pivot.z, -this.dir.x, -this.dir.y, -this.dir.z, d + 0.4);
    if (hit < Infinity) d = Math.max(0.6, hit - 0.4);
    const cam = this.camera;
    cam.position.set(this.pivot.x - this.dir.x * d, this.pivot.y - this.dir.y * d, this.pivot.z - this.dir.z * d);
    if (cam.position.y < 0.4) cam.position.y = 0.4;
    const shake = world.fx.shake;
    if (shake > 0) {
      cam.position.x += (Math.random() - 0.5) * shake * 0.4;
      cam.position.y += (Math.random() - 0.5) * shake * 0.4;
    }
    cam.lookAt(cam.position.x + this.dir.x, cam.position.y + this.dir.y, cam.position.z + this.dir.z);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
