import * as THREE from 'three';
import { places, WORLD_RADIUS } from '../data/world';
import type { Materials } from './materials';
import { terrainHeight, terrainNormal } from './terrain';

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
const SPAWN: [number, number] = [0, 19];

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
  const onGround = (o: THREE.Object3D, x: number, z: number, lift: number, yaw: number) => {
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

  /** True when a point is too close to a place, a path, or the plaza. */
  const blocked = (x: number, z: number, clearance: number): boolean => {
    if (Math.hypot(x, z) < 9) return true; // the plaza stays open
    for (const p of places) {
      if (Math.hypot(x - p.at[0], z - p.at[1]) < p.solid + clearance) return true;
      // Keep the paths from the plaza walkable.
      const len = Math.hypot(p.at[0], p.at[1]);
      const t = Math.max(0, Math.min(1, (x * p.at[0] + z * p.at[1]) / (len * len)));
      if (Math.hypot(x - p.at[0] * t, z - p.at[1] * t) < 2.4) return true;
    }
    return false;
  };

  // ── The skyline ──────────────────────────────────────────────────────────
  // A ring of glass towers just beyond the boundary. It is the single biggest
  // reason the world stops feeling like an empty plane.
  const towerCount = quality === 'high' ? 190 : 90;
  instance(box, materials.glassFar, towerCount, (i, o) => {
    const ring = i / towerCount;
    const angle = ring * Math.PI * 2 + rnd(i) * 0.05;
    const depth = rnd(i * 3.1);
    const radius = WORLD_RADIUS + 8 + depth * 62;
    const h = 8 + rnd(i * 7.7) * 46 * (0.45 + depth);
    const w = 3.5 + rnd(i * 5.3) * 5;
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    // The skyline is out past the drop, so it stands on the low plain and the
    // cloud sea takes its feet.
    o.position.set(tx, terrainHeight(tx, tz) + h / 2, tz);
    o.scale.set(w, h, w * (0.7 + rnd(i * 2.2) * 0.6));
    o.rotation.y = rnd(i * 9.4) * Math.PI;
  });

  // Darker cores behind the glass, so the towers read as buildings rather
  // than as floating panes.
  instance(box, materials.stone, Math.floor(towerCount * 0.55), (i, o) => {
    const ring = (i * 1.81) / towerCount;
    const angle = ring * Math.PI * 2;
    const depth = rnd(i * 4.4);
    const radius = WORLD_RADIUS + 14 + depth * 58;
    const h = 6 + rnd(i * 8.1) * 34 * (0.4 + depth);
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    o.position.set(cx, terrainHeight(cx, cz) + h / 2, cz);
    o.scale.set(3 + rnd(i) * 4, h, 3 + rnd(i * 1.3) * 4);
  });

  // ── Lamps along the paths ────────────────────────────────────────────────
  const lampPositions: [number, number][] = [];
  for (const p of places) {
    if (p.id === 'origin') continue;
    const len = Math.hypot(p.at[0], p.at[1]);
    const steps = Math.max(1, Math.floor(len / 13));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / (steps + 0.7);
      const px = p.at[0] * t;
      const pz = p.at[1] * t;
      // Nothing on the plaza, and nothing on the line you arrive along — a
      // lamp post planted in front of the name sign is the first thing you see.
      if (Math.hypot(px, pz) < 16) continue;
      if (Math.hypot(px - SPAWN[0], pz - SPAWN[1]) < 9) continue;
      if (Math.abs(px) < 2.5 && pz > 0) continue;
      const nx = -p.at[1] / len;
      const nz = p.at[0] / len;
      lampPositions.push([px + nx * 3.1, pz + nz * 3.1]);
      lampPositions.push([px - nx * 3.1, pz - nz * 3.1]);
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
  const treeSpots: [number, number, number][] = [];
  for (let i = 0; i < 150; i += 1) {
    const angle = rnd(i * 1.7) * Math.PI * 2;
    const radius = 15 + Math.sqrt(rnd(i * 3.3)) * (WORLD_RADIUS - 18);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (blocked(x, z, 4)) continue;
    treeSpots.push([x, z, i]);
  }

  // Trunks stay vertical whatever the slope — trees grow up, not perpendicular
  // to the hill they are on.
  instance(cyl, materials.stone, treeSpots.length, (i, o) => {
    const [x, z] = treeSpots[i];
    o.position.set(x, terrainHeight(x, z) + 1.1, z);
    o.scale.set(0.22, 2.2, 0.22);
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
    const s = 1.5 + rnd(seed * 6.1) * 1.3;
    const a = lobe * 2.0944 + rnd(seed * 1.7) * Math.PI * 2;
    const radial = 0.34 * s;
    const f = LOBE_SCALE[lobe];
    o.position.set(
      x + Math.cos(a) * radial,
      terrainHeight(x, z) + 2.15 + LOBE_LIFT[lobe] * s,
      z + Math.sin(a) * radial,
    );
    o.rotation.set(rnd(seed + lobe) * 0.6, a, rnd(seed - lobe) * 0.5);
    o.scale.set(s * f, s * f * 0.72, s * f);
  }, true);

  // ── Benches and planters around the plaza ────────────────────────────────
  instance(box, materials.stoneLight, 22, (i, o) => {
    const angle = (i / 22) * Math.PI * 2 + 0.16;
    const radius = 13.5 + (i % 3) * 1.2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Keep the arrival view clear of street furniture.
    if (Math.hypot(x - SPAWN[0], z - SPAWN[1]) < 9) return false;
    if (blocked(x, z, 1.5) && Math.hypot(x, z) > 9) return false;
    onGround(o, x, z, 0.28, -angle);
    o.scale.set(2.6, 0.55, 0.8);
  }, true);

  // Low scattered blocks: something to walk between, and a sense of scale.
  instance(box, materials.stoneLight, 90, (i, o) => {
    const angle = rnd(i * 2.9) * Math.PI * 2;
    const radius = 12 + Math.sqrt(rnd(i * 5.7)) * (WORLD_RADIUS - 15);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (blocked(x, z, 2)) return false;
    const h = 0.35 + rnd(i * 8.3) * 0.7;
    onGround(o, x, z, h / 2, rnd(i * 4.1) * Math.PI);
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
