// Vehicles of Solmara Bay: the models (built from boxes, with spinning and steering wheels,
// head, tail and police lights) and the arcade driving model every car shares, whether the
// player, a traffic driver or a police officer is at the wheel. Also car-to-car collisions, and
// what Torque & Tide Customs can do to a car: engine, brakes and armour upgrades, respray,
// underglow, window tint, rims and a full repair.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, wrapAngle } from './rng.js';
import { mergeParts, mat4 } from './geometry.js';
import { buildBoatModel, boatPhysics } from './boats.js';

/** The city's own makes. len/wid/hgt in metres; power m/s^2, top m/s, grip, turn rad/s. */
export const MODELS = {
  ardent: { name: 'Ardent GT', body: 'coupe', len: 4.5, wid: 1.95, hgt: 1.15, power: 17, top: 56, grip: 7.5, turn: 2.2, mass: 1.2, colors: ['#e63946', '#ffb703', '#2ec4b6', '#f1faee', '#111111'] },
  brisa: { name: 'Brisa Hatch', body: 'hatch', len: 3.9, wid: 1.8, hgt: 1.45, power: 11, top: 40, grip: 6.5, turn: 2.4, mass: 0.9, colors: ['#90be6d', '#f9c74f', '#577590', '#f94144', '#ffffff', '#c77dff'] },
  marlin: { name: 'Marlin Cab', body: 'sedan', len: 4.7, wid: 1.9, hgt: 1.45, power: 12, top: 44, grip: 6.4, turn: 2.0, mass: 1.15, colors: ['#ffd23f'], taxi: true },
  corso: { name: 'Bayliner Sedan', body: 'sedan', len: 4.8, wid: 1.92, hgt: 1.42, power: 12.5, top: 45, grip: 6.4, turn: 2.0, mass: 1.2, colors: ['#3d5a80', '#98c1d9', '#ee6c4d', '#e0fbfc', '#293241', '#8d99ae'] },
  pelican: { name: 'Pelican Van', body: 'van', len: 5.3, wid: 2.1, hgt: 2.3, power: 9, top: 34, grip: 5.6, turn: 1.7, mass: 1.8, colors: ['#ffffff', '#f4a261', '#2a9d8f', '#e9c46a'] },
  halden: { name: 'Halden Ranger', body: 'pickup', len: 5.2, wid: 2.05, hgt: 1.7, power: 12, top: 42, grip: 6.0, turn: 1.8, mass: 1.6, colors: ['#bc4749', '#386641', '#6a994e', '#264653', '#f2e8cf'] },
  bayrunner: { name: 'Bayrunner 70', body: 'muscle', len: 4.9, wid: 2.0, hgt: 1.25, power: 16, top: 52, grip: 6.2, turn: 2.0, mass: 1.35, colors: ['#fb8500', '#219ebc', '#8338ec', '#000000'] },
  cruiser: { name: 'SBPD Interceptor', body: 'sedan', len: 4.9, wid: 1.95, hgt: 1.42, power: 16, top: 54, grip: 7.2, turn: 2.1, mass: 1.35, colors: ['#f4f4f4'], police: true },
  sprint: { name: 'Sprint 250', body: 'bike', len: 2.1, wid: 0.8, hgt: 1.1, power: 15, top: 50, grip: 8.5, turn: 2.8, mass: 0.45, colors: ['#e63946', '#1d3557', '#ffb703', '#2ec4b6', '#f1faee'] },
  marisol: { name: 'Marisol 22', body: 'boat', len: 6.2, wid: 2.3, hgt: 1.7, power: 12, top: 30, grip: 2.4, turn: 1.15, mass: 1.6, colors: ['#f4f4f0', '#1d3557', '#e63946'] },
  halcyon: { name: 'Halcyon GT-R', body: 'coupe', len: 4.6, wid: 2.0, hgt: 1.1, power: 21, top: 64, grip: 8.2, turn: 2.35, mass: 1.25, colors: ['#bde0fe'] },
  // a 40-foot motor yacht: slow, heavy, a cabin and a flybridge (Captain Hollis's way out)
  tidecaller: { name: 'Tidecaller 40', body: 'boat', len: 12, wid: 3.8, hgt: 3.4, power: 8.5, top: 21, grip: 1.9, turn: 0.55, mass: 4.5, colors: ['#f4f4f0'], yacht: true, deck: 1.15 },
};

/** Respray colours at Torque & Tide, and the underglow and rim choices. */
export const PAINTS = [
  ['Coral Red', '#e63946'], ['Sunburst', '#ffb703'], ['Lagoon', '#2ec4b6'], ['Pearl White', '#f1faee'],
  ['Midnight', '#111111'], ['Bay Blue', '#1d6fb8'], ['Orchid', '#9b5de5'], ['Lime Twist', '#90be6d'],
  ['Sunset Orange', '#fb8500'], ['Gunmetal', '#4a4e57'], ['Rose Gold', '#e8a598'], ['Racing Green', '#1f5f3f'],
];
export const NEONS = [['Off', null], ['Teal', '#2de2ff'], ['Hot Pink', '#ff2d95'], ['Violet', '#b14dff'], ['Gold', '#ffd23f'], ['Lime', '#3dff8b']];
export const RIMS = [['Chrome', null], ['Satin Black', '#3a3c40'], ['Gold', '#ffc84a'], ['Candy Red', '#ff4a4a'], ['Ice Blue', '#8fd3ff']];
export const TINTS = ['Stock', 'Dark', 'Limo'];

