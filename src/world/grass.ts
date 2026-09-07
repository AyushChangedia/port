import * as THREE from 'three';
import { places, WORLD_RADIUS } from '../data/world';
import { applySkyShading } from './shaders/skyMaterial';
import { WIND_GLSL, windUniforms } from './shaders/wind';
import { terrainHeight, terrainNormal } from './terrain';

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
const BLADE_WIDTH = 0.035;
/** Grid cells per axis. Small enough to cull usefully, few enough to stay cheap. */
const CELLS = 6;

/** Deterministic, so the meadow is the same on every visit. */
function rnd(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A blade: three quads tapering to a triangular tip. Seven triangles.
 *
 * Built leaning very slightly so a field of them never looks like a bed of
 * nails, and with the taper front-loaded so the silhouette reads as a blade
 * rather than as a spike.
 */
function bladeGeometry(): THREE.BufferGeometry {
  const SEGMENTS = 4;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const y = t * BLADE_HEIGHT;
    const w = i === SEGMENTS ? 0 : BLADE_WIDTH * (1 - t * 0.75);
    positions.push(-w, y, 0, w, y, 0);
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
  if (radius < 13 || radius > WORLD_RADIUS - 1.5) return true;

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

vec4 gustWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
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
vec2 fromPlayer = gustWorld.xz - uPlayer.xz;
float dist = length( fromPlayer );
float press = 1.0 - smoothstep( 0.0, 1.6, dist );
if ( press > 0.0 ) {
  vec2 push = normalize( fromPlayer + vec2( 1e-4 ) ) * press * 0.45 * vAlong;
  transformed.x += push.x;
  transformed.z += push.y;
  transformed.y -= press * 0.12 * vAlong;
}`,
        );

      fragment?.(shader);
    },
  };
}

/** Blade colour: darker at the root, pale toward the tip, varied per blade. */
function bladeColour(shader: THREE.WebGLProgramParametersWithUniforms): void {
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
  vec3 root = mix( vec3( 0.369, 0.561, 0.243 ), vec3( 0.576, 0.761, 0.392 ), vTint );
  diffuseColor.rgb *= mix( root, vec3( 0.765, 0.878, 0.541 ), pow( vAlong, 1.6 ) );
}`,
    );
}

/** TEMPORARY — knobs for bisecting the black screen. See engine.ts. */
export interface GrassOptions {
  blades?: boolean;
  flowers?: boolean;
  /** Override the blade count, to separate a shader fault from sheer volume. */
  count?: number;
}

export function buildGrass(quality: 'high' | 'low', options: GrassOptions = {}): Grass {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const wantBlades = options.blades !== false;
  const wantFlowers = options.flowers !== false;

  const target = options.count ?? (quality === 'high' ? 140000 : 12000);
  const normalScratch = new THREE.Vector3();

  // ── Placement ──────────────────────────────────────────────────────────────
  const blades: Blade[] = [];
  const maxAttempts = wantBlades ? target * 6 : 0;
  for (let i = 0; i < maxAttempts && blades.length < target; i += 1) {
    const a = rnd(i * 1.37) * Math.PI * 2;
    const r = 13 + Math.sqrt(rnd(i * 2.71)) * (WORLD_RADIUS - 15);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (rejects(x, z, normalScratch)) continue;
    blades.push({
      x,
      z,
      scale: 0.7 + rnd(i * 3.3) * 0.7,
      rotY: rnd(i * 5.1) * Math.PI,
      tint: rnd(i * 7.7),
      phase: rnd(i * 9.2) * Math.PI * 2,
    });
  }

  // ── Bucket into a grid so the far half of the meadow can be culled ─────────
  const span = (WORLD_RADIUS * 2) / CELLS;
  const cells: Blade[][] = Array.from({ length: CELLS * CELLS }, () => []);
  for (const blade of blades) {
    const cx = Math.min(CELLS - 1, Math.max(0, Math.floor((blade.x + WORLD_RADIUS) / span)));
    const cz = Math.min(CELLS - 1, Math.max(0, Math.floor((blade.z + WORLD_RADIUS) / span)));
    cells[cz * CELLS + cx].push(blade);
  }

  const bladeMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.4,
    }),
    {
      rimColor: 0xd8f0a8,
      rimStrength: 1.1,
      // Colour comes from the blade shader, not from a map.
      ...windPatch(0.32, 'grass', bladeColour),
    },
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
      dummy.rotation.set(0, b.rotY, 0);
      dummy.scale.set(1, b.scale, 1);
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
    mesh.computeBoundingSphere();
    disposables.push(geometry);
    group.add(mesh);
  }

  // ── Flowers ────────────────────────────────────────────────────────────────
  const flowerCount = wantFlowers ? (quality === 'high' ? 6000 : 700) : 0;
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
  const flowers = new THREE.InstancedMesh(cross, flowerMaterial, Math.max(1, flowerCount));
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
