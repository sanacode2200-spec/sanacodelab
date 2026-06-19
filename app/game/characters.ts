import * as THREE from "three";
import { OFFICE_CENTER, pointOnDisc, SphericalPoint } from "./sphere";

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
}

// 7部署を OFFICE_CENTER を中心とした扇形エリア(方位角±60度、半径8〜13度)にまとめて配置
export const CHARACTER_ROSTER: OfficeCharacter[] = [
  { id: "aoi", name: "アオイ", department: "開発部", color: "#4488ff", colorHex: 0x4488ff, line: "受け取った。実装する。", home: pointOnDisc(OFFICE_CENTER, 8, -60), task: "UI基盤の調整", status: "未着手" },
  { id: "koyuki", name: "コユキ", department: "品質保証部", color: "#ff88cc", colorHex: 0xff88cc, line: "確認します。品質は妥協しません。", home: pointOnDisc(OFFICE_CENTER, 11, -40), task: "回帰テスト", status: "未着手" },
  { id: "take", name: "タケ", department: "商品企画部", color: "#ffaa22", colorHex: 0xffaa22, line: "了解。数字に落とす。", home: pointOnDisc(OFFICE_CENTER, 13, -20), task: "KPI整理", status: "未着手" },
  { id: "tsumugi", name: "ツムギ", department: "編集部", color: "#88ffaa", colorHex: 0x88ffaa, line: "ありがとうございます。丁寧に仕上げます。", home: pointOnDisc(OFFICE_CENTER, 9, 0), task: "リリース文面", status: "未着手" },
  { id: "haru", name: "ハル", department: "マーケティング部", color: "#ff6644", colorHex: 0xff6644, line: "やった!すぐ動く!", home: pointOnDisc(OFFICE_CENTER, 13, 20), task: "告知準備", status: "未着手" },
  { id: "fuji", name: "フジ", department: "デザイン部", color: "#cc88ff", colorHex: 0xcc88ff, line: "受け取った。ビジュアルに落とす。", home: pointOnDisc(OFFICE_CENTER, 11, 40), task: "ビジュアル案", status: "未着手" },
  { id: "tsukasa", name: "ツカサ", department: "リサーチ部", color: "#44ffee", colorHex: 0x44ffee, line: "了解。裏取りする。", home: pointOnDisc(OFFICE_CENTER, 8, 60), task: "競合調査", status: "未着手" },
];

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