/** A car straight from the factory. */
export function defaultMods() {
  return { engine: 0, brakes: 0, armor: 0, neon: null, tint: 0, rims: null, color: null };
}

export const TRAFFIC_MIX = ['brisa', 'brisa', 'corso', 'corso', 'corso', 'marlin', 'pelican', 'halden', 'bayrunner', 'ardent'];

const box = new THREE.BoxGeometry(1, 1, 1);
const tyreGeo = new THREE.TorusGeometry(0.27, 0.105, 10, 22);
tyreGeo.rotateY(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.21, 0.23, 0.2, 16);
rimGeo.rotateZ(Math.PI / 2);
const capGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10);
capGeo.rotateZ(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.21, 0.035, 0.36);
const lampGeo = new THREE.SphereGeometry(0.16, 14, 10);
const barGeo = new THREE.CapsuleGeometry(0.07, 0.4, 4, 10);
barGeo.rotateZ(Math.PI / 2);
const shared = {
  glass: new THREE.MeshPhysicalMaterial({ color: '#0c141d', roughness: 0.04, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.6 }),
  tyre: new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.88 }),
  hub: new THREE.MeshStandardMaterial({ color: '#d4d8de', roughness: 0.22, metalness: 0.95 }),
  trim: new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.55, metalness: 0.2 }),
  charred: new THREE.MeshStandardMaterial({ color: '#191919', roughness: 1 }),
  chrome: new THREE.MeshStandardMaterial({ color: '#e4e8ee', roughness: 0.12, metalness: 1 }),
  checker: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.6 }),
  plate: new THREE.MeshStandardMaterial({ color: '#f2f0e6', roughness: 0.5 }),
  driverBody: new THREE.MeshStandardMaterial({ color: '#39404c', roughness: 0.8 }),
  driverSkin: new THREE.MeshStandardMaterial({ color: '#b98060', roughness: 0.6 }),
};

/** Extrude a side profile (u along the car, front positive; v up) across the car's width. */
/** Windscreen after a few crashes: spider-web cracks on tinted glass. */
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2633';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(230,240,255,0.75)';
  for (const [cx, cy] of [[90, 110], [180, 160]]) {
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2 + Math.random() * 0.3;
      let x = cx;
      let y = cy;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 6; s += 1) {
        x += Math.cos(a + (Math.random() - 0.5) * 0.6) * 14;
        y += Math.sin(a + (Math.random() - 0.5) * 0.6) * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let r = 12; r < 60; r += 14) {
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(cx, cy, r + Math.random() * 4, 0, Math.PI * 2);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  return t;
}
const crackedGlass = new THREE.MeshPhysicalMaterial({ map: crackTexture(), roughness: 0.35, metalness: 0.1, clearcoat: 0.6 });
// window tints from the garage: stock, dark and limo-black
const tintGlass = [
  shared.glass,
  new THREE.MeshPhysicalMaterial({ color: '#05080c', roughness: 0.03, metalness: 0.35, clearcoat: 1, envMapIntensity: 1.8 }),
  new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.02, metalness: 0.7, clearcoat: 1, envMapIntensity: 2.2 }),
];

/** Underglow: a soft pool of coloured light painted under the car (it blooms after dark). */
function glowPoolTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  // an ellipse twice as long as it is wide, fading out before every edge of the canvas
  g.setTransform(1, 0, 0, 2, 0, 0);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowPool = glowPoolTexture();
