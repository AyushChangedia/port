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

export function buildWater(radius: number, centre: [number, number] = [0, 0]): Water {
  const geometry = new THREE.CircleGeometry(radius, 96);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uWind: windUniforms.uWind,
      uRadius: { value: radius },
      uCentre: { value: new THREE.Vector2() },
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
      uniform vec2 uCentre;
      uniform vec3 uDeep;
      uniform vec3 uShore;
      varying vec3 vWorld;
      varying vec3 vToEye;

      ${SKY_NOISE_GLSL}

      void main() {
        vec2 p = vWorld.xz - uCentre;

        // Two ripple fields scrolling against each other. Taking the derivative
        // of the noise rather than the noise itself gives lines with crests,
        // which is what a water surface actually shows.
        float a = skyFbm( p * 0.85 + vec2( uTime * 0.05, uTime * 0.03 ) );
        float b = skyFbm( p * 1.7 - vec2( uTime * 0.031, uTime * 0.052 ) );
        float ripple = ( a - b );

        // The ripples perturb the surface normal rather than only its colour;
        // without that the fresnel is a flat radial gradient and the whole pool
        // reads as one painted disc.
        vec2 slope = vec2( dFdx( ripple ), dFdy( ripple ) ) * 26.0;
        vec3 normal = normalize( vec3( -slope.x, 1.0, -slope.y ) );
        vec3 eye = normalize( vToEye );
        float fres = pow( 1.0 - clamp( dot( normal, eye ), 0.0, 1.0 ), 3.2 );

        float dist = length( p );
        // Shallower toward the rim, so the colour has somewhere to go.
        float depth = smoothstep( uRadius, uRadius * 0.45, dist );
        vec3 col = mix( uShore, uDeep, depth );

        // Thin bright caustics where the two fields nearly cancel.
        float caustic = smoothstep( 0.012, 0.0, abs( ripple ) ) * ( 0.35 + depth * 0.5 );
        col += uShore * caustic * 0.7;

        // A wet band at the shoreline rather than a hard cut circle.
        float shore = 1.0 - smoothstep( uRadius - 2.2, uRadius - 0.15, dist );
        col += uShore * ( 1.0 - shore ) * 0.35;

        // Never fully opaque: the mirror underneath has to carry the sky, or
        // this is just a blue layer. Clears entirely at the very edge.
        float alpha = mix( 0.52, 0.06, fres ) * depth;
        alpha = max( alpha, caustic * 0.55 );
        alpha *= smoothstep( uRadius, uRadius - 0.5, dist );
        gl_FragColor = vec4( col, alpha );
      }
    `,
  });

  material.uniforms.uCentre.value.set(centre[0], centre[1]);

  const mesh = new THREE.Mesh(geometry, material);
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
