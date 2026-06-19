import * as THREE from "three";

let sharedGradientMap: THREE.DataTexture | null = null;
let sharedGradientSteps = 0;

// MeshToonMaterial の gradientMap 用に、暗→明の段階的な階調テクスチャをコードで生成する(画像ファイル不要)。
// テクスチャは全マテリアルで共有し、NearestFilter で段差をくっきり出す。RGBA各チャンネルへ
// 同じ値を入れておかないと(例: RedFormatのみ)、シェーダー側の .rgb サンプリングで色が偏る。
export function getGradientMap(steps = 3) {
  if (sharedGradientMap && sharedGradientSteps === steps) return sharedGradientMap;
  sharedGradientMap?.dispose();

  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const value = Math.round(((i + 1) / steps) * 255);
    data[i * 4 + 0] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  sharedGradientMap = texture;
  sharedGradientSteps = steps;
  return texture;
}

export function toonMaterial(color: number, steps = 3) {
  return new THREE.MeshToonMaterial({ color, gradientMap: getGradientMap(steps) });
}

export const OUTLINE_SCALE = 1.045;

const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });

// バックフェース法によるアウトライン。mesh は事前に親へ add しておくこと(同じ親に複製を追加するため)。
export function addOutline(mesh: THREE.Mesh, scale = OUTLINE_SCALE) {
  const parent = mesh.parent;
  if (!parent) return null;
  const outline = new THREE.Mesh(mesh.geometry, outlineMaterial);
  outline.position.copy(mesh.position);
  outline.rotation.copy(mesh.rotation);
  outline.scale.copy(mesh.scale).multiplyScalar(scale);
  parent.add(outline);
  return outline;
}