const glowGeo = new THREE.PlaneGeometry(1, 1);
glowGeo.rotateX(-Math.PI / 2);
const glowMats = new Map();
function glowMaterial(color) {
  if (!glowMats.has(color)) glowMats.set(color, new THREE.MeshBasicMaterial({ map: glowPool, color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  return glowMats.get(color);
}
const rimMats = new Map();

function extrudeProfile(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 12,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

// cabin layout per body style, as fractions of the length: base rear/front, roof rear/front
const CABINS = {
  sedan: [-0.29, 0.17, -0.2, 0.02],
  coupe: [-0.3, 0.14, -0.13, -0.01],
  hatch: [-0.47, 0.18, -0.45, -0.01],
  muscle: [-0.26, 0.08, -0.15, -0.04],
  van: [-0.49, 0.33, -0.49, 0.2],
  pickup: [-0.06, 0.2, -0.05, 0.08],
};
const geoCache = new Map();

/** Body and cabin geometry for a make, cached so every car of a make shares them. */
function bodyGeometry(spec) {
  if (geoCache.has(spec.name)) return geoCache.get(spec.name);
  const L = spec.len;
  const W = spec.wid;
  const H = spec.hgt;
  const b = 0.24;
  const deck = H * (spec.body === 'van' ? 0.42 : 0.44);
  const top = b + H;
  const [cr0, cf0, cr1, cf1] = CABINS[spec.body].map((f) => f * L);
  const wz = L / 2 - 0.85;
  const ar = 0.45;
  const ac = 0.37;
  const d = Math.asin(Math.min(0.99, (ac - b) / ar));
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + 0.22, b);
  s.absarc(-wz, ac, ar, Math.PI + d, -d, true);
  s.absarc(wz, ac, ar, Math.PI + d, -d, true);
  s.lineTo(L / 2 - 0.22, b);
  s.quadraticCurveTo(L / 2, b, L / 2, b + 0.2);
  s.lineTo(L / 2, b + deck * 0.55);
  s.quadraticCurveTo(L / 2, b + deck * 0.86, L / 2 - 0.4, b + deck * 0.9);
  s.lineTo(cf0 + 0.15, b + deck);
  s.lineTo(cr0 - 0.1, b + deck);
  if (spec.body === 'coupe' || spec.body === 'muscle') s.lineTo(-L / 2 + 0.25, b + deck * 0.98);
  s.quadraticCurveTo(-L / 2, b + deck * 0.95, -L / 2, b + deck * 0.62);
  s.lineTo(-L / 2, b + 0.2);
  s.quadraticCurveTo(-L / 2, b, -L / 2 + 0.22, b);
  const lower = extrudeProfile(s, W, 0.09);

  const c = new THREE.Shape();
  const v0 = b + deck - 0.04;
  c.moveTo(cr0, v0);
  c.lineTo(cf0, v0);
  c.quadraticCurveTo(cf1 + (cf0 - cf1) * 0.2, top - 0.02, cf1, top);
  c.lineTo(cr1, top);
  c.quadraticCurveTo(cr0 + (cr1 - cr0) * 0.15, top - 0.04, cr0, v0);
  const cabin = extrudeProfile(c, W * 0.86, 0.07);

  const r = new THREE.Shape();
  r.moveTo(cr1 - 0.04, top - 0.07);
  r.lineTo(cf1 + 0.03, top - 0.07);
  r.lineTo(cf1 - 0.04, top + 0.015);
  r.lineTo(cr1 + 0.04, top + 0.015);
  r.closePath();
  const roof = extrudeProfile(r, W * 0.88, 0.04);
  const out = { lower, cabin, roof, b, deck, top, cr0, cf0, cr1, cf1, wz };
  geoCache.set(spec.name, out);
  return out;
}

const modelCache = new Map();

/** Headlight beams painted on the road ahead of every car, faded in after dark. */
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(255,240,200,0.95)');
  grad.addColorStop(0.5, 'rgba(255,235,190,0.35)');
  grad.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(44, 256); g.lineTo(84, 256); g.lineTo(128, 0); g.lineTo(0, 0);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const headlightGlow = new THREE.MeshBasicMaterial({ map: beamTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
const beamGeo = new THREE.PlaneGeometry(1, 1);
beamGeo.rotateX(-Math.PI / 2);
beamGeo.translate(0, 0, 0.5);
function addBeam(body, z, width) {
  const m = new THREE.Mesh(beamGeo, headlightGlow);
  m.scale.set(width, 1, 13);
  m.position.set(0, 0.06, z);
  m.renderOrder = 2;
  body.add(m);
}

/**
 * Every static part of a make, merged by material once and shared by all cars of that make:
 * paint panels, dark trim (with plates, grille, police doors and taxi checkers as vertex
 * colours), glass, lamps, light bars, one wheel and a seated driver.
 */
function modelParts(spec) {
  if (modelCache.has(spec.name)) return modelCache.get(spec.name);
  const L = spec.len;
  const W = spec.wid;
  const g = bodyGeometry(spec);
  const { b, deck, top } = g;
  const paint = [];
  const trim = [];
  const I = new THREE.Matrix4();
  const P = (list, geo, x, y, z, sx = 1, sy = 1, sz = 1, color = '#ffffff', rx = 0) => list.push({ geo, matrix: mat4(x, y, z, sx, sy, sz, rx), color });
  paint.push({ geo: g.lower, matrix: I }, { geo: g.roof, matrix: I });
  const midU = (g.cr0 + g.cf0) / 2;
  P(paint, box, 0, b + deck + (top - b - deck) / 2 - 0.03, midU - 0.05, W * 0.875, top - b - deck, 0.12);
  P(trim, box, 0, b + 0.1, 0, W + 0.01, 0.08, L * 0.5, '#16181c');
  if (spec.body === 'van' || spec.body === 'hatch') {
    const u0 = g.cr0 + 0.05;
    const u1 = spec.body === 'van' ? 0.02 * L : g.cr0 + 0.35;
    P(paint, box, 0, b + deck + (top - b - deck) * 0.43, (u0 + u1) / 2, W * 0.875, (top - b - deck) * 0.86, u1 - u0);
  }
  if (spec.body === 'pickup') {
    for (const sx of [-1, 1]) P(paint, box, sx * (W / 2 - 0.06), b + deck + 0.17, -L * 0.25, 0.07, 0.38, L * 0.42);
    P(paint, box, 0, b + deck + 0.17, -L / 2 + 0.08, W - 0.05, 0.38, 0.07);
    P(trim, box, 0, b + deck + 0.005, -L * 0.25, W - 0.15, 0.02, L * 0.42, '#16181c');
  }
  if (spec.body === 'muscle' || spec.body === 'coupe') P(trim, box, 0, b + deck + 0.14, -L / 2 + 0.22, W * 0.86, 0.04, 0.3, '#16181c');
  if (spec.body === 'muscle') P(trim, box, 0, b + deck + 0.02, L * 0.25, 0.5, 0.09, 0.8, '#16181c');
  P(trim, box, 0, b + deck * 0.42, L / 2 + 0.01, W * 0.5, deck * 0.22, 0.05, '#16181c');
  P(trim, box, 0, b + 0.24, L / 2 + 0.03, 0.42, 0.1, 0.02, '#f2f0e6');
  P(trim, box, 0, b + deck * 0.45, -L / 2 - 0.02, 0.42, 0.1, 0.02, '#f2f0e6');
  for (const sx of [-1, 1]) P(paint, box, sx * (W / 2 + 0.04), b + deck + 0.12, g.cf0 - 0.05, 0.16, 0.09, 0.12);
  const roofY = top + 0.07;
  const roofU = (g.cr1 + g.cf1) / 2;
  if (spec.police) {
    P(trim, box, 0, b + deck * 0.38, -L * 0.04, W + 0.015, deck * 0.5, L * 0.42, '#16203a');
    P(trim, box, 0, b + deck * 0.91 + 0.01, L * 0.33, W * 0.6, 0.02, L * 0.25, '#16203a');
    P(trim, box, 0, roofY, roofU, W * 0.66, 0.05, 0.26, '#16181c');
  }
  if (spec.taxi) P(trim, box, 0, b + deck * 0.62, 0, W + 0.015, 0.1, L * 0.5, '#111111');
  const head = [];
  const tail = [];
  for (const sx of [-1, 1]) {
    P(head, lampGeo, sx * (W / 2 - 0.3), b + deck * 0.66, L / 2 - 0.08, 1.15, 0.55, 0.55);
    P(tail, box, sx * (W / 2 - 0.32), b + deck * 0.72, -L / 2 - 0.005, 0.5, 0.12, 0.06);
  }
  // one wheel: tyre, alloy rim, three spoke bars and a hub cap
  const wheel = [];
  P(wheel, tyreGeo, 0, 0, 0, 1, 1, 1, '#141416');
  P(wheel, rimGeo, 0, 0, 0, 1, 0.92, 0.92, '#cfd4da');
  P(wheel, capGeo, 0, 0, 0, 1, 1, 1, '#1a1c20');
  for (let k = 0; k < 3; k += 1) P(wheel, spokeGeo, 0, 0, 0, 1, 1, 1, '#cfd4da', (k / 3) * Math.PI);
  const driver = [];
  P(driver, new THREE.CapsuleGeometry(0.17, 0.2, 4, 10), 0, 0, 0, 1, 1, 0.7, '#39404c');
  P(driver, new THREE.SphereGeometry(0.11, 14, 10), 0, 0.33, 0.02, 1, 1, 1, '#b98060');
  const out = {
    g,
    paint: mergeParts(paint, false),
    trim: mergeParts(trim, true),
    head: mergeParts(head, false),
    tail: mergeParts(tail, false),
    wheel: mergeParts(wheel, true),
    driver: mergeParts(driver, true),
    roofY,
    roofU,
  };
  modelCache.set(spec.name, out);
  return out;
}

const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.55 });
const trimMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3, clearcoat: 0.5 });
const driverMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });

