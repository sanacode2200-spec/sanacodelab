import * as THREE from "three";
import { OFFICE_CENTER, orientObjectOnSphere, pointOnDisc, bearingTo } from "./sphere";
import { theme, hex } from "./theme";
import { addOutlineDeep, toonMaterial } from "./toonShading";

const B = theme.buildings;

function box(w: number, h: number, d: number, color: number) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toonMaterial(color));
}

// 1棟分の建物(本体+屋根+窓ストライプ)。原点が地面、+Yが上、正面は+Z(=オフィス中心向き)。
function makeBuilding(width: number, height: number, depth: number, bodyColor: number) {
  const building = new THREE.Group();

  const body = box(width, height, depth, bodyColor);
  body.position.y = height / 2;
  building.add(body);

  const roof = box(width * 1.08, 0.4, depth * 1.08, hex(B.roof));
  roof.position.y = height + 0.18;
  building.add(roof);

  // 正面(+Z)に窓の横ストライプを数段
  const rows = Math.max(1, Math.floor(height / 1.6));
  for (let r = 0; r < rows; r++) {
    const win = box(width * 0.78, 0.5, 0.06, hex(B.accent));
    win.position.set(0, 1.1 + r * 1.5, depth / 2 + 0.04);
    building.add(win);
  }

  return building;
}

// オフィス(到達エリア)の外周に街並みのビル群を環状に並べる。装飾用なので当たり判定はなし。
export function addEnvironment(scene: THREE.Scene) {
  if (!B.enabled) return null;

  const town = new THREE.Group();
  scene.add(town);

  const palette = B.palette;
  const count = 30;
  for (let i = 0; i < count; i++) {
    const angleDeg = (i / count) * 360;
    // 到達ハード境界(27°)のすぐ外側に2列。球面の曲率で隠れないよう背を高くしてスカイラインにする。
    const radiusDeg = 28.5 + (i % 2) * 3.2;
    const point = pointOnDisc(OFFICE_CENTER, radiusDeg, angleDeg);

    const width = 3.6 + (i % 4) * 1.1;
    const height = 8 + ((i * 37) % 6) * 2.4;
    const depth = 3.4 + (i % 3) * 1.0;
    const color = hex(palette[i % palette.length]);

    const building = makeBuilding(width, height, depth, color);
    // 建物の正面(+Z)をオフィス中心へ向ける
    orientObjectOnSphere(building, point, undefined, bearingTo(point, OFFICE_CENTER));
    town.add(building);
  }

  addOutlineDeep(town);
  return town;
}
