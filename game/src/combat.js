// Weapons and hit detection: the arsenal table, ray tests against people (upright cylinders),
// vehicles (boxes in the car's own frame) and the city's buildings, and the one firing routine
// the player, gang members and police all use.

export const WEAPONS = {
  fist: { name: 'Fists', dmg: 16, rate: 0.42, range: 1.9, melee: true },
  pistol: { name: 'Kestrel 9', dmg: 30, rate: 0.26, mag: 12, spread: 0.010, range: 140, sound: 'pistol', price: 400, ammoPrice: 60, ammoPack: 24 },
  smg: { name: 'Viper SMG', dmg: 16, rate: 0.085, mag: 32, spread: 0.032, range: 100, auto: true, sound: 'smg', price: 1800, ammoPrice: 120, ammoPack: 64 },
  shotgun: { name: 'Breaker 12', dmg: 15, pellets: 8, rate: 0.85, mag: 6, spread: 0.085, range: 50, sound: 'shotgun', price: 2600, ammoPrice: 150, ammoPack: 12 },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun'];

/** Ray vs an upright cylinder (a person standing at x, z from y0 to y1). Returns t or -1. */
export function rayCylinder(ox, oy, oz, dx, dy, dz, x, z, y0, y1, r) {
  const px = ox - x;
  const pz = oz - z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0) return -1;
  const y = oy + dy * t;
  return y >= y0 && y <= y1 ? t : -1;
}

/** Ray vs a vehicle's box, solved in the car's local frame. Returns t or -1. */
export function rayVehicle(ox, oy, oz, dx, dy, dz, v) {
  const c = Math.cos(v.heading);
  const s = Math.sin(v.heading);
  const lx = ox - v.pos.x;
  const lz = oz - v.pos.z;
  // world -> local: inverse of the yaw rotation
  const px = lx * c - lz * s;
  const pz = lx * s + lz * c;
  const qx = dx * c - dz * s;
  const qz = dx * s + dz * c;
  const hx = v.spec.wid / 2;
  const hz = v.spec.len / 2;
  let t0 = 0;
  let t1 = Infinity;
  const axes = [[px, qx, -hx, hx], [oy - v.y, dy, 0, v.spec.hgt + 0.3], [pz, qz, -hz, hz]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

/**
 * Cast one bullet through the world. Skips the shooter (and the shooter's car). Returns
 * { t, kind: 'npc' | 'vehicle' | 'player' | 'wall' | null, ref }.
 */
export function traceShot(world, shooter, ox, oy, oz, dx, dy, dz, range) {
  let best = world.city.rayCast(ox, oy, oz, dx, dy, dz, range);
  let kind = best < Infinity ? 'wall' : null;
  let ref = null;
  if (best === Infinity) best = range;
  for (const n of world.npcs) {
    if (n === shooter || n.dead || n.inVehicle) continue;
    const t = rayCylinder(ox, oy, oz, dx, dy, dz, n.pos.x, n.pos.z, n.y, n.y + 1.85, 0.38);
    if (t >= 0 && t < best) { best = t; kind = 'npc'; ref = n; }
  }
  const p = world.player;
  if (shooter !== p && !p.vehicle && !p.dead) {
    const t = rayCylinder(ox, oy, oz, dx, dy, dz, p.pos.x, p.pos.z, p.y, p.y + 1.85, 0.4);
    if (t >= 0 && t < best) { best = t; kind = 'player'; ref = p; }
  }
  for (const v of world.vehicles) {
    if (shooter && (v === shooter.vehicle)) continue;
    const ddx = v.pos.x - ox;
    const ddz = v.pos.z - oz;
    if (ddx * ddx + ddz * ddz > (best + 4) * (best + 4)) continue;
    const t = rayVehicle(ox, oy, oz, dx, dy, dz, v);
    if (t >= 0 && t < best) { best = t; kind = 'vehicle'; ref = v; }
  }
  const heli = world.police && world.police.heli;
  if (heli && heli.alive) {
    const t = rayCylinder(ox, oy, oz, dx, dy, dz, heli.pos.x, heli.pos.z, heli.pos.y - 1.6, heli.pos.y + 1.6, 1.8);
    if (t >= 0 && t < best) { best = t; kind = 'heli'; ref = heli; }
  }
  return { t: best, kind, ref };
}

/** Add aim spread to a unit direction. */
export function jitter(dx, dy, dz, spread, rnd = Math.random) {
  const x = dx + (rnd() - 0.5) * 2 * spread;
  const y = dy + (rnd() - 0.5) * 2 * spread;
  const z = dz + (rnd() - 0.5) * 2 * spread;
  const d = Math.hypot(x, y, z);
  return [x / d, y / d, z / d];
}
