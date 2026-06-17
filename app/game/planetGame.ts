import * as THREE from "three";
import { CHARACTERS, CharacterData, findCharacterByQuery } from "@/lib/characters";

const RADIUS = 15;
const PLAYER_SPEED = 5.2;
const TURN_SPEED = 2.4;
const NPC_MOVE_SPEED = 6.5;
const NEAR_DIST = 3.4;
const DELIVER_DIST = 1.8;
const ARRIVED_DIST = 3.6;

export interface NearInfo {
  name: string;
  department: string;
  color: string;
}

export interface PlanetGameCallbacks {
  onNear: (info: NearInfo | null) => void;
  onDeliver: (data: CharacterData) => void;
  onProgress: (delivered: number, total: number) => void;
  onClear: () => void;
}

interface HumanoidParts {
  bodyRoot: THREE.Group;
  head: THREE.Mesh;
  torso: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
}

interface Humanoid {
  root: THREE.Group;
  parts: HumanoidParts;
}

interface Npc {
  data: CharacterData;
  homeDir: THREE.Vector3;
  posDir: THREE.Vector3;
  forward: THREE.Vector3;
  moveTarget: THREE.Vector3 | null;
  delivered: boolean;
  bobPhase: number;
  humanoid: Humanoid;
  pillar: THREE.Mesh;
  pillarLight: THREE.PointLight;
}

function darken(hex: number, factor: number): number {
  const r = ((hex >> 16) & 0xff) * factor;
  const g = ((hex >> 8) & 0xff) * factor;
  const b = (hex & 0xff) * factor;
  return (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b);
}

function createHumanoid(primaryColor: number, limbColor: number, scale = 1): Humanoid {
  const root = new THREE.Group();
  const bodyRoot = new THREE.Group();
  root.add(bodyRoot);

  const skinMat = new THREE.MeshStandardMaterial({
    color: primaryColor,
    flatShading: true,
    roughness: 0.7,
  });
  const limbMat = new THREE.MeshStandardMaterial({
    color: limbColor,
    flatShading: true,
    roughness: 0.7,
  });

  const hipY = 0.62;
  const shoulderY = 1.28;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.26), skinMat);
  torso.position.y = hipY + 0.28;
  bodyRoot.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 6), skinMat);
  head.position.y = hipY + 0.56 + 0.24;
  bodyRoot.add(head);

  function makeLimbPivot(length: number, width: number, x: number, y: number, mat: THREE.Material) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, width), mat);
    mesh.position.y = -length / 2;
    pivot.add(mesh);
    bodyRoot.add(pivot);
    return pivot;
  }

  const leftArm = makeLimbPivot(0.5, 0.14, 0.32, shoulderY, limbMat);
  const rightArm = makeLimbPivot(0.5, 0.14, -0.32, shoulderY, limbMat);
  const leftLeg = makeLimbPivot(0.62, 0.16, 0.14, hipY, limbMat);
  const rightLeg = makeLimbPivot(0.62, 0.16, -0.14, hipY, limbMat);

  root.scale.setScalar(scale);

  return {
    root,
    parts: { bodyRoot, head, torso, leftArm, rightArm, leftLeg, rightLeg },
  };
}

const basisMatrix = new THREE.Matrix4();
function orientOnSphere(obj: THREE.Object3D, posDir: THREE.Vector3, forward: THREE.Vector3, radius: number) {
  const up = posDir;
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize();
  obj.position.copy(posDir).multiplyScalar(radius);
  basisMatrix.makeBasis(right, up, fwd.clone().multiplyScalar(-1));
  obj.quaternion.setFromRotationMatrix(basisMatrix);
}

function fibonacciSphereDirs(n: number): THREE.Vector3[] {
  const dirs: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * i + 1) / n;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * radiusAtY;
    const z = Math.sin(theta) * radiusAtY;
    dirs.push(new THREE.Vector3(x, y, z).normalize());
  }
  return dirs;
}

