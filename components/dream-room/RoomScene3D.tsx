'use client';

// 房間布置的真3D場景：書櫃（單一軸向排隊）+ 透明堆疊箱（2D網格、AABB碰撞）兩件家具
// 同時放在同一個場景裡、自由視角鏡頭，取代原本的CSS正視圖版本（2026-08-18正式接上
// /dream-room/room）。洞洞板（離散釘點碰撞模型）還沒做3D版，暫時保留在舊版CSS入口
// （見 PegboardDecoratorLegacy.tsx），不在這個場景裡。
// 源頭是 components/dream-room/3d-test 驗證頁的技術驗證（獨立打磨過拖曳手勢、碰撞模型），
// 那個頁面仍然保留著，之後要驗證新東西（例如洞洞板3D化）可以先在那邊試。
// 共用同一個收藏匣，可以互相跨家具擺放。只有從收藏匣拖進畫面才會新增一份，畫面內移動
// （不管同一件家具內換層架/格子、還是跨家具搬）一律只是搬移，來源那份要正確移除，
// 不能變複製（2026-08-18 Peggy 實測抓到才確認這條規則）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOOKSHELF,
  STACKING_BIN,
  createInitialFurnitureState,
  type FurnitureState,
  type TierDef,
  type TierState,
} from '@/lib/dream-room/furniture';
import {
  computeFitForPlacedItem,
  computeTierFitForCandidate,
  placeItemOnTier,
  removeItemFromTier,
} from '@/lib/dream-room/placement';
import { computeBinFit, placeItemInBin, removeItemFromBin } from '@/lib/dream-room/binPlacement';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import {
  computeBinLayout,
  computeInsertIndex,
  computeTierYBase,
  binCellCenterWorld,
  binCellFromPoint,
  tierItemPositions,
} from '@/lib/dream-room/scene3d';
import ItemTray from '@/components/dream-room/ItemTray';

type BookshelfState = Extract<FurnitureState, { type: 'bookshelf' }>;
type BinState = Extract<FurnitureState, { type: 'stacking-bin' }>;

const GAP_CM = 3; // 層架之間的垂直間距
const SIDE_COLOR = '#c9a27b';
const SIDE_COLOR_HOVER = '#e0b98c';
const BIN_COLOR = '#8fb4c9';
const BIN_COLOR_HOVER = '#a9cbdd';

// 由下往上疊（陣列index2排最下面、index0排最上面，跟FurnitureZoom.tsx的正視圖上到下順序一致），
// 算好每一層的y起點，模組層級算一次即可，家具定義本身不會變動。純幾何計算抽在
// lib/dream-room/scene3d.ts方便單元測試，這裡只留場景本身的常數/JSX。
const TIER_Y_BASE = computeTierYBase(BOOKSHELF.tiers, GAP_CM);
const TOTAL_HEIGHT = Math.max(...BOOKSHELF.tiers.map((t) => TIER_Y_BASE[t.index] + t.clearanceHeightCm));
const MAX_WIDTH = Math.max(...BOOKSHELF.tiers.map((t) => t.usableWidthCm));

// 堆疊箱放在書櫃右邊，兩件家具在同一個房間場景裡，不互相重疊。
const BIN = STACKING_BIN.bin;
const BIN_LAYOUT = computeBinLayout(MAX_WIDTH, BIN, 30);
const BIN_WIDTH = BIN_LAYOUT.width;
const BIN_HEIGHT = BIN_LAYOUT.height;
const BIN_CENTER_X = BIN_LAYOUT.centerX;
const BIN_LEFT = BIN_LAYOUT.left;

interface SceneCtx {
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
}

type HitResult =
  | { kind: 'tier'; tierIndex: number; point: THREE.Vector3 }
  | { kind: 'bin'; col: number; row: number; point: THREE.Vector3 };

function raycastFurniture(
  clientX: number,
  clientY: number,
  ctx: SceneCtx | null,
  tierPlanes: Record<number, THREE.Mesh | null>,
  binPlane: THREE.Mesh | null
): HitResult | null {
  if (!ctx) return null;
  const rect = ctx.gl.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, ctx.camera);
  const targets = [...Object.values(tierPlanes).filter((m): m is THREE.Mesh => m !== null)];
  if (binPlane) targets.push(binPlane);
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const data = hit.object.userData as { kind: 'tier'; tierIndex: number } | { kind: 'bin' };
  if (data.kind === 'tier') return { kind: 'tier', tierIndex: data.tierIndex, point: hit.point };
  const { col, row } = binCellFromPoint(BIN_LAYOUT, hit.point.x, hit.point.y);
  return { kind: 'bin', col, row, point: hit.point };
}