/** Build the model for a make, facing +z. Returns the parts the simulation animates. */
let bikeParts = null;

/** The Sprint 250: frame, engine, seat, forks and bars merged; tank and fairings in the paint. */
function buildBike(spec, color) {
  if (!bikeParts) {
    const paintP = [];
    const trimP = [];
    const P = (list, geo, c, m) => list.push({ geo, color: c, matrix: m });
    P(paintP, new THREE.SphereGeometry(1, 18, 12), color, mat4(0, 0.86, 0.12, 0.2, 0.15, 0.36));      // tank
    P(paintP, new THREE.SphereGeometry(1, 18, 12), color, mat4(0, 0.86, 0.68, 0.2, 0.2, 0.26, -0.5));  // front fairing
    P(paintP, new THREE.SphereGeometry(1, 16, 10), color, mat4(0, 0.86, -0.62, 0.15, 0.1, 0.32, 0.2)); // tail cowl
    P(trimP, new THREE.CapsuleGeometry(0.11, 0.42, 4, 10), '#1c1d21', mat4(0, 0.9, -0.24, 1, 1, 1, Math.PI / 2)); // seat
    P(trimP, new THREE.BoxGeometry(0.3, 0.32, 0.48), '#3a3d42', mat4(0, 0.5, 0.02));                   // engine
    P(trimP, new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), '#c9ccd1', mat4(0.1, 0.62, 0.74, 1, 1, 1, -0.38));
    P(trimP, new THREE.CylinderGeometry(0.035, 0.035, 0.75, 8), '#c9ccd1', mat4(-0.1, 0.62, 0.74, 1, 1, 1, -0.38));
    P(trimP, new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8), '#1c1d21', mat4(0, 1.02, 0.56, 1, 1, 1, 0, 0, Math.PI / 2)); // bars
    P(trimP, new THREE.CylinderGeometry(0.05, 0.06, 0.7, 10), '#c9ccd1', mat4(0.17, 0.38, -0.45, 1, 1, 1, Math.PI / 2 + 0.2)); // exhaust
    P(trimP, new THREE.BoxGeometry(0.06, 0.08, 0.9), '#2a2c30', mat4(0, 0.4, -0.38, 1, 1, 1, -0.35)); // swing arm
    bikeParts = { trim: mergeParts(trimP, true), paintShapes: paintP };
  }
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 });
  const paintGeo = mergeParts(bikeParts.paintShapes, false);
  const add = (geo, m, parent = body) => { const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; parent.add(mesh); return mesh; };
  add(paintGeo, paint);
  add(bikeParts.trim, trimMat);
  const head = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c4', emissiveIntensity: 0.3 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff2020', emissiveIntensity: 0.4 });
  add(lampGeo, head).position.set(0, 0.92, 0.9);
  add(box, tail).position.set(0, 0.88, -0.93);
  body.children[body.children.length - 1].scale.set(0.16, 0.06, 0.04);
  body.children[body.children.length - 2].scale.set(0.5, 0.5, 0.4);
  const wheels = [];
  for (const [z, front] of [[0.78, true], [-0.72, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.34, z);
    const spin = new THREE.Group();
    spin.scale.set(0.55, 0.9, 0.9);
    add(modelParts(MODELS.brisa).wheel, wheelMat, spin);
    pivot.add(spin);
    body.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  addBeam(body, 1.0, 2.2);
  const driver = new THREE.Group();
  driver.visible = false;
  body.add(driver);
  return { root, body, wheels, paint, head, tail, sirens: null, driver };
}

function buildModel(spec, color) {
  if (spec.body === 'bike') return buildBike(spec, color);
  if (spec.body === 'boat') return buildBoatModel(spec, color);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = modelParts(spec);
  const W = spec.wid;
  const { g } = parts;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 });
  const head = new THREE.MeshStandardMaterial({ color: '#fffbe6', emissive: '#fff3c4', emissiveIntensity: 0.3, roughness: 0.1 });
  const tail = new THREE.MeshStandardMaterial({ color: '#7a0000', emissive: '#ff2020', emissiveIntensity: 0.4, roughness: 0.2 });
  const add = (geo, material, parent = body) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const paintMesh = add(parts.paint, paint);
  paintMesh.receiveShadow = true;
  const glassMesh = add(g.cabin, shared.glass);
  add(parts.trim, trimMat);
  add(parts.head, head);
  add(parts.tail, tail);
  let sirens = null;
  if (spec.police) {
    const red = new THREE.MeshStandardMaterial({ color: '#550000', emissive: '#ff1a1a', emissiveIntensity: 0 });
    const blue = new THREE.MeshStandardMaterial({ color: '#000855', emissive: '#2a5bff', emissiveIntensity: 0 });
    add(barGeo, red).position.set(-W * 0.17, parts.roofY + 0.07, parts.roofU);
    add(barGeo, blue).position.set(W * 0.17, parts.roofY + 0.07, parts.roofU);
    sirens = { red, blue };
  }
  if (spec.taxi) {
    const sign = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe08a', emissiveIntensity: 0.4 });
    const m = add(box, sign);
    m.scale.set(0.62, 0.2, 0.26);
    m.position.set(0, g.top + 0.1, (g.cr1 + g.cf1) / 2);
  }
  const wheels = [];
  const wx = W / 2 - 0.13;
  for (const [x, z, front] of [[wx, g.wz, true], [-wx, g.wz, true], [wx, -g.wz, false], [-wx, -g.wz, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.37, z);
    const spin = new THREE.Group();
    add(parts.wheel, wheelMat, spin);
    pivot.add(spin);
    root.add(pivot);
    wheels.push({ pivot, spin, front });
  }
  addBeam(body, spec.len / 2, spec.wid * 2.6);
  const driver = add(parts.driver, driverMat);
  driver.position.set(W * 0.22, g.b + g.deck + 0.05, (g.cr0 + g.cf0) / 2 + 0.1);
  driver.visible = false;
  return { root, body, wheels, paint, head, tail, sirens, driver, paintMesh, glassMesh };
}

