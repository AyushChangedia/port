import * as THREE from 'three';
import { applySkyShading } from './shaders/skyMaterial';

/**
 * The cape: Verlet cloth, pinned at the shoulders.
 *
 * The top row follows the character's shoulders and everything below lags
 * behind — that lag is the whole effect. Run and it streams out; stop and it
 * settles; turn and it swings wide.
 *
 * Integrated on a FIXED timestep with an accumulator. Verlet on a variable dt
 * does not merely wobble, it diverges: the position history encodes velocity,
 * so a frame-time spike injects energy the solver never removes and the cloth
 * explodes. That is not a tuning problem, and no amount of damping hides it.
 */

export interface Cape {
  mesh: THREE.Mesh;
  update(dt: number, anchors: [THREE.Vector3, THREE.Vector3], velocity: THREE.Vector3, elapsed: number): void;
  dispose(): void;
}

const COLS = 11;
const ROWS = 14;
// A little wider than the shoulders, not double them.
const WIDTH = 0.42;
const LENGTH = 0.92;
const STEP = 1 / 120;
const MAX_SUBSTEPS = 4;
const DAMPING = 0.982;
/**
 * Relaxation passes per substep.
 *
 * Eight. Twelve was measurably no better: the cloth hangs a little short of
 * its rest length because it drapes over the torso collider, not because the
 * solver is under-relaxed, and more passes cannot fix geometry.
 */
const ITERATIONS = 8;

