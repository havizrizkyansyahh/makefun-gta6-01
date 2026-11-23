// Solmara Bay itself: a 9 x 9 block grid city on a sunny bay, generated from a seed. It builds
// the meshes (towers, hotels, homes, warehouses, parks, beach, pier, palms, lamps, signs), the
// collision boxes and their spatial grid, the road graph traffic drives on, the sidewalk loops
// pedestrians walk, the named districts and places the story uses, and the minimap picture.
import * as THREE from '../vendor/three.module.min.js';
import { CITY } from './config.js';
import { MeshBuilder, col } from './geometry.js';
import { makeRng, clamp } from './rng.js';
import {
  facadeTextures, sidewalkTexture, asphaltTexture, grassTexture, sandTexture, sidewalkNormal, asphaltNormal,
} from './textures.js';

const N = CITY.blocks;
const P = CITY.pitch;
const RH = CITY.roadHalf;
const CELL = 32;

/** Road centre line i (0..N) as a world coordinate. */
export const roadLine = (i) => (i - N / 2) * P;
/** Edges of block b's raised area (sidewalk outer edge). */
const blockMin = (b) => roadLine(b) + RH;
const blockMax = (b) => roadLine(b + 1) - RH;
export const blockCentre = (b) => (roadLine(b) + roadLine(b + 1)) / 2;

export const COAST_Z = roadLine(N) + RH + CITY.shore; // where sand meets the sea
export const PIER = { x: blockCentre(5), half: 4.5, z0: COAST_Z - 6, z1: COAST_Z + 70, y: 0.55 };

export const DISTRICTS = {
  palmline: { name: 'Palmline Beach', color: '#ffb36b' },
  harbor: { name: 'Harbor Flats', color: '#7fb0c8' },
  corvel: { name: 'Corvel Heights', color: '#9ad0ff' },
  marisco: { name: 'Little Marisco', color: '#ff8fa3' },
  verde: { name: 'Verde Hills', color: '#a8d672' },
  midtown: { name: 'Midtown', color: '#ffe08a' },
};

export function districtOf(bx, bz) {
  if (bz >= 8) return 'palmline';
  if (bx <= 1) return 'harbor';
  if (bx >= 3 && bx <= 5 && bz >= 2 && bz <= 5) return 'corvel';
  if (bx >= 7) return 'marisco';
  if (bz <= 1) return 'verde';
  return 'midtown';
}

const SPECIAL = {
  '2,6': 'park', '6,2': 'park', '4,4': 'plaza',
  '6,7': 'parking', '3,1': 'parking', '8,5': 'parking', '1,3': 'parking',
  '5,1': 'landmark', '3,6': 'landmark',
};

const PASTELS = ['#f7a8a0', '#a8e0d0', '#f9df8f', '#a9cdf2', '#d4b8f0', '#ffc9a3', '#f4f0e6', '#b9e8b0', '#ffb7c9'];
const TOWER_TINTS = ['#e8f1f8', '#d6ecef', '#f3eee4', '#dfe6f5', '#e9f6f0'];
const SHED_TINTS = ['#d8d2c4', '#c6d3d8', '#e0cfb8', '#c9c9c9'];

export class City {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = makeRng(seed);
    this.colliders = [];
    this.grid = new Map();
    this.nodes = [];
    this.loops = [];
    this.parking = [];
    this.palms = [];
    this.lamps = [];
    this.places = {};
    this.signs = [];
    this.nightMaterials = [];
    this.group = new THREE.Group();
    scene.add(this.group);

