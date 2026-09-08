import * as THREE from 'three';
import { applySkyShading } from './shaders/skyMaterial';

/**
 * The traveller.
 *
 * Built from primitives — no rig, no imported model. A lathe for the robe, a
 * sphere for the head, a cone for the hood, two stubs for arms. All the life
 * comes from procedural motion driven by speed, because a skeletal rig for
 * four poses would cost more than it returns.
 *
 * The silhouette is the point: a small hooded figure with a long robe, lit so
 * the edge glows against the sky.
 */

export interface Character {
  group: THREE.Group;
  /** Shoulder anchors in world space, for the cape to hang from. */
  shoulders: [THREE.Vector3, THREE.Vector3];
  /**
   * @param dt      real seconds
   * @param speed   ground speed in m/s
   * @param airborne true while off the ground
   */
  update(dt: number, speed: number, airborne: boolean, elapsed: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}


export function buildCharacter(reducedMotion: boolean): Character {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const robeMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({ color: 0xd8c39c, roughness: 0.82, metalness: 0 }),
    { rimColor: 0xffe6bc, rimStrength: 1.5 },
  );
  const skinMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({ color: 0xf0e2cd, roughness: 0.7, metalness: 0 }),
    { rimColor: 0xffe9c4, rimStrength: 1.4 },
  );
  const markMaterial = track(
    new THREE.MeshBasicMaterial({ color: 0xffe9c4, toneMapped: false }),
  );
  disposables.push(robeMaterial, skinMaterial);

  /** The torso: a lathe, so the robe flares from the shoulders to the hem. */
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.20, 0.02),
    new THREE.Vector2(0.235, 0.22),
    new THREE.Vector2(0.215, 0.52),
    new THREE.Vector2(0.175, 0.82),
    new THREE.Vector2(0.145, 1.0),
    new THREE.Vector2(0.128, 1.12),
    new THREE.Vector2(0.001, 1.16),
  ];
  const torsoGeo = track(new THREE.LatheGeometry(profile, 18));
  const torso = new THREE.Mesh(torsoGeo, robeMaterial);
  torso.castShadow = true;

  /** Pivot at the hem, so leaning rotates the figure about its feet. */
  const body = new THREE.Group();
  body.add(torso);
  group.add(body);

  const headGeo = track(new THREE.SphereGeometry(0.125, 18, 14));
  const head = new THREE.Mesh(headGeo, skinMaterial);
  head.position.y = 1.26;
  head.castShadow = true;
  body.add(head);

  const hoodGeo = track(new THREE.ConeGeometry(0.155, 0.3, 16, 1, true));
  const hood = new THREE.Mesh(hoodGeo, robeMaterial);
  hood.position.y = 1.31;
  body.add(hood);

  // No face, just a mark where one would be — as in the references.
  const markGeo = track(new THREE.PlaneGeometry(0.07, 0.028));
  const mark = new THREE.Mesh(markGeo, markMaterial);
  mark.position.set(0, 1.27, 0.121);
  body.add(mark);

  const armGeo = track(new THREE.CapsuleGeometry(0.042, 0.26, 4, 8));
  const arms: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, robeMaterial);
    arm.position.set(side * 0.175, 0.94, 0);
    arm.castShadow = true;
    body.add(arm);
    arms.push(arm);
  }

  const legGeo = track(new THREE.CapsuleGeometry(0.037, 0.2, 4, 8));
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, skinMaterial);
    leg.position.set(side * 0.062, 0.13, 0);
    body.add(leg);
    legs.push(leg);
  }

  const shoulders: [THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(),
    new THREE.Vector3(),
  ];
  const shoulderLocal: [THREE.Vector3, THREE.Vector3] = [
    // Well behind the spine: at 3cm the cloth hung flush against the robe and
    // vanished into it, leaving only the corners visible at the shoulders.
    new THREE.Vector3(-0.17, 1.09, -0.14),
    new THREE.Vector3(0.17, 1.09, -0.14),
  ];

  /** Cross-faded so a change of gait never snaps. */
  let gait = 0;
  let cycle = 0;

  return {
    group,
    shoulders,
    update(dt, speed, airborne, elapsed) {
      // 0 standing, 1 running. Smoothed, so states blend rather than switch.
      const wanted = Math.min(1, speed / 12);
      gait += (wanted - gait) * Math.min(1, dt * 6);

      if (!reducedMotion) {
        // The stride runs off distance covered, so the feet do not skate.
        cycle += dt * (2.0 + gait * 1.4) * (0.35 + gait * 0.8) * Math.PI * 2;

        const swing = Math.sin(cycle);
        const bob = Math.abs(Math.sin(cycle)) * (0.012 + gait * 0.045);
        // Breathing when still, a real bob when moving.
        const breathe = Math.sin(elapsed * 1.6) * 0.008 * (1 - gait);
        body.position.y = bob + breathe;
        body.rotation.x = gait * 0.16 + (airborne ? 0.12 : 0);
        body.rotation.z = swing * 0.04 * gait;

        for (let i = 0; i < 2; i += 1) {
          const dir = i === 0 ? 1 : -1;
          arms[i].rotation.x = airborne ? -0.5 : swing * dir * (0.25 + gait * 0.75);
          arms[i].position.z = airborne ? -0.06 : swing * dir * 0.05 * gait;
          legs[i].rotation.x = airborne ? -0.2 * dir : -swing * dir * (0.15 + gait * 0.7);
        }
      } else {
        body.position.y = 0;
        body.rotation.set(0, 0, 0);
      }

      group.updateMatrixWorld();
      for (let i = 0; i < 2; i += 1) {
        shoulders[i].copy(shoulderLocal[i]).applyMatrix4(body.matrixWorld);
      }
    },
    setOpacity(value: number) {
      const transparent = value < 0.99;
      for (const m of [robeMaterial, skinMaterial, markMaterial]) {
        m.transparent = transparent;
        m.opacity = value;
        m.depthWrite = !transparent;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.clear();
    },
  };
}
