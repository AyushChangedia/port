import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { places, WORLD_RADIUS } from '../data/world';
import { buildWorld, type BuiltWorld } from './build';
import { createMaterials } from './materials';
import { buildScenery, type Scenery } from './scenery';
import { createPost, type Post } from './post';
import { skyUniforms } from './shaders/skyCommon';
import { makeSky } from './sky';

/**
 * The world engine: camera rig, movement, collision and interaction.
 *
 * Kept deliberately simple — the player is a circle sliding on a plane. There
 * is no physics engine here and there does not need to be one.
 */

export interface EngineCallbacks {
  /** The place you are standing close enough to open, or null. */
  onNear(placeId: string | null): void;
  /** Fired when arriving at a place you clicked, or pressing Enter nearby. */
  onOpen(placeId: string): void;
  /** Player pose, for the map. Called every frame. */
  onPose(x: number, z: number, yaw: number): void;
  /** True once the player has actually moved — used to retire the hint. */
  onFirstMove(): void;
}

export interface Engine {
  resize(): void;
  /** Walk to a place and open it on arrival. */
  goTo(placeId: string): void;
  /** Jump straight there — used by the directory for keyboard users. */
  teleport(placeId: string): void;
  /** Nearest openable place right now, or null. */
  nearest(): string | null;
  setPaused(paused: boolean): void;
  dispose(): void;
}

const EYE = 1.68;
const SPEED = 9.5;
const ACCEL = 9;
const PLAYER_R = 0.6;
const TURN_KEY = 1.9;
const JUMP = 6.4;
const GRAVITY = 20;

/** Applied once, in the grade, since the renderer no longer tone maps. */
const EXPOSURE = 1.15;
/** Half-width of the shadow box that follows the player, in metres. */
const SHADOW_BOX = 30;
const SHADOW_MAP = 4096;
/** How far the sun sits from the player. Only the direction matters. */
const SUN_DISTANCE = 60;

