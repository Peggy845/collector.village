'use client';

import type { FurnitureState } from '@/lib/dream-room/furniture';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';

function BookshelfThumb({ state }: { state: Extract<FurnitureState, { type: 'bookshelf' }> }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-gradient-to-b from-[#C9A27B] to-[#B08A63] p-2 shadow-[0_10px_20px_rgba(90,74,66,0.25)]">
      {state.tiers.map((tier) => (
        <div
          key={tier.index}
          className="flex h-9 items-end gap-0.5 rounded-sm border-b-4 border-[#8A6B4C] bg-[#EFE3D6]/70 px-1.5"
          style={{ width: 130 }}
        >
          {tier.placedItems.slice(0, 8).map((placed) => {
            const item = ROOM_ITEMS_BY_ID[placed.itemId];
            if (!item) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={placed.placementId} src={item.image} alt="" className="h-7 w-4 object-contain" draggable={false} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BinThumb({ state }: { state: Extract<FurnitureState, { type: 'stacking-bin' }> }) {
  return (
    <div className="flex h-[92px] w-[110px] flex-wrap content-start gap-1 rounded-md border-2 border-[#8FB4C9] bg-[#DCEEF5]/60 p-1.5 shadow-[0_10px_20px_rgba(90,74,66,0.2)]">
      {state.placedItems.slice(0, 8).map((placed) => {
        const item = ROOM_ITEMS_BY_ID[placed.itemId];
        if (!item) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={placed.placementId} src={item.image} alt="" className="h-6 w-6 object-contain" draggable={false} />
        );
      })}
    </div>
  );
}

function PegboardThumb({ state }: { state: Extract<FurnitureState, { type: 'pegboard' }> }) {
  return (
    <div className="flex h-[92px] w-[120px] flex-wrap content-start gap-1.5 rounded-md border-2 border-[#C9A27B] bg-[#EFE3D6]/70 p-2 shadow-[0_10px_20px_rgba(90,74,66,0.2)]">
      {state.placedItems.slice(0, 8).map((placed) => {
        const item = ROOM_ITEMS_BY_ID[placed.itemId];
        if (!item) return null;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={placed.placementId} src={item.image} alt="" className="h-6 w-6 object-contain" draggable={false} />
        );
      })}
    </div>
  );
}

export default function RoomView({
  furnitureStates,
  onSelectFurniture,
}: {
  furnitureStates: FurnitureState[];
  onSelectFurniture: (furnitureId: string) => void;
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center gap-8"
      style={{
        background: 'linear-gradient(180deg, #FBF3EC 0%, #FBF3EC 62%, #E3DAD3 62%, #E3DAD3 100%)',
      }}
    >
      {furnitureStates.map((state) => (
        <button
          key={state.id}
          type="button"
          onClick={() => onSelectFurniture(state.id)}
          title="點一下佈置這個家具"
          className="transition-transform hover:scale-[1.03] active:scale-95"
        >
          {state.type === 'bookshelf' ? (
            <BookshelfThumb state={state} />
          ) : state.type === 'stacking-bin' ? (
            <BinThumb state={state} />
          ) : (
            <PegboardThumb state={state} />
          )}
        </button>
      ))}
    </div>
  );
}
