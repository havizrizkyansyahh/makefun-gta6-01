// The SBPD helicopter: joins the chase from three stars, flies in from the edge of the city,
// circles above the player with a searchlight (its sightings keep the wanted level alive), puts a
// marksman in the door from four stars, and can be shot down, spinning into the ground in flames.
// Channel 6 Bay News flies the same airframe in white and orange to film the story's finale.
import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, mat4 } from './geometry.js';
import { clamp, damp, wrapAngle } from './rng.js';

// two liveries: the SBPD's navy and white, and Channel 6 Bay News's white and orange
const LIVERIES = {
  police: { body: '#1c2541', fin: '#f4f4f4', stripe: '#f4f4f4' },
  news: { body: '#f4f4f0', fin: '#ff7a1a', stripe: '#ff7a1a' },
};
const bodyGeos = new Map();
function heliGeometry(livery = 'police') {
  if (bodyGeos.has(livery)) return bodyGeos.get(livery);
  const L = LIVERIES[livery];
  const P = [];
  const add = (geo, color, m) => P.push({ geo, color, matrix: m });
  add(new THREE.SphereGeometry(1, 24, 16), L.body, mat4(0, 0, 0.3, 1.25, 1.15, 2.1));              // cabin
  add(new THREE.SphereGeometry(1, 20, 12), '#9ec9ff', mat4(0, 0.2, 1.6, 0.95, 0.75, 0.85));          // canopy glass
  add(new THREE.CylinderGeometry(0.22, 0.45, 5.2, 12), L.body, mat4(0, 0.3, -3.4, 1, 1, 1, Math.PI / 2)); // boom
  add(new THREE.BoxGeometry(0.12, 1.4, 0.9), L.fin, mat4(0, 1.0, -5.8));                          // fin
  add(new THREE.BoxGeometry(2.2, 0.1, 0.12), '#2f3338', mat4(0, -1.35, 1.0));                          // skid struts
  add(new THREE.BoxGeometry(2.2, 0.1, 0.12), '#2f3338', mat4(0, -1.35, -0.6));
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.07, 3.6, 4, 8), '#2f3338', mat4(s * 1.05, -1.45, 0.2, 1, 1, 1, Math.PI / 2));
  add(new THREE.BoxGeometry(2.6, 0.3, 0.05), L.stripe, mat4(0, -0.25, 0.3, 1, 1, 46).multiply(mat4(0, 0, 0, 1, 1, 0.02)));
  add(new THREE.CylinderGeometry(0.25, 0.3, 0.5, 10), '#2f3338', mat4(0, 1.25, 0.3));                 // rotor mast
  if (livery === 'news') add(new THREE.SphereGeometry(0.28, 12, 8), '#1a1c20', mat4(0, -1.05, 2.0)); // camera ball
  const geo = mergeParts(P, true);
  bodyGeos.set(livery, geo);
  return geo;
}

