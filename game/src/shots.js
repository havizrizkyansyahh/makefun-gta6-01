// The screenshot scenes behind ?shot=cover|combat|city|title. Each one builds the real world
// from its seed, sets up a moment of play (a mission step, a wanted level, a car or a gun in
// hand), runs the actual simulation forward with a simple autopilot standing in for the
// player, then renders and sets window.__shotReady so a capture tool can take the frame.
import { LaneDriver } from './traffic.js';
import { Vehicle, MODELS } from './vehicles.js';
import { MISSIONS } from './story.js';
import { Npc } from './npc.js';

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
    const a = city.nodeId(6, j);
    const b = city.nodeId(5, j);
    const car = world.traffic.spawnCar({ a, b, t: 0.1 }, 'ardent');
    car.parts.paint.color.set('#e63946');
    car.driver = null;
    world.player.tryEnterVehicle = null;
    world.player.pos.x = car.pos.x; world.player.pos.z = car.pos.z;
    world.player.tryEnter();
    const pilot = new LaneDriver(world, car, a, b, 'traffic');
    pilot.cruise = 27;
    startMission(world, 'tide-money', 2);
    world.police.set(3);
    world.police.locked = true;
    // three cruisers already on his tail
    for (let k = 0; k < 3; k += 1) {
      const v = world.traffic.spawnCar({ a: city.nodeId(7, j), b: city.nodeId(6, j), t: 0.25 + k * 0.22 }, 'cruiser', 'chase');
      if (v) { v.kind = 'police'; v.siren = true; v.crew = 2; v.ai.cruise = 30; }
    }
    run(world, input, 5.2, () => { pilot.update(); });
    world.rig.yaw = car.heading + 0.32;
    world.rig.pitch = 0.16;
    world.rig.idle = 0;
    run(world, input, 0.6, () => { pilot.update(); world.rig.idle = 0; });
  } else if (name === 'combat') {
    world.newGame();
    world.hour = 15.2;
    startMission(world, 'broken-glass', 1);
    const shop = world.city.places.chopShop;
    const p = world.player;
    p.place(shop.x - 3, shop.z + 52, Math.PI);
    p.give('smg', 200);
    p.select('smg');
    const gang = world.missions.active.ctx.data.gang || [];
    for (const g of gang) g.state = 'combat';
    world.rig.yaw = Math.PI + 0.05;
    world.rig.pitch = 0.08;
    input.held.add('M2');
    input.held.add('M0');
    run(world, input, 1.6, () => {
      const t = gang.find((g) => !g.dead);
      if (t) {
        const dx = t.pos.x - p.pos.x;
        const dz = t.pos.z - p.pos.z;
        world.rig.yaw = Math.atan2(dx, dz);
        world.rig.pitch = 0.02;
      }
    });
  } else if (name === 'city') {
    world.newGame();
    world.hour = 13.5;
    const pl = world.city.places.nadia;
    const p = world.player;
    p.place(pl.x + 30, pl.z - 16, -Math.PI / 2);
    input.held.add('KeyW');
    world.rig.yaw = -Math.PI / 2 - 0.55;
    world.rig.pitch = 0.12;
    run(world, input, 2.5);
    input.held.clear();
    run(world, input, 0.8);
  }
  void Vehicle; void MODELS; void Npc;
  world.render();
  hud.update(0);
  world.render();
  window.__shotReady = true;
}
