import * as THREE from 'three';
import { placeById } from '../data/world';
import { applySkyShading } from './shaders/skyMaterial';
import { WIND_GLSL, windUniforms } from './shaders/wind';
import { terrainHeight } from './terrain';

/**
 * Bunting.
 *
 * Triangular flags strung between the arch pillars and around the plaza, waving
 * from the *same* wind field as the grass. Sharing the field is the point: when
 * a gust crosses the meadow these snap a moment later, so it reads as weather
 * rather than as two unrelated animations.
 */

export interface Bunting {
  group: THREE.Group;
  dispose(): void;
}

const COLOURS = [0xe86a3a, 0xf2b441, 0xe4d6bc].map((hex) => new THREE.Color(hex));

interface Flag {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

/** A parabola is close enough to a catenary at these spans, and far cheaper. */
function sagPoint(a: THREE.Vector3, b: THREE.Vector3, sag: number, t: number, out: THREE.Vector3) {
  return out.set(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
    a.z + (b.z - a.z) * t,
  );
}

/**
 * Flags along a slack line, plus the cord they hang from.
 *
 * The cord matters more than it sounds: without it the flags read as debris
 * floating in the air rather than as something strung between two posts.
 */
function stringLine(
  a: THREE.Vector3,
  b: THREE.Vector3,
  sag: number,
  count: number,
  cord: number[],
): Flag[] {
  const flags: Flag[] = [];
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();

  // The cord as a polyline, sampled finely enough that the sag looks smooth.
  const CORD_STEPS = Math.max(8, count * 2);
  for (let i = 0; i < CORD_STEPS; i += 1) {
    sagPoint(a, b, sag, i / CORD_STEPS, p);
    sagPoint(a, b, sag, (i + 1) / CORD_STEPS, q);
    cord.push(p.x, p.y, p.z, q.x, q.y, q.z);
  }

  for (let i = 1; i < count; i += 1) {
    sagPoint(a, b, sag, i / count, p);
    flags.push({ x: p.x, y: p.y, z: p.z, yaw, scale: 0.85 + (i % 3) * 0.12 });
  }
  return flags;
}

export function buildBunting(): Bunting {
  const flags: Flag[] = [];
  const cord: number[] = [];

  // Between the pillars of the two arches. Both are built with posts either
  // side of their centre, so the line spans the opening.
  for (const [id, halfSpan, top] of [
    ['about', 2, 5],
    ['contact', 2.4, 5.2],
  ] as const) {
    const place = placeById(id);
    if (!place) continue;
    const [px, pz] = place.at;
    const a = new THREE.Vector3(px - halfSpan, top, pz);
    const b = new THREE.Vector3(px + halfSpan, top, pz);
    flags.push(...stringLine(a, b, 0.5, 9, cord));
  }

  // And a ring around the plaza, strung post to post.
  const RING_R = 13.5;
  const POSTS = 12;
  for (let i = 0; i < POSTS; i += 1) {
    const a0 = (i / POSTS) * Math.PI * 2;
    const a1 = ((i + 1) / POSTS) * Math.PI * 2;
    const x0 = Math.cos(a0) * RING_R;
    const z0 = Math.sin(a0) * RING_R;
    const x1 = Math.cos(a1) * RING_R;
    const z1 = Math.sin(a1) * RING_R;
    // Roughly every 0.6m along the span, so it reads as a continuous run
    // rather than as scattered triangles.
    const span = Math.hypot(x1 - x0, z1 - z0);
    flags.push(...stringLine(
      new THREE.Vector3(x0, terrainHeight(x0, z0) + 3.1, z0),
      new THREE.Vector3(x1, terrainHeight(x1, z1) + 3.1, z1),
      0.35,
      Math.max(4, Math.round(span / 0.6)),
      cord,
    ));
  }

  // A flag: a triangle hanging point-down from the line.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [-0.16, 0, 0, 0.16, 0, 0, 0, -0.34, 0],
    3,
  ));
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();

  const material = applySkyShading(
    new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    {
      rimColor: 0xffe0b8,
      rimStrength: 1.3,
      cacheKey: 'bunting',
      patch: (shader) => {
        Object.assign(shader.uniforms, windUniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
          .replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
{
  vec4 flagWorld = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  float gust = windField( flagWorld.xz ) * uWind;
  // Pinned along the top edge, free at the point: weight by how far down the
  // flag the vertex sits, so it flaps rather than sliding.
  float down = clamp( -transformed.y / 0.34, 0.0, 1.0 );
  transformed.z += gust * down * 0.28;
  transformed.x += sin( uWindTime * 3.4 + flagWorld.x * 0.7 ) * down * 0.06 * uWind;
}`,
          );
      },
    },
  );

  const group = new THREE.Group();

  const cordGeometry = new THREE.BufferGeometry();
  cordGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cord, 3));
  const cordMaterial = new THREE.LineBasicMaterial({ color: 0x8c7a5e });
  group.add(new THREE.LineSegments(cordGeometry, cordMaterial));

  const mesh = new THREE.InstancedMesh(geometry, material, flags.length);
  const dummy = new THREE.Object3D();
  const colors = new Float32Array(flags.length * 3);
  for (let i = 0; i < flags.length; i += 1) {
    const f = flags[i];
    dummy.position.set(f.x, f.y, f.z);
    dummy.rotation.set(0, f.yaw, 0);
    dummy.scale.setScalar(f.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const c = COLOURS[i % COLOURS.length];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  group.add(mesh);

  return {
    group,
    dispose() {
      geometry.dispose();
      material.dispose();
      cordGeometry.dispose();
      cordMaterial.dispose();
      mesh.dispose();
    },
  };
}
