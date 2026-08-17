'use client';

// 真3D技術驗證的第二階段：不再是寫死2隻娃娃的靜態展示，改成接上正式的資料層
// （lib/dream-room/furniture.ts的BOOKSHELF定義、lib/dream-room/placement.ts的碰撞/貼合純函式、
// 完整8隻ROOM_ITEMS），驗證「真3D渲染」跟「現有房間布置的資料/狀態模型」接得起來、
// 拖曳互動（收藏匣→層架、層架內換位置、層架→層架、拖回收藏匣移除）在3D下走得通。
// 仍然是獨立的驗證頁面，沒有接進正式的/dream-room/room（那邊還是CSS正視圖版本）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import {
  BOOKSHELF,
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
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import ItemTray from '@/components/dream-room/ItemTray';

type BookshelfState = Extract<FurnitureState, { type: 'bookshelf' }>;

const GAP_CM = 3; // 層架之間的垂直間距
const SIDE_COLOR = '#c9a27b';
const SIDE_COLOR_HOVER = '#e0b98c';

// 由下往上疊（陣列index2排最下面、index0排最上面，跟FurnitureZoom.tsx的正視圖上到下順序一致），
// 算好每一層的y起點，模組層級算一次即可，家具定義本身不會變動。
const TIER_Y_BASE: Record<number, number> = (() => {
  const orderedBottomUp = [...BOOKSHELF.tiers].sort((a, b) => b.index - a.index);
  let cursor = 0;
  const map: Record<number, number> = {};
  for (const tier of orderedBottomUp) {
    map[tier.index] = cursor;
    cursor += tier.clearanceHeightCm + GAP_CM;
  }
  return map;
})();
const TOTAL_HEIGHT = Math.max(...BOOKSHELF.tiers.map((t) => TIER_Y_BASE[t.index] + t.clearanceHeightCm));
const MAX_WIDTH = Math.max(...BOOKSHELF.tiers.map((t) => t.usableWidthCm));

// 給一層架跟排列順序（已排除正在拖曳中的那個），算出每個item由左到右累加排隊後的中心x
// （tier本身以x=0置中，範圍是[-usableWidthCm/2, +usableWidthCm/2]），跟TopDownFootprint.tsx
// 的累加邏輯同一個精神，只是這裡輸出世界座標x而不是px。
function tierItemPositions(tier: TierDef, itemIds: string[]): { id: string; centerX: number; widthCm: number }[] {
  let cursor = -tier.usableWidthCm / 2;
  const result: { id: string; centerX: number; widthCm: number }[] = [];
  for (const id of itemIds) {
    const item = ROOM_ITEMS_BY_ID[id];
    if (!item) continue;
    const centerX = cursor + item.realWidthCm / 2;
    result.push({ id, centerX, widthCm: item.realWidthCm });
    cursor += item.realWidthCm;
  }
  return result;
}

function computeInsertIndex(tier: TierState, dropWorldX: number, excludeItemId: string): number {
  const others = tier.placedItemIds.filter((id) => id !== excludeItemId);
  const positions = tierItemPositions(tier, others);
  let insertIndex = 0;
  for (const { centerX } of positions) {
    if (dropWorldX > centerX) insertIndex++;
    else break;
  }
  return insertIndex;
}

interface SceneCtx {
  camera: THREE.Camera;
  gl: THREE.WebGLRenderer;
}

function raycastTierPlanes(
  clientX: number,
  clientY: number,
  ctx: SceneCtx | null,
  tierPlanes: Record<number, THREE.Mesh | null>
): { tierIndex: number; point: THREE.Vector3 } | null {
  if (!ctx) return null;
  const rect = ctx.gl.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, ctx.camera);
  const planes = Object.values(tierPlanes).filter((m): m is THREE.Mesh => m !== null);
  const hits = raycaster.intersectObjects(planes, false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const tierIndex = (hit.object.userData as { tierIndex: number }).tierIndex;
  return { tierIndex, point: hit.point };
}

