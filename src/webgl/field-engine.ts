import * as THREE from 'three';
import { fieldVertexShader } from './shaders/field.vert';
import { fieldFragmentShader } from './shaders/field.frag';
import { scroll } from '../lib/scroll';
import { damp, lerp } from '../lib/text';
import { POINT_BUDGET, pixelRatioCap, type Tier } from '../lib/device';

/**
 * Camera choreography.
 *
 * One camera moves through the whole site. Each entry is the framing for the
 * matching layout in the vertex shader, and the camera eases between them on
 * the same `phase` value — so the move and the morph are always in step.
 */
/**
 * How present the environment is in each chapter.
 *
 * The site is paced, not uniformly loud: it opens and closes at full strength
 * and pulls back through the chapters that ask to be read. Without this the
 * field competes with the copy everywhere, which is how an atmosphere turns
 * into noise.
 */
const PRESENCE = [1, 0.42, 0.5, 0.38, 1];

const SHOTS: { pos: THREE.Vector3; look: THREE.Vector3; fov: number }[] = [
  { pos: new THREE.Vector3(-2.5, 3.4, 21), look: new THREE.Vector3(3.5, -2.2, -9), fov: 44 }, // FIELD
  { pos: new THREE.Vector3(0, 2.4, 27), look: new THREE.Vector3(0, -1.2, -12), fov: 52 }, // HORIZON
  { pos: new THREE.Vector3(0, 0, 17), look: new THREE.Vector3(0, 0, -26), fov: 74 },     // CORRIDOR
  { pos: new THREE.Vector3(0, 1.5, 36), look: new THREE.Vector3(0, 0, 0), fov: 48 },     // CONSTELLATION
  { pos: new THREE.Vector3(0, 3.2, 17), look: new THREE.Vector3(0, 6.5, 0), fov: 58 },   // ASCENT
];

function readVec3Token(name: string, fallback: THREE.Vector3): THREE.Vector3 {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw.split(',').map((n) => Number.parseFloat(n));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;
  return new THREE.Vector3(parts[0], parts[1], parts[2]);
}

export interface FieldEngine {
  resize(): void;
  frame(dt: number, elapsed: number): void;
  setPointer(x: number, y: number): void;
  setPointerActive(active: boolean): void;
  setReveal(value: number): void;
  refreshTheme(): void;
  dispose(): void;
}