let nextId = 1;

export class Vehicle {
  constructor(scene, modelKey, color, x, z, heading) {
    this.id = nextId++;
    this.key = modelKey;
    this.spec = MODELS[modelKey];
    this.color = color || this.spec.colors[0];
    this.parts = buildModel(this.spec, this.color);
    this.mesh = this.parts.root;
    scene.add(this.mesh);
    this.scene = scene;
    this.pos = { x, z };
    this.y = 0;
    this.heading = heading;
    this.vel = { x: 0, z: 0 };
    this.forward = 0;
    this.lateral = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.health = 100;
    this.dead = false;
    this.burn = 0;
    this.driver = null;       // 'player' | an npc | null
    this.ai = null;           // a controller that fills this.input
    this.siren = false;
    this.horn = 0;
    this.radius = this.spec.wid / 2 + 0.05;
    this.halfLen = this.spec.len / 2;
    this.lastImpact = 0;
    this.skid = 0;
    // garage tuning multiplies the make's numbers; mods remembers what was bought
    this.tune = { power: 1, top: 1, grip: 1, brake: 1 };
    this.mods = defaultMods();
    this.glow = null;
    this.sync();
  }

  /**
   * Fit a set of garage mods: engine (power and top speed), brakes and tyres (grip and stopping),
   * armour plating, underglow, window tint, rim colour and paint. Levels run 0..3.
   */
  applyMods(mods) {
    const m = { ...defaultMods(), ...mods };
    this.mods = m;
    this.tune.power = 1 + m.engine * 0.13;
    this.tune.top = 1 + m.engine * 0.06;
    this.tune.grip = 1 + m.brakes * 0.09;
    this.tune.brake = 1 + m.brakes * 0.18;
    this.armor = Math.max(this.baseArmor || 0, m.armor * 0.16);
    if (m.color) { this.color = m.color; this.parts.paint.color.set(m.color); }
    this.setUnderglow(m.neon);
    const p = this.parts;
    if (p.glassMesh && this.spec.body !== 'boat' && p.glassMesh.material !== crackedGlass) p.glassMesh.material = tintGlass[m.tint] || shared.glass;
    for (const w of p.wheels) {
      w.spin.traverse((o) => {
        if (!o.isMesh) return;
        if (!m.rims) { o.material = wheelMat; return; }
        if (!rimMats.has(m.rims)) {
          const mat = wheelMat.clone();
          mat.color.set(m.rims);
          mat.metalness = 0.8;
          mat.roughness = 0.25;
          rimMats.set(m.rims, mat);
        }
        o.material = rimMats.get(m.rims);
      });
    }
  }