export function createEngine(
  canvas: HTMLCanvasElement,
  callbacks: EngineCallbacks,
  quality: 'high' | 'low',
  reducedMotion = false,
): Engine | null {
  let renderer: THREE.WebGLRenderer;
  try {
    // No MSAA: a composer renders into its own target, where the canvas
    // antialias flag does nothing. SMAA in the chain does the work instead.
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  } catch {
    return null;
  }

  const maxDpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);
  /**
   * Adaptive resolution.
   *
   * This scene is fill-rate bound, so the honest lever on a struggling GPU is
   * pixels, not geometry — dropping the buffer resolution keeps the world
   * intact and the frame rate usable. Scales back up when there is headroom.
   */
  let renderScale = 1;
  let slowFrames = 0;
  let fastFrames = 0;
  renderer.setPixelRatio(maxDpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The scene renders linear into a half-float buffer; exposure and ACES are
  // applied once at the end of the post chain. Tone mapping here as well would
  // apply the curve twice and crush the sun before bloom ever sees it.
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  // No scene.fog: every world material replaces three's fog outright with
  // aerial perspective that takes the colour of the sky in the view direction.

  // A generated indoor-studio environment, used purely as a reflection probe.
  // It costs one render at startup and is what makes glass and metal read as
  // glass and metal rather than as flat colour.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  // Dimmed hard: the sky gradient and the rim light carry the lighting now, and
  // a studio probe at full strength fights both.
  scene.environmentIntensity = 0.35;

  const sky = makeSky();
  scene.add(sky.mesh);
  scene.add(sky.sunHolder);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

  /**
   * Vertical FOV has to come down on a portrait screen, otherwise most of the
   * frame is empty floor and the structures shrink to nothing.
   */
  function frameForAspect(): void {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    camera.fov = aspect < 0.85 ? 46 : aspect < 1.3 ? 54 : 62;
    camera.updateProjectionMatrix();
  }
  frameForAspect();

  // Light: one sun for shape and shadow, one hemisphere so nothing goes black.
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  scene.add(sun);
  scene.add(sun.target);
  if (quality === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = SUN_DISTANCE * 2.4;
    sun.shadow.camera.left = -SHADOW_BOX;
    sun.shadow.camera.right = SHADOW_BOX;
    sun.shadow.camera.top = SHADOW_BOX;
    sun.shadow.camera.bottom = -SHADOW_BOX;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.updateProjectionMatrix();
  }

  // Warm ground bounce against a cool sky: this is what keeps the shadow side
  // coloured rather than grey and dead.
  scene.add(new THREE.HemisphereLight(0x9fd4ff, 0xc8a870, 0.9));

  /**
   * Point the sun at the player.
   *
   * The shadow box is only 60m across so it can afford real resolution, which
   * means it has to travel with you. Positions are snapped to the shadow map's
   * texel size, otherwise every step makes the shadow edges crawl.
   */
  const texel = (SHADOW_BOX * 2) / SHADOW_MAP;
  function aimSun(x: number, z: number): void {
    const dir = skyUniforms.uSunDir.value;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    sun.position.set(sx + dir.x * SUN_DISTANCE, dir.y * SUN_DISTANCE, sz + dir.z * SUN_DISTANCE);
    sun.target.position.set(sx, 0, sz);
    sun.target.updateMatrixWorld();
  }

  const materials = createMaterials(quality);
  const world: BuiltWorld = buildWorld(quality, materials);
  scene.add(world.root);

  const scenery: Scenery = buildScenery(materials, quality);
  scene.add(scenery.group);

  const post: Post = createPost(renderer, scene, camera, sky.sunMesh, quality, EXPOSURE);

  // ── Player state ─────────────────────────────────────────────────────────
  const pos = new THREE.Vector3(0, 0, 19);
  const vel = new THREE.Vector3();
  let yaw = Math.PI;      // facing the arrival monument
  let pitch = window.innerWidth / window.innerHeight < 0.85 ? 0.12 : 0.015;
  let paused = false;
  let moved = false;
  /** Vertical velocity while jumping; 0 when standing. */
  let airborne = 0;
  let height = 0;

  const keys = new Set<string>();
  /** Where we are walking to. `id` is null when the destination is open ground. */
  let autoTarget: { id: string | null; x: number; z: number; reach: number } | null = null;
  let nearId: string | null = null;

  // ── Input: keyboard ──────────────────────────────────────────────────────
  const MOVE_KEYS = new Set([
    'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
    'shift', ' ',
  ]);

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const key = e.key.toLowerCase();
    if (!MOVE_KEYS.has(key)) return;
    // Arrows and space would otherwise scroll the page behind the canvas.
    e.preventDefault();
    if (key === ' ' && airborne === 0) {
      airborne = JUMP;
      callbacks.onFirstMove();
    }
    keys.add(key);
    if (key !== 'shift' && key !== ' ') autoTarget = null;
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const clearKeys = () => keys.clear();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);

  // ── Input: pointer (drag to look, click to walk) ─────────────────────────
  let dragging = false;
  let dragId = -1;
  let lastX = 0;
  let lastY = 0;
  let dragDist = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (paused || e.button !== 0) return;
    dragging = true;
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDist = 0;
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    dragDist += Math.abs(dx) + Math.abs(dy);

    yaw -= dx * 0.0042;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.0032, -0.55, 0.42);
    if (dragDist > 12) autoTarget = null;
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundHit = new THREE.Vector3();

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== dragId) return;
    dragging = false;
    dragId = -1;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (paused || dragDist > 12) return;

    // A tap, not a drag.
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    const hit = raycaster.intersectObjects(world.targets, false)[0];
    const id = hit?.object.userData.placeId as string | undefined;
    if (id) {
      goTo(id);
      return;
    }

    // Nothing was hit — walk to the spot on the ground instead. Structures
    // have gaps you can see straight through (the arches especially), so a
    // click that misses must still do the obvious thing rather than nothing.
    if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      const reach = Math.hypot(groundHit.x, groundHit.z);
      if (reach < WORLD_RADIUS - 2) {
        autoTarget = { id: null, x: groundHit.x, z: groundHit.z, reach: 0.8 };
      }
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  // ── Movement helpers ─────────────────────────────────────────────────────
  function goTo(id: string): void {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    autoTarget = { id, x: place.at[0], z: place.at[1], reach: place.reach };
  }

  function teleport(id: string): void {
    const place = places.find((p) => p.id === id);
    if (!place) return;
    // Stand just outside the structure, looking at it.
    const stand = place.solid + 2.2;
    const angle = Math.atan2(pos.x - place.at[0], pos.z - place.at[1]);
    pos.set(place.at[0] + Math.sin(angle) * stand, 0, place.at[1] + Math.cos(angle) * stand);
    vel.set(0, 0, 0);
    yaw = Math.atan2(place.at[0] - pos.x, place.at[1] - pos.z);
    autoTarget = null;
  }

  function collide(): void {
    for (const place of places) {
      const dx = pos.x - place.at[0];
      const dz = pos.z - place.at[1];
      const dist = Math.hypot(dx, dz);
      const min = place.solid + PLAYER_R;
      if (dist < min && dist > 0.0001) {
        const push = (min - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    const fromCentre = Math.hypot(pos.x, pos.z);
    const limit = WORLD_RADIUS - 1.4;
    if (fromCentre > limit) {
      pos.x = (pos.x / fromCentre) * limit;
      pos.z = (pos.z / fromCentre) * limit;
    }
  }

  function updateNear(): void {
    let found: string | null = null;
    let best = Infinity;
    for (const place of places) {
      const d = Math.hypot(pos.x - place.at[0], pos.z - place.at[1]);
      if (d < place.reach && d < best) {
        best = d;
        found = place.id;
      }
    }
    if (found !== nearId) {
      nearId = found;
      callbacks.onNear(found);
    }
    // Approach rings brighten as you get close.
    for (const place of places) {
      const ring = world.markers.get(place.id);
      if (!ring) continue;
      const d = Math.hypot(pos.x - place.at[0], pos.z - place.at[1]);
      const t = THREE.MathUtils.clamp(1 - (d - place.reach) / 9, 0, 1);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.12 + t * 0.5;
    }
  }

  // ── Autofocus ────────────────────────────────────────────────────────────
  /**
   * Depth of field follows whatever is straight ahead.
   *
   * Sampled every few frames rather than every frame — it raycasts the whole
   * target set — and eased, so walking past a pillar does not snap the focus.
   */
  const CENTRE = new THREE.Vector2(0, 0);
  const FOCUS_NEAR = 10;
  const FOCUS_FAR = 45;
  let focus = 18;
  let focusTarget = 18;
  let focusTick = 0;

  function updateFocus(dt: number): void {
    focusTick += 1;
    if (focusTick % 4 === 0) {
      raycaster.setFromCamera(CENTRE, camera);
      const hit = raycaster.intersectObjects(world.targets, false)[0];
      focusTarget = hit
        ? THREE.MathUtils.clamp(hit.distance, FOCUS_NEAR, FOCUS_FAR)
        : FOCUS_FAR;
    }
    // Reduced motion gets no focus pull at all — it is a slow easing camera
    // move, which is exactly what that preference asks us not to do.
    focus = reducedMotion ? focusTarget : focus + (focusTarget - focus) * Math.min(1, dt * 3.5);
    post.setFocus(focus);
  }

  // ── Frame loop ───────────────────────────────────────────────────────────
  const clock = new THREE.Clock();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const wish = new THREE.Vector3();
  let raf = 0;

  function frame(): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());

    // Below ~30fps for half a second, shed pixels; comfortably above it for
    // two seconds, take some back. The clamp stops it oscillating.
    if (!paused) {
      if (dt > 0.033) { slowFrames += 1; fastFrames = 0; } else if (dt < 0.019) { fastFrames += 1; slowFrames = 0; }
      if (slowFrames > 30 && renderScale > 0.55) {
        renderScale = Math.max(0.55, renderScale - 0.15);
        slowFrames = 0;
        renderer.setPixelRatio(maxDpr * renderScale);
        // The composer's targets are sized from the drawing buffer, so they
        // have to be rebuilt or the effects resolve at the old resolution.
        post.resize();
      } else if (fastFrames > 120 && renderScale < 1) {
        renderScale = Math.min(1, renderScale + 0.15);
        fastFrames = 0;
        renderer.setPixelRatio(maxDpr * renderScale);
        post.resize();
      }
    }

    if (!paused) {
      if (keys.has('arrowleft')) yaw += TURN_KEY * dt;
      if (keys.has('arrowright')) yaw -= TURN_KEY * dt;

      forward.set(Math.sin(yaw), 0, Math.cos(yaw));
      right.set(Math.sin(yaw - Math.PI / 2), 0, Math.cos(yaw - Math.PI / 2));

      wish.set(0, 0, 0);
      if (keys.has('w') || keys.has('arrowup')) wish.add(forward);
      if (keys.has('s') || keys.has('arrowdown')) wish.sub(forward);
      if (keys.has('a')) wish.sub(right);
      if (keys.has('d')) wish.add(right);

      if (autoTarget) {
        const dx = autoTarget.x - pos.x;
        const dz = autoTarget.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= autoTarget.reach - 0.4) {
          const arrived = autoTarget.id;
          autoTarget = null;
          vel.multiplyScalar(0.25);
          // Only a structure opens on arrival; walking to open ground just stops.
          if (arrived) callbacks.onOpen(arrived);
        } else {
          wish.set(dx / dist, 0, dz / dist);
          // Turn to face where we are walking.
          const want = Math.atan2(dx, dz);
          let delta = want - yaw;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          yaw += delta * Math.min(1, dt * 4.5);
        }
      }

      if (wish.lengthSq() > 0) {
        wish.normalize().multiplyScalar(keys.has('shift') ? SPEED * 1.75 : SPEED);
        if (!moved) {
          moved = true;
          callbacks.onFirstMove();
        }
      }

      vel.lerp(wish, Math.min(1, ACCEL * dt));
      if (vel.lengthSq() < 0.0004) vel.set(0, 0, 0);

      pos.x += vel.x * dt;
      pos.z += vel.z * dt;
      collide();
      updateNear();

      // Jumping. Purely for the fun of it — it changes nothing you can reach.
      if (airborne !== 0 || height > 0) {
        airborne -= GRAVITY * dt;
        height += airborne * dt;
        if (height <= 0) {
          height = 0;
          airborne = 0;
        }
      }
    }

    // A little bob, so walking has weight. Never enough to hurt reading, and
    // dropped entirely for anyone who asked for less motion.
    const bob = reducedMotion
      ? 0
      : Math.sin(clock.elapsedTime * 9) * Math.min(0.045, vel.length() * 0.006);
    camera.position.set(pos.x, EYE + height + bob, pos.z);
    sky.update(pos.x, pos.z);
    aimSun(pos.x, pos.z);
    scenery.update(clock.elapsedTime);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotateY(yaw + Math.PI);
    camera.rotateX(pitch);

    // One write per frame reaches the sky dome and every patched material.
    skyUniforms.uTime.value = clock.elapsedTime;
    camera.updateMatrixWorld();
    skyUniforms.uSunDirView.value
      .copy(skyUniforms.uSunDir.value)
      .transformDirection(camera.matrixWorldInverse);

    updateFocus(dt);

    callbacks.onPose(pos.x, pos.z, yaw);
    post.render(dt);
  }

  frame();

  return {
    resize() {
      frameForAspect();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      post.resize();
    },
    goTo,
    teleport,
    nearest: () => nearId,
    setPaused(value) {
      paused = value;
      if (value) {
        keys.clear();
        vel.set(0, 0, 0);
        autoTarget = null;
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearKeys);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      post.dispose();
      world.dispose();
      scenery.dispose();
      materials.dispose();
      sky.dispose();
      envRT.texture.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
