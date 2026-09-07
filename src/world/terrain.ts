import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { places, WORLD_RADIUS } from '../data/world';
import { applySkyShading } from './shaders/skyMaterial';

/**
 * The ground.
 *
 * `terrainHeight` and `terrainNormal` are the single source of truth for where
 * the ground is. The mesh, the player's feet, click-to-walk, prop placement and
 * (from phase 3) every blade of grass read from these two functions rather than
 * from the geometry, so nothing can disagree about where the surface is.
 *
 * Everything is deterministic: the noise is seeded, so the world is identical
 * on every visit.
 */

/** Rolling amplitude in metres, before the flatten masks. */
const AMPLITUDE = 3.2;
const BASE_FREQUENCY = 1 / 38;

/** How far past the boundary the land takes to fall away. */
const CLIFF_RUN = 25;
/** How deep the surrounding plain sits. Far enough down to read as a drop. */
const CLIFF_FLOOR = -14;
/** Where the land has fully fallen; beyond this the height is constant. */
const CLIFF_END = WORLD_RADIUS + CLIFF_RUN;

/** The plaza is level out to here, then eases back into the hills. */
const PLAZA_FLAT = 12;
const PLAZA_FALLOFF = 20;

/**
 * The pool is a basin cut into the ground, not a disc lying on top of it.
 *
 * A flat blue circle on flat ground reads as painted floor however good the
 * shader is — water needs somewhere to sit. It is placed off to one side of
 * the plaza, in the widest gap between two paths: a ring of water around the
 * arrival monument would look better and make you wade to reach it.
 */
export const POOL_CENTRE: [number, number] = [-7.5, -0.8];
export const POOL_RADIUS = 3.3;
const POOL_DEPTH = 0.75;
/** The waterline: below the rim, above the floor of the basin. */
export const POOL_SURFACE = -0.28;

/** Structures are box geometry with no foundations, so each gets a level pad. */
const PAD_FLAT = 2.5;
const PAD_FALLOFF = 9;

/** Deterministic PRNG so the seeded noise is reproducible across reloads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const noise2D = createNoise2D(mulberry32(0x5c1a2b));
const tintNoise2D = createNoise2D(mulberry32(0x9e3f77));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Pads precomputed once. `terrainHeight` runs well over a hundred thousand
 * times just to build the mesh, and again per grass blade in phase 3, so the
 * inner loop reads a flat array rather than walking `places` objects.
 */
const pads: { x: number; z: number; flat: number; falloff: number }[] = places.map((p) => ({
  x: p.at[0],
  z: p.at[1],
  flat: p.solid + PAD_FLAT,
  falloff: p.solid + PAD_FALLOFF,
}));

/** 1 where the ground must be dead level, 0 where the hills run free. */
function flattenAmount(x: number, z: number): number {
  // The plaza.
  let level = 1 - smoothstep(PLAZA_FLAT, PLAZA_FALLOFF, Math.hypot(x, z));
  if (level >= 1) return 1;

  for (let i = 0; i < pads.length; i += 1) {
    const pad = pads[i];
    const d = Math.hypot(x - pad.x, z - pad.z);
    if (d >= pad.falloff) continue;
    const amount = 1 - smoothstep(pad.flat, pad.falloff, d);
    if (amount > level) level = amount;
    if (level >= 1) return 1;
  }
  return level;
}

/** Three octaves of simplex, the rolling shape of the land. */
function rolling(x: number, z: number): number {
  let h = noise2D(x * BASE_FREQUENCY, z * BASE_FREQUENCY) * AMPLITUDE;
  h += noise2D(x * BASE_FREQUENCY * 2.1, z * BASE_FREQUENCY * 2.1) * AMPLITUDE * 0.45;
  h += noise2D(x * BASE_FREQUENCY * 4.3, z * BASE_FREQUENCY * 4.3) * AMPLITUDE * 0.2;
  return h;
}

/**
 * Ground height at a world position.
 *
 * Level on the plaza and under every structure, rolling in between, and falling
 * away past the boundary into the plain the cloud sea swallows.
 */
export function terrainHeight(x: number, z: number): number {
  const radius = Math.hypot(x, z);

  // Past the drop the height is constant, and there is nothing to compute.
  if (radius >= CLIFF_END) return CLIFF_FLOOR;

  let h = rolling(x, z) * (1 - flattenAmount(x, z));

  // Cut the basin, with a soft lip so the ground dishes into it.
  const poolDist = Math.hypot(x - POOL_CENTRE[0], z - POOL_CENTRE[1]);
  if (poolDist < POOL_RADIUS + 1.6) {
    h -= (1 - smoothstep(POOL_RADIUS - 0.6, POOL_RADIUS + 1.6, poolDist)) * POOL_DEPTH;
  }

  if (radius > WORLD_RADIUS) {
    const t = smoothstep(0, 1, (radius - WORLD_RADIUS) / CLIFF_RUN);
    h = h * (1 - t) + CLIFF_FLOOR * t;
  }
  return h;
}

const NORMAL_EPS = 0.35;

/** Surface normal, by central difference on `terrainHeight`. */
export function terrainNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const hL = terrainHeight(x - NORMAL_EPS, z);
  const hR = terrainHeight(x + NORMAL_EPS, z);
  const hD = terrainHeight(x, z - NORMAL_EPS);
  const hU = terrainHeight(x, z + NORMAL_EPS);
  return target.set(hL - hR, 2 * NORMAL_EPS, hD - hU).normalize();
}