  /** Neon under the chassis (null switches it off). */
  setUnderglow(color) {
    if (this.glow) { this.mesh.remove(this.glow); this.glow = null; }
    if (!color || this.spec.body === 'boat') return;
    const g = new THREE.Mesh(glowGeo, glowMaterial(color));
    g.scale.set(this.spec.wid * 2.1, 1, this.spec.len * 1.45);
    g.position.y = 0.06;
    g.renderOrder = 2;
    this.mesh.add(g);
    this.glow = g;
  }

  /** Back to full health: panels beaten out, glass and headlights replaced, fire out. */
  repair() {
    const p = this.parts;
    this.health = 100;
    this.burn = 0;
    this.headBroken = false;
    if (this.ownBody && p.paintMesh && this.spec.body !== 'boat') {
      p.paintMesh.geometry.dispose();
      p.paintMesh.geometry = modelParts(this.spec).paint;
      this.ownBody = false;
      this.dentTotal = 0;
    }
    if (p.glassMesh && this.spec.body !== 'boat') p.glassMesh.material = tintGlass[this.mods.tint] || shared.glass;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }

  /** The two collision circle centres along the body. */
  circles() {
    const o = this.halfLen - this.radius;
    return [
      { x: this.pos.x + this.fx * o, z: this.pos.z + this.fz * o },
      { x: this.pos.x - this.fx * o, z: this.pos.z - this.fz * o },
    ];
  }