    this.buildRoadGraph();
    this.buildPlaces();
    this.buildGround();
    this.buildBlocks();
    this.buildBeach();
    this.buildProps();
    this.buildHills();
    this.buildMinimap();
  }

  // ---------------------------------------------------------------- road graph
  buildRoadGraph() {
    for (let j = 0; j <= N; j += 1) {
      for (let i = 0; i <= N; i += 1) {
        this.nodes.push({ i, j, x: roadLine(i), z: roadLine(j), links: [] });
      }
    }
    const id = (i, j) => j * (N + 1) + i;
    for (const n of this.nodes) {
      if (n.i > 0) n.links.push(id(n.i - 1, n.j));
      if (n.i < N) n.links.push(id(n.i + 1, n.j));
      if (n.j > 0) n.links.push(id(n.i, n.j - 1));
      if (n.j < N) n.links.push(id(n.i, n.j + 1));
    }
    this.nodeId = id;
  }

  nearestNode(x, z) {
    const i = clamp(Math.round(x / P + N / 2), 0, N);
    const j = clamp(Math.round(z / P + N / 2), 0, N);
    return this.nodeId(i, j);
  }

  /** A random point on a road segment: { a, b, t } with a, b node ids. */
  randomSegment(rng) {
    const a = rng.int(0, this.nodes.length - 1);
    const b = rng.pick(this.nodes[a].links);
    return { a, b, t: rng.range(0.25, 0.75) };
  }

  /** Is (x, z) on asphalt (a road or an intersection)? */
  onRoad(x, z) {
    const fx = x / P + N / 2;
    const fz = z / P + N / 2;
    const nearX = Math.abs(fx - Math.round(fx)) * P < RH && Math.round(fx) >= 0 && Math.round(fx) <= N;
    const nearZ = Math.abs(fz - Math.round(fz)) * P < RH && Math.round(fz) >= 0 && Math.round(fz) <= N;
    const inside = Math.abs(x) <= roadLine(N) + RH && Math.abs(z) <= roadLine(N) + RH;
    return inside && (nearX || nearZ);
  }

  blockAt(x, z) {
    const bx = Math.floor(x / P + N / 2);
    const bz = Math.floor(z / P + N / 2);
    if (bx < 0 || bz < 0 || bx >= N || bz >= N) return null;
    return { bx, bz };
  }

  districtAt(x, z) {
    if (z > roadLine(N) + RH) return 'palmline';
    const bx = clamp(Math.floor(x / P + N / 2), 0, N - 1);
    const bz = clamp(Math.floor(z / P + N / 2), 0, N - 1);
    return districtOf(bx, bz);
  }

  /** Height of the walkable surface: curbs, the pier and the slope of the beach. */
  groundHeight(x, z) {
    if (Math.abs(x - PIER.x) < PIER.half && z > PIER.z0 && z < PIER.z1) return PIER.y;
    const b = this.blockAt(x, z);
    if (b && x > blockMin(b.bx) && x < blockMax(b.bx) && z > blockMin(b.bz) && z < blockMax(b.bz)) return CITY.curb;
    return 0;
  }

  // ---------------------------------------------------------------- places
  buildPlaces() {
    const front = (bx, bz, side = 's', along = 0) => {
      const cx = blockCentre(bx) + along;
      const cz = blockCentre(bz) + along;
      if (side === 's') return { x: cx, z: blockMax(bz) - 2.2, face: 0 };
      if (side === 'n') return { x: cx, z: blockMin(bz) + 2.2, face: Math.PI };
      if (side === 'e') return { x: blockMax(bx) - 2.2, z: cz, face: Math.PI / 2 };
      return { x: blockMin(bx) + 2.2, z: cz, face: -Math.PI / 2 };
    };
    this.places = {
      nadia: { ...front(3, 8, 's'), z: roadLine(N) + RH + 9, label: 'Sol y Sal food truck', blip: 'N', color: '#ffb000' },
      pearl: { ...front(2, 4, 's'), label: "Pearl's Spin City Laundry", blip: 'P', color: '#ff5fa2' },
      safehouse: { ...front(5, 7, 's'), label: 'Kai\'s apartment (save)', blip: 'H', color: '#52d273' },
      gunshop: { ...front(6, 5, 's'), label: 'Coastline Arms', blip: 'G', color: '#ff7043' },
      courier: { ...front(2, 7, 'e'), label: 'Bayline Couriers', blip: 'C', color: '#4fc3f7' },
      hospital: { ...front(5, 1, 's'), label: 'St. Amara Medical', blip: '+', color: '#ef5350' },
      precinct: { ...front(3, 6, 's'), label: 'Solmara Bay PD', blip: 'B', color: '#5c8dff' },
      harborYard: { x: blockCentre(0), z: blockCentre(6), label: 'Container yard' },
      chopShop: { x: blockCentre(7), z: blockCentre(3), label: 'Glass Saints chop shop' },
      tower: { x: blockCentre(4), z: blockCentre(4), label: 'Sunstone Plaza' },
      pierEnd: { x: PIER.x, z: PIER.z1 - 6, label: 'End of the pier' },
    };
  }

  // ---------------------------------------------------------------- colliders
  addCollider(x0, x1, z0, z1, y1, tag = 'wall') {
    const c = { x0, x1, z0, z1, y0: 0, y1, tag };
    const index = this.colliders.length;
    this.colliders.push(c);
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx += 1) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz += 1) {
        const key = gx * 4096 + gz;
        let list = this.grid.get(key);
        if (!list) { list = []; this.grid.set(key, list); }
        list.push(index);
      }
    }
    return c;
  }

  near(x, z) {
    return this.grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || [];
  }

  /**
   * Push a circle at p = {x, z} with radius r out of every box taller than y. Returns the summed
   * push normal (or null when nothing touched), so vehicles can bounce and take damage.
   */
  pushCircle(p, r, y = 0) {
    let hit = null;
    const seen = new Set();
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        for (const index of this.near(p.x + ox * r, p.z + oz * r)) {
          if (seen.has(index)) continue;
          seen.add(index);
          const c = this.colliders[index];
          if (y >= c.y1 - 0.05) continue;
          const qx = clamp(p.x, c.x0, c.x1);
          const qz = clamp(p.z, c.z0, c.z1);
          let dx = p.x - qx;
          let dz = p.z - qz;
          let d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          let push;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            dx /= d; dz /= d;
            push = r - d;
          } else {
            // Centre inside the box: leave by the nearest side.
            const opts = [[p.x - c.x0, -1, 0], [c.x1 - p.x, 1, 0], [p.z - c.z0, 0, -1], [c.z1 - p.z, 0, 1]];
            opts.sort((a, b) => a[0] - b[0]);
            [push, dx, dz] = opts[0];
            push += r;
          }
          p.x += dx * push;
          p.z += dz * push;
          if (!hit) hit = { x: 0, z: 0, depth: 0 };
          hit.x += dx; hit.z += dz; hit.depth = Math.max(hit.depth, push);
        }
      }
    }
    this.clampWorld(p, r);
    return hit;
  }

  /** Keep a point inside the playable square and out of the sea (the pier excepted). */
  clampWorld(p, r = 0) {
    const B = CITY.bounds;
    p.x = clamp(p.x, -B + r, B - r);
    p.z = clamp(p.z, -B + r, B);
    const onPier = Math.abs(p.x - PIER.x) < PIER.half - r && p.z < PIER.z1 - r;
    if (!onPier && p.z > COAST_Z - r) p.z = COAST_Z - r;
    if (onPier && p.z > PIER.z1 - r) p.z = PIER.z1 - r;
  }

  /** Distance along a ray to the first box or the ground, up to maxDist (else Infinity). */
  rayCast(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = maxDist;
    let any = false;
    if (dy < -1e-6) {
      const t = -oy / dy;
      if (t > 0 && t < best) { best = t; any = true; }
    }
    const seen = new Set();
    const step = CELL * 0.5;
    for (let s = 0; s <= best + step; s += step) {
      const px = ox + dx * s;
      const pz = oz + dz * s;
      for (const index of this.near(px, pz)) {
        if (seen.has(index)) continue;
        seen.add(index);
        const c = this.colliders[index];
        const t = slab(ox, oy, oz, dx, dy, dz, c);
        if (t >= 0 && t < best) { best = t; any = true; }
      }
    }
    return any ? best : Infinity;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax; const dy = by - ay; const dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.rayCast(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.3;
  }

  // ---------------------------------------------------------------- meshes
  buildGround() {
    const extent = roadLine(N) + RH;
    const asphalt = asphaltTexture();
    asphalt.repeat.set(extent / 8, extent / 8);
    const asphaltN = asphaltNormal();
    asphaltN.repeat.copy(asphalt.repeat);
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(extent * 2, extent * 2),
      new THREE.MeshStandardMaterial({ map: asphalt, normalMap: asphaltN, normalScale: new THREE.Vector2(0.6, 0.6), color: '#d8d2ca', roughness: 0.86, metalness: 0, envMapIntensity: 0.22 }),
    );
    road.rotation.x = -Math.PI / 2;
    road.receiveShadow = true;
    this.group.add(road);

    const grass = grassTexture();
    grass.repeat.set(160, 160);
    // countryside around the city, stopping at the shore so it never covers the sea
    const north = -1300;
    const south = COAST_Z - 12;
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(2600, south - north),
      new THREE.MeshStandardMaterial({ map: grass, color: '#c9d8a0', roughness: 1, envMapIntensity: 0.3 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(0, -0.03, (north + south) / 2);
    outer.receiveShadow = true;
    this.group.add(outer);

    // Road paint: dashed centre lines, stop lines and zebra crossings, all in one mesh.
    const paint = new MeshBuilder();
    const yellow = col('#f2c641');
    const white = col('#f4f4f0');
    const y = 0.02;
    for (let k = 0; k <= N; k += 1) {
      const c = roadLine(k);
      for (let s = 0; s < N; s += 1) {
        const a = roadLine(s) + RH + 3;
        const b = roadLine(s + 1) - RH - 3;
        for (let t = a; t < b - 2; t += 6) {
          paint.flat(c - 0.12, t, c + 0.12, t + 3, y, yellow);
          paint.flat(t, c - 0.12, t + 3, c + 0.12, y, yellow);
        }
      }
      for (let s = 0; s <= N; s += 1) {
        const o = roadLine(s);
        for (let q = -RH + 0.8; q < RH - 0.6; q += 1.4) {
          // zebra stripes on all four approaches of intersection (k, s)
          paint.flat(c + q, o - RH - 2.6, c + q + 0.7, o - RH - 0.4, y, white);
          paint.flat(c + q, o + RH + 0.4, c + q + 0.7, o + RH + 2.6, y, white);
          paint.flat(o - RH - 2.6, c + q, o - RH - 0.4, c + q + 0.7, y, white);
          paint.flat(o + RH + 0.4, c + q, o + RH + 2.6, c + q + 0.7, y, white);
        }
      }
    }
    const paintMesh = new THREE.Mesh(paint.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    paintMesh.receiveShadow = true;
    this.group.add(paintMesh);
  }

  buildBlocks() {
    const rng = this.rng;
    const kinds = ['glass', 'stucco', 'shed', 'shop'];
    const walls = {};
    for (let k = 0; k < kinds.length; k += 1) walls[kinds[k]] = new MeshBuilder();
    const roofs = new MeshBuilder();
    const walks = new MeshBuilder();
    const lawns = new MeshBuilder();
    const lots = new MeshBuilder();
    const shade = { px: 0.94, nx: 0.86, pz: 1, nz: 0.9, py: 1 };
    const SIDES = ['px', 'nx', 'pz', 'nz'];
    const light = (c) => c.clone().lerp(col('#ffffff'), 0.55);
    const AWNINGS = ['#c0392b', '#1e6f8a', '#2d6a4f', '#f2a541', '#8a4fbf', '#e76f51'];

    /** Rooftop clutter: water tanks on legs, AC units, stair huts and masts. */
    const rooftop = (x0, z0, x1, z1, h, tall) => {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k += 1) {
        const ux = x0 + (x1 - x0) * rng.range(0.2, 0.75);
        const uz = z0 + (z1 - z0) * rng.range(0.2, 0.75);
        const pick = rng.next();
        if (pick < 0.35 && !tall) {
          for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) roofs.box(ux + ox - 0.08, h, uz + oz - 0.08, ux + ox + 0.08, h + 1.6, uz + oz + 0.08, col('#5a5450'));
          roofs.cylinder(ux, uz, 1.3, h + 1.6, h + 4.2, col('#8a6a4a'), { segments: 14, capColor: col('#6e5640') });
        } else if (pick < 0.75) {
          roofs.box(ux, h, uz, ux + 2.6, h + 1.4, uz + 1.8, col('#c3c7cc'), { shade });
          roofs.box(ux + 0.3, h + 1.4, uz + 0.3, ux + 1.3, h + 1.5, uz + 1.3, col('#55595f'), { faces: ['py'] });
        } else {
          roofs.box(ux, h, uz, ux + 3.2, h + 2.8, uz + 3.2, col('#d8d2c6'), { shade });
        }
      }
      if (tall) roofs.box((x0 + x1) / 2 - 0.15, h, (z0 + z1) / 2 - 0.15, (x0 + x1) / 2 + 0.15, h + rng.range(8, 18), (z0 + z1) / 2 + 0.15, col('#9aa2ab'));
    };

    /**
     * One building: walls in a facade material, optional street-level shops with awnings,
     * floor ledges, balconies, a cornice, a roof with clutter, and its collision box.
     * opts: { shops, balconies, round, crown }
     */
    const building = (x0, z0, x1, z1, h, kind, tint, opts = {}) => {
      const c = col(tint);
      if (opts.round) {
        const cx = (x0 + x1) / 2;
        const cz = (z0 + z1) / 2;
        const r = Math.min(x1 - x0, z1 - z0) / 2;
        walls[kind].cylinder(cx, cz, r, 0, h, c, { tile: [16, 14], segments: 40, cap: false });
        for (let y = 14; y < h - 4; y += 14) roofs.cylinder(cx, cz, r + 0.25, y - 0.3, y + 0.1, light(c), { segments: 40, cap: false });
        roofs.cylinder(cx, cz, r + 0.4, h - 0.6, h + 0.3, light(c), { segments: 40, capColor: c.clone().multiplyScalar(0.7) });
        roofs.cylinder(cx, cz, r * 0.55, h + 0.3, h + 6, col('#c8d0d8'), { segments: 28 });
        rooftop(cx - r * 0.4, cz - r * 0.4, cx + r * 0.4, cz + r * 0.4, h + 6, true);
        this.addCollider(cx - r * 0.93, cx + r * 0.93, cz - r * 0.93, cz + r * 0.93, h, 'building');
        return;
      }
      const street = opts.shops && h > 6;
      const y0 = street ? 4.4 : 0;
      walls[kind].box(x0, y0, z0, x1, h, z1, c, { faces: SIDES, tile: [16, 14], uOffset: opts.balconies ? 0 : rng.int(0, 3) * 0.25, shade });
      if (street) {
        walls.shop.box(x0, 0, z0, x1, 4.4, z1, col('#ffffff'), { faces: SIDES, tile: [8, 4.5], uOffset: rng.int(0, 1) * 0.5, shade });
        roofs.box(x0 - 0.3, 4.25, z0 - 0.3, x1 + 0.3, 4.65, z1 + 0.3, light(c), { shade });
        // striped awnings over some shopfronts on the long sides
        for (const side of [1, -1]) {
          if (!rng.chance(0.65)) continue;
          const z = side > 0 ? z1 : z0;
          const aw = col(rng.pick(AWNINGS));
          for (let u = x0 + 1; u + 6 < x1; u += 8) {
            roofs.box(u, 3.35, side > 0 ? z : z - 1.7, u + 6, 3.55, side > 0 ? z + 1.7 : z, aw, { shade });
            roofs.box(u, 3.0, side > 0 ? z + 1.62 : z - 1.7, u + 6, 3.55, side > 0 ? z + 1.7 : z - 1.62, aw.clone().multiplyScalar(0.85));
          }
        }
      }
      if (kind === 'stucco' && h > 11) {
        for (let y = 7; y < h - 2; y += 7) roofs.box(x0 - 0.14, y - 0.14, z0 - 0.14, x1 + 0.14, y + 0.08, z1 + 0.14, light(c), { shade });
      }
      if (opts.balconies && h > 10) {
        const rail = col('#f4f4f2');
        const slab = light(c);
        for (let y = 7; y < h - 3; y += 3.5) {
          for (let u = 2; u < x1 - x0 - 1; u += 8) {
            for (const side of [1, -1]) {
              const bx = side > 0 ? x0 + u : x1 - u;
              const z = side > 0 ? z1 : z0;
              const zo = side > 0 ? z + 1.1 : z - 1.1;
              roofs.box(bx - 0.9, y - 0.08, Math.min(z, zo), bx + 0.9, y + 0.08, Math.max(z, zo), slab, { shade });
              roofs.box(bx - 0.9, y + 0.08, side > 0 ? zo - 0.05 : zo, bx + 0.9, y + 1.0, side > 0 ? zo : zo + 0.05, rail, { shade });
            }
          }
        }
      }
      // cornice and roof
      roofs.box(x0 - 0.35, h - 0.55, z0 - 0.35, x1 + 0.35, h + 0.2, z1 + 0.35, light(c), { shade });
      roofs.box(x0, h + 0.19, z0, x1, h + 0.2, z1, c.clone().multiplyScalar(0.62), { faces: ['py'] });
      if (opts.crown && h > 30) {
        const inset = Math.min(x1 - x0, z1 - z0) * 0.22;
        roofs.box(x0 + inset, h + 0.2, z0 + inset, x1 - inset, h + 5 + rng.next() * 5, z1 - inset, col('#aab4bf'), { shade });
        rooftop(x0 + inset, z0 + inset, x1 - inset, z1 - inset, h + 5, true);
      } else if (h > 8) rooftop(x0, z0, x1, z1, h + 0.2, false);
      this.addCollider(x0, x1, z0, z1, h, 'building');
    };

    const walkTile = sidewalkTexture();
    for (let bz = 0; bz < N; bz += 1) {
      for (let bx = 0; bx < N; bx += 1) {
        const x0 = blockMin(bx);
        const x1 = blockMax(bx);
        const z0 = blockMin(bz);
        const z1 = blockMax(bz);
        const kind = SPECIAL[`${bx},${bz}`];
        const dist = districtOf(bx, bz);
        // raised sidewalk slab with curb faces
        walks.box(x0, 0, z0, x1, CITY.curb, z1, col('#ffffff'), { tile: [2, 2], shade });
        const lx0 = x0 + CITY.walk;
        const lx1 = x1 - CITY.walk;
        const lz0 = z0 + CITY.walk;
        const lz1 = z1 - CITY.walk;
        const w = CITY.walk / 2;
        this.loops.push({ x0: x0 + w, x1: x1 - w, z0: z0 + w, z1: z1 - w, bx, bz });

        if (kind === 'park' || kind === 'plaza') {
          if (kind === 'park') lawns.flat(lx0, lz0, lx1, lz1, CITY.curb + 0.02, col('#ffffff'), [4, 4]);
          else lots.flat(lx0, lz0, lx1, lz1, CITY.curb + 0.015, col('#e9dcc6'), [3, 3]);
          for (let k = 0; k < (kind === 'park' ? 14 : 8); k += 1) {
            const px = rng.range(lx0 + 4, lx1 - 4);
            const pz = rng.range(lz0 + 4, lz1 - 4);
            if (kind === 'plaza' && Math.hypot(px - blockCentre(bx), pz - blockCentre(bz)) < 12) continue;
            this.palms.push({ x: px, z: pz, h: rng.range(7, 11) });
          }
          if (kind === 'plaza') {
            // fountain in the middle of Sunstone Plaza
            const cx = blockCentre(bx);
            const cz = blockCentre(bz);
            roofs.box(cx - 7, CITY.curb, cz - 7, cx + 7, 1.0, cz + 7, col('#d9cbb2'), { shade });
            roofs.box(cx - 6, 0.9, cz - 6, cx + 6, 0.95, cz + 6, col('#3fb6c9'), { faces: ['py'] });
            roofs.box(cx - 1, 0.9, cz - 1, cx + 1, 4.2, cz + 1, col('#efe6d6'), { shade });
            this.addCollider(cx - 7, cx + 7, cz - 7, cz + 7, 1.0, 'fountain');
          }
          continue;
        }
        if (kind === 'parking') {
          lots.flat(lx0, lz0, lx1, lz1, CITY.curb + 0.015, col('#6b6e73'), [3, 3]);
          for (let row = 0; row < 3; row += 1) {
            const pz = lz0 + 10 + row * 22;
            for (let s = 0; s < 9; s += 1) {
              const px = lx0 + 6 + s * 7;
              lots.flat(px - 3.55, pz - 5, px - 3.4, pz + 5, CITY.curb + 0.03, col('#f4f4f0'));
              if (rng.chance(0.42)) this.parking.push({ x: px, z: pz, heading: rng.chance(0.5) ? 0 : Math.PI });
            }
          }
          continue;
        }

        const tint = () => rng.pick(PASTELS);
        if (kind === 'landmark') {
          building(lx0 + 2, lz0 + 2, lx1 - 2, lz1 - 2, rng.range(16, 22), 'stucco', bz === 1 ? '#f6f6f2' : '#dfe8f2', { shops: true });
        } else if (dist === 'corvel') {
          const g = 8;
          const mx = (lx0 + lx1) / 2;
          const mz = (lz0 + lz1) / 2;
          const quads = [[lx0, lz0, mx - g / 2, mz - g / 2], [mx + g / 2, lz0, lx1, mz - g / 2], [lx0, mz + g / 2, mx - g / 2, lz1], [mx + g / 2, mz + g / 2, lx1, lz1]];
          for (const [a, b, c, d] of quads) {
            const h = rng.range(42, 128) * (bx === 4 && bz === 3 ? 1.25 : 1);
            const podium = rng.range(6.5, 9);
            building(a, b, c, d, podium, 'stucco', rng.pick(TOWER_TINTS), { shops: true });
            const style = rng.next();
            if (style < 0.28) building(a + 3, b + 3, c - 3, d - 3, h, 'glass', rng.pick(TOWER_TINTS), { round: true });
            else if (style < 0.6) {
              // stepped tower: a wide shaft with a slimmer one rising out of it
              building(a + 2.5, b + 2.5, c - 2.5, d - 2.5, h * 0.62, 'glass', rng.pick(TOWER_TINTS), {});
              building(a + 6.5, b + 6.5, c - 6.5, d - 6.5, h, 'glass', rng.pick(TOWER_TINTS), { crown: true });
            } else building(a + 2.5, b + 2.5, c - 2.5, d - 2.5, h, 'glass', rng.pick(TOWER_TINTS), { crown: true });
          }
        } else if (dist === 'harbor') {
          const mz = (lz0 + lz1) / 2;
          building(lx0 + 2, lz0 + 2, lx1 - 2, mz - 4, rng.range(9, 14), 'shed', rng.pick(SHED_TINTS));
          // stacks of shipping containers in the southern half
          for (let k = 0; k < 10; k += 1) {
            const cx = lx0 + 6 + (k % 5) * 12.5;
            const cz = mz + 6 + Math.floor(k / 5) * 14;
            const stack = rng.int(1, 3);
            const cc = rng.pick(['#c4452f', '#2f6fb0', '#e0a127', '#3d8f5f', '#8b5fb8', '#d36a2c']);
            for (let s = 0; s < stack; s += 1) {
              walls.shed.box(cx - 2.6, s * 2.6, cz - 6, cx + 2.6, (s + 1) * 2.6, cz + 6, col(cc).multiplyScalar(1 - s * 0.06), { faces: ['px', 'nx', 'pz', 'nz'], tile: [6, 2.6], shade });
              roofs.box(cx - 2.6, (s + 1) * 2.6 - 0.01, cz - 6, cx + 2.6, (s + 1) * 2.6, cz + 6, col(cc).multiplyScalar(0.8), { faces: ['py'] });
            }
            this.addCollider(cx - 2.6, cx + 2.6, cz - 6, cz + 6, stack * 2.6, 'container');
          }
        } else if (dist === 'verde') {
          for (let gx = 0; gx < 3; gx += 1) {
            for (let gz = 0; gz < 3; gz += 1) {
              if (gx === 1 && gz === 1) {
                lawns.flat(lx0 + 23, lz0 + 23, lx1 - 23, lz1 - 23, CITY.curb + 0.02, col('#ffffff'), [4, 4]);
                this.palms.push({ x: blockCentre(bx), z: blockCentre(bz), h: 9 });
                continue;
              }
              const cw = (lx1 - lx0) / 3;
              const a = lx0 + gx * cw + 4;
              const b = lz0 + gz * cw + 4;
              lawns.flat(lx0 + gx * cw + 0.5, lz0 + gz * cw + 0.5, lx0 + (gx + 1) * cw - 0.5, lz0 + (gz + 1) * cw - 0.5, CITY.curb + 0.02, col('#ffffff'), [4, 4]);
              building(a, b, a + cw - 8, b + cw - 8, rng.range(5, 8.5), 'stucco', tint());
            }
          }
        } else if (dist === 'palmline') {
          const n = 3;
          const cw = (lx1 - lx0) / n;
          for (let k = 0; k < n; k += 1) {
            const a = lx0 + k * cw + 2;
            const depth = rng.range(30, 44);
            building(a, lz1 - depth, a + cw - 4, lz1 - 2, rng.range(14, 34), 'stucco', tint(), { shops: true, balconies: true });
            building(a + 3, lz0 + 3, a + cw - 7, lz0 + 18, rng.range(8, 14), 'stucco', tint(), { shops: true });
          }
        } else {
          // midtown and Little Marisco: mid-rise blocks with alleys
          const nx = rng.chance(0.5) ? 3 : 2;
          const nz = 2;
          const cw = (lx1 - lx0) / nx;
          const cd = (lz1 - lz0) / nz;
          for (let gx = 0; gx < nx; gx += 1) {
            for (let gz = 0; gz < nz; gz += 1) {
              const a = lx0 + gx * cw + 2;
              const b = lz0 + gz * cd + 2;
              const hi = dist === 'marisco' ? rng.range(9, 24) : rng.range(12, 36);
              const glassy = hi > 26 && rng.chance(0.4);
              building(a, b, a + cw - 4, b + cd - 4, hi, glassy ? 'glass' : 'stucco', tint(), { shops: true, balconies: !glassy && rng.chance(0.45) });
            }
          }
        }
      }
    }

    const tex = {};
    for (const kind of kinds) tex[kind] = facadeTextures(kind, kind.length * 31);
    for (const kind of kinds) {
      // physically based facades: the normal map gives recessed windows and frames depth, the
      // roughness/metalness map lets the glass mirror the sky while the walls stay matte
      const mat = new THREE.MeshStandardMaterial({
        map: tex[kind].map,
        normalMap: tex[kind].normal,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughnessMap: tex[kind].orm,
        metalnessMap: tex[kind].orm,
        roughness: 1,
        metalness: 1,
        vertexColors: true,
        envMapIntensity: kind === 'glass' ? 1.15 : 0.75,
        emissive: new THREE.Color('#ffffff'),
        emissiveMap: tex[kind].night,
        emissiveIntensity: 0,
      });
      mat.userData.nightScale = kind === 'shop' ? 0.32 : 0.9;
      this.nightMaterials.push(mat);
      const mesh = new THREE.Mesh(walls[kind].build(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    const roofMesh = new THREE.Mesh(roofs.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, envMapIntensity: 0.6 }));
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    this.group.add(roofMesh);

    const walkMesh = new THREE.Mesh(walks.build(), new THREE.MeshStandardMaterial({ map: walkTile, normalMap: sidewalkNormal(), vertexColors: true, roughness: 0.9, envMapIntensity: 0.5 }));
    walkMesh.receiveShadow = true;
    this.group.add(walkMesh);
    const lawnTex = grassTexture();
    const lawnMesh = new THREE.Mesh(lawns.build(), new THREE.MeshStandardMaterial({ map: lawnTex, vertexColors: true, roughness: 1 }));
    lawnMesh.receiveShadow = true;
    this.group.add(lawnMesh);
    const lotMesh = new THREE.Mesh(lots.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    lotMesh.receiveShadow = true;
    this.group.add(lotMesh);
  }

  buildBeach() {
    const south = roadLine(N) + RH;
    const sand = sandTexture();
    sand.repeat.set(140, 10);
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(1300, CITY.shore + 2),
      new THREE.MeshStandardMaterial({ map: sand, color: '#e6dccb', roughness: 1, envMapIntensity: 0.35 }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.01, south + (CITY.shore + 2) / 2);
    beach.receiveShadow = true;
    this.group.add(beach);

    this.water = makeWater();
    this.water.position.set(0, -0.35, COAST_Z + 700);
    this.group.add(this.water);

    // the pier: deck, rails and posts
    const pier = new MeshBuilder();
    const wood = col('#a77b52');
    pier.box(PIER.x - PIER.half, PIER.y - 0.3, PIER.z0, PIER.x + PIER.half, PIER.y, PIER.z1, wood, { tile: [2, 2] });
    for (let z = PIER.z0 + 4; z < PIER.z1; z += 6) {
      for (const sx of [-1, 1]) {
        pier.box(PIER.x + sx * (PIER.half - 0.3) - 0.2, -2, z - 0.2, PIER.x + sx * (PIER.half - 0.3) + 0.2, PIER.y + 1.1, z + 0.2, col('#7d5a3a'));
      }
    }
    for (const sx of [-1, 1]) {
      pier.box(PIER.x + sx * (PIER.half - 0.3) - 0.1, PIER.y + 0.95, PIER.z0, PIER.x + sx * (PIER.half - 0.3) + 0.1, PIER.y + 1.1, PIER.z1, col('#f2efe8'));
      this.addCollider(PIER.x + sx * PIER.half - 0.3, PIER.x + sx * PIER.half + 0.3, COAST_Z, PIER.z1, 1.6, 'rail');
    }
    const pierMesh = new THREE.Mesh(pier.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    pierMesh.castShadow = true;
    pierMesh.receiveShadow = true;
    this.group.add(pierMesh);

    // palms along the beach boulevard, umbrellas and lifeguard huts on the sand
    for (let x = -roadLine(N) + 8; x < roadLine(N); x += 16) {
      if (Math.abs(x - PIER.x) < 8) continue;
      this.palms.push({ x, z: south + 4, h: 9 + this.rng.next() * 3 });
    }
    const props = new MeshBuilder();
    for (let k = 0; k < 34; k += 1) {
      const x = this.rng.range(-roadLine(N), roadLine(N));
      const z = this.rng.range(south + 14, COAST_Z - 8);
      if (Math.abs(x - PIER.x) < 10 || Math.abs(x - this.places.nadia.x) < 14) continue;
      const c = col(this.rng.pick(['#ff5f6d', '#ffc94d', '#3fc1c9', '#ffffff', '#ff8a3d']));
      props.box(x - 0.05, 0, z - 0.05, x + 0.05, 2.4, z + 0.05, col('#eeeeee'));
      props.box(x - 1.4, 2.3, z - 1.4, x + 1.4, 2.5, z + 1.4, c);
      props.box(x - 0.9, 0.02, z + 1.2, x + 0.9, 0.08, z + 3.0, col(this.rng.pick(['#ffffff', '#7fd1ff', '#ffd27f'])));
    }
    for (let x = -360; x < 400; x += 130) {
      const z = COAST_Z - 14;
      props.box(x - 1.6, 2.2, z - 1.6, x + 1.6, 4.4, z + 1.6, col('#ff6b4a'), { tile: [1, 1] });
      props.box(x - 1.9, 4.4, z - 1.9, x + 1.9, 4.7, z + 1.9, col('#ffffff'));
      for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) props.box(x + ox - 0.1, 0, z + oz - 0.1, x + ox + 0.1, 2.2, z + oz + 0.1, col('#f4f0e6'));
      this.addCollider(x - 1.6, x + 1.6, z - 1.6, z + 1.6, 4.7, 'hut');
    }
    const propMesh = new THREE.Mesh(props.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    propMesh.castShadow = true;
    this.group.add(propMesh);
  }

  buildProps() {
    // palm trees: instanced trunks and crowns
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = palmCrownGeometry();
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: '#9c7a55', roughness: 1 }), this.palms.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: '#3f8f3a', roughness: 0.9, side: THREE.DoubleSide }), this.palms.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    this.palms.forEach((palm, k) => {
      const lean = (this.rng.next() - 0.5) * 0.16;
      e.set(lean, this.rng.next() * 6.28, lean * 0.5);
      q.setFromEuler(e);
      const y = this.groundHeight(palm.x, palm.z);
      m.compose(v.set(palm.x, y, palm.z), q, s.set(1, palm.h, 1));
      trunks.setMatrixAt(k, m);
      const top = new THREE.Vector3(0, palm.h, 0).applyQuaternion(q);
      m.compose(v.set(palm.x + top.x, y + top.y, palm.z + top.z), q, s.set(1, 1, 1).multiplyScalar(0.9 + this.rng.next() * 0.3));
      crowns.setMatrixAt(k, m);
      this.addCollider(palm.x - 0.3, palm.x + 0.3, palm.z - 0.3, palm.z + 0.3, palm.h, 'palm');
    });
    trunks.castShadow = true;
    crowns.castShadow = true;
    this.group.add(trunks, crowns);

    // street lamps at every intersection corner (two per crossing)
    for (let j = 0; j <= N; j += 1) {
      for (let i = 0; i <= N; i += 1) {
        const x = roadLine(i);
        const z = roadLine(j);
        if ((i + j) % 2 === 0) this.lamps.push({ x: x + RH + 0.8, z: z + RH + 0.8 });
        else this.lamps.push({ x: x - RH - 0.8, z: z - RH - 0.8 });
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 7, 5);
    poleGeo.translate(0, 3.5, 0);
    const headGeo = new THREE.BoxGeometry(1.6, 0.25, 0.5);
    headGeo.translate(0, 7, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#41464d', roughness: 0.6, metalness: 0.4 }), this.lamps.length);
    this.lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffcf7a', emissiveIntensity: 0 });
    const heads = new THREE.InstancedMesh(headGeo, this.lampMaterial, this.lamps.length);
    this.lamps.forEach((lamp, k) => {
      m.makeTranslation(lamp.x, 0, lamp.z);
      poles.setMatrixAt(k, m);
      heads.setMatrixAt(k, m);
      this.addCollider(lamp.x - 0.2, lamp.x + 0.2, lamp.z - 0.2, lamp.z + 0.2, 7, 'lamp');
    });
    poles.castShadow = true;
    this.group.add(poles, heads);

    // shop signs for the places the story uses
    for (const key of ['pearl', 'safehouse', 'gunshop', 'courier', 'hospital', 'precinct']) {
      const p = this.places[key];
      const sign = makeSign(p.label.replace(' (save)', ''), p.color);
      // set the sign against the building face behind the sidewalk point
      const back = 4.15;
      sign.position.set(p.x - Math.sin(p.face) * back, 5.2, p.z - Math.cos(p.face) * back);
      sign.rotation.y = p.face;
      this.group.add(sign);
    }
  }

  buildHills() {
    const rng = makeRng(99);
    const group = new THREE.Group();
    // rounded hills: squashed half-spheres with a soft vertical colour ramp (green to dry gold)
    const geo = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const colors = [];
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i += 1) {
      const c = new THREE.Color('#6f8f4e').lerp(new THREE.Color('#c9b27a'), Math.pow(pa.getY(i), 1.5));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.3 });
    const count = 46;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    for (let k = 0; k < count; k += 1) {
      const a = -Math.PI * 0.05 - (k / count) * Math.PI * 0.9 - Math.PI * 0.05;
      const r = rng.range(760, 1000);
      const h = rng.range(90, 230);
      const w = rng.range(160, 280);
      m.compose(new THREE.Vector3(Math.cos(a) * r, -6, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(w, h * 0.75, w * 0.8));
      inst.setMatrixAt(k, m);
    }
    group.add(inst);
    this.group.add(group);
  }

  // ---------------------------------------------------------------- minimap picture
  buildMinimap() {
    const S = 1024;
    const W = CITY.bounds * 2;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = S / W;
    const X = (x) => (x + CITY.bounds) * k;
    const Z = (z) => (z + CITY.bounds) * k;
    g.fillStyle = '#5d7a4a';
    g.fillRect(0, 0, S, S);
    const ext = roadLine(N) + RH;
    g.fillStyle = '#e8d29b';
    g.fillRect(0, Z(ext), S, Z(COAST_Z) - Z(ext));
    g.fillStyle = '#2a8fb8';
    g.fillRect(0, Z(COAST_Z), S, S - Z(COAST_Z));
    g.fillStyle = '#3b3f47';
    g.fillRect(X(-ext), Z(-ext), (ext * 2) * k, (ext * 2) * k);
    for (const loop of this.loops) {
      const kind = SPECIAL[`${loop.bx},${loop.bz}`];
      g.fillStyle = '#9a9590';
      g.fillRect(X(blockMin(loop.bx)), Z(blockMin(loop.bz)), (blockMax(loop.bx) - blockMin(loop.bx)) * k, (blockMax(loop.bz) - blockMin(loop.bz)) * k);
      if (kind === 'park') {
        g.fillStyle = '#6fae4e';
        g.fillRect(X(blockMin(loop.bx) + CITY.walk), Z(blockMin(loop.bz) + CITY.walk), (blockMax(loop.bx) - blockMin(loop.bx) - CITY.walk * 2) * k, (blockMax(loop.bz) - blockMin(loop.bz) - CITY.walk * 2) * k);
      }
    }
    for (const b of this.colliders) {
      if (b.tag !== 'building' && b.tag !== 'container' && b.tag !== 'fountain') continue;
      g.fillStyle = b.tag === 'fountain' ? '#4fc3d9' : b.y1 > 40 ? '#c9ced6' : '#b6b0a6';
      g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    }
    g.fillStyle = '#a77b52';
    g.fillRect(X(PIER.x - PIER.half), Z(PIER.z0), PIER.half * 2 * k, (PIER.z1 - PIER.z0) * k);
    this.minimap = { canvas: c, scale: k, size: S };
  }

  /** Night factor 0..1 lights up windows and lamps; time animates the sea. */
  update(time, night) {
    for (const m of this.nightMaterials) m.emissiveIntensity = night * m.userData.nightScale;
    this.lampMaterial.emissiveIntensity = night * 2.2;
    this.water.material.uniforms.uTime.value = time;
  }
}

