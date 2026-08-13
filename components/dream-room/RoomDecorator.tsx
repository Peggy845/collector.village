'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ROOM_FURNITURE,
  createInitialFurnitureState,
  type FurnitureState,
} from '@/lib/dream-room/furniture';
import { allPlacedItemIds, placeItemOnTier, removeItemFromTier } from '@/lib/dream-room/placement';
import { allBinPlacedItemIds, placeItemInBin, removeItemFromBin } from '@/lib/dream-room/binPlacement';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import RoomView from '@/components/dream-room/RoomView';
import FurnitureZoom from '@/components/dream-room/FurnitureZoom';
import BinZoom from '@/components/dream-room/BinZoom';
import ItemTray from '@/components/dream-room/ItemTray';

type BookshelfState = Extract<FurnitureState, { type: 'bookshelf' }>;
type BinState = Extract<FurnitureState, { type: 'stacking-bin' }>;

type ZoomState = { level: 'room' } | { level: 'furniture'; furnitureId: string };
type DragOrigin = { type: 'tray' } | { type: 'tier'; tierIndex: number } | { type: 'bin' };

function initialFurnitureStates(): Record<string, FurnitureState> {
  return Object.fromEntries(ROOM_FURNITURE.map((def) => [def.id, createInitialFurnitureState(def)]));
}