function SceneBridge({ onReady }: { onReady: (ctx: SceneCtx) => void }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    onReady({ camera, gl });
  }, [camera, gl, onReady]);
  return null;
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
  const texture = useTexture(item.image);
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
      <meshStandardMaterial attach="material-0" color="#ddc9b4" />
      <meshStandardMaterial attach="material-1" color="#ddc9b4" />
      <meshStandardMaterial attach="material-2" color="#ddc9b4" />
      <meshStandardMaterial attach="material-3" color="#ddc9b4" />
      <meshStandardMaterial attach="material-4" map={texture} transparent alphaTest={0.3} />
      <meshStandardMaterial attach="material-5" color="#ddc9b4" />
    </mesh>
  );
}

// 正在被拖曳中的娃娃（來源是層架上既有的項目），用一片面向鏡頭、通過拖曳起點的隱形平面
// 追蹤滑鼠/手指位置，不在拖曳中即時判斷/夾住落在哪一層，放開手才由外層做正式的落點判斷。
function DraggingDollMesh({ itemId, livePosition }: { itemId: string; livePosition: THREE.Vector3 }) {
  const item = ROOM_ITEMS_BY_ID[itemId];
  const texture = useTexture(item.image);
  return (
    <mesh position={livePosition} renderOrder={2}>
      <boxGeometry args={[item.realWidthCm, item.realHeightCm, item.realDepthCm]} />
      <meshStandardMaterial attach="material-0" color="#ddc9b4" opacity={0.9} transparent />
      <meshStandardMaterial attach="material-1" color="#ddc9b4" opacity={0.9} transparent />
      <meshStandardMaterial attach="material-2" color="#ddc9b4" opacity={0.9} transparent />
      <meshStandardMaterial attach="material-3" color="#ddc9b4" opacity={0.9} transparent />
      <meshStandardMaterial attach="material-4" map={texture} transparent alphaTest={0.3} opacity={0.9} />
      <meshStandardMaterial attach="material-5" color="#ddc9b4" opacity={0.9} transparent />
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
        userData={{ tierIndex: tier.index }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

type DragInfo = { itemId: string; origin: 'tray' | 'tier'; originTierIndex?: number };

export default function ThreeDShelfSpike() {
  const [furnitureState, setFurnitureState] = useState<BookshelfState>(() => createInitialFurnitureState(BOOKSHELF));
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState({ x: 0, y: 0 });
  const [dragLivePosition, setDragLivePosition] = useState<THREE.Vector3 | null>(null);
  const [hoverTierIndex, setHoverTierIndex] = useState<number | null>(null);
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  const sceneCtxRef = useRef<SceneCtx | null>(null);
  const tierPlanesRef = useRef<Record<number, THREE.Mesh | null>>({});
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const dragInfoRef = useRef<DragInfo | null>(null);
  useEffect(() => {
    dragInfoRef.current = dragInfo;
  }, [dragInfo]);

  const handleSceneReady = useCallback((ctx: SceneCtx) => {
    sceneCtxRef.current = ctx;
  }, []);
  const registerHitPlane = useCallback((tierIndex: number, mesh: THREE.Mesh | null) => {
    tierPlanesRef.current[tierIndex] = mesh;
  }, []);

  function startDrag(itemId: string, origin: 'tray' | 'tier', originTierIndex: number | undefined, clientX: number, clientY: number) {
    setDragInfo({ itemId, origin, originTierIndex });
    setDragScreenPos({ x: clientX, y: clientY });
    setOrbitEnabled(false);

    if (origin === 'tier' && sceneCtxRef.current) {
      // 拖曳起點：從目前這隻娃娃已經算好的貼合位置，建一片面向鏡頭、通過該位置的隱形平面。
      const tier = furnitureState.tiers.find((t) => t.index === originTierIndex)!;
      const positions = tierItemPositions(tier, tier.placedItemIds);
      const pos = positions.find((p) => p.id === itemId);
      const item = ROOM_ITEMS_BY_ID[itemId];
      const startPoint = new THREE.Vector3(
        pos?.centerX ?? 0,
        TIER_Y_BASE[originTierIndex!] + item.realHeightCm / 2,
        item.realDepthCm / 2
      );
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

      const hit = raycastTierPlanes(e.clientX, e.clientY, sceneCtxRef.current, tierPlanesRef.current);
      setHoverTierIndex(hit ? hit.tierIndex : null);

      const current = dragInfoRef.current;
      if (current?.origin === 'tier' && dragPlaneRef.current && sceneCtxRef.current) {
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
        if (current.origin === 'tier' && current.originTierIndex !== undefined) {
          setFurnitureState((prev) => removeItemFromTier(prev, current.originTierIndex!, current.itemId));
        }
      } else {
        const hit = raycastTierPlanes(e.clientX, e.clientY, sceneCtxRef.current, tierPlanesRef.current);
        if (hit) {
          setFurnitureState((prev) => {
            const tier = prev.tiers.find((t) => t.index === hit.tierIndex)!;
            const insertAt = computeInsertIndex(tier, hit.point.x, current.itemId);
            const placed = placeItemOnTier(prev, hit.tierIndex, current.itemId, insertAt);
            // 從層架A拖到層架B是「搬移」，要把A那份拿掉；只有從收藏匣拖進來才是「新增一份」
            // （呼應無限制擺放：同一隻娃娃可以出現在不同家具，但同一件家具內搬移不該變複製）。
            if (current.origin === 'tier' && current.originTierIndex !== undefined && current.originTierIndex !== hit.tierIndex) {
              return removeItemFromTier(placed, current.originTierIndex, current.itemId);
            }
            return placed;
          });
        }
      }

      setDragInfo(null);
      setDragLivePosition(null);
      setHoverTierIndex(null);
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

  const dragImage = dragInfo?.origin === 'tray' ? ROOM_ITEMS_BY_ID[dragInfo.itemId] : null;

  const hoverFitClass = useMemo(() => {
    if (!dragInfo || hoverTierIndex === null) return null;
    const tier = furnitureState.tiers.find((t) => t.index === hoverTierIndex);
    if (!tier) return null;
    return computeTierFitForCandidate(tier, ROOM_ITEMS_BY_ID, dragInfo.itemId).class;
  }, [dragInfo, hoverTierIndex, furnitureState]);

  return (
    <div className="relative">
      <div className="h-[65vh] w-full overflow-hidden rounded-3xl bg-[#2b2420]">
        <Canvas shadows camera={{ position: [70, 55, 95], fov: 42 }}>
          <SceneBridge onReady={handleSceneReady} />
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[40, 60, 40]}
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
              registerHitPlane={registerHitPlane}
            />
          ))}
          {furnitureState.tiers.map((tier) => {
            const positions = tierItemPositions(tier, tier.placedItemIds);
            return tier.placedItemIds.map((itemId, indexInTier) => {
              if (dragInfo?.origin === 'tier' && dragInfo.itemId === itemId) return null;
              const pos = positions.find((p) => p.id === itemId);
              if (!pos) return null;
              return (
                <PlacedDollMesh
                  key={itemId}
                  tier={tier}
                  yBase={TIER_Y_BASE[tier.index]}
                  itemId={itemId}
                  centerX={pos.centerX}
                  indexInTier={indexInTier}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startDrag(itemId, 'tier', tier.index, e.nativeEvent.clientX, e.nativeEvent.clientY);
                  }}
                />
              );
            });
          })}
          {dragInfo?.origin === 'tier' && dragLivePosition && (
            <DraggingDollMesh itemId={dragInfo.itemId} livePosition={dragLivePosition} />
          )}
          <mesh position={[0, -0.5, MAX_WIDTH]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[300, 300]} />
            <meshStandardMaterial color="#3a322c" />
          </mesh>
          <OrbitControls
            enabled={orbitEnabled}
            target={[0, TOTAL_HEIGHT / 2, 10]}
            minDistance={30}
            maxDistance={200}
          />
        </Canvas>
      </div>

      <ItemTray
        draggingItemId={dragInfo?.itemId ?? null}
        onItemPointerDown={(itemId, e) => startDrag(itemId, 'tray', undefined, e.clientX, e.clientY)}
      />

      {hoverFitClass && (
        <p className="mt-1 text-center text-[11px] text-[#8a7362]">
          {hoverFitClass === 'force-overflow' ? '這層會塞不下，硬放會被擠壓' : hoverFitClass === 'snug-fit' ? '剛剛好' : '放得下'}
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
