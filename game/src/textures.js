// Every texture in the game is painted here on a canvas at load time: building facades (with a
// matching night map of lit windows), sidewalk tiles, asphalt, grass, sand, the glow sprite, and
// for the interiors floors (tile, wood, concrete, carpet), walls, the bay seen through a window,
// shop labels and posters. Nothing is loaded from a file, so the game ships no images at all.
import * as THREE from '../vendor/three.module.min.js';
import { makeRng } from './rng.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function speckle(ctx, w, h, count, rng, colors, size = 2) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = rng.pick(colors);
    ctx.fillRect(rng.next() * w, rng.next() * h, size, size);
  }
}

/**
 * Turn a greyscale height canvas into a tangent-space normal map: brighter is nearer the viewer,
 * so recessed windows, raised frames, tile grooves and corrugations catch the light.
 */
export function normalFromHeight(src, strength = 2.5) {
  const w = src.width;
  const h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => data[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      let ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      out.data[i] = (nx * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  return finish(c, true, false);
}

/**
 * Paints the same layout into four layers at once: colour, night windows, height (for the normal
 * map) and roughness/metalness (green = roughness, blue = metalness, as three.js reads them).
 */
function layers(S) {
  const L = {};
  for (const k of ['map', 'night', 'height', 'orm']) [L[k + 'C'], L[k]] = canvas(S, S);
  L.night.fillStyle = '#000';
  L.night.fillRect(0, 0, S, S);
  L.rect = (x, y, w, h, color, height, rough, metal = 0) => {
    L.map.fillStyle = color;
    L.map.fillRect(x, y, w, h);
    const hv = Math.round(height * 255);
    L.height.fillStyle = `rgb(${hv},${hv},${hv})`;
    L.height.fillRect(x, y, w, h);
    L.orm.fillStyle = `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
    L.orm.fillRect(x, y, w, h);
  };
  return L;
}

/**
 * A facade tile covering 16 m x 14 m of wall (4 window columns, 4 floors), with its night,
 * normal and roughness/metalness maps. kind: 'glass' curtain wall for towers, 'stucco' for
 * homes and hotels, 'shed' corrugated metal for warehouses, 'shop' for street-level storefronts
 * (one tile is 8 m x 4.5 m).
 */
export function facadeTextures(kind, seed) {
  const rng = makeRng(seed);
  const S = 512;
  const L = layers(S);
  const cols = 4;
  const rows = 4;
  const cw = S / cols;
  const rh = S / rows;
  const lit = (x, y, w, h, colors, p) => {
    if (!rng.chance(p)) return;
    const grad = L.night.createLinearGradient(x, y, x, y + h);
    const col = rng.pick(colors);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    L.night.fillStyle = grad;
    L.night.fillRect(x, y, w, h);
  };
  if (kind === 'glass') {
    L.rect(0, 0, S, S, '#c9d3dc', 0.6, 0.5, 0.6);
    for (let r = 0; r < rows; r += 1) {
      // spandrel band at each floor slab
      L.rect(0, r * rh, S, 18, '#9aa7b3', 0.55, 0.45, 0.5);
      for (let k = 0; k < cols; k += 1) {
        const x = k * cw + 5;
        const y = r * rh + 22;
        const w = cw - 10;
        const h = rh - 26;
        const tint = rng.pick(['#3b5d7a', '#46698a', '#35546f', '#4f7695']);
        L.rect(x, y, w, h, tint, 0.3, 0.05, 0.9);
        L.rect(x + w / 2 - 2, y, 4, h, '#d0d8e0', 0.7, 0.35, 0.8);
        lit(x, y, w, h, ['#ffe2b0', '#fff1d6', '#cfe8ff', '#ffd08a'], 0.4);
      }
    }
  } else if (kind === 'stucco') {
    L.rect(0, 0, S, S, '#f3ece1', 0.6, 0.92, 0);
    for (let i = 0; i < 2600; i += 1) {
      const v = rng.next();
      L.map.fillStyle = v < 0.5 ? 'rgba(120,100,80,0.06)' : 'rgba(255,255,255,0.08)';
      L.map.fillRect(rng.next() * S, rng.next() * S, 3, 3);
    }
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cols; k += 1) {
        const x = k * cw + 30;
        const y = r * rh + 22;
        const w = cw - 60;
        const h = rh - 46;
        L.rect(x - 6, y - 6, w + 12, h + 12, '#ffffff', 0.85, 0.7, 0);       // frame
        L.rect(x, y, w, h, '#2f3d4a', 0.12, 0.06, 0.6);                        // glass, recessed
        L.rect(x + w / 2 - 2, y, 4, h, '#e8e8e8', 0.4, 0.6, 0);                // mullion
        L.rect(x, y + h * 0.42, w, 3, '#e8e8e8', 0.4, 0.6, 0);
        L.rect(x - 12, y + h + 6, w + 24, 8, '#ffffff', 1, 0.7, 0);            // sill
        if ((r + k) % 3 === 0) {
          L.rect(x - 24, y - 4, 16, h + 8, '#2a8a8a', 0.8, 0.6, 0);            // shutters
          L.rect(x + w + 8, y - 4, 16, h + 8, '#2a8a8a', 0.8, 0.6, 0);
        }
        lit(x, y, w, h, ['#ffcf87', '#ffe3ae', '#ffb86b'], 0.36);
      }
    }
  } else if (kind === 'shed') {
    L.rect(0, 0, S, S, '#c4bfb3', 0.5, 0.55, 0.5);
    for (let x = 0; x < S; x += 4) {
      const v = 0.5 + 0.45 * Math.sin((x / 16) * Math.PI * 2);
      const hv = Math.round(v * 255);
      L.height.fillStyle = `rgb(${hv},${hv},${hv})`;
      L.height.fillRect(x, 0, 4, S);
      L.map.fillStyle = v > 0.6 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
      L.map.fillRect(x, 0, 4, S);
    }
    for (let k = 0; k < cols; k += 1) {
      L.rect(k * cw + 18, 50, cw - 36, 34, '#4c5966', 0.2, 0.1, 0.6);
      lit(k * cw + 18, 50, cw - 36, 34, ['#ffd38a'], 0.3);
    }
    L.rect(0, S - 22, S, 22, '#8d8a82', 0.6, 0.8, 0.1);
  } else {
    // storefront: two big display windows, a door and a sign band
    L.rect(0, 0, S, S, '#3a3430', 0.65, 0.6, 0.2);
    L.rect(0, 0, S, 92, rng.pick(['#c0392b', '#1e6f8a', '#2d6a4f', '#8a4fbf', '#d4862b']), 0.75, 0.5, 0.1);
    L.rect(14, 108, 210, 360, '#26333d', 0.15, 0.12, 0.3);
    L.rect(288, 108, 210, 360, '#26333d', 0.15, 0.12, 0.3);
    L.rect(236, 140, 40, 372, '#4a2e1c', 0.4, 0.5, 0);
    for (const x of [14, 288]) {
      L.rect(x + 103, 108, 5, 360, '#b8b8b8', 0.7, 0.3, 0.9);
      L.night.fillStyle = rng.pick(['#ffe6b3', '#fff4dc', '#ffd59a']);
      L.night.fillRect(x, 108, 210, 360);
    }
    L.night.fillStyle = '#ffffff';
    L.night.fillRect(0, 20, S, 52);
  }
  return {
    map: finish(L.mapC),
    night: finish(L.nightC),
    normal: normalFromHeight(L.heightC, kind === 'shed' ? 3 : 4),
    orm: finish(L.ormC, true, false),
  };
}

export function sidewalkNormal() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#303030';
  g.lineWidth = 3;
  g.strokeRect(1, 1, 126, 126);
  g.beginPath();
  g.moveTo(64, 0); g.lineTo(64, 128);
  g.moveTo(0, 64); g.lineTo(128, 64);
  g.stroke();
  return normalFromHeight(c, 3);
}

export function asphaltNormal() {
  const rng = makeRng(13);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, rng, ['#6a6a6a', '#9a9a9a', '#747474', '#8c8c8c'], 2);
  return normalFromHeight(c, 1.2);
}

export function sidewalkTexture() {
  const rng = makeRng(7);
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#cfc8bb';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 500, rng, ['#c2baa9', '#d9d3c8', '#bdb4a4'], 2);
  g.strokeStyle = 'rgba(80,70,60,0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 126, 126);
  g.beginPath();
  g.moveTo(64, 0); g.lineTo(64, 128);
  g.moveTo(0, 64); g.lineTo(128, 64);
  g.stroke();
  return finish(c);
}

export function asphaltTexture() {
  const rng = makeRng(11);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#4a4d52';
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 4000, rng, ['#55595f', '#3f4246', '#5d6066', '#45484c'], 2);
  for (let i = 0; i < 6; i += 1) {
    g.fillStyle = 'rgba(20,20,24,0.12)';
    g.beginPath();
    g.ellipse(rng.next() * 256, rng.next() * 256, 10 + rng.next() * 30, 6 + rng.next() * 16, rng.next() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
}

export function grassTexture() {
  const rng = makeRng(5);
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#6f9a45';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1600, rng, ['#5f8a3a', '#7faa52', '#8bb55c', '#577f35'], 2);
  return finish(c);
}

export function sandTexture() {
  const rng = makeRng(3);
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#ead6a6';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1800, rng, ['#e0c995', '#f2e1b8', '#d9c08a', '#f6e8c6'], 2);
  return finish(c);
}

/** A soft round glow for headlights, police lights, muzzle flashes and markers. */
export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return finish(c, false);
}

/** A soft puff for smoke, dust and tyre smoke. */
export function smokeTexture() {
  const rng = makeRng(9);
  const [c, g] = canvas(64, 64);
  for (let i = 0; i < 14; i += 1) {
    const x = 18 + rng.next() * 28;
    const y = 18 + rng.next() * 28;
    const r = 8 + rng.next() * 14;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return finish(c, false);
}

// ------------------------------------------------------------------ interiors

/**
 * Floors for the rooms, one tile per metre-ish of floor (callers set repeat): 'tile' is a
 * two-tone chequer (the laundry), 'wood' planks (Kai's apartment), 'concrete' a sealed slab with
 * expansion joints (the gun shop and range), 'carpet' a soft woven pile (the boutique).
 * Returns { map, normal }.
 */
export function floorTexture(kind) {
  const rng = makeRng(kind.length * 17 + 3);
  const S = 256;
  const [c, g] = canvas(S, S);
  const [h, hg] = canvas(S, S);
  hg.fillStyle = '#9a9a9a';
  hg.fillRect(0, 0, S, S);
  if (kind === 'tile') {
    const n = 4;
    const t = S / n;
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        g.fillStyle = (x + y) % 2 ? '#e9e4d6' : '#3f9a94';
        g.fillRect(x * t, y * t, t, t);
      }
    }
    speckle(g, S, S, 900, rng, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.06)'], 2);
    hg.strokeStyle = '#3a3a3a';
    hg.lineWidth = 3;
    g.strokeStyle = 'rgba(40,40,40,0.35)';
    g.lineWidth = 2;
    for (let k = 0; k <= n; k += 1) {
      for (const ctx of [g, hg]) {
        ctx.beginPath(); ctx.moveTo(k * t, 0); ctx.lineTo(k * t, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, k * t); ctx.lineTo(S, k * t); ctx.stroke();
      }
    }
  } else if (kind === 'wood') {
    const rows = 6;
    const rh = S / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = -rng.range(0, 120);
      while (x < S) {
        const len = rng.range(90, 170);
        const tone = rng.range(-12, 12);
        g.fillStyle = `hsl(${28 + rng.range(-4, 4)}, ${42 + tone * 0.5}%, ${44 + tone}%)`;
        g.fillRect(x, r * rh, len, rh);
        // grain lines along the plank
        for (let k = 0; k < 7; k += 1) {
          g.strokeStyle = `rgba(70,40,20,${rng.range(0.08, 0.2)})`;
          g.lineWidth = 1;
          const y = r * rh + rng.range(3, rh - 3);
          g.beginPath();
          g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + rng.range(-3, 3), x + len * 0.7, y + rng.range(-3, 3), x + len, y);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,24,12,0.55)';
        g.fillRect(x, r * rh, 2, rh);
        hg.fillStyle = '#404040';
        hg.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(40,24,12,0.5)';
      g.fillRect(0, r * rh, S, 2);
      hg.fillStyle = '#404040';
      hg.fillRect(0, r * rh, S, 2);
    }
  } else if (kind === 'carpet') {
    g.fillStyle = '#6b3550';
    g.fillRect(0, 0, S, S);
    speckle(g, S, S, 9000, rng, ['#7a3e5c', '#5e2d46', '#83486a', '#6f3a55'], 2);
    g.strokeStyle = 'rgba(255,214,140,0.25)';
    g.lineWidth = 3;
    g.strokeRect(16, 16, S - 32, S - 32);
    speckle(hg, S, S, 6000, rng, ['#a0a0a0', '#909090', '#b0b0b0'], 2);
  } else {
    g.fillStyle = '#8d8a84';
    g.fillRect(0, 0, S, S);
    speckle(g, S, S, 5000, rng, ['#85827c', '#96938c', '#7e7b75', '#9b9892'], 2);
    for (let i = 0; i < 5; i += 1) {
      g.fillStyle = 'rgba(60,55,50,0.08)';
      g.beginPath();
      g.ellipse(rng.next() * S, rng.next() * S, rng.range(20, 60), rng.range(12, 30), rng.next() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(40,38,35,0.6)';
    g.fillRect(0, 0, S, 2);
    g.fillRect(0, 0, 2, S);
    hg.fillStyle = '#303030';
    hg.fillRect(0, 0, S, 3);
    hg.fillRect(0, 0, 3, S);
  }
  return { map: finish(c), normal: normalFromHeight(h, kind === 'carpet' ? 1.2 : 2.5) };
}

/**
 * Wall finishes: 'paint' (a softly mottled emulsion with a skirting board along the bottom of
 * the tile, tinted by the room's colour through the material), 'brick' (white-washed brick for
 * the gun shop). One tile covers 4 m of wall horizontally and the full room height vertically.
 */
export function wallTexture(kind) {
  const rng = makeRng(kind === 'brick' ? 41 : 43);
  const S = 512;
  const [c, g] = canvas(S, S);
  const [h, hg] = canvas(S, S);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  if (kind === 'brick') {
    g.fillStyle = '#d8d0c4';
    g.fillRect(0, 0, S, S);
    const bh = 24;
    const bw = 64;
    for (let y = 0; y < S; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S + bw; x += bw) {
        const tone = rng.range(-10, 8);
        g.fillStyle = `hsl(${18 + rng.range(-5, 5)}, ${18 + tone * 0.3}%, ${80 + tone}%)`;
        g.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
        hg.fillStyle = '#b8b8b8';
        hg.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
  } else {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1600; i += 1) {
      g.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.05)';
      g.beginPath();
      g.arc(rng.next() * S, rng.next() * S, rng.range(2, 9), 0, Math.PI * 2);
      g.fill();
    }
  }
  // skirting board along the floor
  g.fillStyle = kind === 'brick' ? '#4a4038' : '#f4efe6';
  g.fillRect(0, S - 22, S, 22);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, S - 23, S, 2);
  hg.fillStyle = '#c0c0c0';
  hg.fillRect(0, S - 22, S, 22);
  return { map: finish(c), normal: normalFromHeight(h, 2) };
}

/**
 * The bay seen through a window: sky, the sea's horizon, a strip of beach and a few palms, at the
 * time of day given by hour (golden afternoon, dusk or night). Used on emissive window panes.
 */
export function windowViewTexture(hour = 17) {
  const [c, g] = canvas(256, 192);
  const night = hour < 6 || hour > 20;
  const dusk = !night && hour > 18;
  const sky = g.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, night ? '#0b1230' : dusk ? '#5a5fae' : '#4a86d0');
  sky.addColorStop(1, night ? '#2b2f66' : dusk ? '#ff9b6b' : '#ffd9a6');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 120);
  if (!night) {
    g.fillStyle = dusk ? 'rgba(255,170,110,0.9)' : 'rgba(255,240,200,0.9)';
    g.beginPath(); g.arc(180, 104, dusk ? 22 : 14, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 30; i += 1) g.fillRect((i * 97) % 256, (i * 53) % 90, 1.5, 1.5);
  }
  const sea = g.createLinearGradient(0, 120, 0, 160);
  sea.addColorStop(0, night ? '#14244a' : '#2aa3c4');
  sea.addColorStop(1, night ? '#0a1530' : '#0f5f8f');
  g.fillStyle = sea;
  g.fillRect(0, 120, 256, 40);
  g.fillStyle = night ? '#3a3a40' : '#f1dfb0';
  g.fillRect(0, 160, 256, 32);
  // palm silhouettes
  g.strokeStyle = night ? '#05070f' : '#2f4a2c';
  g.fillStyle = g.strokeStyle;
  for (const [x, hgt] of [[36, 120], [214, 100], [120, 80]]) {
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, 192); g.quadraticCurveTo(x + 8, 192 - hgt * 0.5, x + 4, 192 - hgt); g.stroke();
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x + 4, 192 - hgt);
      g.quadraticCurveTo(x + 4 + Math.cos(a) * 16, 192 - hgt - 10, x + 4 + Math.cos(a) * 28, 192 - hgt + 10 + Math.abs(Math.sin(a)) * 6);
      g.stroke();
    }
  }
  return finish(c, false);
}

/**
 * A painted label or poster: big text over a background colour with an optional second line,
 * for shop counters, range lane numbers, posters and the TV's news channel.
 */
export function labelTexture(text, { fg = '#ffffff', bg = '#1d1f2b', sub = '', w = 512, h = 128, border = null, font = 'bold 54px' } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = Math.max(4, h * 0.05);
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  }
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${font} "Avenir Next", "Trebuchet MS", sans-serif`;
  g.fillText(text, w / 2, sub ? h * 0.4 : h / 2, w * 0.92);
  if (sub) {
    g.font = `${Math.round(h * 0.18)}px "Avenir Next", "Trebuchet MS", sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText(sub, w / 2, h * 0.76, w * 0.92);
    g.globalAlpha = 1;
  }
  return finish(c, false);
}

/** A live canvas texture (the apartment TV): returns { canvas, ctx, texture }. */
export function liveTexture(w, h) {
  const [c, g] = canvas(w, h);
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  return { canvas: c, ctx: g, texture: finish(c, false) };
}
