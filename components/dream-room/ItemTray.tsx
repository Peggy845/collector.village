'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { ROOM_ITEMS } from '@/lib/dream-room/roomItems';

export default function ItemTray({
  draggingItemId,
  placedIds,
  onItemPointerDown,
}: {
  draggingItemId: string | null;
  placedIds: Set<string>;
  onItemPointerDown: (itemId: string, e: ReactPointerEvent) => void;
}) {
  const available = ROOM_ITEMS.filter((item) => !placedIds.has(item.id));

  return (
    <div data-tray-zone="true" className="border-t border-[#E3DAD3] bg-white/60 px-4 py-3">
      <p className="mb-2 text-center text-xs text-[#8A7A70]">按住娃娃拖到家具上放上去，拖回這裡可以移除</p>
      {available.length === 0 ? (
        <p className="py-3 text-center text-xs text-[#B58A96]">收藏匣空了，都放上去了</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-2.5">
          {available.map((item) => (
            <div
              key={item.id}
              onPointerDown={(e) => {
                e.preventDefault();
                onItemPointerDown(item.id, e);
              }}
              className="flex h-14 w-14 touch-none items-center justify-center rounded-xl border-2 border-transparent bg-white p-1 shadow transition-opacity"
              style={{ opacity: item.id === draggingItemId ? 0.35 : 1 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt="" className="h-full w-full object-contain" draggable={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