export function createFieldEngine(
  canvas: HTMLCanvasElement,
  tier: Exclude<Tier, 'none'>,
  reducedMotion: boolean,
  onContextLost: () => void,
): FieldEngine | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // points do their own edge softening; MSAA is wasted here
      alpha: true,
      powerPreference: tier === 'high' ? 'high-performance' : 'default',
      stencil: false,
      depth: true,
    });
  } catch {
    return null;
  }

  const dprCap = pixelRatioCap(tier);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    SHOTS[0].fov,
    window.innerWidth / window.innerHeight,
    0.1,
    260,
  );
  camera.position.copy(SHOTS[0].pos);

  // ── Geometry ────────────────────────────────────────────────────────────
  const count = POINT_BUDGET[tier];
  // A column only reads as a column when it has enough points to draw a
  // line. Trading grid resolution for stack depth is what turns the field
  // from a dust cloud into a skyline.
  const stackDepth = tier === 'low' ? 10 : 16;
  const columns = Math.max(8, Math.round(Math.sqrt(count / stackDepth)));
  const perColumn = Math.max(4, Math.floor(count / (columns * columns)));
  const total = columns * columns * perColumn;

  const positions = new Float32Array(total * 3);
  const seeds = new Float32Array(total * 4);
  const columnCoords = new Float32Array(total * 2);
  const stacks = new Float32Array(total);

  let i = 0;
  for (let cx = 0; cx < columns; cx += 1) {
    for (let cz = 0; cz < columns; cz += 1) {
      const gx = (cx / (columns - 1)) * 2 - 1;
      const gz = (cz / (columns - 1)) * 2 - 1;
      for (let s = 0; s < perColumn; s += 1) {
        columnCoords[i * 2] = gx;
        columnCoords[i * 2 + 1] = gz;
        stacks[i] = perColumn === 1 ? 0 : s / (perColumn - 1);
        seeds[i * 4] = Math.random();
        seeds[i * 4 + 1] = Math.random();
        seeds[i * 4 + 2] = Math.random();
        seeds[i * 4 + 3] = Math.random();
        // `position` is only a bounding hint; the shader computes the real one.
        positions[i * 3] = gx * 26;
        positions[i * 3 + 1] = stacks[i] * 8;
        positions[i * 3 + 2] = gz * 26;
        i += 1;
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  geometry.setAttribute('aColumn', new THREE.BufferAttribute(columnCoords, 2));
  geometry.setAttribute('aStack', new THREE.BufferAttribute(stacks, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 120);

  const uniforms = {
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uReveal: { value: 0 },
    uIntensity: { value: 0 },
    uPresence: { value: 1 },
    uVelocity: { value: 0 },
    uPointer: { value: new THREE.Vector3(0, 0, 0) },
    uPointerStrength: { value: 0 },
    uSize: { value: tier === 'low' ? 3.4 : 2.6 },
    uPixelRatio: { value: renderer.getPixelRatio() },
    uInk: { value: readVec3Token('--gl-ink', new THREE.Vector3(0.91, 0.9, 0.86)) },
    uSignal: { value: readVec3Token('--gl-signal', new THREE.Vector3(0.85, 0.27, 0.16)) },
    uGround: { value: readVec3Token('--gl-ground', new THREE.Vector3(0.03, 0.03, 0.04)) },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: fieldVertexShader,
    fragmentShader: fieldFragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // ── Pointer ─────────────────────────────────────────────────────────────
  const pointerNdc = new THREE.Vector2(0, 0);
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointerWorld = new THREE.Vector3();
  const pointerTarget = new THREE.Vector3();
  let pointerStrengthTarget = 0;

  // ── Frame state ─────────────────────────────────────────────────────────
  const camPos = camera.position.clone();
  const camLook = SHOTS[0].look.clone();
  const shotPos = new THREE.Vector3();
  const shotLook = new THREE.Vector3();
  let smoothPhase = 0;
  let revealTarget = 0;
  let reveal = 0;
  let lost = false;

  const handleContextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    onContextLost();
  };
  canvas.addEventListener('webglcontextlost', handleContextLost);

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(w, h, false);
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
  }

  function refreshTheme(): void {
    uniforms.uInk.value.copy(readVec3Token('--gl-ink', uniforms.uInk.value));
    uniforms.uSignal.value.copy(readVec3Token('--gl-signal', uniforms.uSignal.value));
    uniforms.uGround.value.copy(readVec3Token('--gl-ground', uniforms.uGround.value));
  }

  function frame(dt: number, elapsed: number): void {
    if (lost) return;

    // The shader phase trails the scroll phase, so fast scrolling reads as
    // the environment having weight rather than teleporting.
    smoothPhase = damp(smoothPhase, scroll.phase, reducedMotion ? 40 : 4.2, dt);
    reveal = damp(reveal, revealTarget, 3, dt);

    const pIndex = Math.min(PRESENCE.length - 2, Math.max(0, Math.floor(smoothPhase)));
    const pMix = THREE.MathUtils.smoothstep(smoothPhase - pIndex, 0, 1);
    uniforms.uPresence.value = lerp(PRESENCE[pIndex], PRESENCE[pIndex + 1], pMix);

    uniforms.uTime.value = elapsed;
    uniforms.uPhase.value = smoothPhase;
    uniforms.uReveal.value = reveal;
    uniforms.uIntensity.value = reducedMotion ? 0 : scroll.intensity;
    uniforms.uVelocity.value = reducedMotion ? 0 : THREE.MathUtils.clamp(scroll.velocity * 0.05, -3, 3);

    // Pointer onto the ground plane, so the push happens in world space and
    // stays correct at every camera angle.
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(groundPlane, pointerTarget)) {
      pointerWorld.lerp(pointerTarget, 1 - Math.exp(-6 * dt));
    }
    uniforms.uPointer.value.copy(pointerWorld);
    uniforms.uPointerStrength.value = damp(
      uniforms.uPointerStrength.value,
      reducedMotion ? 0 : pointerStrengthTarget,
      5,
      dt,
    );

    // Camera: blend the two shots either side of the current phase.
    const clamped = Math.min(SHOTS.length - 1, Math.max(0, smoothPhase));
    const index = Math.min(SHOTS.length - 2, Math.floor(clamped));
    const t = THREE.MathUtils.smoothstep(clamped - index, 0, 1);
    const from = SHOTS[index];
    const to = SHOTS[index + 1];
    shotPos.copy(from.pos).lerp(to.pos, t);
    shotLook.copy(from.look).lerp(to.look, t);

    // A little parallax, and a little drift, so the frame is never dead.
    if (!reducedMotion) {
      shotPos.x += pointerNdc.x * 2.4;
      shotPos.y += pointerNdc.y * 1.5;
      shotPos.y += Math.sin(elapsed * 0.21) * 0.35;
    }

    const follow = 1 - Math.exp(-3.4 * dt);
    camPos.lerp(shotPos, follow);
    camLook.lerp(shotLook, follow);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    const fov = lerp(from.fov, to.fov, t);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = lerp(camera.fov, fov, follow);
      camera.updateProjectionMatrix();
    }

    renderer.render(scene, camera);
  }

  return {
    resize,
    frame,
    refreshTheme,
    setPointer(x, y) {
      pointerNdc.set(x, y);
    },
    setPointerActive(active) {
      pointerStrengthTarget = active ? 1 : 0;
    },
    setReveal(value) {
      revealTarget = value;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      geometry.dispose();
      material.dispose();
      scene.remove(points);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
