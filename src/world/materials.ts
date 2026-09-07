import * as THREE from 'three';
import { applySkyShading } from './shaders/skyMaterial';

/**
 * The material set.
 *
 * Warm sandstone and aged gold under a cyan sky, rather than the dark grey PBR
 * boxes this started as. Every material goes through `applySkyShading`, so all
 * of them get the fresnel rim, the wrapped diffuse and the sky-coloured aerial
 * perspective; only the rim settings differ per surface.
 *
 * Created once and shared by every mesh in the world.
 */
export interface Materials {
  stone: THREE.MeshStandardMaterial;
  stoneLight: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  /** Reflective glazing. Real clearcoat on capable devices. */
  glass: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;
  /** Cheaper glass for the hundreds of distant towers. */
  glassFar: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createMaterials(quality: 'high' | 'low'): Materials {
  const stone = applySkyShading(
    new THREE.MeshStandardMaterial({
      color: 0xc9b79a,
      roughness: 0.85,
      metalness: 0,
      envMapIntensity: 0.7,
    }),
  );

  const stoneLight = applySkyShading(
    new THREE.MeshStandardMaterial({
      color: 0xe4d6bc,
      roughness: 0.8,
      metalness: 0,
      envMapIntensity: 0.8,
    }),
  );

  // The one hot colour in the palette. A little emissive so it still reads at
  // dusk and so bloom catches its edges.
  const accent = applySkyShading(
    new THREE.MeshStandardMaterial({
      color: 0xe86a3a,
      roughness: 0.5,
      metalness: 0,
      emissive: new THREE.Color(0xe8562a),
      emissiveIntensity: 0.35,
      envMapIntensity: 0.9,
    }),
    { rimColor: 0xffd2a8, rimStrength: 1.2 },
  );

  // Aged gold rather than steel — grey metal is what made this read as a
  // massing model more than any other single material.
  const metal = applySkyShading(
    new THREE.MeshStandardMaterial({
      color: 0xd9b26a,
      roughness: 0.35,
      metalness: 0.85,
      envMapIntensity: 1.4,
    }),
    { rimColor: 0xffe9c4, rimStrength: 1.1 },
  );

  /**
   * Glazing.
   *
   * Still deliberately NOT `transmission` — real refraction forces three to
   * render the scene an extra time every frame, and on this many surfaces that
   * alone halves the frame rate. The strong rim does the work instead: on glass
   * it *is* the glow on the panes.
   */
  const glass: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial = applySkyShading(
    quality === 'high'
      ? new THREE.MeshPhysicalMaterial({
          color: 0xa8d8f0,
          roughness: 0.06,
          metalness: 0.2,
          clearcoat: 1,
          clearcoatRoughness: 0.03,
          transparent: true,
          opacity: 0.35,
          envMapIntensity: 2.2,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xa8d8f0,
          roughness: 0.1,
          metalness: 0.4,
          transparent: true,
          opacity: 0.45,
          envMapIntensity: 1.8,
        }),
    { rimColor: 0xdcf2ff, rimStrength: 1.8, rimPower: 2.2 },
  );

  // The skyline is opaque on purpose: a few hundred transparent boxes cost
  // depth sorting every frame and buy nothing at that distance.
  const glassFar = applySkyShading(
    new THREE.MeshStandardMaterial({
      color: 0xb4d2e8,
      roughness: 0.14,
      metalness: 0.7,
      envMapIntensity: 1.6,
    }),
    { rimColor: 0xdcf2ff, rimStrength: 1.4 },
  );

  const foliage = applySkyShading(
    new THREE.MeshStandardMaterial({
      color: 0x6e9b4e,
      roughness: 0.95,
      metalness: 0,
      envMapIntensity: 0.5,
    }),
    { rimColor: 0xd8f0a8, rimStrength: 1.2 },
  );

  const all = [stone, stoneLight, accent, metal, glass, glassFar, foliage];

  return {
    stone,
    stoneLight,
    accent,
    metal,
    glass,
    glassFar,
    foliage,
    dispose() {
      for (const m of all) m.dispose();
    },
  };
}
