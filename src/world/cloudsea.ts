import * as THREE from 'three';
import { SKY_NOISE_GLSL } from './shaders/skyCommon';
import { CLOUD_Y } from './terrain';

/**
 * The cloud sea the islands float on.
 *
 * Without it the gaps between islands read as a hole in the world rather than
 * as sky, and looking down from an edge shows nothing at all — which is the
 * one view a world of floating islands has to get right.
 *
 * A single large plane far below, drifting, with a soft edge so it never ends
 * anywhere you can see.
 */

export interface CloudSea {
  mesh: THREE.Mesh;
  update(t: number): void;
  dispose(): void;
}

export function buildCloudSea(): CloudSea {
  const geometry = new THREE.PlaneGeometry(900, 900, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uNear: { value: new THREE.Color(0xffffff) },
      uFar: { value: new THREE.Color(0xbcd4ea) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uNear;
      uniform vec3 uFar;
      varying vec3 vWorld;

      ${SKY_NOISE_GLSL}

      void main() {
        vec2 p = vWorld.xz * 0.012;
        float billow = skyFbm( p + vec2( uTime * 0.006, uTime * 0.004 ) );
        billow += skyFbm( p * 2.7 - vec2( uTime * 0.009, 0.0 ) ) * 0.45;

        // Break the top surface into banks rather than one flat lid.
        float mass = smoothstep( 0.42, 0.95, billow );
        vec3 col = mix( uFar, uNear, mass );

        // Fade out with distance so the plane never shows an edge, and thin
        // toward the gaps so you can sense depth below rather than a floor.
        float d = length( vWorld.xz );
        float far = 1.0 - smoothstep( 120.0, 430.0, d );
        float alpha = ( 0.42 + mass * 0.5 ) * far;

        gl_FragColor = vec4( col, alpha );
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = CLOUD_Y;
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;

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
