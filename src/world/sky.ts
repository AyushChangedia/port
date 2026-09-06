import * as THREE from 'three';

/**
 * The sky.
 *
 * A vertical gradient on the inside of a large sphere, plus a soft sun glow.
 * Cheaper than a cubemap, and it gives the horizon somewhere to fade into
 * rather than ending at a flat colour.
 */
export function makeSky(): { mesh: THREE.Mesh; dispose(): void } {
  const geometry = new THREE.SphereGeometry(700, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x8fb6d4) },
      uHorizon: { value: new THREE.Color(0xe4e7e4) },
      uGround: { value: new THREE.Color(0xd2cec3) },
      uSun: { value: new THREE.Vector3(22, 34, 14).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSun;
      varying vec3 vDir;

      void main() {
        float h = vDir.y;
        vec3 sky = mix(uHorizon, uTop, smoothstep(0.0, 0.55, h));
        sky = mix(uGround, sky, smoothstep(-0.12, 0.02, h));

        // A wide, soft glow where the sun is, so the light has a source.
        float sun = max(dot(normalize(vDir), uSun), 0.0);
        sky += vec3(1.0, 0.92, 0.78) * pow(sun, 12.0) * 0.35;
        sky += vec3(1.0, 0.95, 0.86) * pow(sun, 3.0) * 0.07;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
