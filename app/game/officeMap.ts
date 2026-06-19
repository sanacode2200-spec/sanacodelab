import * as THREE from "three";
import { CHARACTER_ROSTER } from "./characters";
import { bearingTo, OFFICE_CENTER, orientObjectOnSphere, pointOnDisc, SphericalPoint } from "./sphere";

export interface DeskPlacement {
  characterId: string;
  point: SphericalPoint;
  yaw: number;
}

export const DESK_PLACEMENTS: DeskPlacement[] = CHARACTER_ROSTER.map((character) => ({
  characterId: character.id,
  point: character.home,
  yaw: bearingTo(character.home, OFFICE_CENTER),
}));

function box(w: number, h: number, d: number, color: number) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

function cyl(r1: number, r2: number, h: number, color: number, segments = 24) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, segments), new THREE.MeshLambertMaterial({ color }));
}

export function addOfficeMap(scene: THREE.Scene) {
  const furniture = new THREE.Group();
  scene.add(furniture);

  for (const desk of DESK_PLACEMENTS) {
    const base = new THREE.Group();
    const table = box(2.4, 0.28, 1.15, 0xffffff);
    table.position.y = 0.75;
    base.add(table);
    const monitor = box(0.72, 0.48, 0.08, 0x111827);
    monitor.position.set(0, 1.15, -0.35);
    base.add(monitor);
    const monitor2 = box(0.58, 0.4, 0.08, 0x111827);
    monitor2.position.set(0.55, 1.1, -0.28);
    monitor2.rotation.y = -0.22;
    base.add(monitor2);
    const chair = box(0.72, 0.62, 0.65, 0xd7dce2);
    chair.position.set(0, 0.55, 1.05);
    base.add(chair);
    orientObjectOnSphere(base, desk.point, undefined, desk.yaw, 0.02);
    furniture.add(base);
  }

  const meeting = new THREE.Group();
  const table = cyl(1.85, 1.85, 0.3, 0xffffff, 36);
  table.position.y = 0.68;
  meeting.add(table);
  for (let i = 0; i < 6; i++) {
    const chair = box(0.55, 0.48, 0.55, 0xd7dce2);
    const a = (i / 6) * Math.PI * 2;
    chair.position.set(Math.sin(a) * 2.55, 0.48, Math.cos(a) * 2.55);
    chair.rotation.y = a + Math.PI;
    meeting.add(chair);
  }
  orientObjectOnSphere(meeting, OFFICE_CENTER, undefined, 0);
  furniture.add(meeting);

  const loungePoint = pointOnDisc(OFFICE_CENTER, 11, 130);
  const lounge = new THREE.Group();
  const counter = box(2.9, 0.85, 0.75, 0xd8b37c);
  counter.position.y = 0.55;
  lounge.add(counter);
  const sofaA = box(1.65, 0.55, 0.72, 0xcfd6dc);
  sofaA.position.set(-1.5, 0.43, 1.25);
  lounge.add(sofaA);
  const sofaB = box(1.65, 0.55, 0.72, 0xcfd6dc);
  sofaB.position.set(1.5, 0.43, 1.25);
  lounge.add(sofaB);
  orientObjectOnSphere(lounge, loungePoint, undefined, bearingTo(loungePoint, OFFICE_CENTER));
  furniture.add(lounge);

  const plantPoints = [
    [6, 22.5], [13, 67.5], [6, 112.5], [13, 157.5], [6, 202.5], [13, 247.5], [6, 292.5], [13, 337.5],
  ];
  for (const [radiusDeg, angleDeg] of plantPoints) {
    const point = pointOnDisc(OFFICE_CENTER, radiusDeg, angleDeg);
    const plant = new THREE.Group();
    const pot = cyl(0.28, 0.34, 0.38, 0xb7895f, 12);
    pot.position.y = 0.22;
    plant.add(pot);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), new THREE.MeshLambertMaterial({ color: 0x48b46b }));
    leaves.position.y = 0.82;
    plant.add(leaves);
    orientObjectOnSphere(plant, point, undefined, angleDeg * (Math.PI / 180));
    furniture.add(plant);
  }

  return furniture;
}
