import * as THREE from "three";
import charactersJson from "@/config/characters.json";
import { OFFICE_CENTER, pointOnDisc, SphericalPoint } from "./sphere";
import { hex } from "./theme";

export type CharacterStatus = "未着手" | "進行中" | "完了";

export interface OfficeCharacter {
  id: string;
  name: string;
  department: string;
  color: string;
  colorHex: number;
  line: string;
  home: SphericalPoint;
  task: string;
  status: CharacterStatus;
  speechStyle: string;
  personality: string;
  // public/models/ 内のVRMファイル名。null ならBox人型で表示する。
  vrmFile: string | null;
}

// 部署とキャラは config/characters.json が単一ソース。会社を作り変えるときはJSONを編集する。
// home(配置)は OFFICE_CENTER を中心とした扇形エリアに placement から計算する。
export const CHARACTER_ROSTER: OfficeCharacter[] = charactersJson.roster.map((c) => ({
  id: c.id,
  name: c.name,
  department: c.department,
  color: c.color,
  colorHex: hex(c.color),
  line: c.line,
  home: pointOnDisc(OFFICE_CENTER, c.placement.radiusDeg, c.placement.angleDeg),
  task: c.task,
  status: "未着手" as CharacterStatus,
  speechStyle: c.speechStyle,
  personality: c.personality,
  vrmFile: c.vrmFile,
}));

export interface PlayerConfig {
  id: string;
  name: string;
  color: string;
  colorHex: number;
  vrmFile: string | null;
}

export const PLAYER_CONFIG: PlayerConfig = {
  id: charactersJson.player.id,
  name: charactersJson.player.name,
  color: charactersJson.player.color,
  colorHex: hex(charactersJson.player.color),
  vrmFile: charactersJson.player.vrmFile,
};

export interface HumanoidParts {
  body: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

function mat(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

function limb(parent: THREE.Group, size: [number, number, number], x: number, y: number, z: number, material: THREE.Material) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.y = -size[1] / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

// VRMが読み込めなかった場合のフォールバック表示として使う、プリミティブ組み合わせの棒人間。
// 既存の body グループ(VRMロード中はプレースホルダー、ロード失敗時はこれを差し込む)へ直接パーツを追加する。
export function attachHumanoidPrimitive(body: THREE.Group, torsoColor: number): HumanoidParts {
  const skin = mat(0xffffff);
  const torsoMat = mat(torsoColor);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.3), torsoMat);
  torso.position.y = 0.95;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 18, 12), skin);
  head.position.y = 1.62;
  body.add(head);

  const leftArm = limb(body, [0.2, 0.6, 0.2], 0.43, 1.28, 0, skin);
  const rightArm = limb(body, [0.2, 0.6, 0.2], -0.43, 1.28, 0, skin);
  const leftLeg = limb(body, [0.22, 0.6, 0.22], 0.18, 0.58, 0, torsoMat);
  const rightLeg = limb(body, [0.22, 0.6, 0.22], -0.18, 0.58, 0, torsoMat);

  return { body, head, torso, leftArm, rightArm, leftLeg, rightLeg };
}

export function createHumanoid(torsoColor: number, scale = 1) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(scale);
  const parts = attachHumanoidPrimitive(body, torsoColor);
  return { root, ...parts };
}

export function animateHumanoid(parts: HumanoidParts, t: number, mode: CharacterStatus | "walk", amount = 1) {
  parts.body.position.y *= 0.84;
  parts.leftArm.rotation.set(0, 0, 0);
  parts.rightArm.rotation.set(0, 0, 0);
  parts.leftLeg.rotation.set(0, 0, 0);
  parts.rightLeg.rotation.set(0, 0, 0);

  if (mode === "walk") {
    const swing = Math.sin(t * 10) * 0.58 * amount;
    parts.leftLeg.rotation.x = swing;
    parts.rightLeg.rotation.x = -swing;
    parts.leftArm.rotation.x = -swing * 0.75;
    parts.rightArm.rotation.x = swing * 0.75;
    parts.body.position.y = Math.abs(Math.sin(t * 10)) * 0.04;
    return;
  }

  if (mode === "進行中") {
    const tap = Math.sin(t * 22) * 0.12;
    parts.leftArm.rotation.x = -1.25 + tap;
    parts.rightArm.rotation.x = -1.25 - tap;
    return;
  }

  if (mode === "完了") {
    parts.body.position.y = -0.18;
    parts.leftLeg.rotation.x = -0.9;
    parts.rightLeg.rotation.x = -0.9;
    parts.leftArm.rotation.x = -0.4;
    parts.rightArm.rotation.x = -0.4;
    return;
  }

  parts.body.position.y = Math.sin(t * 1.8) * 0.035;
}

export function characterByName(input: string) {
  return CHARACTER_ROSTER.find((character) => input.includes(character.name));
}

export function characterByDepartment(department: string) {
  return CHARACTER_ROSTER.find((character) => department.includes(character.department));
}
