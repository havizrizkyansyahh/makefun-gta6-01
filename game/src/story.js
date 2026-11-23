// The story of Solmara Bay, in ten missions and two acts. Kai Moreno comes home after six years
// on the northern fishing boats to find the Glass Saints squeezing every stall on Palmline
// Beach, his sister Nadia's food truck included. Auntie Pearl, who launders more than shirts at
// her Spin City laundromat, gives him work, and the work leads to the Saints' boss, Halo Calder.
// With Calder gone, the ledger names who really ran the bay: Captain Hollis of the SBPD and his
// friends on the harbour board, who move in on what the Saints left behind.
//
// Each mission is a list of steps. A step's enter(ctx) sets it up, and its update(ctx, dt)
// returns true when the step is done (or ctx.fail(reason) ends the mission).
import { BoatPilot } from './boats.js';
import { LOOKS } from './human.js';
import { PIER, COAST_Z } from './city.js';
import { wrapAngle } from './rng.js';

export const CAST = {
  kai: { name: 'KAI', color: '#2ec4b6' },
  nadia: { name: 'NADIA', color: '#ffb000' },
  pearl: { name: 'PEARL', color: '#ff5fa2' },
  dex: { name: 'DEX', color: '#bde0fe' },
  halo: { name: 'HALO', color: '#e0e0e0' },
  radio: { name: 'SBPD RADIO', color: '#7aa2ff' },
  hollis: { name: 'CAPT. HOLLIS', color: '#9ab8ff' },
  vey: { name: 'SGT. VEY', color: '#d9a47a' },
  crew: { name: 'HARBOUR CREW', color: '#f2923a' },
  ines: { name: 'INES', color: '#ffa94d' },
  news: { name: 'CHANNEL 6', color: '#ff7a1a' },
};

const inBoat = (ctx) => !!ctx.world.player.vehicle && ctx.world.player.vehicle.spec.body === 'boat';

/**
 * Hold Hollis's crippled yacht still once its engines quit: swing it round to head out to sea,
 * pin it there, and once it lies straight lay a walkable deck over it (with the saloon solid)
 * and bring his men up from below.
 */
function moorYacht(ctx, dt) {
  const y = ctx.data.yacht;
  if (!y) return;
  if (!ctx.data.anchor) ctx.data.anchor = { x: y.pos.x, z: y.pos.z };
  const a = ctx.data.anchor;
  y.ai = null;
  y.locked = true;
  y.vel.x = 0;
  y.vel.z = 0;
  y.input.throttle = 0;
  y.input.steer = 0;
  y.pos.x = a.x;
  y.pos.z = a.z;
  y.health = Math.max(y.health, 30);
  y.heading = wrapAngle(y.heading + wrapAngle(0 - y.heading) * Math.min(1, dt * 1.6));
  y.y = -0.35;
  y.mesh.position.set(a.x, y.y, a.z);
  y.mesh.rotation.y = y.heading;
  y.parts.body.rotation.set(0, 0, 0);
  if (Math.random() < dt * 5) ctx.world.fx.spawn('smoke', a.x, 3.4, a.z - 4.2);
  if (ctx.data.deck || Math.abs(y.heading) > 0.03) return;
  y.heading = 0;
  const s = y.spec;
  const deckY = y.y + s.deck;
  const city = ctx.world.city;
  ctx.data.deck = city.addDeck(a.x - s.wid / 2 + 0.4, a.x + s.wid / 2 - 0.4, a.z - s.len / 2 + 0.7, a.z + s.len / 2 - 1.8, deckY, 'yacht');
  ctx.data.cabin = city.addCollider(a.x - 0.95, a.x + 0.95, a.z + 0.5 - 2.0, a.z + 0.5 + 2.0, deckY + 2.2, 'cabin');
  ctx.onCleanup(() => { city.removePlatform(ctx.data.deck); city.removeCollider(ctx.data.cabin); });
  const spots = [[0, -4.6, true], [-1.2, -2.6], [1.2, -3.3], [-1.25, 3.4], [1.25, 4.2]];
  ctx.data.crew = spots.map(([ox, oz, boss]) => {
    const x = a.x + ox;
    const z = a.z + oz;
    const n = boss
      ? ctx.spawnBoss(x, z, { look: LOOKS.hollis, name: 'Captain Hollis', icon: 'hollis', health: 240, weapon: 'carbine' })
      : ctx.spawnCrew(x, z, 1, 0.01, LOOKS.dock)[0];
    n.pos.x = x;
    n.pos.z = z;
    n.y = deckY;
    n.anchored = true;
    n.alertRange = 80;
    n.state = 'combat';
    return n;
  });
  ctx.data.hollis = ctx.data.crew[0];
}