// 放置/移動/移除統一成同一個手勢：從收藏匣或家具上「按住拖曳」，放開時偵測手指/滑鼠底下是
// 哪個區域（層架用data-tier-index、堆疊箱用data-bin-grid、收藏匣用data-tray-zone，配合
// elementFromPoint判斷）。房間裡同時可以有好幾件家具，但同一時間只會zoom進去看一件，
// 所以拖曳的來源／目標永遠是同一件家具，不用處理跨家具搬移的情境。
export default function RoomDecorator() {
  const [zoom, setZoom] = useState<ZoomState>({ level: 'room' });
  const [furnitureStates, setFurnitureStates] = useState<Record<string, FurnitureState>>(initialFurnitureStates);
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ itemId: string; origin: DragOrigin } | null>(null);
  const [dragPos, setDragPos] = useState<{
    x: number;
    y: number;
    hoverTierIndex: number | null;
    hoverBinCell: { col: number; row: number } | null;
  }>({ x: 0, y: 0, hoverTierIndex: null, hoverBinCell: null });

  const dragInfoRef = useRef(dragInfo);
  const zoomRef = useRef(zoom);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dragInfoRef.current = dragInfo;
  }, [dragInfo]);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    return () => {
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    };
  }, []);

  // 只在「有拖曳正在進行」時才訂閱window事件，dragInfo只在拖曳開始/結束時變動兩次，
  // 過程中頻繁更新的座標另外用dragPos裝，避免每個pointermove都重新掛一次監聽器。
  useEffect(() => {
    if (!dragInfo) return;

    function handleMove(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const tierEl = el?.closest<HTMLElement>('[data-tier-index]');
      const binEl = el?.closest<HTMLElement>('[data-bin-grid]');
      const hoverTierIndex = tierEl ? Number(tierEl.dataset.tierIndex) : null;
      let hoverBinCell: { col: number; row: number } | null = null;
      if (binEl) {
        const r = binEl.getBoundingClientRect();
        const cellWidthPx = Number(binEl.dataset.cellWidthPx);
        const cellHeightPx = Number(binEl.dataset.cellHeightPx);
        hoverBinCell = {
          col: Math.floor((e.clientX - r.left) / cellWidthPx),
          row: Math.floor((e.clientY - r.top) / cellHeightPx),
        };
      }
      setDragPos({ x: e.clientX, y: e.clientY, hoverTierIndex, hoverBinCell });
    }

    function handleUp(e: PointerEvent) {
      const current = dragInfoRef.current;
      if (!current) return;
      const currentZoom = zoomRef.current;
      if (currentZoom.level !== 'furniture') {
        setDragInfo(null);
        return;
      }
      const furnitureId = currentZoom.furnitureId;

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const tierEl = el?.closest<HTMLElement>('[data-tier-index]');
      const binEl = el?.closest<HTMLElement>('[data-bin-grid]');
      const trayEl = el?.closest('[data-tray-zone]');

      if (tierEl) {
        const targetTierIndex = Number(tierEl.dataset.tierIndex);
        // 放開手的水平位置決定插入在哪個順位（跟已放置項目的中點比較），讓同一層架內也能
        // 拖到左邊/右邊換位置，不會永遠固定append到最右邊。
        const itemEls = Array.from(tierEl.querySelectorAll<HTMLElement>('[data-item-id]')).filter(
          (itemEl) => itemEl.dataset.itemId !== current.itemId
        );
        let insertIndex = 0;
        for (const itemEl of itemEls) {
          const r = itemEl.getBoundingClientRect();
          if (e.clientX > r.left + r.width / 2) insertIndex++;
          else break;
        }

        setFurnitureStates((prev) => {
          const bookshelf = prev[furnitureId] as BookshelfState;
          const next = placeItemOnTier(bookshelf, targetTierIndex, current.itemId, insertIndex);
          return { ...prev, [furnitureId]: next };
        });
        triggerSnap(current.itemId);
      } else if (binEl) {
        const r = binEl.getBoundingClientRect();
        const cellWidthPx = Number(binEl.dataset.cellWidthPx);
        const cellHeightPx = Number(binEl.dataset.cellHeightPx);
        const col = Math.floor((e.clientX - r.left) / cellWidthPx);
        const row = Math.floor((e.clientY - r.top) / cellHeightPx);

        setFurnitureStates((prev) => {
          const bin = prev[furnitureId] as BinState;
          const next = placeItemInBin(bin, current.itemId, col, row);
          return { ...prev, [furnitureId]: next };
        });
        triggerSnap(current.itemId);
      } else if (trayEl) {
        if (current.origin.type === 'tier') {
          const tierIndex = current.origin.tierIndex;
          setFurnitureStates((prev) => {
            const bookshelf = prev[furnitureId] as BookshelfState;
            return { ...prev, [furnitureId]: removeItemFromTier(bookshelf, tierIndex, current.itemId) };
          });
        } else if (current.origin.type === 'bin') {
          setFurnitureStates((prev) => {
            const bin = prev[furnitureId] as BinState;
            return { ...prev, [furnitureId]: removeItemFromBin(bin, current.itemId) };
          });
        }
      }

      setDragInfo(null);
    }

    function triggerSnap(itemId: string) {
      setJustPlacedId(itemId);
      if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = setTimeout(() => setJustPlacedId(null), 350);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragInfo]);

  function handleDragStart(itemId: string, origin: DragOrigin, clientX: number, clientY: number) {
    setDragInfo({ itemId, origin });
    setDragPos({ x: clientX, y: clientY, hoverTierIndex: null, hoverBinCell: null });
  }

  function handleBack() {
    setZoom({ level: 'room' });
    setDragInfo(null);
  }

  const isFurnitureZoomed = zoom.level === 'furniture';
  const zoomedFurniture = isFurnitureZoomed ? furnitureStates[zoom.furnitureId] : null;
  const dragImage = dragInfo ? ROOM_ITEMS_BY_ID[dragInfo.itemId] : null;

  const placedIds = new Set<string>();
  for (const state of Object.values(furnitureStates)) {
    const ids = state.type === 'bookshelf' ? allPlacedItemIds(state) : allBinPlacedItemIds(state);
    for (const id of ids) placedIds.add(id);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-3xl bg-[#C9A27B] shadow-[0_10px_30px_rgba(90,74,66,0.15)]">
        <div className="relative h-[420px]">
          <div
            className={`absolute inset-0 transition-all duration-400 ease-out ${
              isFurnitureZoomed ? 'pointer-events-none scale-110 opacity-0' : 'scale-100 opacity-100'
            }`}
          >
            <RoomView
              furnitureStates={Object.values(furnitureStates)}
              onSelectFurniture={(furnitureId) => setZoom({ level: 'furniture', furnitureId })}
            />
          </div>
          <div
            className={`absolute inset-0 bg-[#FBF3EC] transition-all duration-400 ease-out ${
              isFurnitureZoomed ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
            }`}
          >
            {zoomedFurniture?.type === 'bookshelf' && (
              <FurnitureZoom
                furnitureState={zoomedFurniture}
                dragItemId={dragInfo?.itemId ?? null}
                hoverTierIndex={dragInfo ? dragPos.hoverTierIndex : null}
                justPlacedId={justPlacedId}
                onItemPointerDown={(itemId, tierIndex, e) =>
                  handleDragStart(itemId, { type: 'tier', tierIndex }, e.clientX, e.clientY)
                }
                onBack={handleBack}
              />
            )}
            {zoomedFurniture?.type === 'stacking-bin' && (
              <BinZoom
                furnitureState={zoomedFurniture}
                dragItemId={dragInfo?.itemId ?? null}
                hoverCell={dragInfo ? dragPos.hoverBinCell : null}
                justPlacedId={justPlacedId}
                onItemPointerDown={(itemId, e) => handleDragStart(itemId, { type: 'bin' }, e.clientX, e.clientY)}
                onBack={handleBack}
              />
            )}
          </div>
        </div>

        {isFurnitureZoomed && (
          <ItemTray
            draggingItemId={dragInfo?.itemId ?? null}
            placedIds={placedIds}
            onItemPointerDown={(itemId, e) => handleDragStart(itemId, { type: 'tray' }, e.clientX, e.clientY)}
          />
        )}
      </div>

      {!isFurnitureZoomed && (
        <p className="mt-3 text-center text-xs leading-[1.7] text-[#8A7A70]">
          點一件家具，按住收藏匣裡的娃娃拖上去看看擺不擺得下
        </p>
      )}

      {dragImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dragImage.image}
          alt=""
          draggable={false}
          className="pointer-events-none fixed z-[100] h-16 w-16 -translate-x-1/2 -translate-y-1/2 object-contain opacity-90 drop-shadow-[0_4px_10px_rgba(90,74,66,0.5)]"
          style={{ left: dragPos.x, top: dragPos.y }}
        />
      )}
    </div>
  );
}
