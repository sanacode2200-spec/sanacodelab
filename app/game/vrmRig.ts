import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMExpressionPresetName, VRMHumanBoneName, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { attachHumanoidPrimitive, animateHumanoid, CharacterStatus, HumanoidParts } from "./characters";

// VRoid Studio書き出しのVRMは身長約1.7mで、Box人型(約2.0m)より小さく見える。
// 他キャラ(Box)と並んだときのバランスを取るため拡大する。
export const VRM_SCALE = 1.3;

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group;
  update(dt: number, t: number, mode: CharacterStatus | "walk", amount: number): void;
}

let sharedLoader: GLTFLoader | null = null;
function getLoader() {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    sharedLoader.register((parser) => new VRMLoaderPlugin(parser));
  }
  return sharedLoader;
}

function createPlaceholder() {
  const placeholder = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x999999, transparent: true, opacity: 0.55 })
  );
  placeholder.position.y = 0.9;
  return placeholder;
}

// VRMの素体はTポーズ(腕が真横)なので、毎フレームこの基本姿勢で上書きしてから
// モード別のアニメーションを乗せる。ARM_DOWN_Zで腕を体側へ下ろす(自然な立ち姿)。
const ARM_DOWN_Z = 1.25;

function applyRestPose(humanoid: VRM["humanoid"]) {
  if (!humanoid) return;
  humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperLeg)?.rotation.set(0, 0, 0);
  humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperLeg)?.rotation.set(0, 0, 0);
  humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm)?.rotation.set(0, 0, -ARM_DOWN_Z);
  humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm)?.rotation.set(0, 0, ARM_DOWN_Z);
  humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm)?.rotation.set(0, 0, 0);
  humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm)?.rotation.set(0, 0, 0);
}

// vrmUrl が null の場合(config/characters.json で vrmFile 未指定)は、VRMを読みに行かず
// 最初からBox人型で表示する(無駄な404やロード待ちが出ない)。
export function createCharacterRig(vrmUrl: string | null, fallbackColor: number, scale = 1): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(scale);

  let vrm: VRM | null = null;
  let primitive: HumanoidParts | null = null;
  let hipsRestY = 0;

  if (!vrmUrl) {
    primitive = attachHumanoidPrimitive(body, fallbackColor);
    return {
      root,
      body,
      update(dt, t, mode, amount) {
        if (primitive) animateHumanoid(primitive, t, mode, amount);
      },
    };
  }

  const placeholder = createPlaceholder();
  body.add(placeholder);

  getLoader()
    .loadAsync(vrmUrl)
    .then((gltf) => {
      const loaded = gltf.userData.vrm as VRM | undefined;
      if (!loaded) throw new Error("gltf.userData.vrm が見つかりません(VRMLoaderPluginが効いていない可能性)");

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
      if (loaded.meta?.metaVersion === "0") VRMUtils.rotateVRM0(loaded);
      // VRMの正面は-Zだが、rig(orientObjectOnSphere+heading)の前方は+Z。
      // 180°回して、W前進時に進行方向を向いて歩くようにする。
      loaded.scene.rotation.y += Math.PI;
      loaded.scene.traverse((obj) => {
        obj.frustumCulled = false;
      });
      loaded.scene.scale.setScalar(VRM_SCALE);

      body.remove(placeholder);
      body.add(loaded.scene);
      hipsRestY = loaded.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Hips)?.position.y ?? 0;
      vrm = loaded;
    })
    .catch((err) => {
      console.error(`[vrm] ${vrmUrl} の読み込みに失敗したため、プレースホルダー人形を表示します`, err);
      body.remove(placeholder);
      primitive = attachHumanoidPrimitive(body, fallbackColor);
    });

  function updateVrm(v: VRM, t: number, mode: CharacterStatus | "walk", amount: number) {
    const humanoid = v.humanoid;
    // まず腕を下ろした自然な立ち姿(A-pose)にリセットしてからモード別動作を乗せる。
    // 上腕は z(ARM_DOWN_Z)で体側へ下ろしているので、各モードでは x のみ更新して z を保つ。
    applyRestPose(humanoid);
    const leftArm = humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
    const rightArm = humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
    const hips = humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Hips);

    if (mode === "walk") {
      const swing = Math.sin(t * 10) * 0.5 * amount;
      humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperLeg)?.rotation.set(swing, 0, 0);
      humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightUpperLeg)?.rotation.set(-swing, 0, 0);
      if (leftArm) leftArm.rotation.x = -swing * 0.6;
      if (rightArm) rightArm.rotation.x = swing * 0.6;
      if (hips) hips.position.y = hipsRestY + Math.abs(Math.sin(t * 10)) * 0.03;
    } else if (mode === "進行中") {
      const tap = Math.sin(t * 22) * 0.1;
      if (leftArm) leftArm.rotation.x = -0.9 + tap;
      if (rightArm) rightArm.rotation.x = -0.9 - tap;
      if (hips) hips.position.y = hipsRestY + Math.sin(t * 1.8) * 0.012;
    } else if (mode === "完了") {
      humanoid?.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperLeg)?.rotation.set(-0.5, 0, 0);
      humanoid?.getNormalizedBoneNode(VRMHumanBoneName.RightUpperLeg)?.rotation.set(-0.5, 0, 0);
      if (leftArm) leftArm.rotation.x = -0.3;
      if (rightArm) rightArm.rotation.x = -0.3;
      if (hips) hips.position.y = hipsRestY - 0.1;
    } else if (hips) {
      hips.position.y = hipsRestY + Math.sin(t * 1.8) * 0.012;
    }

    // 納品完了(タスク完了)時は「笑顔」表情に切り替える(表情がないVRMでは何も起きない)
    v.expressionManager?.setValue(VRMExpressionPresetName.Happy, mode === "完了" ? 1 : 0);
  }

  return {
    root,
    body,
    update(dt, t, mode, amount) {
      if (vrm) {
        updateVrm(vrm, t, mode, amount);
        vrm.update(dt);
      } else if (primitive) {
        animateHumanoid(primitive, t, mode, amount);
      }
    },
  };
}
