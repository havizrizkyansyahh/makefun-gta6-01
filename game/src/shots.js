// The screenshot scenes behind ?shot=cover|combat|city|title. Each one builds the real world
// from its seed, sets up a moment of play (a mission step, a wanted level, a car or a gun in
// hand), runs the actual simulation forward with a simple autopilot standing in for the
// player, then renders and sets window.__shotReady so a capture tool can take the frame.
import { LaneDriver } from './traffic.js';
import { Vehicle, MODELS } from './vehicles.js';
import { MISSIONS } from './story.js';
import { Npc } from './npc.js';
import { Helicopter } from './helicopter.js';

const STEP = 1 / 30;

/** Input stand-in: the autopilot presses keys by name. */
function fakeInput() {
  const held = new Set();
  return {
    held,
    mouseDX: 0, mouseDY: 0, wheel: 0, locked: true, enabled: true,
    down: (c) => held.has(c),
    hit: () => false,
    mouse: (b) => held.has(`M${b}`),
    mouseHit: (b) => held.has(`M${b}`),
    axis(neg, pos) { return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0); },
    endFrame() {},
  };
}

function run(world, input, seconds, each) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (each) each(i * STEP);
    world.step(STEP, input);
  }
}

function startMission(world, id, step) {
  const def = MISSIONS.find((m) => m.id === id);
  for (const m of MISSIONS) { if (m === def) break; world.missions.completed.add(m.id); }
  world.missions.start(def);
  while (world.missions.active && world.missions.active.step < step) world.missions.advance();
  world.missions.lines = [];
}

