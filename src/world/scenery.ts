import * as THREE from 'three';
import { places } from '../data/world';
import type { Materials } from './materials';
import { CLOUD_Y, islands, onGround, terrainHeight, terrainNormal } from './terrain';

/**
 * Everything in the world that is not a place you can open.
 *
 * A plaza with nine objects on it reads as a test scene. A skyline on the
 * horizon, lamps down the paths, planting and benches make it read as
 * somewhere. None of it is interactive and all of it is instanced, so the
 * whole layer costs a handful of draw calls.
 */

export interface Scenery {
  group: THREE.Group;
  /** Called each frame with elapsed seconds. */
  update(t: number): void;
  dispose(): void;
}

/** Where the visitor arrives. Kept clear so the first view is composed. */
const SPAWN: [number, number] = [0, 6.5];

/** Deterministic noise, so the city looks the same on every visit. */
function rnd(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function buildScenery(materials: Materials, quality: 'high' | 'low'): Scenery {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const box = track(new THREE.BoxGeometry(1, 1, 1));
  const cyl = track(new THREE.CylinderGeometry(0.5, 0.5, 1, quality === 'high' ? 14 : 8));
  const sphere = track(new THREE.SphereGeometry(0.5, quality === 'high' ? 12 : 7, quality === 'high' ? 9 : 5));
  // Faceted rather than smooth: the flat planes catch the rim light along their
  // edges, which is what makes foliage read as stylised instead of as a ball.
  const ico = track(new THREE.IcosahedronGeometry(0.5, quality === 'high' ? 2 : 1));

  const dummy = new THREE.Object3D();
  const UP = new THREE.Vector3(0, 1, 0);
  const surfaceNormal = new THREE.Vector3();

  /** Sit an object on the ground and lie it along the slope. */
  const sitOnGround = (o: THREE.Object3D, x: number, z: number, lift: number, yaw: number) => {
    o.position.set(x, terrainHeight(x, z) + lift, z);
    o.quaternion.setFromUnitVectors(UP, terrainNormal(x, z, surfaceNormal));
    o.rotateY(yaw);
  };

  /** Places `count` instances using a positioning callback. */
  const instance = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    place: (i: number, o: THREE.Object3D) => boolean | void,
    shadows = false,
  ) => {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    let n = 0;
    for (let i = 0; i < count; i += 1) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      if (place(i, dummy) === false) continue;
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadows && quality === 'high';
    mesh.receiveShadow = shadows;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  /** True where nothing should stand: over the drop, or inside a structure. */
  const blocked = (x: number, z: number, clearance: number): boolean => {
    if (!onGround(x, z)) return true;
    for (const p of places) {
      if (Math.hypot(x - p.at[0], z - p.at[1]) < p.solid + clearance) return true;
    }
    return false;
  };

  /** A point somewhere on one of the islands. */
  const onIsland = (i: number, seedA: number, seedB: number): [number, number] => {
    const isl = islands[i % islands.length];
    const a = rnd(seedA) * Math.PI * 2;
    const r = Math.sqrt(rnd(seedB)) * (isl.radius - 1);
    return [isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r];
  };

  // ── The horizon ──────────────────────────────────────────────────────────
  /**
   * Distant land, not a city.
   *
   * This was a ring of two hundred glass towers, and it was the single reason
   * the world read as architectural visualisation rather than the reference:
   * there is no city anywhere in the art direction being matched. What belongs
   * on that horizon is more land — headlands and plateaus rising out of the
   * cloud sea, far enough away that the aerial perspective does most of the
   * work.
   */
  const hillCount = quality === 'high' ? 90 : 46;
  instance(ico, materials.distant, hillCount, (i, o) => {
    const angle = (i / hillCount) * Math.PI * 2 + rnd(i) * 0.06;
    const depth = rnd(i * 3.1);
    const radius = 62 + depth * 210;
    // Wide and low. Tall and narrow reads as towers again.
    const width = 34 + rnd(i * 5.3) * 62;
    const height = 13 + rnd(i * 7.7) * 30 * (0.5 + depth);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Sitting in the cloud sea, so only the headland shows.
    o.position.set(x, CLOUD_Y - height * 0.34, z);
    o.scale.set(width, height, width * (0.7 + rnd(i * 2.2) * 0.7));
    o.rotation.set(rnd(i * 1.7) * 0.2, rnd(i * 9.4) * Math.PI, rnd(i * 4.4) * 0.2);
  });

  // A few flat-topped plateaus among them, for silhouettes that are not all
  // the same rounded shape.
  const mesaCount = quality === 'high' ? 26 : 12;
  instance(box, materials.distant, mesaCount, (i, o) => {
    const angle = rnd(i * 2.6) * Math.PI * 2;
    const depth = rnd(i * 4.4);
    const radius = 86 + depth * 190;
    const height = 16 + rnd(i * 8.1) * 26;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    o.position.set(x, CLOUD_Y - height * 0.22, z);
    o.scale.set(26 + rnd(i) * 46, height, 22 + rnd(i * 1.3) * 40);
    o.rotation.y = rnd(i * 3.3) * Math.PI;
  });

  // ── Lamps ────────────────────────────────────────────────────────────────
  // Ringed around each island's structure now that there are no paths to line.
  const lampPositions: [number, number][] = [];
  for (const isl of islands) {
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + isl.radius;
      const r = isl.radius - 1.6;
      const x = isl.x + Math.cos(a) * r;
      const z = isl.z + Math.sin(a) * r;
      if (!blocked(x, z, 1.2)) lampPositions.push([x, z]);
    }
  }

  instance(cyl, materials.metal, lampPositions.length, (i, o) => {
    const [x, z] = lampPositions[i];
    o.position.set(x, terrainHeight(x, z) + 1.6, z);
    o.scale.set(0.1, 3.2, 0.1);
  }, true);

  // The lamp heads, which catch the sun and read as points of light.
  instance(sphere, materials.metal, lampPositions.length, (i, o) => {
    const [x, z] = lampPositions[i];
    o.position.set(x, terrainHeight(x, z) + 3.32, z);
    o.scale.setScalar(0.26);
  });

  // ── Planting ─────────────────────────────────────────────────────────────
  // Sparse: the islands are a few metres across, and at the old count and
  // scale they were a closed canopy with the world hidden underneath.
  const treeSpots: [number, number, number][] = [];
  for (let i = 0; i < 64; i += 1) {
    const [x, z] = onIsland(i, i * 1.7, i * 3.3);
    if (blocked(x, z, 3.2)) continue;
    treeSpots.push([x, z, i]);
  }

  // Trunks stay vertical whatever the slope — trees grow up, not perpendicular
  // to the hill they are on.
  instance(cyl, materials.stone, treeSpots.length, (i, o) => {
    const [x, z] = treeSpots[i];
    o.position.set(x, terrainHeight(x, z) + 0.75, z);
    o.scale.set(0.16, 1.5, 0.16);
  }, true);

  /**
   * Canopies: three squashed lobes per tree rather than one sphere.
   *
   * A sphere on a cylinder is the most recognisably default thing in a three.js
   * scene, and no amount of lighting hides it. Three overlapping lobes at
   * different heights give a silhouette that breaks up against the sky.
   */
  const LOBE_LIFT = [0, 0.42, 0.76];
  const LOBE_SCALE = [1, 0.78, 0.6];
  instance(ico, materials.foliage, treeSpots.length * 3, (i, o) => {
    const lobe = i % 3;
    const [x, z, seed] = treeSpots[(i - lobe) / 3];
    const s = 0.85 + rnd(seed * 6.1) * 0.7;
    const a = lobe * 2.0944 + rnd(seed * 1.7) * Math.PI * 2;
    const radial = 0.34 * s;
    const f = LOBE_SCALE[lobe];
    o.position.set(
      x + Math.cos(a) * radial,
      terrainHeight(x, z) + 1.5 + LOBE_LIFT[lobe] * s,
      z + Math.sin(a) * radial,
    );
    o.rotation.set(rnd(seed + lobe) * 0.6, a, rnd(seed - lobe) * 0.5);
    o.scale.set(s * f, s * f * 0.72, s * f);
  }, true);

  // ── Benches and planters around the plaza ────────────────────────────────
  instance(box, materials.stoneLight, 30, (i, o) => {
    const [x, z] = onIsland(i, i * 2.3, i * 4.7);
    const angle = Math.atan2(z, x);
    if (Math.hypot(x - SPAWN[0], z - SPAWN[1]) < 6) return false;
    if (blocked(x, z, 1.5)) return false;
    sitOnGround(o, x, z, 0.28, -angle);
    o.scale.set(2.6, 0.55, 0.8);
  }, true);

  // Low scattered blocks: something to walk between, and a sense of scale.
  instance(box, materials.stoneLight, 60, (i, o) => {
    const [x, z] = onIsland(i, i * 2.9, i * 5.7);
    if (blocked(x, z, 2)) return false;
    const h = 0.35 + rnd(i * 8.3) * 0.7;
    sitOnGround(o, x, z, h / 2, rnd(i * 4.1) * Math.PI);
    o.scale.set(1 + rnd(i) * 1.6, h, 1 + rnd(i * 1.9) * 1.6);
  }, true);

  // ── Birds ────────────────────────────────────────────────────────────────
  // Small, high, and always moving. They cost almost nothing and they are the
  // difference between a model and a place.
  const birdCount = quality === 'high' ? 26 : 12;
  const birds = new THREE.InstancedMesh(box, materials.stone, birdCount);
  birds.frustumCulled = false;
  group.add(birds);

  const update = (t: number) => {
    for (let i = 0; i < birdCount; i += 1) {
      const speed = 0.06 + rnd(i * 2.3) * 0.05;
      const radius = 18 + rnd(i * 5.1) * 26;
      const angle = t * speed + rnd(i) * Math.PI * 2;
      const y = 16 + rnd(i * 3.7) * 14 + Math.sin(t * 0.7 + i) * 1.4;
      dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      dummy.rotation.set(0, -angle, Math.sin(t * 6 + i) * 0.5);
      dummy.scale.set(0.5, 0.06, 0.14);
      dummy.updateMatrix();
      birds.setMatrixAt(i, dummy.matrix);
    }
    birds.instanceMatrix.needsUpdate = true;
  };
  update(0);

  return {
    group,
    update,
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((child) => {
        if (child instanceof THREE.InstancedMesh) child.dispose();
      });
      group.clear();
    },
  };
}
