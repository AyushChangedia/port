import * as THREE from 'three';
import { places, WORLD_RADIUS } from '../data/world';
import { applySkyShading } from './shaders/skyMaterial';
import { WIND_GLSL, windUniforms } from './shaders/wind';
import { POOL_CENTRE, POOL_RADIUS, terrainHeight, terrainNormal } from './terrain';

/**
 * The meadow.
 *
 * Dense instanced blades and flowers, animated entirely in the vertex shader —
 * nothing here touches the CPU per frame. Placement is rejection sampled
 * against the terrain so nothing grows on a cliff, through a structure, or
 * across a path.
 *
 * The blades are split into a grid of instanced meshes rather than one giant
 * one, so the half of the meadow behind you is culled instead of submitted.
 */

export interface Grass {
  group: THREE.Group;
  dispose(): void;
}

const BLADE_HEIGHT = 0.55;
const BLADE_WIDTH = 0.028;
/** How far the tip leans from the root. Straight blades read as spikes. */
const BLADE_CURVE = 0.16;
/** Blades per tuft. Grass grows in clumps, not on a uniform lattice. */
const PER_TUFT = 5;
/** Grid cells per axis. Small enough to cull usefully, few enough to stay cheap. */
const CELLS = 6;

/** Deterministic, so the meadow is the same on every visit. */
function rnd(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A blade: a curved strip tapering to a point.
 *
 * The curve is the whole thing. A straight tapered triangle reads as a spike
 * however many you place — grass only looks like grass once the blades arc
 * over and catch the light along their length. The taper is front-loaded too,
 * so a blade stays slim for most of its run instead of being a wedge.
 */
function bladeGeometry(): THREE.BufferGeometry {
  const SEGMENTS = 5;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    // Arc forward as it rises, losing a little height to the lean.
    const bend = BLADE_CURVE * t * t;
    const y = (BLADE_HEIGHT * Math.sin(t * 1.28)) / Math.sin(1.28);
    const w = i === SEGMENTS ? 0 : BLADE_WIDTH * Math.pow(1 - t, 0.55);
    positions.push(-w, y, bend, w, y, bend);
  }
  for (let i = 0; i < SEGMENTS; i += 1) {
    const a = i * 2;
    if (i === SEGMENTS - 1) {
      // The tip collapses to a point, so the last segment is one triangle.
      indices.push(a, a + 1, a + 2);
    } else {
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A five-petal flower, drawn once at startup. No texture files. */
function flowerTexture(): THREE.CanvasTexture {
  const S = 96;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.clearRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i += 1) {
    ctx.save();
    ctx.rotate((i / 5) * Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(0, -S * 0.26, S * 0.13, S * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(0, 0, S * 0.1, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface Blade {
  x: number;
  z: number;
  scale: number;
  rotY: number;
  tint: number;
  phase: number;
}

/** True where nothing should grow: too steep, on a structure, or on a path. */
function rejects(x: number, z: number, normalScratch: THREE.Vector3): boolean {
  const radius = Math.hypot(x, z);
  // The plaza stays clear, and nothing grows past the boundary.
  if (radius < 11.5 || radius > WORLD_RADIUS - 1.5) return true;
  // Nothing grows in the pool.
  if (Math.hypot(x - POOL_CENTRE[0], z - POOL_CENTRE[1]) < POOL_RADIUS + 1.2) return true;

  const slope = 1 - terrainNormal(x, z, normalScratch).y;
  if (slope > 0.45) return true;

  for (const place of places) {
    const dx = x - place.at[0];
    const dz = z - place.at[1];
    if (Math.hypot(dx, dz) < place.solid + 1.2) return true;

    // Keep the paths walkable and legible.
    if (place.id === 'origin') continue;
    const len = Math.hypot(place.at[0], place.at[1]);
    const t = Math.max(0, Math.min(1, (x * place.at[0] + z * place.at[1]) / (len * len)));
    if (Math.hypot(x - place.at[0] * t, z - place.at[1] * t) < 1.2 + 1.2) return true;
  }
  return false;
}

/** Wind, applied in the vertex stage. Shared by blades and flowers. */
function windPatch(
  swayScale: number,
  cacheKey: string,
  fragment?: (shader: THREE.WebGLProgramParametersWithUniforms) => void,
) {
  return {
    cacheKey,
    patch: (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, windUniforms);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aTint;
attribute float aPhase;
varying float vAlong;
varying float vTint;
${WIND_GLSL}`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
// How far up the blade this vertex is. Roots must not move.
vAlong = clamp( transformed.y / ${BLADE_HEIGHT.toFixed(3)}, 0.0, 1.0 );
vTint = aTint;

// Guarded exactly as three guards its own instancing maths: an unguarded
// instanceMatrix is a compile error the moment this material is ever used on
// a non-instanced mesh.
vec4 gustLocal = vec4( 0.0, 0.0, 0.0, 1.0 );
#ifdef USE_INSTANCING
	gustLocal = instanceMatrix * gustLocal;
#endif
vec4 gustWorld = modelMatrix * gustLocal;
float gust = windField( gustWorld.xz ) * uWind;

// Weighted by the square of the distance up the blade, so it bends from the
// base instead of shearing rigidly.
float lean = pow( vAlong, 2.0 ) * ${swayScale.toFixed(3)};
transformed.x += gust * lean;
transformed.z += gust * lean * 0.6;

// A small fast flutter, only near the tip.
transformed.x += sin( uWindTime * 6.0 + aPhase ) * 0.02 * pow( vAlong, 3.0 ) * uWind;

// Push away from the player's feet. This is the detail that sells the meadow:
// walking through it should displace it.
// Branchless, and normalised by hand: normalize() of a near-zero vector is
// undefined, and this one goes to zero exactly when you stand on a blade.
vec2 fromPlayer = gustWorld.xz - uPlayer.xz;
float dist = length( fromPlayer );
float press = 1.0 - smoothstep( 0.0, 1.6, dist );
vec2 pushDir = fromPlayer / max( dist, 0.001 );
transformed.xz += pushDir * press * 0.45 * vAlong;
transformed.y -= press * 0.12 * vAlong;`,
        );

      fragment?.(shader);
    },
  };
}

/**
 * Blade colour: darker at the root, pale toward the tip, varied per blade.
 *
 * Supplies its own varyings. The wind patch used to provide them, and with the
 * wind gone the fragment stage would otherwise read varyings the vertex stage
 * never writes.
 */
function bladeColour(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
attribute float aTint;
varying float vAlong;
varying float vTint;`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vAlong = clamp( transformed.y / ${BLADE_HEIGHT.toFixed(3)}, 0.0, 1.0 );
vTint = aTint;`,
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
varying float vAlong;
varying float vTint;`,
    )
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  // Deep at the root, pale at the tip. The old pair sat too light and the
  // filmic grade washed the whole meadow out to grey-green.
  vec3 root = mix( vec3( 0.196, 0.365, 0.129 ), vec3( 0.310, 0.522, 0.204 ), vTint );
  vec3 tip = mix( vec3( 0.541, 0.729, 0.318 ), vec3( 0.702, 0.839, 0.443 ), vTint );
  diffuseColor.rgb *= mix( root, tip, pow( vAlong, 1.35 ) );
}`,
    );
}

export function buildGrass(quality: 'high' | 'low', density = 140000): Grass {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  /**
   * Density is deliberately not tied to the post-processing tier.
   *
   * An integrated desktop GPU renders a hundred thousand static blades without
   * trouble — it is the HDR post chain it cannot carry — so pinning the two
   * together starved the meadow on exactly the machines that could afford it.
   */
  const target = density;
  const normalScratch = new THREE.Vector3();

  // ── Placement ──────────────────────────────────────────────────────────────
  const blades: Blade[] = [];
  const tuftTarget = Math.ceil(target / PER_TUFT);
  const maxAttempts = tuftTarget * 8;
  for (let i = 0; i < maxAttempts && blades.length < target; i += 1) {
    const a = rnd(i * 1.37) * Math.PI * 2;
    const r = 13 + Math.sqrt(rnd(i * 2.71)) * (WORLD_RADIUS - 15);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    // One rejection test per clump, not per blade: it is the same answer for
    // every blade in a 25cm tuft, and it is the expensive part of placement.
    if (rejects(cx, cz, normalScratch)) continue;

    for (let k = 0; k < PER_TUFT; k += 1) {
      const seed = i * 7.13 + k * 1.87;
      const spread = rnd(seed) * 0.26;
      const around = rnd(seed * 2.1) * Math.PI * 2;
      blades.push({
        x: cx + Math.cos(around) * spread,
        z: cz + Math.sin(around) * spread,
        scale: 0.6 + rnd(seed * 3.3) * 0.85,
        rotY: rnd(seed * 5.1) * Math.PI * 2,
        tint: rnd(i * 7.7) * 0.6 + rnd(seed * 1.3) * 0.4,
        phase: rnd(seed * 9.2) * Math.PI * 2,
      });
    }
  }

  // ── Bucket into a grid so the far half of the meadow can be culled ─────────
  const span = (WORLD_RADIUS * 2) / CELLS;
  const cells: Blade[][] = Array.from({ length: CELLS * CELLS }, () => []);
  for (const blade of blades) {
    const cx = Math.min(CELLS - 1, Math.max(0, Math.floor((blade.x + WORLD_RADIUS) / span)));
    const cz = Math.min(CELLS - 1, Math.max(0, Math.floor((blade.z + WORLD_RADIUS) / span)));
    cells[cz * CELLS + cx].push(blade);
  }

  /**
   * The blades do not take the wind, and that is deliberate.
   *
   * Bisected on an Intel UHD 730 through ANGLE/D3D11: the sky shading alone is
   * fine, adding the wind vertex patch renders the entire frame black, and it
   * does so with no shader error, no link error and no GL error. The identical
   * patch on the flowers and the bunting is fine on the same machine, and the
   * fault does not scale with instance count, so it is not cost. Rather than
   * ship something that turns a whole class of machine black, the blades stand
   * still and the flowers and flags carry the wind. Revisit with that hardware
   * in hand.
   */
  const bladeMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.4,
    }),
    // Less rim than the props: a blade is nearly edge-on from most angles, so
    // a strong fresnel turns the whole meadow into pale outlines.
    { rimColor: 0xcdeb96, rimStrength: 0.55, cacheKey: 'grass', patch: bladeColour },
  );
  disposables.push(bladeMaterial);

  const blade = bladeGeometry();
  disposables.push(blade);

  const dummy = new THREE.Object3D();
  for (const cell of cells) {
    if (cell.length === 0) continue;
    const geometry = blade.clone();
    const tints = new Float32Array(cell.length);
    const phases = new Float32Array(cell.length);
    const mesh = new THREE.InstancedMesh(geometry, bladeMaterial, cell.length);

    for (let i = 0; i < cell.length; i += 1) {
      const b = cell[i];
      dummy.position.set(b.x, terrainHeight(b.x, b.z), b.z);
      // Lean each blade differently, or a tuft is one blade cloned five times.
      dummy.rotation.set((b.tint - 0.5) * 0.34, b.rotY, (b.tint - 0.5) * 0.4);
      dummy.scale.set(0.85 + b.tint * 0.3, b.scale, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tints[i] = b.tint;
      phases[i] = b.phase;
    }
    geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 1));
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    mesh.instanceMatrix.needsUpdate = true;
    // Frustum culling is the entire reason for the grid, so the bounds have to
    // be real — never frustumCulled = false here.
    // Grass in shadow is most of what grounds it to the terrain.
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    disposables.push(geometry);
    group.add(mesh);
  }

  // ── Flowers ────────────────────────────────────────────────────────────────
  const flowerCount = quality === 'high' ? 6000 : 700;
  const petalTexture = flowerTexture();
  disposables.push(petalTexture);

  const flowerMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({
      map: petalTexture,
      transparent: true,
      alphaTest: 0.35,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
      // See bunting.ts: instanceColor only reaches the fragment stage under
      // USE_COLOR, which needs a real `color` attribute to exist.
      vertexColors: true,
    }),
    {
      rimColor: 0xffd9f0,
      rimStrength: 1.0,
      // A touch more sway than the grass: flowers sit on taller, thinner stems.
      ...windPatch(0.4, 'flower', (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
varying float vAlong;
varying float vTint;`,
        );
      }),
    },
  );
  disposables.push(flowerMaterial);

  // Two intersecting quads, so a flower reads from any angle.
  const cross = new THREE.BufferGeometry();
  {
    const h = 0.26;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let q = 0; q < 2; q += 1) {
      const c = q === 0 ? 1 : 0;
      const s = q === 0 ? 0 : 1;
      const base = q * 4;
      positions.push(-h * c, 0, -h * s, h * c, 0, h * s, -h * c, h * 2, -h * s, h * c, h * 2, h * s);
      uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    cross.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    cross.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    cross.setIndex(indices);
    cross.computeVertexNormals();
    cross.setAttribute('color', new THREE.Float32BufferAttribute(new Array(8 * 3).fill(1), 3));
  }
  disposables.push(cross);

  const PALETTE = [0xf58bc0, 0xf2a8d4, 0xffffff, 0xffd86e].map((hex) => new THREE.Color(hex));
  const flowers = new THREE.InstancedMesh(cross, flowerMaterial, flowerCount);
  const colors = new Float32Array(flowerCount * 3);
  const fTints = new Float32Array(flowerCount);
  const fPhases = new Float32Array(flowerCount);

  let placed = 0;
  for (let i = 0; i < flowerCount * 14 && placed < flowerCount; i += 1) {
    const a = rnd(i * 4.19) * Math.PI * 2;
    const r = 13 + Math.sqrt(rnd(i * 6.53)) * (WORLD_RADIUS - 15);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (rejects(x, z, normalScratch)) continue;
    // Meadows are patchy, not uniform: a low-frequency mask makes drifts.
    const clump = rnd(Math.floor(x * 0.12) * 31.7 + Math.floor(z * 0.12) * 71.3);
    if (clump < 0.45) continue;

    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.rotation.set(0, rnd(i * 2.2) * Math.PI, 0);
    dummy.scale.setScalar(0.8 + rnd(i * 8.8) * 0.5);
    dummy.updateMatrix();
    flowers.setMatrixAt(placed, dummy.matrix);

    const c = PALETTE[Math.floor(rnd(i * 3.7) * PALETTE.length) % PALETTE.length];
    colors[placed * 3] = c.r;
    colors[placed * 3 + 1] = c.g;
    colors[placed * 3 + 2] = c.b;
    fTints[placed] = rnd(i * 1.9);
    fPhases[placed] = rnd(i * 5.5) * Math.PI * 2;
    placed += 1;
  }
  flowers.count = placed;
  flowers.instanceMatrix.needsUpdate = true;
  cross.setAttribute('aTint', new THREE.InstancedBufferAttribute(fTints, 1));
  cross.setAttribute('aPhase', new THREE.InstancedBufferAttribute(fPhases, 1));
  flowers.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  flowers.instanceColor.needsUpdate = true;
  flowers.computeBoundingSphere();
  group.add(flowers);

  return {
    group,
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((child) => {
        if (child instanceof THREE.InstancedMesh) child.dispose();
      });
      group.clear();
    },
  };
}