export async function stageShot(name, world, { menu, hud }) {
  const input = fakeInput();
  world.godMode = true;
  if (name === 'title') {
    world.newGame();
    world.player.human.root.visible = false;
    world.hour = 17.9;
    hud.show(false);
    run(world, input, 2);
    const c = world.city.places.nadia;
    world.camera.position.set(c.x + 40, 34, c.z + 58);
    world.camera.lookAt(c.x - 30, 22, c.z - 220);
    world.camera.fov = 55;
    world.camera.updateProjectionMatrix();
    menu.title({ money: 18450, savedAt: Date.UTC(2026, 10, 23, 18, 30), missions: { completed: ['salt-air', 'rinse-cycle', 'broken-glass'] } });
  } else if (name === 'cover') {
    world.newGame();
    world.hour = 17.7;
    const city = world.city;
    // the beach boulevard, heading west with the sun ahead
    const j = 9;
    const a = city.nodeId(4, j);
    const b = city.nodeId(3, j);
    const car = world.traffic.spawnCar({ a, b, t: 0.1 }, 'ardent');
    car.parts.paint.color.set('#e63946');
    car.driver = null;
    world.player.tryEnterVehicle = null;
    world.player.pos.x = car.pos.x; world.player.pos.z = car.pos.z;
    world.player.tryEnter();
    car.vel.x *= 2.5; car.vel.z *= 2.5;
    const pilot = new LaneDriver(world, car, a, b, 'traffic');
    pilot.cruise = 24;
    pilot.clearAhead = () => Infinity; // a getaway driver does not wait for anyone
    world.player.select('pistol');
    // the autopilot takes the wheel after the (empty) keyboard has had its say each step
    const drive = world.player.drive.bind(world.player);
    world.player.drive = (dt, inp) => { drive(dt, inp); if (world.player.vehicle) pilot.update(dt); };
    startMission(world, 'tide-money', 2);
    world.police.set(3);
    world.police.locked = true;
    // three cruisers already on his tail
    for (let k = 0; k < 3; k += 1) {
      const v = world.traffic.spawnCar({ a: city.nodeId(5, j), b: city.nodeId(4, j), t: 0.72 + k * 0.1 }, 'cruiser', 'chase');
      if (v) { v.kind = 'police'; v.siren = true; v.crew = 2; v.armor = 0.65; v.vel.x *= 3; v.vel.z *= 3; }
    }
    run(world, input, 4.2);
    // air support already overhead, behind the cruisers
    if (world.police.heli) world.police.heli.remove();
    world.police.heli = new Helicopter(world, car.pos.x + 70, car.pos.z - 10);
    world.police.heli.pos.y = 26;
    // a front three-quarter view: Kai's car coming at the camera, the cruisers on his tail
    const look = () => { world.rig.yaw = car.heading + Math.PI - 0.55; world.rig.pitch = 0.12; world.rig.idle = 0; };
    look();
    // bring the chopper in low behind the cruisers, inside the frame
    const h = world.police.heli;
    h.heading = car.heading;
    h.update = (dt) => {
      // hold station behind the chase for the frame, rotor turning, searchlight on Kai
      h.pos.set(car.pos.x - car.fx * 60 + car.fz * 6, 13, car.pos.z - car.fz * 60 - car.fx * 6);
      h.rotor.rotation.y += dt * 28;
      h.light.set(car.pos.x, 0, car.pos.z);
      h.spot.target.position.copy(h.light);
      h.sync();
    };
    run(world, input, 0.6, look);
  } else if (name === 'combat') {
    world.newGame();
    world.hour = 15.6;
    startMission(world, 'broken-glass', 1);
    const shop = world.city.places.chopShop;
    const p = world.player;
    p.place(shop.x - 6, shop.z + 49, Math.PI);
    p.give('smg', 200);
    p.select('smg');
    const gang = world.missions.active.ctx.data.gang || [];
    for (const g of gang) g.state = 'combat';
    world.rig.yaw = Math.PI + 0.05;
    world.rig.pitch = 0.06;
    input.held.add('M2');
    let firing = false;
    run(world, input, 5.5, (t) => {
      // aim at the nearest Saint still standing; fire in bursts
      const alive = gang.filter((g) => !g.dead).sort((a, b) => Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) - Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z));
      const target = alive[0];
      if (target) {
        world.rig.yaw = Math.atan2(target.pos.x - p.pos.x, target.pos.z - p.pos.z) + 0.04;
        world.rig.pitch = 0.03;
      }
      firing = t > 3.2 || Math.floor(t * 2) % 3 === 0;
      if (firing && alive.length > 2) input.held.add('M0'); else input.held.delete('M0');
    });
    input.held.add('M0');
    run(world, input, 0.12);
  } else if (name === 'city') {
    world.newGame();
    world.hour = 18.85;
    const city = world.city;
    const p = world.player;
    // Kai on a Sprint 250, heading west past Sunstone Plaza into the towers of Corvel Heights
    const a = city.nodeId(5, 5);
    const b = city.nodeId(4, 5);
    const bike = world.traffic.spawnCar({ a, b, t: 0.15 }, 'sprint');
    bike.parts.paint.color.set('#ffb703');
    bike.driver = null;
    p.pos.x = bike.pos.x; p.pos.z = bike.pos.z;
    p.tryEnter();
    bike.vel.x *= 2; bike.vel.z *= 2;
    const pilot = new LaneDriver(world, bike, a, b, 'traffic');
    pilot.cruise = 14;
    pilot.clearAhead = () => Infinity;
    const drive = p.drive.bind(p);
    p.drive = (dt, inp) => { drive(dt, inp); if (p.vehicle) pilot.update(dt); };
    world.traffic.update(0, true);
    const look = () => { world.rig.yaw = bike.heading + 0.3; world.rig.pitch = 0.07; world.rig.idle = 0; };
    look();
    run(world, input, 2.4, look);
  }
  // only the play itself in the frame: no leftover title cards or notices
  hud.el.notes.innerHTML = '';
  hud.bigT = 0;
  hud.el.big.classList.remove('on');
  void Vehicle; void MODELS; void Npc;
  world.render();
  hud.update(0);
  world.render();
  window.__shotReady = true;
}
