import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { places, placeById } from '../data/world';
import { applySkyShading } from './shaders/skyMaterial';

/**
 * The islands.
 *
 * The world is no longer one disc. Each place sits on its own island floating
 * in a cloud sea, at its own height, with open air between them — so getting
 * somewhere means gliding to it.
 *
 * `terrainHeight` and `terrainNormal` remain the single source of truth for
 * where the ground is: the meshes, the player's feet, click-to-walk, prop
 * placement and every blade of grass read from them, so nothing can disagree
 * about where the surface is — or about where there is no surface at all.
 *
 * Crucially the places themselves have not moved. An island is built *under*
 * each one, so the directory, the minimap and every position in the content
 * still line up exactly as before.
 */

/** How far below the islands the drop goes. Nothing is solid down here. */
export const VOID_Y = -70;
/** Below this you have fallen, and get put back on the nearest island. */
export const FALL_LIMIT = -34;
/** Where the cloud sea sits between the islands. */
export const CLOUD_Y = -13;

const AMPLITUDE = 2.6;
const BASE_FREQUENCY = 1 / 26;

/** Level ground around each structure; they have no foundations. */
const PAD_FLAT = 2.2;
const PAD_FALLOFF = 6.5;

export interface Island {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Height of its surface. Varied, so crossing is a climb or a dive. */
  top: number;
}

/**
 * One island per place, at a hand-set height.
 *
 * Radii are deliberately small enough to leave open air between neighbours —
 * the gaps run from about four metres to a dozen, which is the range a glide
 * crosses and a walk cannot.
 */
export const islands: Island[] = [
  { id: 'origin', x: 0, z: 0, radius: 13, top: 0 },
  { id: 'about', x: -27.8, z: -20.4, radius: 9, top: 3.2 },
  { id: 'record', x: -33.3, z: 14.8, radius: 9, top: 6.6 },
  { id: 'orb', x: 25.9, z: -24.1, radius: 9.2, top: -2.8 },
  { id: 'git-city', x: 40.7, z: 5.6, radius: 9.5, top: 9 },
  { id: 'resume-roaster', x: 20.4, z: 29.6, radius: 9, top: 1.6 },
  { id: 'commerce-api', x: -9.2, z: 40.7, radius: 9.2, top: 5.4 },
  { id: 'skills', x: 3.7, z: -44.4, radius: 9.5, top: -4.2 },
  { id: 'contact', x: -44.4, z: 38.9, radius: 9, top: 10.5 },
];

/**
 * Land bridges.
 *
 * Narrow ridges of ground joining the islands, so the world can be walked as
 * well as flown. They are part of `terrainHeight` rather than decoration
 * standing on top of it — everything that asks where the ground is, from the
 * traveller's feet to click-to-walk to where grass may grow, gets the same
 * answer on a bridge as on an island.
 *
 * The set forms a connected graph, so every place is reachable on foot; the
 * glide is the shortcut, not the only way.
 */
const BRIDGES: [string, string][] = [
  ['origin', 'about'],
  ['origin', 'orb'],
  ['origin', 'resume-roaster'],
  ['about', 'record'],
  ['orb', 'skills'],
  ['resume-roaster', 'git-city'],
  ['resume-roaster', 'commerce-api'],
  ['record', 'contact'],
  ['commerce-api', 'contact'],
];

export interface Bridge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  aTop: number;
  bTop: number;
  length: number;
}

/** Half-width of the walkable ridge. */
const BRIDGE_HALF = 2.4;
/** How far the ground falls away either side before it is air. */
const BRIDGE_EDGE = 1.6;
/** How far the span dips in the middle, so it reads as a saddle not a plank. */
const BRIDGE_SAG = 2.2;

export const bridges: Bridge[] = BRIDGES.map(([a, b]) => {
  const A = islands.find((i) => i.id === a);
  const B = islands.find((i) => i.id === b);
  if (!A || !B) throw new Error(`unknown island in bridge ${a}-${b}`);
  return {
    ax: A.x,
    az: A.z,
    bx: B.x,
    bz: B.z,
    aTop: A.top,
    bTop: B.top,
    length: Math.hypot(B.x - A.x, B.z - A.z),
  };
});

/**
 * How high a bridge is at a point, and how solid.
 *
 * Returns null off the ridge entirely. `t` runs 0..1 along the span; the ends
 * are lifted to meet each island's surface and the middle sags, which is what
 * makes it read as land rather than as a ramp.
 */
function bridgeHeight(x: number, z: number): { h: number; edge: number } | null {
  let best: { h: number; edge: number } | null = null;

  for (let i = 0; i < bridges.length; i += 1) {
    const br = bridges[i];
    const dx = br.bx - br.ax;
    const dz = br.bz - br.az;
    const lenSq = dx * dx + dz * dz;
    let t = ((x - br.ax) * dx + (z - br.az) * dz) / lenSq;
    if (t < 0 || t > 1) continue;

    const px = br.ax + dx * t;
    const pz = br.az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d > BRIDGE_HALF + BRIDGE_EDGE) continue;

    const edge = 1 - smoothstep(BRIDGE_HALF - 0.5, BRIDGE_HALF + BRIDGE_EDGE, d);
    if (edge <= 0) continue;

    // Straight run between the two surfaces, sagging in the middle.
    const h = br.aTop + (br.bTop - br.aTop) * t - Math.sin(t * Math.PI) * BRIDGE_SAG;
    if (!best || h > best.h) best = { h, edge };
  }
  return best;
}

