'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { FurnitureState } from '@/lib/dream-room/furniture';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import { computePegFit } from '@/lib/dream-room/pegPlacement';
import { PX_PER_CM } from '@/lib/dream-room/scale';

type PegboardState = Extract<FurnitureState, { type: 'pegboard' }>;

export default function PegZoom({
  furnitureState,
  dragItemId,
  dragPlacementId,
  hoverCell,
  justPlacedId,
  onItemPointerDown,
  onBack,
}: {
  furnitureState: PegboardState;
  dragItemId: string | null;
  dragPlacementId: string | null;
  hoverCell: { col: number; row: number } | null;
  justPlacedId: string | null;
  onItemPointerDown: (itemId: string, placementId: string, e: ReactPointerEvent) => void;
  onBack: () => void;
}) {
  const { peg, placedItems } = furnitureState;
  const spacingXPx = peg.pegSpacingCmX * PX_PER_CM;
  const spacingYPx = peg.pegSpacingCmY * PX_PER_CM;
  const boardWidthPx = peg.cols * spacingXPx;
  const boardHeightPx = peg.rows * spacingYPx + peg.hangClearanceCmBelowBoard * PX_PER_CM;

  const dragCandidate = dragItemId ? ROOM_ITEMS_BY_ID[dragItemId] : null;
  const hoverFit =
    dragItemId && hoverCell
      ? computePegFit(peg, placedItems, ROOM_ITEMS_BY_ID, dragItemId, hoverCell.col, hoverCell.row, dragPlacementId ?? undefined)
      : null;

  return (
    <div className="absolute inset-0 flex flex-col items-center gap-4 overflow-y-auto p-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#5A4A42] shadow hover:bg-white"
      >
        ← 回到房間
      </button>

      <div className="flex flex-1 items-start justify-center py-2">
        <div
          data-peg-grid="true"
          data-spacing-x-px={spacingXPx}
          data-spacing-y-px={spacingYPx}
          className="relative overflow-visible rounded-lg border-2 border-[#C9A27B] bg-[#EFE3D6]"
          style={{ width: boardWidthPx, height: boardHeightPx }}
        >
          {Array.from({ length: peg.rows }).flatMap((_, row) =>
            Array.from({ length: peg.cols }).map((_, col) => (
              <div
                key={`peg-dot-${row}-${col}`}
                className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8A6B4C]"
                style={{ left: col * spacingXPx + spacingXPx / 2, top: row * spacingYPx + spacingYPx / 2 }}
              />
            ))
          )}

          {hoverCell && dragCandidate && (
            <div
              className={`pointer-events-none absolute -translate-x-1/2 rounded-md transition-all duration-150 ${
                hoverFit?.class === 'fits'
                  ? 'bg-green-400/25 shadow-[0_0_0_2px_rgba(34,197,94,0.5)]'
                  : 'bg-red-400/15 shadow-[0_0_0_2px_rgba(239,68,68,0.35)]'
              }`}
              style={{
                left: hoverCell.col * spacingXPx + spacingXPx / 2,
                top: hoverCell.row * spacingYPx + spacingYPx / 2,
                width: dragCandidate.realWidthCm * PX_PER_CM,
                height: dragCandidate.realHeightCm * PX_PER_CM,
              }}
            />
          )}

          {placedItems.map((placed) => {
            const item = ROOM_ITEMS_BY_ID[placed.itemId];
            if (!item) return null;
            const fit = computePegFit(peg, placedItems, ROOM_ITEMS_BY_ID, placed.itemId, placed.col, placed.row, placed.placementId);
            const isSquashed = fit.class === 'force-overflow';
            const isBeingDragged = placed.placementId === dragPlacementId;

            const widthPx = item.realWidthCm * PX_PER_CM;
            const heightPx = item.realHeightCm * PX_PER_CM;
            const style: CSSProperties = {
              position: 'absolute',
              left: placed.col * spacingXPx + spacingXPx / 2,
              top: placed.row * spacingYPx + spacingYPx / 2,
              width: widthPx,
              height: heightPx,
              transform: `translateX(-50%) ${isSquashed ? 'scale(0.82) rotate(-4deg)' : ''}`,
              transformOrigin: 'top',
              zIndex: isSquashed ? 5 : 1,
              opacity: isBeingDragged ? 0.35 : 1,
            };

            return (
              <div
                key={placed.placementId}
                data-item-id={placed.itemId}
                data-placement-id={placed.placementId}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onItemPointerDown(placed.itemId, placed.placementId, e);
                }}
                title="按住拖曳可以換釘子、換家具，或移回收藏匣"
                className={`touch-none transition-transform duration-500 ease-out ${
                  placed.placementId === justPlacedId ? 'dreamroom-snap' : ''
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
    </div>
  );
}