/**
 * Where a ray meets the ground.
 *
 * Marched against `terrainHeight` rather than raycast against the mesh: the
 * mesh is a couple of hundred thousand triangles, and three would test every
 * one of them on each click. Marching costs a fixed handful of height samples
 * and cannot disagree with the rest of the world about where the ground is.
 */
export function raycastTerrain(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  target: THREE.Vector3,
  maxDistance = 260,
): boolean {
  // Looking up, or level: there is no ground ahead to hit.
  if (direction.y >= -1e-4) return false;

  const STEPS = 96;
  const step = maxDistance / STEPS;
  let prevT = 0;
  // Starting underground means there is no surface ahead to fall onto.
  if (origin.y - terrainHeight(origin.x, origin.z) < 0) return false;

  for (let i = 1; i <= STEPS; i += 1) {
    const t = i * step;
    const x = origin.x + direction.x * t;
    const y = origin.y + direction.y * t;
    const z = origin.z + direction.z * t;
    const gap = y - terrainHeight(x, z);

    if (gap <= 0) {
      // Crossed the surface between prevT and t — bisect to tighten it up.
      let lo = prevT;
      let hi = t;
      for (let j = 0; j < 12; j += 1) {
        const mid = (lo + hi) * 0.5;
        const mx = origin.x + direction.x * mid;
        const my = origin.y + direction.y * mid;
        const mz = origin.z + direction.z * mid;
        if (my - terrainHeight(mx, mz) <= 0) hi = mid;
        else lo = mid;
      }
      const hit = (lo + hi) * 0.5;
      target.set(
        origin.x + direction.x * hit,
        origin.y + direction.y * hit,
        origin.z + direction.z * hit,
      );
      return true;
    }
    prevT = t;
  }
  return false;
}

export interface Terrain {
  group: THREE.Group;
  dispose(): void;
}

/** Half-width of the detailed mesh: the walkable world plus the whole drop. */
const NEAR_HALF = WORLD_RADIUS + 30;
/** The coarse plain begins where the detailed square is guaranteed to reach. */
const FAR_INNER = NEAR_HALF;
const FAR_OUTER = 400;

const GRASS_LOW = new THREE.Color(0x6fa046);
const GRASS_HIGH = new THREE.Color(0x86b85a);
const ROCK = new THREE.Color(0xc4b49a);
const SAND = new THREE.Color(0xe0d2b0);

/**
 * Paint a displaced geometry by slope and height.
 *
 * Baked into vertex colours in JS rather than done in the shader: it is a
 * one-off cost at startup and it keeps the material a plain standard material,
 * which means it goes through `applySkyShading` like everything else.
 */
function paint(geometry: THREE.BufferGeometry): void {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const slope = 1 - normal.getY(i);

    // Grass, varied by a low-frequency wash so it is never one flat green.
    const tint = tintNoise2D(x * 0.014, z * 0.014) * 0.5 + 0.5;
    c.copy(GRASS_LOW).lerp(GRASS_HIGH, tint);

    // Rock wherever the ground is too steep to hold soil.
    c.lerp(ROCK, smoothstep(0.28, 0.5, slope));

    // A narrow pale shoreline just outside the plaza, where the pool will sit
    // in phase 3. Deliberately a band and not a disc — widened, it turns the
    // whole plaza surround to sand.
    const shore = Math.hypot(x, z);
    if (shore > PLAZA_FLAT - 2 && shore < PLAZA_FALLOFF && y < 0.6) {
      const band = smoothstep(PLAZA_FLAT - 2, PLAZA_FLAT + 1, shore)
        * (1 - smoothstep(PLAZA_FLAT + 3, PLAZA_FALLOFF, shore));
      c.lerp(SAND, band * 0.5);
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function displace(geometry: THREE.BufferGeometry, yOffset = 0): void {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    position.setY(i, terrainHeight(position.getX(i), position.getZ(i)) + yOffset);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function buildTerrain(quality: 'high' | 'low'): Terrain {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  const material = applySkyShading(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.4,
    }),
    // Much weaker than the props, and warm rather than sky-blue.
    //
    // A fresnel rim keys off 1 - dot(N, V), which on a large ground plane
    // viewed at a grazing angle approaches 1 across everything you can see —
    // so the whole floor blows out to pale blue. Rim light belongs on
    // silhouettes; the ground only wants a hint of it.
    { rimStrength: 0.16, rimPower: 3.4, rimColor: 0xdff0c0 },
  );
  disposables.push(material);

  // The detailed ground you actually walk on.
  const segments = quality === 'high' ? 320 : 128;
  const near = new THREE.PlaneGeometry(NEAR_HALF * 2, NEAR_HALF * 2, segments, segments);
  near.rotateX(-Math.PI / 2);
  displace(near);
  paint(near);
  disposables.push(near);

  const nearMesh = new THREE.Mesh(near, material);
  nearMesh.receiveShadow = true;
  group.add(nearMesh);

  /**
   * The plain out to the horizon.
   *
   * Its inner edge is the near square's *inscribed* radius, so the square
   * always covers everything inside it and there is no gap; the overlap out at
   * the square's corners is all beyond the drop, where the height is constant,
   * so a few centimetres of offset keeps the two from z-fighting.
   */
  const far = new THREE.RingGeometry(FAR_INNER, FAR_OUTER, 96, 24);
  far.rotateX(-Math.PI / 2);
  displace(far, -0.06);
  paint(far);
  disposables.push(far);

  const farMesh = new THREE.Mesh(far, material);
  group.add(farMesh);

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
