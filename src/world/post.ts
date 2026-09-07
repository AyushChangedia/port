import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  Effect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';

/**
 * The post-processing chain.
 *
 * One merged fullscreen pass via pmndrs `postprocessing`, not
 * three/examples/jsm/postprocessing — the latter costs a separate fullscreen
 * pass per effect, and at 1440p that difference is most of the frame budget.
 *
 * Colour pipeline: the scene renders into a half-float buffer in *linear*
 * space with the renderer's own tone mapping switched off, so bloom and god
 * rays operate on real HDR values (the sun disc is deliberately far above 1.0).
 * Exposure, ACES and the look grade all happen once, at the end, in `GradeEffect`.
 */

export interface Post {
  render(dt: number): void;
  resize(): void;
  /** Focus distance in world metres. Ignored when there is no depth of field. */
  setFocus(distance: number): void;
  dispose(): void;
}

/**
 * Exposure, ACES tone mapping and the warm filmic grade, in one shader.
 *
 * Deliberately not `ToneMappingEffect` + a separate grade: that effect exposes
 * no exposure control for ACES, and splitting the two means two dependent
 * fullscreen operations where one will do.
 */
class GradeEffect extends Effect {
  constructor(exposure: number) {
    super(
      'SkyGradeEffect',
      /* glsl */ `
      uniform float uExposure;
      uniform vec3 uShadowTint;
      uniform vec3 uHighlightTint;
      uniform float uSaturation;
      uniform float uVignette;

      // Narkowicz's ACES fit: close enough to the full RRT/ODT at a fraction
      // of the cost, and it is what gives highlights their filmic roll-off
      // instead of clipping to flat white.
      vec3 aces( vec3 x ) {
        const float a = 2.51;
        const float b = 0.03;
        const float c = 2.43;
        const float d = 0.59;
        const float e = 0.14;
        return clamp( ( x * ( a * x + b ) ) / ( x * ( c * x + d ) + e ), 0.0, 1.0 );
      }

      void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
        vec3 color = aces( inputColor.rgb * uExposure );

        // Lift the shadows toward cool blue and pull the highlights warm. This
        // split is most of what reads as "graded" rather than "rendered".
        float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
        color += uShadowTint * ( 1.0 - smoothstep( 0.0, 0.45, luma ) ) * 0.04;
        color = mix( color, color * uHighlightTint, smoothstep( 0.55, 1.0, luma ) * 0.5 );

        color = mix( vec3( luma ), color, uSaturation );

        vec2 v = uv - 0.5;
        color *= 1.0 - dot( v, v ) * uVignette * 1.6;

        outputColor = vec4( clamp( color, 0.0, 1.0 ), inputColor.a );
      }
      `,
      {
        blendFunction: BlendFunction.SET,
        uniforms: new Map<string, THREE.Uniform>([
          ['uExposure', new THREE.Uniform(exposure)],
          ['uShadowTint', new THREE.Uniform(new THREE.Color(0x1a2b45))],
          ['uHighlightTint', new THREE.Uniform(new THREE.Color(0xffe9c4))],
          ['uSaturation', new THREE.Uniform(1.12)],
          ['uVignette', new THREE.Uniform(0.28)],
        ]),
      },
    );
  }
}

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  sunMesh: THREE.Mesh,
  quality: 'high' | 'low',
  exposure: number,
): Post {
  // Half-float buffers are what make the HDR sun and the bloom threshold mean
  // anything; in an 8-bit buffer everything above 1.0 is already clipped.
  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: 0,
  });

  composer.addPass(new RenderPass(scene, camera));

  const bloom = new BloomEffect({
    // Threshold is in LINEAR light, not display values. The horizon band of the
    // sky sits around 0.87 linear luminance, so anything below ~1.0 blooms the
    // entire sky and turns the frame milky. Above 1.0 only what is genuinely
    // emissive gets through: the sun core, the accent material, hot specular.
    luminanceThreshold: 1.05,
    luminanceSmoothing: 0.3,
    intensity: 1.1,
    mipmapBlur: true,
    radius: 0.72,
  });

  const grade = new GradeEffect(exposure);

  let dof: DepthOfFieldEffect | null = null;

  if (quality === 'high') {
    const godRays = new GodRaysEffect(camera, sunMesh, {
      density: 0.94,
      decay: 0.93,
      weight: 0.5,
      samples: 60,
      blur: true,
    });

    dof = new DepthOfFieldEffect(camera, {
      focusDistance: 20,
      // World metres, not the old normalised units, and deliberately wide: this
      // should read as distance softness. A tight range puts the ground at your
      // feet and the structure in front of you both out of focus at once, which
      // reads as a broken lens rather than as depth.
      focusRange: 28,
      bokehScale: 1.5,
      resolutionScale: 0.5,
    });

    const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });
    composer.addPass(new EffectPass(camera, godRays, dof, bloom, grade, smaa));
  } else {
    // Bloom and the grade only. SMAA still runs — it is a cheap fullscreen step
    // and it is the only antialiasing available once a composer owns the frame.
    const smaa = new SMAAEffect({ preset: SMAAPreset.LOW });
    composer.addPass(new EffectPass(camera, bloom, grade, smaa));
  }

  const setSize = (): void => {
    composer.setSize(window.innerWidth, window.innerHeight, false);
  };
  setSize();

  return {
    render(dt: number) {
      composer.render(dt);
    },
    resize: setSize,
    setFocus(distance: number) {
      if (!dof) return;
      dof.cocMaterial.focusDistance = distance;
    },
    dispose() {
      composer.dispose();
    },
  };
}
