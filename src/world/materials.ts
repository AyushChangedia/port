import * as THREE from 'three';

/**
 * The material set.
 *
 * Everything is physically based so the environment map actually shows up:
 * polished stone picks up the sky, metal picks up its surroundings, and glass
 * reflects the world around it. Created once and shared by every mesh.
 */
export interface Materials {
  stone: THREE.MeshStandardMaterial;
  stoneLight: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  /** Reflective glazing. Real transmission on capable devices. */
  glass: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  /** Cheaper glass for the hundreds of distant towers. */
  glassFar: THREE.MeshStandardMaterial;
  ground: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createMaterials(quality: 'high' | 'low'): Materials {
  const stone = new THREE.MeshStandardMaterial({
    color: 0x2a2a31,
    roughness: 0.58,
    metalness: 0.18,
    envMapIntensity: 0.9,
  });

  const stoneLight = new THREE.MeshStandardMaterial({
    color: 0x40404a,
    roughness: 0.42,
    metalness: 0.28,
    envMapIntensity: 1.1,
  });

  const accent = new THREE.MeshStandardMaterial({
    color: 0xb8391a,
    roughness: 0.4,
    metalness: 0.12,
    envMapIntensity: 0.9,
  });

  const metal = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    roughness: 0.22,
    metalness: 0.92,
    envMapIntensity: 1.5,
  });

  /**
   * Glazing.
   *
   * Deliberately NOT `transmission` — real refraction forces three to render
   * the scene an extra time every frame, and on this many surfaces that alone
   * halves the frame rate. Clearcoat over a tinted, reflective base gets
   * within a hair of the look for a fraction of the cost.
   */
  const glass: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial =
    quality === 'high'
      ? new THREE.MeshPhysicalMaterial({
          color: 0x8fb0c4,
          roughness: 0.06,
          metalness: 0.28,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          transparent: true,
          opacity: 0.42,
          envMapIntensity: 2,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x93aec0,
          roughness: 0.08,
          metalness: 0.42,
          transparent: true,
          opacity: 0.55,
          envMapIntensity: 1.8,
        });

  // The skyline is opaque on purpose: a few hundred transparent boxes cost
  // depth sorting every frame and buy nothing at that distance. High metalness
  // and low roughness read as glass regardless.
  const glassFar = new THREE.MeshStandardMaterial({
    color: 0xa9c0cf,
    roughness: 0.12,
    metalness: 0.72,
    envMapIntensity: 1.8,
  });

  const ground = new THREE.MeshStandardMaterial({
    color: 0xd8d3c8,
    roughness: 0.88,
    metalness: 0.04,
    envMapIntensity: 0.5,
  });

  const foliage = new THREE.MeshStandardMaterial({
    color: 0x6e7a61,
    roughness: 0.9,
    metalness: 0,
  });

  const all = [stone, stoneLight, accent, metal, glass, glassFar, ground, foliage];

  return {
    stone,
    stoneLight,
    accent,
    metal,
    glass,
    glassFar,
    ground,
    foliage,
    dispose() {
      for (const m of all) m.dispose();
    },
  };
}