/** The gold glyph column from the references, drawn once at startup. */
function glyphTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.fillStyle = '#e85a3a';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#f3d9a4';
  ctx.fillStyle = '#f3d9a4';
  ctx.lineWidth = 3;
  // A run of diamonds down the centre line, tapering toward the hem.
  for (let i = 0; i < 4; i += 1) {
    const cy = 46 + i * 46;
    const r = 17 - i * 2.4;
    ctx.beginPath();
    ctx.moveTo(W / 2, cy - r);
    ctx.lineTo(W / 2 + r * 0.7, cy);
    ctx.lineTo(W / 2, cy + r);
    ctx.lineTo(W / 2 - r * 0.7, cy);
    ctx.closePath();
    ctx.stroke();
    if (i % 2 === 1) {
      ctx.beginPath();
      ctx.arc(W / 2, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // A chevron near the hem, as in sky-04.
  ctx.beginPath();
  ctx.moveTo(W / 2 - 13, 232);
  ctx.lineTo(W / 2, 246);
  ctx.lineTo(W / 2 + 13, 232);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildCape(reducedMotion: boolean): Cape {
  const count = COLS * ROWS;
  const positions = new Float32Array(count * 3);
  const previous = new Float32Array(count * 3);

  // Hang it flat behind the shoulders to start, so the first frames settle
  // rather than snap.
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = (r * COLS + c) * 3;
      positions[i] = (c / (COLS - 1) - 0.5) * WIDTH;
      positions[i + 1] = -(r / (ROWS - 1)) * LENGTH;
      positions[i + 2] = -0.06;
      previous[i] = positions[i];
      previous[i + 1] = positions[i + 1];
      previous[i + 2] = positions[i + 2];
    }
  }

  /** Structural, shear and bend, as index pairs with a rest length. */
  const links: { a: number; b: number; rest: number }[] = [];
  const restOf = (a: number, b: number) =>
    Math.hypot(
      positions[a * 3] - positions[b * 3],
      positions[a * 3 + 1] - positions[b * 3 + 1],
      positions[a * 3 + 2] - positions[b * 3 + 2],
    );
  const link = (a: number, b: number) => links.push({ a, b, rest: restOf(a, b) });

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = r * COLS + c;
      if (c + 1 < COLS) link(i, i + 1);
      if (r + 1 < ROWS) link(i, i + COLS);
      // Shear, so the sheet cannot fold flat diagonally.
      if (c + 1 < COLS && r + 1 < ROWS) {
        link(i, i + COLS + 1);
        link(i + 1, i + COLS);
      }
      // Bend, at two spans, which is what stops it creasing like paper.
      if (c + 2 < COLS) link(i, i + 2);
      if (r + 2 < ROWS) link(i, i + COLS * 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const i = r * COLS + c;
      uvs[i * 2] = c / (COLS - 1);
      uvs[i * 2 + 1] = 1 - r / (ROWS - 1);
      if (c + 1 < COLS && r + 1 < ROWS) {
        indices.push(i, i + COLS, i + 1, i + 1, i + COLS, i + COLS + 1);
      }
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const glyphs = glyphTexture();
  const material = applySkyShading(
    new THREE.MeshStandardMaterial({
      map: glyphs,
      roughness: 0.72,
      metalness: 0,
      side: THREE.DoubleSide,
      // A touch emissive so the red holds its saturation in shadow instead of
      // going brown — it is the one strong colour in the frame.
      emissive: new THREE.Color(0x8c2a18),
      emissiveIntensity: 0.12,
    }),
    { rimColor: 0xffb08a, rimStrength: 2.0 },
  );

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;

  let accumulator = 0;
  /**
   * The cloth is authored around the origin, but it lives in world space. On
   * the first update it is teleported onto the shoulders — otherwise the pins
   * yank the top row across the world while the rest is still at the origin,
   * and the solver spends the first second untangling a spike.
   */
  let placed = false;
  const anchorL = new THREE.Vector3();
  const anchorR = new THREE.Vector3();
  const wind = new THREE.Vector3();
  const pinMid = new THREE.Vector3();
  const pinDir = new THREE.Vector3();
  const pin = new THREE.Vector3();

  /**
   * Where the top row is pinned.
   *
   * Spread across the cloth's own width, centred on the shoulders — not
   * between them. The shoulders are 31cm apart and the cape is 58cm wide, so
   * pinning corner-to-shoulder compresses the top row by half its rest length
   * and the whole sheet bunches at the neck instead of draping.
   */
  function pinAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    pinMid.addVectors(anchorL, anchorR).multiplyScalar(0.5);
    pinDir.subVectors(anchorR, anchorL);
    const span = pinDir.length();
    if (span > 1e-5) pinDir.divideScalar(span);
    else pinDir.set(1, 0, 0);
    return out.copy(pinMid).addScaledVector(pinDir, (t - 0.5) * WIDTH);
  }

  function substep(anchors: [THREE.Vector3, THREE.Vector3], velocity: THREE.Vector3, elapsed: number): void {
    anchorL.copy(anchors[0]);
    anchorR.copy(anchors[1]);

    // A gust along the cloth, plus drag opposing the character's motion. Drag
    // is what makes it stream out behind you rather than merely swing.
    /**
     * Wind and drag, as accelerations in m/s^2.
     *
     * They have to be on the same scale as gravity, because they are applied
     * through the same integrator. An earlier version multiplied these by 26
     * on top of the timestep, which made the drag term reach some 640 m/s^2
     * at a run — sixty-five g. The cloth did not flap, it detonated: it
     * ballooned to twice its width standing still and flattened out above the
     * shoulders at speed.
     */
    const gust = Math.sin(elapsed * 1.7) * 0.5 + Math.sin(elapsed * 0.7 + 1.3) * 0.3;
    const DRAG = 1.7;
    wind.set(gust * 3.0 - velocity.x * DRAG, 0.6, gust * 2.0 - velocity.z * DRAG);

    for (let i = 0; i < count; i += 1) {
      const p = i * 3;
      const px = positions[p];
      const py = positions[p + 1];
      const pz = positions[p + 2];

      // Verlet: velocity is implied by the gap to the previous position.
      let vx = (px - previous[p]) * DAMPING;
      let vy = (py - previous[p + 1]) * DAMPING;
      let vz = (pz - previous[p + 2]) * DAMPING;

      // More sway toward the hem, none at the shoulder.
      const along = Math.floor(i / COLS) / (ROWS - 1);
      vx += wind.x * along * STEP * STEP;
      vy += (wind.y - 9.81) * STEP * STEP;
      vz += wind.z * along * STEP * STEP;

      previous[p] = px;
      previous[p + 1] = py;
      previous[p + 2] = pz;
      positions[p] = px + vx;
      positions[p + 1] = py + vy;
      positions[p + 2] = pz + vz;
    }

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      for (let l = 0; l < links.length; l += 1) {
        const { a, b, rest } = links[l];
        const ia = a * 3;
        const ib = b * 3;
        const dx = positions[ib] - positions[ia];
        const dy = positions[ib + 1] - positions[ia + 1];
        const dz = positions[ib + 2] - positions[ia + 2];
        const d = Math.hypot(dx, dy, dz);
        if (d < 1e-6) continue;
        const push = ((d - rest) / d) * 0.5;
        const ox = dx * push;
        const oy = dy * push;
        const oz = dz * push;
        positions[ia] += ox;
        positions[ia + 1] += oy;
        positions[ia + 2] += oz;
        positions[ib] -= ox;
        positions[ib + 1] -= oy;
        positions[ib + 2] -= oz;
      }

      // Pin the top row, after relaxation so the pins always win.
      for (let c = 0; c < COLS; c += 1) {
        pinAt(c / (COLS - 1), pin);
        const p = c * 3;
        positions[p] = pin.x;
        positions[p + 1] = pin.y;
        positions[p + 2] = pin.z;
      }

      // Keep the cloth off the body: a capsule around the torso, pushed out
      // radially. Without it the cape saws through the figure when you turn.
      const cx = (anchorL.x + anchorR.x) * 0.5;
      const cz = (anchorL.z + anchorR.z) * 0.5;
      const top = anchorL.y;
      for (let i = COLS; i < count; i += 1) {
        const p = i * 3;
        if (positions[p + 1] > top - 0.02 || positions[p + 1] < top - 1.1) continue;
        const dx = positions[p] - cx;
        const dz = positions[p + 2] - cz;
        const d = Math.hypot(dx, dz);
        // Wider than the robe's own hem, so the cape rides outside it rather
        // than z-fighting along its surface.
        const radius = 0.3;
        if (d < radius && d > 1e-5) {
          positions[p] = cx + (dx / d) * radius;
          positions[p + 2] = cz + (dz / d) * radius;
        }
      }
    }
  }

  return {
    mesh,
    update(dt, anchors, velocity, elapsed) {
      if (!placed) {
        placed = true;
        anchorL.copy(anchors[0]);
        anchorR.copy(anchors[1]);
        for (let r = 0; r < ROWS; r += 1) {
          const drop = (r / (ROWS - 1)) * LENGTH;
          for (let c = 0; c < COLS; c += 1) {
            pinAt(c / (COLS - 1), pin);
            const p = (r * COLS + c) * 3;
            positions[p] = pin.x;
            positions[p + 1] = pin.y - drop;
            positions[p + 2] = pin.z - drop * 0.22;
            previous[p] = positions[p];
            previous[p + 1] = positions[p + 1];
            previous[p + 2] = positions[p + 2];
          }
        }
      }

      if (reducedMotion) {
        // Hang it straight down from the shoulders and leave it there.
        anchorL.copy(anchors[0]);
        anchorR.copy(anchors[1]);
        for (let r = 0; r < ROWS; r += 1) {
          const drop = (r / (ROWS - 1)) * LENGTH;
          for (let c = 0; c < COLS; c += 1) {
            pinAt(c / (COLS - 1), pin);
            const p = (r * COLS + c) * 3;
            positions[p] = pin.x;
            positions[p + 1] = pin.y - drop;
            positions[p + 2] = pin.z - drop * 0.22;
          }
        }
      } else {
        accumulator += dt;
        let steps = 0;
        while (accumulator >= STEP && steps < MAX_SUBSTEPS) {
          substep(anchors, velocity, elapsed);
          accumulator -= STEP;
          steps += 1;
        }
        // Do not let a long frame bank time it can never work off.
        if (accumulator > STEP * MAX_SUBSTEPS) accumulator = 0;
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      glyphs.dispose();
    },
  };
}
