import * as THREE from 'three';

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

/**
 * Gust strength at a world position, in roughly -1..1.
 *
 * Three travelling waves crossing at different angles, speeds and wavelengths.
 * Not noise: this runs in the vertex stage on every blade in the meadow, and
 * the fbm it replaced was both the most expensive thing in the frame and the
 * one construct that rendered a whole class of GPU black — a fault I could
 * reproduce by elimination but never explain, on hardware I have no access to.
 *
 * The waves are mutually irrational in period, so the field never visibly
 * repeats, and because it varies with position the meadow ripples in bands
 * rather than breathing in unison. That is the part that matters; the rest was
 * expensive detail nobody could see at this scale.
 */
float windField( vec2 world ) {
  float t = mod( uWindTime, 600.0 );
  float a = sin( world.x * 0.13 + world.y * 0.07 + t * 0.9 );
  float b = sin( world.x * -0.05 + world.y * 0.19 + t * 0.61 );
  float c = sin( ( world.x + world.y ) * 0.31 + t * 1.7 );
  return clamp( a * 0.5 + b * 0.36 + c * 0.18, -1.0, 1.0 );
}
`;
