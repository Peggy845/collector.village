'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { FurnitureState } from '@/lib/dream-room/furniture';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import { computeBinFit, computeItemSpan } from '@/lib/dream-room/binPlacement';
import { PX_PER_CM } from '@/lib/dream-room/scale';
import TopDownFootprint, { type FootprintItem } from '@/components/dream-room/TopDownFootprint';

type BinState = Extract<FurnitureState, { type: 'stacking-bin' }>;

export default function BinZoom({
  furnitureState,
  dragItemId,
  hoverCell,
  justPlacedId,
  onItemPointerDown,
  onBack,
}: {
  furnitureState: BinState;
  dragItemId: string | null;
  hoverCell: { col: number; row: number } | null;
  justPlacedId: string | null;
  onItemPointerDown: (itemId: string, e: ReactPointerEvent) => void;
  onBack: () => void;
}) {
  const { bin, placedItems } = furnitureState;
  const cellWidthPx = bin.cellWidthCm * PX_PER_CM;
  const cellHeightPx = bin.cellHeightCm * PX_PER_CM;

  const dragCandidate = dragItemId ? ROOM_ITEMS_BY_ID[dragItemId] : null;
  const dragSpan = dragCandidate ? computeItemSpan(bin, dragCandidate) : null;
  const hoverFit =
    dragItemId && hoverCell
      ? computeBinFit(bin, placedItems, ROOM_ITEMS_BY_ID, dragItemId, hoverCell.col, hoverCell.row, dragItemId)
      : null;

  // 堆疊箱的深度是全箱共用單一上限（跟欄列格數無關），俯視縮圖依「欄」聚合——同一欄裡
  // 不同高度疊放的東西，從正上方看下去只看得到最深的那個，所以每欄取最大深度代表這一欄。
  const columnDepthCm = new Map<number, { depthCm: number; overflow: boolean }>();
  for (const placed of placedItems) {
    const item = ROOM_ITEMS_BY_ID[placed.itemId];
    if (!item) continue;
    const existing = columnDepthCm.get(placed.col);
    if (!existing || item.realDepthCm > existing.depthCm) {
      columnDepthCm.set(placed.col, { depthCm: item.realDepthCm, overflow: item.realDepthCm > bin.depthCm });
    }
  }
  const footprintItems: FootprintItem[] = Array.from(columnDepthCm.entries()).map(([col, d]) => ({
    id: `col-${col}`,
    widthCm: bin.cellWidthCm,
    depthCm: d.depthCm,
    overflow: d.overflow,
    xCm: col * bin.cellWidthCm,
  }));

  return (
    <div className="absolute inset-0 flex flex-col items-center gap-4 overflow-y-auto p-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#5A4A42] shadow hover:bg-white"
      >
        ← 回到房間
      </button>

      <div className="flex flex-1 items-center justify-center py-2">
        <div
          data-bin-grid="true"
          data-cell-width-px={cellWidthPx}
          data-cell-height-px={cellHeightPx}
          className="relative overflow-visible rounded-lg border-2 border-[#8FB4C9]"
          style={{
            width: bin.cols * cellWidthPx,
            height: bin.rows * cellHeightPx,
            background:
              'repeating-linear-gradient(0deg, rgba(143,180,201,0.15) 0, rgba(143,180,201,0.15) 1px, transparent 1px, transparent ' +
              cellHeightPx +
              'px), repeating-linear-gradient(90deg, rgba(143,180,201,0.15) 0, rgba(143,180,201,0.15) 1px, transparent 1px, transparent ' +
              cellWidthPx +
              'px), rgba(220,238,245,0.45)',
          }}
        >
          {hoverCell && dragSpan && (
            <div
              className={`pointer-events-none absolute rounded-md transition-all duration-150 ${
                hoverFit?.class === 'fits'
                  ? 'bg-green-400/25 shadow-[0_0_0_2px_rgba(34,197,94,0.5)]'
                  : 'bg-red-400/15 shadow-[0_0_0_2px_rgba(239,68,68,0.35)]'
              }`}
              style={{
                left: hoverCell.col * cellWidthPx,
                top: hoverCell.row * cellHeightPx,
                width: dragSpan.colSpan * cellWidthPx,
                height: dragSpan.rowSpan * cellHeightPx,
              }}
            />
          )}

          {placedItems.map((placed) => {
            const item = ROOM_ITEMS_BY_ID[placed.itemId];
            if (!item) return null;
            const fit = computeBinFit(bin, placedItems, ROOM_ITEMS_BY_ID, placed.itemId, placed.col, placed.row, placed.itemId);
            const isSquashed = fit.class === 'force-overflow';
            const isBeingDragged = placed.itemId === dragItemId;

            const widthPx = item.realWidthCm * PX_PER_CM;
            const heightPx = item.realHeightCm * PX_PER_CM;
            const style: CSSProperties = {
              position: 'absolute',
              left: placed.col * cellWidthPx,
              top: placed.row * cellHeightPx,
              width: widthPx,
              height: heightPx,
              transform: isSquashed ? 'scale(0.82) rotate(-3deg)' : undefined,
              zIndex: isSquashed ? 5 : 1,
              opacity: isBeingDragged ? 0.35 : 1,
            };

            return (
              <div
                key={placed.itemId}
                data-item-id={placed.itemId}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onItemPointerDown(placed.itemId, e);
                }}
                title="按住拖曳可以換位置、換家具，或移回收藏匣"
                className={`touch-none transition-transform duration-500 ease-out ${
                  placed.itemId === justPlacedId ? 'dreamroom-snap' : ''
                } ${isSquashed ? 'drop-shadow-[0_2px_6px_rgba(90,74,66,0.5)]' : 'drop-shadow-[0_2px_4px_rgba(90,74,66,0.3)]'}`}
                style={style}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="" className="h-full w-full object-contain" draggable={false} />
              </div>
            );
          })}
        </div>
      </div>

      <TopDownFootprint boundaryWidthCm={bin.cols * bin.cellWidthCm} boundaryDepthCm={bin.depthCm} items={footprintItems} />
    </div>
  );
}
