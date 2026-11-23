// MeshBuilder merges many boxes, quads, discs and shelves into one BufferGeometry with
// per-vertex colour and world-scaled UVs, so a whole city of buildings, curbs and road paint,
// or a whole furnished room, draws in a few calls.
import * as THREE from '../vendor/three.module.min.js';

const FACES = [
  // normal, the two in-plane axes (u, v) and which corner signs make the quad
  { n: [1, 0, 0], key: 'px' },
  { n: [-1, 0, 0], key: 'nx' },
  { n: [0, 1, 0], key: 'py' },
  { n: [0, -1, 0], key: 'ny' },
  { n: [0, 0, 1], key: 'pz' },
  { n: [0, 0, -1], key: 'nz' },
];

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  /** Add one quad from four corners (counter-clockwise seen from the front). */
  quad(a, b, c, d, normal, color, uvs) {
    const base = this.vertexCount;
    for (const p of [a, b, c, d]) this.pos.push(p[0], p[1], p[2]);
    for (let i = 0; i < 4; i += 1) {
      this.nor.push(normal[0], normal[1], normal[2]);
      this.col.push(color.r, color.g, color.b);
    }
    const u = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const t of u) this.uv.push(t[0], t[1]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * Add an axis-aligned box. opts.faces lists which faces to emit (default all but the bottom);
   * opts.tile = [metres per u repeat, metres per v repeat] scales UVs to the world, so window grids
   * line up whatever the size of the building.
   */
  box(x0, y0, z0, x1, y1, z1, color, opts = {}) {
    const faces = opts.faces || ['px', 'nx', 'py', 'pz', 'nz'];
    const [tu, tv] = opts.tile || [1, 1];
    const sx = x1 - x0;
    const sy = y1 - y0;
    const sz = z1 - z0;
    const ou = opts.uOffset || 0;
    for (const f of FACES) {
      if (!faces.includes(f.key)) continue;
      let a; let b; let c; let d; let w; let h;
      switch (f.key) {
        case 'px': a = [x1, y0, z1]; b = [x1, y0, z0]; c = [x1, y1, z0]; d = [x1, y1, z1]; w = sz; h = sy; break;
        case 'nx': a = [x0, y0, z0]; b = [x0, y0, z1]; c = [x0, y1, z1]; d = [x0, y1, z0]; w = sz; h = sy; break;
        case 'pz': a = [x0, y0, z1]; b = [x1, y0, z1]; c = [x1, y1, z1]; d = [x0, y1, z1]; w = sx; h = sy; break;
        case 'nz': a = [x1, y0, z0]; b = [x0, y0, z0]; c = [x0, y1, z0]; d = [x1, y1, z0]; w = sx; h = sy; break;
        case 'py': a = [x0, y1, z1]; b = [x1, y1, z1]; c = [x1, y1, z0]; d = [x0, y1, z0]; w = sx; h = sz; break;
        default: a = [x0, y0, z0]; b = [x1, y0, z0]; c = [x1, y0, z1]; d = [x0, y0, z1]; w = sx; h = sz; break;
      }
      let uvs;
      if (f.key === 'py' || f.key === 'ny') {
        uvs = [[x0 / tu, -z1 / tv], [x1 / tu, -z1 / tv], [x1 / tu, -z0 / tv], [x0 / tu, -z0 / tv]];
      } else {
        const u1 = ou + w / tu;
        const v0 = y0 / tv;
        const v1 = y0 / tv + h / tv;
        uvs = [[ou, v0], [u1, v0], [u1, v1], [ou, v1]];
      }
      const shade = opts.shade ? opts.shade[f.key] ?? 1 : 1;
      const c2 = shade === 1 ? color : { r: color.r * shade, g: color.g * shade, b: color.b * shade };
      this.quad(a, b, c, d, f.n, c2, uvs);
    }
  }

  /** A flat horizontal rectangle at height y (for road paint, lots and plazas). */
  flat(x0, z0, x1, z1, y, color, tile) {
    const [tu, tv] = tile || [1, 1];
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color,
      [[x0 / tu, -z1 / tv], [x1 / tu, -z1 / tv], [x1 / tu, -z0 / tv], [x0 / tu, -z0 / tv]]);
  }

  /**
   * Open shelving: four uprights and evenly spaced boards between y0 and y1 (shop racks, the
   * laundry's folding shelves, the gun wall). Boards take boardColor, the frame takes color.
   */
  shelf(x0, y0, z0, x1, y1, z1, levels, color, boardColor = color) {
    const t = 0.05;
    for (const x of [x0, x1 - t]) for (const z of [z0, z1 - t]) this.box(x, y0, z, x + t, y1, z + t, color);
    for (let k = 0; k < levels; k += 1) {
      const y = y0 + 0.08 + ((y1 - y0 - 0.12) * k) / Math.max(1, levels - 1);
      this.box(x0, y, z0, x1, y + 0.035, z1, boardColor, { faces: ['px', 'nx', 'py', 'pz', 'nz', 'ny'] });
    }
  }

  /**
   * A flat round disc (washer doors, clock faces, range targets painted on a wall) centred at
   * (cx, cy, cz) and facing along +axis ('x', 'y' or 'z'; a leading '-' flips it).
   */
  disc(cx, cy, cz, r, axis, color, seg = 20) {
    const flip = axis.startsWith('-') ? -1 : 1;
    const a = axis.replace('-', '');
    const normal = a === 'x' ? [flip, 0, 0] : a === 'y' ? [0, flip, 0] : [0, 0, flip];
    const point = (ang) => {
      const u = Math.cos(ang) * r;
      const v = Math.sin(ang) * r;
      if (a === 'x') return [cx, cy + v, cz - u * flip];
      if (a === 'y') return [cx + u, cy, cz - v * flip];
      return [cx + u * flip, cy + v, cz];
    };
    const centre = this.vertexCount;
    this.pos.push(cx, cy, cz); this.nor.push(...normal); this.col.push(color.r, color.g, color.b); this.uv.push(0.5, 0.5);
    for (let i = 0; i <= seg; i += 1) {
      const ang = (i / seg) * Math.PI * 2;
      this.pos.push(...point(ang));
      this.nor.push(...normal);
      this.col.push(color.r, color.g, color.b);
      this.uv.push(0.5 + Math.cos(ang) * 0.5, 0.5 + Math.sin(ang) * 0.5);
    }
    for (let i = 0; i < seg; i += 1) this.idx.push(centre, centre + 1 + i, centre + 2 + i);
  }

  /**
   * A smooth upright cylinder (round towers, water tanks), with a flat top cap. UVs wrap the
   * circumference in metres / tile so facade windows keep their size.
   */
  cylinder(cx, cz, r, y0, y1, color, opts = {}) {
    const seg = opts.segments || 24;
    const [tu, tv] = opts.tile || [1, 1];
    const shade = opts.shade || 1;
    const c = { r: color.r * shade, g: color.g * shade, b: color.b * shade };
    const arc = (2 * Math.PI * r) / seg;
    for (let i = 0; i < seg; i += 1) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p = (a, y) => [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
      const n = (a) => [Math.sin(a), 0, Math.cos(a)];
      const base = this.vertexCount;
      const verts = [p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1)];
      const norms = [n(a0), n(a1), n(a1), n(a0)];
      const u0 = (i * arc) / tu;
      const u1 = ((i + 1) * arc) / tu;
      const uvs = [[u0, y0 / tv], [u1, y0 / tv], [u1, y1 / tv], [u0, y1 / tv]];
      for (let k = 0; k < 4; k += 1) {
        this.pos.push(...verts[k]);
        this.nor.push(...norms[k]);
        this.col.push(c.r, c.g, c.b);
        this.uv.push(...uvs[k]);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (opts.cap !== false) {
      const capColor = opts.capColor || color;
      const centre = this.vertexCount;
      this.pos.push(cx, y1, cz); this.nor.push(0, 1, 0); this.col.push(capColor.r, capColor.g, capColor.b); this.uv.push(0, 0);
      for (let i = 0; i <= seg; i += 1) {
        const a = (i / seg) * Math.PI * 2;
        this.pos.push(cx + Math.sin(a) * r, y1, cz + Math.cos(a) * r);
        this.nor.push(0, 1, 0);
        this.col.push(capColor.r, capColor.g, capColor.b);
        this.uv.push(0, 0);
      }
      for (let i = 0; i < seg; i += 1) this.idx.push(centre, centre + 1 + i, centre + 2 + i);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Merge (geometry, matrix[, colour]) parts into one non-indexed BufferGeometry. With colours,
 * a vertex colour attribute is written too, so differently coloured parts share one material.
 */
export function mergeParts(parts, withColor = true) {
  const pos = [];
  const nor = [];
  const colr = [];
  const uvs = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  const c = new THREE.Color();
  for (const { geo, color, matrix } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position;
    const Nn = g.attributes.normal;
    nm.getNormalMatrix(matrix);
    c.set(color || '#ffffff');
    const U = g.attributes.uv;
    for (let i = 0; i < P.count; i += 1) {
      v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      n.fromBufferAttribute(Nn, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z);
      nor.push(n.x, n.y, n.z);
      if (withColor) colr.push(c.r, c.g, c.b);
      if (U) uvs.push(U.getX(i), U.getY(i)); else uvs.push(0, 0);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (withColor) out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  out.computeBoundingSphere();
  return out;
}

/** A transform matrix from position, scale and Euler rotation. */
export const mat4 = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
  new THREE.Vector3(sx, sy, sz),
);

/** Shorthand for a THREE.Color from a hex string or number. */
export const col = (hex) => new THREE.Color(hex);