export class Helicopter {
  /** opts.news: Channel 6's camera ship, which circles opts.focus (or Kai) and never shoots. */
  constructor(world, x, z, opts = {}) {
    this.world = world;
    this.news = !!opts.news;
    this.focus = opts.focus || null;
    this.group = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4, clearcoat: 0.8 });
    const body = new THREE.Mesh(heliGeometry(this.news ? 'news' : 'police'), mat);
    body.castShadow = true;
    this.body = body;
    this.group.add(body);
    // main and tail rotors: thin blades on spinning hubs
    const blade = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.6 });
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 1.55, 0.3);
    for (let k = 0; k < 4; k += 1) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 5.4), blade);
      b.position.z = 2.7;
      const pivot = new THREE.Group();
      pivot.rotation.y = (k / 4) * Math.PI * 2;
      pivot.add(b);
      this.rotor.add(pivot);
    }
    this.group.add(this.rotor);
    this.tail = new THREE.Group();
    this.tail.position.set(0.25, 1.0, -5.9);
    for (let k = 0; k < 2; k += 1) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.14), blade);
      b.rotation.x = k * Math.PI / 2;
      this.tail.add(b);
    }
    this.group.add(this.tail);
    // searchlight: a real spot light plus a soft visible beam
    this.spot = new THREE.SpotLight('#fff6dd', 0, 140, 0.22, 0.6, 1.2);
    this.spot.position.set(0, -1.2, 1.4);
    // the news ship carries a camera, not a searchlight (and adds no light to the scene)
    if (!this.news) this.group.add(this.spot);
    world.scene.add(this.spot.target);
    const beamGeo = new THREE.ConeGeometry(4.5, 1, 24, 1, true);
    beamGeo.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff3cf', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.frustumCulled = false;
    world.scene.add(this.beam);
    this.nav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.3) }));
    this.nav.position.set(0, -1.1, -1);
    this.group.add(this.nav);
    world.scene.add(this.group);

    this.pos = new THREE.Vector3(x, 70, z);
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.health = 140;
    this.dead = false;
    this.falling = false;
    this.cooldown = 3;
    this.leave = false;
    this.light = new THREE.Vector3(x, 0, z);
  }

  get alive() { return !this.dead && !this.falling; }

  damage(amount) {
    if (!this.alive) return;
    this.health -= amount;
    this.world.fx.spawn('spark', this.pos.x, this.pos.y, this.pos.z, 4);
    if (this.health <= 0) {
      this.falling = true;
      this.world.hud.notify('Police chopper down!');
      this.world.police.report('copKill', this.pos.x, this.pos.z);
    }
  }

  /** Can the crew see (x, z)? Clear sky between the rotor and the target. */
  sees(x, y, z) {
    if (!this.alive) return false;
    return this.world.city.lineOfSight(this.pos.x, this.pos.y - 2, this.pos.z, x, y + 1, z);
  }

  update(dt) {
    const w = this.world;
    const target = this.focus || w.player.where();
    this.rotor.rotation.y += dt * (this.falling ? 14 : 28);
    this.tail.rotation.x += dt * 40;
    this.nav.visible = Math.floor(w.time * 1.5) % 2 === 0;
    if (this.falling) {
      this.vel.y -= 14 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.heading += dt * 5;
      if (Math.random() < dt * 30) w.fx.spawn('smoke', this.pos.x, this.pos.y, this.pos.z);
      if (Math.random() < dt * 20) w.fx.spawn('fire', this.pos.x, this.pos.y, this.pos.z);
      if (this.pos.y <= 1.2) {
        this.dead = true;
        this.falling = false;
        w.fx.explosion(this.pos.x, 0, this.pos.z);
        const at = w.where();
        w.audio.explosion(Math.hypot(this.pos.x - at.x, this.pos.z - at.z));
        for (const n of w.npcs) if (Math.hypot(n.pos.x - this.pos.x, n.pos.z - this.pos.z) < 8) n.hurt(200, this.pos);
        if (Math.hypot(w.player.pos.x - this.pos.x, w.player.pos.z - this.pos.z) < 8) w.hurtPlayer(80, null);
        this.body.material = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 1 });
        this.spot.intensity = 0;
        this.beam.visible = false;
      }
      this.sync();
      return;
    }
    if (this.dead) { this.sync(); return; }

    // orbit the player at a lazy radius, or climb away when the chase is over
    this.angle += dt * 0.25;
    let gx; let gz; let gy;
    if (this.leave) {
      gx = this.pos.x + Math.sin(this.heading) * 200;
      gz = this.pos.z + Math.cos(this.heading) * 200;
      gy = 120;
    } else {
      gx = target.x + Math.cos(this.angle) * 28;
      gz = target.z + Math.sin(this.angle) * 28;
      gy = 42 + Math.sin(w.time * 0.3) * 4;
    }
    const to = new THREE.Vector3(gx - this.pos.x, gy - this.pos.y, gz - this.pos.z);
    const dist = to.length();
    const speed = Math.min(30, dist * 0.8);
    to.normalize().multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, to.x, 1.4, dt);
    this.vel.y = damp(this.vel.y, to.y, 1.4, dt);
    this.vel.z = damp(this.vel.z, to.z, 1.4, dt);
    this.pos.addScaledVector(this.vel, dt);
    // nose into the direction of travel, tilting forward with speed
    const want = Math.atan2(this.vel.x, this.vel.z);
    if (Math.hypot(this.vel.x, this.vel.z) > 2) this.heading += wrapAngle(want - this.heading) * Math.min(1, dt * 1.5);

    // the searchlight drifts onto the player
    this.light.x = damp(this.light.x, target.x, 2.5, dt);
    this.light.z = damp(this.light.z, target.z, 2.5, dt);
    this.light.y = 0;
    this.spot.target.position.copy(this.light);
    this.spot.intensity = this.leave ? 0 : 60 + w.sky.night * 900;

    // the marksman
    this.cooldown -= dt;
    if (!this.news && !this.leave && w.police.stars >= 4 && this.cooldown <= 0 && !w.player.dead) {
      this.cooldown = 1.6 + Math.random() * 1.2;
      const p = w.player;
      const tp = p.vehicle ? p.vehicle.pos : p.pos;
      const ty = p.vehicle ? p.vehicle.y + 1 : p.y + 1.2;
      if (this.sees(tp.x, ty, tp.z)) {
        const hit = Math.random() < clamp(0.35 - (p.vehicle ? p.vehicle.speed : p.moveSpeed) * 0.012, 0.08, 0.35) * w.difficulty;
        const ox = this.pos.x; const oy = this.pos.y - 1.2; const oz = this.pos.z;
        const mx = hit ? tp.x : tp.x + (Math.random() - 0.5) * 6;
        const mz = hit ? tp.z : tp.z + (Math.random() - 0.5) * 6;
        w.fx.tracer(ox, oy, oz, mx, ty, mz, '#cfe3ff');
        w.fx.spawn('muzzle', ox, oy, oz);
        w.audio.shot('pistol', Math.hypot(ox - tp.x, oz - tp.z) * 0.6);
        if (hit) {
          if (p.vehicle) { p.vehicle.damage(6); w.hurtPlayer(2, null); } else w.hurtPlayer(12, null);
        } else w.fx.spawn('dust', mx, 0.2, mz, 2);
      }
    }
    this.sync();
  }

  sync() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.heading, 0);
    const tilt = this.falling ? 0.5 : clamp(Math.hypot(this.vel.x, this.vel.z) * 0.012, 0, 0.25);
    this.body.rotation.x = tilt;
    // beam from the heli down to the lit spot
    const top = new THREE.Vector3(this.pos.x, this.pos.y - 1.2, this.pos.z);
    const len = top.distanceTo(this.light);
    this.beam.position.copy(top);
    this.beam.scale.set(1, len, 1);
    this.beam.lookAt(this.light);
    this.beam.rotateX(-Math.PI / 2);
    this.beam.visible = !this.news && this.alive && !this.leave && this.world.sky.night > 0.4;
    this.beam.material.opacity = 0.012 + Math.max(0, this.world.sky.night - 0.3) * 0.12;
  }

  remove() {
    this.world.scene.remove(this.group, this.beam, this.spot.target);
  }
}
