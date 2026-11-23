// MeshBuilder merges many boxes and quads into one BufferGeometry with per-vertex colour and
// world-scaled UVs, so a whole city of buildings, curbs and road paint draws in a few calls.
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

/** Shorthand for a THREE.Color from a hex string or number. */
export const col = (hex) => new THREE.Color(hex);
