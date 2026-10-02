import * as THREE from 'three';
import { SKY_CHUNK, skyUniforms } from './skyCommon';

/**
 * The Sky surface look, patched onto three's standard material.
 *
 * Three things, all of which stock MeshStandardMaterial cannot do:
 *
 *  1. A fresnel rim tinted toward the sky and strongest on the sun-facing side.
 *     This is the single biggest tell of the target art direction.
 *  2. Wrapped diffuse, so the shadow side picks up a warm bounce instead of
 *     falling to black.
 *  3. Aerial perspective — haze that takes the colour of the sky *in the
 *     direction you are looking*, rather than one flat grey. Directional haze
 *     is what creates depth; grey fog is what kills it.
 *
 * Done by patching rather than by a custom ShaderMaterial so that shadows,
 * environment maps, instancing and vertex colours all keep working. That
 * matters: the same patch has to serve the structures, the instanced scenery
 * and (from phase 4) the character.
 */

export interface SkyShadingOptions {
  rimColor?: THREE.ColorRepresentation;
  rimPower?: number;
  rimStrength?: number;
  /**
   * Further patching, applied after the sky shading. Grass, flowers and bunting
   * use it to add wind in the vertex stage while keeping the rim, the wrapped
   * diffuse and the aerial perspective they share with everything else.
   */
  patch?: (shader: THREE.WebGLProgramParametersWithUniforms) => void;
  /**
   * Distinguishes the program when `patch` changes the code. Materials patched
   * differently must not share a compiled program.
   */
  cacheKey?: string;
}

const DEFAULTS = {
  rimColor: 0xbfe4ff,
  rimPower: 2.6,
  rimStrength: 0.9,
};

/**
 * Three's lighting chunk, rewritten so direct *diffuse* uses a wrapped N·L.
 *
 * Only the diffuse term is wrapped. Wrapping the shared `irradiance` would drag
 * the specular highlight around onto the shadow side, which reads as a bug.
 */
function wrappedLightingChunk(): string {
  const source = THREE.ShaderChunk.lights_physical_pars_fragment;

  const irradianceLine = 'vec3 irradiance = dotNL * directLight.color;';
  const diffuseLine =
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );';

  if (!source.includes(irradianceLine) || !source.includes(diffuseLine)) {
    // Three changed its lighting chunk. Fall back to stock shading rather than
    // shipping a silently broken shader.
    return source;
  }

  return source
    .replace(
      irradianceLine,
      `${irradianceLine}
	float skyWrapNdotL = pow( saturate( dot( geometryNormal, directLight.direction ) * 0.5 + 0.5 ), 2.4 );
	vec3 skyWrapIrradiance = skyWrapNdotL * directLight.color;`,
    )
    .replace(
      diffuseLine,
      'reflectedLight.directDiffuse += skyWrapIrradiance * BRDF_Lambert( material.diffuseColor );',
    );
}

/**
 * Patch a standard or physical material in place. Returns the same material so
 * it can wrap a constructor call.
 */
export function applySkyShading<T extends THREE.MeshStandardMaterial>(
  material: T,
  options: SkyShadingOptions = {},
): T {
  const rimColor = options.rimColor ?? DEFAULTS.rimColor;
  const rimPower = options.rimPower ?? DEFAULTS.rimPower;
  const rimStrength = options.rimStrength ?? DEFAULTS.rimStrength;

  material.onBeforeCompile = (shader) => {
    // Shared holders assigned by reference — see skyCommon.ts.
    Object.assign(shader.uniforms, skyUniforms);
    // Rim settings stay per-material: glass and foliage want very different ones.
    shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) };
    shader.uniforms.uRimPower = { value: rimPower };
    shader.uniforms.uRimStrength = { value: rimStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSkyWorldPos;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
// World position, mirroring three's own instancing maths, for aerial perspective.
vec4 skyWorldPos4 = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	skyWorldPos4 = instanceMatrix * skyWorldPos4;
#endif
vSkyWorldPos = ( modelMatrix * skyWorldPos4 ).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vSkyWorldPos;
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimStrength;
${SKY_CHUNK}`,
      )
      // Wrapped diffuse.
      .replace('#include <lights_physical_pars_fragment>', wrappedLightingChunk())
      // Rim light, added before three packs outgoingLight into gl_FragColor.
      .replace(
        '#include <opaque_fragment>',
        `{
	// Three lights in view space, so the sun direction arrives pre-transformed.
	vec3 skyN = normalize( normal );
	vec3 skyV = normalize( vViewPosition );
	float skyRim = pow( 1.0 - saturate( dot( skyN, skyV ) ), uRimPower ) * uRimStrength;
	skyRim *= 0.35 + 0.65 * saturate( dot( skyN, uSunDirView ) );
	outgoingLight += uRimColor * skyRim;
}
#include <opaque_fragment>`,
      )
      // Aerial perspective, replacing three's linear fog outright.
      .replace(
        '#include <fog_fragment>',
        `{
	vec3 skyToFrag = vSkyWorldPos - cameraPosition;
	float skyDist = length( skyToFrag );
	float skyFogAmount = 1.0 - exp( - uFogDensity * uFogDensity * skyDist * skyDist );
	vec3 skyHaze = skyGradient( normalize( skyToFrag ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, skyHaze, clamp( skyFogAmount, 0.0, 1.0 ) );
}`,
      );

    options.patch?.(shader);
  };

  // Patched materials produce different code from stock ones, and three's
  // default cache key cannot see that. Materials sharing a variant share a
  // program; a different `patch` must declare a different key.
  const key = `sky-shading-v1${options.cacheKey ? `:${options.cacheKey}` : ''}`;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return material;
}
