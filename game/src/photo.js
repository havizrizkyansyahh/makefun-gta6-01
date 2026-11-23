// Photo mode: press P while playing and the world holds its breath. The HUD goes, the camera
// comes loose (WASD to fly, the mouse to look, Space and Ctrl or Q and E to rise and sink, Shift
// to hurry, the wheel to zoom) and F cycles a few looks through the game's own colour grade:
// Natural, Golden Hour, Noir, Vivid and Teal Night. P or Esc goes back to the moment it froze.
import { clamp } from './rng.js';

const FILTERS = [
  { name: 'Natural', exposure: 0.9, saturation: 1.18, desat: 0, vignette: 0.9 },
  { name: 'Golden Hour', exposure: 1.0, saturation: 1.3, desat: 0, vignette: 1.2, warm: 1 },
  { name: 'Noir', exposure: 0.95, saturation: 1.0, desat: 1, vignette: 1.6 },
  { name: 'Vivid', exposure: 0.95, saturation: 1.55, desat: 0, vignette: 0.7 },
  { name: 'Teal Night', exposure: 0.8, saturation: 1.1, desat: 0.25, vignette: 1.3, teal: 1 },
];

export class PhotoMode {
  constructor(world, hudRoot) {
    this.world = world;
    this.hudRoot = hudRoot;
    this.on = false;
    this.filter = 0;
    this.overlay = document.createElement('div');
    this.overlay.className = 'photo-ui';
    this.overlay.style.display = 'none';
    document.body.appendChild(this.overlay);
  }

  enter() {
    const w = this.world;
    const cam = w.camera;
    this.on = true;
    this.saved = {
      pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov,
      uniforms: this.grade(),
    };
    this.yaw = w.rig.yaw;
    this.pitch = w.rig.pitch;
    this.fov = cam.fov;
    this.anchor = cam.position.clone();
    this.hudRoot.style.visibility = 'hidden';
    this.overlay.style.display = 'block';
    this.draw();
    w.audio.ui('select');
  }

  exit() {
    const w = this.world;
    const cam = w.camera;
    this.on = false;
    cam.position.copy(this.saved.pos);
    cam.quaternion.copy(this.saved.quat);
    cam.fov = this.saved.fov;
    cam.updateProjectionMatrix();
    const u = w.post.composite.uniforms;
    Object.entries(this.saved.uniforms).forEach(([k, v]) => { if (u[k].value.copy) u[k].value.copy(v); else u[k].value = v; });
    this.hudRoot.style.visibility = '';
    this.overlay.style.display = 'none';
    w.audio.ui('move');
  }

  /** The grade uniforms photo mode touches, as they were. */
  grade() {
    const u = this.world.post.composite.uniforms;
    return { uExposure: u.uExposure.value, uSaturation: u.uSaturation.value, uDesat: u.uDesat.value, uVignette: u.uVignette.value, uWarm: u.uWarm.value, uLift: u.uLift.value.clone() };
  }

  applyFilter() {
    const f = FILTERS[this.filter];
    const u = this.world.post.composite.uniforms;
    const s = this.saved.uniforms;
    u.uExposure.value = f.exposure;
    u.uSaturation.value = f.saturation;
    u.uDesat.value = f.desat;
    u.uVignette.value = f.vignette;
    u.uWarm.value = f.warm || s.uWarm;
    u.uLift.value.copy(s.uLift);
    if (f.teal) u.uLift.value.set(-0.02, 0.025, 0.05);
  }

  update(dt, input) {
    const w = this.world;
    const cam = w.camera;
    const sens = w.rig.sensitivity;
    this.yaw -= input.mouseDX * sens;
    this.pitch = clamp(this.pitch + input.mouseDY * sens * (w.rig.invertY ? -1 : 1), -1.4, 1.4);
    if (input.wheel) this.fov = clamp(this.fov + input.wheel * 3, 14, 90);
    if (input.hit('KeyF')) { this.filter = (this.filter + 1) % FILTERS.length; this.applyFilter(); this.draw(); w.audio.ui('move'); }
    const speed = (input.down('ShiftLeft') || input.down('ShiftRight') ? 22 : 7) * dt;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const fwd = input.axis('KeyS', 'KeyW', 'ArrowDown', 'ArrowUp');
    const side = input.axis('KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight');
    const up = input.axis('ControlLeft', 'Space') + input.axis('KeyQ', 'KeyE');
    const p = cam.position;
    p.x += (fx * fwd - fz * side) * speed;
    p.z += (fz * fwd + fx * side) * speed;
    p.y += up * speed;
    // stay within reach of where the photo was frozen, and above the ground
    const dx = p.x - this.anchor.x;
    const dz = p.z - this.anchor.z;
    const d = Math.hypot(dx, dz);
    if (d > 60) { p.x = this.anchor.x + (dx / d) * 60; p.z = this.anchor.z + (dz / d) * 60; }
    p.y = clamp(p.y, w.city.groundHeight(p.x, p.z) + 0.3, this.anchor.y + 40);
    const cp = Math.cos(this.pitch);
    cam.lookAt(p.x + fx * cp, p.y - Math.sin(this.pitch), p.z + fz * cp);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  draw() {
    this.overlay.innerHTML = `<b>PHOTO MODE</b><span>${FILTERS[this.filter].name}</span>
      <small>WASD fly · mouse look · Space / Ctrl rise and sink · Shift faster · wheel zoom · F filter · P exit</small>`;
  }
}
