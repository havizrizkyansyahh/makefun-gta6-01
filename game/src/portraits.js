// Portraits and map icons. Each character's face is rendered from their actual in-game 3D model
// (a small studio: key light, rim light, a coloured backdrop) into a round, framed image; places
// get bold pictograms (a house, a pistol, a parcel, a chequered flag, a cross, a badge). The
// minimap, the city map and its cards all draw from this set.
import * as THREE from '../vendor/three.module.min.js';
import { Human, LOOKS } from './human.js';

const SIZE = 160;

/** Render one character's head and shoulders into a round portrait canvas. */
function renderPortrait(renderer, look, ring, backdrop) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(backdrop);
  const h = new Human(look);
  h.animate(0, 0, 'idle');
  h.root.rotation.y = 0.35;
  scene.add(h.root);
  scene.add(new THREE.HemisphereLight('#ffffff', '#6a5a50', 1.6));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6);
  key.position.set(1.5, 2.6, 2.2);
  const rim = new THREE.DirectionalLight('#9fd4ff', 1.6);
  rim.position.set(-2, 2.2, -1.5);
  scene.add(key, rim);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 10);
  cam.position.set(0.25, 1.86, 1.25);
  cam.lookAt(0, 1.8, 0);
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  const prevTarget = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget);
  rt.dispose();
  // pixels come back bottom-up and linear: flip, and encode to sRGB for the 2D canvas
  const raw = document.createElement('canvas');
  raw.width = raw.height = SIZE;
  const rg = raw.getContext('2d');
  const img = rg.createImageData(SIZE, SIZE);
  const enc = (v) => {
    const c = v / 255;
    return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  };
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const s = ((SIZE - 1 - y) * SIZE + x) * 4;
      const d = (y * SIZE + x) * 4;
      img.data[d] = enc(px[s]);
      img.data[d + 1] = enc(px[s + 1]);
      img.data[d + 2] = enc(px[s + 2]);
      img.data[d + 3] = 255;
    }
  }
  rg.putImageData(img, 0, 0);
  return framed(raw, ring);
}

/** Clip an image into a circle with a coloured ring and a dark outline. */
function framed(source, ring) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const r = SIZE / 2;
  g.save();
  g.beginPath();
  g.arc(r, r, r - 8, 0, Math.PI * 2);
  g.clip();
  g.drawImage(source, 0, 0, SIZE, SIZE);
  g.restore();
  g.lineWidth = 9;
  g.strokeStyle = ring;
  g.beginPath();
  g.arc(r, r, r - 8, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(10,14,30,0.9)';
  g.beginPath();
  g.arc(r, r, r - 2.5, 0, Math.PI * 2);
  g.stroke();
  return c;
}

/** A round pictogram badge for a place. */
function placeIcon(kind, color) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const r = SIZE / 2;
  g.fillStyle = color;
  g.beginPath(); g.arc(r, r, r - 8, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(10,14,30,0.9)';
  g.stroke();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const poly = (pts) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };
  switch (kind) {
    case 'house':
      poly([[80, 36], [124, 74], [112, 74], [112, 120], [48, 120], [48, 74], [36, 74]]);
      g.fillStyle = color; g.fillRect(70, 92, 20, 28);
      break;
    case 'gun':
      g.fillRect(40, 58, 82, 18); g.fillRect(118, 62, 8, 10);
      poly([[52, 74], [80, 74], [72, 112], [50, 112], [46, 106]]);
      break;
    case 'box':
      poly([[80, 40], [120, 58], [80, 76], [40, 58]]);
      poly([[40, 64], [76, 81], [76, 122], [40, 104]]);
      poly([[84, 81], [120, 64], [120, 104], [84, 122]]);
      break;
    case 'flag':
      g.fillRect(46, 36, 7, 88);
      for (let i = 0; i < 4; i += 1) for (let j = 0; j < 3; j += 1) if ((i + j) % 2 === 0) g.fillRect(53 + i * 15, 40 + j * 14, 15, 14);
      g.lineWidth = 3; g.strokeRect(53, 40, 60, 42);
      break;
    case 'cross':
      g.fillRect(68, 40, 24, 80); g.fillRect(40, 68, 80, 24);
      break;
    case 'badge':
      poly([[80, 36], [118, 50], [112, 96], [80, 124], [48, 96], [42, 50]]);
      g.fillStyle = color; g.font = 'bold 42px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 80, 80);
      break;
    case 'objective': {
      const pts = [];
      for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? 22 : 48;
        pts.push([80 + Math.cos(a) * rr, 82 + Math.sin(a) * rr]);
      }
      g.fillStyle = '#1a1a1a';
      poly(pts);
      break;
    }
    case 'waypoint':
      g.beginPath(); g.arc(80, 66, 26, 0, Math.PI * 2); g.fill();
      poly([[58, 80], [102, 80], [80, 124]]);
      g.fillStyle = color; g.beginPath(); g.arc(80, 66, 11, 0, Math.PI * 2); g.fill();
      break;
    default:
      g.beginPath(); g.arc(80, 80, 24, 0, Math.PI * 2); g.fill();
  }
  return c;
}

/** Every portrait and pictogram the maps use, keyed by name. */
export function makeIcons(renderer) {
  const icons = {};
  const faces = {
    kai: [LOOKS.kai, '#2ec4b6', '#1f3b4d'],
    nadia: [LOOKS.nadia, '#ffb000', '#5a3a1a'],
    pearl: [LOOKS.pearl, '#ff5fa2', '#3d1f3a'],
    halo: [LOOKS.calder, '#ff4d4d', '#2a2a33'],
    cop: [LOOKS.cop, '#5c8dff', '#1c2541'],
  };
  for (const [k, [look, ring, bg]] of Object.entries(faces)) {
    try { icons[k] = renderPortrait(renderer, look, ring, bg); } catch { icons[k] = placeIcon('dot', ring); }
  }
  icons.house = placeIcon('house', '#52d273');
  icons.gun = placeIcon('gun', '#ff7043');
  icons.box = placeIcon('box', '#4fc3f7');
  icons.flag = placeIcon('flag', '#ff9f1c');
  icons.hospital = placeIcon('cross', '#ef5350');
  icons.police = placeIcon('badge', '#5c8dff');
  icons.objective = placeIcon('objective', '#ffd23f');
  icons.waypoint = placeIcon('waypoint', '#b14dff');
  return icons;
}
