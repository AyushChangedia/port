import * as THREE from 'three';

/**
 * The one source of truth for the sky.
 *
 * Both the sky dome (sky.ts) and every surface in the world (skyMaterial.ts)
 * need the same gradient function, the same noise, and the same sun direction —
 * the aerial-perspective fog only reads as depth if the haze a surface fades
 * into is *exactly* the sky behind it. So the GLSL lives here as shared chunks,
 * and the uniforms live here as one object whose `{ value }` holders are
 * assigned by reference into every material. One write per frame updates all of
 * them.
 */

export interface SkyUniforms {
  uTime: THREE.IUniform<number>;
  /** Sun direction in world space, normalised. */
  uSunDir: THREE.IUniform<THREE.Vector3>;
  /**
   * The same direction in view space. Three lights fragments in view space, so
   * the rim term needs the sun there; recomputed once per frame from the camera.
   */
  uSunDirView: THREE.IUniform<THREE.Vector3>;
  uSkyZenith: THREE.IUniform<THREE.Color>;
  uSkyUpper: THREE.IUniform<THREE.Color>;
  uSkyHorizon: THREE.IUniform<THREE.Color>;
  uSkyHaze: THREE.IUniform<THREE.Color>;
  uSkyGround: THREE.IUniform<THREE.Color>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uCloudDark: THREE.IUniform<THREE.Color>;
  uCloudLit: THREE.IUniform<THREE.Color>;
  uCloudCover: THREE.IUniform<number>;
  uSeaColor: THREE.IUniform<THREE.Color>;
  uFogDensity: THREE.IUniform<number>;
}

/** A complete look: the palette, the sun, and how thick the air is. */
export interface SkyPreset {
  zenith: number;
  upper: number;
  horizon: number;
  haze: number;
  ground: number;
  sun: number;
  cloudDark: number;
  cloudLit: number;
  cloudCover: number;
  sea: number;
  fogDensity: number;
  /** Not normalised — `setTimeOfDay` does that. */
  sunDir: [number, number, number];
}

/** Midday, from refs/sky-02.png: deep cyan zenith over a warm white horizon. */
export const DAY: SkyPreset = {
  zenith: 0x2e7fd4,
  upper: 0x6fb2e8,
  horizon: 0xe8f2f6,
  haze: 0xfff0dc,
  ground: 0xc9dce6,
  sun: 0xfff6e2,
  cloudDark: 0x7e9ec2,
  cloudLit: 0xfffaf0,
  cloudCover: 0.44,
  sea: 0xf4f8fb,
  fogDensity: 0.0042,
  sunDir: [22, 34, 14],
};

/** Dusk, from refs/sky-01.png: violet zenith, pink horizon, low warm sun. */
export const DUSK: SkyPreset = {
  zenith: 0x8b5e8e,
  upper: 0xc9819c,
  horizon: 0xf2a0a8,
  haze: 0xffd2b0,
  ground: 0xa8879c,
  sun: 0xffd9a8,
  cloudDark: 0x8e6a86,
  cloudLit: 0xffd8bc,
  cloudCover: 0.44,
  sea: 0xf6d9d2,
  fogDensity: 0.0056,
  sunDir: [30, 6.5, 17],
};

/**
 * The shared uniform object. Module scope on purpose: there is exactly one
 * world at a time, and every patched material has to point at these same
 * holders for a single per-frame write to reach all of them.
 */
export const skyUniforms: SkyUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(...DAY.sunDir).normalize() },
  uSunDirView: { value: new THREE.Vector3(...DAY.sunDir).normalize() },
  uSkyZenith: { value: new THREE.Color(DAY.zenith) },
  uSkyUpper: { value: new THREE.Color(DAY.upper) },
  uSkyHorizon: { value: new THREE.Color(DAY.horizon) },
  uSkyHaze: { value: new THREE.Color(DAY.haze) },
  uSkyGround: { value: new THREE.Color(DAY.ground) },
  uSunColor: { value: new THREE.Color(DAY.sun) },
  uCloudDark: { value: new THREE.Color(DAY.cloudDark) },
  uCloudLit: { value: new THREE.Color(DAY.cloudLit) },
  uCloudCover: { value: DAY.cloudCover },
  uSeaColor: { value: new THREE.Color(DAY.sea) },
  uFogDensity: { value: DAY.fogDensity },
};

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();
const scratchDirA = new THREE.Vector3();
const scratchDirB = new THREE.Vector3();

