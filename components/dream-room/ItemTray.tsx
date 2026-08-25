'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import Link from 'next/link';
import { useRoomItems } from '@/lib/dream-room/useRoomItems';

export default function ItemTray({
  draggingItemId,
  onItemPointerDown,
}: {
  draggingItemId: string | null;
  onItemPointerDown: (itemId: string, e: ReactPointerEvent) => void;
}) {
  const items = useRoomItems();
  return (
    <div data-tray-zone="true" className="border-t border-[#E3DAD3] bg-white/60 px-4 py-3">
      <p className="mb-2 text-center text-xs text-[#8A7A70]">
        按住娃娃拖到家具上放上去，同一隻可以放進不同家具比較看看，拖回這裡可以從這個家具移除
        ・
        <Link href="/dream-room/add-item" className="underline hover:text-[#5A4A42]">
          新增我自己的收藏
        </Link>
      </p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {items.map((item) => (
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
    </div>
  );
}
