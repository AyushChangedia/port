import * as THREE from 'three';

/**
 * The masonry kit: chamfered blocks, carved glyphs, and stone that is not flat.
 *
 * Hard 90-degree corners are the single most CAD-looking thing in a scene of
 * boxes, and no amount of lighting hides them — a real edge always catches a
 * highlight. Everything structural is built through `roundedBox` instead.
 */

const cache = new Map<string, THREE.BufferGeometry>();

/**
 * A box with chamfered edges, built at its true size.
 *
 * Built per size rather than scaled from a unit cube on purpose: scaling a
 * unit rounded box by (5, 0.2, 5) would stretch its chamfer to 30cm on one
 * axis and 1cm on another, which reads worse than no chamfer at all. There are
 * only a few dozen distinct sizes in the world, and they are cached.
 */
export function roundedBox(w: number, h: number, d: number, radius = 0.06): THREE.BufferGeometry {
  // The chamfer can never exceed half the smallest dimension.
  const r = Math.max(0.012, Math.min(radius, Math.min(w, h, d) * 0.32));
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // A rounded rectangle in XY, extruded through Z with a bevel at both ends:
  // rounded on the four upright edges, chamfered on the eight others.
  const shape = new THREE.Shape();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  shape.moveTo(-hw - r, -hh);
  shape.lineTo(-hw - r, hh);
  shape.quadraticCurveTo(-hw - r, hh + r, -hw, hh + r);
  shape.lineTo(hw, hh + r);
  shape.quadraticCurveTo(hw + r, hh + r, hw + r, hh);
  shape.lineTo(hw + r, -hh);
  shape.quadraticCurveTo(hw + r, -hh - r, hw, -hh - r);
  shape.lineTo(-hw, -hh - r);
  shape.quadraticCurveTo(-hw - r, -hh - r, -hw - r, -hh);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - r * 2),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 2,
    curveSegments: 3,
    steps: 1,
  });
  // Extrude runs from z=0; recentre so it behaves like a BoxGeometry.
  geometry.translate(0, 0, -(d - r * 2) / 2);
  geometry.computeVertexNormals();
  cache.set(key, geometry);
  return geometry;
}

export function disposeStonework(): void {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}

/**
 * A carved glyph, drawn to a canvas at startup. No texture files.
 *
 * One motif per place, so somewhere is identifiable by its symbol as well as
 * by its sign — the way the references mark their buildings.
 */
export function glyphTexture(motif: number): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.clearRect(0, 0, S, S);
  ctx.translate(S / 2, S / 2);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';

  const ring = (r: number, width: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const spokes = (count: number, inner: number, outer: number, width: number) => {
    ctx.lineWidth = width;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      ctx.stroke();
    }
  };

  switch (motif % 5) {
    case 0: // The sun: the mark over the arrival monument.
      ring(40, 10);
      spokes(8, 56, 88, 11);
      break;
    case 1: // Concentric rings.
      ring(30, 9);
      ring(56, 7);
      ring(84, 5);
      break;
    case 2: // A diamond within a ring.
      ring(86, 8);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(0, -52);
      ctx.lineTo(46, 0);
      ctx.lineTo(0, 52);
      ctx.lineTo(-46, 0);
      ctx.closePath();
      ctx.stroke();
      break;
    case 3: // A gate: two uprights under a bar.
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(-46, 74);
      ctx.lineTo(-46, -34);
      ctx.lineTo(46, -34);
      ctx.lineTo(46, 74);
      ctx.stroke();
      ring(20, 9);
      break;
    default: // A star of short strokes.
      spokes(6, 22, 80, 12);
      ring(14, 9);
      break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Surface detail for stone, evaluated in the fragment shader.
 *
 * Triplanar: the noise is sampled in world space on all three axes and blended
 * by the surface normal, so it needs no UVs and never stretches on a scaled
 * box. It is subtle by design — enough that a large flat face is not one
 * uniform colour, not so much that it reads as dirt.
 */
export function stoneDetail(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader
    // Anchored just before main(), not after <common>.
    //
    // skyHash/skyValueNoise/skyFbm come from the sky chunk that applySkyShading
    // injects into this same shader. Redeclaring them is a redefinition error,
    // and declaring this function *above* them is a use-before-declaration
    // error. Either way the program fails to link and the stone renders as an
    // untextured ghost rather than as anything obviously broken.
    .replace(
      'void main() {',
      `float stoneTriplanar( vec3 world, vec3 normal ) {
  vec3 blend = normalize( max( abs( normal ), 0.0001 ) );
  blend /= blend.x + blend.y + blend.z;
  return skyFbm( world.yz * 0.8 ) * blend.x
       + skyFbm( world.xz * 0.8 ) * blend.y
       + skyFbm( world.xy * 0.8 ) * blend.z;
}

void main() {`,
    )
    // After the normals, not at <color_fragment>: three resolves colour before
    // it resolves normals, so `normal` does not exist that early.
    .replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
{
  // vSkyWorldPos comes from the sky shading patch this always runs alongside.
  float grain = stoneTriplanar( vSkyWorldPos, normalize( normal ) );
  float coarse = stoneTriplanar( vSkyWorldPos * 0.22, normalize( normal ) );
  diffuseColor.rgb *= 0.86 + grain * 0.16 + coarse * 0.14;
}`,
    );
}