function SceneBridge({ onReady }: { onReady: (ctx: SceneCtx) => void }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    onReady({ camera, gl });
  }, [camera, gl, onReady]);
  return null;
}

// 娃娃只有正面（material-4）貼真實照片，其餘5面（側面/上下/背面）沒有照片可貼，只能給
// 純色佔位——相機不是正對娃娃時這些面會露出來，故意選偏暗的中性色（不是照片的一部分，
// 不該搶視覺重量），比原本的淡褐色 #ddc9b4 更不顯眼，露出來時看起來像陰影面而不是一塊亮白牌子。
const DOLL_SIDE_COLOR = '#5c4f42';

function useDollMaterials(textureUrl: string, opacity = 1) {
  const texture = useTexture(textureUrl);
  return (
    <>
      <meshStandardMaterial attach="material-0" color={DOLL_SIDE_COLOR} transparent={opacity < 1} opacity={opacity} />
      <meshStandardMaterial attach="material-1" color={DOLL_SIDE_COLOR} transparent={opacity < 1} opacity={opacity} />
      <meshStandardMaterial attach="material-2" color={DOLL_SIDE_COLOR} transparent={opacity < 1} opacity={opacity} />
      <meshStandardMaterial attach="material-3" color={DOLL_SIDE_COLOR} transparent={opacity < 1} opacity={opacity} />
      <meshStandardMaterial attach="material-4" map={texture} transparent alphaTest={0.3} opacity={opacity} />
      <meshStandardMaterial attach="material-5" color={DOLL_SIDE_COLOR} transparent={opacity < 1} opacity={opacity} />
    </>
  );
}

