import * as THREE from 'three';
import { places } from '../data/world';
import { terrainHeight } from './terrain';

/**
 * Vertical light columns, one per place.
 *
 * Straight out of the key art: a shaft of light standing over somewhere worth
 * walking to. They double as wayfinding — visible from anywhere in the world,
 * unlike the signs, which only read once you are close enough to face them.
 *
 * Additive and unlit, with the core pushed above 1.0 so the bloom threshold
 * catches it and the column glows rather than just being a pale cylinder.
 */

export interface Beacons {
  group: THREE.Group;
  /** Elapsed seconds; held still under reduced motion. */
  update(t: number): void;
  dispose(): void;
}

const HEIGHT = 30;

export function buildBeacons(): Beacons {
  const group = new THREE.Group();

  // Open-ended so you never see a lid looking up the shaft.
  // Narrow. A wide cylinder is a fog pillar, not a shaft of light — it washes
  // out everything behind it instead of reading as a thin bright column.
  const geometry = new THREE.CylinderGeometry(0.28, 0.44, HEIGHT, 16, 1, true);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(0xffe9c4) },
    },
    vertexShader: /* glsl */ `
      varying float vUp;
      varying vec3 vToEye;
      void main() {
        // 0 at the base, 1 at the top, whatever the instance scale.
        vUp = clamp( ( position.y + ${(HEIGHT / 2).toFixed(1)} ) / ${HEIGHT.toFixed(1)}, 0.0, 1.0 );
        vec4 world = modelMatrix * vec4( position, 1.0 );
        vToEye = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      varying float vUp;
      varying vec3 vToEye;

      void main() {
        // Bright at the base, gone by the top.
        float fade = pow( 1.0 - vUp, 2.2 );
        // Brightest at the column's edges, so it reads as a hollow shaft of
        // light rather than a solid rod.
        float edge = 1.0 - abs( dot( normalize( vToEye ), vec3( 0.0, 1.0, 0.0 ) ) );
        float pulse = 0.96 + sin( uTime * 1.9 ) * 0.04;
        float a = fade * 0.055 * pulse * ( 0.3 + edge * 0.7 );
        if ( a < 0.003 ) discard;
        // Additive blending adds colour * alpha to whatever is behind. At
        // 3.2 brightness and 0.16 alpha that was adding half of full white to
        // every structure standing behind a column, which is what washed the
        // architecture out to near-white ghosts.
        gl_FragColor = vec4( uColor * 1.5, a );
      }
    `,
  });

  for (const place of places) {
    const mesh = new THREE.Mesh(geometry, material);
    const scale = place.id === 'origin' ? 1.5 : 1;
    mesh.position.set(
      place.at[0],
      terrainHeight(place.at[0], place.at[1]) + (HEIGHT / 2) * scale,
      place.at[1],
    );
    mesh.scale.set(scale, scale, scale);
    mesh.renderOrder = 8;
    group.add(mesh);
  }

  return {
    group,
    update(t: number) {
      material.uniforms.uTime.value = t;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
