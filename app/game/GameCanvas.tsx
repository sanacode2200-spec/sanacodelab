"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import {
  animateHumanoid,
  characterByName,
  CHARACTER_ROSTER,
  CharacterStatus,
  createHumanoid,
  HumanoidParts,
  OfficeCharacter,
} from "./characters";
import { addOfficeMap } from "./officeMap";
import { addOutline, toonMaterial } from "./toonShading";
import {
  bearingTo,
  clampLat,
  DEG,
  dirToLatLon,
  latLonToDir,
  normalizeLon,
  offsetPoint,
  OFFICE_AREA_HARD_RADIUS,
  OFFICE_AREA_SOFT_RADIUS,
  OFFICE_CENTER,
  orientObjectOnSphere,
  PLANET_RADIUS,
  pointOnDisc,
  rotateDirToward,
  SphericalPoint,
  tangentBasis,
} from "./sphere";

export interface NotionTask {
  id: string;
  title: string;
  department: string;
  status: CharacterStatus;
}

export interface NearCharacter {
  name: string;
  department: string;
  task: string;
  status: CharacterStatus;
  color: string;
}

export interface GameCanvasHandle {
  callCharacter: (name: string) => OfficeCharacter | null;
  gatherAll: (meeting?: boolean) => void;
  dismissAll: () => void;
  setTasks: (tasks: NotionTask[]) => void;
  getProgress: () => { done: number; total: number };
  getCharacterSnapshot: () => { name: string; department: string; task: string; status: CharacterStatus }[];
}

interface Props {
  onNearChange: (near: NearCharacter | null) => void;
  onProgressChange: (done: number, total: number) => void;
}

interface NpcState {
  data: OfficeCharacter;
  parts: HumanoidParts;
  point: SphericalPoint;
  target: SphericalPoint;
  yaw: number;
  meetingSeat?: SphericalPoint;
}

// 速度は実際の歩く速さ(m/s)で指定し、半径に応じて角速度に変換する
const PLAYER_SPEED_MPS = 4.2;
const NPC_SPEED_MPS = 3.2;
const PLAYER_SPEED = PLAYER_SPEED_MPS / PLANET_RADIUS;
const TURN_SPEED = 1.9;
const NPC_SPEED = NPC_SPEED_MPS / PLANET_RADIUS;
const PLAYER_HEIGHT = 0.06;
const MEETING_CENTER = OFFICE_CENTER;
// 半径18基準で調整されていた着席の輪の大きさ(実寸)を保つための縮尺
const MEETING_SEAT_RADIUS_DEG = 12 * (18 / PLANET_RADIUS);
const PLAYER_SPAWN_POINT = pointOnDisc(OFFICE_CENTER, 6, 180);
const PLAYER_MEETING_SPOT = pointOnDisc(OFFICE_CENTER, 5, 180);

class OfficePlanetGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.1, 800);
  private clock = new THREE.Clock();
  private raf = 0;
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;
  private keys = new Set<string>();
  private touch = { active: false, x: 0, y: 0, dx: 0, dy: 0 };
  private player = createHumanoid(0x172554, 1);
  private playerPoint: SphericalPoint = { ...PLAYER_SPAWN_POINT };
  private heading = 0;
  private npcs: NpcState[] = [];
  private lastNearId: string | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private props: Props
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xdff7ff, 1);
    this.renderer.shadowMap.enabled = true;

    this.buildWorld();
    this.scene.add(this.player.root);
    this.buildCharacters();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);

    const parent = canvas.parentElement;
    if (parent) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(parent);
    }
    this.resize();
    this.props.onProgressChange(0, CHARACTER_ROSTER.length);
  }

  start() {
    this.clock.start();
    const frame = () => {
      if (this.disposed) return;
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.renderer.dispose();
  }

  callCharacter(name: string) {
    const data = characterByName(name);
    if (!data) return null;
    const npc = this.npcs.find((item) => item.data.id === data.id);
    if (!npc) return null;
    npc.target = offsetPoint(this.playerPoint, -2.3, 1.1);
    return data;
  }

  gatherAll(meeting = true) {
    this.npcs.forEach((npc, i) => {
      const seatAngle = (i / this.npcs.length) * 360;
      npc.meetingSeat = pointOnDisc(OFFICE_CENTER, MEETING_SEAT_RADIUS_DEG, seatAngle);
      npc.target = npc.meetingSeat;
    });
    if (meeting) this.playerPoint = { ...PLAYER_MEETING_SPOT };
  }

  dismissAll() {
    this.npcs.forEach((npc) => {
      npc.target = { ...npc.data.home };
      npc.meetingSeat = undefined;
    });
  }

  setTasks(tasks: NotionTask[]) {
    for (const npc of this.npcs) {
      const task = tasks.find((item) => item.department === npc.data.department);
      if (!task) continue;
      npc.data.task = task.title || npc.data.task;
      npc.data.status = task.status;
    }
    const { done, total } = this.getProgress();
    this.props.onProgressChange(done, total);
  }

  getProgress() {
    const total = this.npcs.length;
    const done = this.npcs.filter((npc) => npc.data.status === "完了").length;
    return { done, total };
  }

  getCharacterSnapshot() {
    return this.npcs.map((npc) => ({
      name: npc.data.name,
      department: npc.data.department,
      task: npc.data.task,
      status: npc.data.status,
    }));
  }

  private buildWorld() {
    this.scene.fog = new THREE.Fog(0xe9fbff, 90, 220);

    const ambient = new THREE.AmbientLight(0xffffff, 0.42);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(35, 60, 50);
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS, 96, 48),
      toonMaterial(0xe9d7b5)
    );
    this.scene.add(floor);
    addOutline(floor, 1.004);

    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(PLANET_RADIUS + 0.018, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x4f6f77, wireframe: true, transparent: true, opacity: 0.1 })
    );
    this.scene.add(wire);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(360, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0xd9f7ff, side: THREE.BackSide })
    );
    this.scene.add(sky);

    for (let i = 0; i < 18; i++) {
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(10 + Math.random() * 10, 2.2 + Math.random() * 2.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false })
      );
      const dir = latLonToDir((-35 + Math.random() * 70) * DEG, Math.random() * Math.PI * 2);
      cloud.position.copy(dir.multiplyScalar(96 + Math.random() * 40));
      cloud.lookAt(0, 0, 0);
      this.scene.add(cloud);
    }

    addOfficeMap(this.scene);
  }

  private buildCharacters() {
    this.npcs = CHARACTER_ROSTER.map((character, i) => {
      const parts = createHumanoid(character.colorHex, 0.94);
      this.scene.add(parts.root);
      return {
        data: { ...character },
        parts,
        point: { ...character.home },
        target: { ...character.home },
        yaw: bearingTo(character.home, OFFICE_CENTER),
        meetingSeat: i === -1 ? MEETING_CENTER : undefined,
      };
    });
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      event.preventDefault();
    }
    this.keys.add(event.code);
  };

  private onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    this.touch = { active: true, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.touch.active) return;
    this.touch.dx = THREE.MathUtils.clamp((event.clientX - this.touch.x) / 70, -1, 1);
    this.touch.dy = THREE.MathUtils.clamp((event.clientY - this.touch.y) / 70, -1, 1);
  };

  private onPointerUp = () => {
    this.touch.active = false;
    this.touch.dx = 0;
    this.touch.dy = 0;
  };

  private resize() {
    const parent = this.renderer.domElement.parentElement;
    const w = parent?.clientWidth ?? window.innerWidth;
    const h = parent?.clientHeight ?? window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private input() {
    let turn = this.touch.dx;
    let move = -this.touch.dy;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) turn += 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) turn -= 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) move += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) move -= 1;
    return {
      turn: THREE.MathUtils.clamp(turn, -1, 1),
      move: THREE.MathUtils.clamp(move, -1, 1),
    };
  }

  // OFFICE_AREA_SOFT_RADIUS を超えて外へ進もうとする分だけ歩幅を縮め、HARD_RADIUS で完全に止める。
  // 内側に戻る/縁に沿って歩く動きは抵抗を受けない。
  private confineToOfficeArea(prevPoint: SphericalPoint) {
    const centerDir = latLonToDir(OFFICE_CENTER.lat, OFFICE_CENTER.lon);
    const prevDir = latLonToDir(prevPoint.lat, prevPoint.lon);
    const naiveDir = latLonToDir(this.playerPoint.lat, this.playerPoint.lon);
    const prevDist = prevDir.angleTo(centerDir);
    const naiveDist = naiveDir.angleTo(centerDir);
    if (naiveDist <= prevDist || prevDist <= OFFICE_AREA_SOFT_RADIUS) return;
    const resistance = THREE.MathUtils.clamp(
      (OFFICE_AREA_HARD_RADIUS - prevDist) / (OFFICE_AREA_HARD_RADIUS - OFFICE_AREA_SOFT_RADIUS),
      0,
      1
    );
    const stepAngle = prevDir.angleTo(naiveDir);
    const limited = rotateDirToward(prevDir, naiveDir, stepAngle * resistance);
    this.playerPoint = dirToLatLon(limited);
  }

  private update(dt: number) {
    const t = this.clock.elapsedTime;
    const { turn, move } = this.input();
    const prevPoint = { ...this.playerPoint };
    this.heading = normalizeLon(this.heading + turn * TURN_SPEED * dt);
    this.playerPoint.lat = clampLat(this.playerPoint.lat + Math.cos(this.heading) * move * PLAYER_SPEED * dt);
    this.playerPoint.lon = normalizeLon(
      this.playerPoint.lon + (Math.sin(this.heading) * move * PLAYER_SPEED * dt) / Math.max(0.12, Math.cos(this.playerPoint.lat))
    );
    this.confineToOfficeArea(prevPoint);
    orientObjectOnSphere(this.player.root, this.playerPoint, PLANET_RADIUS, this.heading, PLAYER_HEIGHT);
    animateHumanoid(this.player, t, Math.abs(move) > 0.04 ? "walk" : "未着手", Math.abs(move));

    this.updateNpcs(dt, t);
    this.updateCamera(dt);
    this.updateNear();
  }

  private updateNpcs(dt: number, t: number) {
    for (const npc of this.npcs) {
      const dir = latLonToDir(npc.point.lat, npc.point.lon);
      const targetDir = latLonToDir(npc.target.lat, npc.target.lon);
      const next = rotateDirToward(dir, targetDir, NPC_SPEED * dt);
      npc.point = dirToLatLon(next);
      const moving = next.angleTo(targetDir) > 0.015;
      if (moving) {
        const { east, north } = tangentBasis(next, npc.point.lon);
        const delta = targetDir.clone().sub(next.clone().multiplyScalar(targetDir.dot(next))).normalize();
        npc.yaw = Math.atan2(delta.dot(east), delta.dot(north));
      } else {
        const home = npc.meetingSeat ? MEETING_CENTER : npc.data.home;
        const homeDir = latLonToDir(home.lat, home.lon);
        const { east, north } = tangentBasis(next, npc.point.lon);
        const look = homeDir.sub(next.clone().multiplyScalar(homeDir.dot(next))).normalize();
        if (look.lengthSq() > 0.001) npc.yaw = Math.atan2(look.dot(east), look.dot(north));
      }
      orientObjectOnSphere(npc.parts.root, npc.point, PLANET_RADIUS, npc.yaw, 0.04);
      animateHumanoid(npc.parts, t, moving ? "walk" : npc.data.status, 1);
    }
  }

  private tmpCam = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();
  private updateCamera(dt: number) {
    const dir = latLonToDir(this.playerPoint.lat, this.playerPoint.lon);
    const { up, east, north } = tangentBasis(dir, this.playerPoint.lon);
    const forward = north.multiplyScalar(Math.cos(this.heading)).addScaledVector(east, Math.sin(this.heading)).normalize();
    const playerWorld = dir.multiplyScalar(PLANET_RADIUS);

    this.tmpCam.copy(playerWorld).addScaledVector(up, 5.2).addScaledVector(forward, -10.5);
    this.tmpLook.copy(playerWorld).addScaledVector(up, 2.0).addScaledVector(forward, 3.3);

    const k = 1 - Math.exp(-6.5 * dt);
    this.camera.position.lerp(this.tmpCam, k);
    this.camera.up.lerp(up, k).normalize();
    this.camera.lookAt(this.tmpLook);
  }

  private updateNear() {
    const playerDir = latLonToDir(this.playerPoint.lat, this.playerPoint.lon);
    let nearest: NpcState | null = null;
    let nearestMeters = Infinity;
    for (const npc of this.npcs) {
      const dist = playerDir.angleTo(latLonToDir(npc.point.lat, npc.point.lon)) * PLANET_RADIUS;
      if (dist < nearestMeters) {
        nearestMeters = dist;
        nearest = npc;
      }
    }

    const id = nearest && nearestMeters < 3 ? nearest.data.id : null;
    if (id === this.lastNearId) return;
    this.lastNearId = id;
    this.props.onNearChange(
      nearest && id
        ? {
            name: nearest.data.name,
            department: nearest.data.department,
            task: nearest.data.task,
            status: nearest.data.status,
            color: nearest.data.color,
          }
        : null
    );
  }
}

const GameCanvas = forwardRef<GameCanvasHandle, Props>(function GameCanvas(props, ref) {
  const { onNearChange, onProgressChange } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<OfficePlanetGame | null>(null);

  useImperativeHandle(ref, () => ({
    callCharacter: (name) => gameRef.current?.callCharacter(name) ?? null,
    gatherAll: (meeting) => gameRef.current?.gatherAll(meeting),
    dismissAll: () => gameRef.current?.dismissAll(),
    setTasks: (tasks) => gameRef.current?.setTasks(tasks),
    getProgress: () => gameRef.current?.getProgress() ?? { done: 0, total: CHARACTER_ROSTER.length },
    getCharacterSnapshot: () => gameRef.current?.getCharacterSnapshot() ?? [],
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new OfficePlanetGame(canvasRef.current, { onNearChange, onProgressChange });
    gameRef.current = game;
    game.start();
    return () => {
      game.dispose();
      gameRef.current = null;
    };
  }, [onNearChange, onProgressChange]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
});

export default GameCanvas;