function lerpColor(target: THREE.Color, from: number, to: number, t: number): void {
  scratchA.setHex(from, THREE.SRGBColorSpace);
  scratchB.setHex(to, THREE.SRGBColorSpace);
  target.copy(scratchA).lerp(scratchB, t);
}

/**
 * Blend the whole look between two presets. `t` is 0 at `from`, 1 at `to`.
 *
 * Everything moves together — palette, sun colour, sun direction, cloud tint
 * and air density — because a half-applied time of day looks like a bug.
 */
export function applyTimeOfDay(t: number, from: SkyPreset = DAY, to: SkyPreset = DUSK): void {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  lerpColor(skyUniforms.uSkyZenith.value, from.zenith, to.zenith, k);
  lerpColor(skyUniforms.uSkyUpper.value, from.upper, to.upper, k);
  lerpColor(skyUniforms.uSkyHorizon.value, from.horizon, to.horizon, k);
  lerpColor(skyUniforms.uSkyHaze.value, from.haze, to.haze, k);
  lerpColor(skyUniforms.uSkyGround.value, from.ground, to.ground, k);
  lerpColor(skyUniforms.uSunColor.value, from.sun, to.sun, k);
  lerpColor(skyUniforms.uCloudDark.value, from.cloudDark, to.cloudDark, k);
  lerpColor(skyUniforms.uCloudLit.value, from.cloudLit, to.cloudLit, k);
  lerpColor(skyUniforms.uSeaColor.value, from.sea, to.sea, k);
  skyUniforms.uCloudCover.value = THREE.MathUtils.lerp(from.cloudCover, to.cloudCover, k);
  skyUniforms.uFogDensity.value = THREE.MathUtils.lerp(from.fogDensity, to.fogDensity, k);

  scratchDirA.set(...from.sunDir).normalize();
  scratchDirB.set(...to.sunDir).normalize();
  skyUniforms.uSunDir.value.copy(scratchDirA).lerp(scratchDirB, k).normalize();
}

/**
 * Uniform declarations, shared verbatim by the dome and by every patched
 * surface so the two can never drift apart.
 */
export const SKY_UNIFORMS_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunDirView;
uniform vec3 uSkyZenith;
uniform vec3 uSkyUpper;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyHaze;
uniform vec3 uSkyGround;
uniform vec3 uSunColor;
uniform vec3 uCloudDark;
uniform vec3 uCloudLit;
uniform float uCloudCover;
uniform vec3 uSeaColor;
uniform float uFogDensity;
`;

/**
 * Hash-based value noise and a five-octave fbm, written for this project.
 *
 * Value noise rather than gradient noise on purpose: clouds want soft blobby
 * coverage, not the directional streaking simplex gives, and it is a third of
 * the arithmetic per sample.
 */
export const SKY_NOISE_GLSL = /* glsl */ `
float skyHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}

float skyValueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = skyHash( i );
  float b = skyHash( i + vec2( 1.0, 0.0 ) );
  float c = skyHash( i + vec2( 0.0, 1.0 ) );
  float d = skyHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float skyFbm( vec2 p ) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rot = mat2( 1.6, 1.2, -1.2, 1.6 );
  for ( int i = 0; i < 5; i ++ ) {
    value += amplitude * skyValueNoise( p );
    p = rot * p;
    amplitude *= 0.5;
  }
  return value;
}
`;

/**
 * The five-stop gradient, as overlapping smoothstep bands rather than one mix.
 *
 * Bands are what give the horizon its own colour instead of it being the
 * midpoint of zenith and ground — that warm white line under a saturated sky is
 * most of what reads as "Sky".
 */
export const SKY_GRADIENT_GLSL = /* glsl */ `
vec3 skyGradient( vec3 dir ) {
  float h = dir.y;
  vec3 c = uSkyGround;
  c = mix( c, uSkyHaze,    smoothstep( -0.14,  -0.005, h ) );
  c = mix( c, uSkyHorizon, smoothstep( -0.025,  0.045, h ) );
  c = mix( c, uSkyUpper,   smoothstep(  0.030,  0.300, h ) );
  c = mix( c, uSkyZenith,  smoothstep(  0.220,  0.850, h ) );
  return c;
}
`;

/** Everything a shader needs to talk about the sky, in one include. */
export const SKY_CHUNK = SKY_UNIFORMS_GLSL + SKY_NOISE_GLSL + SKY_GRADIENT_GLSL;