export class PlanetGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private rafId = 0;
  private disposed = false;

  private playerPos = new THREE.Vector3(0, 1, 0);
  private playerForward = new THREE.Vector3(1, 0, 0);
  private playerHumanoid: Humanoid;

  private keys = new Set<string>();
  private virtualMove = { turn: 0, forward: 0 };

  private npcs: Npc[] = [];
  private deliveredCount = 0;
  private lastNearId: string | null = null;

  private callbacks: PlanetGameCallbacks;
  private resizeObserver: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement, callbacks: PlanetGameCallbacks) {
    this.callbacks = callbacks;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);

    this.buildPlanet();
    this.buildStarField();
    this.buildLights();

    this.playerHumanoid = createHumanoid(0xf0f0f0, 0x1a2a4a);
    this.scene.add(this.playerHumanoid.root);

    this.buildNpcs();

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    const parent = canvas.parentElement;
    if (parent && "ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(parent);
    }
    this.handleResize();
  }

  private buildPlanet() {
    const geometry = new THREE.IcosahedronGeometry(RADIUS, 2);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2f6b3a,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    });
    const planet = new THREE.Mesh(geometry, material);
    this.scene.add(planet);
  }

  private buildStarField() {
    const count = 2500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 250 + Math.random() * 250;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, sizeAttenuation: false });
    const stars = new THREE.Points(geometry, material);
    this.scene.add(stars);
  }

  private buildLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(80, 120, 60);
    this.scene.add(sun);
  }

  private buildNpcs() {
    const dirs = fibonacciSphereDirs(CHARACTERS.length);
    CHARACTERS.forEach((data, i) => {
      const homeDir = dirs[i];
      const humanoid = createHumanoid(data.colorHex, darken(data.colorHex, 0.55));
      this.scene.add(humanoid.root);

      const pillarGeo = new THREE.CylinderGeometry(0.18, 0.22, 3.2, 6, 1, true);
      const pillarMat = new THREE.MeshStandardMaterial({
        color: data.colorHex,
        emissive: data.colorHex,
        emissiveIntensity: 1.3,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.copy(homeDir).multiplyScalar(RADIUS + 1.6);
      pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), homeDir);
      this.scene.add(pillar);

      const pillarLight = new THREE.PointLight(data.colorHex, 1.4, 7);
      pillarLight.position.copy(homeDir).multiplyScalar(RADIUS + 2.6);
      this.scene.add(pillarLight);

      const worldUpHelper = Math.abs(homeDir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const forward = new THREE.Vector3().crossVectors(worldUpHelper, homeDir).normalize();

      this.npcs.push({
        data,
        homeDir: homeDir.clone(),
        posDir: homeDir.clone(),
        forward,
        moveTarget: null,
        delivered: false,
        bobPhase: Math.random() * Math.PI * 2,
        humanoid,
        pillar,
        pillarLight,
      });
    });
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
  };
  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private handleResize = () => {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement;
    const width = parent ? parent.clientWidth : window.innerWidth;
    const height = parent ? parent.clientHeight : window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  };

  setVirtualMove(turn: number, forward: number) {
    this.virtualMove.turn = turn;
    this.virtualMove.forward = forward;
  }

  start() {
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.1);
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private getInput() {
    let turn = this.virtualMove.turn;
    let move = this.virtualMove.forward;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) turn += 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) turn -= 1;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) move += 1;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) move -= 1;
    return {
      turn: Math.max(-1, Math.min(1, turn)),
      move: Math.max(-1, Math.min(1, move)),
    };
  }

  private update(dt: number) {
    const { turn, move } = this.getInput();
    const t = this.clock.elapsedTime;

    if (turn !== 0) {
      const q = new THREE.Quaternion().setFromAxisAngle(this.playerPos, turn * TURN_SPEED * dt);
      this.playerForward.applyQuaternion(q);
    }

    if (move !== 0) {
      const axis = new THREE.Vector3().crossVectors(this.playerPos, this.playerForward).normalize();
      const angle = (move * PLAYER_SPEED * dt) / RADIUS;
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
      this.playerPos.applyQuaternion(q);
      this.playerForward.applyQuaternion(q);
    }

    this.playerPos.normalize();
    this.playerForward.sub(this.playerPos.clone().multiplyScalar(this.playerForward.dot(this.playerPos))).normalize();

    orientOnSphere(this.playerHumanoid.root, this.playerPos, this.playerForward, RADIUS);
    this.animateWalk(this.playerHumanoid.parts, t, Math.abs(move));

    this.updateNpcs(dt, t);
    this.updateCamera(dt);
    this.checkProximity();
  }

  private animateWalk(parts: HumanoidParts, t: number, amount: number) {
    if (amount > 0.02) {
      const swing = Math.sin(t * 9) * 0.55 * amount;
      parts.leftLeg.rotation.x = swing;
      parts.rightLeg.rotation.x = -swing;
      parts.leftArm.rotation.x = -swing * 0.7;
      parts.rightArm.rotation.x = swing * 0.7;
      parts.bodyRoot.position.y = Math.abs(Math.sin(t * 9)) * 0.03;
    } else {
      parts.leftLeg.rotation.x *= 0.8;
      parts.rightLeg.rotation.x *= 0.8;
      parts.leftArm.rotation.x *= 0.8;
      parts.rightArm.rotation.x *= 0.8;
      parts.bodyRoot.position.y *= 0.8;
    }
  }

  private updateNpcs(dt: number, t: number) {
    for (const npc of this.npcs) {
      if (npc.moveTarget) {
        const angularDist = npc.posDir.angleTo(npc.moveTarget);
        if (angularDist < 0.02) {
          npc.posDir.copy(npc.moveTarget);
          npc.moveTarget = null;
        } else {
          const axis = new THREE.Vector3().crossVectors(npc.posDir, npc.moveTarget).normalize();
          const maxAngle = (NPC_MOVE_SPEED * dt) / RADIUS;
          const angle = Math.min(maxAngle, angularDist);
          const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
          npc.posDir.applyQuaternion(q);
          const proj = npc.moveTarget
            .clone()
            .sub(npc.posDir.clone().multiplyScalar(npc.posDir.dot(npc.moveTarget)));
          if (proj.lengthSq() > 1e-6) npc.forward.copy(proj.normalize());
        }
      }
      npc.posDir.normalize();
      npc.forward.sub(npc.posDir.clone().multiplyScalar(npc.forward.dot(npc.posDir))).normalize();

      orientOnSphere(npc.humanoid.root, npc.posDir, npc.forward, RADIUS);

      const parts = npc.humanoid.parts;
      if (npc.delivered) {
        parts.leftArm.rotation.x = -2.5;
        parts.rightArm.rotation.x = -2.5;
        parts.leftArm.rotation.z = 0.25;
        parts.rightArm.rotation.z = -0.25;
        parts.bodyRoot.position.y = 0;
      } else if (npc.moveTarget) {
        this.animateWalk(parts, t, 1);
      } else {
        parts.bodyRoot.position.y = Math.sin(t * 2 + npc.bobPhase) * 0.06;
        parts.leftArm.rotation.z = Math.sin(t * 1.6 + npc.bobPhase) * 0.1;
        parts.rightArm.rotation.z = -Math.sin(t * 1.6 + npc.bobPhase) * 0.1;
        parts.leftArm.rotation.x *= 0.8;
        parts.rightArm.rotation.x *= 0.8;
        parts.leftLeg.rotation.x *= 0.8;
        parts.rightLeg.rotation.x *= 0.8;
      }
    }
  }

  private tmpCamTarget = new THREE.Vector3();
  private tmpLookTarget = new THREE.Vector3();
  private updateCamera(dt: number) {
    const playerWorldPos = this.playerPos.clone().multiplyScalar(RADIUS);
    const up = this.playerPos;
    const camHeight = 3.0;
    const camBack = 6.2;
    const lookAheadHeight = 1.1;

    this.tmpCamTarget
      .copy(playerWorldPos)
      .addScaledVector(up, camHeight)
      .addScaledVector(this.playerForward, -camBack);

    const lerpFactor = 1 - Math.exp(-7 * dt);
    this.camera.position.lerp(this.tmpCamTarget, lerpFactor);
    this.camera.up.copy(up);

    this.tmpLookTarget.copy(playerWorldPos).addScaledVector(up, lookAheadHeight);
    this.camera.lookAt(this.tmpLookTarget);
  }

  private checkProximity() {
    const playerWorldPos = this.playerPos.clone().multiplyScalar(RADIUS);
    let nearest: Npc | null = null;
    let nearestDist = Infinity;
    for (const npc of this.npcs) {
      const npcWorldPos = npc.posDir.clone().multiplyScalar(RADIUS);
      const dist = npcWorldPos.distanceTo(playerWorldPos);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = npc;
      }
    }

    const nearId = nearest && nearestDist < NEAR_DIST ? nearest.data.id : null;
    if (nearId !== this.lastNearId) {
      this.lastNearId = nearId;
      if (nearest && nearId) {
        this.callbacks.onNear({
          name: nearest.data.name,
          department: nearest.data.department,
          color: nearest.data.color,
        });
      } else {
        this.callbacks.onNear(null);
      }
    }

    if (nearest && nearestDist < DELIVER_DIST && !nearest.delivered) {
      nearest.delivered = true;
      this.deliveredCount += 1;
      this.dimPillar(nearest);
      this.callbacks.onDeliver(nearest.data);
      this.callbacks.onProgress(this.deliveredCount, this.npcs.length);
      if (this.deliveredCount >= this.npcs.length) {
        this.callbacks.onClear();
      }
    }
  }

  private dimPillar(npc: Npc) {
    const mat = npc.pillar.material as THREE.MeshStandardMaterial;
    mat.color.set(0x444444);
    mat.emissive.set(0x222222);
    mat.emissiveIntensity = 0.1;
    mat.opacity = 0.22;
    npc.pillarLight.intensity = 0;
  }

  callCharacterByName(query: string): CharacterData | null {
    const data = findCharacterByQuery(query);
    if (!data) return null;
    const npc = this.npcs.find((n) => n.data.id === data.id);
    if (!npc) return null;
    this.setNpcTargetNearPlayer(npc, 0);
    return data;
  }

  gatherAll(): void {
    this.npcs.forEach((npc, i) => this.setNpcTargetNearPlayer(npc, i));
  }

  private setNpcTargetNearPlayer(npc: Npc, slotIndex: number) {
    const angleOffset = (slotIndex / Math.max(1, this.npcs.length)) * Math.PI * 2;
    const right = new THREE.Vector3().crossVectors(this.playerForward, this.playerPos).normalize();
    const dir = this.playerForward.clone().multiplyScalar(Math.cos(angleOffset)).addScaledVector(right, Math.sin(angleOffset));
    const arcAngle = 3.0 / RADIUS;
    const axis = new THREE.Vector3().crossVectors(this.playerPos, dir).normalize();
    const target = this.playerPos.clone();
    if (axis.lengthSq() > 1e-6) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, arcAngle);
      target.applyQuaternion(q);
    }
    npc.moveTarget = target.normalize();
  }

  getArrivedCharacterIds(): string[] {
    const playerWorldPos = this.playerPos.clone().multiplyScalar(RADIUS);
    return this.npcs
      .filter((npc) => npc.posDir.clone().multiplyScalar(RADIUS).distanceTo(playerWorldPos) < ARRIVED_DIST)
      .map((npc) => npc.data.id);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
  }
}
