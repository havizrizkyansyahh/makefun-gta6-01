// The screenshot scenes behind ?shot=cover|crowd|map|title (the four in shots.json) and the
// extra ones used to check the newer places: combat, city, night, garage, apartment, laundry,
// range, boutique, yacht and buoys. Each one builds the real world from its seed, sets up a
// moment of play (a mission step, a wanted level, a car or a gun in hand, a room, a shop
// screen), runs the actual simulation forward with a simple autopilot standing in for the
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
  const pressed = new Set();
  return {
    held,
    pressed,
    mouseDX: 0, mouseDY: 0, wheel: 0, locked: true, enabled: true,
    down: (c) => held.has(c),
    hit: (c) => pressed.has(c),
    mouse: (b) => held.has(`M${b}`),
    mouseHit: (b) => held.has(`M${b}`),
    axis(neg, pos) { return (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0); },
    consume: (c) => pressed.delete(c),
    hitAny: (...codes) => codes.some((c) => pressed.has(c)),
    endFrame() { pressed.clear(); },
  };
}

function run(world, input, seconds, each) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i += 1) {
    if (each) each(i * STEP);
    world.step(STEP, input);
    input.endFrame();
  }
}

/** Press keys for one step each, in order (the autopilot working a shop screen). */
function tap(world, input, ...codes) {
  for (const c of codes) {
    input.pressed.add(c);
    world.step(STEP, input);
    input.endFrame();
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
    // Kai's own Ardent, fresh out of Torque & Tide: coral paint, gold rims, teal underglow
    car.applyMods({ color: '#e63946', rims: '#ffc84a', neon: '#2de2ff', engine: 2, tint: 1 });
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
  else if (name === 'night') {
    // the Bayside Run on a rainy night: wet streets, neon, rivals' tail lights
    world.newGame();
    world.hour = 21.3;
    world.weather.set(1);
    const race = world.missions.race;
    const r = race.route;
    const p = world.player;
    const car = world.traffic.spawnCar({ a: r[0], b: r[1], t: 0.02 }, 'bayrunner');
    car.parts.paint.color.set('#e63946');
    car.driver = null;
    p.pos.x = car.pos.x; p.pos.z = car.pos.z;
    p.tryEnter();
    race.begin();
    race.active.countdown = 0;
    race.active.rivals.forEach((c, k) => { c.ai.hold = false; c.ai.cruise = 21 - k * 1.5; });
    const pilot = new LaneDriver(world, car, r[0], r[1], 'race');
    pilot.route = r;
    pilot.ri = 1;
    pilot.cruise = 30;
    pilot.clearAhead = () => Infinity;
    const drive = p.drive.bind(p);
    p.drive = (dt, inp) => { drive(dt, inp); if (p.vehicle) pilot.update(dt); };
    const look = () => { world.rig.yaw = car.heading + 0.3; world.rig.pitch = 0.17; world.rig.idle = 0; };
    look();
    run(world, input, 4.6, look);
  }
  else if (name === 'crowd') {
    // a busy afternoon in Sunstone Plaza: shoppers, strollers and loiterers under the towers
    world.newGame();
    world.hour = 16.4;
    const city = world.city;
    const t = city.places.tower;
    const p = world.player;
    p.place(t.x + 4, t.z + 33, Math.PI);
    p.give('pistol', 48);
    p.select('pistol');
    // dressed from Threadline: olive bomber, chalk tee, sand chinos, teal cap, shades
    const o = world.outfits;
    for (const id of ['bomber-olive', 'tee-chalk', 'chinos-sand', 'cap-teal', 'shades']) o.owned.add(id);
    Object.assign(o.equipped, { jacket: 'bomber-olive', top: 'tee-chalk', legs: 'chinos-sand', head: 'cap-teal', eyes: 'shades' });
    o.apply();
    const rng = world.rng;
    const loops = city.loops.filter((l) => Math.abs((l.x0 + l.x1) / 2 - t.x) < 100 && Math.abs((l.z0 + l.z1) / 2 - t.z) < 100);
    for (let k = 0; k < 70; k += 1) {
      if (k < 40) {
        // strolling the plaza between the fountain and the palms
        const a = rng.next() * Math.PI * 2;
        const r = rng.range(9, 30);
        const n = new Npc(world, 'civ', t.x + Math.cos(a) * r, t.z + Math.sin(a) * r, { state: 'idle', heading: rng.range(-Math.PI, Math.PI) });
        n.timer = 1e9;
        if (rng.chance(0.55)) {
          // walking somewhere across the plaza
          n.state = 'flee';
          n.threat = { x: n.pos.x - Math.cos(n.heading) * 5, z: n.pos.z - Math.sin(n.heading) * 5 };
          n.timer = 1e9;
        }
        world.npcs.push(n);
      } else {
        const loop = rng.pick(loops);
        const n = new Npc(world, 'civ', loop.x0, loop.z0, { loop });
        n.s = rng.range(0, 2 * (loop.x1 - loop.x0 + loop.z1 - loop.z0));
        world.npcs.push(n);
      }
    }
    // strollers, not runners
    for (const n of world.npcs) if (n.state === 'flee') { n.walkSpeed = rng.range(1.1, 1.6); }
    const walkers = world.npcs.filter((n) => n.state === 'flee');
    world.rig.yaw = Math.PI + 0.25;
    world.rig.pitch = 0.1;
    run(world, input, 3, () => {
      for (const n of walkers) { n.speed = Math.min(n.speed, n.walkSpeed); n.timer = 1e9; }
      world.rig.yaw = Math.PI + 0.25; world.rig.pitch = 0.1;
    });
    world.hud.weapons.stripT = 2;
  } else if (name === 'map') {
    // the pause menu's city map, mid-story
    world.newGame();
    world.hour = 16.4;
    for (const id of ['salt-air', 'rinse-cycle', 'broken-glass']) world.missions.completed.add(id);
    world.money = 18450;
    for (const k of [0, 3, 5, 8]) { world.missions.shellsFound.add(k); world.missions.shells[k].remove(); }
    const p = world.player;
    const c = world.city.places.gunshop;
    p.place(c.x - 30, c.z + 12, -Math.PI / 2);
    run(world, input, 1.5);
    // a waypoint up in Verde Hills, so the GPS route shows
    const h = world.city.places.hospital;
    world.setWaypoint(h.x + 6, h.z + 10);
    hud.show(false);
    menu.hide();
    menu.pause(world);
    menu.map(world);
    // zoom in on the south of the city and hover over Nadia, to open her card
    const view = menu.mapView;
    const n = world.missions.contactMarker;
    view.focus((p.pos.x + n.x) / 2 - 30, (p.pos.z + n.z) / 2 - 60, 1.75);
    const [mx, my] = view.toScreen(n.x, n.z);
    view.mouse = { x: mx, y: my };
    await new Promise((r) => setTimeout(r, 400));
  }
  else if (name === 'garage') {
    // a Bayrunner on the Torque & Tide turntable at sunset, mid-respray
    world.newGame();
    world.hour = 18.2;
    const p = world.player;
    const b = world.garage.bayPos;
    const car = new Vehicle(world.scene, 'bayrunner', '#fb8500', b.x, b.z, 0);
    car.y = world.city.groundHeight(b.x, b.z);
    world.vehicles.push(car);
    world.money = 9000;
    p.pos.x = b.x + 1.5; p.pos.z = b.z;
    p.tryEnter();
    run(world, input, 0.4);
    tap(world, input, 'KeyE', 'KeyS', 'KeyD', 'KeyD', 'Enter', 'KeyS', 'KeyS', 'KeyS', 'KeyS', 'KeyD', 'KeyD', 'Enter', 'KeyS', 'KeyS', 'KeyD', 'KeyD');
    run(world, input, 1.2);
  } else if (['apartment', 'laundry', 'boutique'].includes(name)) {
    world.newGame();
    world.hour = 19.5;
    world.interiors.enter(name, { silent: true });
    const p = world.player;
    if (name === 'boutique') {
      const r = world.interiors.get('boutique');
      p.place(r.X(6.2), r.Z(-4.0), Math.PI);
      world.money = 2000;
      world.outfits.openStore();
      tap(world, input, 'KeyD', 'KeyS', 'KeyS');
    } else {
      world.rig.yaw = Math.PI + 0.4;
      world.rig.pitch = 0.15;
    }
    run(world, input, 1.5);
  } else if (name === 'range') {
    // a range session in full swing, Viper in hand down lane 4
    world.newGame();
    const p = world.player;
    p.give('smg', 300);
    p.select('smg');
    const r = world.interiors.get('gunshop');
    world.interiors.enter('gunshop', { silent: true, at: { x: r.booth.x, z: 1.0, face: Math.PI } });
    world.money = 500;
    world.activities.range.start();
    input.held.add('M2');
    run(world, input, 4, (t) => {
      const up = world.activities.range.targets.find((x) => x.want > 0 && x.up > 0.9 && !x.friendly);
      if (up) {
        // aim the crosshair (the camera's line, beside Kai's shoulder) at the board
        const c = world.camera.position;
        world.rig.yaw = Math.atan2(up.x - c.x, up.z - c.z);
        world.rig.pitch = -Math.atan2(1.35 - c.y, Math.hypot(up.x - c.x, up.z - c.z));
      }
      if (Math.floor(t * 3) % 2 === 0) input.held.add('M0'); else input.held.delete('M0');
    });
  } else if (name === 'yacht' || name === 'buoys') {
    world.newGame();
    world.hour = name === 'yacht' ? 17.4 : 15.5;
    const p = world.player;
    if (name === 'yacht') startMission(world, 'low-tide', 1);
    const y = name === 'yacht' ? world.missions.active.ctx.data.yacht : null;
    const st = world.city.places.buoyRun;
    const boat = new Vehicle(world.scene, 'marisol', '#f4f4f0', y ? y.pos.x + 9 : st.x, y ? y.pos.z - 26 : st.z, 0);
    world.vehicles.push(boat);
    p.pos.x = boat.pos.x; p.pos.z = boat.pos.z;
    p.tryEnter();
    if (name === 'buoys') { world.activities.buoys.begin(); world.activities.buoys.active.countdown = 0; }
    p.select('pistol');
    input.held.add('KeyW');
    run(world, input, 3, () => { world.rig.yaw = boat.heading + 0.25; world.rig.pitch = 0.16; world.rig.idle = 0; });
  }
  // only the play itself in the frame: no leftover title cards or notices
  hud.el.notes.innerHTML = '';
  hud.bigT = 0;
  hud.el.big.classList.remove('on');
  hud.el.fade.style.opacity = '0';
  void Vehicle; void MODELS; void Npc;
  world.render();
  hud.update(0);
  world.render();
  window.__shotReady = true;
}
