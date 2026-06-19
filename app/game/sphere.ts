import * as THREE from "three";

export const PLANET_RADIUS = 60;
export const DEG = Math.PI / 180;

export interface SphericalPoint {
  lat: number;
  lon: number;
}

// 全部署をこの一点を中心にした扇形/円形エリアに集約する
export const OFFICE_CENTER: SphericalPoint = { lat: 0, lon: 0 };
export const OFFICE_AREA_SOFT_RADIUS = 20 * DEG;
export const OFFICE_AREA_HARD_RADIUS = 27 * DEG;

const basisMatrix = new THREE.Matrix4();

export function clampLat(lat: number) {
  return THREE.MathUtils.clamp(lat, -88 * DEG, 88 * DEG);
}

export function normalizeLon(lon: number) {
  return THREE.MathUtils.euclideanModulo(lon + Math.PI, Math.PI * 2) - Math.PI;
}

export function latLonToDir(lat: number, lon: number) {
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    cosLat * Math.sin(lon),
    Math.sin(lat),
    cosLat * Math.cos(lon)
  ).normalize();
}

export function dirToLatLon(dir: THREE.Vector3): SphericalPoint {
  const n = dir.clone().normalize();
  return {
    lat: Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)),
    lon: Math.atan2(n.x, n.z),
  };
}

export function tangentBasis(dir: THREE.Vector3, lon = 0) {
  const up = dir.clone().normalize();
  let east = new THREE.Vector3(Math.cos(lon), 0, -Math.sin(lon));
  if (east.lengthSq() < 1e-5) east = new THREE.Vector3(1, 0, 0);
  east.sub(up.clone().multiplyScalar(east.dot(up))).normalize();
  const north = new THREE.Vector3().crossVectors(up, east).normalize();
  return { up, east, north };
}

export function orientObjectOnSphere(
  object: THREE.Object3D,
  point: SphericalPoint,
  radius = PLANET_RADIUS,
  yaw = 0,
  height = 0
) {
  const dir = latLonToDir(point.lat, point.lon);
  const { up, east, north } = tangentBasis(dir, point.lon);
  const forward = north.multiplyScalar(Math.cos(yaw)).addScaledVector(east, Math.sin(yaw)).normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  basisMatrix.makeBasis(right, up, forward.clone().multiplyScalar(-1));
  object.quaternion.setFromRotationMatrix(basisMatrix);
  object.position.copy(dir).multiplyScalar(radius + height);
}

export function rotateDirToward(from: THREE.Vector3, to: THREE.Vector3, maxAngle: number) {
  const angle = from.angleTo(to);
  if (angle <= maxAngle || angle < 1e-5) return to.clone().normalize();
  const axis = new THREE.Vector3().crossVectors(from, to);
  if (axis.lengthSq() < 1e-8) return from.clone().normalize();
  axis.normalize();
  return from.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, maxAngle)).normalize();
}

export function offsetPoint(point: SphericalPoint, northMeters: number, eastMeters: number, radius = PLANET_RADIUS) {
  return {
    lat: clampLat(point.lat + northMeters / radius),
    lon: normalizeLon(point.lon + eastMeters / (radius * Math.max(0.12, Math.cos(point.lat)))),
  };
}

// center から方位角 angleDeg(0=北, 時計回り) 方向に角距離 radiusDeg だけ離れた点を返す
export function pointOnDisc(center: SphericalPoint, radiusDeg: number, angleDeg: number, radius = PLANET_RADIUS) {
  const radiusRad = radiusDeg * DEG;
  const angleRad = angleDeg * DEG;
  const northMeters = Math.cos(angleRad) * radiusRad * radius;
  const eastMeters = Math.sin(angleRad) * radiusRad * radius;
  return offsetPoint(center, northMeters, eastMeters, radius);
}

// from から to への初期方位角(0=北, 時計回り)を返す。orientObjectOnSphere の yaw と同じ規約
export function bearingTo(from: SphericalPoint, to: SphericalPoint) {
  const fromDir = latLonToDir(from.lat, from.lon);
  const toDir = latLonToDir(to.lat, to.lon);
  const { east, north } = tangentBasis(fromDir, from.lon);
  const delta = toDir.clone().sub(fromDir.clone().multiplyScalar(toDir.dot(fromDir)));
  if (delta.lengthSq() < 1e-10) return 0;
  delta.normalize();
  return Math.atan2(delta.dot(east), delta.dot(north));
}