// 一隻已經放在層架上、目前沒有被拖曳的娃娃，靜態渲染在算好的貼合位置，貼合狀態
// （擠壓效果）直接沿用lib/dream-room/placement.ts的computeFitForPlacedItem，跟2D版同一套邏輯。
function PlacedDollMesh({
  tier,
  yBase,
  itemId,
  centerX,
  indexInTier,
  onPointerDown,
}: {
  tier: TierState;
  yBase: number;
  itemId: string;
  centerX: number;
  indexInTier: number;
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const item = ROOM_ITEMS_BY_ID[itemId];
  const fit = computeFitForPlacedItem(tier, ROOM_ITEMS_BY_ID, indexInTier);
  const isForceOverflow = fit.class === 'force-overflow';
  const scaleX = fit.widthStatus === 'overflow' ? 1 - fit.widthSquash : 1;
  const scaleY = fit.heightStatus === 'overflow' ? 1 - fit.heightSquash : 1;
  const scaleZ = fit.depthStatus === 'overflow' ? 1 - fit.depthSquash : 1;
  const y = yBase + item.realHeightCm / 2;
  const z = item.realDepthCm / 2;

  return (
    <mesh
      position={[centerX, y, z]}
      scale={[scaleX, scaleY, scaleZ]}
      castShadow
      receiveShadow
      onPointerDown={onPointerDown}
      renderOrder={isForceOverflow ? 1 : 0}
    >
      <boxGeometry args={[item.realWidthCm, item.realHeightCm, item.realDepthCm]} />
      {useDollMaterials(item.image)}
    </mesh>
  );
}

// 堆疊箱裡一隻已放置的娃娃：碰撞是二元的（重疊或不重疊），跟書櫃連續的擠壓比例不同，
// 超出時固定縮小+旋轉一點模擬「硬塞歪了」，跟2D版BinZoom.tsx的scale(0.82) rotate(-3deg)同精神。
function PlacedBinDollMesh({
  bin,
  placedItems,
  placed,
  onPointerDown,
}: {
  bin: BinState['bin'];
  placedItems: BinState['placedItems'];
  placed: BinState['placedItems'][number];
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const item = ROOM_ITEMS_BY_ID[placed.itemId];
  const fit = computeBinFit(bin, placedItems, ROOM_ITEMS_BY_ID, placed.itemId, placed.col, placed.row, placed.placementId);
  const isForceOverflow = fit.class === 'force-overflow';
  const { x, y } = binCellCenterWorld(BIN_LAYOUT, placed.col, placed.row, item);
  const z = item.realDepthCm / 2;

  return (
    <mesh
      position={[x, y, z]}
      rotation={isForceOverflow ? [0, 0, -0.18] : [0, 0, 0]}
      scale={isForceOverflow ? [0.82, 0.82, 0.82] : [1, 1, 1]}
      castShadow
      receiveShadow
      onPointerDown={onPointerDown}
      renderOrder={isForceOverflow ? 1 : 0}
    >
      <boxGeometry args={[item.realWidthCm, item.realHeightCm, item.realDepthCm]} />
      {useDollMaterials(item.image)}
    </mesh>
  );
}

// 正在被拖曳中的娃娃（來源是層架或堆疊箱上既有的項目），用一片面向鏡頭、通過拖曳起點的
// 隱形平面追蹤滑鼠/手指位置，不在拖曳中即時判斷/夾住落點，放開手才由外層做正式的落點判斷。
function DraggingDollMesh({ itemId, livePosition }: { itemId: string; livePosition: THREE.Vector3 }) {
  const item = ROOM_ITEMS_BY_ID[itemId];
  return (
    <mesh position={livePosition} renderOrder={2}>
      <boxGeometry args={[item.realWidthCm, item.realHeightCm, item.realDepthCm]} />
      {useDollMaterials(item.image, 0.9)}
    </mesh>
  );
}

function TierCompartment({
  tier,
  yBase,
  isHovered,
  registerHitPlane,
}: {
  tier: TierDef;
  yBase: number;
  isHovered: boolean;
  registerHitPlane: (tierIndex: number, mesh: THREE.Mesh | null) => void;
}) {
  const w = tier.usableWidthCm;
  const h = tier.clearanceHeightCm;
  const d = tier.usableDepthCm;
  const color = isHovered ? SIDE_COLOR_HOVER : SIDE_COLOR;
  return (
    <group>
      <mesh position={[0, yBase + h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-w / 2, yBase + h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[w / 2, yBase + h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, yBase + h, d / 2]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, yBase, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
      {/* 隱形的落點判定面，蓋住開口整個範圍，拖曳放開手時用射線判斷打中哪一層 */}
      <mesh
        ref={(mesh) => registerHitPlane(tier.index, mesh)}
        position={[0, yBase + h / 2, d / 2]}
        userData={{ kind: 'tier', tierIndex: tier.index }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// 堆疊箱格線：純視覺輔助，讓玩家看得出幾欄幾列，用bufferGeometry手畫線段，
// 座標直接算成世界座標（含BIN_CENTER_X位移），不用額外的group transform。
function BinGridLines({ depth }: { depth: number }) {
  const positions = useMemo(() => {
    const pts: number[] = [];
    for (let c = 0; c <= BIN.cols; c++) {
      const x = BIN_LEFT + c * BIN.cellWidthCm;
      pts.push(x, 0, depth, x, BIN_HEIGHT, depth);
    }
    for (let r = 0; r <= BIN.rows; r++) {
      const y = r * BIN.cellHeightCm;
      pts.push(BIN_LEFT, y, depth, BIN_LEFT + BIN_WIDTH, y, depth);
    }
    return new Float32Array(pts);
  }, [depth]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#5f88a0" transparent opacity={0.5} />
    </lineSegments>
  );
}

// 透明堆疊箱：外殼用半透明材質（呼應「透明」的產品設定），跟書櫃的實木不透明外觀刻意做出區隔。
function BinCompartment({
  isHovered,
  registerHitPlane,
}: {
  isHovered: boolean;
  registerHitPlane: (mesh: THREE.Mesh | null) => void;
}) {
  const w = BIN_WIDTH;
  const h = BIN_HEIGHT;
  const d = BIN.depthCm;
  const cx = BIN_CENTER_X;
  const color = isHovered ? BIN_COLOR_HOVER : BIN_COLOR;
  return (
    <group>
      <mesh position={[cx, h / 2, 0]} receiveShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx - w / 2, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx + w / 2, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx, h, d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[cx, 0, d / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <BinGridLines depth={d} />
      {/* 隱形的落點判定面，覆蓋整個網格，拖曳放開手時用射線+binCellFromPoint算出第幾欄第幾列 */}
      <mesh
        ref={(mesh) => registerHitPlane(mesh)}
        position={[cx, h / 2, d / 2]}
        userData={{ kind: 'bin' }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

// 拖曳中懸停在堆疊箱上方時的落點預覽方塊，綠色代表放得下、紅色代表會重疊/超出深度/超出邊界，
// 跟2D版BinZoom.tsx的hover高亮同一個精神。改用娃娃實際尺寸畫（不是固定一格大小）——娃娃
// 常常比一格大，如果預覽只畫一格，玩家會以為放得下、放開手才發現其實佔了旁邊的格子撞到別隻，
// 這正是「明明看起來有空位卻還是被判定重疊」讓人困惑的主要原因。
function BinHoverPreview({
  col,
  row,
  item,
  fitsOk,
}: {
  col: number;
  row: number;
  item: { realWidthCm: number; realHeightCm: number };
  fitsOk: boolean;
}) {
  const { x, y } = binCellCenterWorld(BIN_LAYOUT, col, row, item);
  return (
    <mesh position={[x, y, BIN.depthCm / 2]}>
      <planeGeometry args={[item.realWidthCm * 0.95, item.realHeightCm * 0.95]} />
      <meshBasicMaterial color={fitsOk ? '#4ade80' : '#f87171'} transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

type DragOrigin = { type: 'tray' } | { type: 'tier'; tierIndex: number } | { type: 'bin' };
type DragInfo = { itemId: string; placementId: string; origin: DragOrigin };

export default function RoomScene3D() {
  const [furnitureState, setFurnitureState] = useState<BookshelfState>(() => createInitialFurnitureState(BOOKSHELF));
  const [binState, setBinState] = useState<BinState>(() => createInitialFurnitureState(STACKING_BIN));
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState({ x: 0, y: 0 });
  const [dragLivePosition, setDragLivePosition] = useState<THREE.Vector3 | null>(null);
  const [hoverTierIndex, setHoverTierIndex] = useState<number | null>(null);
  const [hoverBinCell, setHoverBinCell] = useState<{ col: number; row: number } | null>(null);
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  const sceneCtxRef = useRef<SceneCtx | null>(null);
  const tierPlanesRef = useRef<Record<number, THREE.Mesh | null>>({});
  const binPlaneRef = useRef<THREE.Mesh | null>(null);
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const dragInfoRef = useRef<DragInfo | null>(null);
  useEffect(() => {
    dragInfoRef.current = dragInfo;
  }, [dragInfo]);

  const handleSceneReady = useCallback((ctx: SceneCtx) => {
    sceneCtxRef.current = ctx;
  }, []);
  const registerTierHitPlane = useCallback((tierIndex: number, mesh: THREE.Mesh | null) => {
    tierPlanesRef.current[tierIndex] = mesh;
  }, []);
  const registerBinHitPlane = useCallback((mesh: THREE.Mesh | null) => {
    binPlaneRef.current = mesh;
  }, []);

  function startDrag(itemId: string, placementId: string, origin: DragOrigin, clientX: number, clientY: number) {
    setDragInfo({ itemId, placementId, origin });
    setDragScreenPos({ x: clientX, y: clientY });
    setOrbitEnabled(false);

    if (!sceneCtxRef.current) return;
    let startPoint: THREE.Vector3 | null = null;
    const item = ROOM_ITEMS_BY_ID[itemId];

    if (origin.type === 'tier') {
      const tier = furnitureState.tiers.find((t) => t.index === origin.tierIndex)!;
      const positions = tierItemPositions(tier, tier.placedItems, ROOM_ITEMS_BY_ID);
      const pos = positions.find((p) => p.placementId === placementId);
      startPoint = new THREE.Vector3(pos?.centerX ?? 0, TIER_Y_BASE[origin.tierIndex] + item.realHeightCm / 2, item.realDepthCm / 2);
    } else if (origin.type === 'bin') {
      const placed = binState.placedItems.find((p) => p.placementId === placementId);
      if (placed) {
        const { x, y } = binCellCenterWorld(BIN_LAYOUT, placed.col, placed.row, item);
        startPoint = new THREE.Vector3(x, y, item.realDepthCm / 2);
      }
    }

    if (startPoint) {
      const normal = new THREE.Vector3();
      sceneCtxRef.current.camera.getWorldDirection(normal);
      dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, startPoint);
      setDragLivePosition(startPoint);
    }
  }

  useEffect(() => {
    if (!dragInfo) return;

    function handleMove(e: PointerEvent) {
      setDragScreenPos({ x: e.clientX, y: e.clientY });

      const hit = raycastFurniture(e.clientX, e.clientY, sceneCtxRef.current, tierPlanesRef.current, binPlaneRef.current);
      setHoverTierIndex(hit?.kind === 'tier' ? hit.tierIndex : null);
      setHoverBinCell(hit?.kind === 'bin' ? { col: hit.col, row: hit.row } : null);

      const current = dragInfoRef.current;
      if (current && dragPlaneRef.current && sceneCtxRef.current) {
        const rect = sceneCtxRef.current.gl.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, sceneCtxRef.current.camera);
        const point = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlaneRef.current, point)) {
          setDragLivePosition(point);
        }
      }
    }

    function handleUp(e: PointerEvent) {
      const current = dragInfoRef.current;
      if (!current) return;

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const trayEl = el?.closest('[data-tray-zone]');

      if (trayEl) {
        if (current.origin.type === 'tier') {
          const originTierIndex = current.origin.tierIndex;
          setFurnitureState((prev) => removeItemFromTier(prev, originTierIndex, current.placementId));
        } else if (current.origin.type === 'bin') {
          setBinState((prev) => removeItemFromBin(prev, current.placementId));
        }
      } else {
        const hit = raycastFurniture(e.clientX, e.clientY, sceneCtxRef.current, tierPlanesRef.current, binPlaneRef.current);
        if (hit?.kind === 'tier') {
          setFurnitureState((prev) => {
            const tier = prev.tiers.find((t) => t.index === hit.tierIndex)!;
            const insertAt = computeInsertIndex(tier, hit.point.x, current.placementId, ROOM_ITEMS_BY_ID);
            let placed = placeItemOnTier(prev, hit.tierIndex, current.placementId, current.itemId, insertAt);
            // 只有從收藏匣拖進畫面才是「新增一份」，畫面內移動（不管同一件家具內換層架、
            // 還是跨家具搬）一律只是搬移，來源那份都要清掉，不能變複製。
            if (current.origin.type === 'tier' && current.origin.tierIndex !== hit.tierIndex) {
              placed = removeItemFromTier(placed, current.origin.tierIndex, current.placementId);
            }
            return placed;
          });
          if (current.origin.type === 'bin') {
            setBinState((prev) => removeItemFromBin(prev, current.placementId));
          }
        } else if (hit?.kind === 'bin') {
          setBinState((prev) => placeItemInBin(prev, current.placementId, current.itemId, hit.col, hit.row, ROOM_ITEMS_BY_ID));
          // 同一堆疊箱內搬移由placeItemInBin自己去重處理；跨家具(書櫃→堆疊箱)要另外把書櫃那份清掉。
          if (current.origin.type === 'tier') {
            const originTierIndex = current.origin.tierIndex;
            setFurnitureState((prev) => removeItemFromTier(prev, originTierIndex, current.placementId));
          }
        }
      }

      setDragInfo(null);
      setDragLivePosition(null);
      setHoverTierIndex(null);
      setHoverBinCell(null);
      setOrbitEnabled(true);
      dragPlaneRef.current = null;
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragInfo]);

  const dragImage = dragInfo?.origin.type === 'tray' ? ROOM_ITEMS_BY_ID[dragInfo.itemId] : null;

  const hoverFitClass = useMemo(() => {
    if (!dragInfo || hoverTierIndex === null) return null;
    const tier = furnitureState.tiers.find((t) => t.index === hoverTierIndex);
    if (!tier) return null;
    return computeTierFitForCandidate(tier, ROOM_ITEMS_BY_ID, dragInfo.itemId).class;
  }, [dragInfo, hoverTierIndex, furnitureState]);

  const binHoverFit = useMemo(() => {
    if (!dragInfo || !hoverBinCell) return null;
    return computeBinFit(BIN, binState.placedItems, ROOM_ITEMS_BY_ID, dragInfo.itemId, hoverBinCell.col, hoverBinCell.row, dragInfo.placementId);
  }, [dragInfo, hoverBinCell, binState]);

  return (
    <div className="relative">
      <div className="h-[65vh] w-full overflow-hidden rounded-3xl bg-[#2b2420]">
        <Canvas shadows camera={{ position: [110, 65, 150], fov: 40 }}>
          <SceneBridge onReady={handleSceneReady} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[60, 70, 60]}
            intensity={1.1}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          {BOOKSHELF.tiers.map((tier) => (
            <TierCompartment
              key={tier.index}
              tier={tier}
              yBase={TIER_Y_BASE[tier.index]}
              isHovered={hoverTierIndex === tier.index}
              registerHitPlane={registerTierHitPlane}
            />
          ))}
          {furnitureState.tiers.map((tier) => {
            const positions = tierItemPositions(tier, tier.placedItems, ROOM_ITEMS_BY_ID);
            return tier.placedItems.map((placed, indexInTier) => {
              if (dragInfo?.origin.type === 'tier' && dragInfo.placementId === placed.placementId) return null;
              const pos = positions.find((p) => p.placementId === placed.placementId);
              if (!pos) return null;
              return (
                <PlacedDollMesh
                  key={placed.placementId}
                  tier={tier}
                  yBase={TIER_Y_BASE[tier.index]}
                  itemId={placed.itemId}
                  centerX={pos.centerX}
                  indexInTier={indexInTier}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startDrag(placed.itemId, placed.placementId, { type: 'tier', tierIndex: tier.index }, e.nativeEvent.clientX, e.nativeEvent.clientY);
                  }}
                />
              );
            });
          })}

          <BinCompartment isHovered={hoverBinCell !== null} registerHitPlane={registerBinHitPlane} />
          {binState.placedItems.map((placed) => {
            if (dragInfo?.origin.type === 'bin' && dragInfo.placementId === placed.placementId) return null;
            return (
              <PlacedBinDollMesh
                key={placed.placementId}
                bin={binState.bin}
                placedItems={binState.placedItems}
                placed={placed}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startDrag(placed.itemId, placed.placementId, { type: 'bin' }, e.nativeEvent.clientX, e.nativeEvent.clientY);
                }}
              />
            );
          })}
          {dragInfo && hoverBinCell && binHoverFit && (
            <BinHoverPreview
              col={hoverBinCell.col}
              row={hoverBinCell.row}
              item={ROOM_ITEMS_BY_ID[dragInfo.itemId]}
              fitsOk={binHoverFit.class === 'fits'}
            />
          )}

          {dragInfo && dragLivePosition && <DraggingDollMesh itemId={dragInfo.itemId} livePosition={dragLivePosition} />}

          <mesh position={[BIN_CENTER_X / 2, -0.5, 20]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[400, 400]} />
            <meshStandardMaterial color="#3a322c" />
          </mesh>
          <OrbitControls
            enabled={orbitEnabled}
            target={[BIN_CENTER_X / 2, TOTAL_HEIGHT / 2, 10]}
            minDistance={30}
            maxDistance={260}
          />
        </Canvas>
      </div>

      <ItemTray
        draggingItemId={dragInfo?.itemId ?? null}
        onItemPointerDown={(itemId, e) => startDrag(itemId, crypto.randomUUID(), { type: 'tray' }, e.clientX, e.clientY)}
      />

      {hoverFitClass && (
        <p className="mt-1 text-center text-[11px] text-[#8a7362]">
          {hoverFitClass === 'force-overflow' ? '這層會塞不下，硬放會被擠壓' : hoverFitClass === 'snug-fit' ? '剛剛好' : '放得下'}
        </p>
      )}
      {binHoverFit && (
        <p className="mt-1 text-center text-[11px] text-[#8a7362]">
          {binHoverFit.class === 'force-overflow' ? '這格放不下（重疊/超出範圍/太厚）' : '放得下'}
        </p>
      )}

      {dragImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dragImage.image}
          alt=""
          draggable={false}
          className="pointer-events-none fixed z-[100] h-16 w-16 -translate-x-1/2 -translate-y-1/2 object-contain opacity-90 drop-shadow-[0_4px_10px_rgba(90,74,66,0.5)]"
          style={{ left: dragScreenPos.x, top: dragScreenPos.y }}
        />
      )}
    </div>
  );
}
