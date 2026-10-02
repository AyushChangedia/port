import * as THREE from 'three';
import { WORLD_RADIUS } from '../data/world';
import { windUniforms } from './shaders/wind';

/**
 * Drifting light motes.
 *
 * Additive billboards with a soft radial falloff, not points: `gl_PointSize`
 * dots have hard square edges and no perspective, which reads wrong the moment
 * one passes close to the camera.
 *
 * Every mote's whole life — drift, rise, fade in and out — is a function of
 * time and its seed, evaluated in the vertex shader. Nothing is simulated on
 * the CPU, so four thousand of them cost one draw call and no frame time.
 */

export interface Motes {
  points: THREE.Mesh;
  dispose(): void;
}

export function buildMotes(quality: 'high' | 'low'): Motes {
  const count = quality === 'high' ? 4000 : 600;

  // One quad per mote, expanded to face the camera in the vertex shader.
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.attributes.position = base.attributes.position;
  geometry.attributes.uv = base.attributes.uv;

  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - 4);
    seeds[i * 4] = Math.cos(a) * r;
    seeds[i * 4 + 1] = Math.sin(a) * r;
    // Lifetime 40–90s, and a random offset so they are not all born together.
    seeds[i * 4 + 2] = 40 + Math.random() * 50;
    seeds[i * 4 + 3] = Math.random();
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = count;
  // These roam the whole world; culling them per-instance is not worth it.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), WORLD_RADIUS * 1.6);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uWindTime: windUniforms.uWindTime,
      uWind: windUniforms.uWind,
      uColor: { value: new THREE.Color(0xfff3d8) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uWindTime;
      uniform float uWind;
      varying float vFade;
      varying vec2 vUv;

      void main() {
        vUv = uv;

        float life = aSeed.z;
        // Each mote runs its own cycle, offset so births are staggered.
        float age = fract( uWindTime / life + aSeed.w );

        // Curl-ish drift: two out-of-phase sines on different axes never repeat
        // visibly, and cost a fraction of real curl noise.
        float t = uWindTime * uWind;
        float wobbleX = sin( t * 0.21 + aSeed.w * 41.0 ) * 2.6
                      + sin( t * 0.07 + aSeed.x * 0.4 ) * 1.4;
        float wobbleZ = cos( t * 0.17 + aSeed.w * 27.0 ) * 2.6
                      + cos( t * 0.05 + aSeed.y * 0.4 ) * 1.4;

        vec3 centre = vec3(
          aSeed.x + wobbleX,
          0.6 + age * 9.0 + sin( t * 0.3 + aSeed.w * 13.0 ) * 0.5,
          aSeed.y + wobbleZ
        );

        // In and out at the ends of the life, so nothing pops.
        vFade = smoothstep( 0.0, 0.18, age ) * ( 1.0 - smoothstep( 0.72, 1.0, age ) );

        // Small. At any larger size four thousand of them stop reading as
        // drifting light and start reading as snowfall.
        float size = 0.055 + aSeed.w * 0.07;
        vec4 mv = modelViewMatrix * vec4( centre, 1.0 );
        // Billboard: offset in view space, so the quad always faces the camera.
        mv.xy += position.xy * size;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vFade;
      varying vec2 vUv;

      void main() {
        // Soft radial falloff. Squared so the core stays tight and the edge
        // dissolves rather than ending.
        float d = length( vUv - 0.5 ) * 2.0;
        float alpha = pow( max( 1.0 - d, 0.0 ), 2.5 ) * vFade * 0.55;
        if ( alpha < 0.002 ) discard;
        // Still above 1.0 so bloom catches the cores, but only the cores.
        gl_FragColor = vec4( uColor * 1.25, alpha );
      }
    `,
  });

  const points = new THREE.Mesh(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;

  return {
    points,
    dispose() {
      // Only the instanced geometry: it borrows `base`'s position/uv buffers
      // rather than copying them, so disposing both would delete the same GL
      // buffers twice.
      geometry.dispose();
      material.dispose();
    },
  };
}
