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
 * Value noise, written narrow on purpose.
 *
 * This runs in the *vertex* stage on hundreds of thousands of blades. The
 * hash below ends in fract(), which only behaves while its input stays small,
 * and an fbm doubles its coordinate every octave — so the domain is wrapped
 * before use and the octave count is kept low. Three is enough for wind.
 */
float windHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float windNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = windHash( i );
  float b = windHash( i + vec2( 1.0, 0.0 ) );
  float c = windHash( i + vec2( 0.0, 1.0 ) );
  float d = windHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float windFbm( vec2 p ) {
  // Wrapped, so neither a far-flung world position nor a long-running clock
  // can push the hash into the range where fract() stops being meaningful.
  p = mod( p, 256.0 );
  float value = 0.0;
  float amplitude = 0.5;
  for ( int i = 0; i < 3; i ++ ) {
    value += amplitude * windNoise( p );
    p = mod( p * 2.03, 256.0 );
    amplitude *= 0.5;
  }
  return value;
}

/**
 * Gust strength at a world position, in -1..1.
 *
 * Two layers drifting at different speeds so the field itself travels; a
 * single sine makes the whole meadow breathe in unison, which reads as a
 * shader rather than as wind. The result is clamped: everything downstream
 * displaces geometry, so one bad value must not be able to throw a blade
 * across the world.
 */
float windField( vec2 world ) {
  float t = mod( uWindTime, 600.0 );
  float gust = windFbm( world * 0.06 + vec2( t * 0.12, t * 0.07 ) );
  gust += windFbm( world * 0.017 - vec2( t * 0.05, t * 0.031 ) ) * 0.6;
  return clamp( ( gust - 0.55 ) * 2.0, -1.0, 1.0 );
}
`;
