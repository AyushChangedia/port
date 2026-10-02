import * as THREE from 'three';
import { SKY_CHUNK, applyTimeOfDay, skyUniforms } from './shaders/skyCommon';

/**
 * The sky.
 *
 * An inverted sphere carrying the whole atmosphere: a five-stop gradient, a
 * sun disc bright enough to bloom, two drifting cloud layers lit from the sun
 * side, and the cloud sea that the land appears to float on.
 *
 * The clouds are not raymarched. The view direction is projected onto a flat
 * plane overhead (uv = dir.xz / dir.y) and two fbm layers are evaluated there,
 * which costs six noise evaluations per sky pixel instead of the several
 * hundred a volumetric march would need — and at this distance the two are
 * indistinguishable.
 */

export interface Sky {
  mesh: THREE.Mesh;
  /**
   * The god-ray source. Kept just inside the dome and moved with the player so
   * it stays locked to the painted disc; a fixed world position would visibly
   * separate from it as you walk.
   */
  sunMesh: THREE.Mesh;
  /**
   * Add this to the scene, not `sunMesh` directly.
   *
   * It is deliberately invisible: three skips invisible subtrees entirely, so
   * the sun is never drawn in the main pass — where a flat white sphere would
   * sit *dimmer* than the HDR disc painted behind it and punch a dull hole in
   * the middle of the glow. GodRaysEffect reparents the mesh into its own
   * scene to render it, so it still lights the rays.
   */
  sunHolder: THREE.Group;
  /** Re-centre the dome and the sun on the player. */
  update(x: number, z: number): void;
  /** 0 = day, 1 = dusk. Blends the entire palette and the sun direction. */
  setTimeOfDay(t: number): void;
  dispose(): void;
}

/** Dome radius. The sun sits inside this, the camera far plane outside it. */
const DOME = 700;
const SUN_DISTANCE = 600;

export function makeSky(): Sky {
  const geometry = new THREE.SphereGeometry(DOME, 48, 28);

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // Shared holders by reference: one write per frame reaches the dome and
    // every surface in the world at once.
    uniforms: { ...skyUniforms },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;

      ${SKY_CHUNK}

      void main() {
        vec3 dir = normalize( vDir );
        float h = dir.y;
        vec3 col = skyGradient( dir );

        // ── Cloud sea ────────────────────────────────────────────────────────
        // A bright lumpy band sitting exactly on the horizon line. Its top edge
        // is noise-modulated by azimuth, so the land reads as floating on it
        // rather than ending at a ruled line.
        vec2 seaUv = normalize( dir.xz + vec2( 1e-5 ) ) * 3.0 + vec2( uTime * 0.004, 0.0 );
        float seaN = skyFbm( seaUv * 1.4 ) * 0.6 + skyFbm( seaUv * 3.1 ) * 0.4;
        float seaTop = 0.030 + seaN * 0.055;
        float sea = smoothstep( -0.032, -0.004, h ) * ( 1.0 - smoothstep( seaTop * 0.5, seaTop, h ) );
        col = mix( col, uSeaColor, clamp( sea, 0.0, 1.0 ) * 0.92 );

        // ── Clouds ───────────────────────────────────────────────────────────
        float above = smoothstep( 0.020, 0.150, h );
        if ( above > 0.001 ) {
          vec2 cuv = dir.xz / max( h, 0.06 );
          vec2 driftA = vec2( uTime * 0.0055, uTime * 0.0032 );
          vec2 driftB = vec2( uTime * -0.0090, uTime * 0.0061 );

          // Two layers at different scales drifting at different speeds: the
          // mismatch is what gives the sky parallax as you turn.
          //
          // The scales are large because this projection collapses toward the
          // zenith — straight up, dir.xz goes to zero and the whole upper sky
          // samples one tiny patch of noise. Too small a scale there and the
          // clouds flatten into a featureless wash.
          float coverage = skyFbm( cuv * 1.30 + driftA ) * 0.62
                         + skyFbm( cuv * 2.90 + driftB ) * 0.38;
          // A tight band: a wide one fades cloud into sky over so many degrees
          // that nothing reads as having an edge.
          float cloud = smoothstep( uCloudCover, uCloudCover + 0.15, coverage );

          // Sample the same field again, offset toward the sun in the cloud
          // plane, and read it as how much light reaches this point. That single
          // extra lookup is the whole glowing-rim effect.
          vec2 sunUv = uSunDir.xz / max( uSunDir.y, 0.20 );
          vec2 toSun = normalize( sunUv - cuv + vec2( 1e-4 ) );
          float shade = skyFbm( ( cuv + toSun * 0.7 ) * 1.30 + driftA ) * 0.62
                      + skyFbm( ( cuv + toSun * 0.7 ) * 2.90 + driftB ) * 0.38;
          float shadeCloud = smoothstep( uCloudCover, uCloudCover + 0.15, shade );
          float transmittance = exp( -shadeCloud * 4.5 );

          vec3 cloudCol = mix( uCloudDark, uCloudLit, transmittance );
          // Clouds near the sun blow out, the way they do looking into the light.
          float phase = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
          cloudCol += uCloudLit * phase * 0.85;

          col = mix( col, cloudCol, cloud * above * 0.96 );
        }

        // ── Sun ──────────────────────────────────────────────────────────────
        // The core is deliberately pushed well above 1.0 so the bloom threshold
        // catches it and it blooms instead of just being a white circle.
        float sd = max( dot( dir, uSunDir ), 0.0 );
        float core  = pow( sd, 1800.0 ) * 9.0;
        float tight = pow( sd, 90.0 ) * 0.50;
        float wide  = pow( sd, 12.0 ) * 0.15;
        col += uSunColor * ( core + tight + wide );

        gl_FragColor = vec4( col, 1.0 );
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;

  // The god-ray source. Sized to subtend roughly the same angle as the painted
  // disc, transparent and depth-write-free as GodRaysEffect requires.
  const sunGeo = new THREE.SphereGeometry(20, 16, 12);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.frustumCulled = false;

  const sunHolder = new THREE.Group();
  sunHolder.visible = false;
  sunHolder.add(sunMesh);

  /** Hoisted: `update` runs every frame. */
  const centre = new THREE.Vector3();

  const update = (x: number, z: number): void => {
    mesh.position.set(x, 0, z);
    sunMesh.position
      .copy(skyUniforms.uSunDir.value)
      .multiplyScalar(SUN_DISTANCE)
      .add(centre.set(x, 0, z));
  };
  update(0, 0);

  return {
    mesh,
    sunMesh,
    sunHolder,
    update,
    setTimeOfDay(t: number) {
      applyTimeOfDay(t);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      sunGeo.dispose();
      sunMat.dispose();
    },
  };
}
