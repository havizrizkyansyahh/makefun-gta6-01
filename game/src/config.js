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
