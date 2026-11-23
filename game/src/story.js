// The story of Solmara Bay, in five missions. Kai Moreno comes home after six years on the
// northern fishing boats to find the Glass Saints squeezing every stall on Palmline Beach,
// his sister Nadia's food truck included. Auntie Pearl, who launders more than shirts at her
// Spin City laundromat, gives him work, and the work leads to the Saints' boss, Halo Calder.
//
// Each mission is a list of steps. A step's enter(ctx) sets it up, and its update(ctx, dt)
// returns true when the step is done (or ctx.fail(reason) ends the mission).

export const CAST = {
  kai: { name: 'KAI', color: '#2ec4b6' },
  nadia: { name: 'NADIA', color: '#ffb000' },
  pearl: { name: 'PEARL', color: '#ff5fa2' },
  dex: { name: 'DEX', color: '#bde0fe' },
  halo: { name: 'HALO', color: '#e0e0e0' },
  radio: { name: 'SBPD RADIO', color: '#7aa2ff' },
};

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
          ]);
        },
        update: (ctx) => ctx.talkDone(),
      },
    ],
  },
];