  update(dt, city, events, world) {
    if (this.spec.body === 'boat') { boatPhysics(this, dt, world); return; }
    const s = this.spec;
    const inp = this.dead ? { throttle: 0, steer: 0, handbrake: true } : this.input;
    const fx = this.fx;
    const fz = this.fz;
    const rx = -fz;
    const rz = fx;
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vR = this.vel.x * rx + this.vel.z * rz;
    const healthFactor = this.health < 25 ? 0.65 : 1;
    const tune = this.tune;
    const top = s.top * tune.top;
    const brake = 26 * tune.brake;

    // engine, brakes and reverse
    if (inp.throttle > 0) {
      if (vF < -0.5) vF += brake * inp.throttle * dt;
      else vF += s.power * tune.power * healthFactor * inp.throttle * Math.max(0, 1 - vF / top) * dt;
    } else if (inp.throttle < 0) {
      if (vF > 0.5) vF += brake * inp.throttle * dt;
      else if (vF > -14) vF += s.power * 0.55 * inp.throttle * dt;
    } else {
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), 2.2 * dt);
    }
    vF -= vF * Math.abs(vF) * 0.0011 * dt;
    if (inp.handbrake) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 9 * dt);

    // grip: the handbrake lets the tail slide out
    const grip = inp.handbrake ? 1.4 : s.grip * tune.grip;
    const before = vR;
    vR *= Math.exp(-grip * dt);
    this.skid = Math.abs(before) > 4 || (inp.handbrake && Math.abs(vF) > 8) ? Math.min(1, Math.abs(before) / 10 + 0.3) : 0;

    // steering: tighter at low speed, calmer at high speed
    this.steer = damp(this.steer, inp.steer, 9, dt);
    const speedTurn = clamp(vF / 5, -1, 1) / (1 + Math.abs(vF) / 38);
    let yaw = this.steer * s.turn * speedTurn;
    if (inp.handbrake && Math.abs(vF) > 6) yaw *= 1.55;
    this.yawRate = yaw;
    this.heading = wrapAngle(this.heading + yaw * dt);

    const nfx = Math.sin(this.heading);
    const nfz = Math.cos(this.heading);
    this.vel.x = nfx * vF + -nfz * vR;
    this.vel.z = nfz * vF + nfx * vR;
    this.forward = vF;
    this.lateral = vR;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // buildings and props
    const cs = this.circles();
    let nx = 0; let nz = 0; let touched = false;
    for (const c of cs) {
      const bx = c.x; const bz = c.z;
      const hit = city.pushCircle(c, this.radius, this.y);
      if (hit) {
        touched = true;
        nx += hit.x; nz += hit.z;
      }
      this.pos.x += (c.x - bx) * 0.5;
      this.pos.z += (c.z - bz) * 0.5;
    }
    if (touched) {
      const d = Math.hypot(nx, nz) || 1;
      nx /= d; nz /= d;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= 1.35 * vn * nx;
        this.vel.z -= 1.35 * vn * nz;
        this.vel.x *= 0.82;
        this.vel.z *= 0.82;
        const impact = -vn;
        if (impact > 5) {
          this.damage((impact - 5) * 2.4);
          // dent the panel that hit: the point on the body facing the wall
          this.dentWorld(this.pos.x - nx * this.radius * 2, this.pos.z - nz * this.radius * 2, (impact - 5) * 0.025);
          if (events) events.push({ type: 'crash', vehicle: this, impact });
        }
      }
    }

    // height follows curbs and the pier
    const gy = city.groundHeight(this.pos.x, this.pos.z);
    this.y = damp(this.y, gy, 14, dt);

    if (this.health <= 0 && !this.dead) {
      this.burn += dt;
    }
    this.sync(dt);
  }

  damage(amount) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount * (1 - (this.armor || 0)));
    const p = this.parts;
    // the windscreen cracks once a car has taken a beating
    if (this.health < 55 && p.glassMesh && p.glassMesh.material !== crackedGlass) p.glassMesh.material = crackedGlass;
  }

  /**
   * Push the body panels in around a world point, deforming this car's own copy of its body:
   * crumpled corners and caved-in doors that stay for as long as the car does.
   */
  dentWorld(wx, wz, strength) {
    const p = this.parts;
    if (!p.paintMesh || this.spec.body === 'bike' || strength <= 0.005) return;
    if (!this.ownBody) {
      p.paintMesh.geometry = p.paintMesh.geometry.clone();
      this.ownBody = true;
      this.dentTotal = 0;
    }
    if (this.dentTotal > 1.6) return;
    this.dentTotal += strength;
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const lx = (wx - this.pos.x) * c - (wz - this.pos.z) * s;
    const lz = (wx - this.pos.x) * s + (wz - this.pos.z) * c;
    const pos = p.paintMesh.geometry.attributes.position;
    const depth = Math.min(0.35, strength);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const d = Math.hypot(x - lx, z - lz);
      if (d > 1.2) continue;
      const f = (1 - d / 1.2) ** 2 * depth;
      const inward = Math.hypot(x, z) || 1;
      pos.setXYZ(i, x - (x / inward) * f, y - f * 0.25 * Math.sin(x * 9 + z * 7), z - (z / inward) * f);
    }
    pos.needsUpdate = true;
    p.paintMesh.geometry.computeVertexNormals();
    // a hard knock on the nose breaks the headlights
    if (lz > this.halfLen * 0.6 && strength > 0.12) this.headBroken = true;
  }

  /** Called by the world when a burning wreck goes up. */
  explode() {
    this.dead = true;
    this.health = 0;
    this.setUnderglow(null);
    this.mesh.traverse((o) => {
      if (o.isMesh) o.material = shared.charred;
    });
    this.parts.driver.visible = false;
  }

  sync(dt = 0) {
    const p = this.parts;
    if (this.spec.body === 'boat') {
      this.mesh.position.set(this.pos.x, this.y, this.pos.z);
      this.mesh.rotation.y = this.heading;
      return;
    }
    this.mesh.position.set(this.pos.x, this.y, this.pos.z);
    this.mesh.rotation.y = this.heading;
    // body roll and pitch sell the weight
    if (this.spec.body === 'bike') {
      // a bike leans into the turn instead of rolling out of it
      this.lean = damp(this.lean || 0, clamp(-this.yawRate * this.forward * 0.05, -0.65, 0.65), 6, dt || 1);
      p.body.rotation.z = this.lean;
    } else p.body.rotation.z = damp(p.body.rotation.z, clamp(-this.lateral * 0.02 - this.yawRate * this.forward * 0.004, -0.09, 0.09), 8, dt || 1);
    p.body.rotation.x = damp(p.body.rotation.x, clamp(-this.input.throttle * 0.02, -0.03, 0.03), 6, dt || 1);
    for (const w of p.wheels) {
      w.spin.rotation.x += (this.forward * (dt || 0)) / 0.36;
      if (w.front) w.pivot.rotation.y = this.steer * 0.5;
    }
    p.driver.visible = !this.dead && this.driver !== null && this.driver !== 'player';
  }

  /** Night headlights, brake lights and the police light bar. */
  lights(time, night) {
    const p = this.parts;
    if (this.dead) return;
    p.head.emissiveIntensity = this.headBroken ? 0 : 0.3 + night * 2.5;
    const braking = this.input.throttle < 0 && this.forward > 0.5;
    p.tail.emissiveIntensity = braking ? 2.5 : 0.4 + night * 0.8;
    if (p.sirens) {
      const on = this.siren;
      const phase = Math.floor(time * 6) % 2;
      p.sirens.red.emissiveIntensity = on && phase === 0 ? 4 : 0;
      p.sirens.blue.emissiveIntensity = on && phase === 1 ? 4 : 0;
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      const keep = Object.values(shared).includes(o.material) || [wheelMat, trimMat, driverMat, crackedGlass, headlightGlow, ...tintGlass].includes(o.material)
        || [...glowMats.values(), ...rimMats.values()].includes(o.material);
      if (o.isMesh && o.material && !keep) o.material.dispose();
      if (o.isMesh && this.ownBody && o === this.parts.paintMesh) o.geometry.dispose();
    });
  }
}

