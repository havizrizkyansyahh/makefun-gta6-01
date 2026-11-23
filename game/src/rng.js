// A small seeded random source (mulberry32), so the city, the shop stock and the screenshot
// scenes come out the same for the same seed, plus the handful of helpers every system wants:
// clamping and easing, angle wrapping, shuffling, and formatting times and money for the HUD.

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** Shuffle a list in place (Fisher-Yates) with a seeded or plain random source. */
export function shuffle(list, rng = { next: Math.random }) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Hermite ease between edges a and b, the same curve the shaders use. */
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Seconds as m:ss.t for lap, trial and range times. */
export function formatTime(s) {
  if (!Number.isFinite(s)) return '--:--';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}

/** Whole dollars with thousands separators. */
export const dollars = (n) => `$${Math.floor(n).toLocaleString('en-US')}`;
