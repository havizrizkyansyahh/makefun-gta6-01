// Tunable numbers for Solmara Bay, kept in one place so the feel of the game can be adjusted
// without hunting through the systems that use them.

/** City grid: 9 x 9 blocks between 10 x 10 road lines, centred on the origin. */
export const CITY = {
  blocks: 9,
  pitch: 92,          // distance between road centre lines (m)
  roadHalf: 7,        // half the asphalt width (one lane each way)
  laneOffset: 3.4,    // lane centre from the road centre line
  walk: 4.5,          // sidewalk width inside every block edge
  curb: 0.18,         // sidewalk height
  shore: 52,          // sand between the southern boulevard and the sea
  bounds: 560,        // hard limit of the playable square
};

export const PLAYER = {
  walk: 4.2,
  run: 7.6,
  jump: 6.2,
  gravity: 19,
  radius: 0.42,
  height: 1.8,
  maxHealth: 100,
  maxArmor: 100,
};

export const CAMERA = {
  footDistance: 4.6,
  footHeight: 1.65,
  aimDistance: 2.3,
  carDistance: 8.4,
  carHeight: 2.9,
  fov: 62,
  sensitivity: 0.0023,
};

export const TRAFFIC = {
  cars: 26,
  parked: 18,
  peds: 42,
  spawnMin: 110,
  spawnMax: 230,
  despawn: 280,
  cruise: 13,
};

/** Wanted level: police units on the board and how long a quiet escape takes, per star. */
export const WANTED = {
  maxStars: 5,
  units: [0, 2, 3, 4, 6, 7],
  searchRadius: [0, 70, 90, 115, 140, 170],
  escapeTime: [0, 6, 9, 12, 16, 20],
  sightRange: 55,
};

/** One game day lasts this many real seconds; play starts in the golden late afternoon. */
export const DAY_SECONDS = 1440;
export const START_HOUR = 16.6;

export const SAVE_KEY = 'solmara-bay-save-v1';
export const SETTINGS_KEY = 'solmara-bay-settings-v1';
/** Saves written since interiors, outfits and the garage arrived carry v: 2 (v1 saves still load). */
export const SAVE_VERSION = 2;

/**
 * Interiors are real rooms built away from the city (east of it, beyond the hills) and reached
 * through doors: the player is moved there and the city is hidden while inside.
 */
export const INTERIOR = {
  originX: 2400,      // first room's centre
  spacing: 150,       // distance between rooms
  footDistance: 3.0,  // the camera sits closer under a ceiling
  footHeight: 1.55,
  aimDistance: 1.8,
  fov: 66,
};

/** Torque & Tide Customs: upgrade prices per level (level 0 is stock) and cosmetic prices. */
export const GARAGE = {
  engine: [0, 850, 1800, 3400],
  brakes: [0, 500, 1100, 2300],
  armor: [0, 950, 2000, 3800],
  respray: 200,
  neon: 450,
  tint: 160,
  rims: 320,
  repairPerPoint: 8,
  repoBase: 700,
};

/** Coastline Arms' range: a session's length, its entry fee and the medals it awards. */
export const RANGE = {
  seconds: 40,
  fee: 50,
  medals: [
    { name: 'Gold', score: 260, prize: 1200, color: '#ffd23f' },
    { name: 'Silver', score: 180, prize: 600, color: '#d8e2ec' },
    { name: 'Bronze', score: 110, prize: 250, color: '#e09a5a' },
  ],
};

/** The Buoy Run boat trial: medal times in seconds. */
export const BUOY_RUN = {
  medals: [
    { name: 'Gold', time: 56, prize: 1500, color: '#ffd23f' },
    { name: 'Silver', time: 66, prize: 700, color: '#d8e2ec' },
    { name: 'Bronze', time: 82, prize: 300, color: '#e09a5a' },
  ],
};