/**
 * Push overlapping cars apart and trade momentum along the contact, so crashes shove and spin.
 * Returns the impacts for sound and damage handling.
 */
export function collideVehicles(list, events) {
  for (let a = 0; a < list.length; a += 1) {
    const A = list[a];
    for (let b = a + 1; b < list.length; b += 1) {
      const B = list[b];
      const dx0 = B.pos.x - A.pos.x;
      const dz0 = B.pos.z - A.pos.z;
      const reach = A.halfLen + B.halfLen;
      if (dx0 * dx0 + dz0 * dz0 > reach * reach) continue;
      const ca = A.circles();
      const cb = B.circles();
      for (const p of ca) {
        for (const q of cb) {
          let dx = q.x - p.x;
          let dz = q.z - p.z;
          const r = A.radius + B.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          const d = Math.sqrt(d2) || 0.01;
          dx /= d; dz /= d;
          const overlap = r - d;
          const ma = A.spec.mass * (A.driver === null && !A.ai ? 2.2 : 1);
          const mb = B.spec.mass * (B.driver === null && !B.ai ? 2.2 : 1);
          const ta = mb / (ma + mb);
          A.pos.x -= dx * overlap * ta; A.pos.z -= dz * overlap * ta;
          B.pos.x += dx * overlap * (1 - ta); B.pos.z += dz * overlap * (1 - ta);
          const rel = (B.vel.x - A.vel.x) * dx + (B.vel.z - A.vel.z) * dz;
          if (rel < 0) {
            const j = (-(1.25) * rel) / (1 / ma + 1 / mb);
            A.vel.x -= (j / ma) * dx; A.vel.z -= (j / ma) * dz;
            B.vel.x += (j / mb) * dx; B.vel.z += (j / mb) * dz;
            // a glancing blow twists both cars a little
            A.heading += (Math.random() - 0.5) * Math.min(0.25, -rel * 0.012);
            B.heading += (Math.random() - 0.5) * Math.min(0.25, -rel * 0.012);
            const impact = -rel;
            if (impact > 4) {
              const cx = (p.x + q.x) / 2;
              const cz = (p.z + q.z) / 2;
              A.dentWorld(cx, cz, (impact - 4) * 0.02);
              B.dentWorld(cx, cz, (impact - 4) * 0.02);
              A.damage((impact - 4) * 1.6);
              B.damage((impact - 4) * 1.6);
              events.push({ type: 'carhit', a: A, b: B, impact, x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
            }
          }
        }
      }
    }
  }
}