/** Ray against an axis-aligned box (slab method); t of entry or -1. */
function slab(ox, oy, oz, dx, dy, dz, c) {
  let t0 = 0;
  let t1 = Infinity;
  const axes = [[ox, dx, c.x0, c.x1], [oy, dy, c.y0, c.y1], [oz, dz, c.z0, c.z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
    } else {
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

/** Fronds: eight drooping blades around the top of a trunk. */
function palmCrownGeometry() {
  const pos = [];
  const blades = 8;
  for (let b = 0; b < blades; b += 1) {
    const a = (b / blades) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const segs = 4;
    for (let s = 0; s < segs; s += 1) {
      const r0 = (s / segs) * 4.2;
      const r1 = ((s + 1) / segs) * 4.2;
      const y0 = -0.09 * r0 * r0 + 0.4 * r0;
      const y1 = -0.09 * r1 * r1 + 0.4 * r1;
      const w0 = 0.7 * Math.sin((s / segs) * Math.PI) + 0.1;
      const w1 = 0.7 * Math.sin(((s + 1) / segs) * Math.PI) + 0.1;
      const p = (r, w, y) => [ca * r - sa * w, y, sa * r + ca * w];
      const A = p(r0, -w0, y0); const B = p(r1, -w1, y1); const C = p(r1, w1, y1); const D = p(r0, w0, y0);
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A glowing shop sign with the place's name painted on a canvas. */
function makeSign(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#1d1f2b';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(5, 5, 502, 86);
  g.fillStyle = color;
  g.font = 'bold 44px "Avenir Next", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 50, 480);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.7),
    new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.55 }),
  );
  return mesh;
}

/** The sea: a gently rolling shader surface with a sunny sparkle that fades into the fog. */
function makeWater() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    { uTime: { value: 0 }, uDeep: { value: new THREE.Color('#0d6f9a') }, uShallow: { value: new THREE.Color('#38c6c9') }, uSun: { value: new THREE.Color('#fff2c4') } },
  ]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        vec4 world = modelMatrix * vec4(p, 1.0);
        float w = sin(world.x * 0.08 + uTime * 1.3) * 0.25 + sin(world.z * 0.11 - uTime * 0.9) * 0.2;
        world.y += w;
        vWave = w;
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      varying vec3 vWorld;
      varying float vWave;
      #include <fog_pars_fragment>
      void main() {
        float shore = smoothstep(${(COAST_Z + 60).toFixed(1)}, ${(COAST_Z - 4).toFixed(1)}, vWorld.z);
        vec3 c = mix(uDeep, uShallow, shore * 0.85 + vWave * 0.4);
        float s = sin(vWorld.x * 0.9 + uTime * 2.0) * sin(vWorld.z * 0.7 - uTime * 1.7);
        c += uSun * pow(max(s, 0.0), 18.0) * 0.6;
        float foam = smoothstep(${(COAST_Z + 3).toFixed(1)}, ${(COAST_Z - 1).toFixed(1)}, vWorld.z + sin(vWorld.x * 0.2 + uTime) * 1.2);
        c = mix(c, vec3(0.96, 0.98, 1.0), foam * 0.8);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1400, 120, 60), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
