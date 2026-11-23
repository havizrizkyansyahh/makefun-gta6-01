// Every texture in the game is painted here on a canvas at load time: building facades (with a
// matching night map of lit windows), sidewalk tiles, asphalt, grass, sand and the glow sprite.
// Nothing is loaded from a file, so the game ships no images at all.
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