/** The pool, on the home island. */
// Clear of the arrival monument's approach ring, which the basin used to dip.
export const POOL_CENTRE: [number, number] = [-8.2, -6.4];
export const POOL_RADIUS = 2.2;
const POOL_DEPTH = 0.7;
export const POOL_SURFACE = -0.3;

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

const pads = places.map((p) => ({
  x: p.at[0],
  z: p.at[1],
  flat: p.solid + PAD_FLAT,
  falloff: p.solid + PAD_FALLOFF,
}));

/** 1 where the ground must be dead level for a structure to stand on it. */
function flattenAmount(x: number, z: number): number {
  let level = 0;
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

/** Gentle relief on an island's surface. */
function rolling(x: number, z: number): number {
  return (
    noise2D(x * BASE_FREQUENCY, z * BASE_FREQUENCY) * AMPLITUDE +
    noise2D(x * BASE_FREQUENCY * 2.3, z * BASE_FREQUENCY * 2.3) * AMPLITUDE * 0.4
  );
}

/**
 * Ground height at a world position, or the void between islands.
 *
 * The rim falls away steeply: raising the blend to a low power keeps the
 * surface almost level right out to the edge and then drops it, which is what
 * gives an island a cliff rather than a slope into nothing.
 */
export function terrainHeight(x: number, z: number): number {
  let best = VOID_Y;

  for (let i = 0; i < islands.length; i += 1) {
    const isl = islands[i];
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d > isl.radius + 1.4) continue;

    const edge = 1 - smoothstep(isl.radius - 1.8, isl.radius + 1.4, d);
    if (edge <= 0) continue;

    let surface = isl.top + rolling(x, z) * (1 - flattenAmount(x, z));

    // The pool basin, cut into the home island.
    if (isl.id === 'origin') {
      const pd = Math.hypot(x - POOL_CENTRE[0], z - POOL_CENTRE[1]);
      if (pd < POOL_RADIUS + 1.3) {
        surface -= (1 - smoothstep(POOL_RADIUS - 0.5, POOL_RADIUS + 1.3, pd)) * POOL_DEPTH;
      }
    }

    const h = VOID_Y + (surface - VOID_Y) * Math.pow(edge, 0.3);
    if (h > best) best = h;
  }

  // The bridges, blended in the same way, so a ridge meets an island surface
  // without a seam and falls away at its sides just as an island rim does.
  const bridge = bridgeHeight(x, z);
  if (bridge) {
    const h = VOID_Y + (bridge.h - VOID_Y) * Math.pow(bridge.edge, 0.3);
    if (h > best) best = h;
  }
  return best;
}

/** True where there is real ground underfoot rather than the drop. */
export function onGround(x: number, z: number): boolean {
  return terrainHeight(x, z) > VOID_Y + 40;
}

/** The island nearest a position, for putting a fallen traveller back. */
export function nearestIsland(x: number, z: number): Island {
  let best = islands[0];
  let bestD = Infinity;
  for (const isl of islands) {
    const d = Math.hypot(x - isl.x, z - isl.z);
    if (d < bestD) {
      bestD = d;
      best = isl;
    }
  }
  return best;
}

const NORMAL_EPS = 0.3;

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
 * Marched against `terrainHeight` rather than raycast against the meshes: they
 * are a couple of hundred thousand triangles between them and three would test
 * every one. Marching costs a fixed handful of samples and cannot disagree
 * with the ground the traveller walks on.
 */
export function raycastTerrain(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  target: THREE.Vector3,
  maxDistance = 220,
): boolean {
  if (direction.y >= -1e-4) return false;
  const STEPS = 110;
  const step = maxDistance / STEPS;
  let prevT = 0;
  if (origin.y - terrainHeight(origin.x, origin.z) < 0) return false;

  for (let i = 1; i <= STEPS; i += 1) {
    const t = i * step;
    const x = origin.x + direction.x * t;
    const y = origin.y + direction.y * t;
    const z = origin.z + direction.z * t;
    if (y - terrainHeight(x, z) <= 0) {
      let lo = prevT;
      let hi = t;
      for (let j = 0; j < 12; j += 1) {
        const mid = (lo + hi) * 0.5;
        const my = origin.y + direction.y * mid;
        if (my - terrainHeight(origin.x + direction.x * mid, origin.z + direction.z * mid) <= 0) hi = mid;
        else lo = mid;
      }
      const hit = (lo + hi) * 0.5;
      target.set(
        origin.x + direction.x * hit,
        origin.y + direction.y * hit,
        origin.z + direction.z * hit,
      );
      // Only a hit if it landed on real ground, not somewhere over the drop.
      return onGround(target.x, target.z);
    }
    prevT = t;
  }
  return false;
}

