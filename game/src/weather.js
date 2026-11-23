// Weather over the bay: mostly sunshine, with passing showers. Rain is thousands of streaks that
// follow the camera, the sky clouds over and the sun dims, fog closes in, roads and pavements go
// dark and glossy (they mirror the sky and every headlight), rain hisses, and night storms throw
// lightning with thunder a moment later.
import * as THREE from '../vendor/three.module.min.js';

const DROPS = 5000;
const BOX = { x: 70, y: 40, z: 70 };

export class Weather {
  constructor(world) {
    this.world = world;
    this.rain = 0;          // current wetness of the air, 0..1
    this.target = 0;
    this.wet = 0;           // how wet the ground is (lags the rain)
    this.timer = 90 + Math.random() * 120;
    this.flash = 0;
    this.thunder = 0;
    const pos = new Float32Array(DROPS * 6);
    this.speed = new Float32Array(DROPS);
    for (let i = 0; i < DROPS; i += 1) {
      const x = (Math.random() - 0.5) * BOX.x;
      const y = Math.random() * BOX.y;
      const z = (Math.random() - 0.5) * BOX.z;
      pos.set([x, y, z, x, y + 0.6, z], i * 6);
      this.speed[i] = 24 + Math.random() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#b9c7d6', transparent: true, opacity: 0, depthWrite: false }));
    this.lines.frustumCulled = false;
    world.scene.add(this.lines);
  }

  /** Force a state (screenshots, debugging): 0 clear .. 1 downpour. */
  set(amount) {
    this.rain = this.target = this.wet = amount;
    this.timer = 400;
  }

  update(dt) {
    const w = this.world;
    // pick the next weather now and then: about one shower in three
    this.timer -= dt;
    if (this.timer <= 0) {
      this.target = Math.random() < 0.33 ? 0.6 + Math.random() * 0.4 : 0;
      this.timer = this.target > 0 ? 70 + Math.random() * 80 : 150 + Math.random() * 200;
    }
    this.rain += Math.sign(this.target - this.rain) * Math.min(Math.abs(this.target - this.rain), dt * 0.05);
    this.wet += Math.sign(this.rain - this.wet) * Math.min(Math.abs(this.rain - this.wet), dt * (this.rain > this.wet ? 0.08 : 0.012));

    // streaks fall around the camera, slanted by the sea breeze
    const cam = w.camera.position;
    this.lines.position.set(cam.x, cam.y - 12, cam.z);
    this.lines.material.opacity = this.rain * 0.55;
    this.lines.visible = this.rain > 0.02;
    if (this.lines.visible) {
      const a = this.lines.geometry.attributes.position.array;
      for (let i = 0; i < DROPS; i += 1) {
        const o = i * 6;
        const fall = this.speed[i] * dt;
        let y = a[o + 1] - fall;
        let x = a[o] + fall * 0.12;
        if (y < 0) { y += BOX.y; x = (Math.random() - 0.5) * BOX.x; a[o + 2] = a[o + 5] = (Math.random() - 0.5) * BOX.z; }
        if (x > BOX.x / 2) x -= BOX.x;
        a[o] = x; a[o + 1] = y;
        a[o + 3] = x - 0.08; a[o + 4] = y + 0.7;
      }
      this.lines.geometry.attributes.position.needsUpdate = true;
    }

    // lightning in a night downpour
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.rain > 0.7 && w.sky.night > 0.5 && Math.random() < dt * 0.06) {
      this.flash = 1;
      this.thunder = 0.6 + Math.random() * 1.5;
    }
    if (this.thunder > 0) {
      this.thunder -= dt;
      if (this.thunder <= 0) w.audio.thunder();
    }
    if (w.post) w.post.composite.uniforms.uFlash.value = this.flash * this.flash * 0.35;
    w.audio.rain(this.rain);
  }

  /** Dim the sun, thicken the cloud and pull the fog in to match the rain. */
  applyToSky(sky, scene) {
    const r = this.rain;
    sky.uniforms.uCloud.value = 0.35 + r * 0.9;
    sky.sun.intensity *= 1 - r * 0.75;
    sky.uniforms.uSunColor.value.multiplyScalar(1 - r * 0.6);
    const grey = new THREE.Color('#7d8794');
    sky.uniforms.uHorizon.value.lerp(grey, r * 0.7);
    sky.uniforms.uZenith.value.lerp(grey.clone().multiplyScalar(0.8), r * 0.75);
    scene.fog.color.lerp(grey, r * 0.7);
    scene.fog.near = 220 - r * 170;
    scene.fog.far = 1300 - r * 880;
  }
}
