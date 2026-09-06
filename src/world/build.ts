import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { places, WORLD_RADIUS, type Place } from '../data/world';
import { makeSign } from './labels';
import type { Materials } from './materials';

/**
 * Builds the world.
 *
 * Every structure has a distinct silhouette so you can navigate by landmark
 * rather than by reading — the city of towers is Git City, the row of bars is
 * the backtester, the gate is contact. All of it is box and cylinder geometry,
 * which keeps the whole scene cheap enough to run on a phone.
 */

export interface BuiltWorld {
  root: THREE.Group;
  /** Meshes that can be clicked, each tagged with its place id. */
  targets: THREE.Object3D[];
  /** Ground rings that light up as you approach. */
  markers: Map<string, THREE.Mesh>;
  dispose(): void;
}

const ACCENT = 0xb8391a;

export function buildWorld(quality: 'high' | 'low', materials: Materials): BuiltWorld {
  const root = new THREE.Group();
  const targets: THREE.Object3D[] = [];
  const markers = new Map<string, THREE.Mesh>();
  const disposables: { dispose(): void }[] = [];

  const track = <T extends { dispose(): void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Materials are shared with the scenery layer and disposed by their owner.
  const { stone, stoneLight, accent, glass, metal } = materials;
  const box = track(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = track(new THREE.CylinderGeometry(0.5, 0.5, 1, quality === 'high' ? 20 : 10));

  /** A box placed by its footprint centre, sitting on the ground. */
  const slab = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = stone,
  ) => {
    const mesh = new THREE.Mesh(box, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = quality === 'high';
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const post = (
    parent: THREE.Object3D,
    r: number,
    h: number,
    x: number,
    z: number,
    material: THREE.Material = stone,
  ) => {
    const mesh = new THREE.Mesh(cylinder, material);
    mesh.scale.set(r * 2, h, r * 2);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = quality === 'high';
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ── Ground ───────────────────────────────────────────────────────────────
  const groundGeo = track(new THREE.CircleGeometry(WORLD_RADIUS, 64));
  const ground = new THREE.Mesh(groundGeo, materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // The plaza is polished: a real mirror where the device can afford one, and
  // a glossy floor where it cannot. It is what makes the monument feel like it
  // is standing on something.
  const plazaGeo = track(new THREE.CircleGeometry(11.5, 64));
  if (quality === 'high') {
    const mirror = new Reflector(plazaGeo, {
      // A plaza reflection reads fine at this size and costs a quarter of
      // what a 512 map does.
      textureWidth: 256,
      textureHeight: 256,
      color: 0xb9b4a8,
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = 0.012;
    root.add(mirror);
    disposables.push({ dispose: () => mirror.dispose() });
  } else {
    const plazaMat = track(new THREE.MeshStandardMaterial({
      color: 0xc4bfb3, roughness: 0.16, metalness: 0.55, envMapIntensity: 1.4,
    }));
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.012;
    root.add(plaza);
  }


  // A low wall so the edge of the world reads as deliberate.
  const rimGeo = track(new THREE.TorusGeometry(WORLD_RADIUS, 0.22, 6, quality === 'high' ? 96 : 48));
  const rim = new THREE.Mesh(rimGeo, metal);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.22;
  root.add(rim);

  // Paths from the plaza to each structure. Wayfinding first — an empty
  // ground plane gives you no reason to pick one direction over another.
  const pathMat = track(new THREE.MeshBasicMaterial({ color: 0xc9c3b5, transparent: true, opacity: 0.85 }));
  const pathGeo = track(new THREE.PlaneGeometry(1, 1));
  for (const place of places) {
    if (place.id === 'origin') continue;
    const len = Math.hypot(place.at[0], place.at[1]);
    const path = new THREE.Mesh(pathGeo, pathMat);
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = -Math.atan2(place.at[0], place.at[1]);
    path.scale.set(1.5, len, 1);
    path.position.set(place.at[0] / 2, 0.015, place.at[1] / 2);
    root.add(path);
  }

  // ── Structures ───────────────────────────────────────────────────────────
  const ringGeo = track(new THREE.RingGeometry(0.92, 1, 48));
  const markerMat = () =>
    track(new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));

  for (const place of places) {
    const group = new THREE.Group();
    group.position.set(place.at[0], 0, place.at[1]);
    root.add(group);

    const height = buildStructure(place, group, { slab, post, stone, stoneLight, accent, glass, metal });

    // Ground ring marking where the structure opens.
    const ring = new THREE.Mesh(ringGeo, markerMat());
    ring.scale.setScalar(place.reach);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);
    markers.set(place.id, ring);

    // The sign, held above the structure.
    const sign = makeSign(place.name, place.sub);
    sign.position.set(0, height + 1.0, 0);
    group.add(sign);
    disposables.push({
      dispose: () => {
        const m = sign.material as THREE.SpriteMaterial;
        m.map?.dispose();
        m.dispose();
      },
    });

    // Everything in the group is clickable, and carries its place id.
    group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
        child.userData.placeId = place.id;
        targets.push(child);
      }
    });
  }

  return {
    root,
    targets,
    markers,
    dispose() {
      for (const item of disposables) item.dispose();
      root.clear();
    },
  };
}

interface Kit {
  slab: (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m?: THREE.Material) => THREE.Mesh;
  post: (p: THREE.Object3D, r: number, h: number, x: number, z: number, m?: THREE.Material) => THREE.Mesh;
  stone: THREE.Material;
  stoneLight: THREE.Material;
  accent: THREE.Material;
  glass: THREE.Material;
  metal: THREE.Material;
}

/** Returns the height of the structure, so the sign can sit above it. */
function buildStructure(place: Place, g: THREE.Group, kit: Kit): number {
  const { slab, post, stone, stoneLight, accent, glass, metal } = kit;

  switch (place.id) {
    // The arrival monument: a tall split slab, the name between its halves.
    case 'origin': {
      slab(g, 0.9, 6, 0.9, -1.4, 0, 0, stone);
      slab(g, 0.9, 6, 0.9, 1.4, 0, 0, stone);
      slab(g, 3.7, 0.5, 0.9, 0, 6, 0, accent);
      slab(g, 5.5, 0.18, 5.5, 0, 0, 0, stoneLight);
      // A glass pane spanning the piers, so the monument catches the sky.
      slab(g, 2.0, 4.6, 0.16, 0, 0.9, 0, glass);
      return 6.5;
    }

    // About: an open arch you can see the rest of the world through.
    case 'about': {
      post(g, 0.55, 5, -2, 0, stone);
      post(g, 0.55, 5, 2, 0, stone);
      slab(g, 5.1, 0.7, 1.1, 0, 5, 0, stone);
      slab(g, 1.4, 0.14, 1.4, 0, 5.7, 0, accent);
      slab(g, 3.2, 3.4, 0.14, 0, 0.9, 0, glass);
      return 5.7;
    }

    // Experience: three stacked slabs, one per internship, stepping upward.
    case 'record': {
      slab(g, 5, 1.1, 3, 0, 0, 0, stone);
      slab(g, 4, 1.1, 2.6, 0.5, 1.1, 0, stoneLight);
      slab(g, 3, 1.1, 2.2, 1, 2.2, 0, stone);
      slab(g, 0.25, 3.3, 0.25, -2.2, 0, 1.2, accent);
      return 3.3;
    }

    // ORB Backtester: a row of bars stepping up out of a marked range box.
    case 'orb': {
      const heights = [1.2, 0.9, 1.4, 1.1, 2.2, 3.1, 3.8, 4.6, 5.2];
      heights.forEach((h, i) => {
        const x = -4 + i * 1;
        slab(g, 0.6, h, 0.6, x, 0, 0, i < 4 ? stoneLight : stone);
      });
      // The opening range the whole strategy is defined against.
      slab(g, 4.2, 0.12, 0.12, -2.5, 1.6, 0.5, accent);
      slab(g, 4.2, 0.12, 0.12, -2.5, 0.7, 0.5, accent);
      return 5.2;
    }

    // Git City: a small city of towers. The project, literally.
    case 'git-city': {
      let tallest = 0;
      for (let x = -2; x <= 2; x += 1) {
        for (let z = -2; z <= 2; z += 1) {
          if ((x + z) % 3 === 0 && (x !== 0 || z !== 0)) continue; // streets
          const h = 1 + ((Math.abs(x * 7 + z * 13) % 9) / 9) * 4.5;
          const glazed = (x * 3 + z * 5 + 9) % 3 === 0;
          slab(g, 0.78, h, 0.78, x * 1.15, 0, z * 1.15, glazed ? glass : stone);
          if (!glazed) slab(g, 0.84, 0.1, 0.84, x * 1.15, h, z * 1.15, stoneLight);
          tallest = Math.max(tallest, h);
        }
      }
      slab(g, 0.2, 0.2, 0.2, 0, tallest + 0.4, 0, accent);
      return tallest + 0.8;
    }

    // Résumé Roaster: a leaning page, with lines struck through it.
    case 'resume-roaster': {
      const page = slab(g, 3.4, 4.6, 0.3, 0, 0, 0, glass);
      page.rotation.z = -0.14;
      page.position.y = 2.4;
      for (let i = 0; i < 4; i += 1) {
        const line = slab(g, 2.2 - i * 0.3, 0.16, 0.1, -0.2, 0, 0.22, i === 1 ? accent : stoneLight);
        line.rotation.z = -0.14;
        line.position.y = 3.5 - i * 0.65;
      }
      post(g, 0.4, 0.4, 0, 0, stoneLight);
      return 4.9;
    }

    // Commerce API: nodes joined by beams — a request crossing the surface.
    case 'commerce-api': {
      const nodes: [number, number, number][] = [
        [-3, 2.2, 0], [0, 3.4, -1.4], [0, 3.4, 1.4], [3, 2.6, 0],
      ];
      for (const [x, h, z] of nodes) post(g, 0.42, h, x, z, stone);
      slab(g, 6.4, 0.16, 0.16, 0, 2.1, 0, accent);
      slab(g, 0.16, 0.16, 3, 0, 3.3, 0, metal);
      post(g, 0.75, 0.5, -3, 0, accent); // the authenticated entry point
      return 3.9;
    }

    // Toolkit: a field of posts at different heights, one per technology.
    case 'skills': {
      let tallest = 0;
      for (let i = 0; i < 22; i += 1) {
        const a = i * 2.399963;
        const r = 0.7 + Math.sqrt(i / 22) * 3.4;
        const h = 1 + ((i * 37) % 11) / 11 * 3.4;
        post(g, 0.19, h, Math.cos(a) * r, Math.sin(a) * r, i % 5 === 0 ? accent : i % 3 === 0 ? glass : metal);
        tallest = Math.max(tallest, h);
      }
      return tallest + 0.6;
    }

    // Contact: a gate. The one structure that reads as a way out.
    case 'contact': {
      post(g, 0.5, 5.2, -2.4, 0, stone);
      post(g, 0.5, 5.2, 2.4, 0, stone);
      slab(g, 5.9, 0.8, 1.2, 0, 5.2, 0, accent);
      slab(g, 3.4, 0.1, 3.4, 0, 0, 0, stoneLight);
      slab(g, 4.2, 4.0, 0.14, 0, 0.9, 0, glass);
      return 6;
    }

    default:
      slab(g, 2, 3, 2, 0, 0, 0, stone);
      return 3;
  }
}
