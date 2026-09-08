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
  const tunicMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({ color: 0xb8763c, roughness: 0.85, metalness: 0 }),
    { rimColor: 0xffcf94, rimStrength: 1.4 },
  );
  const skinMaterial = applySkyShading(
    new THREE.MeshStandardMaterial({ color: 0xf0e2cd, roughness: 0.7, metalness: 0 }),
    { rimColor: 0xffe9c4, rimStrength: 1.4 },
  );
  const markMaterial = track(
    new THREE.MeshBasicMaterial({ color: 0xffe9c4, toneMapped: false }),
  );
  disposables.push(robeMaterial, tunicMaterial, skinMaterial);

  /**
   * A body, not a bollard.
   *
   * The first version was a single lathe from shoulder to floor, which is why
   * it read as a skittle: no waist, no hips, no legs, nothing to say which way
   * was forward. This is built as parts — chest, a tunic flaring from the
   * hips, and two visible legs beneath it — with the proportions the reference
   * uses: a large head on a small body, roughly four and a half heads tall.
   */
  const body = new THREE.Group();
  group.add(body);

  // Chest: narrow at the waist, widening to the shoulders.
  const chestGeo = track(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(0.105, 0.02),
        new THREE.Vector2(0.118, 0.16),
        new THREE.Vector2(0.132, 0.3),
        new THREE.Vector2(0.118, 0.4),
        new THREE.Vector2(0.001, 0.43),
      ],
      16,
    ),
  );
  const chest = new THREE.Mesh(chestGeo, robeMaterial);
  chest.position.y = 0.86;
  chest.castShadow = true;
  body.add(chest);

  // The tunic: flares from the hips and stops above the knee, so the legs read.
  const tunicGeo = track(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0.42),
        new THREE.Vector2(0.118, 0.4),
        new THREE.Vector2(0.155, 0.22),
        new THREE.Vector2(0.185, 0.04),
        new THREE.Vector2(0.19, 0),
        new THREE.Vector2(0.001, 0),
      ],
      16,
    ),
  );
  const tunic = new THREE.Mesh(tunicGeo, tunicMaterial);
  tunic.position.y = 0.62;
  tunic.castShadow = true;
  body.add(tunic);

  const headGeo = track(new THREE.SphereGeometry(0.148, 20, 16));
  const head = new THREE.Mesh(headGeo, skinMaterial);
  head.position.y = 1.44;
  head.scale.set(1, 1.06, 0.96);
  head.castShadow = true;
  body.add(head);

  // The hood sits back off the crown, the way a pushed-back hood does.
  const hoodGeo = track(new THREE.SphereGeometry(0.163, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62));
  const hood = new THREE.Mesh(hoodGeo, robeMaterial);
  hood.position.set(0, 1.45, -0.022);
  hood.rotation.x = -0.22;
  body.add(hood);

  // No face, just a mark where one would be — as in the references.
  const markGeo = track(new THREE.PlaneGeometry(0.075, 0.03));
  const mark = new THREE.Mesh(markGeo, markMaterial);
  mark.position.set(0, 1.44, 0.143);
  body.add(mark);

  const armGeo = track(new THREE.CapsuleGeometry(0.031, 0.3, 4, 8));
  const arms: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, skinMaterial);
    arm.position.set(side * 0.132, 1.06, 0);
    arm.castShadow = true;
    body.add(arm);
    arms.push(arm);
  }

  // Legs, long enough to be seen below the tunic — the thing that most made
  // the first version read as an object rather than a person.
  const legGeo = track(new THREE.CapsuleGeometry(0.036, 0.44, 4, 8));
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, skinMaterial);
    leg.position.set(side * 0.058, 0.3, 0);
    leg.castShadow = true;
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
    new THREE.Vector3(-0.15, 1.25, -0.13),
    new THREE.Vector3(0.15, 1.25, -0.13),
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
      for (const m of [robeMaterial, tunicMaterial, skinMaterial, markMaterial]) {
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
