'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PEGBOARD, createInitialFurnitureState, type FurnitureState } from '@/lib/dream-room/furniture';
import { placeItemOnPeg, removeItemFromPeg } from '@/lib/dream-room/pegPlacement';
import { useRoomItemsById } from '@/lib/dream-room/useRoomItems';
import PegZoom from '@/components/dream-room/PegZoom';
import ItemTray from '@/components/dream-room/ItemTray';

type PegboardState = Extract<FurnitureState, { type: 'pegboard' }>;
type DragOrigin = { type: 'tray' } | { type: 'peg' };

// 洞洞板還沒做3D版，先留著舊版CSS操作介面（見 components/dream-room/RoomScene3D.tsx開頭
// 註解）。從RoomDecorator.tsx抽出來的精簡版：只管洞洞板這一件家具，不用「先選家具再zoom
// 進去」那層（本來就只有這一件，room overview那層在這裡沒有意義），拖曳邏輯是
// RoomDecorator.tsx原本peg分支的子集。
export default function PegboardDecoratorLegacy() {
  const router = useRouter();
  const itemsById = useRoomItemsById();
  const [pegState, setPegState] = useState<PegboardState>(() => createInitialFurnitureState(PEGBOARD));
  const [justPlacedPlacementId, setJustPlacedPlacementId] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ itemId: string; placementId: string; origin: DragOrigin } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number; hoverPegCell: { col: number; row: number } | null }>({
    x: 0,
    y: 0,
    hoverPegCell: null,
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

  function pegCellFromPoint(pegEl: HTMLElement, clientX: number, clientY: number): { col: number; row: number } {
    const r = pegEl.getBoundingClientRect();
    const spacingXPx = Number(pegEl.dataset.spacingXPx);
    const spacingYPx = Number(pegEl.dataset.spacingYPx);
    return {
      col: Math.round((clientX - r.left - spacingXPx / 2) / spacingXPx),
      row: Math.round((clientY - r.top - spacingYPx / 2) / spacingYPx),
    };
  }

  useEffect(() => {
    if (!dragInfo) return;

    function handleMove(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const pegEl = el?.closest<HTMLElement>('[data-peg-grid]');
      const hoverPegCell = pegEl ? pegCellFromPoint(pegEl, e.clientX, e.clientY) : null;
      setDragPos({ x: e.clientX, y: e.clientY, hoverPegCell });
    }

    function handleUp(e: PointerEvent) {
      const current = dragInfoRef.current;
      if (!current) return;

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const pegEl = el?.closest<HTMLElement>('[data-peg-grid]');
      const trayEl = el?.closest('[data-tray-zone]');

      if (pegEl) {
        const { col, row } = pegCellFromPoint(pegEl, e.clientX, e.clientY);
        // 同一板子內換釘子由placeItemOnPeg自己依placementId去重處理，不用額外移除步驟。
        setPegState((prev) => placeItemOnPeg(prev, current.placementId, current.itemId, col, row));
        setJustPlacedPlacementId(current.placementId);
        if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
        snapTimeoutRef.current = setTimeout(() => setJustPlacedPlacementId(null), 350);
      } else if (trayEl && current.origin.type === 'peg') {
        setPegState((prev) => removeItemFromPeg(prev, current.placementId));
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

  function handleDragStart(itemId: string, placementId: string, origin: DragOrigin, clientX: number, clientY: number) {
    setDragInfo({ itemId, placementId, origin });
    setDragPos({ x: clientX, y: clientY, hoverPegCell: null });
  }

  const dragImage = dragInfo ? itemsById[dragInfo.itemId] : null;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="overflow-hidden rounded-3xl bg-[#C9A27B] shadow-[0_10px_30px_rgba(90,74,66,0.15)]">
        <div className="relative h-[420px] bg-[#FBF3EC]">
          <PegZoom
            furnitureState={pegState}
            itemsById={itemsById}
            dragItemId={dragInfo?.itemId ?? null}
            dragPlacementId={dragInfo?.placementId ?? null}
            hoverCell={dragInfo ? dragPos.hoverPegCell : null}
            justPlacedId={justPlacedPlacementId}
            onItemPointerDown={(itemId, placementId, e) => handleDragStart(itemId, placementId, { type: 'peg' }, e.clientX, e.clientY)}
            onBack={() => router.push('/dream-room/room')}
          />
        </div>

        <ItemTray
          draggingItemId={dragInfo?.itemId ?? null}
          onItemPointerDown={(itemId, e) => handleDragStart(itemId, crypto.randomUUID(), { type: 'tray' }, e.clientX, e.clientY)}
        />
      </div>

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
