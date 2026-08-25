'use client';

import { useEffect, useMemo, useState } from 'react';
import { ROOM_ITEMS, type RoomItem } from './roomItems';
import { loadCustomItems } from './customItems';

// 種子娃娃（寫死8隻）+ 玩家自己新增的收藏（localStorage）合併後的清單，給收藏匣/3D場景/
// 洞洞板共用。custom items要等client mount後才讀得到localStorage，SSR/首次渲染先只有種子，
// 掛載後補上——這個閃一下的行為可接受，不是核心互動路徑。
function useAllRoomItems(): RoomItem[] {
  const [customItems, setCustomItems] = useState<RoomItem[]>([]);

  useEffect(() => {
    // 故意用effect（不是lazy useState initializer）：SSR時window不存在只能回傳種子清單，
    // 若initializer在client初次render就讀localStorage，會跟SSR輸出的DOM對不上、觸發hydration mismatch。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomItems(loadCustomItems());
  }, []);

  return useMemo(() => (customItems.length === 0 ? ROOM_ITEMS : [...ROOM_ITEMS, ...customItems]), [customItems]);
}

export function useRoomItems(): RoomItem[] {
  return useAllRoomItems();
}

export function useRoomItemsById(): Record<string, RoomItem> {
  const items = useAllRoomItems();
  return useMemo(() => Object.fromEntries(items.map((item) => [item.id, item])), [items]);
}
