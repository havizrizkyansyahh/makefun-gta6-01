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
 * A facade tile covering 16 m x 14 m of wall (4 window columns, 4 floors), plus its night map.
 * kind: 'glass' for downtown towers, 'stucco' for homes and hotels, 'shed' for warehouses.
 */
export function facadeTextures(kind, seed) {
  const rng = makeRng(seed);
  const S = 256;
  const [c, g] = canvas(S, S);
  const [n, ng] = canvas(S, S);
  ng.fillStyle = '#000';
  ng.fillRect(0, 0, S, S);
  const cols = 4;
  const rows = 4;
  const cw = S / cols;
  const rh = S / rows;
  if (kind === 'glass') {
    g.fillStyle = '#d9e2ea';
    g.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cols; k += 1) {
        const x = k * cw + 3;
        const y = r * rh + 4;
        const grad = g.createLinearGradient(x, y, x + cw, y + rh);
        grad.addColorStop(0, '#2d4f6e');
        grad.addColorStop(0.55, '#5f8db0');
        grad.addColorStop(1, '#253f58');
        g.fillStyle = grad;
        g.fillRect(x, y, cw - 6, rh - 8);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x + 4, y + 3, 6, rh - 14);
        if (rng.chance(0.42)) {
          ng.fillStyle = rng.pick(['#ffd9a0', '#fff1c9', '#bfe3ff', '#ffc37a']);
          ng.fillRect(x, y, cw - 6, rh - 8);
        }
      }
    }
  } else if (kind === 'stucco') {
    g.fillStyle = '#f4ede2';
    g.fillRect(0, 0, S, S);
    speckle(g, S, S, 900, rng, ['#e8dfd0', '#fbf6ee', '#e2d6c4'], 2);
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cols; k += 1) {
        const x = k * cw + 16;
        const y = r * rh + 14;
        g.fillStyle = '#3c4a57';
        g.fillRect(x, y, cw - 32, rh - 26);
        g.fillStyle = '#7fa3bd';
        g.fillRect(x + 3, y + 3, cw - 38, (rh - 32) / 2);
        g.fillStyle = '#ffffff';
        g.fillRect(x - 4, y + rh - 26, cw - 24, 4);
        // Shutters on some windows give the beach blocks a holiday look.
        if ((r + k) % 3 === 0) {
          g.fillStyle = 'rgba(40,120,120,0.85)';
          g.fillRect(x - 9, y, 7, rh - 26);
          g.fillRect(x + cw - 34, y, 7, rh - 26);
        }
        if (rng.chance(0.38)) {
          ng.fillStyle = rng.pick(['#ffcf87', '#ffe3ae', '#ffb86b']);
          ng.fillRect(x, y, cw - 32, rh - 26);
        }
      }
    }
  } else {
    g.fillStyle = '#c9c4b8';
    g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 8) {
      g.fillStyle = x % 16 === 0 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
      g.fillRect(x, 0, 4, S);
    }
    g.fillStyle = '#4c5966';
    for (let k = 0; k < cols; k += 1) g.fillRect(k * cw + 10, 30, cw - 20, 18);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, S - 10, S, 10);
    for (let k = 0; k < cols; k += 1) {
      if (rng.chance(0.3)) {
        ng.fillStyle = '#ffd38a';
        ng.fillRect(k * cw + 10, 30, cw - 20, 18);
      }
    }
  }
  return { map: finish(c), night: finish(n) };
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
