'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { FurnitureState } from '@/lib/dream-room/furniture';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';
import { computeFitForPlacedItem, computeTierFitForCandidate, type FitClass } from '@/lib/dream-room/placement';
import { PX_PER_CM } from '@/lib/dream-room/scale';

type BookshelfState = Extract<FurnitureState, { type: 'bookshelf' }>;

function tierGlowClass(fitClass: FitClass | null): string {
  if (fitClass === 'fits-with-room') {
    return 'shadow-[0_0_0_3px_rgba(34,197,94,0.4),0_0_18px_rgba(34,197,94,0.3)]';
  }
  if (fitClass === 'snug-fit') {
    return 'shadow-[0_0_0_3px_rgba(217,119,6,0.45),0_0_18px_rgba(217,119,6,0.3)]';
  }
  return '';
}

export default function FurnitureZoom({
  furnitureState,
  dragItemId,
  hoverTierIndex,
  justPlacedId,
  onItemPointerDown,
  onBack,
}: {
  furnitureState: BookshelfState;
  dragItemId: string | null;
  hoverTierIndex: number | null;
  justPlacedId: string | null;
  onItemPointerDown: (itemId: string, tierIndex: number, e: ReactPointerEvent) => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute inset-0 flex flex-col gap-4 overflow-y-auto p-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-[#5A4A42] shadow hover:bg-white"
      >
        ← 回到房間
      </button>

      <div className="flex flex-1 flex-col justify-center gap-5 py-2">
        {furnitureState.tiers.map((tier) => {
          const isHoverTarget = dragItemId !== null && hoverTierIndex === tier.index;
          const candidateFit = isHoverTarget ? computeTierFitForCandidate(tier, ROOM_ITEMS_BY_ID, dragItemId!) : null;
          const trackWidthPx = tier.usableWidthCm * PX_PER_CM;

          return (
            <div key={tier.index} className="flex justify-center">
              <div
                data-tier-index={tier.index}
                className={`relative flex items-end gap-1 overflow-visible rounded-lg border-2 border-[#B08A63] bg-[#EFE3D6] px-2 transition-all duration-200 ${
                  isHoverTarget ? 'scale-[1.03]' : ''
                } ${tierGlowClass(candidateFit?.class ?? null)}`}
                style={{ width: trackWidthPx, height: tier.clearanceHeightCm * PX_PER_CM }}
              >
                {tier.placedItemIds.map((itemId, indexInTier) => {
                  const item = ROOM_ITEMS_BY_ID[itemId];
                  if (!item) return null;
                  const fit = computeFitForPlacedItem(tier, ROOM_ITEMS_BY_ID, indexInTier);
                  const isSquashed = fit.class === 'force-overflow';
                  const isBeingDragged = itemId === dragItemId;

                  const scaleX = fit.widthStatus === 'overflow' ? 1 - fit.widthSquash : 1 + fit.heightSquash * 0.4;
                  const scaleY = fit.heightStatus === 'overflow' ? 1 - fit.heightSquash : 1 + fit.widthSquash * 0.4;
                  const style: CSSProperties = {
                    width: item.realWidthCm * PX_PER_CM,
                    height: item.realHeightCm * PX_PER_CM,
                    transform: isSquashed ? `scaleX(${scaleX}) scaleY(${scaleY})` : undefined,
                    zIndex: isSquashed ? 5 : 1,
                    transformOrigin: 'bottom',
                    opacity: isBeingDragged ? 0.35 : 1,
                  };

                  return (
                    <div
                      key={itemId}
                      data-item-id={itemId}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        onItemPointerDown(itemId, tier.index, e);
                      }}
                      title="按住拖曳可以換位置、換層架，或移回收藏匣"
                      className={`relative shrink-0 touch-none transition-transform duration-500 ease-out ${
                        itemId === justPlacedId ? 'dreamroom-snap' : ''
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
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes dreamroom-snap {
          0% {
            transform: scale(1.2);
          }
          55% {
            transform: scale(0.92);
          }
          100% {
            transform: scale(1);
          }
        }
        .dreamroom-snap {
          animation: dreamroom-snap 350ms ease-out;
        }
      `}</style>
    </div>
  );
}
