// Vegetation: palms and broadleaf shade trees built from textured, alpha-cut foliage instead of
// solid shapes. Leaves, palm fronds and bark are painted on canvases (with bark normal maps);
// a tree's crown is dozens of leaf cards whose normals point out of the crown so it shades like
// a soft volume; palms have curved, ringed trunks and drooping pinnate fronds. Every species
// comes in a few variants, drawn instanced, and casts leaf-shaped shadows.
import * as THREE from '../vendor/three.module.min.js';
import { mergeParts, mat4 } from './geometry.js';
import { makeRng } from './rng.js';
import { normalFromHeight } from './textures.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat = false, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ textures

/** A cluster of overlapping leaves on transparency, darker toward the inside of the cluster. */
function leafTexture(seed) {
  const rng = makeRng(seed);
  const S = 512;
  const [c, g] = canvas(S, S);
  for (let i = 0; i < 320; i += 1) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 215;
    const x = 256 + Math.cos(a) * r;
    const y = 256 + Math.sin(a) * r * 0.9;
    const depth = 1 - r / 215;
    const hue = 85 + rng.range(-14, 18);
    const light = 22 + rng.range(0, 18) + (1 - depth) * 10;
    g.save();
    g.translate(x, y);
    g.rotate(a + rng.range(-0.9, 0.9));
    const len = rng.range(16, 26);
    const wid = rng.range(6, 10);
    g.fillStyle = `hsl(${hue}, ${rng.range(38, 58)}%, ${light}%)`;
    g.beginPath();
    g.moveTo(-len, 0);
    g.quadraticCurveTo(0, -wid, len, 0);
    g.quadraticCurveTo(0, wid, -len, 0);
    g.fill();
    g.strokeStyle = `hsla(${hue - 10}, 40%, ${light + 14}%, 0.6)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-len * 0.9, 0);
    g.lineTo(len * 0.9, 0);
    g.stroke();
    g.restore();
  }
  return tex(c);
}

/** A palm frond seen flat: a woody spine with tapering leaflets swept toward the tip. */
function frondTexture() {
  const rng = makeRng(77);
  const [c, g] = canvas(256, 1024);
  for (let y = 24; y < 1010; y += 7) {
    const t = y / 1024;
    const len = 118 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 12;
    for (const side of [-1, 1]) {
      const sweep = 26 + t * 30;
      const hue = 90 + rng.range(-10, 10) - t * 18;
      g.fillStyle = `hsl(${hue}, ${rng.range(40, 60)}%, ${rng.range(24, 36) + t * 8}%)`;
      g.beginPath();
      g.moveTo(128, y);
      g.lineTo(128 + side * len, y + sweep);
      g.lineTo(128 + side * len * 0.92, y + sweep + 3);
      g.lineTo(128, y + 5);
      g.fill();
    }
  }
  g.strokeStyle = '#7d6a3a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 1024);
  g.stroke();
  return tex(c);
}

/** Bark colour and normal maps: ringed leaf scars for palms, vertical furrows for trees. */
function barkTextures(kind) {
  const rng = makeRng(kind === 'palm' ? 5 : 9);
  const [c, g] = canvas(256, 256);
  const [h, hg] = canvas(256, 256);
  if (kind === 'palm') {
    g.fillStyle = '#8a7356';
    g.fillRect(0, 0, 256, 256);
    hg.fillStyle = '#808080';
    hg.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      const off = (y / 16) % 2 ? 16 : 0;
      for (let x = -32; x < 288; x += 32) {
        g.fillStyle = rng.pick(['#6f5a40', '#9a8262', '#7d6849']);
        g.beginPath();
        g.moveTo(x + off, y); g.lineTo(x + off + 16, y + 8); g.lineTo(x + off, y + 16); g.lineTo(x + off - 16, y + 8);
        g.fill();
        hg.fillStyle = '#b0b0b0';
        hg.beginPath();
        hg.moveTo(x + off, y + 2); hg.lineTo(x + off + 13, y + 8); hg.lineTo(x + off, y + 14); hg.lineTo(x + off - 13, y + 8);
        hg.fill();
      }
      g.fillStyle = 'rgba(40,30,20,0.5)';
      g.fillRect(0, y, 256, 2);
      hg.fillStyle = '#303030';
      hg.fillRect(0, y, 256, 2);
    }
  } else {
    g.fillStyle = '#5d4a3a';
    g.fillRect(0, 0, 256, 256);
    hg.fillStyle = '#909090';
    hg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i += 1) {
      const x = rng.next() * 256;
      const w = rng.range(2, 6);
      g.fillStyle = rng.pick(['#4a3a2d', '#6e5a47', '#3f3127']);
      g.fillRect(x, 0, w, 256);
      hg.fillStyle = '#404040';
      hg.fillRect(x, 0, w * 0.6, 256);
    }
    for (let i = 0; i < 400; i += 1) {
      g.fillStyle = 'rgba(120,110,90,0.25)';
      g.fillRect(rng.next() * 256, rng.next() * 256, 3, rng.range(4, 14));
    }
  }
  const map = tex(c, true);
  const normal = normalFromHeight(h, 3);
  return { map, normal };
}

// ------------------------------------------------------------------ geometry

/** A tube that follows a path and tapers from r0 to r1, with bark UVs (v along the length). */
function trunkGeometry(path, r0, r1, radial = 9, vScale = 1.2) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  let along = 0;
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i];
    const q = path[Math.min(path.length - 1, i + 1)];
    const o = path[Math.max(0, i - 1)];
    const t = new THREE.Vector3().subVectors(q, o).normalize();
    const ref = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const a = new THREE.Vector3().crossVectors(t, ref).normalize();
    const b = new THREE.Vector3().crossVectors(t, a).normalize();
    if (i > 0) along += p.distanceTo(path[i - 1]);
    const r = r0 + (r1 - r0) * (i / (path.length - 1));
    for (let k = 0; k <= radial; k += 1) {
      const ang = (k / radial) * Math.PI * 2;
      const n = new THREE.Vector3().addScaledVector(a, Math.cos(ang)).addScaledVector(b, Math.sin(ang));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push((k / radial) * 2, along / vScale);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < path.length - 1; i += 1) {
    for (let k = 0; k < radial; k += 1) {
      const A = i * row + k;
      idx.push(A, A + row, A + 1, A + 1, A + row, A + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Points along a gently curving stem from base to top. */
function stem(base, top, bend, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    out.push(new THREE.Vector3(
      base.x + (top.x - base.x) * t + bend.x * Math.sin(Math.PI * t),
      base.y + (top.y - base.y) * t,
      base.z + (top.z - base.z) * t + bend.z * Math.sin(Math.PI * t),
    ));
  }
  return out;
}

/** A broadleaf tree: trunk with a few limbs, and a crown of leaf cards shaded like a volume. */
function broadleafVariant(seed) {
  const rng = makeRng(seed);
  const top = new THREE.Vector3(rng.range(-0.3, 0.3), 3.3, rng.range(-0.3, 0.3));
  const parts = [{ geo: trunkGeometry(stem(new THREE.Vector3(0, 0, 0), top, new THREE.Vector3(rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2))), 0.24, 0.12), matrix: new THREE.Matrix4() }];
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + rng.next();
    const from = new THREE.Vector3(top.x * 0.8, rng.range(2.3, 3.1), top.z * 0.8);
    const to = new THREE.Vector3(from.x + Math.cos(a) * 1.6, from.y + rng.range(1.0, 1.7), from.z + Math.sin(a) * 1.6);
    parts.push({ geo: trunkGeometry(stem(from, to, new THREE.Vector3(0, 0, 0), 4), 0.09, 0.035, 6), matrix: new THREE.Matrix4() });
  }
  const trunk = mergeParts(parts, false);

  const centre = new THREE.Vector3(top.x, 4.9, top.z);
  const rad = new THREE.Vector3(2.5, 1.9, 2.5);
  const cards = [];
  const plane = new THREE.PlaneGeometry(1, 1);
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < 46; k += 1) {
    const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.45, 1), rng.range(-1, 1)).normalize();
    const p = centre.clone().add(dir.clone().multiply(rad).multiplyScalar(rng.range(0.35, 0.95)));
    const face = dir.clone().lerp(new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)), 0.45).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(zAxis, face);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(zAxis, rng.next() * Math.PI * 2));
    const s = rng.range(1.7, 2.6);
    cards.push({ geo: plane, matrix: new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)) });
  }
  const crown = mergeParts(cards, false);
  // normals point out of the crown so light wraps it like a soft ball of leaves
  const P = crown.attributes.position;
  const N = crown.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i += 1) {
    v.fromBufferAttribute(P, i).sub(centre).divide(rad).normalize();
    N.setXYZ(i, v.x, v.y, v.z);
  }
  return { trunk, crown };
}

/** A palm: curved ringed trunk, a skirt of drooping fronds, a few upright young ones, coconuts. */
function palmVariant(seed, height) {
  const rng = makeRng(seed);
  const lean = new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize().multiplyScalar(height * 0.08);
  const top = new THREE.Vector3(lean.x * 1.6, height, lean.z * 1.6);
  const trunk = [{ geo: trunkGeometry(stem(new THREE.Vector3(0, 0, 0), top, lean, 12), 0.3, 0.18, 10, 1.0), matrix: new THREE.Matrix4() }];
  const nut = new THREE.SphereGeometry(0.13, 10, 8);
  for (let k = 0; k < 5; k += 1) {
    const a = (k / 5) * Math.PI * 2;
    trunk.push({ geo: nut, matrix: mat4(top.x + Math.cos(a) * 0.22, top.y - 0.25, top.z + Math.sin(a) * 0.22) });
  }
  const fronds = [];
  const frond = (a, len, rise, droop, width) => {
    const pos = [];
    const uv = [];
    const nor = [];
    const idx = [];
    const seg = 10;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const sx = -dz;
    const sz = dx;
    for (let i = 0; i <= seg; i += 1) {
      const t = i / seg;
      const s = t * len;
      const h = s * rise - s * s * droop;
      const w = width * (Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.9 + 0.1);
      const fold = w * 0.35;
      const cx = top.x + dx * s;
      const cz = top.z + dz * s;
      const cy = top.y + h;
      pos.push(cx - sx * w, cy - fold, cz - sz * w, cx + sx * w, cy - fold, cz + sz * w);
      uv.push(0, 1 - t, 1, 1 - t);
      nor.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < seg; i += 1) {
      const A = i * 2;
      idx.push(A, A + 2, A + 1, A + 1, A + 2, A + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    fronds.push({ geo: g, matrix: new THREE.Matrix4() });
  };
  for (let k = 0; k < 13; k += 1) frond((k / 13) * Math.PI * 2 + rng.next() * 0.3, rng.range(3.6, 4.6), rng.range(0.5, 0.8), rng.range(0.24, 0.32), 0.75);
  for (let k = 0; k < 4; k += 1) frond(rng.next() * Math.PI * 2, rng.range(2.0, 2.6), 1.4, 0.2, 0.45);
  return { trunk: mergeParts(trunk, false), fronds: mergeParts(fronds, false) };
}

// ------------------------------------------------------------------ instancing

function foliageMaterial(map, tint) {
  const m = new THREE.MeshStandardMaterial({ map, color: tint, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, envMapIntensity: 0.35 });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 });
  return { m, depth };
}

/**
 * Plant every palm ({ x, y, z, h }) and broadleaf tree ({ x, y, z, s }) under parent, instanced
 * per variant, with alpha-cut leaf shadows.
 */
export function buildVegetation(parent, palms, trees) {
  const rng = makeRng(2024);
  const palmBark = barkTextures('palm');
  const treeBark = barkTextures('tree');
  const palmBarkMat = new THREE.MeshStandardMaterial({ map: palmBark.map, normalMap: palmBark.normal, roughness: 0.95, envMapIntensity: 0.3 });
  const treeBarkMat = new THREE.MeshStandardMaterial({ map: treeBark.map, normalMap: treeBark.normal, roughness: 0.95, envMapIntensity: 0.3 });
  const frond = foliageMaterial(frondTexture(), '#ffffff');
  const leaves = [leafTexture(11), leafTexture(23)].map((t) => foliageMaterial(t, '#ffffff'));

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const plant = (geo, material, depth, list, tints) => {
    if (!list.length) return;
    const inst = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((p, i) => {
      e.set(0, p.rot, 0);
      q.setFromEuler(e);
      m.compose(v.set(p.x, p.y, p.z), q, sc.set(p.scale, p.scale, p.scale));
      inst.setMatrixAt(i, m);
      if (tints) inst.setColorAt(i, tints[i]);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    if (depth) inst.customDepthMaterial = depth;
    parent.add(inst);
  };

  // palms: three heights, each instanced
  const heights = [8, 10, 12];
  heights.forEach((h, k) => {
    const variant = palmVariant(100 + k, h);
    const list = palms.filter((p) => heights.reduce((best, x) => (Math.abs(x - p.h) < Math.abs(best - p.h) ? x : best)) === h)
      .map((p) => ({ x: p.x, y: p.y, z: p.z, rot: rng.next() * Math.PI * 2, scale: rng.range(0.92, 1.08) }));
    const tints = list.map(() => new THREE.Color().setHSL(0.24 + rng.range(-0.03, 0.03), 0.25, rng.range(0.82, 1)));
    plant(variant.trunk, palmBarkMat, null, list);
    plant(variant.fronds, frond.m, frond.depth, list, tints);
  });

  // broadleaf trees: four variants across two leaf textures, tinted per tree
  for (let k = 0; k < 4; k += 1) {
    const variant = broadleafVariant(300 + k);
    const list = trees.filter((_, i) => i % 4 === k).map((t) => ({ x: t.x, y: t.y, z: t.z, rot: rng.next() * Math.PI * 2, scale: t.s }));
    const tints = list.map(() => new THREE.Color().setHSL(0.27 + rng.range(-0.04, 0.05), 0.35, rng.range(0.75, 1)));
    const leaf = leaves[k % 2];
    plant(variant.trunk, treeBarkMat, null, list);
    plant(variant.crown, leaf.m, leaf.depth, list, tints);
  }
}