const STORY_TWO = [
  {
    id: 'hot-plates',
    title: 'Hot Plates',
    giver: 'nadia',
    reward: 3500,
    intro: [
      ['nadia', 'They took my truck, Kai. Hooked it up at dawn and drove off with the grill still warm.'],
      ['nadia', 'Harbour board stickers on the windscreen. The ledger said whose board that is.'],
      ['kai', 'Hollis. Then the harbour board can give it back.'],
    ],
    steps: [
      {
        text: "Catch the crew driving off in Nadia's truck. Ram it until they bail.",
        enter: (ctx) => {
          ctx.hideTruck();
          const v = ctx.spawnFleeing('pelican', 150);
          v.color = '#ff9f1c';
          v.parts.paint.color.set('#ff9f1c');
          v.armor = 0.35;
          v.health = 100;
          ctx.data.truck = v;
          ctx.arrowOn(v, '#ffb000');
          ctx.say([['kai', 'Orange van with a grill on the roof. Hard to miss.'], ['nadia', 'Do not scratch it any more than they already have!']]);
        },
        update: (ctx) => {
          const v = ctx.data.truck;
          if (v.health <= 0) return ctx.fail("Nadia's truck was wrecked.");
          if (ctx.distTo(v.pos) > 340) return ctx.fail('The truck got away.');
          if (v.health < 62) { ctx.stopVehicle(v); return true; }
          return false;
        },
      },
      {
        text: 'Deal with the harbour crew',
        enter: (ctx) => {
          const v = ctx.data.truck;
          ctx.clearArrows();
          const sx = Math.cos(v.heading) * 2.6;
          const sz = -Math.sin(v.heading) * 2.6;
          ctx.data.crew = ctx.spawnCrew(v.pos.x + sx, v.pos.z + sz, 3, 1.6, LOOKS.dock);
          for (const g of ctx.data.crew) g.state = 'combat';
          ctx.say([['crew', 'Captain says this truck is impounded!'], ['kai', 'Tell him to come and impound it himself.']]);
        },
        update: (ctx) => {
          if (ctx.data.truck.health <= 0) return ctx.fail("Nadia's truck was wrecked.");
          return ctx.countDead(ctx.data.crew, 'Deal with the harbour crew');
        },
      },
      {
        text: "Get in Nadia's truck.",
        enter: (ctx) => { ctx.data.truck.locked = false; ctx.arrowOn(ctx.data.truck, '#ffb000'); },
        update: (ctx) => {
          if (ctx.data.truck.health <= 0) return ctx.fail("Nadia's truck was wrecked.");
          return ctx.world.player.vehicle === ctx.data.truck;
        },
      },
      {
        text: 'Drive the truck home to Palmline Beach, and lose the cops on the way.',
        enter: (ctx) => {
          ctx.clearArrows();
          const n = ctx.place('nadia');
          ctx.data.m = ctx.marker(n.x, n.z - 6.5, '#ffb000', 3.6);
          ctx.world.police.set(1);
          ctx.say([['radio', 'Stolen catering vehicle, orange, heading for Palmline.'], ['kai', 'Stolen. From me. Right.']]);
        },
        update: (ctx) => {
          const v = ctx.data.truck;
          if (v.health <= 0) return ctx.fail("Nadia's truck was wrecked.");
          if (ctx.world.player.vehicle === v && ctx.data.m.inside(ctx.px, ctx.pz, 1.5) && ctx.world.police.stars > 0) ctx.world.hud.help('Lose the cops before Nadia sees them.');
          return ctx.world.player.vehicle === v && ctx.data.m.inside(ctx.px, ctx.pz, 1.5) && ctx.world.police.stars === 0;
        },
      },
      {
        text: 'Talk to Nadia.',
        enter: (ctx) => {
          ctx.restoreTruck(ctx.data.truck);
          ctx.say([
            ['nadia', 'The grill is bent. The awning is gone. There is a bullet hole in the menu.'],
            ['nadia', 'It is perfect. Thank you.'],
            ['kai', 'Hollis will not stop at a food truck.'],
            ['nadia', 'Then neither will we.'],
          ]);
        },
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'dry-cleaning',
    title: 'Dry Cleaning',
    giver: 'pearl',
    reward: 5000,
    intro: [
      ['pearl', 'Sergeant Vey walked into my laundry an hour ago with three friends who left their badges at home.'],
      ['pearl', 'They are turning over my machines for the copy of the ledger I keep in the back office. Get it before they do.'],
    ],
    steps: [
      {
        text: 'Go into Spin City Laundry (the pink door next to Pearl).',
        enter: (ctx) => { const d = ctx.place('laundryDoor'); ctx.data.m = ctx.marker(d.x, d.z, '#ff5fa2', 1.4); },
        update: (ctx) => ctx.inRoom('laundry'),
      },
      {
        text: "Take out Vey's crew",
        enter: (ctx) => {
          const r = ctx.room('laundry');
          ctx.data.crew = [[-4.5, 2.6], [2.2, 4.6], [-9.6, -4.2], [3.6, -3.4]].map(([lx, lz]) => {
            const p = r.at(lx, lz);
            const g = ctx.spawnCrew(p.x, p.z, 1, 0.01, LOOKS.dock)[0];
            g.pos.x = p.x;
            g.pos.z = p.z;
            g.alertRange = 30;
            return g;
          });
          const vp = r.at(8.6, -4.0);
          const vey = ctx.spawnBoss(vp.x, vp.z, { look: LOOKS.vey, name: 'Sergeant Vey', icon: 'vey', health: 210, weapon: 'shotgun' });
          vey.alertRange = 9;
          ctx.data.crew.push(vey);
          ctx.data.vey = vey;
          ctx.arrowOn(vey, '#ff4d4d');
          ctx.say([['vey', 'Moreno! You should have stuck to fish.'], ['kai', 'Everybody keeps telling me that.']]);
        },
        update: (ctx) => ctx.countDead(ctx.data.crew, "Take out Vey's crew"),
      },
      {
        text: 'Grab the ledger copy from the back office.',
        enter: (ctx) => {
          ctx.clearArrows();
          const p = ctx.room('laundry').at(9.1, -5.4);
          ctx.data.ledger = ctx.pickup('ledger', p.x, p.z);
          ctx.say([['kai', 'Taped under the desk. Pearl, you are a genius.']]);
        },
        update: (ctx) => ctx.data.ledger.taken,
      },
      {
        text: 'Leave the laundry.',
        update: (ctx) => !ctx.world.interior,
      },
      {
        text: 'Lose the cops.',
        enter: (ctx) => { ctx.world.police.set(2); ctx.say([['radio', 'Shots fired at Spin City Laundry. Officer down. All units.']]); },
        update: (ctx) => ctx.world.police.stars === 0,
      },
      {
        text: 'Bring the ledger copy to Pearl.',
        enter: (ctx) => { ctx.data.m = ctx.markAt('pearl'); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2),
      },
      {
        text: 'Talk to Pearl.',
        enter: (ctx) => ctx.say([
          ['pearl', 'Vey, gone. And they shot my good dryer. Thirty years that dryer and I have been together.'],
          ['pearl', 'Ines at Torque & Tide says Hollis bought a yacht last month. Cash. On a captain\'s salary.'],
          ['kai', 'Then he is planning to leave.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'low-tide',
    title: 'Low Tide',
    giver: 'nadia',
    reward: 12000,
    intro: [
      ['nadia', 'The fishermen saw Captain Hollis load half the precinct evidence room onto a yacht in the harbour.'],
      ['nadia', 'He is running, Kai. If he makes open water, a ledger is all we will ever have.'],
      ['kai', 'Then he does not make open water.'],
    ],
    steps: [
      {
        text: 'Take a speedboat from the end of the pier.',
        enter: (ctx) => { ctx.ensureBoat(); ctx.data.m = ctx.markAt('pierEnd'); },
        update: (ctx) => inBoat(ctx),
      },
      {
        text: "Catch Captain Hollis's yacht and shoot it until the engines quit.",
        enter: (ctx) => {
          const x0 = PIER.x - 190;
          const z0 = PIER.z1 + 70;
          const path = [[-260, 170], [-200, 300], [-330, 420], [-180, 520], [-420, 590], [-640, 610]].map(([dx, dz]) => ({ x: PIER.x + dx, z: PIER.z1 + dz }));
          const y = ctx.spawnCar('tidecaller', x0, z0, Math.atan2(-0.4, 1));
          y.health = 100;
          y.armor = 0.35;
          y.driver = { look: null };
          y.ai = new BoatPilot(ctx.world, y, { path, cruise: 0.85 });
          ctx.data.yacht = y;
          ctx.arrowOn(y, '#ff4d4d');
          ctx.data.escorts = [-14, 14].map((ox) => {
            const e = ctx.spawnCar('marisol', x0 + ox, z0 - 12, 0);
            e.parts.paint.color.set('#1d3557');
            e.health = 70;
            e.driver = { look: null };
            e.ai = new BoatPilot(ctx.world, e, { mode: 'ram' });
            return e;
          });
          ctx.newsHeli(y.pos);
          ctx.say([
            ['hollis', 'Moreno. You are a fisherman with a gun. Go home.'],
            ['kai', 'I am home.'],
            ['news', 'Channel 6 live over the bay: a police captain\'s yacht, and somebody chasing it.'],
          ]);
        },
        update: (ctx) => {
          const y = ctx.data.yacht;
          y.health = Math.max(y.health, 30);
          if (ctx.distTo(y.pos) > 480) return ctx.fail('Hollis made it to open water.');
          if (y.ai && y.ai.done) return ctx.fail('Hollis made it to open water.');
          for (const e of ctx.data.escorts) if (e.health <= 0 && e.ai) { e.ai = null; e.driver = null; }
          return y.health < 50;
        },
      },
      {
        text: 'Pull up alongside the yacht and press F to board it.',
        enter: (ctx) => {
          ctx.clearArrows();
          ctx.say([['kai', 'Engines are smoking. He is dead in the water.'], ['hollis', 'Get up here, all of you! Shoot him!']]);
          for (const e of ctx.data.escorts) if (e.ai) e.ai = new BoatPilot(ctx.world, e, { path: [{ x: e.pos.x - 500, z: e.pos.z + 250 }], cruise: 1 });
        },
        update: (ctx, dt) => {
          moorYacht(ctx, dt);
          const d = ctx.data.deck;
          const p = ctx.world.player;
          return !!d && !p.vehicle && p.pos.x > d.x0 - 0.5 && p.pos.x < d.x1 + 0.5 && p.pos.z > d.z0 - 0.5 && p.pos.z < d.z1 + 0.5;
        },
      },
      {
        text: 'Take down Captain Hollis and his men',
        enter: (ctx) => { if (ctx.data.hollis && !ctx.data.hollis.dead) ctx.arrowOn(ctx.data.hollis, '#ff4d4d'); },
        update: (ctx, dt) => { moorYacht(ctx, dt); return ctx.countDead(ctx.data.crew, 'Take down Captain Hollis and his men'); },
      },
      {
        text: 'Grab the evidence case from the aft deck.',
        enter: (ctx) => {
          ctx.clearArrows();
          const a = ctx.data.anchor;
          ctx.data.case = ctx.pickup('case', a.x + 0.6, a.z - 5.2);
          ctx.data.case.mesh.position.y = ctx.data.deck.y + 0.6;
          ctx.data.case.baseY = ctx.data.deck.y + 0.6;
          ctx.say([['hollis', 'You have no idea who else is in that case, Moreno.'], ['kai', 'Channel 6 is about to find out.']]);
        },
        update: (ctx, dt) => { moorYacht(ctx, dt); return ctx.data.case.taken; },
      },
      {
        text: 'Get back in your boat and take the case to Nadia on the beach.',
        enter: (ctx) => {
          const n = ctx.place('nadia');
          ctx.data.m = ctx.marker(n.x, COAST_Z + 11, '#ffb000', 5);
          ctx.say([['radio', 'All units on the water, stand down. Repeat, stand down. By order of the Mayor.']]);
        },
        update: (ctx, dt) => { moorYacht(ctx, dt); return ctx.data.m.inside(ctx.px, ctx.pz, 3); },
      },
      {
        text: 'Talk to Nadia.',
        enter: (ctx) => ctx.say([
          ['nadia', 'Channel 6 had it live. Hollis in cuffs on his own boat, and you on the news in that shirt.'],
          ['pearl', 'The harbour board resigned an hour ago. All of them. Even the ones I liked.'],
          ['kai', 'So what happens now?'],
          ['nadia', 'Now you eat. And tomorrow you help me open the second truck.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
];

const inCar = (ctx) => !!ctx.world.player.vehicle;

export const MISSIONS = [
  {
    id: 'salt-air',
    title: 'Salt Air',
    giver: 'nadia',
    reward: 500,
    intro: [
      ['nadia', 'Six years, Kai. Six years, and you walk up to my truck like you went out for limes.'],
      ['kai', 'The boats up north stopped paying. Figured home might.'],
      ['nadia', 'Home has new landlords. The Glass Saints take a cut from every stall on Palmline.'],
      ['nadia', 'Auntie Pearl wants to see you. Grab a ride, there is always something parked nearby.'],
    ],
    steps: [
      {
        text: 'Get a car. Walk up to one and press F.',
        update: (ctx) => inCar(ctx),
      },
      {
        text: "Drive to Pearl's Spin City Laundry.",
        enter: (ctx) => { ctx.data.m = ctx.markAt('pearl'); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2),
      },
      {
        text: 'Talk to Pearl.',
        enter: (ctx) => ctx.say([
          ['pearl', 'Kai Moreno. Last time I saw you, you were fishing quarters out of my dryers.'],
          ['kai', 'I have moved up to cars.'],
          ['pearl', 'Good. I have work for a man who does not ask questions. Come back when you are ready.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'rinse-cycle',
    title: 'Rinse Cycle',
    giver: 'pearl',
    reward: 1500,
    intro: [
      ['pearl', 'A friend left a bag for me at the Harbor Flats container yard.'],
      ['pearl', 'Bring it here. Do not open it, do not lose it, and do not bring company.'],
    ],
    steps: [
      {
        text: 'Pick up the bag at the Harbor Flats container yard.',
        enter: (ctx) => { ctx.data.m = ctx.marker(ctx.place('harborYard').x + 20, ctx.place('harborYard').z + 1, '#ffd23f', 3); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 1.5),
      },
      {
        text: 'Lose the cops.',
        enter: (ctx) => {
          ctx.world.audio.ui('pickup');
          ctx.say([
            ['radio', 'All units, suspect at the container yard. Move in.'],
            ['kai', 'A setup. Of course it is a setup.'],
          ]);
          ctx.world.police.set(2);
        },
        update: (ctx) => ctx.world.police.stars === 0,
      },
      {
        text: 'Bring the bag to Spin City Laundry.',
        enter: (ctx) => { ctx.data.m = ctx.markAt('pearl'); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2) && ctx.world.police.stars === 0,
      },
      {
        text: 'Hand over the bag.',
        enter: (ctx) => ctx.say([
          ['pearl', 'Clean as a fresh sheet. Somebody at the precinct talks too much, Kai.'],
          ['pearl', 'You kept your head. You will do.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'broken-glass',
    title: 'Broken Glass',
    giver: 'pearl',
    reward: 2500,
    intro: [
      ['pearl', 'The Saints run a chop shop in Little Marisco. They part out my drivers\' cars and sell them back to me.'],
      ['pearl', 'Take this Viper. Go send them a message, and bring me the pretty car they keep there.'],
    ],
    steps: [
      {
        text: 'Go to the Glass Saints chop shop in Little Marisco.',
        enter: (ctx) => {
          ctx.world.player.give('smg', 96);
          ctx.world.hud.notify('Pearl gave you a Viper SMG. Switch weapons with Q, 1-4 or the mouse wheel.');
          const c = ctx.place('chopShop');
          ctx.data.m = ctx.marker(c.x, c.z + 30, '#ff5fa2', 4);
        },
        update: (ctx) => ctx.near(ctx.data.m.x, ctx.data.m.z, 55),
      },
      {
        text: 'Take out the Glass Saints',
        enter: (ctx) => {
          const c = ctx.place('chopShop');
          ctx.data.gang = ctx.spawnGang(c.x, c.z + 30, 6, 10);
          ctx.data.car = ctx.spawnCar('halcyon', c.x + 6, c.z + 28, Math.PI / 2, { locked: true });
        },
        update: (ctx) => ctx.countDead(ctx.data.gang, 'Take out the Glass Saints'),
      },
      {
        text: 'Steal the Halcyon GT-R.',
        enter: (ctx) => { ctx.data.car.locked = false; ctx.arrowOn(ctx.data.car, '#7ad7ff'); },
        update: (ctx) => {
          if (ctx.data.car.dead) return ctx.fail('The Halcyon was wrecked.');
          return ctx.world.player.vehicle === ctx.data.car;
        },
      },
      {
        text: "Deliver the Halcyon to Nadia's lot on Palmline.",
        enter: (ctx) => {
          ctx.clearArrows();
          const n = ctx.place('nadia');
          ctx.data.m = ctx.marker(n.x + 18, n.z - 9, '#ffb000', 3.5);
          ctx.say([['kai', 'Pearl, I have your car.'], ['pearl', 'Not a scratch on it, Kai. I mean that.']]);
        },
        update: (ctx) => {
          if (ctx.data.car.dead) return ctx.fail('The Halcyon was wrecked.');
          return ctx.world.player.vehicle === ctx.data.car && ctx.data.m.inside(ctx.px, ctx.pz, 1) && ctx.world.police.stars === 0;
        },
      },
    ],
  },
  {
    id: 'tide-money',
    title: 'Tide Money',
    giver: 'nadia',
    reward: 4000,
    intro: [
      ['nadia', 'Dex Rourke came by. He says the Saints\' cut just doubled, because of you.'],
      ['kai', 'Where is he now?'],
      ['nadia', 'Driving this week\'s collections to the bank in a white Pelican van. Everybody\'s money, Kai.'],
    ],
    steps: [
      {
        text: "Destroy Dex Rourke's van.",
        enter: (ctx) => {
          const v = ctx.spawnFleeing('pelican', 140);
          v.health = 100;
          v.armor = 0.45;
          ctx.data.van = v;
          ctx.arrowOn(v, '#ff4d4d');
          ctx.say([['dex', 'Kai Moreno! You should have stayed on the boats!']]);
        },
        update: (ctx) => {
          const v = ctx.data.van;
          if (v.health <= 0) return true;
          if (ctx.distTo(v.pos) > 330) return ctx.fail('Dex got away with the money.');
          return false;
        },
      },
      {
        text: 'Grab the cash bag.',
        enter: (ctx) => {
          ctx.clearArrows();
          const v = ctx.data.van;
          ctx.data.bag = ctx.pickup('cash', v.pos.x + 3, v.pos.z + 2);
        },
        update: (ctx) => ctx.data.bag.taken,
      },
      {
        text: 'Lose the cops.',
        enter: (ctx) => { ctx.world.police.set(3); ctx.say([['radio', 'Explosion reported, Palmline. Shots fired. Code three.']]); },
        update: (ctx) => ctx.world.police.stars === 0,
      },
      {
        text: 'Bring the money back to Nadia.',
        enter: (ctx) => { ctx.data.m = ctx.markAt('nadia'); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2),
      },
      {
        text: 'Talk to Nadia.',
        enter: (ctx) => ctx.say([
          ['nadia', 'Every envelope. You got every envelope back.'],
          ['nadia', 'They will come for you now, Kai. All of them.'],
          ['kai', 'Then I go to them first.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'paper-trail',
    title: 'Paper Trail',
    giver: 'pearl',
    reward: 5000,
    intro: [
      ['pearl', 'Dex kept books. Every payoff, every cop on the take, in one ledger.'],
      ['pearl', 'His bookkeeper is running it out of town on a yellow Sprint. Do not let that ledger leave Solmara Bay.'],
    ],
    steps: [
      {
        text: "Run down the bookkeeper's motorbike.",
        enter: (ctx) => {
          const v = ctx.spawnFleeing('sprint', 130);
          v.parts.paint.color.set('#ffd23f');
          v.health = 40;
          ctx.data.bike = v;
          ctx.arrowOn(v, '#ff4d4d');
          ctx.say([['kai', 'Yellow bike, heading for the hills. I see him.']]);
        },
        update: (ctx) => {
          const v = ctx.data.bike;
          if (v.health <= 0) return true;
          if (ctx.distTo(v.pos) > 330) return ctx.fail('The bookkeeper got away.');
          return false;
        },
      },
      {
        text: 'Grab the ledger.',
        enter: (ctx) => {
          ctx.clearArrows();
          const v = ctx.data.bike;
          ctx.data.ledger = ctx.pickup('cash', v.pos.x + 2, v.pos.z + 1.5);
        },
        update: (ctx) => ctx.data.ledger.taken,
      },
      {
        text: 'Lose the cops.',
        enter: (ctx) => { ctx.world.police.set(2); ctx.say([['radio', 'Traffic collision with a motorcyclist. Units respond.']]); },
        update: (ctx) => ctx.world.police.stars === 0,
      },
      {
        text: 'Bring the ledger to Pearl.',
        enter: (ctx) => { ctx.data.m = ctx.markAt('pearl'); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2),
      },
      {
        text: 'Talk to Pearl.',
        enter: (ctx) => ctx.say([
          ['pearl', 'Captain Hollis, Sergeant Vey, half the harbour board. All bought and paid for by Halo Calder.'],
          ['pearl', 'With this, nobody in a uniform will come to his rescue.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'deep-water',
    title: 'Deep Water',
    giver: 'nadia',
    reward: 6000,
    intro: [
      ['nadia', 'The fishermen say the Saints meet a boat every night, way past the buoys. Guns in, cash out.'],
      ['nadia', 'There are speedboats tied up at the end of the pier. Go take it from them.'],
    ],
    steps: [
      {
        text: 'Take a speedboat from the end of the pier.',
        enter: (ctx) => { ctx.data.m = ctx.markAt('pierEnd'); },
        update: (ctx) => !!ctx.world.player.vehicle && ctx.world.player.vehicle.spec.body === 'boat',
      },
      {
        text: 'Take out the Saints on the drop barge',
        enter: (ctx) => {
          const city = ctx.world.city;
          const bx = ctx.place('pierEnd').x + 150;
          const bz = ctx.place('pierEnd').z + 260;
          ctx.data.barge = city.platforms.find((p) => p.tag === 'drop') || Object.assign(city.addPlatform(bx, bz, 14, 9), { tag: 'drop' });
          const b = ctx.data.barge;
          const cx = (b.x0 + b.x1) / 2;
          const cz = (b.z0 + b.z1) / 2;
          ctx.data.gang = [[-4, -2], [3, 2.5], [-1, 3], [4, -2.5]].map(([ox, oz]) => {
            const g = ctx.spawnGang(cx + ox, cz + oz, 1, 0.01)[0];
            g.pos.x = cx + ox; g.pos.z = cz + oz; g.anchored = true; g.alertRange = 70;
            return g;
          });
          ctx.arrowOn({ pos: { x: cx, z: cz }, y: 1, dead: false }, '#ff4d4d');
          ctx.world.hud.notify('Shoot from the boat: aim with the mouse and click (drive-by).');
        },
        update: (ctx) => ctx.countDead(ctx.data.gang, 'Take out the Saints on the drop barge'),
      },
      {
        text: 'Grab the cargo from the barge.',
        enter: (ctx) => {
          ctx.clearArrows();
          const b = ctx.data.barge;
          ctx.data.cargo = ctx.pickup('cash', (b.x0 + b.x1) / 2, b.z0 + 0.6);
        },
        update: (ctx) => ctx.data.cargo.taken,
      },
      {
        text: 'Lose the cops and the chopper.',
        enter: (ctx) => { ctx.world.police.set(3); ctx.say([['radio', 'Shots fired on the water. Air unit, light them up.']]); },
        update: (ctx) => ctx.world.police.stars === 0,
      },
      {
        text: 'Bring the cargo to Nadia on the beach.',
        enter: (ctx) => { ctx.data.m = ctx.markAt('nadia'); },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2),
      },
      {
        text: 'Talk to Nadia.',
        enter: (ctx) => ctx.say([
          ['nadia', 'You came in off the sea with a helicopter on your back. Mamá would have killed you.'],
          ['kai', 'Mamá would have helped.'],
        ]),
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  {
    id: 'glass-houses',
    title: 'Glass Houses',
    giver: 'pearl',
    reward: 10000,
    intro: [
      ['pearl', 'Halo Calder runs the Saints from the top of Corvel Heights. Tonight he holds court in Sunstone Plaza.'],
      ['pearl', 'End it, Kai, and Palmline breathes again. Then get out to the pier, I will have a boat waiting.'],
    ],
    steps: [
      {
        text: 'Go to Sunstone Plaza in Corvel Heights.',
        enter: (ctx) => {
          const t = ctx.place('tower');
          ctx.data.m = ctx.marker(t.x, t.z + 26, '#ff5fa2', 4);
          ctx.world.player.give('shotgun', 24);
        },
        update: (ctx) => ctx.near(ctx.data.m.x, ctx.data.m.z, 60),
      },
      {
        text: 'Take down Halo Calder and his crew',
        enter: (ctx) => {
          const t = ctx.place('tower');
          ctx.data.gang = ctx.spawnGang(t.x, t.z, 7, 16);
          const halo = ctx.spawnBoss(t.x, t.z - 2);
          ctx.data.gang.push(halo);
          ctx.data.halo = halo;
          ctx.arrowOn(halo, '#ff4d4d');
          ctx.say([['halo', 'The fisherman! Somebody gut him!']]);
        },
        update: (ctx) => ctx.countDead(ctx.data.gang, 'Take down Halo Calder and his crew'),
      },
      {
        text: 'Escape to the end of the pier.',
        enter: (ctx) => {
          ctx.clearArrows();
          ctx.world.police.set(4);
          ctx.data.m = ctx.markAt('pierEnd');
          ctx.say([['radio', 'Mass shooting at Sunstone Plaza. All units. Air support requested.']]);
        },
        update: (ctx) => ctx.data.m.inside(ctx.px, ctx.pz, 2),
      },
      {
        text: 'Wait for the boat.',
        enter: (ctx) => {
          ctx.world.police.clear();
          ctx.say([
            ['pearl', 'Boat is here. The Saints are scattering like gulls, Kai.'],
            ['nadia', 'They are saying the boulevard is free. Free! Come home and eat something.'],
            ['kai', 'Solmara Bay. Six years, and it is still the best view on the coast.'],
            ['pearl', 'Enjoy it while it lasts. The ledger has more names in it than Halo Calder\'s.'],
          ]);
        },
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
  ...STORY_TWO,
];