export interface Terrain {
  group: THREE.Group;
  dispose(): void;
}

const GRASS_LOW = new THREE.Color(0x5d9440);
const GRASS_HIGH = new THREE.Color(0x86b85a);
const ROCK = new THREE.Color(0x8b8574);
const UNDERSIDE = new THREE.Color(0x6b6357);

function paint(geometry: THREE.BufferGeometry, underside: boolean): void {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);

    if (underside) {
      // Bare rock below, darkening as it goes down into the cloud.
      const depth = Math.min(1, Math.max(0, -position.getY(i) / 16));
      c.copy(ROCK).lerp(UNDERSIDE, depth);
    } else {
      const tint = tintNoise2D(x * 0.02, z * 0.02) * 0.5 + 0.5;
      c.copy(GRASS_LOW).lerp(GRASS_HIGH, tint);
      c.lerp(ROCK, smoothstep(0.3, 0.55, 1 - normal.getY(i)));
    }

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
    { rimStrength: 0.16, rimPower: 3.4, rimColor: 0xdff0c0 },
  );
  disposables.push(material);

  const rings = quality === 'high' ? 44 : 22;
  const segments = quality === 'high' ? 72 : 40;

  for (const isl of islands) {
    // The top: a radial disc, so the density follows the island's shape and no
    // triangles are spent on the empty air around it.
    const top = new THREE.RingGeometry(0.0001, isl.radius + 1.4, segments, rings);
    top.rotateX(-Math.PI / 2);
    const pos = top.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i) + isl.x;
      const z = pos.getZ(i) + isl.z;
      pos.setY(i, terrainHeight(x, z) - isl.top);
    }
    pos.needsUpdate = true;
    top.computeVertexNormals();
    paint(top, false);
    const topMesh = new THREE.Mesh(top, material);
    topMesh.position.set(isl.x, isl.top, isl.z);
    topMesh.receiveShadow = true;
    topMesh.castShadow = quality === 'high';
    group.add(topMesh);
    disposables.push(top);

    /**
     * The underside: a cone hanging beneath the rim.
     *
     * Without it an island is a flat cut-out the moment you get below its
     * horizon — and the whole point of flying between them is that you spend
     * time below their horizon.
     */
    const depth = 9 + isl.radius * 0.9;
    const under = new THREE.ConeGeometry(isl.radius + 1.2, depth, segments, 4, true);
    under.translate(0, -depth / 2, 0);
    // Rough the cone up so it reads as broken rock rather than a funnel.
    const upos = under.attributes.position;
    for (let i = 0; i < upos.count; i += 1) {
      const y = upos.getY(i);
      if (y > -0.4 || y < -depth + 0.6) continue;
      const wobble = 1 + noise2D((upos.getX(i) + isl.x) * 0.28, (upos.getZ(i) + isl.z) * 0.28) * 0.22;
      upos.setX(i, upos.getX(i) * wobble);
      upos.setZ(i, upos.getZ(i) * wobble);
    }
    upos.needsUpdate = true;
    under.computeVertexNormals();
    paint(under, true);
    const underMesh = new THREE.Mesh(under, material);
    underMesh.position.set(isl.x, isl.top - 0.25, isl.z);
    underMesh.castShadow = quality === 'high';
    group.add(underMesh);
    disposables.push(under);
  }

  /**
   * The bridges.
   *
   * A strip along each span, subdivided and displaced by `terrainHeight` like
   * everything else, so the mesh cannot disagree with the ground the traveller
   * actually walks on. Built wider than the walkable ridge so its sides fall
   * away into air rather than ending at a hard edge.
   */
  const ALONG = quality === 'high' ? 40 : 20;
  const ACROSS = 8;
  for (const br of bridges) {
    const dx = (br.bx - br.ax) / br.length;
    const dz = (br.bz - br.az) / br.length;
    // Perpendicular, to give the strip its width.
    const nx = -dz;
    const nz = dx;
    const half = 4.2;

    const vertices = new Float32Array((ALONG + 1) * (ACROSS + 1) * 3);
    const indices: number[] = [];
    for (let i = 0; i <= ALONG; i += 1) {
      const along = (i / ALONG) * br.length;
      for (let j = 0; j <= ACROSS; j += 1) {
        const side = (j / ACROSS - 0.5) * 2 * half;
        const x = br.ax + dx * along + nx * side;
        const z = br.az + dz * along + nz * side;
        const v = (i * (ACROSS + 1) + j) * 3;
        vertices[v] = x;
        vertices[v + 1] = terrainHeight(x, z);
        vertices[v + 2] = z;
        if (i < ALONG && j < ACROSS) {
          const a = i * (ACROSS + 1) + j;
          indices.push(a, a + ACROSS + 1, a + 1, a + 1, a + ACROSS + 1, a + ACROSS + 2);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    paint(geometry, false);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = quality === 'high';
    group.add(mesh);
    disposables.push(geometry);
  }

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}

/** Kept for callers that still want a nominal world extent. */
export { placeById };
