'use client';

import { useEffect, useRef, useState } from 'react';
import { BOOKSHELF, createInitialFurnitureState, type FurnitureState } from '@/lib/dream-room/furniture';
import { allPlacedItemIds, placeItemOnTier, removeItemFromTier } from '@/lib/dream-room/placement';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import RoomView from '@/components/dream-room/RoomView';
import FurnitureZoom from '@/components/dream-room/FurnitureZoom';
import ItemTray from '@/components/dream-room/ItemTray';

type ZoomState = { level: 'room' } | { level: 'furniture'; furnitureId: string };
export type DragOrigin = { type: 'tray' } | { type: 'tier'; tierIndex: number };

// 放置/移動/移除統一成同一個手勢：從收藏匣或層架上「按住拖曳」，放開時偵測手指/滑鼠底下是
// 哪一格（用 data-tier-index / data-tray-zone 屬性 + elementFromPoint 判斷，不用板機式的
// 精準格子——層架本身是一整條寬鬆的目標區，跟收納冊那種小格子精準點選的情境不同，見使用者
// 回報：「這裡的目標很寬，拖曳體感應該更好玩」）。
export default function RoomDecorator() {
  const [zoom, setZoom] = useState<ZoomState>({ level: 'room' });
  const [furnitureState, setFurnitureState] = useState<FurnitureState>(() => createInitialFurnitureState(BOOKSHELF));
  const [justPlacedId, setJustPlacedId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ itemId: string; origin: DragOrigin } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number; hoverTierIndex: number | null }>({
    x: 0,
    y: 0,
    hoverTierIndex: null,
  });
  const dragInfoRef = useRef(dragInfo);
  const snapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    dragInfoRef.current = dragInfo;
  }, [dragInfo]);

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
      const hoverTierIndex = tierEl ? Number(tierEl.dataset.tierIndex) : null;
      setDragPos({ x: e.clientX, y: e.clientY, hoverTierIndex });
    }

    function handleUp(e: PointerEvent) {
      const current = dragInfoRef.current;
      if (!current) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const tierEl = el?.closest<HTMLElement>('[data-tier-index]');
      const trayEl = el?.closest('[data-tray-zone]');

      const originTierIndex = current.origin.type === 'tier' ? current.origin.tierIndex : null;

      if (tierEl) {
        const targetTierIndex = Number(tierEl.dataset.tierIndex);
        // 放開手的水平位置決定插入在哪個順位（跟已放置項目的中點比較），讓同一層架內也能
        // 拖到左邊/右邊換位置，不會永遠固定append到最右邊（見使用者回報）。
        const itemEls = Array.from(tierEl.querySelectorAll<HTMLElement>('[data-item-id]')).filter(
          (itemEl) => itemEl.dataset.itemId !== current.itemId
        );
        let insertIndex = 0;
        for (const itemEl of itemEls) {
          const r = itemEl.getBoundingClientRect();
          if (e.clientX > r.left + r.width / 2) insertIndex++;
          else break;
        }

        setFurnitureState((prev) => {
          const next =
            originTierIndex !== null && originTierIndex !== targetTierIndex
              ? removeItemFromTier(prev, originTierIndex, current.itemId)
              : prev;
          return placeItemOnTier(next, targetTierIndex, current.itemId, insertIndex);
        });
        setJustPlacedId(current.itemId);
        if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = setTimeout(() => setJustPlacedId(null), 350);
      } else if (trayEl && originTierIndex !== null) {
        setFurnitureState((prev) => removeItemFromTier(prev, originTierIndex, current.itemId));
      }

      setDragInfo(null);
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
    setDragPos({ x: clientX, y: clientY, hoverTierIndex: null });
  }

  function handleBack() {
    setZoom({ level: 'room' });
    setDragInfo(null);
  }

  const isFurnitureZoomed = zoom.level === 'furniture';
  const dragImage = dragInfo ? ROOM_ITEMS_BY_ID[dragInfo.itemId] : null;

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
              furnitureState={furnitureState}
              onSelectFurniture={() => setZoom({ level: 'furniture', furnitureId: furnitureState.id })}
            />
          </div>
          <div
            className={`absolute inset-0 bg-[#FBF3EC] transition-all duration-400 ease-out ${
              isFurnitureZoomed ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
            }`}
          >
            <FurnitureZoom
              furnitureState={furnitureState}
              dragItemId={dragInfo?.itemId ?? null}
              hoverTierIndex={dragInfo ? dragPos.hoverTierIndex : null}
              justPlacedId={justPlacedId}
              onItemPointerDown={(itemId, tierIndex, e) => handleDragStart(itemId, { type: 'tier', tierIndex }, e.clientX, e.clientY)}
              onBack={handleBack}
            />
          </div>
        </div>

        {isFurnitureZoomed && (
          <ItemTray
            draggingItemId={dragInfo?.itemId ?? null}
            placedIds={allPlacedItemIds(furnitureState)}
            onItemPointerDown={(itemId, e) => handleDragStart(itemId, { type: 'tray' }, e.clientX, e.clientY)}
          />
        )}
      </div>

      {!isFurnitureZoomed && (
        <p className="mt-3 text-center text-xs leading-[1.7] text-[#8A7A70]">
          點展示層架，按住收藏匣裡的娃娃拖上去看看擺不擺得下
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
