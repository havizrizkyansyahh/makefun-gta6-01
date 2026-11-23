# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/havizrizkyansyahh/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/havizrizkyansyahh/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmara Bay** is an original open-world crime game that runs in a desktop browser from static files. Kai Moreno comes home to a sun-soaked bay city after six years away and finds the Glass Saints squeezing every stall on Palmline Beach, his sister Nadia's food truck included. When the Saints fall, the ledger names who really ran the bay: Captain Hollis of the SBPD and his friends on the harbour board.

![Solmara Bay: a police chase with air support down the beach boulevard at sunset](screenshots/1-cover.jpg)

### New in this build

- **Act II of the story, three new missions:** *Hot Plates* (run down the harbour crew who stole Nadia's food truck and drive it home), *Dry Cleaning* (a shootout inside Spin City Laundry for the ledger copy, against Sergeant Vey) and *Low Tide* (chase Captain Hollis's motor yacht out across the bay with a news helicopter overhead, cripple it, board it and end it on his own deck). Ten missions in all.
- **Buildings you walk into:** Kai's apartment (sleep to save and skip six hours, a wardrobe, the fridge, a TV whose Channel 6 headlines follow the story), Spin City Laundry (tumbling machines, a back office), Coastline Arms (the gun counter and a six-lane shooting range) and Threadline Outfitters. Each is a furnished, lit room with staff and customers, its own floor-plan minimap and shop radio.
- **Torque & Tide Customs:** drive into the bay for repairs, respray, engine, brake and armour upgrades, underglow, window tint and rims, shown live on a turntable view; keep any car as your own (it waits outside the apartment). Ines Okafor hands out timed repo jobs.
- **Clothes:** 28 pieces across tops, jackets, trousers, shoes, hats, shades and gold, tried on in front of a mirror view; change at home for free.
- **More to do:** the Coastline Arms range (pop-up boards, hostage boards, medals), the Buoy Run boat trial round nine channel buoys, and Sol y Sal taco deliveries on Nadia's bike before the food goes cold. All records are on the pause menu's Activities page.
- **The Gull Carbine**, a fifth weapon, and a five-slot weapon wheel.
- **Polish:** the sea now renders properly (its shader had been failing to compile), gulls over the beach, fireworks over the bay once the story is done, flashing amber traffic lights in the small hours, a colour drain when Kai goes down, warm grading indoors, and a photo mode (P) with five filters.

- **A city to explore on foot, by car, by motorbike and by boat:** six districts (Palmline Beach, Corvel Heights, Little Marisco, Harbor Flats, Verde Hills, Midtown), a pier and open sea, working traffic lights, shade trees and palms with real foliage, bus shelters, a day/night cycle with clouds and stars, and passing rain showers that leave the streets wet and reflective.
- **Traffic, pedestrians and vehicles to steal:** nine original cars, the Sprint 250 motorbike (it leans into turns and throws you off in a crash) and the Marisol 22 speedboat. Pedestrians wear varied outfits, wait for the lights and cross at the zebras, and put their hands up at gunpoint. Cars dent where they are hit, crack their windscreens, leave skid marks, burn and explode. People go down like ragdolls.
- **Wanted level:** up to five stars. Cruisers chase and ram you, officers arrest you or open fire, and a helicopter with a searchlight and a marksman joins from three stars (it can be shot down). You lose them by breaking line of sight outside the search area.
- **Ten story missions in two acts:** chases, shootouts indoors and out, a bike pursuit, a night raid on a barge at sea and a yacht boarding. Side activities: the Bayside Run street race, the Buoy Run, the range, repo jobs, taco deliveries, taxi fares in any Marlin Cab, courier runs, and twelve hidden Sun Shells.
- **Combat:** fists, pistol, SMG, shotgun and carbine, a weapon panel with ammo and a weapon wheel (hold Tab: time slows), over-the-shoulder aiming with aim assist, drive-by shooting from any vehicle, headshots and dropped loot.
- **HUD and menus:** a rotating minimap (a floor plan indoors) and an interactive city map (M): zoom, pan, portraits of the characters rendered from their 3D models, info cards on hover, and click-to-set waypoints with a GPS route along the streets. Plus a title screen, a pause menu with Activities and Stats pages, settings, and saving in Kai's apartment.
- **Rendering:** three.js with physically based materials, sky reflections on glass, paint, sea and wet roads, normal-mapped facades and bark, alpha-cut leaf shadows, headlights that light the road, neon, and custom post-processing (bloom, ACES tone mapping, colour grading).
- **Sound:** all of it is synthesised with WebAudio, including the engine, siren, rotor, rain, thunder, gulls, fireworks, shop tills and spray guns, and four procedural radio stations.

Controls: WASD to move or drive, the mouse to look, Shift to sprint, Space to jump or handbrake, F to enter or exit a vehicle, left mouse to shoot, right mouse to aim, Q, the mouse wheel, 1-5 or hold Tab for the weapon wheel, R to reload or change radio, C to look behind while driving, T for taxi fares in a cab, E for doors, counters, the garage and jobs, M for the map, P for photo mode and Esc to pause. In shop and garage screens: W/S choose, A/D change, Enter buy, E leave.

## Run it

```sh
node serve.ts   # then open http://localhost:8080 in desktop Chrome
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # hand-in: copies game/ and screenshots/, writes the dossier
node tools/capture.mjs   # retakes the screenshots from the game's ?shot= scenes (server running)
node tools/capture.mjs --scene garage --out /tmp/garage.jpg   # any extra scene: garage, apartment, laundry, range, boutique, yacht, buoys
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6baap856&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
