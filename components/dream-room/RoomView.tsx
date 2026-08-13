'use client';

import type { FurnitureState } from '@/lib/dream-room/furniture';
import { ROOM_ITEMS_BY_ID } from '@/lib/dream-room/roomItems';

export default function RoomView({
  furnitureState,
  onSelectFurniture,
}: {
  furnitureState: FurnitureState;
  onSelectFurniture: () => void;
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        background: 'linear-gradient(180deg, #FBF3EC 0%, #FBF3EC 62%, #E3DAD3 62%, #E3DAD3 100%)',
      }}
    >
      <button
        type="button"
        onClick={onSelectFurniture}
        title="點一下佈置這個展示層架"
        className="flex flex-col gap-1.5 rounded-md bg-gradient-to-b from-[#C9A27B] to-[#B08A63] p-2 shadow-[0_10px_20px_rgba(90,74,66,0.25)] transition-transform hover:scale-[1.03] active:scale-95"
      >
        {furnitureState.tiers.map((tier) => (
          <div
            key={tier.index}
            className="flex h-9 items-end gap-0.5 rounded-sm border-b-4 border-[#8A6B4C] bg-[#EFE3D6]/70 px-1.5"
            style={{ width: 150 }}
          >
            {tier.placedItemIds.slice(0, 8).map((itemId) => {
              const item = ROOM_ITEMS_BY_ID[itemId];
              if (!item) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={itemId} src={item.image} alt="" className="h-7 w-4 object-contain" draggable={false} />
              );
            })}
          </div>
        ))}
      </button>
    </div>
  );
}
