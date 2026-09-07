import * as THREE from 'three';
import { SKY_NOISE_GLSL } from './shaders/skyCommon';
import { windUniforms } from './shaders/wind';

/**
 * The plaza pool.
 *
 * A mirror with a surface on top of it, rather than one shader trying to be
 * both. The Reflector underneath does what it is good at; this layer adds the
 * ripples, the fresnel tint, the shoreline glow and the caustics, and gets out
 * of the way at grazing angles so the reflection comes through.
 *
 * Looking down you see teal water; looking across you see the sky in it. That
 * shift is most of what makes water read as water.
 */

export interface Water {
  mesh: THREE.Mesh;
  /** Elapsed seconds; held still under reduced motion. */
  update(t: number): void;
  dispose(): void;
}

export function buildWater(radius: number): Water {
  const geometry = new THREE.CircleGeometry(radius, 96);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uWind: windUniforms.uWind,
      uRadius: { value: radius },
      uDeep: { value: new THREE.Color(0x4fa8c8) },
      uShore: { value: new THREE.Color(0x8fe3ff) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      varying vec3 vWorld;
      varying vec3 vToEye;

      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        // A gentle swell, a couple of centimetres. Enough that the surface is
        // never dead flat; small enough never to break the plaza edge.
        world.y += sin( uTime * 0.6 + world.x * 0.35 ) * 0.02 * uWind;
        vWorld = world.xyz;
        vToEye = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uRadius;
      uniform vec3 uDeep;
      uniform vec3 uShore;
      varying vec3 vWorld;
      varying vec3 vToEye;

      ${SKY_NOISE_GLSL}

      void main() {
        vec2 p = vWorld.xz;

        // Two ripple fields scrolling against each other. Taking the derivative
        // of the noise rather than the noise itself gives lines with crests,
        // which is what a water surface actually shows.
        float a = skyFbm( p * 0.85 + vec2( uTime * 0.05, uTime * 0.03 ) );
        float b = skyFbm( p * 1.7 - vec2( uTime * 0.031, uTime * 0.052 ) );
        float ripple = ( a - b );

        // Grazing angles go to mirror, straight down goes to teal.
        float fres = pow( 1.0 - clamp( normalize( vToEye ).y, 0.0, 1.0 ), 3.0 );

        vec3 col = uDeep;

        // Thin bright caustic lines, where the two fields nearly cancel.
        float caustic = smoothstep( 0.015, 0.0, abs( ripple ) );
        col += uShore * caustic * 0.5;

        // A soft glow around the rim, where the water is shallow.
        float edge = 1.0 - smoothstep( uRadius - 1.6, uRadius, length( p ) );
        col = mix( col + uShore * 0.55, col, edge );

        // Opaque looking down, nearly clear at grazing so the mirror reads.
        float alpha = mix( 0.82, 0.12, fres );
        alpha = max( alpha, caustic * 0.5 );
        gl_FragColor = vec4( col, alpha );
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Just above the reflector beneath it, which sits at 0.012.
  mesh.position.y = 0.03;
  mesh.renderOrder = 2;

  return {
    mesh,
    update(t: number) {
      material.uniforms.uTime.value = t;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
