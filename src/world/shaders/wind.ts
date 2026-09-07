import * as THREE from 'three';
import { SKY_NOISE_GLSL } from './skyCommon';

/**
 * One wind field, shared by everything that moves in it.
 *
 * Grass, flowers and bunting all read the same travelling gust rather than
 * each running its own sine. That coherence is the whole point: when a gust
 * crosses the meadow the flags on the far arch snap a moment later, and it
 * reads as weather instead of as three separate animations.
 */

export interface WindUniforms {
  /** Seconds. Held still under reduced motion. */
  uWindTime: THREE.IUniform<number>;
  /** Global multiplier. Zero disables every sway at once. */
  uWind: THREE.IUniform<number>;
  /** Player position, so grass can bend away from your feet. */
  uPlayer: THREE.IUniform<THREE.Vector3>;
}

export const windUniforms: WindUniforms = {
  uWindTime: { value: 0 },
  uWind: { value: 1 },
  uPlayer: { value: new THREE.Vector3(0, 0, 19) },
};

/** Declarations plus the field itself. Include in a vertex shader. */
export const WIND_GLSL = /* glsl */ `
uniform float uWindTime;
uniform float uWind;
uniform vec3 uPlayer;

${SKY_NOISE_GLSL}

/**
 * Gust strength at a world position, in roughly -1..1.
 *
 * Two octaves drifting at different speeds so the field itself travels; a
 * single sine makes the whole meadow breathe in unison, which reads as a
 * shader rather than as wind.
 */
float windField( vec2 world ) {
  float gust = skyFbm( world * 0.06 + vec2( uWindTime * 0.12, uWindTime * 0.07 ) );
  gust += skyFbm( world * 0.017 - vec2( uWindTime * 0.05, uWindTime * 0.031 ) ) * 0.6;
  return ( gust - 0.8 ) * 1.6;
}
`;
